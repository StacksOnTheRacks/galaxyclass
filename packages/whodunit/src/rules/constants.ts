import type { RoomId, SuspectId, WeaponId } from './types.js';

/** Up to six detectives at a table; a case needs at least three. */
export const SEAT_IDS = ['1', '2', '3', '4', '5', '6'] as const;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 3;

export const SUSPECT_IDS = ['vesper', 'finch', 'juniper', 'rook', 'duarte', 'thorne'] as const;
export const WEAPON_IDS = ['telescope', 'vial', 'saber', 'raygun', 'trophy', 'bust'] as const;
export const ROOM_IDS = [
  'observatory',
  'gallery',
  'greenhouse',
  'laboratory',
  'music',
  'theater',
  'cellar',
  'foyer',
  'parlor',
] as const;

export interface SuspectInfo {
  id: SuspectId;
  /** Short name for tokens, cards, and the log. */
  name: string;
  /** One line of character, for the setup screen. */
  role: string;
  /** Token and card accent. */
  color: string;
}

export interface WeaponInfo {
  id: WeaponId;
  name: string;
}

export interface RoomInfo {
  id: RoomId;
  name: string;
}

/** The guests of Starfall Manor. Original characters; no board-game names. */
export const SUSPECTS: readonly SuspectInfo[] = [
  { id: 'vesper', name: 'Countess Vesper', role: 'The hostess, all pearls and secrets', color: '#ff4fa3' },
  { id: 'finch', name: 'Orson Finch', role: 'An astronomer who never looks down', color: '#ffb23d' },
  { id: 'juniper', name: 'Juniper Lark', role: 'A jazz singer with a perfect memory', color: '#3dd6c4' },
  { id: 'rook', name: 'Captain Rook', role: 'A retired star pilot with old debts', color: '#4a8cff' },
  { id: 'duarte', name: 'Chef Duarte', role: 'The cook, sharp of knife and tongue', color: '#ff6a3d' },
  { id: 'thorne', name: 'Felix Thorne', role: 'An inventor of dangerous toys', color: '#a77bff' },
];

export const WEAPONS: readonly WeaponInfo[] = [
  { id: 'telescope', name: 'Brass Telescope' },
  { id: 'vial', name: 'Poison Vial' },
  { id: 'saber', name: 'Ceremonial Saber' },
  { id: 'raygun', name: 'Antique Ray Gun' },
  { id: 'trophy', name: 'Golden Trophy' },
  { id: 'bust', name: 'Marble Bust' },
];

export const ROOMS: readonly RoomInfo[] = [
  { id: 'observatory', name: 'Observatory' },
  { id: 'gallery', name: 'Portrait Gallery' },
  { id: 'greenhouse', name: 'Greenhouse' },
  { id: 'laboratory', name: 'Laboratory' },
  { id: 'music', name: 'Music Room' },
  { id: 'theater', name: 'Little Theater' },
  { id: 'cellar', name: 'Wine Cellar' },
  { id: 'foyer', name: 'Grand Foyer' },
  { id: 'parlor', name: 'Parlor' },
];

export const SUSPECT_NAME = Object.fromEntries(SUSPECTS.map((s) => [s.id, s.name])) as Readonly<Record<SuspectId, string>>;
export const SUSPECT_COLOR = Object.fromEntries(SUSPECTS.map((s) => [s.id, s.color])) as Readonly<Record<SuspectId, string>>;
export const WEAPON_NAME = Object.fromEntries(WEAPONS.map((w) => [w.id, w.name])) as Readonly<Record<WeaponId, string>>;
export const ROOM_NAME = Object.fromEntries(ROOMS.map((r) => [r.id, r.name])) as Readonly<Record<RoomId, string>>;

/** 6 suspects + 6 weapons + 9 rooms; three go in the case file, the other 18 are dealt. */
export const CARD_COUNT = SUSPECT_IDS.length + WEAPON_IDS.length + ROOM_IDS.length;

/**
 * Animation budget per event. The server stamps `animationMs` on every event and refuses the next
 * action until it has played (less the grace), so every detective sees the same thing happen first.
 */
export const GAME_START_MS = 2400;
export const ROLL_MS = 1400;
/** A walk: the camera eases in, the token steps square by square, then settles. */
export const MOVE_LEAD_MS = 450;
export const MOVE_STEP_MS = 170;
export const MOVE_SETTLE_MS = 450;
export const PASSAGE_MS = 1700;
/** The camera flies to the room and the named suspect and weapon are pulled in. */
export const SUGGEST_MS = 2600;
/** Each detective who cannot refute gets a beat before the next is asked. */
export const PASS_BEAT_MS = 500;
export const REFUTE_MS = 1400;
export const UNREFUTED_MS = 1400;
export const ACCUSE_MS = 3600;
export const TURN_PASS_MS = 700;
export const DEPART_MS = 1400;
export const GAME_OVER_MS = 1800;
/** The next action opens this much before the animation ends, to absorb delivery jitter. */
export const TURN_LOCK_GRACE_MS = 300;

/** A detective away this long mid-case can be removed by any other (their cards are laid face up). */
export const AWAY_ABANDON_AFTER_MS = 10 * 60 * 1000;
/** Before the case starts, an away seat can be cleared much sooner so it does not hold up the table. */
export const SETUP_AWAY_AFTER_MS = 60 * 1000;

/** Tables a member may host at once. */
export const MAX_OWNED_TABLES = 20;
/** Newest first; older memberships stay stored but drop off the list. */
export const MAX_LISTED_TABLES = 50;
export const MAX_TABLE_NAME_LENGTH = 40;
/** Inbound frames larger than this are refused before parsing. */
export const MAX_MESSAGE_BYTES = 4096;
/** The case log keeps at most this many events; a real game uses far fewer. */
export const MAX_LOG_EVENTS = 600;
