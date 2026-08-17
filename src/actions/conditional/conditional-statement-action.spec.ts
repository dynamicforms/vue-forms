import { vi } from 'vitest';

import DisplayMode from '../../display-mode';
import { Field } from '../../field';
import { Group } from '../../group';
import { List } from '../../list';

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

  it('does not execute the callback when a falsy source value changes to false', () => {
    const source = new Field<any>({ value: 0 });
    const statement = new Statement(source, Operator.AND, true);
    const callbackFn = vi.fn();

    const field = new Field();
    field.registerAction(new ConditionalStatementAction(statement, callbackFn));

    // The statement is false for value 0, and the callback reports it as a boolean
    expect(callbackFn).toHaveBeenCalledTimes(1);
    expect(callbackFn).toHaveBeenLastCalledWith(expect.anything(), false, undefined);
    expect(typeof callbackFn.mock.calls[0][1]).toBe('boolean');

    // 0 and false are the same logical value, so this is not a transition
    source.value = false;
    expect(callbackFn).toHaveBeenCalledTimes(1);

    // ... while a real transition still reaches the callback
    source.value = 'x';
    expect(callbackFn).toHaveBeenCalledTimes(2);
    expect(callbackFn).toHaveBeenLastCalledWith(expect.anything(), true, false);
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

describe('Conditional actions over the rows of a List', () => {
  const itemTemplate = () => {
    const template = new Group({
      kind: new Field<string>({ value: 'standard' }),
      detail: new Field<string>({ value: '' }),
    });
    template.fields.detail.registerAction(
      new ConditionalVisibilityAction(new Statement(template.fields.kind, Operator.EQUALS, 'other')),
    );
    return template;
  };

  it('answers for the row the change happened in and for no other', () => {
    const list = new List(itemTemplate(), {
      value: [
        { kind: 'standard', detail: '' },
        { kind: 'standard', detail: '' },
      ],
    });

    expect(list.get(0)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);
    expect(list.get(1)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);

    list.get(0)!.fields.kind.value = 'other';

    expect(list.get(0)!.fields.detail.visibility).toBe(DisplayMode.FULL);
    expect(list.get(1)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);
  });

  it('lets two rows hold opposite results at once', () => {
    const list = new List(itemTemplate(), {
      value: [
        { kind: 'other', detail: 'first' },
        { kind: 'standard', detail: '' },
      ],
    });

    expect(list.get(0)!.fields.detail.visibility).toBe(DisplayMode.FULL);
    expect(list.get(1)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);

    // the two rows swap: each one answers over its own values, and neither carries the other's result
    list.get(0)!.fields.kind.value = 'standard';
    list.get(1)!.fields.kind.value = 'other';

    expect(list.get(0)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);
    expect(list.get(1)!.fields.detail.visibility).toBe(DisplayMode.FULL);
  });

  it('reaches every row from a field the whole form holds', () => {
    const showDetails = new Field<boolean>({ value: false });
    const template = new Group({ detail: new Field<string>({ value: '' }) });
    template.fields.detail.registerAction(
      new ConditionalVisibilityAction(new Statement(showDetails, Operator.EQUALS, true)),
    );
    const form = new Group({
      showDetails,
      lines: new List(template, { value: [{ detail: 'a' }, { detail: 'b' }] }),
    });
    const lines = form.fields.lines as List;

    expect(lines.get(0)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);

    form.fields.showDetails.value = true;

    expect(lines.get(0)!.fields.detail.visibility).toBe(DisplayMode.FULL);
    expect(lines.get(1)!.fields.detail.visibility).toBe(DisplayMode.FULL);
  });

  it('drives the row it was registered on and no other', () => {
    const template = new Group({ detail: new Field<string>({ value: '' }) });
    const form = new Group({
      showDetails: new Field<boolean>({ value: false }),
      lines: new List(template, { value: [{ detail: 'a' }, { detail: 'b' }] }),
    });
    const lines = form.fields.lines as List;

    lines
      .get(0)!
      .fields.detail.registerAction(
        new ConditionalVisibilityAction(new Statement(form.fields.showDetails, Operator.EQUALS, true)),
      );

    expect(lines.get(0)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);
    expect(lines.get(1)!.fields.detail.visibility).toBe(DisplayMode.FULL);

    form.fields.showDetails.value = true;
    form.fields.showDetails.value = false;

    expect(lines.get(0)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);
    expect(lines.get(1)!.fields.detail.visibility).toBe(DisplayMode.FULL);
  });

  it('evaluates a row added later over the record it joins', () => {
    const showDetails = new Field<boolean>({ value: false });
    const template = new Group({ detail: new Field<string>({ value: '' }) });
    template.fields.detail.registerAction(
      new ConditionalVisibilityAction(new Statement(showDetails, Operator.EQUALS, true)),
    );
    const lines = new List(template, { value: [{ detail: 'a' }] });
    const form = new Group({ showDetails, lines });

    form.fields.showDetails.value = true;
    expect(lines.get(0)!.fields.detail.visibility).toBe(DisplayMode.FULL);

    // the row holds what the template holds, so no assignment reaches it: the statement is what decides it
    lines.push({ detail: '' });

    expect(lines.get(1)!.fields.detail.visibility).toBe(DisplayMode.FULL);
  });

  it('holds one handler on the field it reads however many rows the list has', () => {
    const list = new List(itemTemplate());
    for (let row = 0; row < 5000; row += 1) list.push({ kind: 'standard', detail: '' });

    // a handler registered per row would nest 5000 calls into the chain the write runs, which overflows the stack
    list.get(4999)!.fields.kind.value = 'other';

    expect(list.get(4999)!.fields.detail.visibility).toBe(DisplayMode.FULL);
    expect(list.get(0)!.fields.detail.visibility).toBe(DisplayMode.SUPPRESS);
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
