import { nextTick, reactive, watchEffect } from 'vue';

import { Action, ActionValue } from './action';
import {
  EnabledChangedAction,
  EnabledChangingAction,
  ExecuteAction,
  ValueChangedAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from './actions';
import DisplayMode from './display-mode';
import { Group } from './group';
import { Validators } from './validators';

describe('Action', () => {
  it('correctly manages value, label and icon', () => {
    const action = new Action({ value: { label: 'Action', icon: 'plus' } });

    expect(action.value).toEqual({ label: 'Action', icon: 'plus' });
    expect(action.label).toBe('Action');
    expect(action.icon).toBe('plus');

    action.label = 'New action';
    expect(action.value).toEqual({ label: 'New action', icon: 'plus' });

    action.icon = 'minus';
    expect(action.value).toEqual({ label: 'New action', icon: 'minus' });

    action.value = { label: 'Third', icon: 'edit' };
    expect(action.label).toBe('Third');
    expect(action.icon).toBe('edit');
  });

  it('accepts label and icon on an action constructed without a value', () => {
    const empty = new Action({});
    empty.label = 'X';
    expect(empty.label).toBe('X');

    const withAction = new Action({ actions: [new ExecuteAction(() => null)] });
    withAction.label = 'Save';
    withAction.icon = 'check';
    expect(withAction.value).toEqual({ label: 'Save', icon: 'check' });
    expect(Object.isFrozen(withAction.value)).toBe(false);
  });

  it('prevents changes when disabled', () => {
    const action = new Action({
      value: { label: 'Action', icon: 'plus' },
      enabled: false,
    });

    action.value = { label: 'New', icon: 'minus' };
    expect(action.label).toBe('Action');
    expect(action.icon).toBe('plus');
  });

  it('keeps reading a value object the caller goes on to write', () => {
    const reactiveValue = reactive({ label: 'Initial', icon: 'start' });
    const action = new Action({ value: reactiveValue });

    reactiveValue.label = 'Modified';

    expect(action.label).toBe('Modified');
    expect(action.value.label).toBe('Modified');
  });

  it('replaces the value object rather than writing into it', () => {
    const supplied = reactive({ label: 'Initial', icon: 'start' });
    const action = new Action({ value: supplied });

    action.icon = 'new-icon';

    expect(action.icon).toBe('new-icon');
    expect(action.label).toBe('Initial');
    expect(action.value).not.toBe(supplied);
    expect(supplied.icon).toBe('start');
  });

  it('announces a label or icon written through the setter', () => {
    const seen: ActionValue[] = [];
    const action = new Action({ value: { label: 'Save', icon: 'save' } });
    action.registerAction(new ValueChangedAction((field, supr, newValue) => seen.push(newValue)));

    expect(action.isChanged).toBe(false);

    action.label = 'Submit';

    expect(seen).toEqual([{ label: 'Submit', icon: 'save' }]);
    expect(action.isChanged).toBe(true);
  });

  it('says nothing when the label written is the one already held', () => {
    const seen: ActionValue[] = [];
    const action = new Action({ value: { label: 'Save', icon: 'save' } });
    action.registerAction(new ValueChangedAction((field, supr, newValue) => seen.push(newValue)));

    action.label = 'Save';
    action.icon = 'save';

    expect(seen).toEqual([]);
    expect(action.isChanged).toBe(false);
  });

  it('leaves the value of every container above intact when the label written is the one already held', () => {
    const action = new Action({ value: { label: 'Save', icon: 'save' } });
    const outer = new Group({ inner: new Group({ act: action }) });
    const before = outer.value;

    action.label = 'Save';

    expect(outer.value).toBe(before);
  });

  it('clears a member without carrying an undefined key into the value', () => {
    const action = new Action({ value: { label: 'Save' } });

    action.icon = 'save';
    action.icon = undefined;

    expect(Object.keys(action.value)).toEqual(['label']);
    expect(action.isChanged).toBe(false);
  });

  it('reports no change for a member cleared that was never set', () => {
    const action = new Action({ value: { label: 'Save' } });

    action.icon = undefined;

    expect(Object.keys(action.value)).toEqual(['label']);
    expect(action.isChanged).toBe(false);
  });

  it('refuses a label written on a disabled action', () => {
    const action = new Action({ value: { label: 'Save' }, enabled: false });

    action.label = 'Submit';

    expect(action.label).toBe('Save');
  });

  it('should execute action with ExecuteAction', async () => {
    // Arrange
    let executedParams: any;
    const executeAction = new ExecuteAction((field, supr, params) => {
      executedParams = params;
    });

    const action = new Action({
      value: { label: 'Test', icon: 'test' },
      actions: [executeAction],
    });

    // Act
    const params = { data: 'test-data' };
    const running = action.execute(params);

    // Assert - the chain is entered synchronously, so the handler has already seen the parameters
    expect(executedParams).toEqual(params);
    await running;
  });
});

describe('Action execution', () => {
  it('answers what the handler returned', async () => {
    const action = new Action({ actions: [new ExecuteAction(() => 'saved')] });

    await expect(action.execute()).resolves.toBe('saved');
  });

  it('answers null when nothing is registered', async () => {
    await expect(new Action().execute()).resolves.toBeNull();
  });

  it('leaves an action nothing was registered on without an actions map', async () => {
    const action = new Action({ value: { label: 'Save' } });

    await action.execute();

    expect((action as unknown as { _actions?: unknown })._actions).toBeUndefined();
  });

  it('is busy for as long as an asynchronous handler runs', async () => {
    let settle: (value: string) => void = () => null;
    const action = new Action({
      actions: [new ExecuteAction(() => new Promise<string>((resolve) => (settle = resolve)))],
    });

    expect(action.busy).toBe(false);

    const running = action.execute();
    expect(action.busy).toBe(true);

    settle('done');
    await expect(running).resolves.toBe('done');
    expect(action.busy).toBe(false);
  });

  it('clears busy when the handler rejects, and rejects with what it threw', async () => {
    const action = new Action({
      actions: [
        new ExecuteAction(() => {
          throw new Error('submit failed');
        }),
      ],
    });

    await expect(action.execute()).rejects.toThrow('submit failed');
    expect(action.busy).toBe(false);
  });

  it('counts overlapping runs, so busy stands until the last of them settles', async () => {
    const pending: ((value: unknown) => void)[] = [];
    const action = new Action({
      actions: [new ExecuteAction(() => new Promise((resolve) => pending.push(resolve)))],
    });

    const first = action.execute();
    const second = action.execute();
    expect(action.busy).toBe(true);

    pending[0](null);
    await first;
    expect(action.busy).toBe(true);

    pending[1](null);
    await second;
    expect(action.busy).toBe(false);
  });

  it('re-renders a reader of busy as the flag moves', async () => {
    let settle: (value: unknown) => void = () => null;
    const action = new Action({
      actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))],
    });
    const seen: boolean[] = [];
    watchEffect(() => seen.push(action.busy));

    const running = action.execute();
    await nextTick();
    settle(null);
    await running;
    await nextTick();

    expect(seen).toEqual([false, true, false]);
  });
});

describe('Action construction', () => {
  it('starts from an empty label/icon pair', () => {
    const action = new Action();

    expect(action.value).toEqual({ label: undefined, icon: undefined });
    expect(action.label).toBeUndefined();
    expect(action.icon).toBeUndefined();
  });

  it('runs a constructor-supplied validator exactly once, over the shaped value', () => {
    const seen: ActionValue[] = [];
    const action = new Action({
      value: { label: 'Save' },
      validators: [
        new Validators.Validator<ActionValue>((newValue) => {
          seen.push({ label: newValue?.label, icon: newValue?.icon });
          return null;
        }),
      ],
    });

    expect(seen).toEqual([{ label: 'Save', icon: undefined }]);
    expect(action.label).toBe('Save');
    expect(action.valid).toBe(true);
  });

  it('lets a constructor-supplied changing action rewrite the parameters that carry it', () => {
    const visibilitySeen: DisplayMode[] = [];
    const enabledSeen: boolean[] = [];
    const action = new Action({
      value: { label: 'Save' },
      visibility: DisplayMode.HIDDEN,
      enabled: false,
      actions: [
        new VisibilityChangingAction(() => DisplayMode.SUPPRESS),
        new VisibilityChangedAction((field, supr, newValue) => {
          visibilitySeen.push(newValue);
        }),
        new EnabledChangingAction(() => true),
        new EnabledChangedAction((field, supr, newValue) => {
          enabledSeen.push(newValue);
        }),
      ],
    });

    expect(action.visibility).toBe(DisplayMode.SUPPRESS);
    expect(action.enabled).toBe(true);
    expect(visibilitySeen).toEqual([DisplayMode.SUPPRESS]);
    expect(enabledSeen).toEqual([true]);
    expect(action.label).toBe('Save');
  });

  it('freezes originalValue derived from the constructor parameters', () => {
    const action = new Action({ value: { label: 'Save' }, originalValue: { label: 'Original', icon: 'i' } });

    expect(action.originalValue).toEqual({ label: 'Original', icon: 'i' });
    expect(Object.isFrozen(action.originalValue)).toBe(true);
  });
});
