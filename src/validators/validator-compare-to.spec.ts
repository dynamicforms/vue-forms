import { describe, expect, it } from 'vitest';
import { unref } from 'vue';

import { Field } from '../field';
import type { FieldBase } from '../field-base';
import { Group } from '../group';
import { List } from '../list';

import { ValidationErrorRenderContent } from './validation-error';
import CompareTo from './validator-compare-to';

describe('CompareTo Validator', () => {
  it('returns error when comparison fails', () => {
    // Create two fields
    const field1 = new Field({ value: 'abc' });
    const field2 = new Field({ value: 'xyz' });

    // Add validator to check for equality
    field1.registerAction(new CompareTo(field2, (val1, val2) => val1 === val2, 'Fields must match'));

    // Verify that validator correctly detects mismatch
    expect(field1.errors.length).toBe(1);
    expect(field1.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);

    // When values are equal, there should be no error
    field1.value = 'xyz';
    expect(field1.errors.length).toBe(0);

    // When changing the second field's value, it should revalidate
    field2.value = '123';
    expect(field1.errors.length).toBe(1);
  });

  it('validates with custom comparison function', () => {
    const numberField = new Field({ value: 10 });
    const limitField = new Field({ value: 5 });

    // Check if value is greater than limit
    numberField.registerAction(
      new CompareTo(limitField, (num, limit) => num > limit, 'Value must be greater than limit'),
    );

    // Initial value is valid (10 > 5)
    expect(numberField.errors.length).toBe(0);

    // When setting an invalid value
    numberField.value = 3;
    expect(numberField.errors.length).toBe(1);

    // When increasing the limit, it becomes invalid
    limitField.value = 15;
    expect(numberField.errors.length).toBe(1);

    // When setting a valid value
    numberField.value = 20;
    expect(numberField.errors.length).toBe(0);
  });

  it('works in a form with two fields with bidirectional validation', () => {
    // Create a form with two fields
    const form = new Group({
      password: new Field({ value: 'secret' }),
      confirmPassword: new Field({ value: '' }),
    });

    // Add validator to both fields to check for equality
    form.fields.password.registerAction(
      new CompareTo(form.fields.confirmPassword, (pass, confirm) => pass === confirm, 'Passwords must match'),
    );

    form.fields.confirmPassword.registerAction(
      new CompareTo(form.fields.password, (confirm, pass) => confirm === pass, 'Passwords must match'),
    );

    // Check initial state - both fields should have errors
    expect(form.fields.password.errors.length).toBe(1);
    expect(form.fields.confirmPassword.errors.length).toBe(1);

    // When values are equal, there should be no errors
    form.fields.confirmPassword.value = 'secret';
    form.fields.password.validate();
    expect(form.fields.password.errors.length).toBe(0);
    expect(form.fields.confirmPassword.errors.length).toBe(0);

    // When changing one field, both should show errors
    form.fields.password.value = 'newsecret';
    expect(form.fields.password.errors.length).toBe(1);
    expect(form.fields.confirmPassword.errors.length).toBe(1);

    // When both are set to the same value, there should be no errors
    form.fields.confirmPassword.value = 'newsecret';
    expect(form.fields.password.errors.length).toBe(0);
    expect(form.fields.confirmPassword.errors.length).toBe(0);
  });

  it('compares against the field of the row it is validating', () => {
    const template = new Group({
      password: new Field<string>({ value: '' }),
      confirmation: new Field<string>({ value: '' }),
    });
    template.fields.confirmation.registerAction(
      new CompareTo(template.fields.password, (mine: string, other: string) => mine === other, 'Passwords must match'),
    );

    const list = new List(template, {
      value: [
        { password: 'first', confirmation: 'first' },
        { password: 'second', confirmation: 'mistyped' },
      ],
    });

    expect(list.get(0)!.fields.confirmation.errors.length).toBe(0);
    expect(list.get(1)!.fields.confirmation.errors.length).toBe(1);

    // the row that changes is the row that is re-validated, against its own second field
    list.get(1)!.fields.password.value = 'mistyped';
    expect(list.get(1)!.fields.confirmation.errors.length).toBe(0);
    expect(list.get(0)!.fields.confirmation.errors.length).toBe(0);

    list.get(0)!.fields.confirmation.value = 'other';
    expect(list.get(0)!.fields.confirmation.errors.length).toBe(1);
    expect(list.get(1)!.fields.confirmation.errors.length).toBe(0);
  });

  it('compares a date range within each row', () => {
    const template = new Group({
      dateFrom: new Field<number>({ value: 0 }),
      dateTo: new Field<number>({ value: 0 }),
    });
    template.fields.dateTo.registerAction(
      new CompareTo(template.fields.dateFrom, (to: number, from: number) => to >= from, 'dateTo precedes dateFrom'),
    );

    const list = new List(template, {
      value: [
        { dateFrom: 10, dateTo: 20 },
        { dateFrom: 10, dateTo: 5 },
      ],
    });

    expect(list.get(0)!.valid).toBe(true);
    expect(list.get(1)!.valid).toBe(false);

    list.get(1)!.fields.dateFrom.value = 1;
    expect(list.get(1)!.valid).toBe(true);
    expect(list.get(0)!.valid).toBe(true);
  });

  it('names the compared field by the name its container holds it under', () => {
    const template = new Group({
      dateFrom: new Field<number>({ value: 0 }),
      dateTo: new Field<number>({ value: 0 }),
    });
    template.fields.dateTo.registerAction(
      new CompareTo<number>('dateFrom', (to, from) => to >= from, 'dateTo precedes dateFrom'),
    );

    const list = new List(template, {
      value: [
        { dateFrom: 10, dateTo: 20 },
        { dateFrom: 10, dateTo: 5 },
      ],
    });

    expect(list.get(0)!.fields.dateTo.errors.length).toBe(0);
    expect(list.get(1)!.fields.dateTo.errors.length).toBe(1);

    list.get(1)!.fields.dateTo.value = 30;
    expect(list.get(1)!.fields.dateTo.errors.length).toBe(0);
  });

  it('looks a name up in the container above when the field own container does not hold it', () => {
    const section = new Group({ amount: new Field<number>({ value: 50 }) });
    const form = new Group({ limit: new Field<number>({ value: 10 }), section });
    section.fields.amount.registerAction(
      new CompareTo<number>('limit', (amount, limit) => amount <= limit, 'over the limit'),
    );

    expect(section.fields.amount.errors.length).toBe(1);

    form.fields.limit.value = 100;
    expect(section.fields.amount.errors.length).toBe(0);
  });

  it('works out the compared field from a callback', () => {
    const template = new Group({
      dateFrom: new Field<number>({ value: 0 }),
      dateTo: new Field<number>({ value: 0 }),
    });
    template.fields.dateTo.registerAction(
      new CompareTo<number>(
        (field: FieldBase) => (field.parent as Group)?.field('dateFrom'),
        (to, from) => to >= from,
        'dateTo precedes dateFrom',
      ),
    );

    const list = new List(template, {
      value: [
        { dateFrom: 10, dateTo: 20 },
        { dateFrom: 10, dateTo: 5 },
      ],
    });

    expect(list.get(0)!.fields.dateTo.errors.length).toBe(0);
    expect(list.get(1)!.fields.dateTo.errors.length).toBe(1);

    list.get(1)!.fields.dateFrom.value = 5;
    expect(list.get(1)!.fields.dateTo.errors.length).toBe(0);
  });

  it('carries its verdict into a copy holding the values it was copied from', () => {
    const template = new Group({
      dateFrom: new Field<number>({ value: 10 }),
      dateTo: new Field<number>({ value: 5 }),
    });
    template.fields.dateTo.registerAction(
      new CompareTo<number>(template.fields.dateFrom, (to, from) => to >= from, 'dateTo precedes dateFrom'),
    );
    expect(template.fields.dateTo.errors.length).toBe(1);

    // the row holds exactly what the template holds, so no assignment reaches its fields to validate them
    const list = new List(template, { value: [{ dateFrom: 10, dateTo: 5 }] });
    expect(list.get(0)!.fields.dateTo.errors.length).toBe(1);
    expect(list.get(0)!.valid).toBe(false);

    // a copy taken directly, and the row a removal hands back
    expect(template.bind().fields.dateTo.errors.length).toBe(1);
    expect(list.remove(0)!.valid).toBe(false);

    // an item the list builds to fill a gap holds the template's values as well
    const padded = new List(template);
    padded.insert({ dateFrom: 1, dateTo: 2 }, 2);
    expect(padded.get(0)!.fields.dateTo.errors.length).toBe(1);
    expect(padded.get(2)!.fields.dateTo.errors.length).toBe(0);
  });

  it('answers within such a copy for a field named by name and for one worked out by callback', () => {
    const named = new Group({
      dateFrom: new Field<number>({ value: 10 }),
      dateTo: new Field<number>({ value: 5 }),
    });
    named.fields.dateTo.registerAction(
      new CompareTo<number>('dateFrom', (to, from) => to >= from, 'dateTo precedes dateFrom'),
    );
    expect(new List(named, { value: [{ dateFrom: 10, dateTo: 5 }] }).get(0)!.fields.dateTo.errors.length).toBe(1);

    const resolved = new Group({
      dateFrom: new Field<number>({ value: 10 }),
      dateTo: new Field<number>({ value: 5 }),
    });
    resolved.fields.dateTo.registerAction(
      new CompareTo<number>(
        (field: FieldBase) => (field.parent as Group)?.field('dateFrom'),
        (to, from) => to >= from,
        'dateTo precedes dateFrom',
      ),
    );
    expect(new List(resolved, { value: [{ dateFrom: 10, dateTo: 5 }] }).get(0)!.fields.dateTo.errors.length).toBe(1);
  });

  it('is the rule of every row, wherever it was registered', () => {
    const template = new Group({ amount: new Field<number>({ value: 0 }) });
    const form = new Group({
      limit: new Field<number>({ value: 100 }),
      lines: new List(template, { value: [{ amount: 1 }, { amount: 2 }] }),
    });
    const lines = form.fields.lines as List;

    // registered on one row: a row is a binding, and a rule belongs to the declaration it was bound from
    lines
      .get(0)!
      .fields.amount.registerAction(
        new CompareTo<number>('limit', (amount, limit) => amount <= limit, 'over the limit'),
      );

    form.fields.limit.value = 0;

    expect(lines.get(0)!.fields.amount.errors.length).toBe(1);
    expect(lines.get(1)!.fields.amount.errors.length).toBe(1);
    // and each row answers against its own value: the rule is one, the verdicts are per row
    form.fields.limit.value = 1;
    expect(lines.get(0)!.fields.amount.valid).toBe(true);
    expect(lines.get(1)!.fields.amount.valid).toBe(false);
  });

  it('answers to a name that only the form holding the list holds', () => {
    const template = new Group({ amount: new Field<number>({ value: 5 }) });
    template.fields.amount.registerAction(
      new CompareTo<number>('limit', (amount, limit) => amount <= limit, 'over the limit'),
    );
    const form = new Group({
      limit: new Field<number>({ value: 1 }),
      lines: new List(template, { value: [{ amount: 5 }] }),
    });
    const lines = form.fields.lines as List;

    // the name is answered by the form the list stands in, which the row reaches only once it is part of it
    expect(lines.get(0)!.fields.amount.errors.length).toBe(1);

    form.fields.limit.value = 10;
    expect(lines.get(0)!.fields.amount.errors.length).toBe(0);
  });

  it('listens again when it is registered again after clearValidators()', () => {
    const limit = new Field<number>({ value: 10 });
    const validator = new CompareTo<number>(limit, (mine, max) => mine <= max, 'above the limit');
    const field = new Field<number>({ value: 1 });

    field.registerAction(validator);
    field.clearValidators();
    field.registerAction(validator);

    limit.value = 0;

    expect(field.errors.length).toBe(1);
  });

  it('properly formats error message with field references', () => {
    const form = new Group({
      username: new Field({ value: 'user123' }),
      displayName: new Field({ value: 'user123' }),
    });

    // Check that values are different
    const errorMessage = 'Display name must be different from username';
    form.fields.displayName.registerAction(
      new CompareTo(form.fields.username, (display, user) => display !== user, errorMessage),
    );

    // Currently they are equal, so we expect an error
    expect(form.fields.displayName.errors.length).toBe(1);

    // Check error message content
    const errorContent = unref(form.fields.displayName.errors[0]) as ValidationErrorRenderContent;
    expect(errorContent.componentBody).toBe(errorMessage);
  });
});

describe('CompareTo unregistration', () => {
  it('withdraws the error it placed when it is taken off the field', () => {
    const other = new Field({ value: 'xyz' });
    const field = new Field({ value: 'abc' });
    const compare = new CompareTo(other, (mine, theirs) => mine === theirs, 'Fields must match');

    field.registerAction(compare);
    expect(field.errors.length).toBe(1);
    expect(field.valid).toBe(false);

    expect(field.unregisterAction(compare)).toBe(true);
    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);

    // the field no longer carries the rule, so a change of the compared field leaves it alone
    other.value = 'changed';
    expect(field.errors.length).toBe(0);
  });
});

describe('CompareTo Validator error code', () => {
  it('states the compare-to code on the error it produces', () => {
    const other = new Field({ value: 'xyz' });
    const field = new Field({ value: 'abc' });
    field.registerAction(new CompareTo(other, (mine, theirs) => mine === theirs, 'Fields must match'));

    expect(field.errors[0].code).toBe('compare-to');
  });
});
