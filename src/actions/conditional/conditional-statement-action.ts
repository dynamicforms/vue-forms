import DisplayMode from '../../display-mode';
import { type FieldBase } from '../../field-base';
import { FieldActionExecute } from '../../field.interface';
import { ValueChangedAction } from '../value-changed-action';

import { Statement } from './statement';

const ConditionalStatementActionClassIdentifier = Symbol('ConditionalStatementAction');

type ConditionalExecutorFn = (field: FieldBase, currentResult: boolean, previousResult: boolean | undefined) => void;

export class ConditionalStatementAction extends ValueChangedAction {
  private lastResult: boolean | undefined = undefined;

  // boundField tracks the fields this action is bound to. so that it may perform the executorFn on them and not on the
  // ValueChangedAction fields that will call the actionExecutor
  private readonly boundFields: Set<FieldBase> = new Set<FieldBase>();

  constructor(statement: Statement, executorFn: ConditionalExecutorFn) {
    // Create ValueChangedAction executor that will evaluate statement and track changes
    const actionExecutor = (field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => {
      const currentResult = statement.evaluate();

      if (currentResult !== this.lastResult) {
        for (const fld of this.boundFields) {
          executorFn(fld, currentResult, this.lastResult);
        }
        this.lastResult = currentResult;
      }

      // Continue action chain
      return supr(field, newValue, oldValue);
    };

    super(actionExecutor);
    statement.collectFields().forEach((field) => field.registerAction(new ValueChangedAction(actionExecutor)));
  }

  static get classIdentifier() {
    return ConditionalStatementActionClassIdentifier;
  }

  get eager() {
    return true;
  }

  boundToField(field: FieldBase) {
    this.boundFields.add(field);
  }
}

// Derived classes for visibility, enabled, and value changes

export class ConditionalVisibilityAction extends ConditionalStatementAction {
  constructor(statement: Statement) {
    super(statement, (field: FieldBase, currentResult) => {
      field.visibility = currentResult ? DisplayMode.FULL : DisplayMode.SUPPRESS;
    });
  }
}

export class ConditionalEnabledAction extends ConditionalStatementAction {
  constructor(statement: Statement) {
    super(statement, (field, currentResult) => {
      field.enabled = currentResult;
    });
  }
}

export class ConditionalValueAction<T> extends ConditionalStatementAction {
  constructor(statement: Statement, trueValue: T) {
    super(statement, (field, currentResult) => {
      if (currentResult) field.value = trueValue;
    });
  }
}
