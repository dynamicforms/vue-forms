import type DisplayMode from './display-mode';
import { type ValidationError } from './validation-error';

export interface IField {
  value: any;
  fullValue: any;
  originalValue: any;
  valid: boolean;
  errors: ValidationError[];
  enabled: boolean;
  visibility: DisplayMode;

  parent?: any; // Group when member of a Group, parent will specify that group
  fieldName?: string; // when member of a Group, fieldName specifies the name of this field

  clone(overrides?: Partial<IField>): IField;
  // events
  registerAction(action: IFieldAction): this;
  triggerAction<T extends IFieldAction>(actionClass: abstract new (...args: any[]) => T, ...params: any[]): any;

  // API
  validate(): void;
  isChanged: boolean;
}

export class AbortEventHandlingException extends Error {}

export type FieldActionExecute = (field: IField, ...params: any[]) => Promise<any>;
export interface IFieldAction {
  execute(field: IField, supr: FieldActionExecute, ...params: any[]): any;
}
