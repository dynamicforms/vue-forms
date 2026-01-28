import { ValueChangedAction } from './actions/value-changed-action';
import { Field } from './field';
import { Validators } from './validators';

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

  const field = Field.create({ value: 'initial' });
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
  const field = Field.create({ value: '' }).registerAction(new Validators.Required('Required field'));

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
  const field1 = Field.create<string>({ value: 'value1' });
  const field2 = Field.create<string>({ value: 'value2' });

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
