import { mount } from '@vue/test-utils';

import { ValidationError, ValidationErrorText, ValidationErrorRenderContent, MdString } from '../validators';

import MessagesWidget from './messages-widget.vue';

// Mock VueMarkdown component
const MockVueMarkdown = {
  name: 'VueMarkdown',
  props: ['source', 'class'],
  template: '<div class="vue-markdown-mock" :class="$props.class">{{ source }}</div>',
};

describe('MessagesWidget', () => {
  it('renders simple message when provided', () => {
    const wrapper = mount(MessagesWidget, { props: { message: 'Simple error message' } });

    expect(wrapper.text()).toBe('Simple error message');
    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.find('span').classes()).toContain('text-error');
  });

  it('renders simple message with custom classes', () => {
    const wrapper = mount(MessagesWidget, {
      props: {
        message: 'Error with custom class',
        classes: 'custom-error-class',
      },
    });

    expect(wrapper.find('span').classes()).toContain('custom-error-class');
  });

  it('renders errors when message is ValidationError array', () => {
    const errors = [
      new ValidationErrorText('First error', 'error-class-1'),
      new ValidationErrorText('Second error', 'error-class-2'),
    ];

    const wrapper = mount(MessagesWidget, { props: { message: errors } });

    const divs = wrapper.findAll('div');
    expect(divs).toHaveLength(2);
    expect(divs[0].text()).toBe('First error');
    expect(divs[1].text()).toBe('Second error');
    expect(divs[0].classes()).toContain('text-error');
    expect(divs[0].classes()).toContain('error-class-1');
    expect(divs[1].classes()).toContain('error-class-2');
  });

  it('renders markdown content as div when VueMarkdown component is not registered', () => {
    const mdContent = new MdString('**Bold** markdown content');
    const errors = [new ValidationErrorRenderContent(mdContent)];

    const wrapper = mount(MessagesWidget, { props: { message: errors } });

    const div = wrapper.find('div');
    expect(div.exists()).toBe(true);
    expect(div.text()).toBe('**Bold** markdown content');
    expect(div.classes()).toContain('text-error');
  });

  it('renders markdown content using VueMarkdown when component is registered', () => {
    const mdContent = new MdString('**Bold** markdown content');
    const errors = [new ValidationErrorRenderContent(mdContent)];

    const wrapper = mount(MessagesWidget, {
      props: { message: errors },
      global: { components: { VueMarkdown: MockVueMarkdown } },
    });

    const markdownDiv = wrapper.find('.vue-markdown-mock');
    expect(markdownDiv.exists()).toBe(true);
    expect(markdownDiv.text()).toBe('**Bold** markdown content');
    expect(markdownDiv.classes()).toContain('text-error');
    expect(markdownDiv.classes()).toContain('df-messages-widget-markdown');
  });

  it('renders custom component with bindings', () => {
    class CustomError extends ValidationError {
      // eslint-disable-next-line class-methods-use-this
      get componentName() { return 'custom-alert'; }

      // eslint-disable-next-line class-methods-use-this
      get componentBindings() { return { type: 'warning', dismissible: true }; }

      // eslint-disable-next-line class-methods-use-this
      get componentBody() { return 'Custom error content'; }

      // eslint-disable-next-line class-methods-use-this
      get extraClasses() { return 'custom-class'; }
    }

    const errors = [new CustomError()];

    const wrapper = mount(MessagesWidget, { props: { message: errors } });

    // Since we don't register the custom-alert component, Vue will render it as a custom element
    // We can check if the component was created with the right props by examining the vnode
    expect(wrapper.html()).toContain('Custom error content');
  });

  it('handles multiple mixed error types', () => {
    const mdContent = new MdString('Markdown **error**');
    const errors = [
      new ValidationErrorText('Plain text error'),
      new ValidationErrorRenderContent(mdContent),
    ];

    const wrapper = mount(MessagesWidget, {
      props: { message: errors },
      global: { components: { VueMarkdown: MockVueMarkdown } },
    });

    const textDiv = wrapper.find('div');
    const markdownDiv = wrapper.find('.vue-markdown-mock');

    expect(textDiv.text()).toContain('Plain text error');
    expect(markdownDiv.text()).toBe('Markdown **error**');
  });

  it('handles array of classes', () => {
    const wrapper = mount(MessagesWidget, {
      props: {
        message: 'Test message',
        classes: ['class1', 'class2'],
      },
    });

    const span = wrapper.find('span');
    expect(span.classes()).toContain('class1');
    expect(span.classes()).toContain('class2');
  });

  it('handles object classes', () => {
    const wrapper = mount(MessagesWidget, {
      props: {
        message: 'Test message',
        classes: { active: true, inactive: false },
      },
    });

    const span = wrapper.find('span');
    expect(span.classes()).toContain('active');
    expect(span.classes()).not.toContain('inactive');
  });

  it('handles empty errors array', () => {
    const wrapper = mount(MessagesWidget, { props: { message: [] } });

    expect(wrapper.text()).toBe('');
    expect(wrapper.findAll('div')).toHaveLength(0);
  });

  it('applies CSS styles correctly', () => {
    const mdContent = new MdString('Markdown content');
    const errors = [new ValidationErrorRenderContent(mdContent)];

    const wrapper = mount(MessagesWidget, {
      props: { message: errors },
      global: { components: { VueMarkdown: MockVueMarkdown } },
    });

    const markdownDiv = wrapper.find('.df-messages-widget-markdown');
    expect(markdownDiv.exists()).toBe(true);
  });
});
