import { isEqual as structuralEqual, isEqualWith } from 'lodash-es';

import { FieldBase } from './field-base';

/**
 * Where either side is a `FieldBase`, compares the value it holds: a structural comparison of two elements finds
 * no properties, because their state is in private class fields. Returning `undefined` passes the comparison to
 * lodash's structural comparison, so an element nested at any depth inside a plain object or an array
 * (`list.items`, a `Map`, a hand-built record) is reached too.
 */
function customizer(a: unknown, b: unknown): boolean | undefined {
  const aValue = a instanceof FieldBase ? a.value : a;
  const bValue = b instanceof FieldBase ? b.value : b;
  return aValue === a && bValue === b ? undefined : structuralEqual(aValue, bValue);
}

/**
 * Structural equality that compares a `FieldBase` by the value it holds. `isEqual(fieldA, fieldB)` and
 * `isEqual(list.items, other.items)` compare values as `isEqual(fieldA.value, fieldB.value)` does, without
 * unwrapping each element at the call site.
 *
 * Two `FieldBase` operands are compared by `.value` directly, without the `isEqualWith` customizer dispatch.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a instanceof FieldBase && b instanceof FieldBase) return structuralEqual(a.value, b.value);
  return isEqualWith(a, b, customizer);
}
