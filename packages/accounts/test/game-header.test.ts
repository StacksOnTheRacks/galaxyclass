// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  galaxyClassSignInUrl,
  gameHeaderState,
  renderGameHeader,
} from '../src/game-header.js';

describe('game header', () => {
  it('links back to the Galaxy Class game library', () => {
    const header = renderGameHeader({ account: null, guests: true, returnTo: '/riffle' });
    const back = header.querySelector<HTMLAnchorElement>('nav[aria-label="Galaxy Class"] a');
    expect(back?.getAttribute('href')).toBe('/');
    expect(back?.getAttribute('aria-label')).toBe('Back to the Galaxy Class game library');
    expect(back?.textContent).toContain('Game library');
  });

  it('points at the live site when the game runs on another origin', () => {
    const header = renderGameHeader({
      account: { gamerTag: 'Maya_P', avatarId: 42 },
      guests: true,
      returnTo: '/riffle',
      origin: 'https://galaxyclass.app/',
    });
    expect(header.querySelector('.gc-game-header-back')?.getAttribute('href')).toBe('https://galaxyclass.app/');
    expect(header.querySelector('.gc-game-header-player')?.getAttribute('href')).toBe('https://galaxyclass.app/account');
    expect(header.querySelector('img.gc-game-header-avatar')?.getAttribute('src')).toBe(
      'https://galaxyclass.app/avatars/42.webp',
    );
  });

  it('shows the signed-in gamer tag and avatar, linking to the account', () => {
    const header = renderGameHeader({ account: { gamerTag: 'Maya_P', avatarId: 42 }, guests: false, returnTo: '/scribble' });
    expect(header.dataset.account).toBe('signed-in');
    expect(header.querySelector('.gc-game-header-player-name')?.textContent).toBe('Maya_P');
    const avatar = header.querySelector('img.gc-game-header-avatar');
    expect(avatar?.getAttribute('src')).toBe('/avatars/42.webp');
    expect(avatar?.getAttribute('alt')).toBe('');
    expect(header.textContent).not.toContain('Sign in');
  });

  it('asks a signed-in player without a gamer tag to set one', () => {
    const header = renderGameHeader({ account: { gamerTag: null, avatarId: null }, guests: true, returnTo: '/riffle' });
    const player = header.querySelector<HTMLAnchorElement>('a.gc-game-header-player');
    expect(player?.dataset.needsTag).toBe('true');
    expect(player?.textContent).toContain('Set your gamer tag');
    expect(header.querySelector('.gc-game-header-avatar')?.textContent).toBe('P');
  });

  it('shows a guest with a way to sign in when the game allows guests', () => {
    const header = renderGameHeader({ account: null, guests: true, returnTo: '/riffle' });
    expect(header.dataset.account).toBe('guest');
    expect(header.querySelector('.gc-game-header-player-name')?.textContent).toBe('Guest');
    expect(header.querySelector('.gc-game-header-player')?.tagName).toBe('SPAN');
    const links = Array.from(header.querySelectorAll<HTMLAnchorElement>('.gc-game-header-button'), (a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([['Sign in', '/sign-in?next=%2Friffle']]);
  });

  it('shows sign in and sign up, and no guest chip, for a members-only game', () => {
    const header = renderGameHeader({ account: null, guests: false, returnTo: '/scribble/abc' });
    expect(header.dataset.account).toBe('signed-out');
    expect(header.querySelector('.gc-game-header-player')).toBeNull();
    const links = Array.from(header.querySelectorAll<HTMLAnchorElement>('.gc-game-header-button'), (a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Sign in', '/sign-in?next=%2Fscribble%2Fabc'],
      ['Sign up', '/sign-up?next=%2Fscribble%2Fabc'],
    ]);
  });

  it('derives its state from the account and the guest policy', () => {
    expect(gameHeaderState({ gamerTag: 'x', avatarId: 1 }, false)).toBe('signed-in');
    expect(gameHeaderState(null, true)).toBe('guest');
    expect(gameHeaderState(null, false)).toBe('signed-out');
    expect(galaxyClassSignInUrl('/scribble', 'https://galaxyclass.app')).toBe(
      'https://galaxyclass.app/sign-in?next=%2Fscribble',
    );
  });
});
