import { expectTypeOf } from 'vitest';

import { isAccess } from './access';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { isVisibility } from './visibility';

/**
 * What a serializer works over: the whole of a form in one read, and a whole record in one write. The elements
 * below stand for the three shapes a payload is built out of - scalars, a nested object and a row array - and the
 * assertions are about the object that crosses the boundary rather than about any one member of it.
 */
const orderForm = () =>
  new Group({
    reference: new Field({ value: '' }),
    address: new Group({ city: new Field({ value: '' }), zip: new Field({ value: '' }) }),
    lines: new List(new Group({ sku: new Field({ value: '' }), qty: new Field<number>({ value: 0 }) })),
  });

const record = {
  reference: 'ORD-1',
  address: { city: 'Ljubljana', zip: '1000' },
  lines: [
    { sku: 'a-1', qty: 2 },
    { sku: 'b-7', qty: 5 },
  ],
};

describe('The payload a form reads back', () => {
  it('answers with the record that was written into it, nested group and rows alike', () => {
    const form = orderForm();

    form.value = record;

    expect(form.value).toEqual(record);
    expect(JSON.parse(JSON.stringify(form.value))).toEqual(record);
  });

  it('leaves out a disabled member at any depth, and fullValue carries it', () => {
    const form = orderForm();
    form.value = record;

    form.fields.address.fields.zip.access = 'disabled';
    form.fields.lines.get(0)!.fields.qty.access = 'disabled';

    expect(form.value).toEqual({
      reference: 'ORD-1',
      address: { city: 'Ljubljana' },
      lines: [{ sku: 'a-1' }, { sku: 'b-7', qty: 5 }],
    });
    expect(form.fullValue).toEqual(record);
  });

  it('states an empty list as an array in value and in fullValue alike', () => {
    const form = orderForm();

    expect(form.value).toEqual({ reference: '', address: { city: '', zip: '' }, lines: [] });
    expect(form.fullValue).toEqual({ reference: '', address: { city: '', zip: '' }, lines: [] });
  });

  it('is frozen to the bottom, so a consumer adding to it copies first', () => {
    const form = orderForm();
    form.value = record;
    const payload = form.value!;

    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.address)).toBe(true);
    expect(Object.isFrozen(payload.lines)).toBe(true);
    expect(Object.isFrozen(payload.lines![0])).toBe(true);
    expect(() => {
      (payload as any).reference = 'ORD-2';
    }).toThrow();
    expect(() => {
      (payload.lines![0] as any).qty = 99;
    }).toThrow();

    // what the form reports stands, and the envelope a request needs is a copy
    expect(form.value).toEqual(record);
    expect({ ...payload, csrf: 'token' }).toEqual({ ...record, csrf: 'token' });
  });
});

describe('The payload a form is written from', () => {
  it('writes the keys it carries and leaves every other member as it stands', () => {
    const form = orderForm();
    form.value = record;

    form.value = { reference: 'ORD-2' };

    expect(form.value).toEqual({ ...record, reference: 'ORD-2' });
  });

  it('writes a disabled member, and leaves it out of the payload', () => {
    const form = orderForm();
    form.value = record;
    form.fields.address.fields.zip.access = 'disabled';

    form.value = { address: { city: 'Maribor', zip: '2000' } };

    expect(form.fields.address.fields.zip.value).toBe('2000');
    expect(form.value).toEqual({ ...record, address: { city: 'Maribor' } });
    expect(form.fullValue).toEqual({ ...record, address: { city: 'Maribor', zip: '2000' } });
  });

  it('refuses a record whose rows are not an array, and leaves the form as it was', () => {
    const form = orderForm();
    form.value = record;

    expect(() => {
      form.value = { reference: 'ORD-2', lines: { sku: 'a-1', qty: 2 } as any };
    }).toThrow(TypeError);

    // the members are written in one transaction, so the refusal takes back the keys already written with it
    expect(form.value).toEqual(record);
  });
});

describe('The visibility and access a payload names', () => {
  it('takes the ones it names, and isVisibility and isAccess judge an unknown one before it is written', () => {
    const descriptor: Record<string, unknown> = { visibility: 'hidden', access: 'readonly' };

    expect(isVisibility(descriptor.visibility)).toBe(true);
    expect(isAccess(descriptor.access)).toBe(true);
    const field = new Field({ value: 'a', ...descriptor });

    expect(field.visibility).toBe('hidden');
    expect(field.access).toBe('readonly');
    // the questions that answer rather than raise, which are the ones a deserializer asks of a value it may reject
    expect(isVisibility('EXPANDED')).toBe(false);
    expect(isAccess(false)).toBe(false);
    expect(() => new Field({ value: 'a', ...({ visibility: 'EXPANDED' } as object) })).toThrow('is not a visibility');
  });

  it('refuses a payload naming enabled, which is read from access', () => {
    const descriptor: Record<string, unknown> = { enabled: false };

    expect(() => new Field({ value: 'a', ...descriptor })).toThrow('enabled is read from access');
    expect(() => new Field({ value: 'a' }).bind('b', descriptor)).toThrow('enabled is read from access');
  });
});

/**
 * The assertions below are held by the type checker rather than by the test runner: tsconfig's include set covers
 * every file under `src`, so `vue-tsc --noEmit` reports a mismatched `expectTypeOf` and an `@ts-expect-error` over
 * an expression that in fact type-checks.
 */
describe('The types a serializer is written against', () => {
  it('reads a member off value as possibly absent or null, and off fullValue as it is held', () => {
    const form = orderForm();
    const send = (reference: string) => reference;

    // the form itself is never null: a group that serializes does so as {} where no member contributes
    expectTypeOf(form.value.reference).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(form.value.address).toEqualTypeOf<{ city?: string | null; zip?: string | null } | null | undefined>();
    expectTypeOf(form.fullValue.reference).toEqualTypeOf<string>();
    expectTypeOf(form.fullValue.address).toEqualTypeOf<{ city: string; zip: string }>();
    expectTypeOf(form.fullValue.lines).toEqualTypeOf<{ sku: string; qty: number }[]>();

    // never evaluated: the assertion is that a serializer handing on a member of value has to account for a member
    // that is left out ('disabled') and for one that is null ('disabled-null'), while fullValue reads through
    const handed = () => [
      // @ts-expect-error a member may be left out of value or be null there
      send(form.value.reference),
      send(form.fullValue.reference),
    ];
    expect(handed).toBeInstanceOf(Function);
  });
});
