import type { EventMessage, GameEvent, TableSnapshot } from '../../protocol.js';
import { ROOM_NAME, SUSPECT_NAME, WEAPON_NAME } from '../../rules/constants.js';
import type { SeatId } from '../../rules/types.js';
import type { ManorAudio } from '../audio.js';
import { cardName } from '../cards.js';
import { FxClock } from '../fx/animate.js';
import { scheduleBanner, type BannerSpec } from '../fx/banner.js';
import { askCues, pendingCues, phase, stepTimes, type EventSchedule } from '../fx/timeline.js';
import { eventLine, type Names } from '../narrate.js';
import type { NoteRow } from '../notes.js';
import { publicBase } from '../route.js';
import { endLine, type ViewModel } from '../view-model.js';
import { BoardView } from './board.js';
import { h, setText } from './dom.js';
import { Hud } from './hud.js';
import { Overlay } from './overlay.js';
import { Panel, type PanelIntents } from './panel.js';
import { SetupPanel, type SetupIntents } from './setup.js';

export interface TableIntents extends PanelIntents, SetupIntents {
  newGame(): void;
  claimAbandoned(): void;
  leave(): void;
  toggleMute(): void;
}

export interface TableDeps {
  audio: ManorAudio;
  reducedMotion(): boolean;
  shareLink: string;
  copy(text: string): Promise<boolean>;
}

/** The end screen waits this long after the final reveal so the stamp lands first. */
const END_DELAY_MS = 400;

/**
 * The table screen: the HUD and turn line on top, the mansion board as the play surface, and the
 * control panel (or the suspect line-up, before the case) beneath it. Banners, toasts, the live
 * region, and the end screen layer above everything.
 */
export class TableView {
  readonly root: HTMLElement;
  readonly hud: Hud;
  readonly overlay: Overlay;
  readonly board: BoardView;
  readonly panel: Panel;
  readonly setup: SetupPanel;
  private readonly notice: HTMLElement;
  private readonly noticeTitle: HTMLElement;
  private readonly noticeBody: HTMLElement;
  private readonly joining: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly theater: HTMLElement;
  private prev: ViewModel | null = null;
  private prevSnapshot: TableSnapshot | null = null;
  private clock: FxClock | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    host: HTMLElement,
    private readonly intents: TableIntents,
    private readonly deps: TableDeps,
  ) {
    this.hud = new Hud(intents);
    this.overlay = new Overlay(intents);
    this.board = new BoardView(intents);
    this.panel = new Panel(intents);
    this.setup = new SetupPanel(intents, { shareLink: deps.shareLink, copy: deps.copy, toast: (text) => this.overlay.toast(text) });

    this.noticeTitle = h('h2', { class: 'wd-sheet-title' });
    this.noticeBody = h('p', {});
    this.notice = h(
      'section',
      { class: 'wd-card-panel wd-notice', role: 'status' },
      h('span', { class: 'wd-emblem', 'aria-hidden': 'true' }, '?'),
      this.noticeTitle,
      this.noticeBody,
      h('div', { class: 'wd-sheet-actions' }, h('a', { class: 'wd-btn wd-btn-primary', href: publicBase() }, 'Back to your tables')),
    );
    this.joining = h(
      'section',
      { class: 'wd-card-panel wd-joining', role: 'status' },
      h('span', { class: 'wd-emblem', 'aria-hidden': 'true' }, '?'),
      h('p', {}, 'Joining the table…'),
    );

    this.theater = h(
      'div',
      { class: 'wd-theater' },
      h('div', { class: 'wd-surface' }, this.board.root, this.overlay.bannerLayer),
      this.setup.root,
      this.panel.root,
    );
    this.stage = h('main', { class: 'wd-stage', id: 'main' }, this.joining, this.notice);
    this.root = h(
      'div',
      { class: 'wd-app', 'data-screen': 'connecting' },
      this.hud.root,
      this.hud.statusBar,
      this.stage,
      this.overlay.end,
      this.overlay.toastEl,
      this.overlay.live,
    );
    host.replaceChildren(this.root);
    this.hud.setMuted(deps.audio.muted, deps.audio.available);
  }

  render(vm: ViewModel, snapshot: TableSnapshot | null, notes: NoteRow[], names: Names): void {
    const prev = this.prev;
    this.root.dataset.screen = vm.screen;
    this.root.dataset.turn = vm.screen === 'playing' ? (vm.myTurn ? 'mine' : 'theirs') : '';
    this.hud.update(vm, snapshot);

    this.joining.hidden = vm.screen !== 'connecting';
    this.notice.hidden = vm.screen !== 'notice';
    if (vm.notice) {
      setText(this.noticeTitle, vm.notice.title);
      setText(this.noticeBody, vm.notice.body);
    }
    // The board exists only for a seated detective: a member at a full or locked table sees none of it.
    const seated = vm.screen === 'setup' || vm.screen === 'playing' || vm.screen === 'finished';
    if (seated && !this.theater.isConnected) {
      this.stage.append(this.theater);
    } else if (!seated && this.theater.isConnected) {
      this.theater.remove();
    }
    this.setup.root.hidden = vm.screen !== 'setup';
    this.panel.root.hidden = vm.screen !== 'playing' && vm.screen !== 'finished';
    if (vm.screen === 'setup') {
      this.setup.update(vm.setup);
    }
    this.board.update(snapshot, vm);
    this.panel.update({ vm, snapshot, notes, names });

    this.transitions(prev, vm, snapshot);
    this.prev = vm;
    this.prevSnapshot = snapshot;
  }

  private transitions(prev: ViewModel | null, vm: ViewModel, snapshot: TableSnapshot | null): void {
    const yourMove = vm.screen === 'playing' && (vm.canRoll || vm.canMove || vm.canSuggest || vm.canRefute);
    const wasYourMove = prev?.screen === 'playing' && (prev.canRoll || prev.canMove || prev.canSuggest || prev.canRefute);
    if (yourMove && !wasYourMove) {
      if (vm.canRefute) {
        this.overlay.announce(`${vm.status}. ${vm.hint}`);
      } else if (vm.canRoll) {
        this.overlay.announce(`Your turn. ${vm.hint}`);
        this.deps.audio.play('turn');
      }
      this.root.classList.remove('wd-turn-pulse');
      void this.root.offsetWidth;
      this.root.classList.add('wd-turn-pulse');
      this.later(() => this.root.classList.remove('wd-turn-pulse'), 900);
    }
    if (vm.screen === 'finished' && snapshot) {
      if (prev?.screen === 'playing') {
        if (!this.endTimer) {
          this.endTimer = setTimeout(() => {
            this.endTimer = null;
            if (this.prev?.screen === 'finished' && this.prevSnapshot) {
              this.showEnd(this.prev, this.prevSnapshot);
            }
          }, this.deps.reducedMotion() ? 0 : END_DELAY_MS);
        }
      } else if (!this.endTimer) {
        this.showEnd(vm, snapshot);
      }
    } else {
      if (this.endTimer) {
        clearTimeout(this.endTimer);
        this.endTimer = null;
      }
      this.overlay.hideEnd();
    }
  }

  private showEnd(vm: ViewModel, snapshot: TableSnapshot): void {
    this.overlay.showEnd({
      won: Boolean(vm.won),
      reason: vm.endReason,
      line: endLine(Boolean(vm.won), vm.endReason, vm.winnerName),
      solution: vm.solution,
      canNewGame: vm.canNewGame,
      hostName: vm.setup.hostName,
      recap: snapshot.recap,
      seats: snapshot.seats,
      me: vm.me?.seatId ?? null,
    });
  }

  setMuted(muted: boolean): void {
    this.hud.setMuted(muted, this.deps.audio.available);
  }

  setTableName(name: string): void {
    this.hud.setTableName(name);
  }

  /**
   * One event, seeked `elapsed` ms in: the board moves the tokens and the camera, the dice tumble
   * in the panel, a banner names what happened, and the sounds land on the same beats for everyone.
   */
  playEvent(message: EventMessage, schedule: EventSchedule, elapsed: number, before: TableSnapshot | null, names: Names): void {
    this.stopFx();
    const event = message.event;
    const clock = new FxClock(elapsed);
    this.clock = clock;
    this.board.playEvent(message, schedule, elapsed, before);
    if (event.kind === 'rolled') {
      this.panel.playRoll(event.dice, schedule, elapsed, event.eventId);
    }
    for (const { spec, at } of this.banners(event, schedule, names)) {
      if (at + 200 >= elapsed) {
        scheduleBanner(this.overlay.bannerLayer, spec, { clock, start: at, reduced: schedule.reduced });
      }
    }
    this.later(() => this.overlay.announce(eventLine(event, names)), schedule.resolveAt - elapsed);
    this.sounds(event, schedule, elapsed, names.me);
  }

  private banners(event: GameEvent, schedule: EventSchedule, names: Names): Array<{ spec: BannerSpec; at: number }> {
    const mine = 'seatId' in event && event.seatId === names.me;
    const who = (seatId: SeatId) => (seatId === names.me ? 'You' : names.name(seatId));
    switch (event.kind) {
      case 'game_started':
        return [{ spec: { kicker: 'Starfall Manor', title: 'The case is open', sub: `${who(event.firstSeatId)} ${event.firstSeatId === names.me ? 'go' : 'goes'} first`, tone: 'neutral' }, at: 0 }];
      case 'suggested': {
        const at = phase(schedule, 'fly')?.end ?? 0;
        const out: Array<{ spec: BannerSpec; at: number }> = [
          {
            spec: {
              kicker: `${who(event.seatId)} ${mine ? 'suggest' : 'suggests'}`,
              title: `${SUSPECT_NAME[event.suspect]}, with the ${WEAPON_NAME[event.weapon]}`,
              sub: `in the ${ROOM_NAME[event.room]}`,
              tone: mine ? 'mine' : 'theirs',
            },
            at,
          },
        ];
        if (!event.refuterSeatId && !schedule.reduced) {
          out.push({ spec: { title: 'Nobody can refute!', tone: 'alarm' }, at: askCues(schedule, event.passed.length).verdict });
        }
        return out;
      }
      case 'refuted': {
        if (event.card && event.suggesterSeatId === names.me) {
          return [{ spec: { kicker: `${names.name(event.refuterSeatId)} shows you`, title: cardName(event.card), tone: 'mine' }, at: 0 }];
        }
        if (event.card && event.refuterSeatId === names.me) {
          return [{ spec: { kicker: `You show ${names.name(event.suggesterSeatId)}`, title: cardName(event.card), tone: 'mine' }, at: 0 }];
        }
        return [];
      }
      case 'accused': {
        const verdictAt = phase(schedule, 'verdict')?.start ?? schedule.resolveAt;
        return [
          {
            spec: {
              kicker: `${who(event.seatId)} ${mine ? 'accuse' : 'accuses'}`,
              title: `${SUSPECT_NAME[event.suspect]}, with the ${WEAPON_NAME[event.weapon]}`,
              sub: `in the ${ROOM_NAME[event.room]}`,
              tone: 'alarm',
            },
            at: 0,
          },
          {
            spec: event.correct
              ? { title: mine ? 'You cracked it!' : 'Case cracked!', tone: mine ? 'win' : 'lose' }
              : { title: 'Wrong!', sub: `${who(event.seatId)} ${mine ? 'are' : 'is'} out of the running`, tone: mine ? 'lose' : 'neutral' },
            at: verdictAt,
          },
        ];
      }
      case 'departed':
        return [{ spec: { title: `${who(event.seatId)} left the case`, sub: event.revealed.length > 0 ? 'Their cards are face up' : undefined, tone: 'neutral' }, at: 0 }];
      case 'turn_passed':
        return event.nextSeatId === names.me ? [{ spec: { title: 'Your turn', tone: 'mine' }, at: schedule.resolveAt * 0.5 }] : [];
      default:
        return [];
    }
  }

  private sounds(event: GameEvent, schedule: EventSchedule, elapsed: number, me: SeatId | null): void {
    const audio = this.deps.audio;
    const at = (name: Parameters<ManorAudio['play']>[0], ms: number) => audio.play(name, ms - elapsed);
    switch (event.kind) {
      case 'game_started':
        at('card', 0);
        break;
      case 'rolled':
        at('dice', 0);
        at('land', phase(schedule, 'tumble')?.end ?? schedule.resolveAt);
        break;
      case 'moved':
        if (event.via === 'passage') {
          at('passage', 0);
        } else if (!schedule.reduced) {
          for (const step of pendingCues(stepTimes(schedule, event.path.length - 1), elapsed)) {
            at('step', step);
          }
        }
        if (event.path.at(-1)?.kind === 'room') {
          at('door', schedule.resolveAt);
        }
        break;
      case 'suggested': {
        at('sting', phase(schedule, 'fly')?.end ?? 0);
        const cues = askCues(schedule, event.passed.length);
        for (const pass of pendingCues(cues.passes, elapsed)) {
          at('pass', pass);
        }
        at(event.refuterSeatId ? 'card' : 'gasp', cues.verdict);
        break;
      }
      case 'refuted':
        at('card', 0);
        break;
      case 'accused':
        at('drumroll', 0);
        at(event.correct ? 'right' : 'wrong', phase(schedule, 'verdict')?.start ?? schedule.resolveAt);
        break;
      case 'turn_passed':
        if (event.nextSeatId === me) {
          at('turn', schedule.resolveAt);
        }
        break;
      case 'game_over':
        at(event.winnerSeatId && event.winnerSeatId === me ? 'win' : 'lose', schedule.resolveAt);
        break;
      default:
        break;
    }
  }

  stopFx(): void {
    this.clock?.cancel();
    this.clock = null;
    this.board.stop();
    this.panel.stopRoll();
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, Math.max(0, ms));
    this.timers.add(timer);
  }
}
