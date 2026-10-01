import { computed } from 'vue';

import { setConfig } from './config';
import { Field } from './field';
import { Group } from './group';
import { ValidationErrorText, Validators } from './validators';

const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });
const texts = (errors: readonly unknown[]) => errors.map((error) => (error as ValidationErrorText).text);

describe('The origin of an error', () => {
  it('is the one its author states, and otherwise validator or application by who wrote it', () => {
    const field = required('');

    expect(field.errors[0].origin).toBe('validator');
    expect(new ValidationErrorText('taken').origin).toBe('application');
    expect(new ValidationErrorText('taken', '', 'taken', 'server').origin).toBe('server');
    expect(new ValidationErrorText('stale', '', 'stale', 'sync').origin).toBe('sync');
  });
});

describe('shownErrors', () => {
  afterEach(() => setConfig({ shownErrors: undefined }));

  it('holds an error back until the element is touched, while valid states it at once', () => {
    const field = required('');
    field.errors.push(new ValidationErrorText('computed here'));
    field.validate();

    expect(field.valid).toBe(false);
    expect(field.shownErrors).toEqual([]);

    field.touched = true;
    expect(field.shownErrors).toHaveLength(2);
  });

  it('shows an error the server returned at once', () => {
    const field = required('x');

    field.errors.push(new ValidationErrorText('taken', '', 'taken', 'server'));
    field.validate();

    expect(texts(field.shownErrors)).toEqual(['taken']);
  });

  it('shows nothing on an element that is sent nowhere', () => {
    const field = required('');
    const section = new Group({ field });
    field.touched = true;
    field.errors.push(new ValidationErrorText('taken', '', 'taken', 'server'));

    section.access = 'disabled-null';

    expect(field.effectiveAccess).toBe('disabled');
    expect(field.shownErrors).toEqual([]);
  });

  it("shows a container's own error once any child is touched", () => {
    const budget = new Validators.Validator((value: any) =>
      value.a + value.b > 10 ? [new ValidationErrorText('over budget')] : null,
    );
    const form = new Group({ a: new Field({ value: 8 }), b: new Field({ value: 8 }) }, { validators: [budget] });

    expect(form.valid).toBe(false);
    expect(form.shownErrors).toEqual([]);

    form.fields.a.touched = true;
    expect(texts(form.shownErrors)).toEqual(['over budget']);
  });

  it('is tracked, so a computed over it follows touched', () => {
    const field = required('');
    const count = computed(() => field.shownErrors.length);

    expect(count.value).toBe(0);
    field.touched = true;
    expect(count.value).toBe(1);
  });

  it('asks the configured condition for every error, with the default answer, and takes its answer', () => {
    const asked: [string, boolean][] = [];
    // an origin of the application's own is shown at once, everything else as the default rule has it
    setConfig({
      shownErrors: (error, element, shownByDefault) => {
        asked.push([error.origin, shownByDefault]);
        return error.origin === 'sync' || shownByDefault;
      },
    });
    const field = required('');
    field.errors.push(new ValidationErrorText('stale', '', 'stale', 'sync'));
    field.validate();

    expect(texts(field.shownErrors)).toEqual(['stale']);
    expect(asked).toEqual([
      ['validator', false],
      ['sync', false],
    ]);
  });
});
