/**
 * Global configuration for @dynamicforms/vue-forms.
 *
 * The configuration is module-global: `setConfig` and the plugin's `install` write the single record this module
 * holds, so in a process running several Vue apps the configuration applied last is the one all of them read.
 */
export interface FormsConfig {
  /** Whether the built-in validators phrase their error messages as `MdString` markdown instead of plain text. */
  useMarkdownInValidators: boolean;
}

// Default configuration
const config: FormsConfig = { useMarkdownInValidators: true };

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
