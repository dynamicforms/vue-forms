import { vi } from 'vitest';

import { ValueChangedAction } from './actions';
import { Field } from './field';
import { Group } from './group';
import { Validators, ValidationErrorText } from './validators';

describe('Group', () => {
  it('correctly serializes values', () => {
    const group = new Group({
      field1: Field.create({ value: 'test1' }),
      field2: Field.create({ value: 'test2', enabled: false }),
      field3: Field.create({ value: 'test3' }),
    });

    expect(group.value).toEqual({ field1: 'test1', field3: 'test3' });
    expect(group.fullValue).toEqual({ field1: 'test1', field2: 'test2', field3: 'test3' });
  });

  it('correctly deserialises values', () => {
    const field1 = Field.create();
    const field2 = Field.create();

    const group = new Group({ field1, field2 });

    group.value = { field1: 'test1', field2: 'test2' };

    expect(field1.value).toBe('test1');
    expect(field2.value).toBe('test2');
  });

  it('triggers onValueChanged only once when setting multiple nested values', () => {
    const onValueChanged = vi.fn();
    const group = new Group({
      field1: Field.create({ enabled: true }),
      field2: Field.create({ enabled: true }),
    }).registerAction(new ValueChangedAction(onValueChanged));

    group.value = { field1: 'test1', field2: 'test2' };

    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });

  it('correctly uses nested groups', () => {
    const subGroup = new Group({
      subField1: Field.create({ value: 'sub1' }),
      subField2: Field.create({ value: 'sub2', enabled: false }),
      subField3: Field.create({ value: 'sub3' }),
    });

    const mainGroup = new Group({
      field1: Field.create({ value: 'main1', enabled: true }),
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
    const group = new Group({ field1: Field.create() })
      .registerAction(new ValueChangedAction(onValueChanged));

    const field = group.fields.field1;
    field.value = 'test';

    expect(onValueChanged).toHaveBeenCalled();
  });
});

describe('Group value initialization', () => {
  it('correctly initializes empty fields without value', () => {
    const fields = {
      name: Field.create(),
      age: Field.create(),
    };

    const group = new Group(fields);

    expect(group.value).toEqual({
      name: undefined,
      age: undefined,
    });
  });

  it('correctly initializes fields with their own values', () => {
    const fields = {
      name: Field.create({ value: 'John' }),
      age: Field.create({ value: 30 }),
    };

    const group = new Group(fields);

    expect(group.value).toEqual({
      name: 'John',
      age: 30,
    });
  });

  it('correctly overrides field values with group constructor value parameter', () => {
    const fields = {
      name: Field.create({ value: 'John' }),
      age: Field.create({ value: 30 }),
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
      name: Field.create({ value: 'John' }),
      age: Field.create({ value: 30 }),
      active: Field.create({ value: true }),
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
      street: Field.create({ value: 'Main St' }),
      city: Field.create({ value: 'New York' }),
    };

    const personFields = {
      name: Field.create({ value: 'John' }),
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
      name: Field.create({ value: 'John' }),
      age: Field.create({ value: 30 }),
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

describe('Form Validation', () => {
  it('should be invalid when one of the fields becomes invalid', () => {
    // Arrange
    const form = new Group({
      username: Field.create({
        value: 'validuser',
        validators: [new Validators.Required()],
      }),
      email: Field.create({
        value: 'valid@email.com',
        validators: [new Validators.Pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)],
      }),
    });

    // Initially form should be valid
    expect(form.valid).toBe(true);

    // Act - make one field invalid
    form.fields.email.value = 'invalid-email';

    // Assert
    expect(form.fields.email.valid).toBe(false);
    expect(form.valid).toBe(false);
  });

  it('should be invalid when form-level error is added', () => {
    // Arrange
    const form = new Group({
      phone: Field.create({ value: '' }), // non-required
      email: Field.create({ value: '' }), // non-required
    });

    // Initially form should be valid (no required fields)
    expect(form.valid).toBe(true);

    // Act - add form-level validation error
    form.errors = [new ValidationErrorText('At least one contact method (phone or email) is required')];
    form.validate();

    // Assert
    expect(form.valid).toBe(false);
  });

  it('should become valid again when field errors are resolved', () => {
    // Arrange
    const form = new Group({
      username: Field.create({
        value: '',
        validators: [new Validators.Required()],
      }),
    });

    // Initially form should be invalid (required field is empty)
    expect(form.valid).toBe(false);

    // Act - fix the field error
    form.fields.username.value = 'validuser';

    // Assert
    expect(form.fields.username.valid).toBe(true);
    expect(form.valid).toBe(true);
  });

  it('should become valid again when form-level errors are cleared', () => {
    // Arrange
    const form = new Group({ optionalField: Field.create({ value: '' }) });

    // Add form-level error
    form.errors = [new ValidationErrorText('Custom form validation error')];
    form.validate();
    expect(form.valid).toBe(false);

    // Act - clear form errors
    form.errors = [];
    form.validate();

    // Assert
    expect(form.valid).toBe(true);
  });
});

describe('Cross-field validation with revalidate', () => {
  it('should revalidate dependent fields when parent field changes', () => {
    // Setup - ustvari formo z dvema poljema
    const form = new Group({
      minValue: Field.create<number>({ value: 10 }),
      maxValue: Field.create<number>({ value: 20 }),
    });

    // Dodaj validator na maxValue, ki preverja, da je večji od minValue
    const crossFieldValidator = new Validators.Validator((newValue) => {
      const minVal = form.fields.minValue.value;
      if (newValue <= minVal) {
        return [new ValidationErrorText(`Max value must be greater than min value (${minVal})`)];
      }
      return null;
    });
    form.fields.maxValue.registerAction(crossFieldValidator);

    // Initially both fields should be valid
    expect(form.fields.minValue.valid).toBe(true);
    expect(form.fields.maxValue.valid).toBe(true);
    expect(form.valid).toBe(true);

    // Change minValue to be higher than maxValue
    form.fields.minValue.value = 25;

    // maxValue should still be valid (cross-field validation not triggered yet)
    expect(form.fields.minValue.valid).toBe(true);
    expect(form.fields.maxValue.valid).toBe(true);
    expect(form.valid).toBe(true);

    // 1. Revalidate field A (minValue) - field B should remain unchanged
    form.fields.minValue.validate(true);
    expect(form.fields.minValue.valid).toBe(true);
    expect(form.fields.maxValue.valid).toBe(true); // Should remain valid
    expect(form.valid).toBe(true);

    // 2. Revalidate field B (maxValue) - should become invalid
    form.fields.maxValue.validate(true);
    expect(form.fields.minValue.valid).toBe(true);
    expect(form.fields.maxValue.valid).toBe(false); // Should become invalid
    expect(form.valid).toBe(false);

    // Reset for next test
    form.fields.maxValue.value = 30; // Make it valid again
    expect(form.fields.maxValue.valid).toBe(true);
    expect(form.valid).toBe(true);

    // Change minValue again
    form.fields.minValue.value = 35;

    // 3. Revalidate entire form - field B should become invalid
    form.validate(true);
    expect(form.fields.minValue.valid).toBe(true);
    expect(form.fields.maxValue.valid).toBe(false); // Should become invalid
    expect(form.valid).toBe(false);
  });
});
