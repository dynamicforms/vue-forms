/**
 * Vue devtools support. In development every root element is listed in a "vue-forms" inspector, grouped by the file
 * or the component that constructed it, and shown in the inspector of that component. In a production build
 * (`process.env.NODE_ENV === 'production'`, which the application's bundler replaces) every function here is empty,
 * and the bundler drops the registry and the devtools plugin. The condition is written out in every function: a
 * bundler removes a branch over the replaced expression, not one over a constant that holds it.
 */
import type { FieldBase } from '../field-base';

import * as registry from './registry';
import type { DevtoolsRegistration, StateDescription } from './registry';

export type { DevtoolsRegistration, StateDescription };

let installed = false;

/** Loads the devtools plugin once, on the first element. */
function install(element: FieldBase): void {
  if (!installed) {
    installed = true;
    void import('./plugin').then((plugin) => {
      plugin.install();
      registry.listed().forEach(({ element: listed }) => plugin.installFor(listed));
    });
  } else {
    void import('./plugin').then((plugin) => plugin.installFor(element));
  }
}

/** Records an element at construction. Called by `FieldBase`. */
export function noteElement(element: FieldBase): void {
  if (process.env.NODE_ENV !== 'production') {
    registry.noteElement(element);
    install(element);
  }
}

/** Marks a binding or a list's item template, which the devtools do not list. Called by `FieldBase` and `List`. */
export function noteInternal(element: FieldBase): void {
  if (process.env.NODE_ENV !== 'production') registry.noteInternal(element);
}

/** Reports a committed transaction, so the devtools show the new state. Called by the transaction. */
export function noteChange(): void {
  if (process.env.NODE_ENV !== 'production') registry.noteChange();
}

/**
 * Names `element` for the devtools and lists it in opt-in mode. `name` replaces the element's class and number,
 * `file` the file found from the constructing code. Does nothing in a production build.
 */
export function describeState(element: FieldBase, description: StateDescription): void {
  if (process.env.NODE_ENV !== 'production') registry.describe(element, description);
}

/** Leaves `element` out of the devtools, or lists it again with `hidden` false. Does nothing in production. */
export function hideState(element: FieldBase, hidden = true): void {
  if (process.env.NODE_ENV !== 'production') registry.setHidden(element, hidden);
}

/**
 * Which root elements the devtools list: `'opt-out'` (default) every one that is not hidden, `'opt-in'` only those
 * named with `describeState()`. Does nothing in production.
 */
export function setDevtoolsRegistration(mode: DevtoolsRegistration): void {
  if (process.env.NODE_ENV !== 'production') registry.setRegistration(mode);
}
