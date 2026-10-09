/**
 * Vue devtools support. In development every root element is listed in a "vue-forms" inspector, grouped by the file
 * or the component that constructed it, and shown in the inspector of that component. The devtools are a plugin
 * built on the plugin hooks (`onElementCreated`, `onElementAdopted`, `onCommit`); the library installs it on the
 * first element built in development. In a production build (`process.env.NODE_ENV === 'production'`, which the
 * application's bundler replaces) every function here is empty, and the bundler drops the registry and the devtools
 * plugin. The condition is written out in every function: a bundler removes a branch over the replaced expression,
 * not one over a constant that holds it.
 */
import type { FieldBase } from '../field-base';
import { installPlugin, type Plugin } from '../plugins';

import * as registry from './registry';
import type { DevtoolsRegistration, StateDescription } from './registry';

export type { DevtoolsRegistration, StateDescription };

/** What `configureDevtools()` sets. A member left out keeps its setting. */
export interface DevtoolsOptions {
  /**
   * Whether the devtools record and list elements. Defaults to true. While false, nothing is recorded or listed;
   * an element built while false is not listed after it is set back to true.
   */
  enabled?: boolean;
  /**
   * Which root elements are listed: `'opt-out'` (default) every one that is not hidden, `'opt-in'` only those
   * named with `describeState()`.
   */
  registration?: DevtoolsRegistration;
  /**
   * Whether the stack is captured when a root element is constructed, to show the file that constructed it.
   * Defaults to true. While false, an element's file is the one `describeState()` gives, or none.
   */
  location?: boolean;
}

let enabled = true;
let location = true;
let uninstall: (() => void) | undefined;
let loaded = false;

/** Loads the inspector once, and adds the app of the component that constructed `element` to it. */
function load(element: FieldBase): void {
  if (!loaded) {
    loaded = true;
    void import('./plugin').then((plugin) => {
      plugin.install();
      registry.listed().forEach(({ element: listed }) => plugin.installFor(listed));
    });
  } else {
    void import('./plugin').then((plugin) => plugin.installFor(element));
  }
}

const devtools: Plugin = {
  setup(context) {
    registry.useContext(context);
  },
  onElementCreated(element, binding) {
    // a binding is part of its declaration's definition and is never listed, so nothing is recorded for it
    if (binding) return;
    registry.noteElement(element, location);
    load(element);
  },
  onElementAdopted(element) {
    registry.forgetLocation(element);
  },
  onCommit() {
    registry.noteChange();
  },
};

/** Installs the devtools plugin unless it is installed or turned off. Called on every element's construction. */
export function installDevtools(): void {
  if (process.env.NODE_ENV !== 'production') {
    if (enabled && !uninstall) uninstall = installPlugin(devtools);
  }
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

/** Sets what the devtools record and list. Does nothing in production. */
export function configureDevtools(options: DevtoolsOptions): void {
  if (process.env.NODE_ENV !== 'production') {
    if (options.location !== undefined) location = options.location;
    if (options.registration !== undefined) registry.setRegistration(options.registration);
    if (options.enabled !== undefined) {
      enabled = options.enabled;
      if (!enabled) {
        uninstall?.();
        uninstall = undefined;
      }
      registry.setEnabled(enabled);
    }
  }
}
