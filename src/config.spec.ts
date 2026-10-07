import configPlugin, { getConfig, setConfig } from './config';

describe('config', () => {
  afterEach(() => {
    setConfig({ errorText: undefined });
  });

  it('should update config using setConfig', () => {
    const errorText = () => 'text';

    setConfig({ errorText });

    expect(getConfig().errorText).toBe(errorText);
  });

  it('should install Vue plugin without options', () => {
    const mockApp = {};

    expect(() => configPlugin.install(mockApp)).not.toThrow();
  });

  it('should install Vue plugin with options', () => {
    const errorText = () => 'text';

    configPlugin.install({}, { errorText });

    expect(getConfig().errorText).toBe(errorText);
  });
});
