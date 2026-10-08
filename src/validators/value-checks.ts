import { isArray, isObject, isString } from 'lodash-es';

/** The length of a value as the length and the `Required` validators measure it. */
export function toLength(a: any): number {
  if (a == null) return 0;
  if (isArray(a)) return a.length;
  if (isString(a)) return a.length;
  if (isObject(a) && Object.getPrototypeOf(a) === Object.prototype) return Object.keys(a).length;
  return String(a).length;
}

/**
 * Whether `value` is empty: `null`, `undefined`, an empty string, an empty array or an empty plain object. Every
 * built-in validator except `Required` passes an empty value, so a field that may stay empty carries only the
 * other validators, and a field that may not adds `Required`.
 */
export function isEmptyValue(value: unknown): boolean {
  return toLength(value) === 0 && (value == null || isString(value) || isArray(value) || isObject(value));
}

/**
 * Compares `value` with `bound`: negative where `value` is smaller, zero where equal, positive where larger, and
 * `undefined` where the two cannot be compared. Numbers compare with numbers, bigints with bigints, strings with
 * strings (by code unit) and dates with dates (by time). `NaN` and an invalid date compare with nothing.
 */
export function compareValues(value: unknown, bound: unknown): number | undefined {
  if (value instanceof Date && bound instanceof Date) {
    const difference = value.getTime() - bound.getTime();
    return Number.isNaN(difference) ? undefined : difference;
  }
  if (typeof value === 'number' && typeof bound === 'number') {
    return Number.isNaN(value) || Number.isNaN(bound) ? undefined : value - bound;
  }
  if (
    (typeof value === 'string' && typeof bound === 'string') ||
    (typeof value === 'bigint' && typeof bound === 'bigint')
  ) {
    if (value < bound) return -1;
    return value > bound ? 1 : 0;
  }
  return undefined;
}
