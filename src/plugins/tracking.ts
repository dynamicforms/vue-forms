import { adopt, enableWarnings, markUntracked, plain, useContext } from './tracking/tracked-value';

import { Action, type Plugin } from '@dynamicforms/vue-forms';

export { TrackedDate, TrackedMap, TrackedSet } from './tracking/tracked-value';

/**
 * Makes a write into the value a field holds a change of the field. Install it with `installPlugin(tracking)`.
 *
 * A `Field` stores a copy of the value it is assigned: a plain object or an array as a proxy, a `Map`, a `Set` or a
 * `Date` as a `TrackedMap`, `TrackedSet` or `TrackedDate`, at every level. A write through `field.value` (a property,
 * an array method, `map.set()`, `date.setFullYear()`) runs as a change of the field: in a transaction, with
 * validation, `ValueChangedAction` and rollback. Every `originalValue`, a container's included, is stored as a deep
 * copy without tracking.
 *
 * An `Action`'s value is stored as it is.
 */
export const tracking: Plugin = {
  setup(context) {
    useContext(context);
  },
  onSetValue(value, element) {
    return element instanceof Action ? value : adopt(value, element);
  },
  onSetOriginalValue(value, element) {
    return element instanceof Action ? value : plain(value);
  },
};

/**
 * Marks `value` to be held as it is: without a copy, without tracking and without the warning a class instance
 * gives. Returns `value`.
 */
export function untracked<T extends object>(value: T): T {
  markUntracked(value);
  return value;
}

/**
 * Turns on or off the development warning for a class instance held without tracking. On by default; a production
 * build has no warning.
 */
export function setTrackingWarnings(enabled: boolean): void {
  enableWarnings(enabled);
}
