// Global configuration for @dynamicforms/vue-forms
export interface FormsConfig {
  useMarkdownInValidators: boolean;
}

// Default configuration
const config: FormsConfig = { useMarkdownInValidators: true };

// Function to access config
export function getConfig(): FormsConfig { return config; }

// Function to update config
export function setConfig(newConfig: Partial<FormsConfig>): void { Object.assign(config, newConfig); }

// Vue plugin installation
export default {
  install(app: any, options?: Partial<FormsConfig>) {
    if (options) {
      setConfig(options);
    }
  },
};
