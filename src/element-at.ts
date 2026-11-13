import type { FieldBase } from './field-base';
import { Group } from './group';
import { List } from './list';

/** Options of {@link elementAt}. */
export interface ElementAtOptions {
  /**
   * Where the path goes on below an element that is neither a `Group` nor a `List`, return that element instead of
   * `undefined`.
   */
  nearest?: boolean;
}

const INDEX = /^(0|[1-9]\d*)$/;

function rowIndex(key: string | number): number | undefined {
  if (typeof key === 'number') return Number.isSafeInteger(key) && key >= 0 ? key : undefined;
  return INDEX.test(key) ? Number(key) : undefined;
}

/**
 * Returns the element `path` names below `root`: a `Group` member by its name, a `List` row by its index. A string
 * path is split on `.`; an empty path (`''` or `[]`) names `root`. A `List` step is a non-negative integer, as a
 * number or as decimal digits without leading zeros.
 *
 * Returns `undefined` where a step names no member or row, or where the path goes on below an element that is
 * neither a `Group` nor a `List`; with `nearest`, the latter returns that element. Inside an effect, the call tracks
 * the members and rows it reads. The result is typed `FieldBase | undefined`: narrow it with `instanceof` or a cast.
 */
export function elementAt(
  root: FieldBase,
  path: string | readonly (string | number)[],
  options?: ElementAtOptions,
): FieldBase | undefined {
  const keys = typeof path === 'string' ? (path === '' ? [] : path.split('.')) : path;
  let element: FieldBase = root;
  for (const key of keys) {
    let next: FieldBase | null | undefined;
    if (element instanceof Group) {
      // `fields` is a tracked read of the set of members; `field()` is not
      next = element.fields[String(key)];
    } else if (element instanceof List) {
      const index = rowIndex(key);
      next = index === undefined ? undefined : element.get(index);
    } else {
      return options?.nearest ? element : undefined;
    }
    if (!next) return undefined;
    element = next;
  }
  return element;
}
