import { avatarUrl, isAvatarId } from './avatars.js';

/**
 * The bar every game's table list opens with: a way back to the Galaxy Class game library
 * and who is signed in. Plain DOM so any game client can mount it; styles ship in
 * `game-header.css` and fonts are served by the studio site at `/fonts/`.
 */

/** The studio site's rooms list (packages/www ROOMS_HREF). */
export const GALAXY_CLASS_LIBRARY_PATH = '/';
export const GALAXY_CLASS_ACCOUNT_PATH = '/account';
export const GALAXY_CLASS_SIGN_IN_PATH = '/sign-in';
export const GALAXY_CLASS_SIGN_UP_PATH = '/sign-up';

/** Display-only profile; never proof of identity. */
export interface GameHeaderAccount {
  gamerTag: string | null;
  avatarId: number | null;
}

export interface GameHeaderOptions {
  account: GameHeaderAccount | null;
  /** Same-origin path the studio's sign-in returns to, e.g. `/scribble`. */
  returnTo: string;
  /** Riffle seats guests; members-only games ask a signed-out visitor to sign in instead. */
  guests: boolean;
  /** Empty when the game is served from galaxyclass.app itself. */
  origin?: string;
  document?: Document;
}

export type GameHeaderState = 'signed-in' | 'guest' | 'signed-out';

const SVG_NS = 'http://www.w3.org/2000/svg';

function trimOrigin(origin: string | undefined): string {
  return (origin ?? '').replace(/\/$/, '');
}

export function galaxyClassLibraryUrl(origin?: string): string {
  return `${trimOrigin(origin)}${GALAXY_CLASS_LIBRARY_PATH}`;
}

export function galaxyClassAccountUrl(origin?: string): string {
  return `${trimOrigin(origin)}${GALAXY_CLASS_ACCOUNT_PATH}`;
}

function withNext(path: string, origin: string | undefined, returnTo: string): string {
  return `${trimOrigin(origin)}${path}?next=${encodeURIComponent(returnTo)}`;
}

export function galaxyClassSignInUrl(returnTo: string, origin?: string): string {
  return withNext(GALAXY_CLASS_SIGN_IN_PATH, origin, returnTo);
}

export function galaxyClassSignUpUrl(returnTo: string, origin?: string): string {
  return withNext(GALAXY_CLASS_SIGN_UP_PATH, origin, returnTo);
}

export function gameHeaderState(account: GameHeaderAccount | null, guests: boolean): GameHeaderState {
  if (account) {
    return 'signed-in';
  }
  return guests ? 'guest' : 'signed-out';
}

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function backArrow(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'gc-game-header-arrow');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M15 5l-7 7 7 7');
  svg.append(path);
  return svg;
}

function renderBack(doc: Document, origin: string | undefined): HTMLAnchorElement {
  const link = make(doc, 'a', 'gc-game-header-back');
  link.href = galaxyClassLibraryUrl(origin);
  link.setAttribute('aria-label', 'Back to the Galaxy Class game library');
  const mark = make(doc, 'span', 'gc-game-header-mark', 'GC');
  mark.setAttribute('aria-hidden', 'true');
  const text = make(doc, 'span', 'gc-game-header-back-text');
  text.setAttribute('aria-hidden', 'true');
  text.append(make(doc, 'span', 'gc-game-header-kicker', 'Galaxy Class'), make(doc, 'span', 'gc-game-header-back-label', 'Game library'));
  link.append(backArrow(doc), mark, text);
  return link;
}

function renderAvatar(doc: Document, account: GameHeaderAccount | null, origin: string | undefined): HTMLElement {
  if (account && isAvatarId(account.avatarId)) {
    const image = make(doc, 'img', 'gc-game-header-avatar');
    image.src = avatarUrl(account.avatarId, trimOrigin(origin));
    image.alt = '';
    image.width = 32;
    image.height = 32;
    image.decoding = 'async';
    return image;
  }
  const initial = account ? (account.gamerTag?.charAt(0).toUpperCase() ?? 'P') : 'G';
  const fallback = make(doc, 'span', 'gc-game-header-avatar gc-game-header-avatar-initial', initial);
  fallback.setAttribute('aria-hidden', 'true');
  return fallback;
}

function renderPlayer(doc: Document, account: GameHeaderAccount | null, origin: string | undefined): HTMLElement {
  const name = account ? (account.gamerTag ?? 'Set your gamer tag') : 'Guest';
  const label = make(doc, 'span', 'gc-game-header-player-label');
  label.append(make(doc, 'span', 'gc-game-header-kicker', 'Playing as'), make(doc, 'span', 'gc-game-header-player-name', name));
  let player: HTMLElement;
  if (account) {
    const link = make(doc, 'a', 'gc-game-header-player');
    link.href = galaxyClassAccountUrl(origin);
    if (!account.gamerTag) {
      link.dataset.needsTag = 'true';
    }
    player = link;
  } else {
    player = make(doc, 'span', 'gc-game-header-player');
  }
  player.append(renderAvatar(doc, account, origin), label);
  return player;
}

function renderSignIn(doc: Document, options: GameHeaderOptions): HTMLElement {
  const actions = make(doc, 'div', 'gc-game-header-actions');
  const signIn = make(doc, 'a', 'gc-game-header-button gc-game-header-button-ghost', 'Sign in');
  signIn.href = galaxyClassSignInUrl(options.returnTo, options.origin);
  actions.append(signIn);
  if (!options.guests) {
    const signUp = make(doc, 'a', 'gc-game-header-button gc-game-header-button-primary', 'Sign up');
    signUp.href = galaxyClassSignUpUrl(options.returnTo, options.origin);
    actions.append(signUp);
  }
  return actions;
}

export function renderGameHeader(options: GameHeaderOptions): HTMLElement {
  const doc = options.document ?? document;
  const state = gameHeaderState(options.account, options.guests);
  const header = make(doc, 'header', 'gc-game-header');
  header.dataset.account = state;

  const nav = make(doc, 'nav', 'gc-game-header-nav');
  nav.setAttribute('aria-label', 'Galaxy Class');
  nav.append(renderBack(doc, options.origin));

  const account = make(doc, 'div', 'gc-game-header-account');
  if (state !== 'signed-out') {
    account.append(renderPlayer(doc, options.account, options.origin));
  }
  if (state !== 'signed-in') {
    account.append(renderSignIn(doc, options));
  }

  header.append(nav, account);
  return header;
}
