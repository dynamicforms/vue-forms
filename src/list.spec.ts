import { vi } from 'vitest';

import {
  EnabledChangedAction,
  EnabledChangingAction,
  ListItemAddedAction,
  ListItemRemovedAction,
  ValidChangedAction,
  ValueChangedAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { Validators, ValidationErrorText } from './validators';

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
    const list = new List().registerAction(new ValueChangedAction(onValueChanged));

    list.push({ name: 'John' });

    expect(onValueChanged).toHaveBeenCalled();
    expect(list.value).toEqual([{ name: 'John' }]);
  });

  it('triggers ArrayItemAddedAction on push', () => {
    const onItemAdded = vi.fn();
    const list = new List().registerAction(new ListItemAddedAction(onItemAdded));

    list.push({ name: 'John' });

    expect(onItemAdded).toHaveBeenCalledWith(
      list,
      expect.any(Function),
      expect.any(Object), // The Group object
      0, // Index
    );
  });

  it('announces every item added by insert with its own index', () => {
    const indexes: number[] = [];
    const list = new List().registerAction(
      new ListItemAddedAction((field, supr, item, index: number) => {
        indexes.push(index);
      }),
    );

    // the three items padding the list up to index 3 are announced alongside the inserted one
    expect(list.insert({ a: 9 }, 3)).toBe(3);

    expect(indexes).toEqual([0, 1, 2, 3]);
    expect(list.value?.length).toBe(4);
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
    const list = new List(undefined, { value: [{ name: 'John' }] }).registerAction(
      new ListItemRemovedAction(onItemRemoved),
    );

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
      value: [{ name: 'First' }, { name: 'Last' }],
    });

    // Insert in the middle
    list.insert({ name: 'Middle' }, 1);

    expect(list.value).toEqual([{ name: 'First' }, { name: 'Middle' }, { name: 'Last' }]);
  });

  it('inserts at a negative index and announces the position the item landed on', () => {
    const indexes: number[] = [];
    const list = new List(undefined, { value: [{ name: 'First' }, { name: 'Last' }] }).registerAction(
      new ListItemAddedAction((field, supr, item, index: number) => {
        indexes.push(index);
      }),
    );

    // -1 counts one back from the end, so the item goes before the last one
    expect(list.insert({ name: 'Middle' }, -1)).toBe(1);
    expect(list.value).toEqual([{ name: 'First' }, { name: 'Middle' }, { name: 'Last' }]);

    // an index reaching past the start stops at the start
    expect(list.insert({ name: 'Before' }, -99)).toBe(0);
    expect(list.value).toEqual([{ name: 'Before' }, { name: 'First' }, { name: 'Middle' }, { name: 'Last' }]);

    expect(indexes).toEqual([1, 0]);
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

  it('pads with items carrying the template values when inserting past the end', () => {
    const list = new List(new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) }), {
      value: [{ a: 9, b: 9 }],
    });

    expect(list.insert({ a: 4, b: 4 }, 3)).toBe(3);

    expect(list.value).toEqual([
      { a: 9, b: 9 },
      { a: 1, b: 2 },
      { a: 1, b: 2 },
      { a: 4, b: 4 },
    ]);
  });

  it('removes items correctly', () => {
    const list = new List(undefined, {
      value: [{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }],
    });

    // Remove the middle item
    const removed = list.remove(1);

    expect(list.value).toEqual([{ name: 'John' }, { name: 'Bob' }]);
    expect(removed?.value).toEqual({ name: 'Jane' });
  });

  it('clears all items', () => {
    const list = new List(undefined, {
      value: [{ name: 'John' }, { name: 'Jane' }],
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

    list.value = [{ name: 'John' }, { name: 'Jane' }];

    expect(list.value).toEqual([{ name: 'John' }, { name: 'Jane' }]);

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

  it('reports the previous value on every change following an assignment', () => {
    const seen: [any, any][] = [];
    const list = new List(new Group({ a: new Field() })).registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        seen.push([newValue, oldValue]);
      }),
    );

    list.value = [{ a: 1 }];
    list.get(0)!.fields.a.value = 2;

    expect(seen).toEqual([
      [[{ a: 1 }], null],
      [[{ a: 2 }], [{ a: 1 }]],
    ]);
  });

  it('runs a constructor-supplied validator exactly once, over the constructed value', () => {
    const seen: any[] = [];
    const list = new List(undefined, {
      value: [{ a: 1 }],
      validators: [
        new Validators.Validator((newValue) => {
          seen.push(newValue);
          return null;
        }),
      ],
    });

    expect(seen).toEqual([[{ a: 1 }]]);
    expect(list.valid).toBe(true);
    expect(list.errors).toHaveLength(0);
  });

  it('keeps the verdict of a constructor-supplied validator that rejects the constructed value', () => {
    const list = new List(undefined, {
      value: [{ a: 1 }],
      validators: [new Validators.Validator(() => [new ValidationErrorText('too short')])],
    });

    expect(list.valid).toBe(false);
    expect(list.errors).toHaveLength(1);
  });

  it('handles parent relationship correctly', () => {
    const list = new List();
    list.push({ name: 'John' });

    // Check that item has parent reference
    const item = list.get(0);
    expect(item?.parent).toBe(list);
    // the back-reference stays out of enumeration, so serializing the list does not walk back up into it
    expect(Object.keys(item!)).not.toContain('parent');
    expect(JSON.stringify(item)).not.toContain('parent');
    expect(() => JSON.stringify(list)).not.toThrow();

    // When we pop, the parent link is removed via cloning
    const popped = list.pop();
    expect(popped?.parent).toBeUndefined();
  });
});

describe('List Validation', () => {
  it('should be invalid when one of the list items becomes invalid', () => {
    // Arrange
    const itemTemplate = new Group({
      name: new Field({ validators: [new Validators.Required()] }),
      email: new Field({ validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)] }),
    });
    expect(itemTemplate.valid).toBe(false);

    const list = new List(itemTemplate, {
      value: [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' },
      ],
    });

    // Initially list should be valid
    expect(list.get(0)!.fields.name.valid).toBe(true);
    expect(list.get(0)!.fields.email.valid).toBe(true);
    expect(list.get(0)!.valid).toBe(true);
    expect(list.get(1)!.valid).toBe(true);
    expect(list.valid).toBe(true);

    // Act - make one item invalid
    const firstItem = list.get(0);
    firstItem!.fields.email.value = 'invalid-email';

    // Assert
    expect(firstItem!.valid).toBe(false);
    expect(list.valid).toBe(false);
  });

  it('should be invalid when list-level error is added', () => {
    // Arrange
    const itemTemplate = new Group({ name: new Field() });

    const list = new List(itemTemplate, {
      value: [{ name: 'Item 1' }, { name: 'Item 2' }],
    });

    // Initially list should be valid
    expect(list.valid).toBe(true);

    // Act - add list-level validation error
    list.errors = [new ValidationErrorText('List must contain at least 3 items')];
    list.validate();

    // Assert
    expect(list.valid).toBe(false);
  });

  it('should become valid again when item errors are resolved', () => {
    // Arrange
    const itemTemplate = new Group({ name: new Field({ validators: [new Validators.Required()] }) });

    const list = new List(itemTemplate, {
      value: [
        { name: '' }, // invalid - required field empty
        { name: 'Valid Name' },
      ],
    });

    // Initially list should be invalid
    expect(list.valid).toBe(false);

    // Act - fix the item error
    const firstItem = list.get(0);
    firstItem!.fields.name.value = 'Fixed Name';

    // Assert
    expect(firstItem!.valid).toBe(true);
    expect(list.valid).toBe(true);
  });

  it('should become valid again when list-level errors are cleared', () => {
    // Arrange
    const itemTemplate = new Group({ name: new Field() });

    const list = new List(itemTemplate);

    // Add list-level error
    list.errors = [new ValidationErrorText('Custom list validation error')];
    list.validate();
    expect(list.valid).toBe(false);

    // Act - clear list errors
    list.errors = [];
    list.validate();

    // Assert
    expect(list.valid).toBe(true);
  });

  it('should be invalid when new invalid item is added', () => {
    // Arrange
    const itemTemplate = new Group({
      email: new Field({ validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)] }),
    });

    const list = new List(itemTemplate, {
      value: [{ email: 'valid@example.com' }],
    });

    // Initially list should be valid
    expect(list.valid).toBe(true);

    // Act - add invalid item
    list.push({ email: 'invalid-email' });

    // Assert
    expect(list.valid).toBe(false);
  });

  it('should become valid when invalid item is removed', () => {
    // Arrange
    const itemTemplate = new Group({
      email: new Field({ validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)] }),
    });

    const list = new List(itemTemplate, {
      value: [
        { email: 'valid@example.com' },
        { email: 'invalid-email' }, // invalid item
      ],
    });

    // Initially list should be invalid
    expect(list.valid).toBe(false);

    // Act - remove invalid item
    list.remove(1);

    // Assert
    expect(list.valid).toBe(true);
  });
});

describe('Cross-field validation with revalidate', () => {
  it('should revalidate list items with cross-field validation', () => {
    // an item template with two fields
    const itemTemplate = new Group({
      startDate: new Field(),
      endDate: new Field(),
    });

    // a validator on endDate that requires it to fall after startDate
    const dateValidator = new Validators.Validator((newValue, oldValue, field) => {
      const startDate = field.parent?.fields.startDate.value;
      if (startDate && newValue && new Date(newValue) <= new Date(startDate)) {
        return [new ValidationErrorText('End date must be after start date')];
      }
      return null;
    });
    itemTemplate.fields.endDate.registerAction(dateValidator);

    // Ustvari list z enim elementom
    const eventsList = new List(itemTemplate, {
      value: [{ startDate: '2025-01-01', endDate: '2025-01-05' }],
    });

    // Initially should be valid
    const firstItem = eventsList.get(0);
    expect(firstItem?.fields.startDate.valid).toBe(true);
    expect(firstItem?.fields.endDate.valid).toBe(true);
    expect(firstItem?.valid).toBe(true);
    expect(eventsList.valid).toBe(true);

    // Change startDate to be after endDate
    firstItem!.fields.startDate.value = '2025-01-10';

    // endDate should still be valid (cross-field validation not triggered)
    expect(firstItem?.fields.endDate.valid).toBe(true);
    expect(firstItem?.valid).toBe(true);
    expect(eventsList.valid).toBe(true);

    // Revalidate the list item
    firstItem?.validate(true);
    expect(firstItem?.fields.startDate.valid).toBe(true);
    expect(firstItem?.fields.endDate.valid).toBe(false); // Should become invalid
    expect(firstItem?.valid).toBe(false);
    expect(eventsList.valid).toBe(false);

    // Reset and test list-level revalidation
    firstItem!.fields.endDate.value = '2025-01-15'; // Make valid again
    expect(firstItem?.valid).toBe(true);
    expect(eventsList.valid).toBe(true);

    // Change startDate again
    firstItem!.fields.startDate.value = '2025-01-20';

    // Revalidate entire list
    eventsList.validate(false);
    expect(firstItem?.fields.endDate.valid).toBe(true); // We don't have cross-field revalidation, it will remain true
    eventsList.validate(true);
    expect(firstItem?.fields.endDate.valid).toBe(false); // Should become invalid
    expect(firstItem?.valid).toBe(false);
    expect(eventsList.valid).toBe(false);
  });
});

describe('List validity announcements', () => {
  function invalidList(seen: boolean[]) {
    const list = new List(new Group({ a: new Field({ validators: [new Validators.Required()] }) }), {
      value: [{ a: 'x' }, { a: '' }],
    });
    return list.registerAction(
      new ValidChangedAction((field, supr, newValue: boolean) => {
        seen.push(newValue);
      }),
    );
  }

  it('says nothing when an assignment leaves the list as invalid as it found it', () => {
    const seen: boolean[] = [];
    const list = invalidList(seen);
    expect(list.valid).toBe(false);

    list.value = [{ a: '' }, { a: 'y' }];

    expect(seen).toEqual([]);
    expect(list.valid).toBe(false);
  });

  it('announces the final verdict once when an assignment genuinely flips the list', () => {
    const seen: boolean[] = [];
    const list = invalidList(seen);

    list.value = [{ a: 'x' }, { a: 'y' }];

    expect(seen).toEqual([true]);
    expect(list.valid).toBe(true);
  });
});

describe('List construction parameters', () => {
  it.each([
    ['absent', undefined],
    ['explicitly undefined', { value: undefined }],
    ['explicitly null', { value: null }],
  ])('starts empty when the constructor value is %s', (name, params) => {
    const list = new List(new Group({ a: new Field({ value: 'template' }) }), params);

    expect(list.value).toBeNull();
    expect(list.get(0)).toBeUndefined();
  });

  it('lets a constructor-supplied changing action rewrite the parameters that carry it', () => {
    const visibilitySeen: DisplayMode[] = [];
    const enabledSeen: boolean[] = [];
    const list = new List(undefined, {
      value: [{ a: 1 }],
      visibility: DisplayMode.HIDDEN,
      enabled: false,
      actions: [
        new VisibilityChangingAction(() => DisplayMode.SUPPRESS),
        new VisibilityChangedAction((field, supr, newValue) => {
          visibilitySeen.push(newValue);
        }),
        new EnabledChangingAction(() => true),
        new EnabledChangedAction((field, supr, newValue) => {
          enabledSeen.push(newValue);
        }),
      ],
    });

    expect(list.visibility).toBe(DisplayMode.SUPPRESS);
    expect(list.enabled).toBe(true);
    expect(visibilitySeen).toEqual([DisplayMode.SUPPRESS]);
    expect(enabledSeen).toEqual([true]);
    expect(list.value).toEqual([{ a: 1 }]);
  });
});

describe('List cloning', () => {
  it('clones an empty list', () => {
    const list = new List(new Group({ name: new Field({ value: 'template' }) }));

    const copy = list.clone();

    expect(copy).not.toBe(list);
    expect(copy.value).toBeNull();

    copy.push({ name: 'John' });
    expect(copy.value).toEqual([{ name: 'John' }]);
    expect(list.value).toBeNull();
  });

  it('takes a clone value override only from a value the caller supplied', () => {
    const list = new List(new Group({ name: new Field() }), { value: [{ name: 'John' }] });

    expect(list.clone().value).toEqual([{ name: 'John' }]);
    expect(list.clone({ value: undefined }).value).toEqual([{ name: 'John' }]);
    expect(list.clone({ value: null }).value).toBeNull();
    expect(list.clone({ value: [{ name: 'Jane' }] }).value).toEqual([{ name: 'Jane' }]);
  });
});

describe('Rows and the element they were declared as', () => {
  it('names the item template as the declaration of every row and of every member of one', () => {
    const template = new Group({ name: new Field({ value: '' }) });
    const list = new List(template, { value: [{ name: 'John' }, { name: 'Jane' }] });

    expect(template.declaration).toBe(template);
    expect(list.get(0)!.declaration).toBe(template);
    expect(list.get(1)!.declaration).toBe(template);
    expect(list.get(0)!.fields.name.declaration).toBe(template.fields.name);

    // a clone of a clone names the element the whole family was declared as
    expect(list.get(0)!.clone().declaration).toBe(template);
  });

  it('finds the rows a declaration stands for', () => {
    const template = new Group({ name: new Field({ value: '' }) });
    const list = new List(template, { value: [{ name: 'John' }, { name: 'Jane' }] });

    expect(list.bindingsOf(template)).toEqual([list.get(0), list.get(1)]);
    expect(list.bindingsOf(template.fields.name)).toEqual([list.get(0)!.fields.name, list.get(1)!.fields.name]);
    expect(list.bindingsOf(new Field())).toEqual([]);
  });
});

describe('List value caching', () => {
  it('answers a repeated read with the array it built last, and with a new one after a row changes', () => {
    const list = new List(new Group({ n: new Field({ value: 0 }) }), { value: [{ n: 1 }, { n: 2 }] });

    const first = list.value;
    expect(list.value).toBe(first);

    list.get(0)!.fields.n.value = 5;

    const second = list.value;
    expect(second).not.toBe(first);
    expect(second).toEqual([{ n: 5 }, { n: 2 }]);
    expect(list.value).toBe(second);
    expect(first).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('does not build the value while nothing is registered to receive it', () => {
    // the probe is never written, so every read of it is a member walk somebody made to build a value
    let probeReads = 0;
    class ProbeField extends Field<number> {
      get value(): number {
        probeReads += 1;
        return super.value;
      }

      set value(newValue: number) {
        super.value = newValue;
      }
    }

    const template = new Group({ n: new Field({ value: 0 }), probe: new ProbeField({ value: 0 }) });
    const list = new List(template, { value: [{ n: 1 }, { n: 2 }] });
    const root = new Group({ list, other: new Field({ value: 'x' }) });
    probeReads = 0;

    list.get(0)!.fields.n.value = 5;

    // no ValueChangedAction and no eager action stands anywhere above the field, so no level walks its members
    expect(probeReads).toBe(0);
    expect(list.value).toEqual([
      { n: 5, probe: 0 },
      { n: 2, probe: 0 },
    ]);
    expect(root.value).toEqual({
      list: [
        { n: 5, probe: 0 },
        { n: 2, probe: 0 },
      ],
      other: 'x',
    });
  });

  it('reports the change to a listener registered after the list had already changed', () => {
    const seen: [any, any][] = [];
    const list = new List(new Group({ a: new Field() }), { value: [{ a: 'x' }] });

    // nothing was registered while this item was added, so the list never built the value it would have carried
    list.push({ a: 'y' });

    list.registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        seen.push([newValue, oldValue]);
      }),
    );
    list.remove(1);

    expect(seen).toEqual([[[{ a: 'x' }], [{ a: 'x' }, { a: 'y' }]]]);
  });

  it('fires the item event and one value event, in that order, on insert', () => {
    const events: string[] = [];
    const list = new List(new Group({ a: new Field({ value: '' }) }), { value: [{ a: 'x' }] })
      .registerAction(
        new ListItemAddedAction((field, supr, item, index: number) => {
          events.push(`added:${index}`);
        }),
      )
      .registerAction(
        new ValueChangedAction((field, supr, newValue) => {
          events.push(`value:${JSON.stringify(newValue)}`);
        }),
      );

    list.insert({ a: 'y' }, 0);

    expect(events).toEqual(['added:0', 'value:[{"a":"y"},{"a":"x"}]']);
  });
});

describe('List validity reading', () => {
  it('reports a list invalid over an error pushed into a row without any validate() call', () => {
    const list = new List(new Group({ a: new Field({ value: '' }) }), { value: [{ a: 'x' }] });
    const root = new Group({ list });
    expect(root.valid).toBe(true);

    list.get(0)!.fields.a.errors.push(new ValidationErrorText('pushed in'));

    expect(list.get(0)!.valid).toBe(false);
    expect(list.valid).toBe(false);
    expect(root.valid).toBe(false);
  });

  it('announces validity through a list that has nothing listening for its value', () => {
    const seen: boolean[] = [];
    const list = new List(new Group({ a: new Field({ validators: [new Validators.Required()] }) }), {
      value: [{ a: 'x' }],
    });
    const root = new Group({ list, b: new Field({ value: 'y' }) }).registerAction(
      new ValidChangedAction((field, supr, newValue: boolean) => {
        seen.push(newValue);
      }),
    );

    list.push({ a: '' });

    expect(seen).toEqual([false]);
    expect(root.valid).toBe(false);

    list.get(1)!.fields.a.value = 'filled';

    expect(seen).toEqual([false, true]);
    expect(root.valid).toBe(true);
  });
});

describe('List whole-value assignment', () => {
  it('writes a same-length assignment into the rows that are already there', () => {
    const list = new List(new Group({ a: new Field(), b: new Field() }), {
      value: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ],
    });
    const first = list.get(0)!;
    const second = list.get(1)!;

    list.value = [
      { a: 9, b: 8 },
      { a: 7, b: 6 },
    ];

    expect(list.get(0)).toBe(first);
    expect(list.get(1)).toBe(second);
    expect(list.value).toEqual([
      { a: 9, b: 8 },
      { a: 7, b: 6 },
    ]);
  });

  it('drops the surplus rows and builds only the missing ones', () => {
    const list = new List(new Group({ a: new Field() }), { value: [{ a: 1 }, { a: 2 }, { a: 3 }] });
    const first = list.get(0)!;

    list.value = [{ a: 9 }];

    expect(list.get(0)).toBe(first);
    expect(list.get(1)).toBeUndefined();
    expect(list.value).toEqual([{ a: 9 }]);

    list.value = [{ a: 5 }, { a: 6 }];

    expect(list.get(0)).toBe(first);
    expect(list.get(1)).not.toBe(first);
    expect(list.value).toEqual([{ a: 5 }, { a: 6 }]);

    list.value = null as unknown as Record<string, any>[];

    expect(list.value).toBeNull();
    expect(list.get(0)).toBeUndefined();
  });
});

describe('List membership of the rows it counts', () => {
  const listWithOneRow = () => {
    const template = new Group({ a: new Field({ value: 'x', validators: [new Validators.Required()] }) });
    const list = new List(template);
    const seen: boolean[] = [];
    list.registerAction(
      new ValidChangedAction((field, supr, newValue: boolean) => {
        seen.push(newValue);
      }),
    );
    list.push({ a: 'ok' });
    return { list, seen };
  };

  it('ignores the verdict of a row that remove() took out of it', () => {
    const { list, seen } = listWithOneRow();
    const removed = list.get(0)!;

    list.remove(0);
    removed.fields.a.value = '';

    expect(list.valid).toBe(true);
    expect(seen).toEqual([]);

    list.push({ a: '' });

    expect(list.valid).toBe(false);
    expect(seen).toEqual([false]);

    list.get(0)!.fields.a.value = 'ok';

    expect(list.valid).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it('ignores the verdict of a row a shorter assignment dropped', () => {
    const { list, seen } = listWithOneRow();
    const dropped = list.get(0)!;

    list.value = [];
    dropped.fields.a.value = '';

    expect(list.valid).toBe(true);
    expect(seen).toEqual([]);

    list.push({ a: '' });

    expect(list.valid).toBe(false);
    expect(seen).toEqual([false]);
  });

  it('ignores the verdict of a row clear() dropped', () => {
    const { list, seen } = listWithOneRow();
    const dropped = list.get(0)!;

    list.clear();
    dropped.fields.a.value = '';

    expect(list.valid).toBe(true);
    expect(seen).toEqual([]);

    list.push({ a: '' });

    expect(list.valid).toBe(false);
    expect(seen).toEqual([false]);
  });

  it('takes the parent link away from every row it drops', () => {
    const { list } = listWithOneRow();
    const removed = list.get(0)!;
    list.remove(0);
    expect(removed.parent).toBeUndefined();

    list.push({ a: 'ok' });
    const truncated = list.get(0)!;
    list.value = [];
    expect(truncated.parent).toBeUndefined();

    list.push({ a: 'ok' });
    const cleared = list.get(0)!;
    list.clear();
    expect(cleared.parent).toBeUndefined();
  });

  it('refuses a row another list already holds', () => {
    const { list } = listWithOneRow();
    const other = new List(new Group({ a: new Field({ value: 'x' }) }));

    expect(() => other.push(list.get(0)!)).toThrow(TypeError);
    expect(other.value).toBeNull();
    expect(list.value).toEqual([{ a: 'ok' }]);
  });

  it('hands a released row on to another list', () => {
    const { list } = listWithOneRow();
    const other = new List(new Group({ a: new Field({ value: 'x' }) }));
    const removed = list.get(0)!;

    list.remove(0);
    other.push(removed);

    expect(other.get(0)).toBe(removed);
    expect(removed.parent).toBe(other);
  });

  it('counts a detached row again once it is pushed back in', () => {
    const { list, seen } = listWithOneRow();
    const removed = list.get(0)!;

    list.remove(0);
    removed.fields.a.value = '';
    list.push(removed);

    expect(list.valid).toBe(false);
    expect(seen).toEqual([false]);

    removed.fields.a.value = 'ok';

    expect(list.valid).toBe(true);
    expect(seen).toEqual([false, true]);
  });
});

describe('List row reuse', () => {
  it('gives a key the new item leaves out the template value, not the one the row held', () => {
    const template = new Group({ a: new Field({ value: 'tplA' }), b: new Field({ value: 'tplB' }) });
    const list = new List(template);

    list.value = [{ a: 'a1', b: 'b1' }];
    list.value = [{ a: 'a2' }];

    expect(list.value).toEqual([{ a: 'a2', b: 'tplB' }]);
  });

  it('clears the same keys one level down as a fresh row would', () => {
    const template = new Group({
      inner: new Group({ a: new Field({ value: 'tplA' }), b: new Field({ value: 'tplB' }) }),
    });
    const list = new List(template);

    list.value = [{ inner: { a: 'a1', b: 'b1' } }];
    list.value = [{ inner: { a: 'a2' } }];

    expect(list.value).toEqual([{ inner: { a: 'a2', b: 'tplB' } }]);
  });

  it('starts the change history of a reused row over', () => {
    const list = new List(new Group({ a: new Field({ value: '' }) }));

    list.value = [{ a: '1' }];
    const row = list.get(0)!;
    row.touched = true;

    list.value = [{ a: '2' }];

    expect(list.get(0)).toBe(row);
    expect(row.touched).toBe(false);
    expect(row.originalValue).toEqual({ a: '2' });
    expect(row.isChanged).toBe(false);
    expect(list.touched).toBe(false);
  });

  it('drops an error pushed by hand into a reused row', () => {
    const list = new List(new Group({ a: new Field({ value: '' }) }));

    list.value = [{ a: '1' }];
    const row = list.get(0)!;
    row.fields.a.errors.push(new ValidationErrorText('pushed in'));
    row.errors.push(new ValidationErrorText('pushed onto the row'));

    expect(list.valid).toBe(false);

    list.value = [{ a: '2' }];

    expect(row.fields.a.errors).toEqual([]);
    expect(row.errors).toEqual([]);
    expect(row.valid).toBe(true);
    expect(list.valid).toBe(true);
  });

  it('re-establishes the errors of a reused row the assignment leaves the value of', () => {
    const template = new Group({ a: new Field({ value: 'x', validators: [new Validators.Required()] }) });
    const list = new List(template, { value: [{ a: '' }] });
    const row = list.get(0)!;
    row.fields.a.errors.push(new ValidationErrorText('pushed in'));

    list.value = [{ a: '' }];

    // the hand-pushed error is gone with the reset and the validator's verdict over the value the row now holds
    // is the one that stands
    expect(row.fields.a.errors.length).toBe(1);
    expect(row.valid).toBe(false);
    expect(list.valid).toBe(false);
  });

  it('leaves a reused row indistinguishable from the row a fresh list builds', () => {
    const template = new Group({ a: new Field({ value: 'tplA' }), b: new Field({ value: 'tplB' }) });
    const list = new List(template);

    list.value = [{ a: 'a1', b: 'b1' }];
    list.get(0)!.touched = true;
    list.value = [{ a: 'a2' }];

    const fresh = new List(template, { value: [{ a: 'a2' }] });

    expect(list.value).toEqual(fresh.value);
    expect(list.get(0)!.originalValue).toEqual(fresh.get(0)!.originalValue);
    expect(list.get(0)!.isChanged).toBe(fresh.get(0)!.isChanged);
    expect(list.get(0)!.touched).toBe(fresh.get(0)!.touched);
    expect(list.get(0)!.errors).toEqual(fresh.get(0)!.errors);
    expect(list.get(0)!.valid).toBe(fresh.get(0)!.valid);
  });

  it('re-runs the validators of a reused row over the value it ends up with', () => {
    const template = new Group({ a: new Field({ value: 'x', validators: [new Validators.Required()] }) });
    const list = new List(template, { value: [{ a: 'x' }] });

    list.value = [{ a: '' }];

    expect(list.get(0)!.valid).toBe(false);
    expect(list.valid).toBe(false);

    list.value = [{ a: 'y' }];

    expect(list.get(0)!.valid).toBe(true);
    expect(list.valid).toBe(true);
  });
});

describe('List value during a whole-value assignment', () => {
  it('is never read back with a row missing', () => {
    let list: List | undefined;
    const seen: any[][] = [];
    const template = new Group({
      a: new Field({
        validators: [
          new Validators.Validator(() => {
            const rows = list?.value;
            if (rows) seen.push([...rows]);
            return null;
          }),
        ],
      }),
    });
    list = new List(template, { value: [{ a: '1' }] });
    seen.length = 0;

    list.value = [{ a: '2' }, { a: '3' }, { a: '4' }];

    expect(seen.length).toBeGreaterThan(0);
    seen.forEach((rows) => {
      rows.forEach((row) => expect(row).not.toBeUndefined());
    });
    expect(list.value).toEqual([{ a: '2' }, { a: '3' }, { a: '4' }]);
  });
});

describe('List value object', () => {
  it('is not the object originalValue holds', () => {
    const list = new List(new Group({ a: new Field({ value: 1 }) }), { value: [{ a: 1 }] });

    expect(list.value).not.toBe(list.originalValue);
    expect(list.value).toEqual(list.originalValue);
  });

  it('is frozen, rows included', () => {
    const list = new List(new Group({ a: new Field({ value: 1 }) }), { value: [{ a: 1 }] });
    const value = list.value!;

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value[0])).toBe(true);
    expect(() => {
      (value[0] as any).a = 99;
    }).toThrow();
    expect(list.value).toEqual([{ a: 1 }]);
  });
});
