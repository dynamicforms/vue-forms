import { computed, ComputedRef, Ref, unref } from 'vue';

/** A string to be rendered as markdown, through the globally registered `vue-markdown` component. */
export class MdString extends String {
  plugins?: any[];
  options?: any;

  constructor(value: string, options?: any, plugins?: any[]) {
    super(value);
    this.plugins = plugins;
    this.options = options;
  }
}

/** A component to render content with: its name, its props and an optional body set as its inner HTML. */
export interface SimpleComponentDef {
  componentName: string;
  componentProps?: Record<any, any>;
  componentVHtml?: string;
}

export type ClassType = string | string[] | Record<string, boolean>;
export type ClassTypes = ClassType | ClassType[];

export type RenderContentNonCallable = string | MdString | SimpleComponentDef;
export type RenderContentCallable = () => RenderContentNonCallable;
/** Content in one of three forms - plain text, markdown or a component - or a function answering one. */
export type RenderContent = RenderContentNonCallable | RenderContentCallable;
/** `RenderContent`, or a reference to it. */
export type RenderContentRef = RenderContent | Ref<RenderContent>;

/** True where `content` names a component to render it with. */
export function isSimpleComponentDef(content?: RenderContentRef): content is SimpleComponentDef {
  const value = unref(content);
  // typeof null is 'object', and `in` refuses null: the answer for it is that it defines no component
  return typeof value === 'object' && value !== null && 'componentName' in value;
}

/** True where `content` is a function answering the content. */
export function isCallableFunction(content?: RenderContentRef): content is RenderContentCallable {
  return typeof unref(content) === 'function';
}

/** Which of the three forms content takes. */
export type RenderContentKind = 'string' | 'md' | 'component';

/**
 * Content with the CSS classes it is rendered with, described as what renders it: `componentName`, its
 * `componentBindings`, its `componentBody` and its `extraClasses`. `MessagesWidget` renders it, and so does any
 * component that reads those four members. A reference or a function as the content is read on every render, so what
 * it answers reaches the screen without the value being built again.
 */
export class RenderableValue {
  // an ordinary property rather than a #private one: an error is read through the reactive proxy of the array that
  // holds it, and a #private member read through a proxy throws. The proxy also unwraps the ref, hence unref on read
  private readonly kindRef: ComputedRef<RenderContentKind>;

  constructor(
    private readonly content: RenderContentRef = '',
    public classes: ClassTypes = '',
  ) {
    this.kindRef = computed(() => {
      const resolved = this.resolvedText;
      if (resolved instanceof MdString) return 'md';
      if (isSimpleComponentDef(resolved)) return 'component';
      return 'string';
    });
  }

  /** The content as it reads now: a reference unwrapped and a function called. */
  get resolvedText(): RenderContentNonCallable {
    const content = unref(this.content);
    return isCallableFunction(content) ? content() : content;
  }

  /** Which of the three forms the content takes now. */
  get kind(): RenderContentKind {
    return unref(this.kindRef);
  }

  get componentName(): string {
    switch (this.kind) {
      case 'md':
        return 'vue-markdown';
      case 'component':
        return (this.resolvedText as SimpleComponentDef).componentName;
      default:
        return 'template';
    }
  }

  get componentBindings(): Record<string, any> {
    switch (this.kind) {
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

  get componentBody(): string {
    switch (this.kind) {
      case 'md':
        return '';
      case 'component':
        return (this.resolvedText as SimpleComponentDef).componentVHtml || '';
      default:
        return (this.resolvedText as string) || '';
    }
  }

  get extraClasses(): ClassTypes {
    return this.classes;
  }
}
