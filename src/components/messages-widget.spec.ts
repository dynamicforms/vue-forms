import { mount } from '@vue/test-utils';
import MarkdownItAttrs from 'markdown-it-attrs';
import { vi } from 'vitest';
import VueMarkdown from 'vue-markdown-render';

import { ValidationError, ValidationErrorText, ValidationErrorRenderContent, MdString } from '../validators';

import MessagesWidget from './messages-widget.vue';

// Mock VueMarkdown component
const MockVueMarkdown = {
  name: 'VueMarkdown',
  props: ['source', 'class'],
  template: '<div class="vue-markdown-mock" :class="$props.class">{{ source }}</div>',
};

const MockCustomAlert = {
  name: 'CustomAlert',
  props: ['type', 'dismissible'],
  template: '<div class="custom-alert-mock" :type="$props.type" :dismissible="$props.dismissible"></div>',
};

function buildMockWrapper(props: any) {
  return mount(MessagesWidget, {
    props,
    global: { components: { VueMarkdown: MockVueMarkdown, CustomAlert: MockCustomAlert } },
  });
}

function buildWrapper(props: any) {
  return mount(MessagesWidget, {
    props,
    global: { components: { VueMarkdown, CustomAlert: MockCustomAlert } },
  });
}

describe('MessagesWidget', () => {
  it('renders simple hint message when provided', () => {
    const wrapper = buildMockWrapper({ message: 'Simple hint message' });

    expect(wrapper.text()).toBe('Simple hint message');
    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.find('span').classes()).toHaveLength(0);
  });

  it('renders simple error message when provided', () => {
    const wrapper = buildMockWrapper({ message: 'Simple error message', classes: 'text-error' });

    expect(wrapper.text()).toBe('Simple error message');
    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.find('span').classes()).toContain('text-error');
  });

  it('renders simple message with custom classes', () => {
    const wrapper = buildMockWrapper({
      message: 'Error with custom class',
      classes: ['custom-error-class', 'text-error'],
    });

    expect(wrapper.find('span').classes()).toContain('custom-error-class');
  });

  it('renders errors when message is ValidationError array', () => {
    const errors = [
      new ValidationErrorText('First error', 'error-class-1'),
      new ValidationErrorText('Second error', 'error-class-2'),
    ];

    const wrapper = buildMockWrapper({ message: errors, classes: 'text-error' });

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

    const originalWarn = console.warn;
    console.warn = vi.fn(); // Suppresses warnings ([Vue warn]: Failed to resolve component: vue-markdown)

    const wrapper = mount(MessagesWidget, {
      props: { message: errors, classes: 'text-error' },
      global: { components: { VueMarkdown: undefined as any } },
    });

    console.warn = originalWarn;

    const div = wrapper.find('div');
    expect(div.exists()).toBe(true);
    expect(div.text()).toBe('**Bold** markdown content');
    expect(div.classes()).toContain('text-error');
  });

  it('renders markdown content using VueMarkdown when component is registered', () => {
    const mdContent = new MdString('**Bold** markdown content');
    const errors = [new ValidationErrorRenderContent(mdContent)];

    const wrapper = buildWrapper({ message: errors, classes: 'text-error' });

    const markdownDiv = wrapper.find('.df-messages-widget-markdown');

    expect(markdownDiv.exists()).toBe(true);
    expect(markdownDiv.element.innerHTML.replaceAll('\n', '')).toBe('<p><strong>Bold</strong> markdown content</p>');
    expect(markdownDiv.classes()).toContain('text-error');
    expect(markdownDiv.classes()).toContain('df-messages-widget-markdown');
  });

  it('renders markdown content with attributes using VueMarkdown when component is registered', () => {
    const mdContent = new MdString('**Bold** markdown [content](https://example.com){target="_blank"}', undefined, [
      MarkdownItAttrs,
    ]);
    const errors = [new ValidationErrorRenderContent(mdContent)];

    const wrapper = buildWrapper({ message: errors, classes: 'text-error' });
    const markdownDiv = wrapper.find('.df-messages-widget-markdown');
    expect(markdownDiv.exists()).toBe(true);
    expect(markdownDiv.element.innerHTML.replaceAll('\n', '')).toBe(
      '<p><strong>Bold</strong> markdown <a href="https://example.com" target="_blank">content</a></p>',
    );
    expect(markdownDiv.classes()).toContain('text-error');
    expect(markdownDiv.classes()).toContain('df-messages-widget-markdown');
  });

  it('renders custom component with bindings', () => {
    class CustomError extends ValidationError {
      get componentName() {
        return 'custom-alert';
      }

      get componentBindings() {
        return { type: 'warning', dismissible: true };
      }

      get componentBody() {
        return 'Custom error content';
      }

      get extraClasses() {
        return 'custom-class';
      }
    }

    const errors = [new CustomError()];

    const wrapper = buildMockWrapper({ message: errors });

    // Since we don't register the custom-alert component, Vue will render it as a custom element
    // We can check if the component was created with the right props by examining the vnode
    expect(wrapper.html()).toContain('Custom error content');
  });

  it('handles multiple mixed error types', () => {
    const mdContent = new MdString('Markdown **error**');
    const errors = [new ValidationErrorText('Plain text error'), new ValidationErrorRenderContent(mdContent)];

    const wrapper = buildMockWrapper({ message: errors });

    const textDiv = wrapper.find('div');
    const markdownDiv = wrapper.find('.vue-markdown-mock');

    expect(textDiv.text()).toContain('Plain text error');
    expect(markdownDiv.text()).toBe('Markdown **error**');
  });

  it('handles array of classes', () => {
    const wrapper = buildMockWrapper({ message: 'Test message', classes: ['class1', 'class2'] });

    const span = wrapper.find('span');
    expect(span.classes()).toContain('class1');
    expect(span.classes()).toContain('class2');
  });

  it('handles object classes', () => {
    const wrapper = buildMockWrapper({ message: 'Test message', classes: { active: true, inactive: false } });

    const span = wrapper.find('span');
    expect(span.classes()).toContain('active');
    expect(span.classes()).not.toContain('inactive');
  });

  it('handles empty errors array', () => {
    const wrapper = buildMockWrapper({ message: [] });

    expect(wrapper.text()).toBe('');
    expect(wrapper.findAll('div')).toHaveLength(0);
  });

  it('applies CSS styles correctly', () => {
    const mdContent = new MdString('Markdown content');
    const errors = [new ValidationErrorRenderContent(mdContent)];

    const wrapper = buildMockWrapper({ message: errors });

    const markdownDiv = wrapper.find('.df-messages-widget-markdown');
    expect(markdownDiv.exists()).toBe(true);
  });

  it('renders custom component without innerHTML when componentBody is empty', () => {
    const errors = [
      new ValidationErrorRenderContent({
        componentName: 'custom-alert',
        componentProps: { type: 'warning', dismissible: true },
      }),
    ];

    const wrapper = buildMockWrapper({ message: errors });

    // Komponenta se renderira, ampak brez innerHTML
    const customAlert = wrapper.find('.custom-alert-mock');
    expect(customAlert.exists()).toBe(true);
    expect(customAlert.attributes('type')).toBe('warning');
    expect(customAlert.attributes('dismissible')).toBe('true');

    expect(customAlert.element.innerHTML).toBe('');
  });
});
