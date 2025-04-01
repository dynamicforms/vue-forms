import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import {
  MdString,
  CustomModalContentComponentDef,
  ValidationError,
  ValidationErrorText,
  ValidationErrorRenderContent,
  isCustomModalContentComponentDef,
} from './validation-error';

describe('ValidationError', () => {
  it('has default component properties', () => {
    const error = new ValidationError();

    expect(error.componentName).toBe('Comment');
    expect(error.componentBindings).toEqual({});
    expect(error.componentBody).toBe('');
  });
});

describe('ValidationErrorText', () => {
  it('stores and provides text message', () => {
    const error = new ValidationErrorText('Test error message');

    expect(error.text).toBe('Test error message');
    expect(error.componentName).toBe('template');
    expect(error.componentBody).toBe('Test error message');
    expect(error.componentBindings).toEqual({});
  });
});

describe('ValidationErrorRenderContent', () => {
  it('handles plain string content', () => {
    const error = new ValidationErrorRenderContent('Plain text error');

    expect(error.text.value).toBe('Plain text error');
    expect(error.textType.value).toBe('string');
    expect(error.componentName).toBe('template');
    expect(error.componentBody).toBe('Plain text error');
    expect(error.componentBindings).toEqual({});
  });

  it('handles markdown string content', () => {
    const mdContent = new MdString('**Bold** error message');
    const error = new ValidationErrorRenderContent(mdContent);

    expect(error.text.value).toBe(mdContent);
    expect(error.textType.value).toBe('md');
    expect(error.componentName).toBe('vue-markdown');
    expect(error.componentBody).toBe('');
    expect(error.componentBindings).toHaveProperty('source');
  });

  it('handles component content', () => {
    const componentDef: CustomModalContentComponentDef = {
      componentName: 'CustomError',
      componentProps: { type: 'danger', dismissible: true },
    };

    const error = new ValidationErrorRenderContent(componentDef);

    expect(error.text.value).toStrictEqual(componentDef);
    expect(error.textType.value).toBe('component');
    expect(error.componentName).toBe('CustomError');
    expect(error.componentBody).toBe('');
    expect(error.componentBindings).toEqual({ type: 'danger', dismissible: true });
  });

  it('handles reactive content', () => {
    const contentRef = ref('Initial error');
    const error = new ValidationErrorRenderContent(contentRef);

    expect(error.text.value).toBe('Initial error');
    expect(error.textType.value).toBe('string');

    // Change the reactive content
    contentRef.value = 'Updated error';
    expect(error.text.value).toBe('Updated error');
  });

  it('handles empty content gracefully', () => {
    const error = new ValidationErrorRenderContent('');

    expect(error.text.value).toBe('');
    expect(error.textType.value).toBe('string');
    expect(error.componentName).toBe('template');
    expect(error.componentBody).toBe('');
  });
});

describe('isCustomModalContentComponentDef', () => {
  it('correctly identifies component definitions', () => {
    const componentDef: CustomModalContentComponentDef = {
      componentName: 'CustomAlert',
      componentProps: {},
    };

    expect(isCustomModalContentComponentDef(componentDef)).toBe(true);
    expect(isCustomModalContentComponentDef('string')).toBe(false);
    expect(isCustomModalContentComponentDef(new MdString('markdown'))).toBe(false);
    expect(isCustomModalContentComponentDef(undefined)).toBe(false);
  });

  it('works with reactive references', () => {
    const componentDef = ref({
      componentName: 'CustomAlert',
      componentProps: {},
    });

    expect(isCustomModalContentComponentDef(componentDef)).toBe(true);

    const stringRef = ref('string value');
    expect(isCustomModalContentComponentDef(stringRef)).toBe(false);
  });
});

describe('MdString', () => {
  it('extends String with proper instance checking', () => {
    const mdString = new MdString('**Bold text**');

    expect(mdString).toBeInstanceOf(MdString);
    expect(mdString).toBeInstanceOf(String);
    expect(mdString.toString()).toBe('**Bold text**');
  });
});
