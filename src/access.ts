/**
 * What a form element accepts and what it sends. The four values follow HTML: `'editable'` and `'readonly'` send
 * the element's value the way an `<input>` and an `<input readonly>` are submitted, `'disabled'` sends nothing the
 * way an `<input disabled>` is left out, and `'disabled-null'` sends `null` in the element's place.
 *
 * | access            | accepts input | contributes to its container's `value` |
 * |-------------------|---------------|----------------------------------------|
 * | `'editable'`      | yes           | its value                              |
 * | `'readonly'`      | no            | its value                              |
 * | `'disabled'`      | no            | nothing: the key or row is left out    |
 * | `'disabled-null'` | no            | `null`                                 |
 *
 * An element that contributes no value of its own is not counted in its container's validity. `fullValue` carries
 * every element whatever its access.
 */
export type Access = 'editable' | 'readonly' | 'disabled' | 'disabled-null';

/** every access, in the order of the table above */
export const accessValues: readonly Access[] = Object.freeze(['editable', 'readonly', 'disabled', 'disabled-null']);

/** What an element's access is when nothing sets it. */
export const defaultAccess: Access = 'editable';

/** Answers whether `value` is one of the four accesses. */
export function isAccess(value: unknown): value is Access {
  return (accessValues as readonly unknown[]).includes(value);
}
