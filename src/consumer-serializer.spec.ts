import { expectTypeOf } from 'vitest';

import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';

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

    form.fields.address.fields.zip.enabled = false;
    form.fields.lines.get(0)!.fields.qty.enabled = false;

    expect(form.value).toEqual({
      reference: 'ORD-1',
      address: { city: 'Ljubljana' },
      lines: [{ sku: 'a-1' }, { sku: 'b-7', qty: 5 }],
    });
    expect(form.fullValue).toEqual(record);
  });

  it('states an empty list as null, where fullValue states it as an array', () => {
    const form = orderForm();

    expect(form.value).toEqual({ reference: '', address: { city: '', zip: '' }, lines: null });
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

  it('leaves a disabled member holding what it holds', () => {
    const form = orderForm();
    form.value = record;
    form.fields.address.fields.zip.enabled = false;

    form.value = { address: { city: 'Maribor', zip: '2000' } };

    expect(form.fields.address.fields.zip.value).toBe('1000');
    expect(form.value).toEqual({ ...record, address: { city: 'Maribor' } });
    expect(form.fullValue).toEqual({ ...record, address: { city: 'Maribor', zip: '1000' } });
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

describe('The visibility a payload names', () => {
  it('resolves to the constant it names, and an unknown one is refused where isDefined judges it', () => {
    const descriptor = { visibility: 'hidden' };

    const field = new Field({ value: 'a', visibility: DisplayMode.fromAny(descriptor.visibility) });

    expect(field.visibility).toBe(DisplayMode.HIDDEN);
    expect(() => DisplayMode.fromAny('EXPANDED')).toThrow('is not a DisplayMode constant');
    // the question that answers rather than raises, which is the one a deserializer asks of a mode it may reject
    expect(DisplayMode.isDefined('EXPANDED')).toBe(false);
    expect(DisplayMode.isDefined(descriptor.visibility)).toBe(true);
  });
});

/**
 * The assertions below are held by the type checker rather than by the test runner: tsconfig's include set covers
 * every file under `src`, so `vue-tsc --noEmit` reports a mismatched `expectTypeOf` and an `@ts-expect-error` over
 * an expression that in fact type-checks.
 */
describe('The types a serializer is written against', () => {
  it('reads a member off value as possibly absent, and off fullValue as present', () => {
    const form = orderForm();
    const send = (reference: string) => reference;

    expectTypeOf(form.value!.reference).toEqualTypeOf<string | undefined>();
    expectTypeOf(form.value!.address).toEqualTypeOf<{ city?: string; zip?: string } | null | undefined>();
    expectTypeOf(form.fullValue.reference).toEqualTypeOf<string>();
    expectTypeOf(form.fullValue.address.city).toEqualTypeOf<string>();
    expectTypeOf(form.fullValue.lines).toEqualTypeOf<{ sku: string; qty: number }[]>();

    // never evaluated: the assertion is that a serializer handing a member on has to account for its absence
    const rejected = () => [
      // @ts-expect-error a disabled member is left out of value, so every key of it reads as possibly undefined
      send(form.value!.reference),
      send(form.fullValue.reference),
    ];
    expect(rejected).toBeInstanceOf(Function);
  });
});
