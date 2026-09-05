import { isEqual as structuralEqual, isEqualWith } from 'lodash-es';

import { FieldBase } from './field-base';

/**
 * Compares `a` against `b`, wherever either side is a `FieldBase`, by comparing what it holds rather than the
 * element itself: a structural comparison of two elements reaches nothing, their state being in private class
 * fields. `undefined` defers to lodash's own structural comparison, which is what lets this reach an element
 * nested inside a plain object or an array — `list.items`, a `Map`, a hand-built record — at any depth.
 */
function customizer(a: unknown, b: unknown): boolean | undefined {
  const aValue = a instanceof FieldBase ? a.value : a;
  const bValue = b instanceof FieldBase ? b.value : b;
  return aValue === a && bValue === b ? undefined : structuralEqual(aValue, bValue);
}

/**
 * Structural equality that treats a `FieldBase` as what it holds. `isEqual(fieldA, fieldB)` and
 * `isEqual(list.items, other.items)` compare values the way `isEqual(fieldA.value, fieldB.value)` already does,
 * without a call site having to unwrap every element by hand.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  return isEqualWith(a, b, customizer);
}
