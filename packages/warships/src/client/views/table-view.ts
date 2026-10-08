import type { ShotEvent, TableSnapshot } from '../../protocol.js';
import { BATTLE_START_MS, SHIP_NAME } from '../../rules/constants.js';
import type { Coord, Fleet } from '../../rules/types.js';
import type { SonarAudio } from '../audio.js';
import { placedShips, type Draft } from '../draft.js';
import { ShotClock } from '../fx/animate.js';
import { scheduleBanner } from '../fx/banner.js';
import { playShotFx } from '../fx/sonar.js';
import { phase, pingRingSpan, trackCues, type ShotSchedule } from '../fx/timeline.js';
import { coordLabel } from '../presenter.js';
import { publicBase } from '../route.js';
import { endLine, type ViewModel } from '../view-model.js';
import { BoardView } from './board.js';
import { h, setText } from './dom.js';
import { Hud, Tracker } from './hud.js';
import { Overlay } from './overlay.js';
import { PlacementView } from './placement.js';

export interface TableIntents {
  fire(coord: Coord): void;
  ready(fleet: Fleet): void;
  unready(): void;
  forfeit(): void;
  claimAbandoned(): void;
  leave(): void;
  rematch(): void;
  toggleMute(): void;
  draft(): Draft;
  setDraft(draft: Draft): void;
  lastFleet(): Fleet | null;
}

/** How long the own-board inset stays expanded after an incoming shot resolves (phones). */
const INSET_HOLD_MS = 400;
const FINALE_STAGGER_MS = 60;
const FINALE_SETTLE_MS = 700;

/**
 * The table screen: HUD on top, your waters and enemy waters side by side (stacked on phones,
 * with your board as an inset that expands for incoming fire), the placement tray while
 * deploying, and every banner and end screen layered above.
 */
export class TableView {
  readonly root: HTMLElement;
  readonly hud: Hud;
  readonly overlay: Overlay;
  readonly own: BoardView;
  readonly target: BoardView;
  readonly placement: PlacementView;
  private readonly ownTracker = new Tracker('Your fleet');
  private readonly targetTracker = new Tracker('Enemy fleet');
  private readonly ownSide: HTMLElement;
  private readonly targetSide: HTMLElement;
  private readonly waiting: HTMLElement;
  private readonly waitingLink: HTMLInputElement;
  private readonly notice: HTMLElement;
  private readonly noticeTitle: HTMLElement;
  private readonly noticeBody: HTMLElement;
  private readonly joining: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly theater: HTMLElement;
  private prev: ViewModel | null = null;
  private prevSnapshot: TableSnapshot | null = null;
  private readonly fxCleanups = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private finaleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    host: HTMLElement,
    private readonly intents: TableIntents,
    private readonly deps: { audio: SonarAudio; reducedMotion(): boolean; shareLink: string; copy(text: string): Promise<boolean> },
  ) {
    this.hud = new Hud(intents);
    this.overlay = new Overlay(intents);
    this.own = new BoardView('own', 'Your waters');
    this.target = new BoardView('target', 'Enemy waters');
    this.target.onFire = (coord) => intents.fire(coord);
    this.own.root.addEventListener('click', () => {
      if (this.root.dataset.screen === 'battle' || this.root.dataset.screen === 'finished') {
        this.root.classList.toggle('ws-own-pinned');
      }
    });
    this.placement = new PlacementView(this.own, {
      draft: () => intents.draft(),
      setDraft: (draft) => intents.setDraft(draft),
      ready: (fleet) => intents.ready(fleet),
      unready: () => intents.unready(),
      announce: (text) => this.overlay.announce(text),
      reducedMotion: () => deps.reducedMotion(),
      lastFleet: () => intents.lastFleet(),
    });

    this.ownSide = h(
      'section',
      { class: 'ws-side ws-side-own', 'aria-labelledby': 'ws-own-title' },
      h('h2', { class: 'ws-side-title', id: 'ws-own-title' }, 'Your waters'),
      this.own.root,
      this.ownTracker.root,
    );
    this.targetSide = h(
      'section',
      { class: 'ws-side ws-side-target', 'aria-labelledby': 'ws-target-title' },
      h('h2', { class: 'ws-side-title', id: 'ws-target-title' }, 'Enemy waters'),
      this.target.root,
      this.targetTracker.root,
    );

    this.waitingLink = h('input', { class: 'ws-link-field', type: 'text', readonly: true, value: deps.shareLink, 'aria-label': 'Invite link', spellcheck: 'false' });
    this.waitingLink.addEventListener('focus', () => this.waitingLink.select());
    const copy = h('button', { type: 'button', class: 'ws-btn ws-btn-primary' }, 'Copy link');
    copy.addEventListener('click', async () => {
      const ok = await deps.copy(deps.shareLink);
      if (ok) {
        this.overlay.toast('Invite link copied.');
      } else {
        this.waitingLink.focus();
        this.overlay.toast('Copy the link from the box.');
      }
    });
    this.waiting = h(
      'section',
      { class: 'ws-panel ws-waiting', 'aria-labelledby': 'ws-waiting-title' },
      h('span', { class: 'ws-radar-emblem', 'aria-hidden': 'true' }),
      h('h2', { class: 'ws-panel-title', id: 'ws-waiting-title' }, 'Waiting for an opponent'),
      h('p', {}, 'Send this link to a Galaxy Class member. Placing starts the moment a second captain sits.'),
      h('div', { class: 'ws-link-row' }, this.waitingLink, copy),
    );

    this.noticeTitle = h('h2', { class: 'ws-panel-title' });
    this.noticeBody = h('p', {});
    this.notice = h(
      'section',
      { class: 'ws-panel ws-notice', role: 'status' },
      h('span', { class: 'ws-radar-emblem', 'aria-hidden': 'true' }),
      this.noticeTitle,
      this.noticeBody,
      h('div', { class: 'ws-actions' }, h('a', { class: 'ws-btn ws-btn-primary', href: publicBase() }, 'Back to your tables')),
    );
    this.joining = h(
      'section',
      { class: 'ws-panel ws-joining', role: 'status' },
      h('span', { class: 'ws-radar-emblem', 'aria-hidden': 'true' }),
      h('p', {}, 'Joining the table…'),
    );

    this.theater = h('div', { class: 'ws-theater' }, this.ownSide, this.targetSide, this.placement.panel);
    this.stage = h('main', { class: 'ws-stage', id: 'main' }, this.joining, this.notice, this.waiting);
    this.root = h(
      'div',
      { class: 'ws-app', 'data-screen': 'connecting' },
      this.hud.root,
      this.hud.statusBar,
      this.stage,
      this.overlay.bannerLayer,
      this.overlay.end,
      this.overlay.toastEl,
      this.overlay.live,
    );
    host.replaceChildren(this.root);
    this.hud.setMuted(deps.audio.muted, deps.audio.available);
  }

  render(vm: ViewModel, snapshot: TableSnapshot | null, pending: Coord | null): void {
    const prev = this.prev;
    this.root.dataset.screen = vm.screen;
    this.root.dataset.turn = vm.screen === 'battle' ? (vm.myTurn ? 'mine' : 'theirs') : '';
    this.hud.update(vm, snapshot);

    this.joining.hidden = vm.screen !== 'connecting';
    this.notice.hidden = vm.screen !== 'notice';
    this.waiting.hidden = vm.screen !== 'waiting';
    if (vm.notice) {
      setText(this.noticeTitle, vm.notice.title);
      setText(this.noticeBody, vm.notice.body);
    }
    // Boards exist only for a seated captain: a member at a full or locked table gets no grids at all.
    const boards = vm.screen === 'waiting' || vm.screen === 'placing' || vm.screen === 'battle' || vm.screen === 'finished';
    if (boards && !this.theater.isConnected) {
      this.stage.append(this.theater);
    } else if (!boards && this.theater.isConnected) {
      this.theater.remove();
    }
    this.targetSide.hidden = vm.screen !== 'battle' && vm.screen !== 'finished';
    this.placement.panel.hidden = vm.screen !== 'placing';

    const placing = vm.screen === 'placing';
    this.placement.setActive(placing);
    if (placing) {
      this.own.render({ ...vm.own, ships: [] }, { interactive: false });
      this.placement.update({
        ready: vm.ready,
        opponentReady: vm.opponentReady,
        opponentName: vm.opponent?.displayName ?? 'Your opponent',
        canUnready: vm.canUnready,
      });
    } else {
      this.own.render(vm.own, { interactive: false });
    }
    this.target.render(vm.target, { interactive: vm.canFire, disabledReason: vm.fireBlockedReason, pending });
    if (vm.screen === 'finished' && snapshot?.target?.revealed) {
      const sunk = new Set(snapshot.target.sunk.map((ship) => ship.shipId));
      let order = 0;
      this.target.renderShips(
        vm.target.ships.map((ship) => ({
          placement: ship.placement,
          state: ship.sunk || sunk.has(ship.placement.shipId) ? 'sunk' : 'revealed',
          ...(ship.revealed ? { order: order++ } : {}),
        })),
      );
    }
    this.ownTracker.update(vm.ownTracker);
    this.targetTracker.update(vm.targetTracker);
    this.own.root.dataset.idle = vm.screen === 'waiting' || (vm.screen === 'battle' && !vm.myTurn) ? 'true' : 'false';
    this.target.root.dataset.dim = vm.screen === 'battle' && !vm.canFire ? 'true' : 'false';

    this.transitions(prev, vm, snapshot);
    this.prev = vm;
    this.prevSnapshot = snapshot;
  }

  private transitions(prev: ViewModel | null, vm: ViewModel, snapshot: TableSnapshot | null): void {
    const reduced = this.deps.reducedMotion();
    const them = vm.opponent?.displayName ?? 'Your opponent';
    if (prev?.screen === 'placing' && vm.screen === 'battle') {
      scheduleBanner(
        this.overlay.bannerLayer,
        { title: 'Battle stations', sub: vm.myTurn ? 'You fire first' : `${them} fires first`, tone: 'neutral' },
        { reduced, hold: Math.max(600, BATTLE_START_MS - 600) },
      );
      this.root.classList.remove('ws-battle-enter');
      void this.root.offsetWidth;
      this.root.classList.add('ws-battle-enter');
      this.later(() => this.root.classList.remove('ws-battle-enter'), 1200);
      this.overlay.announce(`Battle stations. ${vm.myTurn ? 'You fire first.' : `${them} fires first.`}`);
      this.deps.audio.play('turn');
    }
    if (vm.screen === 'battle' && prev?.screen === 'battle' && vm.canFire && !prev.canFire) {
      this.target.root.classList.remove('ws-turn-pulse');
      void this.target.root.offsetWidth;
      this.target.root.classList.add('ws-turn-pulse');
      this.later(() => this.target.root.classList.remove('ws-turn-pulse'), 500);
      this.overlay.announce('Your turn. Choose a target.');
      this.deps.audio.play('turn');
      if (document.activeElement === document.body || !document.activeElement) {
        this.target.moveFocus(this.target.focusedCell, false);
      }
    }
    if (vm.screen === 'finished' && snapshot) {
      if (prev?.screen === 'battle') {
        this.finale(vm, reduced);
      } else if (!this.finaleTimer) {
        this.showEnd(vm, snapshot);
      }
    } else {
      if (this.finaleTimer) {
        clearTimeout(this.finaleTimer);
        this.finaleTimer = null;
      }
      this.overlay.hideEnd();
      this.root.classList.remove('ws-own-pinned');
    }
  }

  /** The opponent's remaining ships fade in one by one, then the end screen. */
  private finale(vm: ViewModel, reduced: boolean): void {
    const revealed = vm.target.ships.filter((ship) => ship.revealed).length;
    this.target.root.classList.add('ws-revealing');
    const wait = reduced ? 200 : revealed * FINALE_STAGGER_MS + FINALE_SETTLE_MS;
    this.finaleTimer = setTimeout(() => {
      this.finaleTimer = null;
      this.target.root.classList.remove('ws-revealing');
      const latest = this.prev ?? vm;
      if (latest.screen !== 'finished' || !this.prevSnapshot) {
        return;
      }
      this.showEnd(latest, this.prevSnapshot);
      this.deps.audio.play(latest.won ? 'victory' : 'defeat');
      this.overlay.announce(`${latest.won ? 'Victory' : 'Defeat'}. ${endLine(Boolean(latest.won), latest.endReason)}`);
    }, wait);
  }

  private showEnd(vm: ViewModel, snapshot: TableSnapshot): void {
    this.overlay.showEnd({
      won: Boolean(vm.won),
      line: endLine(Boolean(vm.won), vm.endReason),
      canRematch: vm.canRematch,
      rematchVoted: vm.rematchVoted,
      opponentRematchVoted: vm.opponentRematchVoted,
      opponentName: vm.opponent?.displayName ?? null,
      recap: snapshot.recap,
      seats: snapshot.seats,
    });
  }

  setMuted(muted: boolean): void {
    this.hud.setMuted(muted, this.deps.audio.available);
  }

  setTableName(name: string): void {
    this.hud.setTableName(name);
  }

  /**
   * Plays one shot on whichever of your boards it concerns, seeked `elapsed` ms in: the shooter
   * watches it on enemy waters, the defender sees the same track arrive on their own board.
   */
  playShot(shot: ShotEvent, schedule: ShotSchedule, elapsed: number, me: string | null, names: { shooter: string }): void {
    const outgoing = shot.shooter === me;
    const incoming = shot.target === me;
    if (!outgoing && !incoming) {
      return;
    }
    const board = outgoing ? this.target : this.own;
    const clock = new ShotClock(elapsed);
    const cleanupFx = playShotFx(board, shot, schedule, clock, outgoing ? 'outgoing' : 'incoming');
    const cleanup = () => {
      clock.cancel();
      cleanupFx();
      this.fxCleanups.delete(cleanup);
    };
    this.fxCleanups.add(cleanup);
    this.later(cleanup, schedule.total - elapsed + 120);

    if (incoming) {
      this.root.classList.add('ws-own-expanded');
      const resolve = phase(schedule, 'resolve');
      this.later(() => this.root.classList.remove('ws-own-expanded'), (resolve?.end ?? schedule.total) - elapsed + INSET_HOLD_MS);
    }

    const ship = shot.sunkShip ? SHIP_NAME[shot.sunkShip.shipId] : null;
    if (ship && schedule.sinkAt !== null) {
      scheduleBanner(
        this.overlay.bannerLayer,
        outgoing
          ? { title: `You sank their ${ship}!`, tone: 'outgoing', kicker: 'Direct hit' }
          : { title: `Your ${ship} was sunk!`, tone: 'incoming', kicker: 'Ship lost' },
        { clock, start: schedule.sinkAt, reduced: schedule.reduced },
      );
    }

    const label = coordLabel(shot.coord);
    const result = shot.result === 'hit' ? 'Hit.' : 'Miss.';
    const sinkLine = ship ? (outgoing ? ` You sank their ${ship}!` : ` Your ${ship} was sunk.`) : '';
    const who = outgoing ? 'You fire' : `${names.shooter} fires`;
    this.later(() => this.overlay.announce(`${who} at ${label}. ${result}${sinkLine}`), schedule.resolveAt - elapsed);

    const audio = this.deps.audio;
    if (schedule.reduced) {
      audio.play('ping', -elapsed);
    } else {
      const sweep = phase(schedule, 'sweep');
      const track = phase(schedule, 'track');
      if (sweep) {
        audio.play('sweep', sweep.start - elapsed);
      }
      if (track) {
        for (const cue of trackCues(schedule, shot.coord).cues.filter((c) => c.axis === 'row')) {
          audio.play('tick', cue.at - elapsed);
        }
        audio.play('ping', track.end - pingRingSpan(schedule) - elapsed);
      }
    }
    audio.play(shot.result === 'hit' ? 'hit' : 'splash', schedule.resolveAt - elapsed);
    if (schedule.sinkAt !== null) {
      audio.play('sink', schedule.sinkAt - elapsed);
    }
  }

  stopFx(): void {
    for (const cleanup of [...this.fxCleanups]) {
      cleanup();
    }
    this.root.classList.remove('ws-own-expanded');
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, Math.max(0, ms));
    this.timers.add(timer);
  }

  /** Dev hook: placed draft ships, for e2e assertions. */
  draftShips(): number {
    return placedShips(this.intents.draft()).length;
  }
}
