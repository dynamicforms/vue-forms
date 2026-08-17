// form-actions.spec.ts
import { vi } from 'vitest';

import { Field } from '../field';
import { Group } from '../group';

import { ValueChangedAction, VisibilityChangedAction } from '.';

describe('Form actions', () => {
  it('correctly executes action chain', () => {
    const calls: string[] = [];
    const valueAction1 = vi.fn((field, supr, newValue, oldValue) => {
      calls.push('valueAction1');
      return supr(field, newValue, oldValue);
    });
    const valueAction2 = vi.fn((field, supr, newValue, oldValue) => {
      calls.push('valueAction2');
      return supr(field, newValue, oldValue);
    });
    const visibilityAction = vi.fn((field, supr, newValue, oldValue) => {
      calls.push('visibilityAction');
      return supr(field, newValue, oldValue);
    });

    const field = new Field({ value: 'initial' })
      .registerAction(new ValueChangedAction(valueAction1))
      .registerAction(new ValueChangedAction(valueAction2))
      .registerAction(new VisibilityChangedAction(visibilityAction));

    const form = new Group({
      field1: field,
      field2: new Field({ value: 'second field' }),
    });

    // trigger ValueChangedAction
    form.fields.field1.value = 'new value';

    // the order the handlers ran in
    expect(calls).toEqual(['valueAction2', 'valueAction1']);
    expect(valueAction1).toHaveBeenCalledTimes(1);
    expect(valueAction2).toHaveBeenCalledTimes(1);
    expect(visibilityAction).not.toHaveBeenCalled();

    // the parameters the handler received
    expect(valueAction2).toHaveBeenCalledWith(expect.anything(), expect.any(Function), 'new value', 'initial');
  });

  it('allows a handler to break the action chain', () => {
    const valueAction1 = vi.fn((field, supr, newValue, oldValue) => supr(field, newValue, oldValue));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const valueAction2 = vi.fn((field, supr, newValue, oldValue) => {
      // supr is not called, so the chain stops here
    });

    const field = new Field({ value: 'initial' })
      .registerAction(new ValueChangedAction(valueAction1))
      .registerAction(new ValueChangedAction(valueAction2));

    field.value = 'new value';

    expect(valueAction2).toHaveBeenCalled();
    expect(valueAction1).not.toHaveBeenCalled();
  });
});

describe('Action registration', () => {
  it('rejects anything that is not a FieldActionBase', () => {
    const field = new Field({ value: 1 });

    expect(() => field.registerAction({ execute: () => null } as any)).toThrow(/Invalid action type/);
  });
});
