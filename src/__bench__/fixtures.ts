import { ConditionalVisibilityAction } from '../actions/conditional/conditional-statement-action';
import Operator from '../actions/conditional/operator';
import { Statement } from '../actions/conditional/statement';
import { ValueChangedAction } from '../actions/value-changed-action';
import { Field } from '../field';
import { Group } from '../group';
import { List } from '../list';
import Required from '../validators/validator-required';

/** number of fields one benchmark row carries */
export const FIELD_COUNT = 8;

/** number of rows the list scenarios work on */
export const ROW_COUNT = 1000;

/** the row index the single-field write and the removal address */
export const TARGET_ROW = 500;

/** the field the single-field write addresses; it carries no action of its own */
export const TARGET_FIELD = 'f3';

export const fieldNames: string[] = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`);

/**
 * plain: 8 fields, one Required each, one ValueChangedAction on f0.
 * conditional: the same plus a ConditionalVisibilityAction on f1 driven by f0, so a write to one field of a row
 * runs a cross-field action.
 */
export type FixtureVariant = 'plain' | 'conditional';

export const variants: FixtureVariant[] = ['plain', 'conditional'];

export type RowValue = Record<string, string>;

export function createItemTemplate(variant: FixtureVariant): Group {
  const fields: Record<string, Field> = {};
  fieldNames.forEach((name) => {
    fields[name] = new Field({ value: '', validators: [new Required()] });
  });
  fields.f0.registerAction(new ValueChangedAction(() => undefined));
  if (variant === 'conditional') {
    fields.f1.registerAction(new ConditionalVisibilityAction(new Statement(fields.f0, Operator.NOT_EQUALS, '')));
  }
  return new Group(fields);
}

/** the plain data a list is filled from: every field carries a non-empty value, so Required passes on every row */
export function createRows(count: number = ROW_COUNT, tag: string = 'a'): RowValue[] {
  return Array.from({ length: count }, (_, row) => {
    const value: RowValue = {};
    fieldNames.forEach((name, col) => {
      value[name] = `${tag}-${row}-${col}`;
    });
    return value;
  });
}

export function createList(variant: FixtureVariant, count: number = ROW_COUNT): List {
  return new List(createItemTemplate(variant), { value: createRows(count) });
}
