import { isEqual } from 'lodash-es';
import { vi } from 'vitest';
import { nextTick, watchEffect } from 'vue';

import { Action } from './action';
import {
  EnabledChangedAction,
  EnabledChangingAction,
  ExecuteAction,
  ValidChangedAction,
  ValueChangedAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { GenericFieldsInterface, Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
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

  it('keeps a disabled group while its members compose something, and leaves an empty one out', () => {
    const sub = new Group({ a: new Field({ value: 1 }) }, { enabled: false });
    const group = new Group({ sub });

    expect(group.value).toEqual({ sub: { a: 1 } });

    sub.fields.a.enabled = false;

    expect(group.value).toBeNull();
  });

  it('keeps a disabled list while its rows compose something, and leaves an empty one out', () => {
    const rows = new List(new Group({ a: new Field({ value: 0 }) }), { value: [{ a: 1 }], enabled: false });
    const group = new Group({ name: new Field({ value: 'x' }), rows });

    expect(group.value).toEqual({ name: 'x', rows: [{ a: 1 }] });

    rows.clear();

    expect(group.value).toEqual({ name: 'x' });
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
    expect(group.bind().value).toEqual(expected);
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

    expect(() => group.addField('y', new Field({ value: 2 }))).toThrow(/already in this form/);
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
    expect(JSON.stringify(inner)).not.toContain('parent');
    expect(JSON.stringify(inner)).not.toContain('fieldName');
    expect(Object.keys(list.get(0)!)).not.toContain('parent');

    expect(() => JSON.stringify(outer)).not.toThrow();
    // isEqual walks the same enumerable properties, so it must terminate as well
    expect(() => isEqual(outer, outer.bind())).not.toThrow();
  });

  it('keeps the container link out of reach of a walker, and compares elements by identity', () => {
    // isEqual walks own string keys and own enumerable symbols alike, so the parent link must be reachable
    // through neither - a walk that found it would follow the parent/child cycle
    const inner = new Field({ value: 1 });
    const inner2 = new Field({ value: 1 });
    const left = new Group({ inner, sibling: new Field({ value: 'A' }) });
    const right = new Group({ inner: inner2, sibling: new Field({ value: 'B' }) });

    expect(inner.parent).toBe(left);
    expect(inner2.parent).toBe(right);
    expect(Object.getOwnPropertySymbols(inner)).toEqual([]);
    // the comparison ends at the element's tag, so two elements are equal only where they are the same one
    expect(isEqual(inner, inner2)).toBe(false);
    expect(isEqual(inner, inner)).toBe(true);
    // what two of them hold is compared over their values
    expect(isEqual(left.value, right.value)).toBe(false);
    expect(isEqual(left.fields.inner.value, right.fields.inner.value)).toBe(true);
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

  it('takes the data it binds only from an argument the caller supplied', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });

    expect(group.bind().value).toEqual({ a: 1, b: 2 });
    expect(group.bind(undefined).value).toEqual({ a: 1, b: 2 });
    expect(group.bind(null).value).toEqual({ a: null, b: null });
    expect(group.bind({ a: 7 }).value).toEqual({ a: 7, b: 2 });
  });
});

describe('Group value = null', () => {
  it('clears a nested List along with the plain fields', () => {
    const template = new Group({ a: new Field({ value: '' }) });
    const group = new Group({
      f: new Field({ value: 'x' }),
      l: new List(template, { value: [{ a: '1' }, { a: '2' }] }),
    });

    group.value = null;

    expect(group.value).toEqual({ f: null, l: null });
  });

  it('clears a nested List through a binding that supplies null', () => {
    const template = new Group({ a: new Field({ value: '' }) });
    const group = new Group({
      f: new Field({ value: 'x' }),
      l: new List(template, { value: [{ a: '1' }] }),
    });

    expect(group.bind(null).value).toEqual({ f: null, l: null });
  });
});

describe('Group value caching', () => {
  it('answers a repeated read with the object it built last, and with a new one after a member changes', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });

    const first = group.value;
    expect(group.value).toBe(first);

    group.fields.a.value = 9;

    const second = group.value;
    expect(second).not.toBe(first);
    expect(second).toEqual({ a: 9, b: 2 });
    expect(group.value).toBe(second);
    // the object handed out earlier keeps the value it was built from instead of being rewritten in place
    expect(first).toEqual({ a: 1, b: 2 });
  });

  it('builds a new object when a member is disabled, because a disabled member stops serializing', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const before = group.value;

    group.fields.b.enabled = false;

    expect(group.value).not.toBe(before);
    expect(group.value).toEqual({ a: 1 });
  });

  it('supersedes the value of every ancestor when a leaf deep inside is written', () => {
    const leaf = new Field({ value: 1 });
    const inner = new Group({ leaf });
    const rows = new List(new Group({ n: new Field({ value: 0 }) }), { value: [{ n: 1 }] });
    const root = new Group({ inner, rows });

    const innerBefore = inner.value;
    const rootBefore = root.value;

    leaf.value = 2;

    expect(inner.value).not.toBe(innerBefore);
    expect(root.value).not.toBe(rootBefore);
    expect(root.value).toEqual({ inner: { leaf: 2 }, rows: [{ n: 1 }] });

    const rowsBefore = rows.value;
    const rootBetween = root.value;

    rows.get(0)!.fields.n.value = 7;

    expect(rows.value).not.toBe(rowsBefore);
    expect(root.value).not.toBe(rootBetween);
    expect(root.value).toEqual({ inner: { leaf: 2 }, rows: [{ n: 7 }] });
  });
});

describe('Group validity reading', () => {
  it('reports a group invalid over an error pushed into a member without any validate() call', () => {
    const member = new Field({ value: 'x' });
    const inner = new Group({ member });
    const root = new Group({ inner });
    expect(root.valid).toBe(true);

    inner.fields.member.errors.push(new ValidationErrorText('pushed in'));

    expect(inner.valid).toBe(false);
    expect(root.valid).toBe(false);
  });
});

describe('Group value object', () => {
  it('is not the object originalValue holds', () => {
    const group = new Group({ a: new Field({ value: 1 }) });

    expect(group.value).not.toBe(group.originalValue);
    expect(group.value).toEqual(group.originalValue);
  });

  it('is frozen, so the value the group reports cannot be rewritten behind its back', () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const value = group.value!;

    expect(Object.isFrozen(value)).toBe(true);
    expect(() => {
      (value as any).a = 99;
    }).toThrow();
    expect(group.value).toEqual({ a: 1 });
    expect(group.originalValue).toEqual({ a: 1 });
  });
});

describe('Group field ownership', () => {
  it('refuses a field another group already holds', () => {
    const shared = new Field({ value: 1 });
    const first = new Group({ shared });

    expect(() => new Group({ shared })).toThrow(TypeError);
    expect(shared.parent).toBe(first);
    expect(first.value).toEqual({ shared: 1 });
  });

  it('refuses a field a list row already holds', () => {
    const list = new List(new Group({ a: new Field({ value: 'x' }) }), { value: [{ a: 'y' }] });

    expect(() => new Group({ borrowed: list.get(0)!.fields.a })).toThrow(TypeError);
  });
});

describe('Group membership after construction', () => {
  it('takes a field in and serializes it, announcing the change once', () => {
    const onValueChanged = vi.fn();
    // the type argument is the interface a group whose members change at runtime is declared with: addField takes
    // a name of its own and cannot widen the type the group was built with
    const group = new Group<GenericFieldsInterface>({ a: new Field({ value: 1 }) }).registerAction(
      new ValueChangedAction(onValueChanged),
    );
    const b = new Field({ value: 2 });

    expect(group.addField('b', b)).toBe(group);

    expect(group.value).toEqual({ a: 1, b: 2 });
    expect(group.fields.b).toBe(b);
    expect(Object.keys(group.fields)).toEqual(['a', 'b']);
    expect(b.parent).toBe(group);
    expect(b.fieldName).toBe('b');
    expect(onValueChanged).toHaveBeenCalledTimes(1);
    expect(onValueChanged.mock.calls[0][2]).toEqual({ a: 1, b: 2 });
    expect(onValueChanged.mock.calls[0][3]).toEqual({ a: 1 });
  });

  it('re-forms its verdict over the member it took and the one it gave up', () => {
    const group = new Group({ a: new Field({ value: 'a' }) });
    const invalid = new Field({ value: '', validators: [new Validators.Required('Required')] });

    expect(group.valid).toBe(true);

    group.addField('b', invalid);
    expect(group.valid).toBe(false);

    expect(group.removeField('b')).toBe(invalid);
    expect(group.valid).toBe(true);
    // the field it no longer holds moves its tally no further
    invalid.value = 'x';
    invalid.value = '';
    expect(group.valid).toBe(true);
  });

  it('refuses a field another container already holds', () => {
    const first = new Group({ shared: new Field({ value: 1 }) });
    const second = new Group({});

    expect(() => second.addField('shared', first.fields.shared)).toThrow(TypeError);
    expect(first.fields.shared.parent).toBe(first);
    expect(Object.keys(second.fields)).toEqual([]);
  });

  it('hands the removed field back detached, so another group can take it', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const onValueChanged = vi.fn();
    group.registerAction(new ValueChangedAction(onValueChanged));

    const removed = group.removeField('b')!;

    expect(removed.parent).toBeUndefined();
    expect(removed.fieldName).toBeUndefined();
    expect(removed.value).toBe(2);
    expect(group.value).toEqual({ a: 1 });
    expect(group.field('b')).toBeNull();
    expect(Object.keys(group.fields)).toEqual(['a']);
    expect(onValueChanged).toHaveBeenCalledTimes(1);

    const other = new Group({});
    other.addField('b', removed);
    expect(other.value).toEqual({ b: 2 });
  });

  it('answers undefined for a name it does not hold, and says nothing', () => {
    const onValueChanged = vi.fn();
    const group = new Group({ a: new Field({ value: 1 }) }).registerAction(new ValueChangedAction(onValueChanged));

    expect(group.removeField('nothing')).toBeUndefined();
    expect(group.value).toEqual({ a: 1 });
    expect(onValueChanged).not.toHaveBeenCalled();
  });

  it('puts the set of members back when the transaction it changed in is rolled back', () => {
    const group = new Group<GenericFieldsInterface>({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const added = new Field({ value: 3 });

    transaction((tx) => {
      group.addField('c', added);
      group.removeField('b');
      expect(group.value).toEqual({ a: 1, c: 3 });
      tx.rollback();
    });

    expect(Object.keys(group.fields)).toEqual(['a', 'b']);
    expect(group.value).toEqual({ a: 1, b: 2 });
    expect(group.field('c')).toBeNull();
    expect(added.parent).toBeUndefined();
    expect(group.fields.b.parent).toBe(group);
  });

  it('settles value and validity once for a set of changes made in one transaction', () => {
    const onValueChanged = vi.fn();
    const onValidChanged = vi.fn();
    const group = new Group({ a: new Field({ value: 1 }) })
      .registerAction(new ValueChangedAction(onValueChanged))
      .registerAction(new ValidChangedAction(onValidChanged));

    transaction(() => {
      group.addField('b', new Field({ value: '', validators: [new Validators.Required('Required')] }));
      group.addField('c', new Field({ value: 3 }));
      group.removeField('a');
    });

    expect(group.value).toEqual({ b: '', c: 3 });
    expect(onValueChanged).toHaveBeenCalledTimes(1);
    expect(onValidChanged).toHaveBeenCalledTimes(1);
    expect(onValidChanged.mock.calls[0][2]).toBe(false);
  });

  it('runs a rule of the new field that reaches the record it joined', () => {
    const template = new Group({
      password: new Field<string>({ value: '' }),
      confirmation: new Field<string>({ value: '' }),
    });
    template.fields.confirmation.registerAction(
      new Validators.CompareTo(template.fields.password, (mine: string, other: string) => mine === other, 'must match'),
    );
    const form = new Group({ password: template.fields.password.bind('secret') });
    // bound on its own, the rule reaches no record: the field it names lives in the form the binding has yet to join
    const confirmation = template.fields.confirmation.bind('typo');
    expect(confirmation.errors.length).toBe(0);

    form.addField('confirmation', confirmation);

    expect(confirmation.errors.length).toBe(1);
    expect(form.valid).toBe(false);
  });

  it('re-renders a reader of the value as the member set changes', async () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const seen: unknown[] = [];
    watchEffect(() => seen.push(group.value));

    group.addField('b', new Field({ value: 2 }));
    await nextTick();
    group.removeField('a');
    await nextTick();

    expect(seen).toEqual([{ a: 1 }, { a: 1, b: 2 }, { b: 2 }]);
  });

  it('refuses every write to the view it hands out', () => {
    const group = new Group<GenericFieldsInterface>({ a: new Field({ value: 1 }) });
    const other = new Field({ value: 2 });

    expect('a' in group.fields).toBe(true);
    expect('b' in group.fields).toBe(false);

    expect(() => {
      group.fields.a = other;
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(group.fields, 'b', { value: other })).toThrow(TypeError);
    expect(() => {
      delete group.fields.a;
    }).toThrow(TypeError);

    expect(group.fields.a).not.toBe(other);
    expect(Object.keys(group.fields)).toEqual(['a']);
  });

  it('re-runs a reader of fields as members come and go', async () => {
    const group = new Group<GenericFieldsInterface>({ a: new Field({ value: 1 }) });
    const seen: string[][] = [];
    watchEffect(() => {
      seen.push(Object.keys(group.fields));
    });

    group.addField('b', new Field({ value: 2 }));
    await nextTick();
    group.removeField('b');
    await nextTick();
    // a write inside a member is that member's business and says nothing about the set
    group.fields.a.value = 7;
    await nextTick();

    expect(seen).toEqual([['a'], ['a', 'b'], ['a']]);
  });

  it('answers busy over the members it holds now', async () => {
    const group = new Group<GenericFieldsInterface>({ a: new Field({ value: 1 }) });
    let settle: (value: unknown) => void = () => null;
    const b = new Action({ actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))] });
    const running = b.execute();

    expect(group.busy).toBe(false);

    group.addField('b', b);
    expect(group.busy).toBe(true);

    group.removeField('b');
    expect(group.busy).toBe(false);
    expect(b.busy).toBe(true);

    settle(null);
    await running;
  });
});

describe('bind() and the class it builds', () => {
  it('binds a subclass into its own type', () => {
    class Address extends Group<{ city: Field<string> }> {}
    const declaration = new Address({ city: new Field({ value: 'Ljubljana' }) });

    const bound = declaration.bind({ city: 'Maribor' });

    expect(bound).toBeInstanceOf(Address);
    expect(bound.value).toEqual({ city: 'Maribor' });
    expect(bound.declaration).toBe(declaration);
  });

  it('refuses to answer with a binding a subclass built from its own members', () => {
    class Fixed extends Group<{ city: Field<string> }> {
      constructor() {
        // the members are the subclass's own, so the ones bind() hands over are never seen
        super({ city: new Field({ value: 'declared' }) });
      }
    }
    const declaration = new Fixed();

    expect(() => declaration.bind({ city: 'Maribor' })).toThrow(
      /did not take the members it was given|has to override bind/,
    );
  });
});
