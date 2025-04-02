// eslint-disable-next-line max-classes-per-file
import { ValueChangedAction } from '..';
import DisplayMode from '../../display-mode';
import { FieldActionExecute, IField } from '../../field.interface';

import { Statement } from './statement';

const ConditionalStatementActionClassIdentifier = Symbol('ConditionalStatementAction');

type ConditionalExecutorFn = (
  field: IField,
  currentResult: boolean,
  previousResult: boolean | undefined,
) => Promise<void>;

export class ConditionalStatementAction extends ValueChangedAction {
  private lastResult: boolean | undefined = undefined;

  // boundField tracks the fields this action is bound to. so that it may perform the executorFn on them and not on the
  // ValueChangedAction fields that will call the actionExecutor
  private readonly boundFields: Set<IField> = new Set<IField>();

  constructor(statement: Statement, executorFn: ConditionalExecutorFn) {
    // Create ValueChangedAction executor that will evaluate statement and track changes
    const actionExecutor = async (field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => {
      const currentResult = statement.evaluate();

      if (currentResult !== this.lastResult) {
        for (const fld of this.boundFields) {
          // eslint-disable-next-line no-await-in-loop
          await executorFn(fld, currentResult, this.lastResult);
        }
        this.lastResult = currentResult;
      }

      // Continue action chain
      return supr(field, newValue, oldValue);
    };

    super(actionExecutor);
    statement.collectFields().forEach((field) => field.registerAction(new ValueChangedAction(actionExecutor)));
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ConditionalStatementActionClassIdentifier; }

  // eslint-disable-next-line class-methods-use-this
  get eager() { return true; }

  boundToField(field: IField) { this.boundFields.add(field); }
}

// Derived classes for visibility, enabled, and value changes

export class ConditionalVisibilityAction extends ConditionalStatementAction {
  constructor(statement: Statement) {
    super(statement, async (field: IField, currentResult) => {
      await field.setVisibility(currentResult ? DisplayMode.FULL : DisplayMode.SUPPRESS);
    });
  }
}

export class ConditionalEnabledAction extends ConditionalStatementAction {
  constructor(statement: Statement) {
    super(statement, async (field, currentResult) => {
      await field.setEnabled(currentResult);
    });
  }
}

export class ConditionalValueAction<T> extends ConditionalStatementAction {
  constructor(statement: Statement, trueValue: T) {
    super(statement, async (field, currentResult) => {
      if (currentResult) await field.setValue(trueValue);
    });
  }
}
