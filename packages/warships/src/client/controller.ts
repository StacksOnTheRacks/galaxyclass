import type { ErrorMessage } from '../protocol.js';
import type { Coord, Fleet, FleetError } from '../rules/types.js';
import { saveLastFleet } from './draft.js';
import type { TableModel } from './model.js';
import type { ViewModel } from './view-model.js';

export interface SessionPort {
  readonly seated: boolean;
  placeFleet(fleet: Fleet): void;
  unready(): void;
  fire(target: Coord): void;
  forfeit(): void;
  rematch(): void;
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

const FLEET_MESSAGES: Record<FleetError, string> = {
  wrong_ships: 'Your fleet needs exactly one of each ship.',
  invalid_shape: 'That fleet could not be read. Try placing it again.',
  out_of_bounds: 'A ship runs off the board.',
  overlap: 'Two ships overlap.',
};

const ERROR_MESSAGES: Partial<Record<ErrorMessage['code'], string>> = {
  not_your_turn: "It's not your turn.",
  already_fired: 'You have already fired at that cell.',
  invalid_target: 'That is not a cell on the board.',
  not_in_battle: 'The battle is not under way.',
  not_placing: 'Fleets are locked in: the battle has started.',
  not_finished: 'A rematch can be asked for once this battle ends.',
  no_opponent: 'There is no opponent at the table.',
  opponent_not_away: 'Your opponent is back at the table.',
  away_too_recent: 'You can claim the win once your opponent has been away for 10 minutes.',
  table_full: 'Both seats are taken.',
  table_locked: 'A battle is under way, so seats are locked.',
  seat_occupied: 'That seat is taken.',
  sign_in_required: 'Sign in to Galaxy Class to take a seat.',
  invalid_access_token: "Your sign-in couldn't be verified. Refresh to try again.",
  identity_unavailable: 'Sign-in checks are unavailable right now. Try again shortly.',
  version_conflict: 'The table was busy. Try again.',
  not_seated: "You're not seated.",
  invalid_seat_token: "You're not seated.",
  seat_not_yours: 'That seat belongs to another captain.',
  invalid_seat: 'That seat is not available.',
};

/** Refusals the captain did not cause: the turn lock is the animation's, and is never worth a toast. */
const SILENT = new Set<ErrorMessage['code']>(['turn_not_open', 'already_seated', 'unsupported_action']);

export function describeError(error: ErrorMessage): string | null {
  if (SILENT.has(error.code)) {
    return null;
  }
  if (error.code === 'invalid_fleet') {
    return error.reason ? FLEET_MESSAGES[error.reason] : 'That fleet is not valid.';
  }
  return ERROR_MESSAGES[error.code] ?? 'Something went wrong. Try again.';
}

/** Captain intents → session messages, guarded by what the presented state allows. */
export class TableController {
  constructor(
    private readonly model: TableModel,
    private readonly session: SessionPort,
    private readonly ui: ControllerUi,
    private readonly deps: { storage: Pick<Storage, 'setItem'> | null; vm(): ViewModel },
  ) {}

  fire(coord: Coord): void {
    const vm = this.deps.vm();
    if (!vm.canFire) {
      if (vm.fireBlockedReason) {
        this.ui.announce(vm.fireBlockedReason);
      }
      return;
    }
    if (vm.target.cells[coord.row]?.[coord.col]?.mark || this.model.pendingTarget) {
      return;
    }
    this.model.pendingTarget = { row: coord.row, col: coord.col };
    this.session.fire(coord);
    this.ui.render();
  }

  ready(fleet: Fleet): void {
    saveLastFleet(this.deps.storage, this.model.tableId, fleet);
    this.session.placeFleet(fleet);
  }

  unready(): void {
    this.session.unready();
  }

  forfeit(): void {
    if (this.ui.confirm('Concede this battle? Your opponent wins.')) {
      this.session.forfeit();
    }
  }

  claimAbandoned(): void {
    this.session.claimAbandoned();
  }

  leave(): void {
    const status = this.model.presented?.status;
    const warning =
      status === 'battle'
        ? 'Leave the table? Leaving now concedes the battle.'
        : status === 'placing'
          ? 'Leave the table? Placement ends for both captains.'
          : 'Leave your seat at this table?';
    if (this.ui.confirm(warning)) {
      this.session.leave();
    }
  }

  rematch(): void {
    this.session.rematch();
  }

  onError(error: ErrorMessage): void {
    if (this.model.pendingTarget) {
      this.model.pendingTarget = null;
      this.ui.render();
    }
    const text = describeError(error);
    if (text) {
      this.ui.toast(text, 'error');
    }
  }
}
