import type { Access } from '../../access';
import { type FieldBase } from '../../field-base';
import { FieldActionExecute } from '../../field.interface';
import { bindingsIn, scopeOf } from '../../resolve';
import { currentTransaction } from '../../transaction';
import type { Visibility } from '../../visibility';
import { WeakElements } from '../../weak-elements';
import { Outermost, ReleaseIfAbandoned } from '../field-action-base';
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
   * The declarations of the elements this action is registered on. It holds declarations, not the elements, so one
   * entry covers every row of a list; a result is applied to the element that corresponds to the declaration within
   * the record the change happened in. They are held weakly: the relay on a field the statement reads keeps this
   * action reachable, and a form dropped without unregistering the action is released all the same.
   */
  private readonly declarations = new WeakElements<FieldBase>();

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
    // the relay outlives the action's elements when the statement reads a field outside them; a field the relay is
    // registered on asks the action to remove it once they are all collected
    (this.relay as any)[ReleaseIfAbandoned] = () => {
      if (this.bound && this.declarations.alive.length === 0) this.stopListening();
    };
    this.listen();
  }

  /**
   * The listener on the fields the statement reads. The constructor installs it; it is removed when the action is
   * taken off its last element or its elements are collected, and installed again when the action is next
   * registered.
   */
  private readonly relay: ValueChangedAction;

  private listening = false;

  /** Whether the action has been registered on an element; until then the relay waits for its first element. */
  private bound = false;

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.statement.collectFields().forEach((field) => field.registerAction(this.relay));
  }

  /** Removes the relay from the fields the statement reads; a rollback restores it with the flag. */
  private stopListening(): void {
    if (!this.listening) return;
    // a rollback re-registers the relay first and the action on its element after it (newest undo first), so the
    // flag is restored in between and the re-registered action does not install the relay a second time
    currentTransaction()?.whenRolledBack(() => {
      this.listening = true;
    });
    this.listening = false;
    this.statement.collectFields().forEach((field) => field.unregisterAction(this.relay));
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
    this.bound = true;
    this.listen();
  }

  /** Forgets the result last applied to `binding`, so the next pass applies the statement over its new flags. */
  resetBinding(binding: FieldBase) {
    this.forgetState(binding);
  }

  unregisterFrom(binding: FieldBase) {
    this.registrations.delete(binding);
    // the declaration itself is released when the action leaves its map, which every binding of it reads; a rollback
    // binds the action to the declaration again, which adds it back
    if (binding === binding.declaration) this.declarations.delete(binding);
    // taken off the last declaration, the action has nothing left to apply, and the listener it installed on the
    // fields the statement reads is removed with it
    if (this.declarations.alive.length === 0) this.stopListening();
  }

  /**
   * The elements of `scope` this action controls: for each of its declarations, the corresponding elements within
   * that record that the action is registered on. A row of a list the action is not registered on is skipped.
   */
  private targetsIn(scope: FieldBase): FieldBase[] {
    const targets: FieldBase[] = [];
    this.declarations.alive.forEach((declaration) =>
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
