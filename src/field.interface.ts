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
 * them throws a TypeError. parent and fieldName are set by the container: until a Group or List installs them
 * as non-configurable accessors, assigning them is silently accepted, which is why the type rejects them.
 */
export type IFieldConstructorParams<T = any> = {
  value: T;
  originalValue: T;
  enabled: boolean;
  visibility: DisplayMode;
  touched: boolean;
  errors: ValidationError[];
} & IFieldConstructorActionsList;

export class AbortEventHandlingException extends Error {}

export type FieldActionExecute<T = any> = (field: FieldBase<T>, ...params: any[]) => any;
