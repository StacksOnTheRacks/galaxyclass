// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLabSeatSlotDimensions,
  getLabShellDimensions,
  renderLabHarness,
} from '../src/client/lab/render.js';
import { LAB_STATE_ANNOUNCEMENTS } from '../src/client/lab/states.js';

const projectRoot = join(import.meta.dirname, '..');

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'lab-app';
  document.body.replaceChildren(root);
  return root;
}

describe('lab page UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();

    const css = readFileSync(join(projectRoot, 'public', 'lab.css'), 'utf8');
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  });

  it('renders idle harness at 1200×720 with 360×640 seat slots', () => {
    const root = mountRoot();
    renderLabHarness(root, { state: 'lab-idle' });

    const shell = getLabShellDimensions(root);
    expect(shell.width).toBe(1200);
    expect(shell.height).toBe(720);

    const seat1 = getLabSeatSlotDimensions(root, 0);
    const seat2 = getLabSeatSlotDimensions(root, 1);
    expect(seat1.width).toBe(360);
    expect(seat1.height).toBe(640);
    expect(seat2.width).toBe(360);
    expect(seat2.height).toBe(640);
  });

  it('shows operator harness copy and labeled seat columns in idle state', () => {
    const root = mountRoot();
    renderLabHarness(root, { state: 'lab-idle' });

    expect(root.querySelector('.lab-title')?.textContent).toBe('Play lab');
    expect(root.querySelector('.lab-subtitle')?.textContent).toContain('Operator harness');
    expect(root.textContent).toContain('Seat 1');
    expect(root.textContent).toContain('Seat 2');
    expect(root.querySelector('#lab-start-session')?.textContent).toBe('Start session');
    expect(root.querySelector('#lab-deal')?.textContent).toBe('Deal');
    expect((root.querySelector('#lab-deal') as HTMLButtonElement).disabled).toBe(true);
  });

  it('exposes programmatic iframe names matching visible seat labels', () => {
    const root = mountRoot();
    renderLabHarness(root, { state: 'lab-two-seats', dealEnabled: true });

    const iframes = root.querySelectorAll('.lab-seat-iframe');
    expect(iframes).toHaveLength(2);
    expect(iframes.item(0).getAttribute('title')).toBe('Seat 1');
    expect(iframes.item(0).getAttribute('aria-label')).toBe('Seat 1 play surface');
    expect(iframes.item(1).getAttribute('title')).toBe('Seat 2');
    expect(iframes.item(1).getAttribute('aria-label')).toBe('Seat 2 play surface');
  });

  it('announces state changes through a live region', () => {
    const root = mountRoot();
    renderLabHarness(root, { state: 'lab-starting', controlsDisabled: true });

    const liveRegion = root.querySelector('.lab-live-region');
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.textContent).toBe(LAB_STATE_ANNOUNCEMENTS['lab-starting']);
  });

  it('renders harness error distinct from iframe embed-error', () => {
    const root = mountRoot();
    renderLabHarness(root, {
      state: 'lab-harness-error',
      errorMessage: 'Lab session could not be started.',
    });

    expect(root.dataset.state).toBe('lab-harness-error');
    expect(root.querySelector('.lab-harness-error')?.getAttribute('role')).toBe('alert');
    expect(root.querySelector('.surface-embed-error')).toBeNull();
  });

  it('supports keyboard focus on harness controls with visible focus styles', () => {
    const root = mountRoot();
    renderLabHarness(root, { state: 'lab-idle' });

    const css = readFileSync(join(projectRoot, 'public', 'lab.css'), 'utf8');
    expect(css).toMatch(/:focus-visible/);

    const startButton = root.querySelector('#lab-start-session') as HTMLButtonElement;
    startButton.focus();
    expect(document.activeElement).toBe(startButton);
  });

  it('respects prefers-reduced-motion for lab chrome', () => {
    const css = readFileSync(join(projectRoot, 'public', 'lab.css'), 'utf8');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('does not expose secrets in idle or error chrome text', () => {
    const root = mountRoot();
    renderLabHarness(root, { state: 'lab-idle' });
    expect(root.textContent).not.toMatch(/TURNUR_SDK_KEY|RIFFLE_HOST_API_KEY|test-host-key-fixture/);

    renderLabHarness(root, {
      state: 'lab-harness-error',
      errorMessage: 'Lab session could not be started.',
    });
    expect(root.textContent).not.toMatch(/capability|bootstrap|#bt=/i);
  });
});
