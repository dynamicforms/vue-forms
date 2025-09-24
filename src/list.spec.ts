import { vi } from 'vitest';

import { ValueChangedAction, ListItemAddedAction, ListItemRemovedAction } from './actions';
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
      name: Field.create({ value: '' }),
      age: Field.create({ value: 0 }),
      active: Field.create({ value: true }),
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
      name: Field.create(),
      age: Field.create(),
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
      name: Field.create({ value: 'Default Name' }),
      age: Field.create({ value: 18 }),
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

describe('List Validation', () => {
  it('should be invalid when one of the list items becomes invalid', () => {
    // Arrange
    const itemTemplate = new Group({
      name: Field.create({ validators: [new Validators.Required()] }),
      email: Field.create({ validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)] }),
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
    const itemTemplate = new Group({ name: Field.create() });

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
    const itemTemplate = new Group({ name: Field.create({ validators: [new Validators.Required()] }) });

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
    const itemTemplate = new Group({ name: Field.create() });

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
      email: Field.create({ validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)] }),
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
      email: Field.create({ validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)] }),
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
    // Setup - ustvari template za list item z dvema poljema
    const itemTemplate = new Group({
      startDate: Field.create(),
      endDate: Field.create(),
    });

    // Dodaj validator za endDate, da mora biti po startDate
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
