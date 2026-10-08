/**
 * What a form element accepts and what it sends. The four values follow HTML: `'editable'` and `'readonly'` send
 * the element's value, as an `<input>` and an `<input readonly>` are submitted, `'disabled'` sends nothing, as an
 * `<input disabled>` is omitted, and `'disabled-null'` sends `null` in place of the element's value.
 *
 * | access            | accepts input | sends to its container's `value`       |
 * |-------------------|---------------|----------------------------------------|
 * | `'editable'`      | yes           | its value                              |
 * | `'readonly'`      | no            | its value                              |
 * | `'disabled'`      | no            | nothing: the key or row is left out    |
 * | `'disabled-null'` | no            | `null`                                 |
 *
 * An element that sends nothing is not counted in its container's validity. `fullValue` contains every element
 * whatever its access.
 */
export type Access = 'editable' | 'readonly' | 'disabled' | 'disabled-null';

/** every access, in the order of the table above */
export const accessValues: readonly Access[] = Object.freeze(['editable', 'readonly', 'disabled', 'disabled-null']);

/** The default access of an element. */
export const defaultAccess: Access = 'editable';

/** Returns whether `value` is one of the four accesses. */
export function isAccess(value: unknown): value is Access {
  return (accessValues as readonly unknown[]).includes(value);
}
