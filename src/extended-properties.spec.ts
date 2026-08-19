import { Action, type ActionValue } from './action';
import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { Validator } from './validators';
import { ValidationErrorText } from './validators/validation-error';

/** what a UI layer attaches to an element: the properties it binds to the input it renders the element with */
interface Presentation {
  label: string;
  hint: string;
}

describe('reading and writing extended properties', () => {
  it('starts with none and hands out a frozen object', () => {
    const field = new Field({ value: 1 });

    expect(field.extra).toEqual({});
    expect(Object.isFrozen(field.extra)).toBe(true);
    expect(() => {
      (field.extra as Record<string, any>).label = 'Name';
    }).toThrow(TypeError);
  });

  it('takes them from the constructor parameters and leaves the declared members to the element', () => {
    const field = new Field<number, Presentation>({ value: 1, enabled: false, label: 'Name', hint: 'in full' });

    expect(field.value).toBe(1);
    expect(field.enabled).toBe(false);
    expect(field.extra).toEqual({ label: 'Name', hint: 'in full' });
    // the properties live in the element's state, so nothing was written onto the element itself
    expect(Object.hasOwn(field, 'label')).toBe(false);
  });

  it('merges a write over the properties already held', () => {
    const field = new Field<number, Presentation>({ value: 1, label: 'Name', hint: 'in full' });

    field.setExtendedValues({ label: 'Full name' });

    expect(field.extra).toEqual({ label: 'Full name', hint: 'in full' });
  });

  it('still refuses a getter-only member named as a parameter', () => {
    expect(() => new Field({ value: 1, valid: true } as any)).toThrow(TypeError);
    expect(() => new Group({ a: new Field({ value: 1 }) }, { valid: true } as any)).toThrow(TypeError);
    // busy is one of them, so a presentation property of that name has no room on an element
    expect(() => new Field({ value: 1, busy: true } as any)).toThrow(TypeError);
  });

  it('carries them on a Group, a List and an Action', () => {
    const group = new Group<{ a: Field<number> }, Presentation>({ a: new Field({ value: 1 }) }, { label: 'Address' });
    const list = new List<{ a: Field<number> }, Presentation>(undefined, { label: 'Rows' });
    const action = new Action<{ label?: string; icon?: string }, { hint: string }>({ hint: 'saves the form' });

    expect(group.extra.label).toBe('Address');
    expect(list.extra.label).toBe('Rows');
    expect(action.extra.hint).toBe('saves the form');
    // Action declares label itself, so a parameter of that name reaches the action's own value and is no extra
    expect(new Action({ label: 'Save' } as any).label).toBe('Save');
    expect(new Action({ label: 'Save' } as any).extra).toEqual({});
  });
});

describe('binding', () => {
  it('carries the properties of the field it was bound from', () => {
    const field = new Field<number, Presentation>({ value: 1, label: 'Name', hint: 'in full' });

    const bound = field.bind();

    expect(bound.extra).toEqual({ label: 'Name', hint: 'in full' });
    expect(bound.extra).not.toBe(field.extra);
  });

  it('writes the overrides over them and leaves the ones the overrides do not name', () => {
    const field = new Field<number, Presentation>({ value: 1, label: 'Name', hint: 'in full' });

    const bound = field.bind(2, { label: 'Full name' });

    expect(bound.value).toBe(2);
    expect(bound.extra).toEqual({ label: 'Full name', hint: 'in full' });
    expect(field.extra.label).toBe('Name');
  });

  it('carries them through a group binding, members included', () => {
    const group = new Group<{ a: Field<number, Presentation> }, Presentation>(
      { a: new Field<number, Presentation>({ value: 1, label: 'Amount', hint: 'in euros' }) },
      { label: 'Address' },
    );

    const bound = group.bind();

    expect(bound.extra.label).toBe('Address');
    expect(bound.fields.a.extra).toEqual({ label: 'Amount', hint: 'in euros' });
  });

  it('carries them through a list binding and onto every row the item template builds', () => {
    const template = new Group({ a: new Field<number, Presentation>({ value: 0, label: 'Amount', hint: 'in euros' }) });
    const list = new List<{ a: Field<number, Presentation> }, Presentation>(template, {
      value: [{ a: 1 }, { a: 2 }],
      label: 'Rows',
    });

    expect(list.get(0)!.fields.a.extra).toEqual({ label: 'Amount', hint: 'in euros' });
    expect(list.get(1)!.fields.a.extra).toEqual({ label: 'Amount', hint: 'in euros' });
    expect(list.bind().extra.label).toBe('Rows');
  });

  it('has them in place before the eager actions the binding takes on run', () => {
    const validator = new Validator<number>((newValue, oldValue, field) =>
      (field as Field<number, Presentation>).extra.label ? null : [new ValidationErrorText('no label')],
    );
    const field = new Field<number, Presentation>({
      value: 1,
      label: 'Name',
      hint: 'in full',
      validators: [validator],
    });
    expect(field.valid).toBe(true);

    const bound = field.bind();

    expect(bound.errors).toEqual([]);
    expect(bound.valid).toBe(true);
  });
});

describe('transactions', () => {
  it('puts back the properties a rolled-back transaction wrote', () => {
    const field = new Field<number, Presentation>({ value: 1, label: 'Name', hint: 'in full' });

    transaction((tx) => {
      field.setExtendedValues({ label: 'Full name' });
      expect(field.extra.label).toBe('Full name');
      tx.rollback();
    });

    expect(field.extra).toEqual({ label: 'Name', hint: 'in full' });
  });

  it('keeps what a committed transaction wrote', () => {
    const field = new Field<number, Presentation>({ value: 1, label: 'Name', hint: 'in full' });

    transaction(() => field.setExtendedValues({ hint: 'family name' }));

    expect(field.extra).toEqual({ label: 'Name', hint: 'family name' });
  });
});

describe('what a parameter object states but does not attach', () => {
  it('leaves the registrations a bind override names out of the extended properties', () => {
    const validator = new Validator<number>(() => null);
    const field = new Field<number, Presentation>({ value: 1, label: 'Name', hint: 'in full' });

    const bound = field.bind(undefined, { validators: [validator], actions: [] });

    expect(Object.keys(bound.extra)).toEqual(['label', 'hint']);
    // and a binding of that binding carries the same set, rather than one that grows with every generation
    expect(Object.keys(bound.bind().extra)).toEqual(['label', 'hint']);
  });

  it('leaves them out on a group, a list and an action too', () => {
    const validator = new Validator(() => null);
    const group = new Group<{ a: Field<number> }, Presentation>({ a: new Field({ value: 1 }) }, { label: 'Address' });
    const list = new List<{ a: Field<number> }, Presentation>(undefined, { label: 'Rows' });
    const action = new Action<ActionValue, Presentation>({ hint: 'saves the form' });

    expect(Object.keys(group.bind(undefined, { validators: [validator] }).extra)).toEqual(['label']);
    expect(Object.keys(list.bind(undefined, { validators: [validator] }).extra)).toEqual(['label']);
    expect(Object.keys(action.bind(undefined, { validators: [validator] }).extra)).toEqual(['hint']);
  });
});

describe('a parameter object carrying __proto__', () => {
  it('assigns the members it names and keeps the key an extended property', () => {
    const field = new Field<number, Presentation>(
      JSON.parse('{"__proto__":{"enabled":false},"enabled":false,"hint":"in full"}'),
    );

    expect(field.enabled).toBe(false);
    expect(field.extra.hint).toBe('in full');
    expect(Object.hasOwn(field.extra, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(field)).toBe(Field.prototype);
    expect(Object.hasOwn(Object.prototype, 'enabled')).toBe(false);
  });

  it('assigns the visibility it names', () => {
    const field = new Field(JSON.parse('{"__proto__":{"visibility":1},"visibility":1}'));

    expect(field.visibility).toBe(DisplayMode.SUPPRESS);
  });

  it('assigns the members it names on a group', () => {
    const group = new Group(
      { a: new Field({ value: 1 }) },
      JSON.parse('{"__proto__":{"enabled":false},"enabled":false}'),
    );

    expect(group.enabled).toBe(false);
  });
});

describe('a subclass naming a parameter after one of its own members', () => {
  it('assigns it through an accessor the subclass declares', () => {
    class Coded extends Field<number, Presentation> {
      get code(): string | undefined {
        return this.extra.hint;
      }

      set code(newValue: string) {
        this.setExtendedValues({ hint: newValue });
      }
    }

    const field = new Coded({ value: 1, code: 'given' } as any);

    expect(field.code).toBe('given');
    expect(field.extra).toEqual({ hint: 'given' });
  });

  it('makes it an extended property where the subclass declares a class field', () => {
    class Coded extends Field<number, { code: string }> {
      code = 'declared';
    }

    const field = new Coded({ value: 1, code: 'given' });

    // the class field is defined on the instance once the base constructor has returned, so the element does not
    // answer for the name while the parameters are applied
    expect(field.code).toBe('declared');
    expect(field.extra.code).toBe('given');
  });
});
