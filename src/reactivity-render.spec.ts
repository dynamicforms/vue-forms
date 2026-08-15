import { mount } from '@vue/test-utils';
import { vi } from 'vitest';
import { nextTick } from 'vue';

import MessagesWidget from './components/messages-widget.vue';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { ValidationErrorText } from './validators';

// MessagesWidget resolves vue-markdown at setup; a stub keeps the resolution warning out of the way so that the
// console.warn spy below only ever sees warnings this suite is actually about
const MockVueMarkdown = { name: 'VueMarkdown', props: ['source'], template: '<div>{{ source }}</div>' };

const ErrorHost = {
  components: { MessagesWidget },
  props: { form: { type: Object, required: true } },
  template: '<MessagesWidget :message="form.errors" classes="text-error" />',
};

const RowsHost = {
  props: { form: { type: Object, required: true } },
  template: '<ul><li v-for="row in form.fields.people.value ?? []" class="row">{{ row.name }}</li></ul>',
};

const FieldHost = {
  props: { field: { type: Object, required: true } },
  template: '<label>{{ field.value }}</label><input :value="field.value" :disabled="!field.enabled">',
};

describe('rendering a live form', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('[Vue warn]'))).toEqual([]);
    warn.mockRestore();
  });

  it('renders a group-level error as it appears and removes it again', async () => {
    const form = new Group({ ime: new Field({ value: 'Janez' }) });
    const wrapper = mount(ErrorHost, {
      props: { form },
      global: { components: { VueMarkdown: MockVueMarkdown } },
    });

    expect(wrapper.findAll('div')).toHaveLength(0);

    form.errors.push(new ValidationErrorText('Vsaj en kontakt je obvezen'));
    await nextTick();

    const divs = wrapper.findAll('div');
    expect(divs).toHaveLength(1);
    expect(divs[0].text()).toBe('Vsaj en kontakt je obvezen');
    expect(divs[0].classes()).toContain('text-error');

    form.errors = [];
    await nextTick();

    expect(wrapper.findAll('div')).toHaveLength(0);
  });

  it('renders list rows as they are added and removed', async () => {
    const people = new List(new Group({ name: new Field({ value: '' }) }));
    const form = new Group({ people });
    const wrapper = mount(RowsHost, { props: { form } });

    expect(wrapper.findAll('.row')).toHaveLength(0);

    people.push({ name: 'Janez' });
    await nextTick();
    expect(wrapper.findAll('.row').map((row) => row.text())).toEqual(['Janez']);

    people.push({ name: 'Micka' });
    await nextTick();
    expect(wrapper.findAll('.row').map((row) => row.text())).toEqual(['Janez', 'Micka']);

    people.remove(0);
    await nextTick();
    expect(wrapper.findAll('.row').map((row) => row.text())).toEqual(['Micka']);

    people.clear();
    await nextTick();
    expect(wrapper.findAll('.row')).toHaveLength(0);
  });

  it('renders a row edited through its own field', async () => {
    const people = new List(new Group({ name: new Field({ value: '' }) }));
    const form = new Group({ people });
    const wrapper = mount(RowsHost, { props: { form } });

    people.push({ name: 'Janez' });
    await nextTick();
    expect(wrapper.find('.row').text()).toBe('Janez');

    people.get(0)!.fields.name.value = 'Janez Novak';
    await nextTick();
    expect(wrapper.find('.row').text()).toBe('Janez Novak');
  });

  it('renders a scalar field through the props boundary', async () => {
    const field = new Field({ value: 'a' });
    const wrapper = mount(FieldHost, { props: { field } });

    expect(wrapper.find('label').text()).toBe('a');
    expect(wrapper.find('input').attributes('disabled')).toBeUndefined();

    field.value = 'b';
    field.enabled = false;
    await nextTick();

    expect(wrapper.find('label').text()).toBe('b');
    expect(wrapper.find('input').attributes('disabled')).toBe('');
  });
});
