import { reactive } from 'vue';

import { Action, ActionValue } from './action';
import {
  EnabledChangedAction,
  EnabledChangingAction,
  ExecuteAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from './actions';
import DisplayMode from './display-mode';
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

  it('should maintain reactivity of input ActionValue object', () => {
    // Arrange
    const reactiveValue = reactive({ label: 'Initial', icon: 'start' });
    const action = new Action({ value: reactiveValue });

    // Act - change original reactive object
    reactiveValue.label = 'Modified';

    // Assert - action should reflect the change
    expect(action.label).toBe('Modified');
    expect(action.value.label).toBe('Modified');
    // expect(changeCount).toBe(1);

    // Act - change via action setter
    action.icon = 'new-icon';

    // Assert - original reactive object should also change
    expect(reactiveValue.icon).toBe('new-icon');
  });

  it('should lose maintain reactivity when input object is incomplete', () => {
    // Arrange
    const reactiveValue = reactive({ label: 'Initial' } as ActionValue); // missing icon
    const action = new Action({ value: reactiveValue });

    // Act - change original reactive object
    action.icon = 'icon';

    // Assert - action should reflect the change
    expect(reactiveValue.label).toBe('Initial');
    expect(reactiveValue.icon).toBe('icon');

    action.label = 'Modified';
    expect(reactiveValue.label).toBe('Modified');
  });

  it('should execute action with ExecuteAction', () => {
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
    action.execute(params);

    // Assert
    expect(executedParams).toEqual(params);
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
