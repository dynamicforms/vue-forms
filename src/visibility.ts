/**
 * How a rendering layer shows a form element. It affects presentation only: what an element sends and whether it
 * is validated are determined by `access`, and visibility changes neither.
 *
 * - `'full'`: rendered and shown
 * - `'invisible'`: rendered and keeps its space in the layout, but is not painted (`visibility: hidden`)
 * - `'hidden'`: rendered but not displayed, taking no space (`display: none`)
 * - `'suppress'`: not rendered at all
 */
export type Visibility = 'full' | 'invisible' | 'hidden' | 'suppress';

/** every visibility, from shown to not rendered */
export const visibilityValues: readonly Visibility[] = Object.freeze(['full', 'invisible', 'hidden', 'suppress']);

/** The default visibility of an element. */
export const defaultVisibility: Visibility = 'full';

/** Returns whether `value` is one of the four visibilities. */
export function isVisibility(value: unknown): value is Visibility {
  return (visibilityValues as readonly unknown[]).includes(value);
}
