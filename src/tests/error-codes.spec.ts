import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { vi } from 'vitest';

import { Field } from '../field';
import { Validators } from '../validators';
import { ValidationError } from '../validators/validation-error';

/** The messages docs/guide/getting-started.md lists for a locale to start from, by error code. */
const documented = (): Record<string, string> => {
  const page = readFileSync(resolve(__dirname, '../../docs/guide/getting-started.md'), 'utf8');
  const block = page.match(/```json\n(\{\n {2}"errors": \{\n[\s\S]*?)\n```/);
  return JSON.parse(block![1]).errors;
};

const substitute = (template: string, params: Readonly<Record<string, unknown>>) =>
  template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );

/** One failing field per code the library raises. */
const failing: Record<string, () => Field<any>> = {
  required: () => new Field({ value: '', validators: [new Validators.Required()] }),
  pattern: () => new Field({ value: 'ab', validators: [new Validators.Pattern(/^\d+$/)] }),
  min_value: () => new Field({ value: 1, validators: [new Validators.MinValue(5)] }),
  max_value: () => new Field({ value: 9, validators: [new Validators.MaxValue(5)] }),
  value_in_range: () => new Field({ value: 9, validators: [new Validators.ValueInRange(1, 5)] }),
  min_length: () => new Field({ value: 'ab', validators: [new Validators.MinLength(5)] }),
  max_length: () => new Field({ value: 'abcdef', validators: [new Validators.MaxLength(5)] }),
  length_in_range: () => new Field({ value: 'abcdef', validators: [new Validators.LengthInRange(1, 5)] }),
  in_allowed_values: () => new Field({ value: 'x', validators: [new Validators.InAllowedValues(['a', 'b'])] }),
  compare_to: () => {
    const other = new Field({ value: 'b' });
    return new Field({ value: 'a', validators: [new Validators.CompareTo(other, (mine, theirs) => mine === theirs)] });
  },
  validation_failed: () =>
    new Field({ value: 'a', validators: [new Validators.Validator(() => Promise.reject(new Error('unreachable')))] }),
};

describe('the error messages the getting started guide lists', () => {
  it('name every code the library raises, and no other', () => {
    expect(Object.keys(documented()).sort()).toEqual(Object.keys(failing).sort());
  });

  it.each(Object.keys(failing))(
    'give %s the English detail of the error, with its params substituted',
    async (code) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const field = failing[code]();
      await field.settled();
      consoleError.mockRestore();

      const error = field.errors[0] as ValidationError;
      expect(error.code).toBe(code);
      expect(substitute(documented()[code], error.params)).toBe(error.detail);
    },
  );
});
