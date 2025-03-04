import { vi } from 'vitest';

import { ValueChangedAction, ListItemAddedAction, ListItemRemovedAction } from './actions';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';

describe('List', () => {
  it('correctly initializes with empty array', () => {
    const list = new List();
    expect(list.value).toBeNull();
    expect(list.get(0)).toBeUndefined();
  });

  it('initializes with values', () => {
    const list = new List(undefined, {
      value: [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ],
    });

    expect(list.value).toEqual([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ]);

    // Check that items are Group instances
    expect(list.get(0)).toBeInstanceOf(Group);
    expect(list.get(0)?.fields.name.value).toBe('John');
  });

  it('initializes with template groups', () => {
    const template = new Group({
      name: new Field({ value: '' }),
      age: new Field({ value: 0 }),
      active: new Field({ value: true }),
    });

    const list = new List(template, {
      value: [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ],
    });

    // Check that the template fields are used with provided values
    expect(list.get(0)?.fields.name.value).toBe('John');
    expect(list.get(0)?.fields.age.value).toBe(30);
    expect(list.get(0)?.fields.active.value).toBe(true); // Default from template
  });

  it('triggers value changed on push', () => {
    const onValueChanged = vi.fn();
    const list = new List()
      .registerAction(new ValueChangedAction(onValueChanged));

    list.push({ name: 'John' });

    expect(onValueChanged).toHaveBeenCalled();
    expect(list.value).toEqual([{ name: 'John' }]);
  });

  it('triggers ArrayItemAddedAction on push', () => {
    const onItemAdded = vi.fn();
    const list = new List()
      .registerAction(new ListItemAddedAction(onItemAdded));

    list.push({ name: 'John' });

    expect(onItemAdded).toHaveBeenCalledWith(
      list,
      expect.any(Function),
      expect.any(Object), // The Group object
      expect.any(Number), // Index
    );
  });

  it('correctly handles push operation', () => {
    const list = new List();

    // First push
    const len1 = list.push({ name: 'John' });
    expect(len1).toBe(1);
    expect(list.value).toEqual([{ name: 'John' }]);

    // Second push
    const len2 = list.push({ name: 'Jane' });
    expect(len2).toBe(2);
    expect(list.value).toEqual([{ name: 'John' }, { name: 'Jane' }]);
  });

  it('triggers ArrayItemRemovedAction on pop', () => {
    const onItemRemoved = vi.fn();
    const list = new List(undefined, { value: [{ name: 'John' }] })
      .registerAction(new ListItemRemovedAction(onItemRemoved));

    const popped = list.pop();

    expect(onItemRemoved).toHaveBeenCalledWith(
      list,
      expect.any(Function),
      expect.any(Object), // The removed Group
      0, // Index
    );
    expect(list.value).toBeNull();
    expect(popped?.value).toEqual({ name: 'John' });
  });

  it('updates parent on changes', () => {
    const notifyMock = vi.fn();
    const parent = new Group({ people: new List() });

    // Mock the notifyValueChanged method
    parent.notifyValueChanged = notifyMock;

    const list = parent.fields.people;
    list.push({ name: 'John' });

    expect(notifyMock).toHaveBeenCalled();
  });

  it('performs insert operations', () => {
    const list = new List(undefined, {
      value: [
        { name: 'First' },
        { name: 'Last' },
      ],
    });

    // Insert in the middle
    list.insert({ name: 'Middle' }, 1);

    expect(list.value).toEqual([
      { name: 'First' },
      { name: 'Middle' },
      { name: 'Last' },
    ]);
  });

  it('handles insert at higher index than length', () => {
    const list = new List();

    // Insert at index 3 in an empty list
    list.insert({ name: 'Test' }, 3);

    // Should create null entries to fill gaps
    expect(list.get(0)?.value).toBeNull();
    expect(list.get(1)?.value).toBeNull();
    expect(list.get(2)?.value).toBeNull();
    expect(list.get(3)?.value).toEqual({ name: 'Test' });

    // Check length
    expect(list.value?.length).toBe(4);
  });

  it('removes items correctly', () => {
    const list = new List(undefined, {
      value: [
        { name: 'John' },
        { name: 'Jane' },
        { name: 'Bob' },
      ],
    });

    // Remove the middle item
    const removed = list.remove(1);

    expect(list.value).toEqual([
      { name: 'John' },
      { name: 'Bob' },
    ]);
    expect(removed?.value).toEqual({ name: 'Jane' });
  });

  it('clears all items', () => {
    const list = new List(undefined, {
      value: [
        { name: 'John' },
        { name: 'Jane' },
      ],
    });

    list.clear();

    expect(list.value).toBeNull();
  });

  it('clones list correctly', () => {
    const template = new Group({
      name: new Field(),
      age: new Field(),
    });

    const list = new List(template, {
      value: [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ],
    });

    const cloned = list.clone();

    // Check that values match
    expect(cloned.value).toEqual(list.value);

    // Check that it's a new instance
    expect(cloned).not.toBe(list);

    // Check that the clone has its own template
    expect(cloned.get(0)?.fields.name.value).toBe('John');

    // Modify original, verify clone is not affected
    list.push({ name: 'Bob', age: 40 });
    expect(list.value?.length).toBe(3);
    expect(cloned.value?.length).toBe(2);
  });

  it('sets values correctly', () => {
    const list = new List();

    list.value = [
      { name: 'John' },
      { name: 'Jane' },
    ];

    expect(list.value).toEqual([
      { name: 'John' },
      { name: 'Jane' },
    ]);

    // Change values
    list.value = [{ name: 'Bob' }];
    expect(list.value).toEqual([{ name: 'Bob' }]);

    // Set to empty array
    list.value = [];
    expect(list.value).toBeNull();
  });

  it('creates items using the template', () => {
    const template = new Group({
      name: new Field({ value: 'Default Name' }),
      age: new Field({ value: 18 }),
    });

    const list = new List(template);

    // Push with partial data
    list.push({ name: 'John' });

    // Should use default value from template for missing fields
    expect(list.get(0)?.fields.name.value).toBe('John');
    expect(list.get(0)?.fields.age.value).toBe(18);
  });

  it('handles parent relationship correctly', () => {
    const list = new List();
    list.push({ name: 'John' });

    // Check that item has parent reference
    const item = list.get(0);
    expect(item?.parent).toBe(list);

    // When we pop, the parent link is removed via cloning
    const popped = list.pop();
    expect(popped?.parent).toBeUndefined();
  });
});
