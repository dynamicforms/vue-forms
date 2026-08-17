import { vi } from 'vitest';

import { ValueChangedAction } from './actions';
import { Field } from './field';
import { Group } from './group';
import { transaction, type TransactionControl } from './transaction';
import { ValidationErrorText } from './validators/validation-error';
import { Validator } from './validators/validator';
import CompareTo from './validators/validator-compare-to';
import Required from './validators/validator-required';

/** lets every pending microtask and timer callback run before the assertions that follow */
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 5);
  });

describe('transaction', () => {
  describe('rollback restores the validators', () => {
    it('puts back the validators a rolled-back clearValidators() dropped', () => {
      const field = new Field({ value: 'a', validators: [new Required()] });

      expect(() =>
        transaction(() => {
          field.clearValidators();
          throw new Error('boom');
        }),
      ).toThrow('boom');

      field.value = '';
      expect(field.errors.length).toBe(1);
      expect(field.valid).toBe(false);
    });

    it('keeps a cross-field validator listening when clearValidators() is rolled back', () => {
      const other = new Field({ value: 'abc' });
      const field = new Field({ value: 'abc' });
      field.registerAction(new CompareTo(other, (mine, theirs) => mine === theirs, 'Fields must match'));
      expect(field.errors.length).toBe(0);

      expect(() =>
        transaction(() => {
          field.clearValidators();
          throw new Error('boom');
        }),
      ).toThrow('boom');

      // the listener CompareTo installed on the other field is what re-runs the comparison
      other.value = 'xyz';
      expect(field.errors.length).toBe(1);
    });

    it('releases a cross-field validator once clearValidators() commits', () => {
      const other = new Field({ value: 'abc' });
      const field = new Field({ value: 'abc' });
      field.registerAction(new CompareTo(other, (mine, theirs) => mine === theirs, 'Fields must match'));

      transaction(() => field.clearValidators());

      other.value = 'xyz';
      expect(field.errors.length).toBe(0);
    });

    it('leaves the validators gone when the transaction commits', () => {
      const field = new Field({ value: 'a', validators: [new Required()] });

      transaction(() => field.clearValidators());

      field.value = '';
      expect(field.errors.length).toBe(0);
      expect(field.valid).toBe(true);
    });
  });

  describe('registering an action mid-transaction', () => {
    it('keeps a leaf change the transaction has yet to announce', () => {
      const field = new Field({ value: 'a' });
      const handler = vi.fn();
      field.registerAction(new ValueChangedAction(handler));

      transaction(() => {
        field.value = 'b';
        // a second listener, chaining on so that the first still hears what it is told
        field.registerAction(new ValueChangedAction((f, supr, newValue, oldValue) => supr(f, newValue, oldValue)));
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][2]).toBe('b');
      expect(handler.mock.calls[0][3]).toBe('a');
    });

    it('keeps a group change the transaction has yet to announce', () => {
      const group = new Group({ a: new Field({ value: 'a0' }) });
      const handler = vi.fn();
      group.registerAction(new ValueChangedAction(handler));

      transaction(() => {
        group.fields.a.value = 'a1';
        group.registerAction(new ValueChangedAction((f, supr, newValue, oldValue) => supr(f, newValue, oldValue)));
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][2]).toEqual({ a: 'a1' });
      expect(handler.mock.calls[0][3]).toEqual({ a: 'a0' });
    });
  });

  describe('announcement order', () => {
    it('announces an element a handler dirtied before the container above it', () => {
      const log: string[] = [];
      const a = new Field({ value: 'a0' });
      const b = new Field({ value: 'b0' });
      const group = new Group({ a, b });

      a.registerAction(
        new ValueChangedAction((field, supr, newValue, oldValue) => {
          log.push(`a=${newValue}`);
          b.value = 'b1';
          return supr(field, newValue, oldValue);
        }),
      );
      b.registerAction(
        new ValueChangedAction((field, supr, newValue, oldValue) => {
          log.push(`b=${newValue}`);
          return supr(field, newValue, oldValue);
        }),
      );
      group.registerAction(
        new ValueChangedAction((field, supr, newValue, oldValue) => {
          log.push(`g=${JSON.stringify(newValue)}`);
          return supr(field, newValue, oldValue);
        }),
      );

      a.value = 'a1';

      expect(log).toEqual(['a=a1', 'b=b1', 'g={"a":"a1","b":"b1"}']);
    });
  });

  describe('asynchronous validators', () => {
    it('drops the verdict of a run started inside a rolled-back transaction', async () => {
      let open!: (value: unknown) => void;
      const gate = new Promise((resolve) => {
        open = resolve;
      });
      const validator = new Validator(async (newValue: string) => {
        if (newValue === 'bad') {
          await gate;
          return [new ValidationErrorText('rejected')];
        }
        return null;
      });
      const field = new Field({ value: 'ok', validators: [validator] });
      await settle();
      expect(field.valid).toBe(true);
      expect(field.validating).toBe(false);

      expect(() =>
        transaction(() => {
          field.value = 'bad';
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(field.value).toBe('ok');
      // the run the rolled-back write started is still in flight, and a rollback cannot un-start it
      expect(field.validating).toBe(true);

      open(null);
      await settle();

      expect(field.errors.length).toBe(0);
      expect(field.valid).toBe(true);
      expect(field.validating).toBe(false);
    });
  });

  describe('the control handle', () => {
    it('refuses a handle used after its transaction closed', () => {
      let saved!: TransactionControl;
      transaction((tx) => {
        saved = tx;
      });

      expect(() => saved.rollback()).toThrow(TypeError);
    });

    it('refuses a stale handle inside a later transaction', () => {
      let saved!: TransactionControl;
      transaction((tx) => {
        saved = tx;
      });

      const field = new Field({ value: 'a' });
      expect(() =>
        transaction(() => {
          field.value = 'b';
          saved.rollback();
        }),
      ).toThrow(TypeError);
      expect(field.value).toBe('a');
    });
  });
});
