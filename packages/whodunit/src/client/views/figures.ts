import { ROOM_LAYOUT } from '../../rules/board.js';
import { SUSPECT_COLOR } from '../../rules/constants.js';
import type { CardId, RoomId, SuspectId, WeaponId } from '../../rules/types.js';
import { portraitMarkup, roomMarkup, weaponMarkup } from '../art/index.js';
import { cardKind, cardName, isRoom, isSuspect } from '../cards.js';
import { SVG_NS } from '../fx/animate.js';
import { h } from './dom.js';

/** An inline SVG holding one of the art module's static drawings. */
export function artSvg(markup: string, viewBox: string, className: string, preserve = 'xMidYMid meet'): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('class', className);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  node.setAttribute('preserveAspectRatio', preserve);
  node.innerHTML = markup;
  return node;
}

export function portraitSvg(suspect: SuspectId, className = 'wd-portrait'): SVGSVGElement {
  return artSvg(portraitMarkup(suspect), '0 0 100 100', className);
}

export function weaponSvg(weapon: WeaponId, className = 'wd-weapon-icon'): SVGSVGElement {
  return artSvg(weaponMarkup(weapon), '0 0 64 64', className);
}

export function roomSvg(room: RoomId, className = 'wd-room-art'): SVGSVGElement {
  const { w, h: rows } = ROOM_LAYOUT[room].rect;
  return artSvg(roomMarkup(room, w, rows), `0 0 ${w * 10} ${rows * 10}`, className, 'xMidYMid slice');
}

export function cardArt(card: CardId): SVGSVGElement {
  if (isSuspect(card)) {
    return portraitSvg(card, 'wd-card-art');
  }
  return isRoom(card) ? roomSvg(card, 'wd-card-art') : weaponSvg(card as WeaponId, 'wd-card-art');
}

const KIND_LABEL = { suspect: 'Suspect', weapon: 'Weapon', room: 'Room' } as const;

/** An illustrated card face: art, kind, and name. A suspect card wears that suspect's colour. */
export function cardFace(card: CardId, tag: 'div' | 'span' = 'div'): HTMLElement {
  const kind = cardKind(card);
  return h(
    tag,
    {
      class: 'wd-card',
      'data-kind': kind,
      'data-card': card,
      style: isSuspect(card) ? `--wd-accent:${SUSPECT_COLOR[card]}` : undefined,
    },
    h('span', { class: 'wd-card-frame' }, cardArt(card)),
    h('span', { class: 'wd-card-kind' }, KIND_LABEL[kind]),
    h('strong', { class: 'wd-card-name' }, cardName(card)),
  );
}

/** A round portrait chip with the suspect's colour rim, for seats and the log. */
export function suspectChip(suspect: SuspectId, className = 'wd-chip'): HTMLElement {
  return h('span', { class: className, style: `--wd-accent:${SUSPECT_COLOR[suspect]}`, 'data-suspect': suspect }, portraitSvg(suspect));
}
