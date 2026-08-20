// form-actions.spec.ts
import { vi } from 'vitest';

import DisplayMode from '../display-mode';
import { Field } from '../field';
import { AbortEventHandlingException } from '../field.interface';
import { Group } from '../group';
import { transaction } from '../transaction';
import { Validators } from '../validators';

import FieldActionBase from './field-action-base';

import {
  EnabledChangingAction,
  ExecuteAction,
  ValueChangedAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from '.';

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

describe('Action ordering', () => {
  it('places an action inside a handler already registered', () => {
    const calls: string[] = [];
    const outer = new ValueChangedAction((field, supr, newValue, oldValue) => {
      calls.push('outer');
      return supr(field, newValue, oldValue);
    });
    const inner = new ValueChangedAction((field, supr, newValue, oldValue) => {
      calls.push('inner');
      return supr(field, newValue, oldValue);
    });

    const field = new Field({ value: 'initial' }).registerAction(outer);
    field.registerActionBefore(inner, outer);
    field.value = 'new value';

    expect(calls).toEqual(['outer', 'inner']);
  });

  it('refuses an anchor the element does not hold under that identifier', () => {
    const registered = new ValueChangedAction((field, supr, ...params) => supr(field, ...params));
    const elsewhere = new ValueChangedAction((field, supr, ...params) => supr(field, ...params));
    const other = new VisibilityChangedAction((field, supr, ...params) => supr(field, ...params));
    const field = new Field({ value: 1 }).registerAction(registered);

    expect(() => field.registerActionBefore(new ValueChangedAction(() => null), elsewhere)).toThrow(
      /not registered under the same identifier/,
    );
    expect(() => field.registerActionBefore(new ValueChangedAction(() => null), other)).toThrow(
      /not registered under the same identifier/,
    );
  });
});

describe('Unregistering an action', () => {
  it('drops the handler and answers whether the element held it', () => {
    const handler = vi.fn((field, supr, ...params) => supr(field, ...params));
    const action = new ValueChangedAction(handler);
    const field = new Field({ value: 'initial' }).registerAction(action);

    field.value = 'first';
    expect(handler).toHaveBeenCalledTimes(1);

    expect(field.unregisterAction(action)).toBe(true);
    field.value = 'second';
    expect(handler).toHaveBeenCalledTimes(1);

    expect(field.unregisterAction(action)).toBe(false);
  });

  it('leaves the handlers registered around it in place', () => {
    const calls: string[] = [];
    const first = new ValueChangedAction((field, supr, ...params) => {
      calls.push('first');
      return supr(field, ...params);
    });
    const middle = new ValueChangedAction((field, supr, ...params) => {
      calls.push('middle');
      return supr(field, ...params);
    });
    const last = new ValueChangedAction((field, supr, ...params) => {
      calls.push('last');
      return supr(field, ...params);
    });

    const field = new Field({ value: 0 }).registerAction(first).registerAction(middle).registerAction(last);
    field.unregisterAction(middle);
    field.value = 1;

    expect(calls).toEqual(['last', 'first']);
  });

  it('withdraws the errors a validator put on the field', () => {
    const required = new Validators.Required();
    const field = new Field({ value: '', validators: [required] });
    expect(field.valid).toBe(false);

    field.unregisterAction(required);

    expect(field.errors).toEqual([]);
    expect(field.valid).toBe(true);
  });

  it('leaves the instance validating every other field it was registered on', () => {
    const required = new Validators.Required();
    const kept = new Field({ value: '', validators: [required] });
    const dropped = new Field({ value: '', validators: [required] });

    dropped.unregisterAction(required);

    expect(dropped.valid).toBe(true);
    expect(kept.valid).toBe(false);
    kept.value = 'x';
    kept.value = '';
    expect(kept.valid).toBe(false);
  });
});

describe('Registration inside a transaction', () => {
  it('is taken back by a rollback', () => {
    const handler = vi.fn((field, supr, ...params) => supr(field, ...params));
    const action = new ValueChangedAction(handler);
    const field = new Field({ value: 'initial' });

    transaction((tx) => {
      field.registerAction(action);
      tx.rollback();
    });

    handler.mockClear();
    field.value = 'new value';
    expect(handler).not.toHaveBeenCalled();
  });

  it('puts back a registration the transaction dropped', () => {
    const required = new Validators.Required();
    const field = new Field({ value: '', validators: [required] });

    transaction((tx) => {
      field.unregisterAction(required);
      expect(field.valid).toBe(true);
      tx.rollback();
    });

    expect(field.valid).toBe(false);
    expect(field.errors).toHaveLength(1);
    field.value = 'filled';
    expect(field.valid).toBe(true);
  });

  it('puts back the validators clearValidators dropped', () => {
    const field = new Field({ value: '', validators: [new Validators.Required()] });

    transaction((tx) => {
      field.clearValidators();
      expect(field.valid).toBe(true);
      tx.rollback();
    });

    expect(field.valid).toBe(false);
    field.value = 'filled';
    expect(field.valid).toBe(true);
    field.value = '';
    expect(field.valid).toBe(false);
  });
});

describe('Eager actions', () => {
  const EagerFlagIdentifier = Symbol('EagerFlag');

  class FlaggedAction extends FieldActionBase {
    private readonly isEager: boolean;

    constructor(isEager: boolean, executorFn: (field: any, supr: any, ...params: any[]) => any) {
      super(executorFn);
      this.isEager = isEager;
    }

    static get classIdentifier() {
      return EagerFlagIdentifier;
    }

    get eager() {
      return this.isEager;
    }
  }

  it('run alone, without the lazy actions standing under the same identifier', () => {
    const calls: string[] = [];
    const field = new Field({ value: 1 })
      .registerAction(
        new FlaggedAction(false, (f, supr, ...params) => {
          calls.push('lazy');
          return supr(f, ...params);
        }),
      )
      .registerAction(
        new FlaggedAction(true, (f, supr, ...params) => {
          calls.push('eager');
          return supr(f, ...params);
        }),
      );

    calls.length = 0;
    field.validate(true);

    expect(calls).toEqual(['eager']);
  });
});

describe('AbortEventHandlingException', () => {
  it('ends the run and leaves the handlers below it unreached', () => {
    const calls: string[] = [];
    const inner = new ValueChangedAction((field, supr, ...params) => {
      calls.push('inner');
      return supr(field, ...params);
    });
    const outer = new ValueChangedAction(() => {
      calls.push('outer');
      throw new AbortEventHandlingException();
    });

    const field = new Field({ value: 'initial' }).registerAction(inner).registerAction(outer);
    field.value = 'new value';

    expect(calls).toEqual(['outer']);
  });

  it('does not escape the setter, and the value it announced still stands', () => {
    const field = new Field({ value: 'initial' }).registerAction(
      new ValueChangedAction(() => {
        throw new AbortEventHandlingException();
      }),
    );

    expect(() => {
      field.value = 'new value';
    }).not.toThrow();
    // the value is written before it is announced, so aborting the announcement does not take the write back
    expect(field.value).toBe('new value');
  });

  it('answers with itself from triggerAction, so the caller can tell it from silence', () => {
    const ended = new Field({ value: 1 }).registerAction(
      new ExecuteAction(() => {
        throw new AbortEventHandlingException('nothing to save');
      }),
    );
    const answered = new Field({ value: 1 }).registerAction(new ExecuteAction(() => null));
    const empty = new Field({ value: 1 });

    const abort = ended.triggerAction(ExecuteAction);
    expect(abort).toBeInstanceOf(AbortEventHandlingException);
    expect((abort as AbortEventHandlingException).message).toBe('nothing to save');
    // the two runs that reached an end of their own are null, and the caller tells all three apart
    expect(answered.triggerAction(ExecuteAction)).toBeNull();
    expect(empty.triggerAction(ExecuteAction)).toBeNull();
  });

  it('ends only the run it was thrown in', () => {
    const seen: string[] = [];
    const field = new Field({ value: 'initial' })
      .registerAction(
        new ValueChangedAction(() => {
          seen.push('value');
          throw new AbortEventHandlingException();
        }),
      )
      .registerAction(
        new VisibilityChangedAction((f, supr, ...params) => {
          seen.push('visibility');
          return supr(f, ...params);
        }),
      );

    field.value = 'new value';
    field.visibility = DisplayMode.HIDDEN;

    expect(seen).toEqual(['value', 'visibility']);
  });

  it('lets every other exception through to the caller', () => {
    const field = new Field({ value: 'initial' }).registerAction(
      new ValueChangedAction(() => {
        throw new Error('a handler failed');
      }),
    );

    expect(() => {
      field.value = 'new value';
    }).toThrow('a handler failed');
    // an ordinary throw unwinds the transaction the write opened, so the field is as it was
    expect(field.value).toBe('initial');
  });

  it('refuses the write a *Changing* handler ends the run over', () => {
    const seen: string[] = [];
    const field = new Field({ value: 1, visibility: DisplayMode.FULL });
    field.registerAction(
      new VisibilityChangedAction((f, supr, ...params) => (seen.push('changed'), supr(f, ...params))),
    );
    field.registerAction(
      new VisibilityChangingAction(() => {
        throw new AbortEventHandlingException();
      }),
    );

    field.visibility = DisplayMode.HIDDEN;

    // nothing is written and nothing is announced: the handler refused the write rather than reshaping it
    expect(field.visibility).toBe(DisplayMode.FULL);
    expect(seen).toEqual([]);
  });

  it('refuses an enabled write the same way', () => {
    const field = new Field({ value: 1 });
    field.registerAction(
      new EnabledChangingAction(() => {
        throw new AbortEventHandlingException();
      }),
    );

    field.enabled = false;

    expect(field.enabled).toBe(true);
  });
});
