import { computed } from 'vue';

import { Action } from './action';
import { elementAt } from './element-at';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';

const createOrder = () =>
  new Group({
    email: new Field({ value: 'a@b.c' }),
    weekdays: new Field({ value: [1, 3] }),
    address: new Group({ city: new Field({ value: 'Kranj' }) }),
    items: new List(new Group({ price: new Field({ value: 1 }) }), { value: [{ price: 1 }, { price: -2 }] }),
    tags: new List(new Field({ value: '' }), { value: ['a', 'b'] }),
    save: new Action({ value: { label: 'Save' } }),
  });

describe('elementAt', () => {
  it('walks group members and list rows by a dotted path and by an array path', () => {
    const form = createOrder();
    const price = form.fields.items.get(1)!.fields.price;

    expect(elementAt(form, 'items.1.price')).toBe(price);
    expect(elementAt(form, ['items', 1, 'price'])).toBe(price);
    expect(elementAt(form, ['items', '1', 'price'])).toBe(price);
    expect(elementAt(form, 'address.city')).toBe(form.fields.address.fields.city);
    expect(elementAt(form, 'items.0')).toBe(form.fields.items.get(0));
    expect(elementAt(form, 'tags.1')).toBe(form.fields.tags.get(1));
    expect(elementAt(form, 'save')).toBe(form.fields.save);
  });

  it('starts at the root it is given, a list included', () => {
    const form = createOrder();

    expect(elementAt(form.fields.items, '1.price')).toBe(form.fields.items.get(1)!.fields.price);
    expect(elementAt(form.fields.items, [0])).toBe(form.fields.items.get(0));
  });

  it('returns the root for an empty path', () => {
    const form = createOrder();

    expect(elementAt(form, '')).toBe(form);
    expect(elementAt(form, [])).toBe(form);
    expect(elementAt(form.fields.email, '')).toBe(form.fields.email);
  });

  it('returns undefined for a member or row the form does not hold', () => {
    const form = createOrder();

    expect(elementAt(form, 'phone')).toBeUndefined();
    expect(elementAt(form, 'address.zip')).toBeUndefined();
    expect(elementAt(form, 'items.7.price')).toBeUndefined();
    expect(elementAt(form, 'items.1.cost')).toBeUndefined();
    expect(elementAt(form, ['items', -1])).toBeUndefined();
  });

  it('reads a group step as a member name, not as an inherited property', () => {
    const form = createOrder();

    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(elementAt(form, key)).toBeUndefined();
    }
    expect(elementAt(form, ['address', 0])).toBeUndefined();
  });

  it('accepts a list step only as a non-negative integer', () => {
    const form = createOrder();

    for (const key of ['', ' 1', '1 ', '01', '1e0', '0x1', '+1', '-0', 'NaN', 'Infinity', 'first']) {
      expect(elementAt(form, ['items', key])).toBeUndefined();
    }
    for (const key of [1.5, -1, NaN, Infinity, 2 ** 53]) {
      expect(elementAt(form, ['items', key])).toBeUndefined();
    }
    expect(elementAt(form, 'items.')).toBeUndefined();
    expect(elementAt(form, 'items..price')).toBeUndefined();
    expect(elementAt(form, ['items', '0'])).toBe(form.fields.items.get(0));
    expect(elementAt(form, ['items', 0])).toBe(form.fields.items.get(0));
  });

  it('returns undefined for a path below an element that is neither a group nor a list', () => {
    const form = createOrder();

    expect(elementAt(form, 'weekdays.0')).toBeUndefined();
    expect(elementAt(form, 'save.label')).toBeUndefined();
    expect(elementAt(form, 'tags.1.x')).toBeUndefined();
  });

  it('with nearest, returns the element the path goes on below', () => {
    const form = createOrder();

    expect(elementAt(form, 'weekdays.0', { nearest: true })).toBe(form.fields.weekdays);
    expect(elementAt(form, 'weekdays.0.x', { nearest: true })).toBe(form.fields.weekdays);
    expect(elementAt(form, 'tags.1.x', { nearest: true })).toBe(form.fields.tags.get(1));
    expect(elementAt(form, 'address.city', { nearest: true })).toBe(form.fields.address.fields.city);
  });

  it('with nearest, still returns undefined for a missing member or row', () => {
    const form = createOrder();

    expect(elementAt(form, 'address.zip', { nearest: true })).toBeUndefined();
    expect(elementAt(form, 'items.7.price', { nearest: true })).toBeUndefined();
    expect(elementAt(form, 'items.x.price', { nearest: true })).toBeUndefined();
  });

  it('follows rows added and removed after the list was built', () => {
    const form = createOrder();
    const items = form.fields.items;

    items.push({ price: 5 });
    expect((elementAt(form, 'items.2.price') as Field<number>).value).toBe(5);
    items.remove(0);
    expect(elementAt(form, 'items.2.price')).toBeUndefined();
    expect((elementAt(form, 'items.0.price') as Field<number>).value).toBe(-2);
  });

  it('narrows its result by instanceof or by a cast, as the API page shows', () => {
    const order = new Group({
      address: new Group({ city: new Field({ value: 'Kranj' }) }),
      items: new List(new Group({ price: new Field({ value: 0 }) }), { value: [{ price: 1 }, { price: 2 }] }),
    });

    const price = elementAt(order, 'items.1.price');
    if (price instanceof Field) price.value = 0;
    expect(order.value.items).toEqual([{ price: 1 }, { price: 0 }]);

    const city = elementAt(order, 'address.city') as Field<string> | undefined;
    expect(city?.value).toBe('Kranj');

    const items = elementAt(order, 'items') as List<Group<{ price: Field<number> }>>;
    items.push({ price: 3 });
    expect(order.value.items).toEqual([{ price: 1 }, { price: 0 }, { price: 3 }]);
  });

  it('inside a computed, follows members and rows added and removed', () => {
    const form = new Group<any>({ items: new List(new Field({ value: 0 }), { value: [1] }) });
    const member = computed(() => elementAt(form, 'note'));
    const row = computed(() => elementAt(form, 'items.1'));

    expect(member.value).toBeUndefined();
    expect(row.value).toBeUndefined();
    form.addField('note', new Field({ value: '' }));
    form.fields.items.push(2);
    expect(member.value).toBe(form.field('note'));
    expect(row.value).toBe(form.fields.items.get(1));
    form.removeField('note');
    expect(member.value).toBeUndefined();
  });
});
