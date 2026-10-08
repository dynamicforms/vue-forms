import type { Access } from './access';
import type FieldActionBase from './actions/field-action-base';
import type { FieldBase } from './field-base';
import { type ValidationError } from './validators/validation-error';
import type { Visibility } from './visibility';

export interface IFieldConstructorActionsList {
  actions?: FieldActionBase[];
  validators?: FieldActionBase[];
}

/**
 * Parameters accepted by field constructors and by bind overrides.
 *
 * Only writable members are listed. valid, validating, busy, pending, fullValue, isChanged, enabled and
 * effectiveEnabled are getter-only, so assigning them throws a TypeError. So are parent and fieldName: only a
 * container writes the slots behind them, when it takes an element, so the type rejects them.
 */
export type IFieldConstructorParams<T = any> = {
  value: T;
  originalValue: T;
  access: Access;
  visibility: Visibility;
  touched: boolean;
  errors: ValidationError[];
} & IFieldConstructorActionsList;

/**
 * The default type of an element's extended properties. It is declared empty, to be augmented: the rendering
 * layer declares the properties it renders elements with, and every element in the application then has those
 * properties without a type argument at any construction site.
 *
 * ```ts
 * declare module '@dynamicforms/vue-forms' {
 *   interface Extras {
 *     label?: string;
 *     hint?: string;
 *     cssClass?: string;
 *   }
 * }
 * ```
 *
 * There is one interface per application, so two packages that declare a property of the same name must give it
 * the same type; declaration merging rejects a second declaration with a different type.
 *
 * An explicit X type argument replaces this interface, so an element with both is `Field<string, Extras & Local>`.
 */
export interface Extras {}

/**
 * What an element's constructor accepts: the element's own parameters and the extended properties its X parameter
 * declares.
 *
 * X is excluded from inference, so an element has the properties X declares (`Extras` if no type argument is
 * given), and a parameter object with any other key is rejected as an excess property.
 *
 * The two parts are made partial separately. With `Partial<A & X>`, T would be inferred through a mapped type over
 * an intersection, which infers one member of a union instead of the union: `new Field({ value:
 * someStringOrNumber })` would be a Field<string>.
 */
export type IFieldParams<T = any, X extends object = Extras> = Partial<IFieldConstructorParams<T>> &
  Partial<NoInfer<X>>;

/**
 * What bind() accepts in addition to the data: the three members a binding otherwise copies from the element it
 * is bound from, and the extended properties. `validators` and `actions` are omitted because a binding uses the
 * declaration's, and `touched` and `errors` because the binding sets them itself as it validates.
 */
export type IBindParams<T = any, X extends object = Extras> = Partial<
  Pick<IFieldConstructorParams<T>, 'originalValue' | 'access' | 'visibility'>
> &
  Partial<NoInfer<X>>;

/**
 * Thrown from a handler to end the current run. The trigger returns the exception itself, not `null`, so a caller
 * can distinguish a run a handler ended from one that reached no handler; a setter that triggers a `*Changing*`
 * handler cancels the write when it receives it. The trigger returns the exception directly if the chain ran
 * synchronously, and as the resolution of the returned promise if a handler in it was asynchronous.
 */
export class AbortEventHandlingException extends Error {}

export type FieldActionExecute<T = any> = (field: FieldBase<T>, ...params: any[]) => any;
