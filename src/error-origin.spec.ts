import { Field } from './field';
import { ValidationError, Validators } from './validators';

const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });

describe('The origin of an error', () => {
  it('is the one its author states, and otherwise validator or application by who wrote it', () => {
    const field = required('');

    expect(field.errors[0].origin).toBe('validator');
    expect(new ValidationError('taken').origin).toBe('application');
    expect(new ValidationError('taken', '', 'taken', 'server').origin).toBe('server');
    expect(new ValidationError('stale', '', 'stale', 'sync').origin).toBe('sync');
  });
});
