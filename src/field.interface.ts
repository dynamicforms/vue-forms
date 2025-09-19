import { ComputedRef } from 'vue';

import type DisplayMode from './display-mode';
import { type ValidationError } from './validators/validation-error';

export interface IField<T = any> {
  value: T;
  reactiveValue: ComputedRef<T>;
  fullValue: T;
  originalValue: T;
  valid: boolean;
  validating: boolean;
  errors: ValidationError[];
  enabled: boolean;
  visibility: DisplayMode;
  touched: boolean;

  parent?: any; // Group when member of a Group, parent will specify that group
  fieldName?: string; // when member of a Group, fieldName specifies the name of this field

  clone(overrides?: Partial<IField<T>>): IField<T>;

  // events
  registerAction(action: IFieldAction<T>): this;
  triggerAction<T2 extends IFieldAction<T>>(actionClass: abstract new (...args: any[]) => T2, ...params: any[]): any;

  // API
  validate(revalidate?: boolean): void;
  clearValidators(): void;
  isChanged: boolean;
}

export interface IFieldConstructorActionsList<T = any> {
  actions?: IFieldAction<T>[],
  validators?: IFieldAction<T>[],
}

export type IFieldConstructorParams<T = any> = IField<T> & IFieldConstructorActionsList<T>;

export class AbortEventHandlingException extends Error {}

export type FieldActionExecute<T = any> = (field: IField<T>, ...params: any[]) => any;
export interface IFieldAction<T = any> {
  execute(field: IField<T>, supr: FieldActionExecute<T>, ...params: any[]): any;
}
