import { vi } from 'vitest';

import { ValueChangedAction } from './actions';
import { Field } from './field';
import { Group } from './group';

describe('Group', () => {
  it('correctly serializes values', () => {
    const group = new Group({
      field1: new Field({ value: 'test1' }),
      field2: new Field({ value: 'test2', enabled: false }),
      field3: new Field({ value: 'test3' }),
    });

    expect(group.value).toEqual({ field1: 'test1', field3: 'test3' });
    expect(group.fullValue).toEqual({ field1: 'test1', field2: 'test2', field3: 'test3' });
  });

  it('correctly deserialises values', () => {
    const field1 = new Field();
    const field2 = new Field();

    const group = new Group({ field1, field2 });

    group.value = { field1: 'test1', field2: 'test2' };

    expect(field1.value).toBe('test1');
    expect(field2.value).toBe('test2');
  });

  it('triggers onValueChanged only once when setting multiple nested values', () => {
    const onValueChanged = vi.fn();
    const group = new Group({
      field1: new Field({ enabled: true }),
      field2: new Field({ enabled: true }),
    }).registerAction(new ValueChangedAction(onValueChanged));

    group.value = { field1: 'test1', field2: 'test2' };

    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });

  it('correctly uses nested groups', () => {
    const subGroup = new Group({
      subField1: new Field({ value: 'sub1' }),
      subField2: new Field({ value: 'sub2', enabled: false }),
      subField3: new Field({ value: 'sub3' }),
    });

    const mainGroup = new Group({
      field1: new Field({ value: 'main1', enabled: true }),
      group: subGroup,
    });

    expect(mainGroup.value).toEqual({
      field1: 'main1',
      group: {
        subField1: 'sub1',
        subField3: 'sub3',
      },
    });
  });

  it('correctly notifies parent of changes', () => {
    const onValueChanged = vi.fn();
    const group = new Group({ field1: new Field() })
      .registerAction(new ValueChangedAction(onValueChanged));

    const field = group.fields.field1;
    field.value = 'test';

    expect(onValueChanged).toHaveBeenCalled();
  });
});

describe('Group value initialization', () => {
  it('correctly initializes empty fields without value', () => {
    const fields = {
      name: new Field(),
      age: new Field(),
    };

    const group = new Group(fields);

    expect(group.value).toEqual({
      name: undefined,
      age: undefined,
    });
  });

  it('correctly initializes fields with their own values', () => {
    const fields = {
      name: new Field({ value: 'John' }),
      age: new Field({ value: 30 }),
    };

    const group = new Group(fields);

    expect(group.value).toEqual({
      name: 'John',
      age: 30,
    });
  });

  it('correctly overrides field values with group constructor value parameter', () => {
    const fields = {
      name: new Field({ value: 'John' }),
      age: new Field({ value: 30 }),
    };

    const group = new Group(fields, {
      value: {
        name: 'Jane',
        age: 25,
      },
    });

    expect(group.value).toEqual({
      name: 'Jane',
      age: 25,
    });

    // Check individual field values
    expect(group.fields.name.value).toBe('Jane');
    expect(group.fields.age.value).toBe(25);
  });

  it('correctly handles partial value overrides', () => {
    const fields = {
      name: new Field({ value: 'John' }),
      age: new Field({ value: 30 }),
      active: new Field({ value: true }),
    };

    const group = new Group(fields, {
      value: {
        name: 'Jane',
        // age and active not overridden
      },
    });

    expect(group.value).toEqual({
      name: 'Jane',
      age: 30,
      active: true,
    });
  });

  it('correctly initializes nested groups with values', () => {
    const addressFields = {
      street: new Field({ value: 'Main St' }),
      city: new Field({ value: 'New York' }),
    };

    const personFields = {
      name: new Field({ value: 'John' }),
      address: new Group(addressFields),
    };

    const group = new Group(personFields, {
      value: {
        name: 'Jane',
        address: {
          street: 'Broadway',
          city: 'Boston',
        },
      },
    });

    expect(group.value).toEqual({
      name: 'Jane',
      address: {
        street: 'Broadway',
        city: 'Boston',
      },
    });

    // Check nested field values
    expect(group.fields.name.value).toBe('Jane');
    expect(group.fields.address.fields.street.value).toBe('Broadway');
    expect(group.fields.address.fields.city.value).toBe('Boston');
  });

  it('handles originalValue correctly', () => {
    const fields = {
      name: new Field({ value: 'John' }),
      age: new Field({ value: 30 }),
    };

    const group = new Group(fields, {
      value: {
        name: 'Jane',
        age: 25,
      },
      originalValue: {
        name: 'Original',
        age: 20,
      },
    });

    expect(group.value).toEqual({
      name: 'Jane',
      age: 25,
    });

    expect(group.originalValue).toEqual({
      name: 'Original',
      age: 20,
    });

    // Check isChanged reflects the difference between value and originalValue
    expect(group.isChanged).toBe(true);
  });
});
