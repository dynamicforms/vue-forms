import * as entry from './index';

describe('package entry point', () => {
  it('exports the elements and the validators', () => {
    expect(new entry.Field({ value: 1 }).value).toBe(1);
    expect(typeof entry.Validators.Required).toBe('function');
    expect(typeof entry.ValidationError).toBe('function');
  });

  it('exports no rendering or configuration surface', () => {
    for (const name of ['MessagesWidget', 'MdString', 'RenderableValue', 'forms', 'getConfig', 'setConfig']) {
      expect(entry).not.toHaveProperty(name);
    }
  });
});
