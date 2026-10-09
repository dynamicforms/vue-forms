import type { Access } from '../../access';
import { type FieldBase } from '../../field-base';
import { FieldActionExecute } from '../../field.interface';
import { bindingsIn, scopeOf } from '../../resolve';
import { currentTransaction } from '../../transaction';
import type { Visibility } from '../../visibility';
import { Outermost } from '../field-action-base';
import { ValueChangedAction } from '../value-changed-action';

import { Statement } from './statement';

const ConditionalStatementActionClassIdentifier = Symbol('ConditionalStatementAction');

type ConditionalExecutorFn = (field: FieldBase, currentResult: boolean, previousResult: boolean | undefined) => void;

/** The action's state for one target: the last result applied to it. */
interface ConditionalTargetState {
  lastResult: boolean | undefined;
}

export class ConditionalStatementAction extends ValueChangedAction {
  private readonly statement: Statement;

  private readonly conditionalExecutor: ConditionalExecutorFn;

  /**
   * The declarations of the elements this action was registered on. It holds declarations, not the elements, so one
   * entry covers every row of a list; a result is applied to the element that corresponds to the declaration within
   * the record the change happened in.
   */
  private readonly declarations = new Set<FieldBase>();

  /**
   * The elements this action was registered on. Registration happens one element at a time (the rows of a list
   * receive the action one by one, as they are built from the item template), so this set determines which of the
   * elements of a declaration the action controls.
   */
  private readonly registrations = new WeakSet<FieldBase>();

  constructor(statement: Statement, executorFn: ConditionalExecutorFn) {
    // the element the action fires for determines the record: an eager pass over one row's field re-evaluates the
    // statement over that row and applies it to that row's targets. A pass that finds no target runs over an
    // element whose record is still being built, and the container that completes it runs the pass again
    super((field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => {
      if (!this.applyIn(scopeOf(field))) field.markRecordIncomplete();
      return supr(field, newValue, oldValue);
    });

    this.statement = statement;
    this.conditionalExecutor = executorFn;

    // one listener per field the statement reads, however many records the field has: the listener receives the
    // field that changed, which determines the record to re-evaluate. A listener per record would add one handler
    // to the field's chain for every row of a list. It runs outermost in the field's chain, so a handler that does
    // not call supr does not keep it from running
    this.relay = new ValueChangedAction((source: FieldBase, supr: FieldActionExecute, ...params: any[]) => {
      this.applyFrom(source);
      return supr(source, ...params);
    });
    (this.relay as any)[Outermost] = true;
    this.listen();
  }

  /** The listener on the fields the statement reads; installed while the action is registered on an element. */
  private readonly relay: ValueChangedAction;

  /** The number of elements the action is registered on; the relay is removed when it drops to zero. */
  private registered = 0;

  private listening = false;

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.statement.collectFields().forEach((field) => field.registerAction(this.relay));
  }

  static get classIdentifier() {
    return ConditionalStatementActionClassIdentifier;
  }

  get eager() {
    return true;
  }

  boundToBinding(binding: FieldBase) {
    this.declarations.add(binding.declaration);
    if (!this.registrations.has(binding)) this.registered++;
    this.registrations.add(binding);
    this.listen();
  }

  /** Forgets the result last applied to `binding`, so the next pass applies the statement over its new flags. */
  resetBinding(binding: FieldBase) {
    this.forgetState(binding);
  }

  unregisterFrom(binding: FieldBase) {
    if (this.registrations.delete(binding)) this.registered--;
    // taken off the last element, the action has nothing left to apply, and the listener it installed on the fields
    // the statement reads is removed with it
    if (this.registered === 0 && this.listening) {
      // a rollback re-registers the relay first and the action on its element after it (newest undo first), so the
      // flag is restored in between and the re-registered action does not install the relay a second time
      currentTransaction()?.whenRolledBack(() => {
        this.listening = true;
      });
      this.listening = false;
      this.statement.collectFields().forEach((field) => field.unregisterAction(this.relay));
    }
  }

  /**
   * The elements of `scope` this action controls: for each of its declarations, the corresponding elements within
   * that record that the action is registered on. A row of a list the action is not registered on is skipped.
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
   * Re-evaluates the statement over one record and applies the result to every target whose last applied result
   * differs, so a target registered after the result was applied to another one in the same record receives it.
   * The result is recorded before the executor runs, because an executor that writes a value re-enters through that
   * value's eager pass, which must see the result being applied. Returns whether the record contains a target for
   * this action; false means the record is not assembled yet.
   */
  private applyIn(scope: FieldBase): boolean {
    const targets = this.targetsIn(scope);
    if (targets.length === 0) return false;
    const currentResult = this.statement.evaluate(scope);
    targets.forEach((target) => {
      const state = this.state(target, (): ConditionalTargetState => ({ lastResult: undefined }));
      if (currentResult === state.lastResult) return;
      const previousResult = state.lastResult;
      state.lastResult = currentResult;
      this.conditionalExecutor(target, currentResult, previousResult);
    });
    return true;
  }

  /**
   * Re-evaluates the records affected by a change of `source`. A change of an element in the targets' record
   * affects only that record, so one row of a list does not affect another; a change of an element above them (a
   * form field every row reads) affects every record below it, or the record the action was declared in if there
   * is no record below it.
   */
  private applyFrom(source: FieldBase): void {
    const scopes = new Set<FieldBase>();
    this.targetsIn(scopeOf(source)).forEach((target) => scopes.add(scopeOf(target)));
    scopes.forEach((scope) => this.applyIn(scope));
  }
}

// Derived classes for visibility, access, and value changes

/**
 * Sets the visibility of the elements it is registered on from the statement's result: `whenTrue` while the
 * statement is true, `whenFalse` otherwise. Visibility affects presentation only; what the elements send is
 * determined by their access.
 */
export class ConditionalVisibilityAction extends ConditionalStatementAction {
  constructor(statement: Statement, whenTrue: Visibility = 'full', whenFalse: Visibility = 'suppress') {
    super(statement, (field: FieldBase, currentResult) => {
      field.visibility = currentResult ? whenTrue : whenFalse;
    });
  }
}

/**
 * Sets the access of the elements it is registered on from the statement's result: `whenTrue` while the statement
 * is true, `whenFalse` otherwise.
 */
export class ConditionalAccessAction extends ConditionalStatementAction {
  constructor(statement: Statement, whenTrue: Access = 'editable', whenFalse: Access = 'disabled') {
    super(statement, (field, currentResult) => {
      field.access = currentResult ? whenTrue : whenFalse;
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
