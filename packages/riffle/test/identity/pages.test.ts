// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  renderEntryPage,
  renderSignInPage,
  renderSignUpPage,
  renderSignedInPage,
} from '../../src/client/identity/render.js';

const projectRoot = join(import.meta.dirname, '../..');

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.id = 'app';
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe('identity pages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();
    const css = readFileSync(join(projectRoot, 'src/client/identity.css'), 'utf8');
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  });

  it('entry exposes three text-distinguishable paths', () => {
    const root = mount(renderEntryPage());
    expect(root.textContent).toContain('Sign in');
    expect(root.textContent).toContain('Create account');
    expect(root.textContent).toContain('Play without account');
    expect(root.textContent).not.toContain('Guest');
    expect(root.textContent).not.toContain('Continue');
    expect(root.textContent).not.toContain('Skip');
  });

  it('sign-in renders labeled fields and validation copy', () => {
    const root = mount(
      renderSignInPage({
        emailError: 'Enter a valid email address.',
        formError: 'Incorrect email or password.',
        submitting: true,
      }),
    );

    expect(root.querySelector('label[for="sign-in-email"]')?.textContent).toBe('Email');
    expect(root.querySelector('label[for="sign-in-password"]')?.textContent).toBe('Password');
    expect(root.textContent).toContain('Enter a valid email address.');
    expect(root.textContent).toContain('Incorrect email or password.');
    expect(root.querySelector('button[type="submit"]')?.textContent).toBe('Signing in…');
  });

  it('sign-up renders password mismatch and create-account submit copy', () => {
    const root = mount(
      renderSignUpPage({
        passwordError: 'Passwords must match.',
        confirmPasswordError: 'Passwords must match.',
        formError: 'Could not create account. Try again.',
        submitting: true,
      }),
    );

    expect(root.querySelector('label[for="sign-up-email"]')?.textContent).toBe('Email');
    expect(root.querySelector('label[for="sign-up-password"]')?.textContent).toBe('Password');
    expect(root.querySelector('label[for="sign-up-confirm-password"]')?.textContent).toBe(
      'Confirm password',
    );
    expect(root.textContent).toContain('Passwords must match.');
    expect(root.textContent).toContain('Could not create account. Try again.');
    expect(root.querySelector('button[type="submit"]')?.textContent).toBe('Creating account…');
    expect(root.textContent).not.toContain('Signing in…');
  });

  it('signed-in chrome can show account email and sign out', () => {
    const root = mount(renderSignedInPage({ kind: 'account', email: 'player@example.com' }));
    expect(root.textContent).toContain('player@example.com');
    expect(root.querySelector('#identity-sign-out')?.textContent).toBe('Sign out');
  });

  it('anonymous signed-in chrome does not invent a display name', () => {
    const root = mount(renderSignedInPage({ kind: 'anonymous' }));
    expect(root.querySelector('.identity-signed-in-email')).toBeNull();
  });

  it('play surface bundle does not render identity login chrome', () => {
    const playHtml = readFileSync(join(projectRoot, 'public/play.html'), 'utf8');
    const playJs = readFileSync(join(projectRoot, 'public/play.js'), 'utf8');
    const combined = `${playHtml}\n${playJs}`;

    expect(combined).not.toContain('Play without account');
    expect(combined).not.toContain('Create account');
    expect(combined).not.toMatch(/>\s*Sign in\s*</);
  });

  it('desktop shell is 960x640', () => {
    const root = mount(renderEntryPage());
    const shell = root.querySelector('.identity-shell') as HTMLElement;
    const styles = getComputedStyle(shell);
    expect(styles.width).toBe('960px');
    expect(styles.height).toBe('640px');
  });
});
