import type { CardId, GameEvent, SeatId, TableSnapshot } from '../../protocol.js';
import { ROOM_IDS, ROOM_NAME, SUSPECTS, WEAPONS } from '../../rules/constants.js';
import type { RoomId, SuspectId, TokenPosition, WeaponId } from '../../rules/types.js';
import { cardName, solutionLine } from '../cards.js';
import { EASE_OUT, FxClock, seeded } from '../fx/animate.js';
import { phase, type EventSchedule } from '../fx/timeline.js';
import { destinationLabel, eventLine, type Names } from '../narrate.js';
import type { NoteMark, NoteRow } from '../notes.js';
import { seatName, type ViewModel } from '../view-model.js';
import { h, setText, show } from './dom.js';
import { cardFace, portraitSvg, roomSvg, suspectChip, weaponSvg } from './figures.js';

export interface PanelIntents {
  roll(): void;
  takePassage(): void;
  move(to: TokenPosition): void;
  suggest(suspect: SuspectId, weapon: WeaponId): void;
  showCard(card: CardId): void;
  accuse(suspect: SuspectId, weapon: WeaponId, room: RoomId): void;
  endTurn(): void;
  cycleNote(card: CardId, seatId: SeatId): void;
}

export interface PanelState {
  vm: ViewModel;
  snapshot: TableSnapshot | null;
  notes: NoteRow[];
  names: Names;
}

/** Pips lit for each face, on a 3 × 3 grid read left to right, top to bottom. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function die(): HTMLElement {
  return h('span', { class: 'wd-die', 'data-face': '0' }, ...Array.from({ length: 9 }, (_, i) => h('span', { class: 'wd-pip', 'data-pip': String(i) })));
}

function setFace(node: HTMLElement, face: number): void {
  node.dataset.face = String(face);
  const lit = new Set(PIPS[face] ?? []);
  node.querySelectorAll<HTMLElement>('.wd-pip').forEach((pip, i) => {
    pip.dataset.on = lit.has(i) ? 'true' : 'false';
  });
}

const MARK_LABEL: Record<NoteMark, string> = { '': 'unknown', no: 'does not have it', maybe: 'might have it', has: 'has it' };
const MARK_GLYPH: Record<NoteMark, string> = { '': '', no: '✕', maybe: '?', has: '✓' };

/** A grid of choices (suspects, weapons, or rooms) where exactly one is pressed. */
class Picker<T extends string> {
  readonly root: HTMLElement;
  value: T | null = null;
  private readonly buttons = new Map<T, HTMLButtonElement>();

  constructor(
    label: string,
    options: Array<{ id: T; name: string; art: Element; color?: string }>,
    testid: string,
    private readonly onChange: () => void,
  ) {
    this.root = h('fieldset', { class: 'wd-picker' }, h('legend', {}, label));
    const grid = h('div', { class: 'wd-picker-grid' });
    for (const option of options) {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'wd-option',
          'aria-pressed': 'false',
          'data-testid': `${testid}-${option.id}`,
          style: option.color ? `--wd-accent:${option.color}` : undefined,
        },
        h('span', { class: 'wd-option-art' }, option.art),
        h('span', { class: 'wd-option-name' }, option.name),
      );
      button.addEventListener('click', () => this.set(option.id));
      this.buttons.set(option.id, button);
      grid.append(button);
    }
    this.root.append(grid);
  }

  set(value: T | null): void {
    this.value = value;
    for (const [id, button] of this.buttons) {
      button.setAttribute('aria-pressed', id === value ? 'true' : 'false');
    }
    this.onChange();
  }
}

/**
 * The controls beside the board (`root`): the dice and what you can do this turn, the private
 * "show a card" prompt, the suggestion and accusation forms, and your hand. The notepad and the
 * case log sit in their own column (`side`) on the board's other flank.
 */
export class Panel {
  readonly root: HTMLElement;
  readonly side: HTMLElement;
  private readonly dice: HTMLElement;
  private readonly dieA: HTMLElement;
  private readonly dieB: HTMLElement;
  private readonly diceTotal: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly rollButton: HTMLButtonElement;
  private readonly passageButton: HTMLButtonElement;
  private readonly suggestButton: HTMLButtonElement;
  private readonly accuseButton: HTMLButtonElement;
  private readonly endTurnButton: HTMLButtonElement;
  private readonly roomList: HTMLElement;
  private readonly hand: HTMLElement;
  private readonly refuteBox: HTMLElement;
  private readonly refuteLine: HTMLElement;
  private readonly refuteCards: HTMLElement;
  private readonly suggestBox: HTMLElement;
  private readonly suggestRoom: HTMLElement;
  private readonly suggestSuspect: Picker<SuspectId>;
  private readonly suggestWeapon: Picker<WeaponId>;
  private readonly suggestSubmit: HTMLButtonElement;
  private readonly accuseBox: HTMLElement;
  private readonly accuseForm: HTMLElement;
  private readonly accuseConfirmBox: HTMLElement;
  private readonly accuseConfirmLine: HTMLElement;
  private readonly accuseSuspect: Picker<SuspectId>;
  private readonly accuseWeapon: Picker<WeaponId>;
  private readonly accuseRoom: Picker<RoomId>;
  private readonly accuseNext: HTMLButtonElement;
  private readonly notepad: HTMLElement;
  private readonly log: HTMLElement;
  private readonly tabs: Map<'notes' | 'log', { tab: HTMLButtonElement; panel: HTMLElement }> = new Map();
  private state: PanelState | null = null;
  private diceClock: FxClock | null = null;
  private diceTimers: ReturnType<typeof setTimeout>[] = [];
  private rolling = false;
  private keys = { rooms: '', hand: '', refute: '', notes: '', log: '' };

  constructor(private readonly intents: PanelIntents) {
    this.dieA = die();
    this.dieB = die();
    this.diceTotal = h('span', { class: 'wd-dice-total' });
    this.dice = h('div', { class: 'wd-dice', 'data-testid': 'dice', role: 'img', 'aria-label': 'Dice not rolled' }, this.dieA, this.dieB, this.diceTotal);
    this.hint = h('p', { class: 'wd-hint', 'data-testid': 'move-hint' });

    this.rollButton = this.button('Roll the dice', 'roll', 'wd-btn wd-btn-primary', () => intents.roll());
    this.passageButton = this.button('Secret passage', 'take-passage', 'wd-btn', () => intents.takePassage());
    this.suggestButton = this.button('Suggest', 'suggest-open', 'wd-btn wd-btn-primary', () => this.openSuggest());
    this.accuseButton = this.button('Accuse', 'accuse-open', 'wd-btn wd-btn-danger', () => this.openAccuse());
    this.endTurnButton = this.button('End turn', 'end-turn', 'wd-btn', () => intents.endTurn());
    this.roomList = h('div', { class: 'wd-room-list', role: 'group', 'aria-label': 'Rooms within reach' });

    this.hand = h('div', { class: 'wd-hand', 'data-testid': 'hand', role: 'list', 'aria-label': 'Your cards' });

    this.refuteLine = h('p', { class: 'wd-refute-line' });
    this.refuteCards = h('div', { class: 'wd-refute-cards' });
    this.refuteBox = h(
      'section',
      { class: 'wd-sheet wd-refute', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'wd-refute-title', 'data-testid': 'refute-prompt', hidden: true },
      h('h3', { class: 'wd-sheet-title', id: 'wd-refute-title' }, 'Show a card'),
      this.refuteLine,
      this.refuteCards,
      h('p', { class: 'wd-sheet-note' }, 'Only the two of you will see which card.'),
    );

    const suspectOptions = SUSPECTS.map((s) => ({ id: s.id, name: s.name, art: portraitSvg(s.id, 'wd-option-portrait'), color: s.color }));
    const weaponOptions = WEAPONS.map((w) => ({ id: w.id, name: w.name, art: weaponSvg(w.id, 'wd-option-icon') }));

    this.suggestRoom = h('p', { class: 'wd-sheet-room' });
    this.suggestSuspect = new Picker('Suspect', suspectOptions, 'suggest-suspect', () => this.syncSuggest());
    this.suggestWeapon = new Picker('Weapon', weaponOptions, 'suggest-weapon', () => this.syncSuggest());
    this.suggestSubmit = this.button('Make the suggestion', 'suggest-submit', 'wd-btn wd-btn-primary', () => {
      if (this.suggestSuspect.value && this.suggestWeapon.value) {
        intents.suggest(this.suggestSuspect.value, this.suggestWeapon.value);
        this.closeSheets();
      }
    });
    this.suggestBox = h(
      'section',
      { class: 'wd-sheet wd-suggest', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'wd-suggest-title', 'data-testid': 'suggest-dialog', hidden: true },
      h('h3', { class: 'wd-sheet-title', id: 'wd-suggest-title' }, 'Make a suggestion'),
      this.suggestRoom,
      this.suggestSuspect.root,
      this.suggestWeapon.root,
      h('div', { class: 'wd-sheet-actions' }, this.suggestSubmit, this.button('Cancel', 'suggest-cancel', 'wd-btn wd-btn-quiet', () => this.closeSheets())),
    );

    this.accuseSuspect = new Picker('Suspect', suspectOptions.map((o) => ({ ...o, art: portraitSvg(o.id, 'wd-option-portrait') })), 'accuse-suspect', () => this.syncAccuse());
    this.accuseWeapon = new Picker('Weapon', weaponOptions.map((o) => ({ ...o, art: weaponSvg(o.id, 'wd-option-icon') })), 'accuse-weapon', () => this.syncAccuse());
    this.accuseRoom = new Picker(
      'Room',
      ROOM_IDS.map((id) => ({ id, name: ROOM_NAME[id], art: roomSvg(id, 'wd-option-room') })),
      'accuse-room',
      () => this.syncAccuse(),
    );
    this.accuseNext = this.button('Accuse…', 'accuse-submit', 'wd-btn wd-btn-danger', () => {
      if (this.accuseSuspect.value && this.accuseWeapon.value && this.accuseRoom.value) {
        setText(
          this.accuseConfirmLine,
          `${solutionLine({ suspect: this.accuseSuspect.value, weapon: this.accuseWeapon.value, room: this.accuseRoom.value })}?`,
        );
        show(this.accuseForm, false);
        show(this.accuseConfirmBox, true);
      }
    });
    this.accuseForm = h(
      'div',
      { class: 'wd-accuse-form' },
      h('p', { class: 'wd-sheet-note' }, 'Name all three. You open the case file: right and you win, wrong and you are out of the running.'),
      this.accuseSuspect.root,
      this.accuseWeapon.root,
      this.accuseRoom.root,
      h('div', { class: 'wd-sheet-actions' }, this.accuseNext, this.button('Cancel', 'accuse-cancel', 'wd-btn wd-btn-quiet', () => this.closeSheets())),
    );
    this.accuseConfirmLine = h('strong', { class: 'wd-accuse-line' });
    this.accuseConfirmBox = h(
      'div',
      { class: 'wd-accuse-confirm', hidden: true },
      h('p', {}, 'You accuse'),
      this.accuseConfirmLine,
      h('p', { class: 'wd-sheet-note' }, 'There is no taking it back.'),
      h(
        'div',
        { class: 'wd-sheet-actions' },
        this.button('Open the case file', 'accuse-confirm', 'wd-btn wd-btn-danger', () => {
          if (this.accuseSuspect.value && this.accuseWeapon.value && this.accuseRoom.value) {
            intents.accuse(this.accuseSuspect.value, this.accuseWeapon.value, this.accuseRoom.value);
            this.closeSheets();
          }
        }),
        this.button('Back', 'accuse-back', 'wd-btn wd-btn-quiet', () => {
          show(this.accuseConfirmBox, false);
          show(this.accuseForm, true);
        }),
      ),
    );
    this.accuseBox = h(
      'section',
      { class: 'wd-sheet wd-accuse', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'wd-accuse-title', 'data-testid': 'accuse-dialog', hidden: true },
      h('h3', { class: 'wd-sheet-title', id: 'wd-accuse-title' }, 'Make an accusation'),
      this.accuseForm,
      this.accuseConfirmBox,
    );

    this.notepad = h('div', { class: 'wd-notepad', 'data-testid': 'notepad' });
    this.log = h('ol', { class: 'wd-log', 'data-testid': 'event-log', 'aria-label': 'Case log' });
    const notesPanel = h('div', { class: 'wd-tab-panel', id: 'wd-tab-notes', role: 'tabpanel', 'aria-labelledby': 'wd-tab-notes-btn' }, this.notepad);
    const logPanel = h('div', { class: 'wd-tab-panel', id: 'wd-tab-log', role: 'tabpanel', 'aria-labelledby': 'wd-tab-log-btn', hidden: true }, this.log);
    const notesTab = h('button', { type: 'button', role: 'tab', id: 'wd-tab-notes-btn', 'aria-controls': 'wd-tab-notes', 'aria-selected': 'true', 'data-testid': 'tab-notes' }, 'Notepad');
    const logTab = h('button', { type: 'button', role: 'tab', id: 'wd-tab-log-btn', 'aria-controls': 'wd-tab-log', 'aria-selected': 'false', 'data-testid': 'tab-log' }, 'Case log');
    this.tabs.set('notes', { tab: notesTab, panel: notesPanel });
    this.tabs.set('log', { tab: logTab, panel: logPanel });
    notesTab.addEventListener('click', () => this.selectTab('notes'));
    logTab.addEventListener('click', () => this.selectTab('log'));

    this.root = h(
      'section',
      { class: 'wd-panel', 'aria-label': 'Your turn controls', 'data-testid': 'panel' },
      h(
        'div',
        { class: 'wd-turn-box' },
        this.dice,
        h('div', { class: 'wd-turn-text' }, this.hint, this.roomList),
        h('div', { class: 'wd-actions' }, this.rollButton, this.passageButton, this.suggestButton, this.accuseButton, this.endTurnButton),
      ),
      this.refuteBox,
      this.suggestBox,
      this.accuseBox,
      h('div', { class: 'wd-hand-box' }, h('h3', { class: 'wd-box-title' }, 'Your cards'), this.hand),
    );
    this.side = h(
      'section',
      { class: 'wd-notes', 'aria-label': 'Notepad and case log', 'data-testid': 'notes' },
      h('div', { class: 'wd-tabs', role: 'tablist', 'aria-label': 'Notes' }, notesTab, logTab),
      notesPanel,
      logPanel,
    );
  }

  private button(label: string, testid: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = h('button', { type: 'button', class: className, 'data-testid': testid }, label);
    button.addEventListener('click', onClick);
    return button;
  }

  private selectTab(which: 'notes' | 'log'): void {
    for (const [name, { tab, panel }] of this.tabs) {
      tab.setAttribute('aria-selected', name === which ? 'true' : 'false');
      panel.hidden = name !== which;
    }
  }

  private openSuggest(): void {
    if (!this.state?.vm.canSuggest) {
      return;
    }
    this.closeSheets();
    setText(this.suggestRoom, this.state.vm.myRoom ? `In the ${ROOM_NAME[this.state.vm.myRoom]}` : '');
    this.suggestSuspect.set(null);
    this.suggestWeapon.set(null);
    show(this.suggestBox, true);
    this.suggestBox.querySelector<HTMLButtonElement>('.wd-option')?.focus({ preventScroll: true });
    this.suggestBox.scrollIntoView?.({ block: 'nearest' });
  }

  private openAccuse(): void {
    if (!this.state?.vm.canAccuse) {
      return;
    }
    this.closeSheets();
    this.accuseSuspect.set(null);
    this.accuseWeapon.set(null);
    this.accuseRoom.set(this.state.vm.myRoom);
    show(this.accuseForm, true);
    show(this.accuseConfirmBox, false);
    show(this.accuseBox, true);
    this.accuseBox.querySelector<HTMLButtonElement>('.wd-option')?.focus({ preventScroll: true });
    this.accuseBox.scrollIntoView?.({ block: 'nearest' });
  }

  closeSheets(): void {
    show(this.suggestBox, false);
    show(this.accuseBox, false);
  }

  private syncSuggest(): void {
    this.suggestSubmit.disabled = !(this.suggestSuspect.value && this.suggestWeapon.value && this.state?.vm.canSuggest);
  }

  private syncAccuse(): void {
    this.accuseNext.disabled = !(this.accuseSuspect.value && this.accuseWeapon.value && this.accuseRoom.value);
  }

  update(state: PanelState): void {
    this.state = state;
    const { vm, snapshot } = state;
    this.root.dataset.myturn = vm.myTurn ? 'true' : 'false';

    if (!this.rolling) {
      this.showDice(vm.dice);
    }
    setText(this.hint, vm.hint || vm.blockedReason || '');

    show(this.rollButton, vm.myTurn && vm.phase === 'start' && !vm.eliminated);
    this.rollButton.disabled = !vm.canRoll;
    show(this.passageButton, vm.myTurn && vm.phase === 'start' && vm.passageTo !== null && !vm.eliminated);
    this.passageButton.disabled = !vm.canPassage;
    setText(this.passageButton, vm.passageTo ? `Passage to the ${ROOM_NAME[vm.passageTo]}` : 'Secret passage');
    show(this.suggestButton, vm.canSuggest);
    this.suggestButton.disabled = !vm.canSuggest;
    show(this.accuseButton, vm.myTurn && !vm.eliminated && vm.phase !== null);
    this.accuseButton.disabled = !vm.canAccuse;
    show(this.endTurnButton, vm.myTurn && !vm.eliminated && vm.phase !== null && vm.phase !== 'start');
    this.endTurnButton.disabled = !vm.canEndTurn;
    if (!vm.canSuggest) {
      show(this.suggestBox, false);
    }
    if (!vm.canAccuse) {
      show(this.accuseBox, false);
    }
    this.syncSuggest();

    this.renderRooms(vm);
    this.renderHand(vm);
    this.renderRefute(vm, snapshot, state.names);
    this.renderNotes(state.notes, snapshot, state.names);
    this.renderLog(snapshot?.log ?? [], state.names);
  }

  private showDice(dice: [number, number] | null): void {
    setFace(this.dieA, dice?.[0] ?? 0);
    setFace(this.dieB, dice?.[1] ?? 0);
    setText(this.diceTotal, dice ? String(dice[0] + dice[1]) : '');
    this.dice.dataset.rolled = dice ? 'true' : 'false';
    this.dice.setAttribute('aria-label', dice ? `Dice: ${dice[0]} and ${dice[1]}, ${dice[0] + dice[1]}` : 'Dice not rolled');
  }

  private renderRooms(vm: ViewModel): void {
    const rooms = vm.canMove ? vm.destinations.filter((reach) => reach.destination.kind === 'room') : [];
    const key = rooms.map((reach) => `${destinationLabel(reach)}`).join('|') + `:${vm.destinations.length}`;
    if (key === this.keys.rooms) {
      return;
    }
    this.keys.rooms = key;
    const halls = vm.canMove ? vm.destinations.length - rooms.length : 0;
    const buttons: HTMLElement[] = rooms.map((reach) => {
      const room = (reach.destination as { room: RoomId }).room;
      const button = h('button', { type: 'button', class: 'wd-chip-btn', 'data-testid': `dest-room-${room}`, 'aria-label': `Move to ${destinationLabel(reach)}` }, ROOM_NAME[room]);
      button.addEventListener('click', () => this.intents.move(reach.destination));
      return button;
    });
    if (halls > 0) {
      buttons.push(h('span', { class: 'wd-room-list-note' }, `${halls} hall ${halls === 1 ? 'square' : 'squares'} lit on the board`));
    }
    this.roomList.replaceChildren(...buttons);
  }

  private renderHand(vm: ViewModel): void {
    const key = vm.hand.join(',');
    if (key === this.keys.hand) {
      return;
    }
    this.keys.hand = key;
    this.hand.replaceChildren(
      ...vm.hand.map((card) => {
        const face = cardFace(card);
        face.setAttribute('role', 'listitem');
        face.setAttribute('data-testid', `hand-card-${card}`);
        return face;
      }),
    );
    if (vm.hand.length === 0) {
      this.hand.append(h('p', { class: 'wd-empty' }, 'Your cards are dealt when the case opens.'));
    }
  }

  private renderRefute(vm: ViewModel, snapshot: TableSnapshot | null, names: Names): void {
    const refute = vm.refute;
    show(this.refuteBox, Boolean(refute));
    if (!refute) {
      this.keys.refute = '';
      return;
    }
    const key = `${refute.suggesterSeatId}:${refute.matching.join(',')}:${vm.canRefute}`;
    if (key === this.keys.refute) {
      return;
    }
    this.keys.refute = key;
    const suggester = snapshot?.seats.find((seat) => seat.seatId === refute.suggesterSeatId);
    setText(this.refuteLine, `${suggester ? seatName(suggester) : names.name(refute.suggesterSeatId)} suggests ${solutionLine(refute.suggestion)}. You hold a match.`);
    this.refuteCards.replaceChildren(
      ...refute.matching.map((card) => {
        const button = h('button', { type: 'button', class: 'wd-card-btn', 'data-testid': `refute-card-${card}`, 'aria-label': `Show ${cardName(card)}` }, cardFace(card, 'span'));
        button.disabled = !vm.canRefute;
        button.addEventListener('click', () => this.intents.showCard(card));
        return button;
      }),
    );
  }

  private renderNotes(rows: NoteRow[], snapshot: TableSnapshot | null, names: Names): void {
    const players = snapshot?.players ?? [];
    const key = JSON.stringify([players, rows.map((row) => [row.cleared, row.cells.map((c) => `${c.mark}${c.auto ? '!' : ''}`).join('')])]);
    if (key === this.keys.notes) {
      return;
    }
    this.keys.notes = key;
    if (players.length === 0) {
      this.notepad.replaceChildren(h('p', { class: 'wd-empty' }, 'Your notepad opens with the case. Tap a square to mark it: ✕ no, ? maybe, ✓ has it.'));
      return;
    }
    const head = h(
      'tr',
      {},
      h('th', { scope: 'col', class: 'wd-note-card' }, 'Card'),
      ...players.map((seatId) => {
        const suspect = snapshot?.seats.find((seat) => seat.seatId === seatId)?.suspect;
        const name = seatId === names.me ? 'You' : names.name(seatId);
        return h('th', { scope: 'col', title: name, 'aria-label': name }, suspect ? suspectChip(suspect, 'wd-note-chip') : name.charAt(0));
      }),
    );
    const groups: Array<[string, NoteRow['kind']]> = [
      ['Suspects', 'suspect'],
      ['Weapons', 'weapon'],
      ['Rooms', 'room'],
    ];
    const body = groups.flatMap(([title, kind]) => [
      h('tr', { class: 'wd-note-group' }, h('th', { scope: 'rowgroup', colspan: String(players.length + 1) }, title)),
      ...rows
        .filter((row) => row.kind === kind)
        .map((row) =>
          h(
            'tr',
            { 'data-cleared': row.cleared ? 'true' : 'false', 'data-card': row.card },
            h('th', { scope: 'row', class: 'wd-note-card' }, row.name, row.public ? h('small', {}, ' face up') : null),
            ...row.cells.map((cell) => {
              const who = cell.seatId === names.me ? 'You' : names.name(cell.seatId);
              const button = h(
                'button',
                {
                  type: 'button',
                  class: 'wd-note-cell',
                  'data-mark': cell.mark || 'none',
                  'data-auto': cell.auto ? 'true' : undefined,
                  'data-testid': `note-${row.card}-${cell.seatId}`,
                  'aria-label': `${row.name}: ${who} ${MARK_LABEL[cell.mark]}${cell.auto ? ' (known)' : ''}`,
                },
                MARK_GLYPH[cell.mark],
              );
              button.disabled = cell.auto;
              button.addEventListener('click', () => this.intents.cycleNote(row.card, cell.seatId));
              return h('td', {}, button);
            }),
          ),
        ),
    ]);
    this.notepad.replaceChildren(h('table', { class: 'wd-note-table' }, h('thead', {}, head), h('tbody', {}, ...body)));
  }

  private renderLog(log: GameEvent[], names: Names): void {
    const key = `${log.length}:${log.at(-1)?.eventId ?? ''}:${names.me}`;
    if (key === this.keys.log) {
      return;
    }
    this.keys.log = key;
    const recent = log.slice(-80).reverse();
    this.log.replaceChildren(
      ...recent.map((event) => h('li', { 'data-kind': event.kind, 'data-mine': 'seatId' in event && event.seatId === names.me ? 'true' : undefined }, eventLine(event, names))),
    );
    if (recent.length === 0) {
      this.log.append(h('li', { class: 'wd-empty' }, 'Nothing has happened yet.'));
    }
  }

  /** The dice tumble on the event clock and land on the rolled faces at the settle. */
  playRoll(dice: [number, number], schedule: EventSchedule, elapsed: number, seed: string): void {
    this.stopRoll();
    const settleAt = phase(schedule, 'tumble')?.end ?? schedule.resolveAt;
    if (schedule.reduced || elapsed >= settleAt) {
      this.showDice(dice);
      return;
    }
    this.rolling = true;
    this.dice.dataset.rolling = 'true';
    const random = seeded(seed);
    const clock = new FxClock(elapsed);
    this.diceClock = clock;
    for (const [i, node] of [this.dieA, this.dieB].entries()) {
      const spin = 540 + Math.floor(random() * 360);
      clock.at(
        node,
        [
          { transform: `translateY(-14px) rotate(0deg)` },
          { transform: `translateY(4px) rotate(${spin * 0.6}deg)`, offset: 0.45 },
          { transform: `translateY(-5px) rotate(${spin * 0.85}deg)`, offset: 0.7 },
          { transform: `translateY(0) rotate(${spin}deg)` },
        ],
        { start: i * 60, duration: settleAt - i * 60, easing: EASE_OUT, fill: 'none' },
      );
    }
    const tick = 90;
    for (let at = Math.ceil(elapsed / tick) * tick; at < settleAt; at += tick) {
      const a = 1 + Math.floor(random() * 6);
      const b = 1 + Math.floor(random() * 6);
      this.diceTimers.push(
        setTimeout(() => {
          setFace(this.dieA, a);
          setFace(this.dieB, b);
          setText(this.diceTotal, '');
        }, at - elapsed),
      );
    }
    this.diceTimers.push(
      setTimeout(() => {
        this.rolling = false;
        delete this.dice.dataset.rolling;
        this.showDice(dice);
      }, settleAt - elapsed),
    );
  }

  stopRoll(): void {
    this.diceClock?.cancel();
    this.diceClock = null;
    for (const timer of this.diceTimers) {
      clearTimeout(timer);
    }
    this.diceTimers = [];
    if (this.rolling) {
      this.rolling = false;
      delete this.dice.dataset.rolling;
    }
  }
}
