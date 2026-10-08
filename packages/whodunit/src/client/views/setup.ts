import { MAX_PLAYERS, MIN_PLAYERS } from '../../rules/constants.js';
import type { SuspectId } from '../../rules/types.js';
import type { SetupView } from '../view-model.js';
import { h, setText } from './dom.js';
import { portraitSvg } from './figures.js';

export interface SetupIntents {
  chooseSuspect(suspect: SuspectId): void;
  ready(): void;
  unready(): void;
  startGame(): void;
}

export interface SetupDeps {
  shareLink: string;
  copy(text: string): Promise<boolean>;
  toast(text: string): void;
}

interface PickNode {
  button: HTMLButtonElement;
  taken: HTMLElement;
}

/**
 * Before the case: the six suspects as a line-up of portraits. Each detective claims one, readies
 * up, and the host opens the case. Below, the invite link for anyone still missing.
 */
export class SetupPanel {
  readonly root: HTMLElement;
  private readonly lineup: HTMLElement;
  private readonly picks = new Map<SuspectId, PickNode>();
  private readonly readyButton: HTMLButtonElement;
  private readonly startButton: HTMLButtonElement;
  private readonly startReason: HTMLElement;
  private readonly count: HTMLElement;
  private readonly linkField: HTMLInputElement;
  private readyState = false;

  constructor(
    private readonly intents: SetupIntents,
    deps: SetupDeps,
  ) {
    this.lineup = h('ul', { class: 'wd-lineup', 'aria-label': 'Choose your suspect' });
    this.readyButton = h('button', { type: 'button', class: 'wd-btn wd-btn-primary', 'data-testid': 'ready' }, 'Ready');
    this.readyButton.addEventListener('click', () => (this.readyState ? intents.unready() : intents.ready()));
    this.startButton = h('button', { type: 'button', class: 'wd-btn wd-btn-primary wd-btn-start', 'data-testid': 'start-game' }, 'Open the case');
    this.startButton.addEventListener('click', () => intents.startGame());
    this.startReason = h('p', { class: 'wd-setup-reason', 'data-testid': 'start-reason', role: 'status' });
    this.count = h('p', { class: 'wd-setup-count' });

    this.linkField = h('input', { class: 'wd-link-field', type: 'text', readonly: true, value: deps.shareLink, 'aria-label': 'Invite link', spellcheck: 'false' });
    this.linkField.addEventListener('focus', () => this.linkField.select());
    const copy = h('button', { type: 'button', class: 'wd-btn' }, 'Copy invite link');
    copy.addEventListener('click', async () => {
      if (await deps.copy(deps.shareLink)) {
        deps.toast('Invite link copied.');
      } else {
        this.linkField.focus();
        deps.toast('Copy the link from the box.');
      }
    });

    this.root = h(
      'section',
      { class: 'wd-setup', 'aria-labelledby': 'wd-setup-title', 'data-testid': 'setup' },
      h(
        'header',
        { class: 'wd-setup-head' },
        h('p', { class: 'wd-kicker' }, 'Starfall Manor · Midnight'),
        h('h2', { class: 'wd-setup-title', id: 'wd-setup-title' }, 'Who will you be tonight?'),
        h(
          'p',
          { class: 'wd-setup-lede' },
          'The master of Starfall Manor lies dead. Six guests, six weapons, nine rooms. Claim a suspect, ready up, and the host opens the case.',
        ),
      ),
      this.lineup,
      h('div', { class: 'wd-setup-actions' }, this.readyButton, this.startButton, this.count),
      this.startReason,
      h('div', { class: 'wd-link-row' }, this.linkField, copy),
    );
  }

  update(view: SetupView): void {
    for (const pick of view.picks) {
      let node = this.picks.get(pick.id);
      if (!node) {
        const taken = h('small', { class: 'wd-pick-taken' });
        const button = h(
          'button',
          { type: 'button', class: 'wd-pick', 'data-testid': `pick-suspect-${pick.id}`, 'data-suspect': pick.id, style: `--wd-accent:${pick.color}` },
          h('span', { class: 'wd-pick-frame' }, portraitSvg(pick.id, 'wd-pick-portrait')),
          h('strong', { class: 'wd-pick-name' }, pick.name),
          h('span', { class: 'wd-pick-role' }, pick.role),
          taken,
        );
        const id = pick.id;
        button.addEventListener('click', () => this.intents.chooseSuspect(id));
        node = { button, taken };
        this.picks.set(pick.id, node);
        this.lineup.append(h('li', {}, button));
      }
      const theirs = Boolean(pick.takenBy) && !pick.mine;
      node.button.dataset.state = pick.mine ? 'mine' : theirs ? 'taken' : 'open';
      node.button.disabled = theirs || (!view.canPick && !pick.mine);
      node.button.setAttribute('aria-pressed', pick.mine ? 'true' : 'false');
      setText(node.taken, pick.mine ? 'You' : theirs ? (pick.takenBy?.displayName ?? 'Taken') : '');
      node.button.setAttribute(
        'aria-label',
        `${pick.name}, ${pick.role}${pick.mine ? ', your suspect' : theirs ? `, played by ${pick.takenBy?.displayName ?? 'another detective'}` : ''}`,
      );
    }
    this.readyState = view.ready;
    this.readyButton.setAttribute('data-testid', view.ready ? 'unready' : 'ready');
    this.readyButton.className = view.ready ? 'wd-btn' : 'wd-btn wd-btn-primary';
    setText(this.readyButton, view.ready ? 'Not ready yet' : 'Ready');
    this.readyButton.disabled = view.ready ? !view.canUnready : !view.canReady;
    this.startButton.hidden = !view.isHost;
    this.startButton.disabled = !view.canStart;
    setText(
      this.startReason,
      view.isHost ? (view.startBlockedReason ?? 'Everyone is ready.') : view.hostName ? `${view.hostName} opens the case once everyone is ready.` : '',
    );
    setText(this.count, `${view.readyCount} of ${view.seatedCount} ready · ${MIN_PLAYERS}–${MAX_PLAYERS} detectives`);
  }
}
