import { computed, ComputedRef, Ref, unref } from 'vue';

/**
 * Marks content for markdown rendering
 */
export class MdString extends String {
  plugins?: any[];
  options?: any;

  constructor(value: string, options?: any, plugins?: any[]) {
    super(value);
    this.plugins = plugins;
    this.options = options;
  }
}

/**
 * Interface for custom component content definition
 */
export interface SimpleComponentDef {
  componentName: string;
  componentProps?: Record<any, any>;
  componentVHtml?: string;
}

export type RenderContentNonCallable = string | MdString | SimpleComponentDef;
export type RenderContentCallable = () => RenderContentNonCallable;
/**
 * Type for different renderable content formats: plain string, markdown, or custom component
 */
export type RenderContent = RenderContentNonCallable | RenderContentCallable;
/**
 * Type for different renderable content formats (supporting references): plain string, markdown, or custom component
 */
export type RenderContentRef = RenderContent | Ref<RenderContent>;

/**
 * Type guard to check if content is a custom component definition
 * @param msg - Content to check
 * @returns True if content is a custom component definition
 */
export function isSimpleComponentDef(msg?: RenderContentRef): msg is SimpleComponentDef {
  const uMsg = unref(msg);
  return typeof uMsg === 'object' && 'componentName' in uMsg;
}

export function isCallableFunction(msg?: RenderContentRef): msg is RenderContentCallable {
  return typeof unref(msg) === 'function';
}

/**
 * Base validation error class with component rendering capabilities
 */

export class ValidationError {
  get componentName() {
    return 'Comment';
  }

  get componentBindings() {
    return {};
  }

  get componentBody() {
    return '';
  }

  get extraClasses() {
    return '';
  }
}

/**
 * Simple text-only ValidationError
 */
export class ValidationErrorText extends ValidationError {
  constructor(
    public text: string,
    public classes: string = '',
  ) {
    super();
  }

  get componentName() {
    return 'template';
  }

  get componentBody() {
    return this.text;
  }

  get extraClasses() {
    return this.classes;
  }
}

/**
 * Validation error that supports multiple content types (plain text, markdown, component)
 */
export class ValidationErrorRenderContent extends ValidationError {
  private text: RenderContent | Ref<RenderContent>;

  private textType: ComputedRef<'string' | 'md' | 'component'>;

  constructor(
    text: RenderContentRef,
    public classes: string = '',
  ) {
    super();
    this.text = text;
    this.textType = computed(() => this.getTextType);
  }

  get resolvedText() {
    const text = unref(this.text);
    return isCallableFunction(text) ? text() : text;
  }

  get getTextType() {
    const msg = this.resolvedText;

    if (!msg) return 'string';
    if (msg instanceof MdString) return 'md';
    if (isSimpleComponentDef(msg)) return 'component';
    return 'string';
  }

  get componentName() {
    switch (unref(this.textType)) {
      case 'string':
        return 'template';
      case 'md':
        return 'vue-markdown';
      case 'component':
        return (this.resolvedText as SimpleComponentDef).componentName;
      default:
        return 'template';
    }
  }

  get componentBindings() {
    switch (unref(this.textType)) {
      case 'string':
        return {};
      case 'md': {
        const text = this.resolvedText as MdString;
        return { source: text.toString(), options: text.options, plugins: text.plugins };
      }
      case 'component':
        return (this.resolvedText as SimpleComponentDef).componentProps || {};
      default:
        return {};
    }
  }

  get componentBody() {
    switch (unref(this.textType)) {
      case 'string':
        return this.resolvedText as string;
      case 'component':
        return (this.resolvedText as SimpleComponentDef).componentVHtml || '';
      default:
        return '';
    }
  }

  get extraClasses() {
    return this.classes;
  }
}

/**
 * A value, renderable three different ways (plain text, markdown, component) - alias for ValidationErrorRenderContent
 */
export class RenderableValue extends ValidationErrorRenderContent {}

/** ********************************************************************************************************************
 *
 at some point there will be classes here that will support links or action buttons or something even more complex
 *
 ******************************************************************************************************************** */
