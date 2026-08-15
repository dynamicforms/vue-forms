import { vi } from 'vitest';

import DisplayMode from '../../display-mode';
import { Field } from '../../field';
import { Group } from '../../group';

import {
  ConditionalStatementAction,
  ConditionalVisibilityAction,
  ConditionalEnabledAction,
  ConditionalValueAction,
} from './conditional-statement-action';
import Operator from './operator';
import { Statement } from './statement';

describe('ConditionalStatementAction', () => {
  it('executes callback when statement result changes', () => {
    // Setup
    const field = new Field({ value: 'John' });
    const statement = new Statement(field, Operator.EQUALS, 'John');
    const callbackFn = vi.fn();
    field.registerAction(new ConditionalStatementAction(statement, callbackFn));

    expect(callbackFn).toHaveBeenCalledTimes(1);
    expect(callbackFn).toHaveBeenLastCalledWith(expect.anything(), true, undefined);

    // Trigger action by changing field value
    field.value = 'test';

    // Should be called on first evaluation
    expect(callbackFn).toHaveBeenCalledTimes(2);
    expect(callbackFn).toHaveBeenLastCalledWith(expect.anything(), false, true);

    // Trigger action again
    field.value = 'John';

    // Should be called again because statement value changed
    expect(callbackFn).toHaveBeenCalledTimes(3);
    expect(callbackFn).toHaveBeenLastCalledWith(expect.anything(), true, false);

    // Reset mock
    callbackFn.mockReset();

    // Trigger action again without changing statement value
    field.value = 'John';

    // Should not be called because statement value didn't change
    expect(callbackFn).not.toHaveBeenCalled();
  });

  it('registers with correct class identifier', () => {
    const statement = new Statement(true, Operator.EQUALS, true);
    const action = new ConditionalStatementAction(statement, vi.fn());

    expect(typeof action.classIdentifier).toBe('symbol');
    expect(action.classIdentifier.toString()).toContain('ConditionalStatementAction');
  });
});

describe('ConditionalVisibilityAction', () => {
  it('sets field visibility based on statement result', () => {
    // Setup
    const nameField = new Field({ value: 'John' });
    const statement = new Statement(nameField, Operator.EQUALS, 'John');

    const field = new Field();
    const action = new ConditionalVisibilityAction(statement);
    field.registerAction(action);

    // Initial visibility should be FULL (since statement is true)
    field.value = 'test';
    expect(field.visibility).toBe(DisplayMode.FULL);

    // Change statement to evaluate to false
    nameField.value = 'Jane';

    // Trigger visibility update
    field.value = 'another test';

    // Visibility should now be SUPPRESS
    expect(field.visibility).toBe(DisplayMode.SUPPRESS);
  });
});

describe('ConditionalEnabledAction', () => {
  it('sets field enabled state based on statement result', () => {
    // Setup
    const ageField = new Field({ value: 25 });
    const statement = new Statement(ageField, Operator.GT, 18);

    const field = new Field();
    const action = new ConditionalEnabledAction(statement);
    field.registerAction(action);

    // Initial enabled should be true (since statement is true)
    field.value = 'test';
    expect(field.enabled).toBe(true);

    // Change statement to evaluate to false
    ageField.value = 16;

    // Trigger enabled update
    field.value = 'another test';

    // Enabled should now be false
    expect(field.enabled).toBe(false);
  });
});

describe('ConditionalValueAction', () => {
  it('sets field value when statement evaluates to true', () => {
    // Setup
    const isAdminField = new Field({ value: false });
    const statement = new Statement(isAdminField, Operator.EQUALS, true);

    const field = new Field({ value: 'default' });
    const action = new ConditionalValueAction(statement, 'admin access');
    field.registerAction(action);

    // Initial value should remain default (since statement is false)
    field.value = 'trigger update';
    expect(field.value).toBe('trigger update');

    // Change statement to evaluate to true
    isAdminField.value = true;

    // Value should be set to the trueValue
    expect(field.value).toBe('admin access');
  });

  it('does not change value when statement evaluates to false', () => {
    // Setup
    const isActiveField = new Field({ value: true });
    const statement = new Statement(isActiveField, Operator.EQUALS, false);

    const field = new Field({ value: 'initial' });
    const action = new ConditionalValueAction(statement, 'changed');
    field.registerAction(action);

    // Initial value should remain (since statement is false)
    field.value = 'test value';

    // Value should not be changed
    expect(field.value).toBe('test value');
  });
});

describe('Complex Conditional Actions', () => {
  it('integrates with form structure', () => {
    // Create a form with conditional logic
    const form = new Group({
      age: new Field({ value: 25 }),
      isStudent: new Field({ value: false }),
      acceptTerms: new Field({ value: false }),

      // Fields that will be controlled conditionally
      studentDiscount: new Field({ value: 0 }),
      submitButton: new Field({ enabled: false }),
    });

    // Student discount is shown only if age < 30 AND isStudent = true
    const showDiscountStatement = new Statement(
      new Statement(form.fields.age, Operator.LT, 30),
      Operator.AND,
      new Statement(form.fields.isStudent, Operator.EQUALS, true),
    );

    // Submit button is enabled if terms are accepted
    const enableSubmitStatement = new Statement(form.fields.acceptTerms, Operator.EQUALS, true);

    // Apply conditional actions
    form.fields.studentDiscount.registerAction(new ConditionalVisibilityAction(showDiscountStatement));
    form.fields.submitButton.registerAction(new ConditionalEnabledAction(enableSubmitStatement));

    // Trigger initial evaluation
    // form.fields.age.value = 24;

    // Initially: age=25, isStudent=false, terms=false
    // So discount should be hidden and submit disabled
    expect(form.fields.studentDiscount.visibility).toBe(DisplayMode.SUPPRESS);
    expect(form.fields.submitButton.enabled).toBe(false);

    // Update to make student discount visible
    form.fields.isStudent.value = true;
    expect(form.fields.studentDiscount.visibility).toBe(DisplayMode.FULL);

    // Accept terms to enable submit button
    form.fields.acceptTerms.value = true;
    expect(form.fields.submitButton.enabled).toBe(true);

    // Change age to hide discount again
    form.fields.age.value = 35;
    expect(form.fields.studentDiscount.visibility).toBe(DisplayMode.SUPPRESS);
  });
});
