import type { FieldBase } from './field-base';
import { Group } from './group';
import { List } from './list';

const INDEX = /^(0|[1-9]\d*)$/;

function rowIndex(key: string | number): number | undefined {
  if (typeof key === 'number') return Number.isSafeInteger(key) && key >= 0 ? key : undefined;
  return INDEX.test(key) ? Number(key) : undefined;
}

/**
 * Returns the element at `path` below `root`, or `undefined` if the path does not exist. A string path is split on
 * `.`; `''` and `[]` return `root`. A step below a `Group` is a member name, below a `List` a non-negative integer
 * (a number, or digits without leading zeros). A path that continues below an element that is neither a `Group` nor
 * a `List` does not exist.
 */
export function elementAt(root: FieldBase, path: string | readonly (string | number)[]): FieldBase | undefined {
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
      return undefined;
    }
    if (!next) return undefined;
    element = next;
  }
  return element;
}
