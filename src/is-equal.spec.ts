import { Field } from './field';
import { Group } from './group';
import { isEqual } from './is-equal';
import { List } from './list';

it('compares two fields by their value', () => {
  const a = new Field({ value: 'John' });
  const b = new Field({ value: 'John' });
  const c = new Field({ value: 'Jane' });

  expect(isEqual(a, b)).toBe(true);
  expect(isEqual(a, c)).toBe(false);
});

it('compares a field against a plain value', () => {
  const a = new Field({ value: 'John' });

  expect(isEqual(a, 'John')).toBe(true);
  expect(isEqual('John', a)).toBe(true);
  expect(isEqual(a, 'Jane')).toBe(false);
});

it('compares two groups by their composed value', () => {
  const build = () => new Group({ name: new Field({ value: 'John' }), age: new Field({ value: 30 }) });
  const a = build();
  const b = build();
  const c = new Group({ name: new Field({ value: 'Jane' }), age: new Field({ value: 30 }) });

  expect(isEqual(a, b)).toBe(true);
  expect(isEqual(a, c)).toBe(false);
});

it('compares an array of rows element by element, unwrapping each one', () => {
  const template = new Group({ name: new Field({ value: '' }) });
  const list1 = new List(template, { value: [{ name: 'John' }, { name: 'Jane' }] });
  const list2 = new List(template, { value: [{ name: 'John' }, { name: 'Jane' }] });
  const list3 = new List(template, { value: [{ name: 'John' }, { name: 'Bob' }] });

  expect(isEqual(list1.items, list2.items)).toBe(true);
  expect(isEqual(list1.items, list3.items)).toBe(false);
});

it('unwraps a field nested inside a plain object', () => {
  const a = { field: new Field({ value: 'John' }) };
  const b = { field: new Field({ value: 'John' }) };
  const c = { field: new Field({ value: 'Jane' }) };

  expect(isEqual(a, b)).toBe(true);
  expect(isEqual(a, c)).toBe(false);
});

it('falls back to lodash structural comparison for plain values', () => {
  expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
  expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
});
