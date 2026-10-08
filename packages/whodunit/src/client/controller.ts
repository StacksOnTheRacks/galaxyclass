import type { CardId, ClientActionName, Destination, ErrorMessage } from '../protocol.js';
import { samePosition } from '../rules/board.js';
import type { RoomId, SuspectId, WeaponId } from '../rules/types.js';
import type { TableModel } from './model.js';
import type { ViewModel } from './view-model.js';

export interface SessionPort {
  readonly seated: boolean;
  chooseSuspect(suspect: SuspectId): void;
  ready(): void;
  unready(): void;
  startGame(): void;
  roll(): void;
  takePassage(): void;
  move(to: Destination): void;
  suggest(suspect: SuspectId, weapon: WeaponId): void;
  showCard(card: CardId): void;
  accuse(suspect: SuspectId, weapon: WeaponId, room: RoomId): void;
  endTurn(): void;
  newGame(): void;
  claimAbandoned(): void;
  leave(): void;
  sit(): void;
}

export interface ControllerUi {
  toast(text: string, tone?: 'info' | 'error'): void;
  announce(text: string): void;
  confirm(text: string): boolean;
  render(): void;
}

const ERROR_MESSAGES: Partial<Record<ErrorMessage['code'], string>> = {
  not_your_turn: "It's not your turn.",
  wrong_phase: 'That cannot be done right now.',
  not_setup: 'The case has already started.',
  not_playing: 'No case is under way.',
  not_finished: 'A new case can be opened once this one is closed.',
  not_host: 'Only the host can do that.',
  suspect_taken: 'Another detective already plays that suspect.',
  invalid_suspect: 'That is not one of the suspects.',
  invalid_weapon: 'That is not one of the weapons.',
  invalid_room: 'That is not a room in the manor.',
  invalid_card: 'That card is not in your hand.',
  cannot_show: 'That card does not match the suggestion.',
  not_refuter: 'It is not your card to show.',
  no_suspect: 'Choose a suspect first.',
  not_enough_players: 'A case needs at least three detectives.',
  players_not_ready: 'Everyone needs to choose a suspect and ready up.',
  no_passage: 'There is no secret passage here.',
  invalid_destination: 'That is not a square on the board.',
  unreachable: 'That is out of reach with this roll.',
  cannot_suggest: 'You can only suggest in a room you just entered.',
  eliminated: 'You are out of the running for this case.',
  no_one_away: 'Everyone is still at the table.',
  away_too_recent: 'A detective can be cleared once they have been away a while.',
  table_full: 'All six seats are taken.',
  table_locked: 'A case is under way, so seats are locked.',
  seat_occupied: 'That seat is taken.',
  sign_in_required: 'Sign in to Galaxy Class to take a seat.',
  invalid_access_token: "Your sign-in couldn't be verified. Refresh to try again.",
  identity_unavailable: 'Sign-in checks are unavailable right now. Try again shortly.',
  version_conflict: 'The table was busy. Try again.',
  not_seated: "You're not seated.",
  invalid_seat_token: "You're not seated.",
  seat_not_yours: 'That seat belongs to another detective.',
  invalid_seat: 'That seat is not available.',
};

/** Refusals the detective did not cause: the turn lock is the animation's, and is never worth a toast. */
const SILENT = new Set<ErrorMessage['code']>(['turn_not_open', 'already_seated', 'unsupported_action']);

export function describeError(error: ErrorMessage): string | null {
  if (SILENT.has(error.code)) {
    return null;
  }
  return ERROR_MESSAGES[error.code] ?? 'Something went wrong. Try again.';
}

/** Detective intents → session messages, guarded by what the presented state allows. */
export class TableController {
  constructor(
    private readonly model: TableModel,
    private readonly session: SessionPort,
    private readonly ui: ControllerUi,
    private readonly deps: { vm(): ViewModel },
  ) {}

  /** Sends at most one action at a time; its button stays disabled until the server answers. */
  private send(action: ClientActionName, allowed: boolean, run: () => void): void {
    if (!allowed) {
      const reason = this.deps.vm().blockedReason;
      if (reason) {
        this.ui.announce(reason);
      }
      return;
    }
    if (this.model.pending) {
      return;
    }
    this.model.pending = action;
    run();
    this.ui.render();
  }

  chooseSuspect(suspect: SuspectId): void {
    const vm = this.deps.vm();
    const pick = vm.setup.picks.find((p) => p.id === suspect);
    if (!vm.setup.canPick || !pick || (pick.takenBy && !pick.mine) || pick.mine) {
      return;
    }
    this.session.chooseSuspect(suspect);
  }

  ready(): void {
    if (this.deps.vm().setup.canReady) {
      this.session.ready();
    }
  }

  unready(): void {
    if (this.deps.vm().setup.canUnready) {
      this.session.unready();
    }
  }

  startGame(): void {
    const vm = this.deps.vm();
    if (!vm.setup.canStart) {
      if (vm.setup.startBlockedReason) {
        this.ui.announce(vm.setup.startBlockedReason);
      }
      return;
    }
    this.send('start_game', true, () => this.session.startGame());
  }

  roll(): void {
    this.send('roll', this.deps.vm().canRoll, () => this.session.roll());
  }

  takePassage(): void {
    this.send('take_passage', this.deps.vm().canPassage, () => this.session.takePassage());
  }

  move(to: Destination): void {
    const vm = this.deps.vm();
    const reachable = vm.destinations.some((reach) => samePosition(reach.destination, to));
    if (vm.canMove && !reachable) {
      this.ui.announce('That is out of reach with this roll.');
      return;
    }
    this.send('move', vm.canMove, () => this.session.move(to));
  }

  suggest(suspect: SuspectId, weapon: WeaponId): void {
    this.send('suggest', this.deps.vm().canSuggest, () => this.session.suggest(suspect, weapon));
  }

  showCard(card: CardId): void {
    const vm = this.deps.vm();
    this.send('show_card', vm.canRefute && Boolean(vm.refute?.matching.includes(card)), () => this.session.showCard(card));
  }

  accuse(suspect: SuspectId, weapon: WeaponId, room: RoomId): void {
    this.send('accuse', this.deps.vm().canAccuse, () => this.session.accuse(suspect, weapon, room));
  }

  endTurn(): void {
    this.send('end_turn', this.deps.vm().canEndTurn, () => this.session.endTurn());
  }

  newGame(): void {
    this.send('new_game', this.deps.vm().canNewGame, () => this.session.newGame());
  }

  claimAbandoned(): void {
    const status = this.model.presented?.status;
    const warning =
      status === 'playing'
        ? 'Clear the detectives who have been away? Their cards are laid face up and they leave the case.'
        : 'Clear the detectives who have been away from the table?';
    if (this.ui.confirm(warning)) {
      this.session.claimAbandoned();
    }
  }

  leave(): void {
    const status = this.model.presented?.status;
    const warning =
      status === 'playing'
        ? 'Leave the table? You drop out of this case and your cards are laid face up for everyone.'
        : 'Leave your seat at this table?';
    if (this.ui.confirm(warning)) {
      this.session.leave();
    }
  }

  onError(error: ErrorMessage): void {
    if (this.model.pending) {
      this.model.pending = null;
      this.ui.render();
    }
    const text = describeError(error);
    if (text) {
      this.ui.toast(text, 'error');
    }
  }
}
