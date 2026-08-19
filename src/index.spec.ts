import { getConfig as getModuleConfig, setConfig as setModuleConfig } from './config';

import { Field, forms, getConfig, setConfig, type FormsConfig } from './index';

describe('package entry point', () => {
  it('exports the configuration surface beside the elements', () => {
    expect(typeof getConfig).toBe('function');
    expect(typeof setConfig).toBe('function');
    expect(typeof forms.install).toBe('function');
    expect(new Field({ value: 1 }).value).toBe(1);
  });

  it('reads and writes the configuration the library itself reads', () => {
    const initial = getModuleConfig().useMarkdownInValidators;
    try {
      const options: Partial<FormsConfig> = { useMarkdownInValidators: !initial };
      setConfig(options);

      expect(getConfig()).toBe(getModuleConfig());
      expect(getModuleConfig().useMarkdownInValidators).toBe(!initial);
    } finally {
      setModuleConfig({ useMarkdownInValidators: initial });
    }
  });
});
