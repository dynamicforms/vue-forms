/**
 * Global configuration for @dynamicforms/vue-forms.
 *
 * The configuration is module-global: `setConfig` and the plugin's `install` write the single record this module
 * holds, so in a process running several Vue apps the configuration applied last is the one all of them read. The
 * record is reactive, so an error on screen follows a later write of `errorText`.
 */
import { reactive } from 'vue';

import type { ErrorDescription, RenderContentNonCallable } from './validators/validation-error';

export interface FormsConfig {
  /**
   * What an error stated by code, params and English detail reads as: the application's text for it, in its own
   * language and form - a string, an `MdString` or a component. `undefined` leaves the error's English detail.
   * It is called on every read of the error, so an error on screen follows the reactive state it reads, such as
   * the locale.
   */
  errorText?: (error: ErrorDescription) => RenderContentNonCallable | undefined;
}

const config = reactive<FormsConfig>({});

/** The current configuration. The object is the module's own record, and reading it again reports later writes. */
export function getConfig(): FormsConfig {
  return config;
}

/** Writes the members `newConfig` names and leaves the rest as they stand. */
export function setConfig(newConfig: Partial<FormsConfig>): void {
  Object.assign(config, newConfig);
}

// Vue plugin installation
export default {
  install(app: any, options?: Partial<FormsConfig>) {
    if (options) {
      setConfig(options);
    }
  },
};
