import { vi } from 'vitest';

import { ValidChangedAction } from './actions';
import { Field } from './field';
import { FieldBase } from './field-base';
import { GenericFieldsInterface, Group } from './group';
import { List } from './list';
import { ValidationErrorText } from './validators/validation-error';
import { ValidationFunctionResult, Validator } from './validators/validator';

/**
 * A ValidChangedAction carries the new verdict and the one it replaces, and the pair a level emits is the whole
 * statement that level makes about itself. These tests therefore assert the complete array of pairs each level
 * emitted, not just the final valid flag: a level that changes its mind twice over one operation, or that reports
 * a verdict composed of a half-applied value, fails here even though its end state is right.
 */
type Transition = [boolean, boolean];

function watch(field: FieldBase<any>): Transition[] {
  const seen: Transition[] = [];
  field.registerAction(
    new ValidChangedAction((f, supr, newValue: boolean, oldValue: boolean) => {
      seen.push([newValue, oldValue]);
    }),
  );
  return seen;
}

/** rejects an empty string, a null and an undefined */
const notEmpty = () =>
  new Validator((value: any) => (value === '' || value == null ? [new ValidationErrorText('empty')] : null));

/** a container-level validator: rejects two members that hold the same value */
const membersMustDiffer = (first: string, second: string) =>
  new Validator((newValue: any, oldValue: any, field: FieldBase<any>) => {
    const fields = (field as Group).fields;
    return fields[first].value === fields[second].value ? [new ValidationErrorText('members are equal')] : null;
  });

/** a validator whose verdict is decided by the test rather than by the value */
const switchable = (state: { ok: boolean }) =>
  new Validator(() => (state.ok ? null : [new ValidationErrorText('rejected')]));

function crossValidatedGroup() {
  const a = new Field({ value: '', validators: [notEmpty()] });
  const b = new Field({ value: 'x' });
  const group = new Group({ a, b }, { validators: [membersMustDiffer('a', 'b')] });
  return { a, b, group };
}

describe('Validity events on a member assignment', () => {
  it('says nothing when the member turns valid and the group-level validator turns against it', () => {
    const { a, group } = crossValidatedGroup();
    expect(group.valid).toBe(false);
    const seenA = watch(a);
    const seenGroup = watch(group);

    // a becomes non-empty and thereby equal to b: the member is now valid and the group is invalid on its own
    // account instead of on the member's, so the group's verdict never changes
    a.value = 'x';

    expect(seenA).toEqual([[true, false]]);
    expect(seenGroup).toEqual([]);
    expect(a.valid).toBe(true);
    expect(group.valid).toBe(false);
  });

  it('announces once, with the final verdict, when the member assignment clears the group', () => {
    const { a, group } = crossValidatedGroup();
    const seenA = watch(a);
    const seenGroup = watch(group);

    a.value = 'y';

    expect(seenA).toEqual([[true, false]]);
    expect(seenGroup).toEqual([[true, false]]);
    expect(group.valid).toBe(true);
  });

  it('announces once when the group-level validator alone turns against a member assignment', () => {
    const a = new Field({ value: 'p', validators: [notEmpty()] });
    const b = new Field({ value: 'x' });
    const group = new Group({ a, b }, { validators: [membersMustDiffer('a', 'b')] });
    expect(group.valid).toBe(true);
    const seenA = watch(a);
    const seenGroup = watch(group);

    a.value = 'x';

    expect(seenA).toEqual([]);
    expect(seenGroup).toEqual([[false, true]]);
    expect(group.valid).toBe(false);
  });

  it('announces once on a group without validators of its own', () => {
    const a = new Field({ value: '', validators: [notEmpty()] });
    const group = new Group({ a, b: new Field({ value: 'y' }) });
    const seenA = watch(a);
    const seenGroup = watch(group);

    a.value = 'q';

    expect(seenA).toEqual([[true, false]]);
    expect(seenGroup).toEqual([[true, false]]);
  });

  it('reaches the group when the assignment leaves the group value equal to what it was', () => {
    const state = { ok: true };
    const a = new Field<Record<string, number>>({ value: { x: 1 }, validators: [switchable(state)] });
    const group = new Group({ a });
    const seenA = watch(a);
    const seenGroup = watch(group);

    state.ok = false;
    // a distinct object of equal content: the assignment goes through, the group's own value does not change
    a.value = { x: 1 };

    expect(seenA).toEqual([[false, true]]);
    expect(seenGroup).toEqual([[false, true]]);
    expect(group.valid).toBe(false);
  });
});

describe('Validity events on a whole-container assignment', () => {
  it('says nothing when the assignment leaves the group as invalid as it found it', () => {
    const a = new Field({ value: '', validators: [notEmpty()] });
    const b = new Field({ value: 'y', validators: [notEmpty()] });
    const group = new Group({ a, b });
    const seenA = watch(a);
    const seenB = watch(b);
    const seenGroup = watch(group);

    group.value = { a: 'x', b: '' };

    expect(seenA).toEqual([[true, false]]);
    expect(seenB).toEqual([[false, true]]);
    expect(seenGroup).toEqual([]);
    expect(group.valid).toBe(false);
  });

  it('announces the final verdict once when the assignment flips the group', () => {
    const a = new Field({ value: '', validators: [notEmpty()] });
    const b = new Field({ value: 'y', validators: [notEmpty()] });
    const group = new Group({ a, b }, { validators: [membersMustDiffer('a', 'b')] });
    const seenGroup = watch(group);

    group.value = { a: 'x', b: 'z' };

    expect(seenGroup).toEqual([[true, false]]);
    expect(group.valid).toBe(true);
  });

  it('says nothing when the assignment moves the invalidity from one list item to another', () => {
    const list = new List(new Group({ a: new Field({ validators: [notEmpty()] }) }), {
      value: [{ a: 'x' }, { a: '' }],
    });
    const seenList = watch(list);

    list.value = [{ a: '' }, { a: 'y' }];

    expect(seenList).toEqual([]);
    expect(list.valid).toBe(false);
  });
});

describe('Validity events on validate(true)', () => {
  it('says nothing when a group revalidation moves the invalidity from one member to another', () => {
    const first = { ok: false };
    const second = { ok: true };
    const a = new Field({ value: 'a', validators: [switchable(first)] });
    const b = new Field({ value: 'b', validators: [switchable(second)] });
    const group = new Group({ a, b });
    expect(group.valid).toBe(false);
    const seenA = watch(a);
    const seenB = watch(b);
    const seenGroup = watch(group);

    first.ok = true;
    second.ok = false;
    group.validate(true);

    expect(seenA).toEqual([[true, false]]);
    expect(seenB).toEqual([[false, true]]);
    expect(seenGroup).toEqual([]);
    expect(group.valid).toBe(false);
  });

  it('announces once when a group revalidation clears the last invalid member', () => {
    const state = { ok: false };
    const a = new Field({ value: 'a', validators: [switchable(state)] });
    const group = new Group({ a, b: new Field({ value: 'b' }) });
    const seenGroup = watch(group);

    state.ok = true;
    group.validate(true);

    expect(seenGroup).toEqual([[true, false]]);
    expect(group.valid).toBe(true);
  });

  it('says nothing when a list revalidation moves the invalidity from one item to another', () => {
    const first = { ok: false };
    const second = { ok: true };
    // the items are built separately so that each carries a validator of its own
    const itemOne = new Group({ a: new Field({ value: 'x', validators: [switchable(first)] }) });
    const itemTwo = new Group({ a: new Field({ value: 'y', validators: [switchable(second)] }) });
    const list = new List(undefined, { value: [itemOne, itemTwo] });
    expect(list.valid).toBe(false);
    const seenOne = watch(itemOne);
    const seenTwo = watch(itemTwo);
    const seenList = watch(list);

    first.ok = true;
    second.ok = false;
    list.validate(true);

    expect(seenOne).toEqual([[true, false]]);
    expect(seenTwo).toEqual([[false, true]]);
    expect(seenList).toEqual([]);
    expect(list.valid).toBe(false);
  });

  it('announces once when a list revalidation clears its last invalid item', () => {
    const state = { ok: false };
    const list = new List(new Group({ a: new Field({ validators: [switchable(state)] }) }), {
      value: [{ a: 'x' }, { a: 'y' }],
    });
    const seenList = watch(list);
    const seenItem = watch(list.get(0)!);

    state.ok = true;
    list.validate(true);

    expect(seenItem).toEqual([[true, false]]);
    expect(seenList).toEqual([[true, false]]);
    expect(list.valid).toBe(true);
  });
});

describe('Validity events without a value change', () => {
  it('announces once on both levels when a member drops its validators', () => {
    const a = new Field({ value: '', validators: [notEmpty()] });
    const group = new Group({ a, b: new Field({ value: 'y' }) });
    const seenA = watch(a);
    const seenGroup = watch(group);

    a.clearValidators();

    expect(seenA).toEqual([[true, false]]);
    expect(seenGroup).toEqual([[true, false]]);
    expect(group.valid).toBe(true);
  });

  it('announces once on both levels when an error is pushed into a member and validated in', () => {
    const a = new Field({ value: 'a' });
    const group = new Group({ a, b: new Field({ value: 'b' }) });
    const seenA = watch(a);
    const seenGroup = watch(group);

    a.errors.push(new ValidationErrorText('pushed in'));
    a.validate();

    expect(seenA).toEqual([[false, true]]);
    expect(seenGroup).toEqual([[false, true]]);
    expect(group.valid).toBe(false);
  });

  it('announces once on both levels when an asynchronous validator settles', async () => {
    let resolveFn: (result: ValidationFunctionResult) => void = () => {};
    const pending = new Promise<ValidationFunctionResult>((resolve) => {
      resolveFn = resolve;
    });
    const a = new Field({ value: 'a', validators: [new Validator(() => pending)] });
    const group = new Group({ a, b: new Field({ value: 'b' }) });
    expect(a.validating).toBe(true);
    expect(group.valid).toBe(true);
    const seenA = watch(a);
    const seenGroup = watch(group);

    resolveFn([new ValidationErrorText('rejected by the service')]);
    await vi.waitFor(() => {
      expect(a.validating).toBe(false);
    });

    expect(seenA).toEqual([[false, true]]);
    expect(seenGroup).toEqual([[false, true]]);
    expect(group.valid).toBe(false);
  });
});

describe('Validity events across nesting levels', () => {
  function nestedGroups() {
    const a = new Field({ value: '', validators: [notEmpty()] });
    const inner = new Group({ a, b: new Field({ value: 'x' }) });
    const root = new Group({ inner, c: new Field({ value: 'y' }) });
    return { a, inner, root };
  }

  it('announces once on every level when a leaf assignment flips them all', () => {
    const { a, inner, root } = nestedGroups();
    expect(root.valid).toBe(false);
    const seenA = watch(a);
    const seenInner = watch(inner);
    const seenRoot = watch(root);

    a.value = 'q';

    expect(seenA).toEqual([[true, false]]);
    expect(seenInner).toEqual([[true, false]]);
    expect(seenRoot).toEqual([[true, false]]);
    expect(root.valid).toBe(true);
  });

  it('stops at the level whose verdict the leaf assignment does not change', () => {
    const { a, inner, root } = nestedGroups();
    // the root is invalid on its own account as well, so clearing the leaf leaves it invalid
    root.errors.push(new ValidationErrorText('root level'));
    root.validate();
    const seenA = watch(a);
    const seenInner = watch(inner);
    const seenRoot = watch(root);

    a.value = 'q';

    expect(seenA).toEqual([[true, false]]);
    expect(seenInner).toEqual([[true, false]]);
    expect(seenRoot).toEqual([]);
    expect(root.valid).toBe(false);
  });

  it('says nothing above the group whose own validator takes over the invalidity', () => {
    const a = new Field({ value: '', validators: [notEmpty()] });
    const inner = new Group({ a, b: new Field({ value: 'x' }) }, { validators: [membersMustDiffer('a', 'b')] });
    const root = new Group({ inner, c: new Field({ value: 'y' }) });
    const seenA = watch(a);
    const seenInner = watch(inner);
    const seenRoot = watch(root);

    a.value = 'x';

    expect(seenA).toEqual([[true, false]]);
    expect(seenInner).toEqual([]);
    expect(seenRoot).toEqual([]);
    expect(root.valid).toBe(false);
  });

  it('says nothing on the root whose own validator takes over the invalidity an inner group sheds', () => {
    const a = new Field({ value: 'x' });
    const inner = new Group({ a, b: new Field({ value: 'x' }) }, { validators: [membersMustDiffer('a', 'b')] });
    const c = new Field({ value: 'y' });
    const root = new Group(
      { inner, c },
      {
        validators: [
          new Validator((newValue: any, oldValue: any, field: FieldBase<any>) => {
            const fields = (field as Group).fields;
            const innerValue = fields.inner.value as Record<string, any>;
            return innerValue?.a === fields.c.value ? [new ValidationErrorText('inner.a equals c')] : null;
          }),
        ],
      },
    );
    expect(root.valid).toBe(false);
    const seenInner = watch(inner);
    const seenRoot = watch(root);

    // the inner group's own validator is satisfied by the assignment and the root's own validator is not
    a.value = 'y';

    expect(seenInner).toEqual([[true, false]]);
    expect(seenRoot).toEqual([]);
    expect(root.valid).toBe(false);
  });

  it('says nothing on the root whose own validator takes over the invalidity a list assignment sheds', () => {
    const list = new List(new Group({ a: new Field() }), {
      validators: [new Validator((value: any) => (value == null ? [new ValidationErrorText('list is empty')] : null))],
    });
    const root = new Group(
      { list },
      {
        validators: [
          new Validator((value: any) =>
            (value?.list?.length ?? 0) > 1 ? [new ValidationErrorText('more than one item')] : null,
          ),
        ],
      },
    );
    expect(root.valid).toBe(false);
    const seenList = watch(list);
    const seenRoot = watch(root);

    list.value = [{ a: 1 }, { a: 2 }];

    expect(seenList).toEqual([[true, false]]);
    expect(seenRoot).toEqual([]);
    expect(root.valid).toBe(false);
  });

  it('says nothing on the root whose own validator takes over the invalidity an item assignment sheds', () => {
    const list = new List(new Group({ a: new Field() }), {
      value: [{ a: '' }],
      validators: [
        new Validator((value: any) =>
          value?.some((item: Record<string, any>) => item.a === '') ? [new ValidationErrorText('empty item')] : null,
        ),
      ],
    });
    const root = new Group(
      { list },
      {
        validators: [
          new Validator((value: any) =>
            value?.list?.[0]?.a === 'x' ? [new ValidationErrorText('first item is x')] : null,
          ),
        ],
      },
    );
    expect(root.valid).toBe(false);
    const seenList = watch(list);
    const seenRoot = watch(root);

    list.get(0)!.fields.a.value = 'x';

    expect(seenList).toEqual([[true, false]]);
    expect(seenRoot).toEqual([]);
    expect(root.valid).toBe(false);
  });

  it('announces once on the item, the list and the group holding the list', () => {
    const list = new List(new Group({ a: new Field({ validators: [notEmpty()] }) }), { value: [{ a: '' }] });
    const root = new Group({ list, c: new Field({ value: 'y' }) });
    const item = list.get(0)! as Group<GenericFieldsInterface>;
    const seenItem = watch(item);
    const seenList = watch(list);
    const seenRoot = watch(root);

    item.fields.a.value = 'filled';

    expect(seenItem).toEqual([[true, false]]);
    expect(seenList).toEqual([[true, false]]);
    expect(seenRoot).toEqual([[true, false]]);
    expect(root.valid).toBe(true);
  });

  it('says nothing above the list when another item is still invalid', () => {
    const list = new List(new Group({ a: new Field({ validators: [notEmpty()] }) }), {
      value: [{ a: '' }, { a: '' }],
    });
    const root = new Group({ list });
    const item = list.get(0)!;
    const seenItem = watch(item);
    const seenList = watch(list);
    const seenRoot = watch(root);

    item.fields.a.value = 'filled';

    expect(seenItem).toEqual([[true, false]]);
    expect(seenList).toEqual([]);
    expect(seenRoot).toEqual([]);
    expect(root.valid).toBe(false);
  });
});

describe('Validity events that reach a parent whose own value did not change', () => {
  it('carries a disabled list item change up to the root', () => {
    const list = new List(new Group({ a: new Field() }), {
      enabled: false,
      validators: [new Validator((value: any) => (value == null ? [new ValidationErrorText('empty')] : null))],
    });
    const root = new Group({ list, c: new Field({ value: 'y' }) });
    const seenList = watch(list);
    const seenRoot = watch(root);

    // a disabled List is left out of Group.value, so the root's own value is unchanged by this push and its
    // notifyValueChanged() returns without validating; the verdict reaches it only through the deferred climb
    list.push({ a: 1 });

    expect(seenList).toEqual([[true, false]]);
    expect(seenRoot).toEqual([[true, false]]);
    expect(root.valid).toBe(true);
  });

  it('carries a disabled list assignment up to the root', () => {
    const list = new List(new Group({ a: new Field() }), {
      enabled: false,
      validators: [new Validator((value: any) => (value == null ? [new ValidationErrorText('empty')] : null))],
    });
    const root = new Group({ list, c: new Field({ value: 'y' }) });
    const seenList = watch(list);
    const seenRoot = watch(root);

    list.value = [{ a: 1 }];

    expect(seenList).toEqual([[true, false]]);
    expect(seenRoot).toEqual([[true, false]]);
    expect(root.valid).toBe(true);
  });
});
