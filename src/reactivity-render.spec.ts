import { mount } from '@vue/test-utils';
import { type MockInstance, vi } from 'vitest';
import { nextTick } from 'vue';

import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { ValidationError } from './validators';

const ErrorHost = {
  props: { form: { type: Object, required: true } },
  template: '<div v-for="error in form.errors" class="text-error">{{ error.detail }}</div>',
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
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('[Vue warn]'))).toEqual([]);
    warn.mockRestore();
  });

  it('renders a group-level error as it appears and removes it again', async () => {
    const form = new Group({ ime: new Field({ value: 'Janez' }) });
    const wrapper = mount(ErrorHost, { props: { form } });

    expect(wrapper.findAll('div')).toHaveLength(0);

    form.errors.push(new ValidationError('invalid', {}, 'At least one contact is required'));
    await nextTick();

    const divs = wrapper.findAll('div');
    expect(divs).toHaveLength(1);
    expect(divs[0].text()).toBe('At least one contact is required');
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
    field.access = 'disabled';
    await nextTick();

    expect(wrapper.find('label').text()).toBe('b');
    expect(wrapper.find('input').attributes('disabled')).toBe('');
  });
});
