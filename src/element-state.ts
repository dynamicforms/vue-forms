import DisplayMode from './display-mode';
import type { FieldBase } from './field-base';
import type { GenericFieldsInterface, Group } from './group';
import type { ListValue } from './list';
import { ValidationError } from './validators/validation-error';

/**
 * The mutable state of one element, held in an object of its own beside the element rather than in the element's
 * own properties.
 *
 * An element reaches it through two views of that one object, both in private class fields of `FieldBase`:
 * `this.state` is `reactive(slots)` and `this.raw` is the object itself. A slot read through `state` inside a
 * render effect or a computed subscribes that effect to the slot, and a write to the slot re-runs it. The
 * bookkeeping an element does for itself goes through `raw`, which neither records a read nor announces a write.
 * The value cache of a container goes through `raw` in particular: its getter writes the cache while it runs, and
 * a tracked write there costs the reading effect one extra evaluation, and one extra render on mount, for a value
 * it has already built.
 *
 * Being private class fields is what puts the two views out of reach of everything outside `FieldBase`: a private
 * field is absent from `Object.keys`, `JSON.stringify`, `Object.getOwnPropertySymbols` and lodash `getAllKeys` by
 * construction, and needs no per-instance property definition to be. Both `JSON.stringify` and lodash `isEqual`
 * walk their way down a structure over own keys, enumerable symbols included, and the `parent` slot is in the
 * state: reachable, it would take either walker back into the container the element came from.
 *
 * What they do reach on an element is `_actions` once something is registered, `_fields` on a `Group` and
 * `_itemTemplate` on a `List`. All three lead downwards only.
 */
export interface ElementSlots<T = any> {
  /** the value the element was given at construction; isChanged compares against it */
  originalValue: T;
  errors: ValidationError[];
  visibility: DisplayMode;
  enabled: boolean;
  /** counts the writes that changed the value of the element or of anything below it */
  valueVersion: number;
  /** how many asynchronous validation runs are in flight on this element */
  validatingCount: number;
  /** the container that holds this element, absent while none does; takeChild writes it, releaseChild clears it */
  parent: FieldBase | undefined;
  /** the name the containing Group holds this element under; a List row carries none */
  fieldName: string | undefined;
  /** generation of the validators attached to the element; clearValidators() raises it */
  validationEpoch: number;

  // the slots below are the element's own bookkeeping - nothing reads them inside an effect, and they are
  // therefore reached through raw

  /** the verdict the last validate() reached, which is what a change of validity is measured against */
  valid: boolean;
  /** number of direct children whose last validate() ended on an invalid verdict */
  invalidChildren: number;
  suppressValidation: boolean;
  suppressParentValidityClimb: boolean;
  parentValidityClimbPending: boolean;
}

export function elementSlots<T = any>(): ElementSlots<T> {
  return {
    originalValue: undefined!,
    errors: [],
    visibility: DisplayMode.FULL,
    enabled: true,
    valueVersion: 0,
    validatingCount: 0,
    parent: undefined,
    fieldName: undefined,
    validationEpoch: 0,
    valid: true,
    invalidChildren: 0,
    suppressValidation: false,
    suppressParentValidityClimb: false,
    parentValidityClimbPending: false,
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
 * What a container holds beyond the common slots. `announcedValue` is the value that the next ValueChangedAction
 * will report as the one it replaces, and the cache pair is the object the value getter last built together with
 * the version of the tree it was built from.
 */
export interface ContainerSlots<T = any> extends ElementSlots<T> {
  announcedValue: T;
  cachedValue: T;
  cachedValueVersion: number;
  suppressNotifyValueChanged: boolean;
}

export function containerSlots<T = any>(): ContainerSlots<T> {
  return {
    ...elementSlots<T>(),
    announcedValue: null,
    cachedValue: null,
    cachedValueVersion: -1,
    suppressNotifyValueChanged: false,
  } as ContainerSlots<T>;
}

/** what a List holds beyond the container slots: the rows themselves */
export interface ListSlots<
  T extends GenericFieldsInterface = GenericFieldsInterface,
> extends ContainerSlots<ListValue> {
  rows: Group<T>[] | null;
}

export function listSlots<T extends GenericFieldsInterface = GenericFieldsInterface>(): ListSlots<T> {
  return { ...containerSlots<ListValue>(), rows: null };
}
