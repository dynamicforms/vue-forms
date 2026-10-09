import { vi } from 'vitest';
import { watch } from 'vue';

import { Action } from '../action';
import { ExecuteAction, RejectAction, SubmitAction, SubmitFailedException, SubmitRefusedException } from '../actions';
import { BeginValidating } from '../element-state';
import { Field } from '../field';
import { type FieldBase } from '../field-base';
import { Group } from '../group';
import { List } from '../list';
import { Validators } from '../validators';

/** starts and ends asynchronous validation runs on an element through the internal API, one run per call */
const runs = new Map<object, (() => void)[]>();
const beginValidating = (element: any) => {
  if (!runs.has(element)) runs.set(element, []);
  runs.get(element)!.push(element[BeginValidating]());
};
const endValidating = (element: any) => runs.get(element)?.pop()?.();

describe('an action sends nothing', () => {
  it('is left out of value and fullValue', () => {
    const form = new Group({ name: new Field({ value: 'a' }), save: new Action({ value: { label: 'Save' } }) });

    expect(form.value).toEqual({ name: 'a' });
    expect(form.fullValue).toEqual({ name: 'a' });
  });

  it('does not change the container when its label changes', () => {
    const save = new Action({ value: { label: 'Save' } });
    const form = new Group({ name: new Field({ value: 'a' }), save });

    save.label = 'Saving';

    expect(form.isChanged).toBe(false);
    expect(save.isChanged).toBe(true);
  });
});

describe('a container of actions sends nothing', () => {
  it('is left out where all its members are actions, and sends where one is not', () => {
    const form = new Group({
      name: new Field({ value: 'a' }),
      bar: new Group({ save: new Action(), cancel: new Action() }),
      empty: new Group({}),
      mixed: new Group({ note: new Field({ value: 'n' }), save: new Action() }),
    });

    expect(form.value).toEqual({ name: 'a', empty: {}, mixed: { note: 'n' } });
    expect(form.fullValue).toEqual({ name: 'a', empty: {}, mixed: { note: 'n' } });
  });
});

describe('an action keeps its value when its group is assigned or rebound', () => {
  it('is not reached by a null assignment or rebind', () => {
    const form = new Group({ name: new Field({ value: 'a' }), save: new Action({ value: { label: 'Save' } }) });

    form.value = null;
    expect(form.fields.save.label).toBe('Save');
    form.rebind(null);
    expect(form.fields.save.label).toBe('Save');
    expect(form.fields.name.value).toBe(null);
  });
});

describe('defaultConfirm and defaultReject', () => {
  it('read the flags from the value, false where they are not set', () => {
    const yes = new Action({ value: { label: 'Yes', defaultConfirm: true } });
    const plain = new Action({ value: { label: 'Plain' } });

    expect([yes.defaultConfirm, yes.defaultReject]).toEqual([true, false]);
    expect([plain.defaultConfirm, plain.defaultReject]).toEqual([false, false]);
  });
});

describe('executable', () => {
  it('is true for an enabled, shown, idle action', () => {
    expect(new Action().executable).toBe(true);
  });

  it('is false while the action is disabled, not fully visible or running', async () => {
    let settle: (value: unknown) => void = () => null;
    const action = new Action({ actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))] });

    action.access = 'disabled';
    expect(action.executable).toBe(false);
    action.access = 'editable';
    action.visibility = 'hidden';
    expect(action.executable).toBe(false);
    action.visibility = 'full';

    const running = action.execute();
    expect(action.executable).toBe(false);
    settle(null);
    await running;
    expect(action.executable).toBe(true);
  });

  it('is false while a handler returns false from canExecute, and follows it reactively', () => {
    const field = new Field({ value: '' });
    class WhenFilled extends ExecuteAction {
      canExecute() {
        return field.value !== '';
      }
    }
    const action = new Action({ actions: [new WhenFilled((f, supr, params) => supr(f, params))] });
    const seen: boolean[] = [];
    watch(
      () => action.executable,
      (executable) => seen.push(executable),
      { flush: 'sync' },
    );

    expect(action.executable).toBe(false);
    field.value = 'x';
    expect(seen).toEqual([true]);
  });
});

const holder = (action: FieldBase) => action.parent;
const ran = (log: string[], name: string) => new ExecuteAction(() => log.push(name));

describe('Container.confirm() and reject()', () => {
  it('execute the action whose SubmitAction or RejectAction targets the container, before a flagged one', async () => {
    const log: string[] = [];
    const sent: unknown[] = [];
    const form = new Group({
      name: new Field({ value: 'a' }),
      ok: new Action({ value: { defaultConfirm: true }, actions: [ran(log, 'ok')] }),
      bar: new Group({
        save: new Action({
          actions: [
            new SubmitAction(
              (a) => a.parent?.parent,
              (value) => {
                sent.push(value);
              },
            ),
          ],
        }),
        cancel: new Action({ actions: [new RejectAction((a) => a.parent?.parent)] }),
      }),
    });
    form.fields.name.value = 'b';

    const result = await form.confirm();
    expect(sent).toEqual([{ name: 'b' }]);
    expect(result).toMatchObject({ action: form.fields.bar.fields.save, sent: { name: 'b' } });
    expect(log).toEqual([]);

    form.fields.name.value = 'c';
    await form.reject();
    expect(form.fields.name.value).toBe('a');
  });

  it('then a flagged action among the direct members, then the only flagged one below', async () => {
    const log: string[] = [];
    const direct = new Group({
      section: new Group({ deep: new Action({ value: { defaultConfirm: true }, actions: [ran(log, 'deep')] }) }),
      top: new Action({ value: { defaultConfirm: true }, actions: [ran(log, 'top')] }),
    });
    const deepOnly = new Group({
      name: new Field({ value: '' }),
      bar: new Group({ no: new Action({ value: { defaultReject: true }, actions: [ran(log, 'no')] }) }),
    });

    await direct.confirm();
    await deepOnly.reject();

    expect(log).toEqual(['top', 'no']);
  });

  it('execute nothing where two candidates qualify in the same step', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log: string[] = [];
    const form = new Group({
      a: new Group({ yes: new Action({ value: { defaultConfirm: true }, actions: [ran(log, 'a')] }) }),
      b: new Group({ yes: new Action({ value: { defaultConfirm: true }, actions: [ran(log, 'b')] }) }),
    });

    expect(form.confirm()).toBeUndefined();
    expect(log).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('count only shown actions, and execute nothing where the candidate is not executable', () => {
    const log: string[] = [];
    const form = new Group({
      create: new Action({ value: { defaultConfirm: true }, visibility: 'suppress', actions: [ran(log, 'create')] }),
      save: new Action({ value: { defaultConfirm: true }, access: 'disabled', actions: [ran(log, 'save')] }),
      deeper: new Group({ other: new Action({ value: { defaultConfirm: true }, actions: [ran(log, 'other')] }) }),
    });

    expect(form.confirm()).toBeUndefined();
    expect(log).toEqual([]);
  });

  it('pass the params to execute()', async () => {
    const params: unknown[] = [];
    const form = new Group({
      yes: new Action({ value: { defaultConfirm: true }, actions: [new ExecuteAction((f, s, p) => params.push(p))] }),
    });

    await form.confirm({ source: 'enter' });

    expect(params).toEqual([{ source: 'enter' }]);
  });

  it('return undefined where nothing qualifies', () => {
    expect(new Group({ name: new Field({ value: '' }) }).confirm()).toBeUndefined();
    expect(new List(new Group({ a: new Field() })).reject()).toBeUndefined();
  });
});

describe('SubmitAction', () => {
  it('sends the target value, rebinds to the result and resolves with a SubmitResult', async () => {
    const handler = vi.fn(async (value: { name: string }) => ({ name: `${value.name}!` }));
    const form = new Group({
      name: new Field({ value: 'Ada' }),
      save: new Action({ value: { label: 'Save' }, actions: [new SubmitAction(holder, handler)] }),
    });
    form.fields.name.value = 'Grace';

    const result = await form.fields.save.execute();

    expect(handler).toHaveBeenCalledWith({ name: 'Grace' }, form);
    expect(result).toEqual({ action: form.fields.save, sent: { name: 'Grace' }, received: { name: 'Grace!' } });
    expect(form.fields.name.value).toBe('Grace!');
    expect(form.isChanged).toBe(false);
  });

  it('leaves the target as it is where rebind is false or the result is undefined', async () => {
    const form = new Group({
      name: new Field({ value: 'Ada' }),
      save: new Action({ actions: [new SubmitAction(holder, () => ({ name: 'other' }), { rebind: false })] }),
      send: new Action({ actions: [new SubmitAction(holder, () => undefined)] }),
    });
    form.fields.name.value = 'Grace';

    await form.fields.save.execute();
    await form.fields.send.execute();

    expect(form.fields.name.value).toBe('Grace');
    expect(form.isChanged).toBe(true);
  });

  it('refuses an invalid target: resolves with SubmitRefusedException', async () => {
    const handler = vi.fn();
    const form = new Group({
      name: new Field({ value: '', validators: [new Validators.Required()] }),
      save: new Action({ actions: [new SubmitAction(holder, handler)] }),
    });

    const result = await form.fields.save.execute();

    expect(result).toBeInstanceOf(SubmitRefusedException);
    expect((result as SubmitRefusedException).reason).toBe('invalid');
    // a refusal is a failed submit, so a caller that checks for SubmitFailedException handles it as well
    expect(result).toBeInstanceOf(SubmitFailedException);
    expect((result as SubmitFailedException).cause).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('waits for a validation in progress before it reads validity', async () => {
    let settle: (errors: null) => void = () => null;
    const handler = vi.fn();
    const name = new Field({
      value: 'a',
      validators: [new Validators.Validator(() => new Promise((r) => (settle = r)))],
    });
    const form = new Group({ name, save: new Action({ actions: [new SubmitAction(holder, handler)] }) });

    const running = form.fields.save.execute();
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    settle(null);
    await running;
    expect(handler).toHaveBeenCalledWith({ name: 'a' }, form);
  });

  it('resolves with SubmitFailedException carrying the handler error, and leaves the target as it is', async () => {
    const failing = new SubmitAction(holder, async () => {
      throw new Error('offline');
    });
    const form = new Group({ name: new Field({ value: 'Ada' }), save: new Action({ actions: [failing] }) });
    form.fields.name.value = 'Grace';

    const result = await form.fields.save.execute();

    expect(result).toBeInstanceOf(SubmitFailedException);
    expect((result.cause as Error).message).toBe('offline');
    expect(form.fields.name.value).toBe('Grace');
  });

  it('refuses a second execute() while a submit of the same action is running', async () => {
    let settle: (value: unknown) => void = () => null;
    const handler = vi.fn(() => new Promise((resolve) => (settle = resolve)));
    const form = new Group({
      name: new Field({ value: 'a' }),
      save: new Action({ actions: [new SubmitAction(holder, handler)] }),
    });

    const first = form.fields.save.execute();
    await Promise.resolve();
    const second = await form.fields.save.execute();
    settle(undefined);
    await first;

    expect(second).toBeInstanceOf(SubmitRefusedException);
    expect(second.reason).toBe('running');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('submits an element given directly', async () => {
    const handler = vi.fn();
    const address = new Group({ city: new Field({ value: 'Kranj' }) });
    const form = new Group({ address, save: new Action({ actions: [new SubmitAction(address, handler)] }) });

    await form.fields.save.execute();

    expect(handler).toHaveBeenCalledWith({ city: 'Kranj' }, address);
  });

  it('makes the action executable only while the target is valid and not pending', () => {
    const form = new Group({
      name: new Field({ value: '', validators: [new Validators.Required()] }),
      save: new Action({ actions: [new SubmitAction(holder, () => undefined)] }),
    });

    expect(form.fields.save.executable).toBe(false);
    form.fields.name.value = 'x';
    expect(form.fields.save.executable).toBe(true);
    beginValidating(form.fields.name);
    expect(form.fields.save.executable).toBe(false);
    endValidating(form.fields.name);
    expect(form.fields.save.executable).toBe(true);
  });

  it('is not executable where the target callback returns no element', () => {
    expect(new Action({ actions: [new SubmitAction(holder, () => undefined)] }).executable).toBe(false);
  });
});

describe('RejectAction', () => {
  it('rebinds the target to its originalValue, whatever its validity', async () => {
    const form = new Group({
      name: new Field({ value: 'Ada', validators: [new Validators.MinLength(3)] }),
      cancel: new Action({ actions: [new RejectAction(holder)] }),
    });
    form.fields.name.value = 'x';
    form.fields.name.touched = true;

    expect(form.fields.cancel.executable).toBe(true);
    await form.fields.cancel.execute();

    expect(form.fields.name.value).toBe('Ada');
    expect(form.fields.name.touched).toBe(false);
    expect(form.isChanged).toBe(false);
  });
});
