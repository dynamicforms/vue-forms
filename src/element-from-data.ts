import { isPlainObject } from 'lodash-es';

import { Field } from './field';
import type { FieldBase } from './field-base';
// group.ts and list.ts import this module; Group and List are used only inside the call, after all are loaded
import { Group } from './group';
import { List } from './list';

/** The element plain data is built into: a `Group` for a plain object, a `List` for an array, a `Field` otherwise. */
export function elementFromData(value: unknown): FieldBase {
  if (isPlainObject(value)) return Group.createFromFormData(value as Record<string, any>);
  if (Array.isArray(value)) return new List(undefined, { value });
  return new Field({ value });
}
