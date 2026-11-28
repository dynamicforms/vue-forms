import type { FieldBase } from './field-base';
import type { Group } from './group';

/**
 * Resolution of one element against another element's record.
 *
 * An action instance is shared: every row a `List` builds from an item template has the same action instances as
 * the item template, and only the data differs per row. An action that reads a second element (a statement
 * comparing two fields, a validator comparing a password with its confirmation) must find the second element that
 * belongs to the row it runs over. The structure determines it: the element the action was declared against and the
 * record it runs in identify the second element together.
 */

/**
 * Returns the record an element belongs to and the names leading from that record down to the element. A List holds
 * a row without a name and a `Group` names every member, so a record begins at the first element without a
 * `fieldName`; an element with no such element above it belongs to the top of its container chain.
 */
function recordPath(element: FieldBase): { record: FieldBase; path: string[] } {
  const path: string[] = [];
  let current = element;
  while (current.fieldName !== undefined && current.parent) {
    path.push(current.fieldName);
    current = current.parent;
  }
  return { record: current, path: path.reverse() };
}

/** Returns the record an element belongs to: the `List` row that holds it, or the top of its container chain. */
export function scopeOf(element: FieldBase): FieldBase {
  return recordPath(element).record;
}

/**
 * Returns the member of `record` whose declaration is `declaration`, or `undefined` if the record holds none. It is
 * located by `path`, the names that lead from the declaration's own record to the declaration.
 */
function memberOf(record: FieldBase, declaration: FieldBase, path: readonly string[]): FieldBase | undefined {
  let resolved: FieldBase | undefined = record;
  for (const name of path) {
    resolved = (resolved as Group).field?.(name) ?? undefined;
    if (!resolved) return undefined;
  }
  return resolved?.declaration === declaration ? resolved : undefined;
}

/**
 * Returns the element that corresponds to `declaration` within `scope`:
 * - the member `scope` holds at the same position, if that member's declaration is `declaration`;
 * - `declaration` itself, if it belongs to a record other than `scope`'s and is therefore the one element every
 *   record reads (a form field above a list, or a field of another row referenced explicitly);
 * - `undefined`, if `scope` is a record of the same kind that is not built yet; the caller resolves again once it
 *   is.
 */
export function resolveInScope(declaration: FieldBase, scope: FieldBase): FieldBase | undefined {
  const { record: declarationRecord, path } = recordPath(declaration);
  const withinRecord = memberOf(scope, declaration, path);
  if (withinRecord) return withinRecord;

  // the record holds no member with this declaration, so it belongs to an enclosing record. A list nested in a row
  // makes that record one per row (an order's total, read by the lines of that order), so each enclosing container
  // is searched before the element is treated as one that every record reads
  let enclosing = scope.parent;
  while (enclosing) {
    const bound = memberOf(scopeOf(enclosing), declaration, path);
    if (bound) return bound;
    enclosing = enclosing.parent;
  }

  // no enclosing container holds a binding of it either. Either it is the one element every record reads (a form
  // field above a list), or the record has the same declaration and is still being assembled
  return declarationRecord === scopeOf(scope.declaration) ? undefined : declaration;
}

/**
 * Returns every element that corresponds to `declaration` when something changes in `scope`:
 * - the one member of that record, if the record holds one;
 * - if the element belongs to a record above (a form field the rows of a list read), each of its bindings inside
 *   `scope`, because a change there applies to all of them;
 * - if `scope` contains no binding, the element itself, which is the case for a form without records below it.
 * For a record still being assembled it returns an empty array, and the assignment that completes the record
 * resolves again.
 */
export function bindingsIn(declaration: FieldBase, scope: FieldBase): FieldBase[] {
  const resolved = resolveInScope(declaration, scope);
  if (!resolved) return [];
  if (resolved !== declaration) return [resolved];
  const found = scope.bindingsOf(declaration);
  return found.length > 0 ? found : [declaration];
}

/**
 * Returns the element named `name` in the nearest container above `element` that holds one, or `undefined` if no
 * container does. A row is searched before the form containing the list, so a rule that refers to a name reads
 * the row it runs over.
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
