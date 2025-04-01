/* eslint-disable max-classes-per-file */
import { computed, ComputedRef, Ref, toRef, unref } from 'vue';

/**
 * Marks content for markdown rendering
 */
export class MdString extends String {}

/**
 * Interface for custom component content definition
 */
export interface CustomModalContentComponentDef {
  componentName: string;
  componentProps: Record<any, any>;
}

/**
 * Type for different renderable content formats: plain string, markdown, or custom component
 */
export type RenderContent = string | MdString | CustomModalContentComponentDef;
/**
 * Type for different renderable content formats (supporting references): plain string, markdown, or custom component
 */
export type RenderContentRef = RenderContent | Ref<RenderContent>;

/**
 * Type guard to check if content is a custom component definition
 * @param msg - Content to check
 * @returns True if content is a custom component definition
 */
export function isCustomModalContentComponentDef(msg?: RenderContentRef): msg is CustomModalContentComponentDef {
  const uMsg = unref(msg);
  return typeof uMsg === 'object' && 'componentName' in uMsg;
}

/**
 * Base validation error class with component rendering capabilities
 */
export class ValidationError {
  get componentName() { return 'Comment'; } // eslint-disable-line class-methods-use-this

  get componentBindings() { return {}; } // eslint-disable-line class-methods-use-this

  get componentBody() { return ''; } // eslint-disable-line class-methods-use-this
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

  get componentName() { return 'template'; } // eslint-disable-line class-methods-use-this

  get componentBody() { return this.text; }
}

/**
 * Validation error that supports multiple content types (plain text, markdown, component)
 */
export class ValidationErrorRenderContent extends ValidationError {
  text: Ref<RenderContent>;

  textType: ComputedRef<'string' | 'md' | 'component'>;

  constructor(text: RenderContentRef) {
    super();
    this.text = toRef(text);
    this.textType = computed(() => this.getTextType);
  }

  get getTextType() {
    const msg = this.text.value;
    if (!msg) return 'string';
    if (msg instanceof MdString) return 'md';
    if (isCustomModalContentComponentDef(msg)) return 'component';
    return 'string';
  }

  get componentName() {
    switch (this.textType.value) {
    case 'string': return 'template';
    case 'md': return 'vue-markdown';
    case 'component': return (this.text.value as CustomModalContentComponentDef).componentName;
    default: return 'template';
    }
  }

  get componentBindings() {
    switch (this.textType.value) {
    case 'string': return { };
    case 'md': return { source: this.text };
    case 'component': return (this.text.value as CustomModalContentComponentDef).componentProps;
    default: return { };
    }
  }

  get componentBody() {
    switch (this.textType.value) {
    case 'string': return this.text.value as string;
    default: return '';
    }
  }
}

/** ********************************************************************************************************************
 *
 at some point there will be classes here that will support links or action buttons or something even more complex
 *
 ******************************************************************************************************************** */
