import type FieldActionBase from './actions/field-action-base';
import type DisplayMode from './display-mode';
import type { FieldBase } from './field-base';
import { type ValidationError } from './validators/validation-error';

export interface IFieldConstructorActionsList {
  actions?: FieldActionBase[];
  validators?: FieldActionBase[];
}

/**
 * Parameters accepted by field constructors and by clone overrides.
 *
 * Only writable members are listed. valid, validating, fullValue and isChanged are getter-only, so assigning
 * them throws a TypeError. So are parent and fieldName: a container writes the slots behind them when it takes
 * an element, and nobody else can, which is why the type rejects them.
 */
export type IFieldConstructorParams<T = any> = {
  value: T;
  originalValue: T;
  enabled: boolean;
  visibility: DisplayMode;
  touched: boolean;
  errors: ValidationError[];
} & IFieldConstructorActionsList;

/**
 * What an element's constructor and its clone() accept: the parameters the element answers for itself, together
 * with the extended properties its X parameter declares.
 *
 * X is left out of inference, so an element built without a type argument carries no extended properties and a
 * parameter object naming one is rejected as an excess property. A caller that wants them states them:
 * `new Field<string, { label: string }>({ value: 'a', label: 'Name' })`.
 *
 * The two halves are made partial separately. `Partial<A & X>` is a mapped type over an intersection, which is
 * what T is inferred through, and inference through it answers with one constituent of a union rather than the
 * union: `new Field({ value: someStringOrNumber })` would be a Field<string>.
 */
export type IFieldParams<T = any, X extends object = {}> = Partial<IFieldConstructorParams<T>> & Partial<NoInfer<X>>;

export class AbortEventHandlingException extends Error {}

export type FieldActionExecute<T = any> = (field: FieldBase<T>, ...params: any[]) => any;
