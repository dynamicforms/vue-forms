import { expectTypeOf } from 'vitest';

import { Action, type ActionValue } from './action';
import Operator from './actions/conditional/operator';
import { Statement } from './actions/conditional/statement';
import DisplayMode from './display-mode';
import { Field } from './field';
import { FieldBase } from './field-base';
import { Group } from './group';
import { List } from './list';

/**
 * Type-level contract for the public construction surface. These assertions are enforced by `vue-tsc --noEmit`,
 * not by the vitest run: expectTypeOf is a no-op at runtime and a `@ts-expect-error` that stops suppressing is
 * itself a compile error, so both directions are pinned by the type check.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

describe('constructor inference', () => {
  it('infers the value type from the constructor parameters', () => {
    const str = new Field({ value: 'a' });
    expectTypeOf(str).toEqualTypeOf<Field<string>>();
    expectTypeOf(str.value).toEqualTypeOf<string>();
    expectTypeOf<IsAny<typeof str.value>>().toEqualTypeOf<false>();

    const num = new Field({ value: 1, enabled: false, validators: [] });
    expectTypeOf(num).toEqualTypeOf<Field<number>>();
    expectTypeOf(num.value).toEqualTypeOf<number>();

    expectTypeOf(new Field()).toEqualTypeOf<Field<any>>();
    expectTypeOf(new Field<string | undefined>()).toEqualTypeOf<Field<string | undefined>>();
  });

  it('accepts every writable member and rejects the read-only ones', () => {
    const field = new Field({
      value: 1,
      originalValue: 0,
      enabled: false,
      visibility: DisplayMode.SUPPRESS,
      touched: true,
      errors: [],
    });
    expectTypeOf(field).toEqualTypeOf<Field<number>>();

    // these expressions are never evaluated - assigning a getter-only member throws, and the type errors below
    // are what stops that from ever reaching runtime
    const rejected = () => [
      // @ts-expect-error valid is derived from errors and has no setter
      new Field({ value: 1, valid: true }),
      // @ts-expect-error fullValue is derived from value and has no setter
      new Field({ value: 1, fullValue: 1 }),
      // @ts-expect-error isChanged is derived from value and originalValue and has no setter
      new Field({ value: 1, isChanged: true }),
      // @ts-expect-error validating is derived from the running validators and has no setter
      new Field({ value: 1, validating: true }),
      // @ts-expect-error parent is read-only; the containing Group writes the slot behind it
      new Field({ value: 1, parent: undefined }),
    ];
    expect(rejected).toBeInstanceOf(Function);

    expect(() => new Field({ value: 1, valid: true } as any)).toThrow(TypeError);
  });

  it('carries the value type into Action', () => {
    const action = new Action({ value: { label: 'Save', icon: 'save' } });
    expectTypeOf(action.label).toEqualTypeOf<string | undefined>();
    expectTypeOf(action.icon).toEqualTypeOf<string | undefined>();
    expectTypeOf(new Action().value.label).toEqualTypeOf<string | undefined>();
  });
});

describe('extended properties', () => {
  interface Presentation {
    label: string;
    hint: string;
  }

  it('carries the type the element was declared with', () => {
    const field = new Field<string, Presentation>({ value: 'a', label: 'Name', hint: 'in full' });
    expectTypeOf(field).toEqualTypeOf<Field<string, Presentation>>();
    expectTypeOf(field.extra).toEqualTypeOf<Readonly<Partial<Presentation>>>();
    expectTypeOf(field.value).toEqualTypeOf<string>();

    const group = new Group<{ a: Field<number> }, Presentation>({ a: new Field({ value: 1 }) }, { label: 'Address' });
    expectTypeOf(group.extra).toEqualTypeOf<Readonly<Partial<Presentation>>>();
    const list = new List<{ a: Field<number> }, Presentation>(undefined, { label: 'Rows' });
    expectTypeOf(list.extra).toEqualTypeOf<Readonly<Partial<Presentation>>>();
    const action = new Action<ActionValue, Presentation>({ hint: 'saves the form' });
    expectTypeOf(action.extra).toEqualTypeOf<Readonly<Partial<Presentation>>>();
  });

  it('is empty on an element declared without one, and rejects a property it never declared', () => {
    const field = new Field({ value: 1 });
    expectTypeOf(field.extra).toEqualTypeOf<Readonly<{}>>();

    const rejected = () => [
      // @ts-expect-error an element with no extended properties declared takes none
      new Field({ value: 1, label: 'Name' }),
      // @ts-expect-error the same for a bind override
      field.bind(undefined, { label: 'Name' }),
      // @ts-expect-error and for a property the declaration does not carry
      new Field<number, Presentation>({ value: 1, placeholder: 'Name' }),
    ];
    expect(rejected).toBeInstanceOf(Function);
  });

  it('reads back as possibly absent, because nothing has to supply one', () => {
    // every extended property is optional in the parameter object, and setExtendedValues writes as few as it is
    // given, so a property the declaration states as required is present only once something wrote it
    const field = new Field<string, Presentation>({ value: 'a' });
    expectTypeOf(field.extra).toEqualTypeOf<Readonly<Partial<Presentation>>>();
    expectTypeOf(field.extra.label).toEqualTypeOf<string | undefined>();
  });

  it('reads back as read-only and is written through setExtendedValues', () => {
    const field = new Field<string, Presentation>({ value: 'a', label: 'Name', hint: 'in full' });
    field.setExtendedValues({ label: 'Full name' });

    const rejected = () => [
      // @ts-expect-error the object handed out is frozen; setExtendedValues is the write path
      (field.extra.label = 'Full name'),
      // @ts-expect-error a property the declaration does not carry is refused there too
      field.setExtendedValues({ placeholder: 'Name' }),
    ];
    expect(rejected).toBeInstanceOf(Function);
  });

  it('leaves an element with extended properties usable wherever a plain one is', () => {
    const field = new Field<string, Presentation>({ value: 'a', label: 'Name', hint: 'in full' });
    const base: FieldBase = field;
    const group = new Group({ name: field });

    expectTypeOf(base.extra).toEqualTypeOf<Readonly<{}>>();
    expectTypeOf(group.field('name')).toEqualTypeOf<Field<string, Presentation> | null>();
    expectTypeOf(field.bind()).toEqualTypeOf<Field<string, Presentation>>();
  });

  it('infers the value type over a union of value types', () => {
    const value = [1, 'a'][0] as string | number;
    expectTypeOf(new Field({ value })).toEqualTypeOf<Field<string | number>>();
  });
});

describe('Group value types', () => {
  it('derives the value structure from the field types', () => {
    const group = new Group({ ime: new Field({ value: 'x' }), leta: new Field({ value: 1 }) });

    expectTypeOf(group.value!.ime).toEqualTypeOf<string | undefined>();
    expectTypeOf(group.value!.leta).toEqualTypeOf<number | undefined>();
    expectTypeOf<IsAny<NonNullable<typeof group.value>['ime']>>().toEqualTypeOf<false>();
    expectTypeOf(group.fields.ime).toEqualTypeOf<Field<string>>();
    expectTypeOf(group.field('ime')).toEqualTypeOf<Field<string> | null>();
  });

  it('derives nested group and list values too', () => {
    const group = new Group({
      addr: new Group({ city: new Field({ value: 'x' }) }),
      rows: new List(new Group({ n: new Field({ value: 1 }) })),
    });

    expectTypeOf(group.value!.addr).toEqualTypeOf<{ city?: string } | null | undefined>();
    expectTypeOf(group.value!.addr!.city).toEqualTypeOf<string | undefined>();
    expectTypeOf(group.value!.rows).toEqualTypeOf<Record<string, any>[] | null | undefined>();
    expectTypeOf<IsAny<typeof group.value>>().toEqualTypeOf<false>();
  });
});

describe('List value types', () => {
  it('reads back a row array regardless of the item template', () => {
    const list = new List(new Group({ n: new Field({ value: 1 }) }));

    expectTypeOf(list.value).toEqualTypeOf<Record<string, any>[] | null>();
    expectTypeOf<IsAny<typeof list.value>>().toEqualTypeOf<false>();
    expectTypeOf(list.get(0)).toEqualTypeOf<Group<{ n: Field<number> }> | undefined>();
  });
});

describe('parent typing', () => {
  it('is a Group on a field and either container on an element that can be a row', () => {
    const field = new Field({ value: 1 });
    const group = new Group({ n: field });
    const list = new List(new Group({ n: new Field({ value: 1 }) }));
    const action = new Action();

    // a List holds rows and a row is a Group, so a field's container is a Group wherever there is one
    expectTypeOf(field.parent).toEqualTypeOf<Group | undefined>();
    expectTypeOf(action.parent).toEqualTypeOf<Group | undefined>();
    expectTypeOf(group.parent).toEqualTypeOf<Group | List | undefined>();
    expectTypeOf(list.parent).toEqualTypeOf<Group | List | undefined>();

    // the sibling lookup, typed on the field it is written against
    expectTypeOf(field.parent?.fields).toEqualTypeOf<Record<string, FieldBase> | undefined>();
  });

  it('refuses the sibling lookup on an element whose container may be a List', () => {
    const row = new Group({ n: new Field({ value: 1 }) });
    new List(row.bind()).push({ n: 1 });

    const rejected = () => [
      // @ts-expect-error a row's container is the List, which holds no named members
      row.parent?.fields,
    ];
    expect(rejected).toBeInstanceOf(Function);
  });
});

describe('field members', () => {
  it('exposes validating as a plain boolean', () => {
    const field = new Field({ value: 1 });
    expectTypeOf(field.validating).toEqualTypeOf<boolean>();
    // the documented guard pattern: comparing against the literal true must not be flagged as non-overlapping
    if (field.validating === true) expect(field.validating).toBe(true);
  });

  it('has no separate reactive value accessor', () => {
    const field = new Field({ value: 1 });
    // @ts-expect-error the field itself is reactive, so there is no wrapper member
    expect(field.reactiveValue).toBeUndefined();
    expect('reactiveValue' in field).toBe(false);
  });
});

describe('Statement construction', () => {
  it('asks for one operand under NOT and two under every other operator', () => {
    const flag = new Field<boolean>({ value: true });
    // an operator resolved at runtime, which is the shape a condition arriving from a server takes
    const fromServer: Operator = Operator.fromString('not');

    expectTypeOf(new Statement(flag, Operator.NOT)).toEqualTypeOf<Statement>();
    expectTypeOf(new Statement(flag, Operator.EQUALS, true)).toEqualTypeOf<Statement>();
    // NOT reads the first operand alone, so a second one is accepted and ignored
    expectTypeOf(new Statement(flag, Operator.NOT, null)).toEqualTypeOf<Statement>();
    expectTypeOf(new Statement(flag, fromServer, true)).toEqualTypeOf<Statement>();

    // never called: the assertion is that these do not compile, and the constructor would throw at runtime too
    const refused = () => {
      // @ts-expect-error a binary operator compares two operands and needs both
      new Statement(flag, Operator.EQUALS);
      // @ts-expect-error the compiler cannot tell a variable operator from NOT, so it asks for both
      new Statement(flag, fromServer);
    };
    expect(refused).toBeInstanceOf(Function);

    // what the compiler now refuses, the constructor refused at runtime all along
    // @ts-expect-error the call under test is the one the overload rejects
    expect(() => new Statement(flag, Operator.EQUALS)).toThrow(TypeError);
  });
});
