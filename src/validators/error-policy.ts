import { shallowRef } from 'vue';

import FieldActionBase from '../actions/field-action-base';
import { ErrorPoliciesChanged } from '../element-state';
import type { FieldBase } from '../field-base';
import { transactional } from '../transaction';

import type { ErrorOrigin } from './validation-error';

/**
 * When an element removes an error by itself:
 *
 * - `'change'`: when the element's value changes. A container's value changes with any member or row below it, and
 *   when a member or a row is added, removed or written a different `access`.
 * - `'edit'`: when `touched = true` is written on the element or on an element below it, and the element's value
 *   differs from the value it held when the error was written.
 * - `'submit'`: when a `SubmitAction` whose target is the element or a container above it sends the target's value.
 * - `'never'`: only the code that wrote the error removes it.
 */
export type ErrorRemoval = 'change' | 'edit' | 'submit' | 'never';

/** The values of `ErrorRemoval`. */
export const errorRemovals: readonly ErrorRemoval[] = Object.freeze(['change', 'edit', 'submit', 'never']);

/** How the errors of one origin are treated. */
export interface ErrorPolicyRule {
  /** Whether an error of the origin makes its element, and every container above it, invalid. */
  readonly validEffect: boolean;
  /** When an element removes an error of the origin by itself. */
  readonly removeOn: ErrorRemoval;
}

/** A rule per origin. `'validator'` has no rule: a validator replaces its own errors and they always count. */
export type ErrorPolicies = Readonly<Partial<Record<Exclude<ErrorOrigin, 'validator'>, ErrorPolicyRule>>>;

const ErrorPolicyClassIdentifier = Symbol('ErrorPolicy');

/** The rule of an origin no `ErrorPolicy` and no default names. */
const fallbackRule: ErrorPolicyRule = Object.freeze({ validEffect: true, removeOn: 'never' });

const builtInDefaults: ErrorPolicies = Object.freeze({
  server: Object.freeze({ validEffect: true, removeOn: 'edit' }),
});

let defaults: ErrorPolicies = builtInDefaults;

/**
 * Raised whenever a rule may have changed for some element: an `ErrorPolicy` registered or unregistered, the
 * defaults set. A validity that reads a rule reads this too, so it is recomputed after such a change.
 */
const rulesVersion = shallowRef(0);

/**
 * The number of elements an `ErrorPolicy` was bound to and not unregistered from. A binding that is released without
 * an unregistration stays counted, so the count is an upper bound; only zero is read. While it is zero, the rule of
 * an error does not depend on the element's position, so a container that takes or releases an element does not
 * recompute the validity below it.
 */
let positionalRules = 0;

/** Whether some element has an `ErrorPolicy`, so that moving an element can change the rules over its errors. */
export function rulesArePositional(): boolean {
  return positionalRules > 0;
}

/** Records that a rule may have changed; read by every validity that reads a rule. */
export function readRulesVersion(): void {
  void rulesVersion.value;
}

const describe = (value: unknown) => (typeof value === 'string' ? `'${value}'` : String(value));

/** Throws a TypeError for a rule or an origin an `ErrorPolicy` or the defaults cannot take. */
function checkPolicies(policies: ErrorPolicies): void {
  if (policies === null || typeof policies !== 'object') {
    throw new TypeError(`${describe(policies)} is not an object of rules keyed by origin`);
  }
  Object.entries(policies).forEach(([origin, rule]) => {
    if (origin === 'validator') {
      throw new TypeError("'validator' has no rule: a validator replaces its own errors and they always count");
    }
    if (rule === null || typeof rule !== 'object') {
      throw new TypeError(`The rule for ${describe(origin)} is not an object of validEffect and removeOn`);
    }
    if (typeof rule.validEffect !== 'boolean') {
      throw new TypeError(`validEffect for ${describe(origin)} is ${describe(rule.validEffect)}, not a boolean`);
    }
    if (!errorRemovals.includes(rule.removeOn)) {
      throw new TypeError(
        `removeOn for ${describe(origin)} is ${describe(rule.removeOn)}, not one of ` +
          errorRemovals.map(describe).join(', '),
      );
    }
    if (rule.validEffect && rule.removeOn === 'submit') {
      throw new TypeError(
        `The rule for ${describe(origin)} combines validEffect: true with removeOn: 'submit': an error that makes ` +
          'the target invalid refuses the submit that would remove it',
      );
    }
  });
}

/** A frozen copy of `policies`, each rule frozen. */
function frozen(policies: ErrorPolicies): ErrorPolicies {
  const copy: Record<string, ErrorPolicyRule> = Object.create(null);
  Object.entries(policies).forEach(([origin, rule]) => {
    copy[origin] = Object.freeze({ validEffect: rule!.validEffect, removeOn: rule!.removeOn });
  });
  return Object.freeze(copy);
}

/**
 * Sets the rules of the origins in `policies` for every element without an `ErrorPolicy` that names them. An origin
 * not in `policies` keeps its rule. The built-in rules are `{ validEffect: true, removeOn: 'edit' }` for `'server'`
 * and `{ validEffect: true, removeOn: 'never' }` for every other origin.
 *
 * Returns a function that restores the rules in force before the call. `valid` reflects a change at once; the
 * validity an element announces through `ValidChangedAction` is recomputed at its next validity change, so the
 * defaults are set before forms are built. Throws a TypeError for a rule `ErrorPolicy` refuses.
 */
export function setDefaultErrorPolicies(policies: ErrorPolicies): () => void {
  checkPolicies(policies);
  const previous = defaults;
  defaults = Object.freeze({ ...defaults, ...frozen(policies) });
  rulesVersion.value++;
  return () => {
    defaults = previous;
    rulesVersion.value++;
  };
}

/** The rule of `origin` where no `ErrorPolicy` names it. */
export function defaultRule(origin: ErrorOrigin): ErrorPolicyRule {
  return (defaults as Record<string, ErrorPolicyRule>)[origin] ?? fallbackRule;
}

/**
 * The rules of the error origins for the element it is registered on and every element below it. An element takes
 * the rule of an origin from the nearest `ErrorPolicy` that names it, on itself or on a container above it; an
 * origin no such policy names takes the rule `setDefaultErrorPolicies` set.
 *
 * ```typescript
 * login.registerAction(new ErrorPolicy({ server: { validEffect: false, removeOn: 'submit' } }));
 * ```
 *
 * Its registration is shared by the element's bindings, as every action's is. Registering or unregistering it
 * recomputes the validity of the elements below it; an error it now removes stays until the event that removes
 * it. The constructor throws a TypeError for a rule of `'validator'`, a `validEffect` that is not a boolean, a
 * `removeOn` that is not an `ErrorRemoval`, and `validEffect: true` with `removeOn: 'submit'`, since such an error
 * refuses the submit that would remove it. Registering it beside another `ErrorPolicy` that names one of its
 * origins throws a TypeError.
 */
export class ErrorPolicy extends FieldActionBase {
  readonly policies: ErrorPolicies;

  constructor(policies: ErrorPolicies) {
    checkPolicies(policies);
    // no event triggers it; the chain argument is never called
    super((field, supr, ...params) => supr(field, ...params));
    this.policies = frozen(policies);
  }

  static get classIdentifier() {
    return ErrorPolicyClassIdentifier;
  }

  boundToBinding(binding: FieldBase) {
    positionalRules++;
    this.rulesChanged(binding);
  }

  unregisterFrom(binding: FieldBase) {
    positionalRules--;
    this.rulesChanged(binding);
  }

  private rulesChanged(binding: FieldBase) {
    rulesVersion.value++;
    transactional(() => binding[ErrorPoliciesChanged]());
  }
}

/** The rule `policy` states for `origin`, or undefined. */
export function ruleIn(policy: ErrorPolicy, origin: ErrorOrigin): ErrorPolicyRule | undefined {
  return (policy.policies as Record<string, ErrorPolicyRule>)[origin];
}

/**
 * Throws a TypeError where `action` is an `ErrorPolicy` and `registered`, the actions of the element it is being
 * registered on, holds another policy naming one of its origins. `ActionsMap` calls it before it registers anything.
 */
export function checkRegistration(action: FieldActionBase, registered: readonly FieldActionBase[]): void {
  if (!(action instanceof ErrorPolicy)) return;
  const origins = Object.keys(action.policies);
  registered.forEach((other) => {
    if (other === action || !(other instanceof ErrorPolicy)) return;
    const shared = origins.find((origin) => ruleIn(other, origin) !== undefined);
    if (shared !== undefined) {
      throw new TypeError(`An ErrorPolicy for ${describe(shared)} is already registered on this element`);
    }
  });
}
