import { vi } from 'vitest';

import { ConditionalVisibilityAction, Operator, Statement, ValueChangedAction } from '../actions';
import { Field } from '../field';
import type { FieldBase } from '../field-base';
import { Group } from '../group';
import { List } from '../list';
import { transaction } from '../transaction';
import { Validators } from '../validators';

import { ControlledRef } from './controlled-ref';

/** The number of actions registered on `element`: the ones of its declaration. */
const actionCount = (element: FieldBase) => (element as any).boundActions?.registrations.length ?? 0;

const matches = (mine: string, other: string) => mine === other;

describe('the listener CompareTo installs on the compared element', () => {
  it('is removed when the validator is unregistered', () => {
    const form = new Group({ password: new Field({ value: 'a' }), confirmation: new Field({ value: 'a' }) });
    const before = actionCount(form.fields.password);
    const rule = new Validators.CompareTo(form.fields.password, matches);

    form.fields.confirmation.registerAction(rule);
    expect(actionCount(form.fields.password)).toBe(before + 1);

    form.fields.confirmation.unregisterAction(rule);
    expect(actionCount(form.fields.password)).toBe(before);
  });

  it('is removed when clearValidators() removes the validator', () => {
    const form = new Group({ password: new Field({ value: 'a' }), confirmation: new Field({ value: 'a' }) });
    const before = actionCount(form.fields.password);
    form.fields.confirmation.registerAction(new Validators.CompareTo(form.fields.password, matches));

    form.fields.confirmation.clearValidators();

    expect(actionCount(form.fields.password)).toBe(before);
  });

  it('is restored by a rollback of the unregistration and keeps the comparison running', () => {
    const form = new Group({ password: new Field({ value: 'a' }), confirmation: new Field({ value: 'a' }) });
    const rule = new Validators.CompareTo(form.fields.password, matches);
    form.fields.confirmation.registerAction(rule);
    const registered = actionCount(form.fields.password);

    expect(() =>
      transaction(() => {
        form.fields.confirmation.unregisterAction(rule);
        throw new Error('abandon');
      }),
    ).toThrow('abandon');

    expect(actionCount(form.fields.password)).toBe(registered);
    form.fields.password.value = 'b';
    expect(form.fields.confirmation.valid).toBe(false);
  });

  it('is installed again when the validator is registered again', () => {
    const form = new Group({ password: new Field({ value: 'a' }), confirmation: new Field({ value: 'a' }) });
    const rule = new Validators.CompareTo(form.fields.password, matches);
    form.fields.confirmation.registerAction(rule);
    form.fields.confirmation.unregisterAction(rule);

    form.fields.confirmation.registerAction(rule);
    form.fields.password.value = 'b';

    expect(form.fields.confirmation.valid).toBe(false);
  });

  it('is installed once for every row of a list', () => {
    const template = new Group({ password: new Field({ value: '' }), confirmation: new Field({ value: '' }) });
    template.fields.confirmation.registerAction(new Validators.CompareTo('password', matches));
    const list = new List(template);
    list.push({ password: 'a', confirmation: 'a' });
    const one = actionCount(template.fields.password);

    list.push({ password: 'b', confirmation: 'b' });
    list.push({ password: 'c', confirmation: 'x' });

    expect(actionCount(template.fields.password)).toBe(one);
    expect(list.get(2)!.fields.confirmation.valid).toBe(false);
    list.get(2)!.fields.password.value = 'x';
    expect(list.get(2)!.fields.confirmation.valid).toBe(true);
  });
});

describe('the relay a conditional action installs on the fields its statement reads', () => {
  beforeEach(() => ControlledRef.install());
  afterEach(() => vi.unstubAllGlobals());

  it('is removed when the action is unregistered after a row of a list was collected', () => {
    const flag = new Field({ value: false });
    const template = new Group({ note: new Field({ value: '' }) });
    const rule = new ConditionalVisibilityAction(new Statement(flag, Operator.EQUALS, true), 'full', 'hidden');
    template.fields.note.registerAction(rule);
    const form = new Group({ flag, rows: new List(template) });
    form.fields.rows.push({ note: 'a' });
    const row = form.fields.rows.get(0)!;
    const registered = actionCount(flag);

    form.fields.rows.remove(0);
    ControlledRef.collect(row, row.fields.note);
    template.fields.note.unregisterAction(rule);

    expect(actionCount(flag)).toBe(registered - 1);
  });
});

describe('rules of a dropped form that read an element outside it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ControlledRef.install();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A dialog form with a visibility rule and a comparison over `setting`, which lives outside it. */
  const openDialog = (setting: Field) => {
    const dialog = new Group({ name: new Field({ value: '' }) });
    dialog.fields.name.registerAction(new ConditionalVisibilityAction(new Statement(setting, Operator.EQUALS, true)));
    dialog.fields.name.registerAction(new Validators.CompareTo(setting, () => true));
    return dialog;
  };

  it('leave their listeners on the element until a registration on it a minute later', () => {
    const setting = new Field({ value: false });
    setting.registerAction(new ValueChangedAction(() => undefined));
    const dialogs = Array.from({ length: 3 }, () => openDialog(setting));
    ControlledRef.collect(...dialogs.flatMap((dialog) => [dialog, dialog.fields.name]));

    vi.advanceTimersByTime(59_999);
    setting.registerAction(new ValueChangedAction(() => undefined));
    expect(actionCount(setting)).toBe(2 + 6);

    vi.advanceTimersByTime(1);
    setting.registerAction(new ValueChangedAction(() => undefined));
    expect(actionCount(setting)).toBe(3);
  });

  it('keep their listeners while the form is alive', () => {
    const setting = new Field({ value: false });
    setting.registerAction(new ValueChangedAction(() => undefined));
    const dialog = openDialog(setting);

    vi.advanceTimersByTime(60_000);
    setting.registerAction(new ValueChangedAction(() => undefined));

    expect(actionCount(setting)).toBe(2 + 2);
    setting.value = true;
    expect(dialog.fields.name.visibility).toBe('full');
  });

  it('do not release the relay of a conditional action that is not registered yet', () => {
    const setting = new Field({ value: false });
    setting.registerAction(new ValueChangedAction(() => undefined));
    const rule = new ConditionalVisibilityAction(new Statement(setting, Operator.EQUALS, true), 'full', 'hidden');

    vi.advanceTimersByTime(60_000);
    setting.registerAction(new ValueChangedAction(() => undefined));
    const name = new Field({ value: '' });
    name.registerAction(rule);
    setting.value = true;

    expect(name.visibility).toBe('full');
  });
});
