import { type Access, defaultAccess } from './access';
import type { Container } from './container';
import type { FieldBase } from './field-base';
import type { Group } from './group';
import type { ListValue } from './list';
import { ValidationError } from './validators/validation-error';
import { defaultVisibility, type Visibility } from './visibility';

/**
 * The mutable state of one element, held in a separate object, not in the element's own properties.
 *
 * An element accesses it through two views of that object, both in private class fields of `FieldBase`:
 * `this.state` is `reactive(slots)` and `this.raw` is the object itself. A slot read through `state` inside a
 * render effect or a computed subscribes that effect to the slot, and a write to the slot re-runs it. The element's
 * internal bookkeeping goes through `raw`, which neither tracks a read nor triggers on a write. This includes a
 * container's value cache: its getter writes the cache while it runs, and a tracked write there would cost the
 * reading effect one extra evaluation, and one extra render on mount, for a value already built.
 *
 * As private class fields, the two views are not accessible outside `FieldBase`: a private field is absent from
 * `Object.keys`, `JSON.stringify`, `Object.getOwnPropertySymbols` and lodash `getAllKeys` without any per-instance
 * property definition. `JSON.stringify` and lodash `isEqual` both walk a structure over own keys, enumerable
 * symbols included, and the `parent` slot is in the state: if reachable, it would lead either walk back into the
 * element's container.
 *
 * The own properties those walks do reach on an element are `_actions` once something is registered, `_fields` on
 * a `Group`, and `_itemTemplate` on a `List`. All of them lead downwards only.
 */
export interface ElementSlots<T = any> {
  /** the value the element was given at construction; isChanged compares against it */
  originalValue: T;
  /**
   * The value the last ValueChangedAction reported for the element (its value; a container's fullValue); the next
   * transaction compares its net change against it
   */
  announcedValue: T;
  /**
   * What the last ContributionChangedAction reported the element as sending to its container: its value, `null`,
   * or `undefined` for nothing
   */
  announcedContribution: unknown;
  /**
   * What a container's own validators last ran over (what it sends); the next transaction runs them again if that
   * changed. A leaf's validators run at the write and at an access change, and do not use this slot.
   */
  validatedValue: unknown;
  errors: ValidationError[];
  visibility: Visibility;
  access: Access;
  /** counts the writes that changed the value of the element or of any element below it */
  valueVersion: number;
  /** the number of asynchronous validation runs in flight on this element */
  validatingCount: number;
  /** the number of direct children whose `validating` is true; updated when a child starts or stops validating */
  validatingChildren: number;
  /** the container that holds this element, or undefined; takeChild writes it, releaseChild clears it */
  parent: Container | undefined;
  /** the name the containing Group holds this element under; undefined for a List row */
  fieldName: string | undefined;
  /** generation of the validators attached to the element; clearValidators() raises it */
  validationEpoch: number;
  /**
   * The element's extended properties, typed by the element's X parameter. A write replaces the object instead of
   * modifying it, so an effect that read the slot re-runs on the write, and a rollback restores the object the
   * transaction captured.
   */
  extra: object;
  /**
   * The declaration this element was bound from; undefined on an element that was not bound. An action shared by
   * every binding uses it to determine which binding of a second element applies: the slot holds the canonical
   * declaration, so a binding of a binding refers to the original declaration.
   */
  declaration: FieldBase | undefined;

  // the slots below are the element's internal bookkeeping: nothing reads them inside an effect, so they are
  // accessed through raw

  /**
   * The access and the visibility the last commit announced, recorded by the first write of either in a
   * transaction and cleared once the commit announced the net change; undefined while no change is pending.
   */
  announcedAccess: Access | undefined;
  announcedVisibility: Visibility | undefined;
  /** the validity the last commit announced; a change of validity is detected against it */
  valid: boolean;
  /** the number of direct children whose last announced validity was invalid */
  invalidChildren: number;
}

/** the initial extended properties: one frozen object shared by all elements, since a write replaces it */
const noExtra = Object.freeze({});

export function elementSlots<T = any>(): ElementSlots<T> {
  return {
    originalValue: undefined!,
    announcedValue: undefined!,
    announcedContribution: undefined,
    announcedAccess: undefined,
    announcedVisibility: undefined,
    validatedValue: undefined,
    errors: [],
    visibility: defaultVisibility,
    access: defaultAccess,
    valueVersion: 0,
    validatingCount: 0,
    validatingChildren: 0,
    parent: undefined,
    fieldName: undefined,
    validationEpoch: 0,
    declaration: undefined,
    extra: noExtra,
    valid: true,
    invalidChildren: 0,
  };
}

/** what a Field holds beyond the common slots: the value itself, and whether it has been touched */
export interface FieldSlots<T = any> extends ElementSlots<T> {
  value: T;
  touched: boolean;
}

export function fieldSlots<T = any>(): FieldSlots<T> {
  return { ...elementSlots<T>(), value: undefined!, touched: false };
}

/**
 * What a container holds beyond the common slots: the object the value getter last built, and the version of the
 * tree it was built from.
 */
export interface ContainerSlots<T = any> extends ElementSlots<T> {
  cachedValue: T;
  cachedValueVersion: number;
}

export function containerSlots<T = any>(): ContainerSlots<T> {
  return {
    ...elementSlots<T>(),
    announcedValue: null,
    cachedValue: null,
    cachedValueVersion: -1,
  } as ContainerSlots<T>;
}

/** what a Group holds beyond the container slots: the names of its members, in the order they were added */
export interface GroupSlots<T = any> extends ContainerSlots<T> {
  /**
   * The names the group holds its members under. The member map is a plain object outside the reactive state, so
   * a reader inside an effect depends on this array: adding or removing a member re-runs the effect, and a rollback
   * restores the names with the other slots.
   */
  fieldNames: string[];
}

export function groupSlots<T = any>(): GroupSlots<T> {
  return { ...containerSlots<T>(), fieldNames: [] } as GroupSlots<T>;
}

/** what a List holds beyond the container slots: the rows themselves */
export interface ListSlots<R extends FieldBase = Group> extends ContainerSlots<ListValue<R>> {
  rows: R[] | null;
  /**
   * Counts the changes to the set of rows. `items` rebuilds its frozen array only when this changes: a write
   * inside a row changes what the list sends without changing which rows it holds.
   */
  rowsVersion: number;
  /** the frozen array `items` last returned, and the rows version it was built from */
  cachedItems: readonly R[] | null;
  cachedItemsVersion: number;
}

export function listSlots<R extends FieldBase = Group>(): ListSlots<R> {
  return { ...containerSlots<ListValue<R>>(), rows: null, rowsVersion: 0, cachedItems: null, cachedItemsVersion: -1 };
}

/** Key of the `List` method that reorders the rows in place; `view()` calls it, and the package does not export it. */
export const ReorderRows = Symbol('List.reorderRows');

/**
 * Key of the `FieldBase` method that starts counting one asynchronous validation run and returns the function that
 * ends it. A validator calls it; the package does not export it.
 */
export const BeginValidating = Symbol('FieldBase.beginValidating');

/** Key of the `FieldBase` getter for the generation counter of its validators; the package does not export it. */
export const ValidationEpoch = Symbol('FieldBase.validationEpoch');
