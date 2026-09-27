import { DISPLAY_NAME_ERROR_MESSAGE } from '../../shared/display-name.js';

export interface DisplayNameEditContext {
  matchId: string;
  initialValue: string;
  onSave: (displayName: string) => Promise<{ ok: true } | { ok: false; validationError?: boolean }>;
  onDismiss: () => void;
}

export function renderDisplayNameEdit(root: HTMLElement, context: DisplayNameEditContext): void {
  const overlay = document.createElement('div');
  overlay.className = 'display-name-overlay';
  overlay.dataset.surface = 'display-name-edit';

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'display-name-backdrop';
  backdrop.setAttribute('aria-label', 'Dismiss edit display name');
  backdrop.addEventListener('click', () => {
    context.onDismiss();
  });

  const dialog = document.createElement('div');
  dialog.className = 'display-name-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'display-name-title');

  const title = document.createElement('h2');
  title.id = 'display-name-title';
  title.className = 'display-name-title';
  title.textContent = 'Edit display name';

  const helper = document.createElement('p');
  helper.className = 'display-name-helper';
  helper.textContent = 'Shown to other players at the table';

  const form = document.createElement('form');
  form.className = 'display-name-form';
  form.noValidate = true;

  const fieldId = 'display-name-input';
  const label = document.createElement('label');
  label.className = 'display-name-label';
  label.setAttribute('for', fieldId);
  label.textContent = 'Display name';

  const input = document.createElement('input');
  input.id = fieldId;
  input.className = 'display-name-input';
  input.type = 'text';
  input.name = 'displayName';
  input.autocomplete = 'off';
  input.value = context.initialValue;

  const error = document.createElement('p');
  error.className = 'display-name-error';
  error.id = 'display-name-error';
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const actions = document.createElement('div');
  actions.className = 'display-name-actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'action-button display-name-save';
  saveButton.textContent = 'Save';

  const status = document.createElement('p');
  status.className = 'display-name-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  let saving = false;

  const showValidationError = () => {
    error.textContent = DISPLAY_NAME_ERROR_MESSAGE;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'display-name-error');
  };

  const clearValidationError = () => {
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  };

  const setSaving = (next: boolean) => {
    saving = next;
    saveButton.hidden = next;
    status.hidden = !next;
    status.textContent = next ? 'Saving…' : '';
    input.disabled = next;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (saving) {
      return;
    }

    clearValidationError();
    setSaving(true);

    void context.onSave(input.value).then((result) => {
      if (result.ok) {
        return;
      }

      setSaving(false);
      if (result.validationError) {
        showValidationError();
        input.focus();
        return;
      }

      status.hidden = false;
      status.textContent = "Couldn't save display name.";
    });
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      context.onDismiss();
    }
  });

  actions.append(saveButton, status);
  form.append(label, input, error, actions);
  dialog.append(title, helper, form);
  overlay.append(backdrop, dialog);
  root.append(overlay);

  input.focus();
}
