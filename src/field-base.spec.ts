import { isEqual } from 'lodash-es';
import { nextTick, watchEffect } from 'vue';

import { Action } from './action';
import {
  EnabledChangedAction,
  EnabledChangingAction,
  ExecuteAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from './actions';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { ValueChangedAction } from './actions/value-changed-action';
import DisplayMode from './display-mode';
import { Field } from './field';
import { FieldBase } from './field-base';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { Validators } from './validators';
import { ValidationErrorText } from './validators/validation-error';

it('triggers action with custom parameters', () => {
  // Create a field with a custom action
  let capturedField: any;
  let capturedNewValue: any;
  let capturedOldValue: any;

  const valueChangedAction = new ValueChangedAction((field, supr, newValue, oldValue) => {
    capturedField = field;
    capturedNewValue = newValue;
    capturedOldValue = oldValue;
  });

  const field = new Field({ value: 'initial' });
  field.registerAction(valueChangedAction);

  // Trigger the action manually with custom parameters
  field.triggerAction(ValueChangedAction, 'new value', 'old value');

  // Verify the action was triggered with the correct parameters
  expect(capturedField).toBe(field);
  expect(capturedNewValue).toBe('new value');
  expect(capturedOldValue).toBe('old value');
});

it('clears all validators and resets errors', () => {
  // Create a field with validators that will produce errors
  const field = new Field({ value: '' }).registerAction(new Validators.Required('Required field'));

  // Initially should have errors (empty value with Required validator)
  expect(field.errors.length).toBe(1);
  expect(field.valid).toBe(false);

  // Clear validators
  field.clearValidators();

  // Should have no errors and be valid
  expect(field.errors.length).toBe(0);
  expect(field.valid).toBe(true);

  // Changing field1 should not trigger validation
  field.value = 'new value';
  field.value = '';
  expect(field.errors.length).toBe(0);
  expect(field.valid).toBe(true);
});

it('carries the actions that are not validators over to the new chain', () => {
  const seen: string[] = [];
  const field = new Field({ value: 'a', validators: [new Validators.Required('Required field')] });
  field.registerAction(new ValueChangedAction((f, supr, newValue) => seen.push(String(newValue))));

  field.clearValidators();

  field.value = '';
  expect(seen).toEqual(['']);
  expect(field.errors.length).toBe(0);
});

it('clears CompareTo validator and its cross-field references', () => {
  // Create two fields
  const field1 = new Field<string>({ value: 'value1' });
  const field2 = new Field<string>({ value: 'value2' });

  // Add CompareTo validator to check for equality
  const compareToValidator = new Validators.CompareTo(
    field2,
    (val1: string, val2: string) => val1 === val2,
    'Fields must match',
  );
  field1.registerAction(compareToValidator);

  // Initially should have errors (values don't match)
  expect(field1.errors.length).toBe(1);

  // Clear validators
  field1.clearValidators();

  // Should have no errors and be valid
  expect(field1.errors.length).toBe(0);
  expect(field1.valid).toBe(true);

  // Changing the other field should not trigger validation on field1
  field2.value = 'new value';
  expect(field1.errors.length).toBe(0);
  expect(field1.valid).toBe(true);

  // Changing field1 should not trigger validation
  field1.value = 'another value';
  expect(field1.errors.length).toBe(0);
  expect(field1.valid).toBe(true);
});

it('clears the validators of one field without silencing the same validator on another', () => {
  const limit = new Field<number>({ value: 10 });
  const shared = new Validators.CompareTo<number>(limit, (mine, max) => mine <= max, 'above the limit');
  const first = new Field<number>({ value: 1 });
  const second = new Field<number>({ value: 1 });
  first.registerAction(shared);
  second.registerAction(shared);

  expect(first.errors.length).toBe(0);
  expect(second.errors.length).toBe(0);

  first.clearValidators();

  // the same instance goes on serving the field that kept it, and answers to the compared field as before
  limit.value = 0;
  expect(first.errors.length).toBe(0);
  expect(second.errors.length).toBe(1);
});

it('clears the validators of every row, because the rule was the declarations', () => {
  const template = new Group({
    from: new Field<number>({ value: 0 }),
    to: new Field<number>({ value: 0 }),
  });
  template.fields.to.registerAction(
    new Validators.CompareTo<number>(template.fields.from, (to, from) => to >= from, 'to precedes from'),
  );

  const list = new List(template, {
    value: [
      { from: 10, to: 1 },
      { from: 10, to: 1 },
    ],
  });
  expect(list.get(0)!.fields.to.errors.length).toBe(1);
  expect(list.get(1)!.fields.to.errors.length).toBe(1);

  // the call names one row and reaches the rule every row reads, so each of them withdraws what it contributed
  list.get(0)!.fields.to.clearValidators();

  expect(list.get(0)!.fields.to.errors.length).toBe(0);
  expect(list.get(1)!.fields.to.errors.length).toBe(0);

  // and no row answers to the field it used to compare against
  list.get(1)!.fields.from.value = 20;
  expect(list.get(1)!.fields.to.errors.length).toBe(0);
  list.get(0)!.fields.from.value = 20;
  expect(list.get(0)!.fields.to.errors.length).toBe(0);
});

class TrackingAction extends ValueChangedAction {
  public boundTo: FieldBase | null = null;

  public runs = 0;

  constructor() {
    super(() => {
      this.runs++;
    });
  }

  get eager() {
    return true;
  }

  boundToBinding(binding: FieldBase) {
    this.boundTo = binding;
  }
}

class TestField extends Field<string> {
  public registerInitial(actions: FieldActionBase[]) {
    this.registerInitialActions(actions);
  }
}

it('registers initial actions and binds them without running the eager ones', () => {
  const field = new TestField({ value: 'x' });
  const action = new TrackingAction();

  field.registerInitial([action]);

  expect(action.boundTo).toBe(field);
  expect(action.runs).toBe(0);

  // the action is registered nonetheless: the next eager pass executes it
  field.validate(true);
  expect(action.runs).toBe(1);
});

it('propagates a validity change to the enclosing groups', () => {
  const child = new Field({ value: 'x' });
  const inner = new Group({ child });
  const outer = new Group({ inner });

  const fires: boolean[] = [];
  outer.registerAction(
    new ValidChangedAction((field, supr, newValue) => {
      fires.push(newValue);
    }),
  );

  expect(outer.valid).toBe(true);

  // an error pushed from the outside changes validity without any value change
  child.errors.push(new ValidationErrorText('pushed from outside'));
  child.validate();

  expect(inner.valid).toBe(false);
  expect(outer.valid).toBe(false);
  expect(fires).toEqual([false]);

  child.errors.splice(0);
  child.validate();

  expect(outer.valid).toBe(true);
  expect(fires).toEqual([false, true]);
});

it('stops propagating validity upwards where the ancestor validity is unchanged', () => {
  const childA = new Field({ value: 'a' });
  const childB = new Field({ value: 'b' });
  const inner = new Group({ childA, childB });
  const outer = new Group({ inner });

  const fires: boolean[] = [];
  outer.registerAction(
    new ValidChangedAction((field, supr, newValue) => {
      fires.push(newValue);
    }),
  );

  childA.errors.push(new ValidationErrorText('a is bad'));
  childA.validate();
  expect(fires).toEqual([false]);

  childB.errors.push(new ValidationErrorText('b is bad too'));
  childB.validate();
  expect(fires).toEqual([false]);
});

it('routes the validity change made by clearValidators through the propagation path', () => {
  const member = new Field({ value: '', validators: [new Validators.Required()] });
  const group = new Group({ member });

  expect(member.valid).toBe(false);
  expect(group.valid).toBe(false);

  const memberFires: boolean[] = [];
  const groupFires: boolean[] = [];
  member.registerAction(
    new ValidChangedAction((field, supr, newValue) => {
      memberFires.push(newValue);
    }),
  );
  group.registerAction(
    new ValidChangedAction((field, supr, newValue) => {
      groupFires.push(newValue);
    }),
  );

  member.clearValidators();

  expect(member.valid).toBe(true);
  expect(group.valid).toBe(true);
  expect(memberFires).toEqual([true]);
  expect(groupFires).toEqual([true]);
});

it('announces nothing when clearValidators leaves the validity unchanged', () => {
  const field = new Field({ value: 'x', validators: [new Validators.Required()] });

  const fires: boolean[] = [];
  field.registerAction(
    new ValidChangedAction((f, supr, newValue) => {
      fires.push(newValue);
    }),
  );

  field.clearValidators();

  expect(field.valid).toBe(true);
  expect(fires).toEqual([]);
});

it('withholds the intermediate verdicts of a transaction and reports the net change', () => {
  const a = new Field({ value: '', validators: [new Validators.Required()] });
  const b = new Field({ value: 'x', validators: [new Validators.Required()] });
  const group = new Group({ a, b });

  expect(group.valid).toBe(false);

  const fires: boolean[] = [];
  group.registerAction(
    new ValidChangedAction((field, supr, newValue) => {
      fires.push(newValue);
    }),
  );

  // a becomes valid and b becomes invalid: without the transaction the intermediate all-valid verdict would be
  // announced, although the two writes together leave the group invalid
  transaction(() => {
    a.value = 'x';
    b.value = '';
  });

  expect(fires).toEqual([]);
  expect(group.valid).toBe(false);

  // only the intermediate verdicts are withheld: a net transition is still announced once
  transaction(() => {
    b.value = 'y';
  });

  expect(fires).toEqual([true]);
  expect(group.valid).toBe(true);
});

it('reports validating as a boolean that starts out false', () => {
  const field = new Field({ value: 'x' });

  expect(field.validating).toBe(false);
  expect(typeof field.validating).toBe('boolean');

  field.beginValidating();
  expect(field.validating).toBe(true);
  field.endValidating();
  expect(field.validating).toBe(false);
  // the counter never goes below zero, so a stray endValidating cannot latch the flag on
  field.endValidating();
  expect(field.validating).toBe(false);
});

describe('Runs in flight below an element', () => {
  it('reports validating for the whole subtree, and stops when the last run settles', () => {
    const a = new Field({ value: 'a' });
    const b = new Field({ value: 'b' });
    const inner = new Group({ a, b });
    const outer = new Group({ inner });

    expect(outer.validating).toBe(false);

    a.beginValidating();
    expect(inner.validating).toBe(true);
    expect(outer.validating).toBe(true);
    expect(b.validating).toBe(false);

    // a second run below the same container leaves the answer where it is, and holds it until it settles too
    b.beginValidating();
    a.endValidating();
    expect(inner.validating).toBe(true);
    expect(outer.validating).toBe(true);

    b.endValidating();
    expect(inner.validating).toBe(false);
    expect(outer.validating).toBe(false);
  });

  it("counts a row's runs for the list and the form above it", () => {
    const list = new List(new Group({ z: new Field({ value: 0 }) }));
    const form = new Group({ list });
    list.push({ z: 1 });
    const cell = list.get(0)!.field('z')!;

    cell.beginValidating();
    expect(list.validating).toBe(true);
    expect(form.validating).toBe(true);

    cell.endValidating();
    expect(list.validating).toBe(false);
    expect(form.validating).toBe(false);
  });

  it('lets a released element take its runs with it', () => {
    const list = new List(new Group({ z: new Field({ value: 0 }) }));
    const form = new Group({ list });
    list.push({ z: 1 });
    const row = list.get(0)!;
    row.field('z')!.beginValidating();

    const removed = list.remove(0)!;

    expect(removed.validating).toBe(true);
    expect(list.validating).toBe(false);
    expect(form.validating).toBe(false);
  });

  it('takes the runs of an element a container takes on, and gives them back on a rollback', () => {
    const field = new Field({ value: 'x' });
    const group = new Group({ a: new Field({ value: 'a' }) });
    field.beginValidating();

    transaction((tx) => {
      group.addField('b', field);
      expect(group.validating).toBe(true);
      tx.rollback();
    });

    expect(group.validating).toBe(false);
    expect(field.validating).toBe(true);
  });

  it('gives back a run that started while the transaction held the element', () => {
    const field = new Field({ value: 'x' });
    const group = new Group({ a: new Field({ value: 'a' }) });

    transaction((tx) => {
      group.addField('b', field);
      // the run starts after the element was taken on, so what the rollback has to hand back is a run the
      // container was never told the start of at the moment it took the element
      field.beginValidating();
      expect(group.validating).toBe(true);
      tx.rollback();
    });

    expect(group.validating).toBe(false);
    expect(field.validating).toBe(true);

    field.endValidating();
    expect(group.validating).toBe(false);
  });

  it('takes back a run that started while a rolled-back transaction held the element released', () => {
    const group = new Group({ a: new Field({ value: 'a' }) });
    const field = group.field('a')!;

    transaction((tx) => {
      group.removeField('a');
      field.beginValidating();
      expect(group.validating).toBe(false);
      tx.rollback();
    });

    // the element is a member again, and the run it started while it was not is one the group now carries
    expect(group.validating).toBe(true);

    field.endValidating();
    expect(group.validating).toBe(false);
  });

  it('answers busy false on an element that executes nothing', () => {
    const field = new Field({ value: 'x' });

    // an asynchronous validation is what validating states; busy states an execution, and a plain field has
    // nothing to execute
    field.beginValidating();
    expect(field.validating).toBe(true);
    expect(field.busy).toBe(false);
    field.endValidating();
    expect(field.busy).toBe(false);
  });

  it('answers busy for an action executing below it', async () => {
    let settle: (value: unknown) => void = () => null;
    const action = new Action({ actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))] });
    const inner = new Group({ action });
    const outer = new Group({ inner });

    expect(outer.busy).toBe(false);

    const running = action.execute();
    expect(inner.busy).toBe(true);
    expect(outer.busy).toBe(true);
    // an execution is not a validation, so validating says nothing about it
    expect(outer.validating).toBe(false);

    settle(null);
    await running;
    expect(inner.busy).toBe(false);
    expect(outer.busy).toBe(false);
  });

  it('keeps a validation below it out of busy', () => {
    const cell = new Field({ value: 1 });
    const list = new List(new Group({ z: new Field({ value: 0 }) }));
    const form = new Group({ cell, list });

    // the two state different things: a validation is what validating answers for, an execution what busy does,
    // and a form that gates on the tree being idle reads both
    cell.beginValidating();
    expect(form.validating).toBe(true);
    expect(form.busy).toBe(false);

    cell.endValidating();
    expect(form.validating).toBe(false);
    expect(form.busy).toBe(false);
  });

  it('re-renders a reader of busy as a run below it starts and settles', async () => {
    let settle: (value: unknown) => void = () => null;
    const action = new Action({ actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))] });
    const group = new Group({ action });
    const seen: boolean[] = [];
    watchEffect(() => seen.push(group.busy));

    const running = action.execute();
    await nextTick();
    settle(null);
    await running;
    await nextTick();

    expect(seen).toEqual([false, true, false]);
  });
});

describe('settled', () => {
  it('resolves at once where nothing is running', async () => {
    const field = new Field({ value: 'x' });
    await expect(field.settled()).resolves.toBeUndefined();
  });

  it('waits for an asynchronous validation below it', async () => {
    const field = new Field({ value: 'x' });
    const group = new Group({ field });
    field.beginValidating();

    let done = false;
    const waiting = group.settled().then(() => {
      done = true;
    });

    await Promise.resolve();
    expect(done).toBe(false);

    field.endValidating();
    await waiting;
    expect(done).toBe(true);
  });

  it('waits for an action executing below it', async () => {
    let settle: (value: unknown) => void = () => null;
    const action = new Action({ actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))] });
    const group = new Group({ action });
    const running = action.execute();

    let done = false;
    const waiting = group.settled().then(() => {
      done = true;
    });

    await Promise.resolve();
    expect(done).toBe(false);

    settle(null);
    await running;
    await waiting;
    expect(done).toBe(true);
  });

  it('waits for both, and only answers once neither is running', async () => {
    let settle: (value: unknown) => void = () => null;
    const action = new Action({ actions: [new ExecuteAction(() => new Promise((resolve) => (settle = resolve)))] });
    const field = new Field({ value: 'x' });
    const group = new Group({ action, field });

    const running = action.execute();
    field.beginValidating();

    let done = false;
    const waiting = group.settled().then(() => {
      done = true;
    });

    settle(null);
    await running;
    await Promise.resolve();
    // the execution is over, the validation is not
    expect(done).toBe(false);

    field.endValidating();
    await waiting;
    expect(done).toBe(true);
  });
});

describe('comparing elements', () => {
  it('answers a structural comparison of two elements with identity', () => {
    const a = new Field({ value: 'x' });
    const b = new Field({ value: 'x' });

    // the same data, and still two elements: what an element holds is unreachable to a structural walk, so the
    // comparison ends at the tag and only the same element answers true
    expect(isEqual(a, b)).toBe(false);
    expect(isEqual(a, a)).toBe(true);
    // the tag sits on the base, so it answers for every class of element
    expect(isEqual(new Group({ a }), new Group({ b }))).toBe(false);
    expect(isEqual(new List(), new List())).toBe(false);
    expect(isEqual(new Action(), new Action())).toBe(false);
  });

  it('leaves the comparison of what two elements hold to answer', () => {
    const left = new Group({ a: new Field({ value: 1 }) });
    const right = new Group({ a: new Field({ value: 1 }) });

    expect(isEqual(left.value, right.value)).toBe(true);
    expect(isEqual(left.fields.a.value, right.fields.a.value)).toBe(true);
    expect(isEqual(left.value, new Group({ a: new Field({ value: 2 }) }).value)).toBe(false);
  });

  it('names its class where something asks what it is', () => {
    const field = new Field({ value: 1 });
    const group = new Group({ a: field });

    expect(Object.prototype.toString.call(field)).toBe('[object Field]');
    expect(Object.prototype.toString.call(group)).toBe('[object Group]');
    expect(Object.prototype.toString.call(new List())).toBe('[object List]');
    expect(Object.prototype.toString.call(new Action())).toBe('[object Action]');
    expect(`${group}`).toBe('[object Group]');

    // the tag is on the prototype and JSON reads own enumerable keys, so serializing an element is unaffected
    expect(() => JSON.stringify(group)).not.toThrow();
    expect(JSON.stringify(group.value)).toBe('{"a":1}');
  });

  it('carries the tag on the prototype, so an element has no property of its own for it', () => {
    const field = new Field({ value: 1 });

    expect(Object.getOwnPropertySymbols(field)).toEqual([]);
    expect(Object.hasOwn(field, Symbol.toStringTag)).toBe(false);
    expect(Object.getOwnPropertyDescriptor(FieldBase.prototype, Symbol.toStringTag)?.get).toBeInstanceOf(Function);
  });
});

describe('writing what an element already holds', () => {
  it('runs nothing for visibility', () => {
    const seen: string[] = [];
    const field = new Field({ value: 1, visibility: DisplayMode.HIDDEN });
    field.registerAction(
      new VisibilityChangingAction((f, supr, ...params) => (seen.push('changing'), supr(f, ...params))),
    );
    field.registerAction(
      new VisibilityChangedAction((f, supr, ...params) => (seen.push('changed'), supr(f, ...params))),
    );

    field.visibility = DisplayMode.HIDDEN;
    expect(seen).toEqual([]);

    field.visibility = DisplayMode.FULL;
    expect(seen).toEqual(['changing', 'changed']);
  });

  it('runs nothing for enabled', () => {
    const seen: string[] = [];
    const field = new Field({ value: 1 });
    field.registerAction(
      new EnabledChangingAction((f, supr, ...params) => (seen.push('changing'), supr(f, ...params))),
    );
    field.registerAction(new EnabledChangedAction((f, supr, ...params) => (seen.push('changed'), supr(f, ...params))));

    field.enabled = true;
    expect(seen).toEqual([]);

    field.enabled = false;
    expect(seen).toEqual(['changing', 'changed']);
  });

  it('leaves a *Changing* handler that would rewrite the value unreached', () => {
    const field = new Field({ value: 1, visibility: DisplayMode.FULL });
    // the handler answers with a mode of its own, and a write of the mode the element already holds never asks it
    field.registerAction(new VisibilityChangingAction(() => DisplayMode.SUPPRESS));

    field.visibility = DisplayMode.FULL;
    expect(field.visibility).toBe(DisplayMode.FULL);

    field.visibility = DisplayMode.HIDDEN;
    expect(field.visibility).toBe(DisplayMode.SUPPRESS);
  });

  it('keeps a no-op write out of the transaction it would otherwise enrol in', () => {
    const field = new Field({ value: 1, visibility: DisplayMode.FULL });

    transaction((tx) => {
      field.visibility = DisplayMode.FULL;
      field.value = 2;
      tx.rollback();
    });

    // the value write is taken back; the visibility write was never a write
    expect(field.value).toBe(1);
    expect(field.visibility).toBe(DisplayMode.FULL);
  });
});
