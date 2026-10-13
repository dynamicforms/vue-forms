// @vitest-environment node
import { Field } from '../field';
import { Group } from '../group';
import { entryOf } from '../plugins/devtools/registry';

describe('the devtools on a server', () => {
  it('records nothing where there is no window', () => {
    const form = new Group({ name: new Field({ value: 'a' }) });

    expect(typeof window).toBe('undefined');
    expect(entryOf(form)).toBeUndefined();
  });
});
