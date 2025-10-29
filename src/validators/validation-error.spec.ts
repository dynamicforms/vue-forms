import { describe, expect, it } from 'vitest';
import { reactive, ref } from 'vue';

import {
    MdString,
    SimpleComponentDef,
    ValidationError,
    ValidationErrorText,
    ValidationErrorRenderContent,
    isSimpleComponentDef,
    RenderableValue,
    isCallableFunction,
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

    expect(error.componentName).toBe('template');
    expect(error.componentBody).toBe('Plain text error');
    expect(error.componentBindings).toEqual({});
  });

  it('handles reactive object automatic unRef-fing', () => {
    const error = reactive(new RenderableValue('Plain text error'));

    expect(error.componentName).toBe('template');
    expect(error.componentBody).toBe('Plain text error');
    expect(error.componentBindings).toEqual({});
  });

  it('handles markdown string content', () => {
    const mdContent = new MdString('**Bold** error message');
    const error = new ValidationErrorRenderContent(mdContent);

    expect(error.componentName).toBe('vue-markdown');
    expect(error.componentBody).toBe('');
    expect(error.componentBindings).toHaveProperty('source');
  });

  it('handles component content', () => {
    const componentDef: SimpleComponentDef = {
      componentName: 'CustomError',
      componentProps: { type: 'danger', dismissible: true },
    };

    const error = new ValidationErrorRenderContent(componentDef);

    expect(error.componentName).toBe('CustomError');
    expect(error.componentBody).toBe('');
    expect(error.componentBindings).toEqual({ type: 'danger', dismissible: true });
  });

  it('handles reactive content', () => {
    const contentRef = ref('Initial error');
    const error = new ValidationErrorRenderContent(contentRef);

    expect(error.componentBody).toBe('Initial error');
    expect(error.componentName).toBe('template');

    // Change the reactive content
    contentRef.value = 'Updated error';
    expect(error.componentBody).toBe('Updated error');
  });

  it('handles empty content gracefully', () => {
    const error = new ValidationErrorRenderContent('');

    expect(error.componentName).toBe('template');
    expect(error.componentBody).toBe('');
  });
});

describe('isCustomModalContentComponentDef', () => {
  it('correctly identifies component definitions', () => {
    const componentDef: SimpleComponentDef = {
      componentName: 'CustomAlert',
      componentProps: {},
    };

    expect(isSimpleComponentDef(componentDef)).toBe(true);
    expect(isSimpleComponentDef('string')).toBe(false);
    expect(isSimpleComponentDef(new MdString('markdown'))).toBe(false);
    expect(isSimpleComponentDef(undefined)).toBe(false);
  });

  it('works with reactive references', () => {
    const componentDef = ref({
      componentName: 'CustomAlert',
      componentProps: {},
    });

    expect(isSimpleComponentDef(componentDef)).toBe(true);

    const stringRef = ref('string value');
    expect(isSimpleComponentDef(stringRef)).toBe(false);
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

describe('ValidationErrorRenderContent with callable functions', () => {
    it('handles callable function that returns plain string', () => {
        const contentFn = () => 'Dynamic error message';
        const error = new ValidationErrorRenderContent(contentFn);

        expect(error.componentName).toBe('template');
        expect(error.componentBody).toBe('Dynamic error message');
        expect(error.componentBindings).toEqual({});
    });

    it('handles callable function that returns MdString', () => {
        const contentFn = () => new MdString('**Dynamic** markdown');
        const error = new ValidationErrorRenderContent(contentFn);

        expect(error.componentName).toBe('vue-markdown');
        expect(error.componentBody).toBe('');
        expect(error.componentBindings).toHaveProperty('source', '**Dynamic** markdown');
    });

    it('handles callable function that returns component definition', () => {
        const contentFn = () => ({
            componentName: 'DynamicAlert',
            componentProps: { severity: 'error' },
            componentVHtml: '<strong>Error</strong>',
        });
        const error = new ValidationErrorRenderContent(contentFn);

        expect(error.componentName).toBe('DynamicAlert');
        expect(error.componentBindings).toEqual({ severity: 'error' });
        expect(error.componentBody).toBe('<strong>Error</strong>');
    });

    it('handles reactive ref containing callable function', () => {
        const contentFn = () => 'Translated message';
        const contentRef = ref(contentFn);
        const error = new ValidationErrorRenderContent(contentRef);

        expect(error.componentBody).toBe('Translated message');
    });

    it('evaluates callable function on each access (useful for translations)', () => {
        let counter = -1;
        const contentFn = () => `Error count: ${++counter}`;
        const error = new ValidationErrorRenderContent(contentFn);

        expect(error.componentBody).toBe('Error count: 1');
        expect(error.componentBody).toBe('Error count: 2');
        expect(error.componentBody).toBe('Error count: 3');
    });

    it('handles callable function with translation example', () => {
        const t = (key: string) => {
            const translations: Record<string, string> = {
                'error.required': 'This field is required',
                'error.invalid': 'Invalid value',
            };
            return translations[key] || key;
        };

        const error = new ValidationErrorRenderContent(() => t('error.required'));
        expect(error.componentBody).toBe('This field is required');
    });
});

describe('isCallableFunction', () => {
    it('correctly identifies callable functions', () => {
        const fn = () => 'test';
        expect(isCallableFunction(fn)).toBe(true);
        expect(isCallableFunction('string')).toBe(false);
        expect(isCallableFunction(new MdString('markdown'))).toBe(false);
        expect(isCallableFunction({ componentName: 'Test' })).toBe(false);
        expect(isCallableFunction(undefined)).toBe(false);
    });

    it('works with reactive references containing functions', () => {
        const fnRef = ref(() => 'test');
        expect(isCallableFunction(fnRef)).toBe(true);

        const stringRef = ref('string value');
        expect(isCallableFunction(stringRef)).toBe(false);
    });
});
