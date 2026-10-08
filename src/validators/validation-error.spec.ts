import { Field } from '../field';

import { ValidationError } from './validation-error';
import { Validator } from './validator';

describe('ValidationError', () => {
  it('holds the code, params and detail it is built with', () => {
    const error = new ValidationError('min_value', { minValue: 3 }, 'Value must be larger or equal to 3');

    expect(error.code).toBe('min_value');
    expect(error.params).toEqual({ minValue: 3 });
    expect(error.detail).toBe('Value must be larger or equal to 3');
  });

  it('stores the detail as given, without substituting params', () => {
    expect(new ValidationError('min_value', { minValue: 3 }, 'At least {minValue}').detail).toBe('At least {minValue}');
  });

  it('answers the stated origin, and application for an error no validator produced', () => {
    expect(new ValidationError('taken', {}, 'Taken', 'server').origin).toBe('server');
    expect(new ValidationError('taken', {}, 'Taken').origin).toBe('application');
  });

  it('answers validator for an error a validator produced', () => {
    const field = new Field({ value: '' });
    field.errors.push(new ValidationError('own', {}, 'Own'));

    const validated = new Field({
      value: 1,
      validators: [new Validator(() => [new ValidationError('bad', {}, 'Bad')])],
    });

    expect(field.errors[0].origin).toBe('application');
    expect(validated.errors[0].origin).toBe('validator');
  });
});

describe('sameAs', () => {
  it('is true for errors of one class with equal code, params, detail and stated origin', () => {
    const a = new ValidationError('min_value', { minValue: 3 }, 'At least 3', 'server');
    const b = new ValidationError('min_value', { minValue: 3 }, 'At least 3', 'server');

    expect(a.sameAs(b)).toBe(true);
  });

  it('is false where any of them differs', () => {
    const base = new ValidationError('min_value', { minValue: 3 }, 'At least 3');

    expect(base.sameAs(new ValidationError('max_value', { minValue: 3 }, 'At least 3'))).toBe(false);
    expect(base.sameAs(new ValidationError('min_value', { minValue: 4 }, 'At least 3'))).toBe(false);
    expect(base.sameAs(new ValidationError('min_value', { minValue: 3 }, 'At least 4'))).toBe(false);
    expect(base.sameAs(new ValidationError('min_value', { minValue: 3 }, 'At least 3', 'server'))).toBe(false);
  });

  it('is false for a subclass with the same data', () => {
    class ServerError extends ValidationError {}

    expect(new ValidationError('x', {}, 'X').sameAs(new ServerError('x', {}, 'X'))).toBe(false);
  });
});
