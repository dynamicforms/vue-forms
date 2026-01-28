import configPlugin, { getConfig, setConfig } from './config';

describe('config', () => {
  it('should update config using setConfig', () => {
    // Get initial config
    const initialConfig = getConfig();
    const initialValue = initialConfig.useMarkdownInValidators;

    // Update config
    setConfig({ useMarkdownInValidators: false });

    // Verify config was updated
    expect(getConfig().useMarkdownInValidators).toBe(false);

    // Restore original value
    setConfig({ useMarkdownInValidators: initialValue });
  });

  it('should install Vue plugin without options', () => {
    const mockApp = {};

    // Should not throw
    expect(() => configPlugin.install(mockApp)).not.toThrow();
  });

  it('should install Vue plugin with options', () => {
    const mockApp = {};

    // Get initial value
    const initialValue = getConfig().useMarkdownInValidators;

    // Install with options
    configPlugin.install(mockApp, { useMarkdownInValidators: true });

    // Verify config was set
    expect(getConfig().useMarkdownInValidators).toBe(true);

    // Restore original value
    setConfig({ useMarkdownInValidators: initialValue });
  });
});
