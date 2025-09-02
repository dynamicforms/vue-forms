/* eslint-disable max-classes-per-file */
import { computed, ComputedRef, Ref, unref } from 'vue';

/**
 * Marks content for markdown rendering
 */
export class MdString extends String {}

/**
 * Interface for custom component content definition
 */
export interface SimpleComponentDef {
  componentName: string;
  componentProps?: Record<any, any>;
  componentVHtml?: string;
}

/**
 * Type for different renderable content formats: plain string, markdown, or custom component
 */
export type RenderContent = string | MdString | SimpleComponentDef;
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

/**
 * Base validation error class with component rendering capabilities
 */
/* eslint-disable class-methods-use-this */
export class ValidationError {
  get componentName() { return 'Comment'; }

  get componentBindings() { return {}; }

  get componentBody() { return ''; }
}

/**
 * Simple text-only ValidationError
 */
export class ValidationErrorText extends ValidationError {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  get componentName() { return 'template'; }

  get componentBody() { return this.text; }
}
/* eslint-enable class-methods-use-this */

/**
 * Validation error that supports multiple content types (plain text, markdown, component)
 */
export class ValidationErrorRenderContent extends ValidationError {
  private text: RenderContent | Ref<RenderContent>;

  private textType: ComputedRef<'string' | 'md' | 'component'>;

  constructor(text: RenderContentRef) {
    super();
    this.text = text;
    this.textType = computed(() => this.getTextType);
  }

  get getTextType() {
    const msg = unref(this.text);
    if (!msg) return 'string';
    if (msg instanceof MdString) return 'md';
    if (isSimpleComponentDef(msg)) return 'component';
    return 'string';
  }

  get componentName() {
    switch (unref(this.textType)) {
    case 'string': return 'template';
    case 'md': return 'vue-markdown';
    case 'component': return (unref(this.text) as SimpleComponentDef).componentName;
    default: return 'template';
    }
  }

  get componentBindings() {
    switch (unref(this.textType)) {
    case 'string': return { };
    case 'md': return { source: this.text.toString() };
    case 'component': return (unref(this.text) as SimpleComponentDef).componentProps || { };
    default: return { };
    }
  }

  get componentBody() {
    switch (unref(this.textType)) {
    case 'string': return unref(this.text) as string;
    case 'component': return (unref(this.text) as SimpleComponentDef).componentVHtml || '';
    default: return '';
    }
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
