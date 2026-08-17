import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { ValueChangedAction } from './actions/value-changed-action';
import { Field } from './field';
import { FieldBase } from './field-base';
import { Group } from './group';
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

  boundToField(field: FieldBase) {
    this.boundTo = field;
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

class SuppressibleGroup<T extends Record<string, FieldBase>> extends Group<T> {
  /** assigns members with this container's own validation deferred, exactly as a container's value setter does */
  assignDeferred(assign: () => void) {
    this.suppressValidation = true;
    try {
      assign();
    } finally {
      this.suppressValidation = false;
    }
    this.validate();
  }
}

it('defers its own validation while suppressValidation is set and then reports the net change', () => {
  const a = new Field({ value: '', validators: [new Validators.Required()] });
  const b = new Field({ value: 'x', validators: [new Validators.Required()] });
  const group = new SuppressibleGroup({ a, b });

  expect(group.valid).toBe(false);

  const fires: boolean[] = [];
  group.registerAction(
    new ValidChangedAction((field, supr, newValue) => {
      fires.push(newValue);
    }),
  );

  // a becomes valid and b becomes invalid: without the deferral the intermediate all-valid verdict would be
  // announced, although the assignment as a whole leaves the group invalid
  group.assignDeferred(() => {
    a.value = 'x';
    b.value = '';
  });

  expect(fires).toEqual([]);
  expect(group.valid).toBe(false);

  // the deferral only withholds intermediate verdicts: a net transition is still announced once
  group.assignDeferred(() => {
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
