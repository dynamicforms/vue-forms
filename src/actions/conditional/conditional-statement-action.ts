import { bindingsIn, scopeOf } from '../../binding/resolve';
import DisplayMode from '../../display-mode';
import { type FieldBase } from '../../field-base';
import { FieldActionExecute } from '../../field.interface';
import { ValueChangedAction } from '../value-changed-action';

import { Statement } from './statement';

const ConditionalStatementActionClassIdentifier = Symbol('ConditionalStatementAction');

type ConditionalExecutorFn = (field: FieldBase, currentResult: boolean, previousResult: boolean | undefined) => void;

/** What the action remembers about one record: the result the record's fields last produced. */
interface ConditionalRecordState {
  lastResult: boolean | undefined;
}

export class ConditionalStatementAction extends ValueChangedAction {
  private readonly statement: Statement;

  private readonly conditionalExecutor: ConditionalExecutorFn;

  /**
   * What the elements this action was registered on were declared as. It holds declarations rather than the
   * elements themselves, so one entry stands for every row of a list, and the element a result is applied to is
   * the one that declaration names within the record the change happened in.
   */
  private readonly declarations = new Set<FieldBase>();

  /**
   * The elements this action was registered on. Registration reaches one element at a time - the rows of a list
   * take the action on one by one, as they are built from the item template that carries it - so this is what
   * says which of the elements a declaration stands for the action actually drives.
   */
  private readonly registrations = new WeakSet<FieldBase>();

  constructor(statement: Statement, executorFn: ConditionalExecutorFn) {
    // the element the action fires for names the record: an eager pass over one row's field re-evaluates that
    // row's fields and reaches that row's targets. A pass that reaches none of them is running over an element
    // whose record is still being built, and the container that finishes it runs the pass again
    super((field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => {
      if (!this.applyIn(scopeOf(field))) field.markRecordIncomplete();
      return supr(field, newValue, oldValue);
    });

    this.statement = statement;
    this.conditionalExecutor = executorFn;

    // one listener per field the statement reads, however many records that field ends up having: the listener
    // receives the field that changed, which is what says which record to re-evaluate. Registering per record
    // instead would grow the field's handler chain by one link for every row a list holds.
    const relay = new ValueChangedAction((source: FieldBase, supr: FieldActionExecute, ...params: any[]) => {
      this.applyFrom(source);
      return supr(source, ...params);
    });
    statement.collectFields().forEach((field) => field.registerAction(relay));
  }

  static get classIdentifier() {
    return ConditionalStatementActionClassIdentifier;
  }

  get eager() {
    return true;
  }

  boundToBinding(binding: FieldBase) {
    this.declarations.add(binding.declaration);
    this.registrations.add(binding);
  }

  /**
   * The elements of `scope` this action controls: what each declaration it serves names within that record, and of
   * those the ones that took the action on. A row of a list that never took it on is not one this action drives.
   */
  private targetsIn(scope: FieldBase): FieldBase[] {
    const targets: FieldBase[] = [];
    this.declarations.forEach((declaration) =>
      bindingsIn(declaration, scope).forEach((target) => {
        if (this.registrations.has(target)) targets.push(target);
      }),
    );
    return targets;
  }

  /**
   * Re-evaluates the statement over one record and applies the result where it changed. The result is recorded
   * before the executor runs, because an executor that writes a value re-enters through that value's eager pass
   * and what it has to find there is the result being applied. It answers whether the record held anything for
   * this action to drive, which is how a caller learns that the record is not assembled yet.
   */
  private applyIn(scope: FieldBase): boolean {
    const targets = this.targetsIn(scope);
    if (targets.length === 0) return false;
    const state = this.state(scope, (): ConditionalRecordState => ({ lastResult: undefined }));
    const currentResult = this.statement.evaluate(scope);
    if (currentResult === state.lastResult) return true;
    const previousResult = state.lastResult;
    state.lastResult = currentResult;
    targets.forEach((target) => this.conditionalExecutor(target, currentResult, previousResult));
    return true;
  }

  /**
   * Re-evaluates the records a change of `source` speaks for. A field of the record the targets live in speaks for
   * that record alone, which is what keeps one row of a list from answering for another; a field above them - a
   * form field every row reads - speaks for every record below it, and for the record the action was declared in
   * where the change reaches none.
   */
  private applyFrom(source: FieldBase): void {
    const scopes = new Set<FieldBase>();
    this.targetsIn(scopeOf(source)).forEach((target) => scopes.add(scopeOf(target)));
    scopes.forEach((scope) => this.applyIn(scope));
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
