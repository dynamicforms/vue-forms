import type { FieldBase } from '../field-base';
import type { Group } from '../group';

/**
 * Resolution of one element against another element's record.
 *
 * An action instance is shared: every row a `List` builds from an item template carries the instances the template
 * carries, and what differs per row is the data. An action that reads a second element - a statement comparing two
 * fields, a validator comparing a password with its confirmation - therefore has to be told which second element it
 * means for the row it is running over, and the structure is what tells it: the element the action was declared
 * against, and the record it is running in, name it between them.
 */

/**
 * The record an element belongs to: the `List` row that holds it, or the top of its container chain where no row
 * does. A container holds a row without a name and a `Group` names every member, so the element whose container
 * gave it no name is where a record begins.
 */
export function scopeOf(element: FieldBase): FieldBase {
  let current = element;
  while (current.fieldName !== undefined && current.parent) current = current.parent;
  return current;
}

/** The names leading from an element's record down to the element itself. */
function pathOf(element: FieldBase): string[] {
  const path: string[] = [];
  let current = element;
  while (current.fieldName !== undefined && current.parent) {
    path.unshift(current.fieldName);
    current = current.parent;
  }
  return path;
}

/**
 * The element `declaration` stands for within `scope`. It is the member `scope` holds at the same position, where
 * that member was declared as `declaration`; `declaration` itself, where it belongs to a record other than
 * `scope`'s and is therefore the one element every record reads - a form field above a list, or a field of another
 * row named on purpose; and `undefined`, where `scope` is a record of the same kind that has yet to be built,
 * which says that the question has to be asked again once it is.
 */
export function resolveInScope(declaration: FieldBase, scope: FieldBase): FieldBase | undefined {
  let resolved: FieldBase | undefined = scope;
  for (const name of pathOf(declaration)) {
    resolved = (resolved as Group).field?.(name) ?? undefined;
    if (!resolved) break;
  }
  if (resolved?.declaration === declaration) return resolved;
  // the record holds no member declared as this element. Either it belongs elsewhere and is read where it stands,
  // or the record is one of the same family and is still being assembled
  return scopeOf(declaration) === scopeOf(scope.declaration) ? undefined : declaration;
}

/**
 * Every element `declaration` stands for when something changes in `scope`. It is the one member of that record
 * where the record holds one; where the element belongs to a record above - a form field the rows of a list read -
 * it is each of its bindings inside `scope`, because a change there speaks for every one of them; and where
 * `scope` reaches no binding at all, it is the element itself, which is the answer for a form that has no records
 * below it.
 * A record still being assembled reaches none of these and answers with nothing, so the assignment that finishes
 * it asks again.
 */
export function bindingsIn(declaration: FieldBase, scope: FieldBase): FieldBase[] {
  const resolved = resolveInScope(declaration, scope);
  if (!resolved) return [];
  if (resolved !== declaration) return [resolved];
  const found = scope.bindingsOf(declaration);
  return found.length > 0 ? found : [declaration];
}

/**
 * The element named `name` in the nearest container above `element` that holds one, and `undefined` where no
 * container does. A row is searched before the form the list sits in, so a rule written against a name reads the
 * row it is running over.
 */
export function resolveByName(name: string, element: FieldBase): FieldBase | undefined {
  let container = element.parent;
  while (container) {
    const member = (container as Group).field?.(name);
    if (member) return member;
    container = container.parent;
  }
  return undefined;
}
