import { isEqual } from 'lodash-es';
import { vi } from 'vitest';

import {
  EnabledChangedAction,
  EnabledChangingAction,
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
    const group = new Group({ field1: new Field() }).registerAction(new ValueChangedAction(onValueChanged));

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

  it('keeps member values when the constructor parameters carry no value', () => {
    const group = new Group(
      {
        name: new Field({ value: 'John' }),
        age: new Field({ value: 30 }),
      },
      { visibility: DisplayMode.HIDDEN },
    );

    expect(group.value).toEqual({ name: 'John', age: 30 });
    expect(group.fields.name.value).toBe('John');
    expect(group.visibility).toBe(DisplayMode.HIDDEN);
    expect(group.originalValue).toEqual({ name: 'John', age: 30 });
    expect(group.isChanged).toBe(false);
  });

  it('takes the value from originalValue when only originalValue is given', () => {
    const group = new Group({ name: new Field({ value: 'John' }) }, { originalValue: { name: 'Jane' } });

    expect(group.value).toEqual({ name: 'Jane' });
    expect(group.isChanged).toBe(false);
  });

  it('clears the members when the constructor value is explicitly null', () => {
    const group = new Group({ name: new Field({ value: 'John' }) }, { value: null });

    expect(group.value).toEqual({ name: null });
  });

  it('treats an explicitly undefined constructor value as no value at all', () => {
    const group = new Group({ name: new Field({ value: 'John' }) }, { value: undefined });

    expect(group.value).toEqual({ name: 'John' });
    expect(group.originalValue).toEqual({ name: 'John' });
    expect(group.isChanged).toBe(false);
  });

  it('reports the previous value on the first change of a member', () => {
    const seen: [any, any][] = [];
    const group = new Group({ a: new Field({ value: 1 }) }).registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        seen.push([newValue, oldValue]);
      }),
    );

    group.fields.a.value = 2;

    expect(seen).toEqual([[{ a: 2 }, { a: 1 }]]);
  });

  it('runs a constructor-supplied validator exactly once, over the constructed value', () => {
    const seen: any[] = [];
    const group = new Group(
      { a: new Field({ value: 1 }) },
      {
        validators: [
          new Validators.Validator((newValue) => {
            seen.push(newValue);
            return null;
          }),
        ],
      },
    );

    expect(seen).toEqual([{ a: 1 }]);
    expect(group.valid).toBe(true);
    expect(group.errors).toHaveLength(0);
  });

  it('keeps the verdict of a constructor-supplied validator that rejects the constructed value', () => {
    const group = new Group(
      { a: new Field({ value: 1 }) },
      { validators: [new Validators.Validator(() => [new ValidationErrorText('not allowed')])] },
    );

    expect(group.valid).toBe(false);
    expect(group.errors).toHaveLength(1);
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

describe('Form Validation', () => {
  it('should be invalid when one of the fields becomes invalid', () => {
    // Arrange
    const form = new Group({
      username: new Field({
        value: 'validuser',
        validators: [new Validators.Required()],
      }),
      email: new Field({
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
      phone: new Field({ value: '' }), // non-required
      email: new Field({ value: '' }), // non-required
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
      username: new Field({
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
    const form = new Group({ optionalField: new Field({ value: '' }) });

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
      minValue: new Field<number>({ value: 10 }),
      maxValue: new Field<number>({ value: 20 }),
    });

    // a validator on maxValue that requires it to be greater than minValue
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

describe('Group field storage', () => {
  it('keeps fields enumerable, ordered and identical to what was passed in', () => {
    const inner = new Group({ x: new Field({ value: 1 }) });
    const y = new Field({ value: 2 });
    const outer = new Group({ inner, y });

    expect(Object.keys(outer.fields)).toEqual(['inner', 'y']);
    expect(outer.fields.inner).toBe(inner);
    expect(outer.field('y')).toBe(y);
  });

  it('accepts field names that collide with Object.prototype members', () => {
    const group = new Group({
      toString: new Field({ value: 1 }),
      constructor: new Field({ value: 2 }),
      // computed, because a plain `__proto__:` in an object literal sets the literal's prototype
      ['__proto__']: new Field({ value: 3 }),
    });

    expect(group.fields.toString.value).toBe(1);
    expect(group.fields.constructor.value).toBe(2);
    expect(group.fields['__proto__'].value).toBe(3);
    expect(Object.keys(group.fields).sort()).toEqual(['__proto__', 'constructor', 'toString']);
    expect(group.field('__proto__')).toBe(group.fields['__proto__']);
    const expected = { toString: 1, constructor: 2, ['__proto__']: 3 };
    expect(group.value).toEqual(expected);
    expect(JSON.parse(JSON.stringify(group.value))).toEqual(expected);
    expect(group.fullValue).toEqual(expected);
    expect(group.clone().value).toEqual(expected);
  });

  it('keeps a __proto__ field coming from parsed API data', () => {
    // JSON.parse produces a real own key, unlike an object literal
    const group = Group.createFromFormData(JSON.parse('{"name":"a","__proto__":{"admin":true}}'));

    expect(Object.keys(group.fields)).toEqual(['name', '__proto__']);
    expect(group.value).toEqual({ name: 'a', ['__proto__']: { admin: true } });
    expect(group.field('__proto__')!.value).toEqual({ admin: true });
    expect(Object.getPrototypeOf(group.fields)).toBeNull();
  });

  it('assigns only from the own keys of the value it is given', () => {
    const group = new Group({ toString: new Field({ value: 1 }) });

    group.value = {} as any;
    expect(group.fields.toString.value).toBe(1);

    group.value = { toString: 5 } as any;
    expect(group.fields.toString.value).toBe(5);
  });

  it('refuses to have its fields map rewritten from outside', () => {
    const a = new Field({ value: 1 });
    const other = new Field({ value: 9 });
    const group = new Group({ a });

    expect(() => {
      (group.fields as any).a = other;
    }).toThrow(TypeError);
    expect(() => delete (group.fields as any).a).toThrow(TypeError);
    expect(group.field('a')).toBe(a);
    expect(other.parent).toBeUndefined();
  });

  it('rejects a duplicate field name', () => {
    const group = new Group({ y: new Field({ value: 1 }) });

    expect(() => (group as any).addField('y', new Field({ value: 2 }))).toThrow(/already in this form/);
  });

  it('keeps the parent back-reference out of enumeration so cyclic structures still serialize', () => {
    const inner = new Group({ x: new Field({ value: 1 }) });
    const list = new List(new Group({ z: new Field({ value: 0 }) }));
    const outer = new Group({ inner, list });
    list.push({ z: 3 });

    expect(inner.parent).toBe(outer);
    expect(inner.fieldName).toBe('inner');
    expect(Object.keys(inner)).not.toContain('parent');
    expect(Object.keys(inner)).not.toContain('fieldName');
    expect(Object.getOwnPropertyDescriptor(inner, 'parent')!.enumerable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(inner, 'fieldName')!.enumerable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(list.get(0)!, 'parent')!.enumerable).toBe(false);

    expect(() => JSON.stringify(outer)).not.toThrow();
    // isEqual walks the same enumerable properties, so it must terminate as well
    expect(() => isEqual(outer, outer.clone())).not.toThrow();
  });
});

describe('Group validity announcements', () => {
  function invalidGroup(seen: boolean[]) {
    // a is empty and b is filled, so the group is invalid on account of a alone
    return new Group({
      a: new Field({ value: '', validators: [new Validators.Required()] }),
      b: new Field({ value: 'y', validators: [new Validators.Required()] }),
    }).registerAction(
      new ValidChangedAction((field, supr, newValue: boolean) => {
        seen.push(newValue);
      }),
    );
  }

  it('says nothing when an assignment leaves the group as invalid as it found it', () => {
    const seen: boolean[] = [];
    const group = invalidGroup(seen);
    expect(group.valid).toBe(false);

    // filling a makes the group momentarily valid and emptying b takes that back
    group.value = { a: 'x', b: '' };

    expect(seen).toEqual([]);
    expect(group.valid).toBe(false);
  });

  it('announces the final verdict once when an assignment genuinely flips the group', () => {
    const seen: boolean[] = [];
    const group = invalidGroup(seen);

    group.value = { a: 'x', b: 'z' };

    expect(seen).toEqual([true]);
    expect(group.valid).toBe(true);
  });
});

describe('Group construction parameters', () => {
  it('lets a constructor-supplied changing action rewrite the parameters that carry it', () => {
    const visibilitySeen: DisplayMode[] = [];
    const enabledSeen: boolean[] = [];
    const group = new Group(
      { a: new Field({ value: 1 }) },
      {
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
      },
    );

    expect(group.visibility).toBe(DisplayMode.SUPPRESS);
    expect(group.enabled).toBe(true);
    expect(visibilitySeen).toEqual([DisplayMode.SUPPRESS]);
    expect(enabledSeen).toEqual([true]);
  });

  it('takes a clone value override only from a value the caller supplied', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });

    expect(group.clone().value).toEqual({ a: 1, b: 2 });
    expect(group.clone({ value: undefined }).value).toEqual({ a: 1, b: 2 });
    expect(group.clone({ value: null }).value).toEqual({ a: null, b: null });
    expect(group.clone({ value: { a: 7 } }).value).toEqual({ a: 7, b: 2 });
  });
});
