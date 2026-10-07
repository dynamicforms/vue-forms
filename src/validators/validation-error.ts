import { isEqual } from 'lodash-es';
import { computed, ComputedRef, Ref, unref } from 'vue';

import { getConfig } from '../config';

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

export type ClassType = string | string[] | Record<string, boolean>;
export type ClassTypes = ClassType | ClassType[];

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
  // typeof null is 'object', and `in` refuses null: the answer for it is that it defines no component
  return typeof uMsg === 'object' && uMsg !== null && 'componentName' in uMsg;
}

export function isCallableFunction(msg?: RenderContentRef): msg is RenderContentCallable {
  return typeof unref(msg) === 'function';
}

/**
 * Where an error comes from. `'validator'` is an error a validator produced, `'server'` one the server returned and
 * `'application'` one the application's own code computed and wrote into `errors`. Any other string is an origin of
 * the application's own.
 */
export type ErrorOrigin = 'validator' | 'server' | 'application' | (string & {});

/**
 * What an error states apart from how it reads: what failed, the values it failed with, and an English sentence
 * saying so. It has the shape of an error a `@dynamicforms/fastapi-viewsets` server returns - `detail_code`,
 * `detail_params` and `detail` - so an application renders the errors of its validators and of its server through
 * one function, `errorText` in the configuration.
 */
export interface ErrorDescription {
  /** Machine-readable identifier of what failed, in snake_case. */
  readonly code: string;
  /** The values the failure is stated with, such as `minValue` for `min_value`. */
  readonly params: Readonly<Record<string, unknown>>;
  /** The failure in English, with `params` substituted. */
  readonly detail: string;
  /** Where the error comes from; see `ValidationError.origin`. */
  readonly origin: ErrorOrigin;
}

/**
 * Base validation error class with component rendering capabilities
 */

export class ValidationError {
  /**
   * @param code Machine-readable identifier of what failed, in snake_case. Every validator this library ships states
   * one, so code that reacts to a particular failure does not have to match the message text. It is optional: an
   * error built by hand carries whatever its author gives it, or nothing.
   * @param statedOrigin Where the error comes from, where its author states it; see `origin`.
   * @param params The values the failure is stated with, such as `minValue` for `min_value`.
   */
  constructor(
    public code?: string,
    private readonly statedOrigin?: ErrorOrigin,
    public readonly params: Readonly<Record<string, unknown>> = {},
  ) {}

  /**
   * Where the error comes from: the origin its author stated, and otherwise `'validator'` for an error a validator
   * produced - a validator stamps every error it hands a field - and `'application'` for one written into `errors`
   * by any other code. It is what a rendering layer reads to decide when to show the error, and what code reads to
   * withdraw the errors of one origin and leave the rest.
   */
  get origin(): ErrorOrigin {
    if (this.statedOrigin !== undefined) return this.statedOrigin;
    return typeof (this as { source?: unknown }).source === 'symbol' ? 'validator' : 'application';
  }

  /**
   * True where `other` is an error of this class that renders exactly as this one does and reports the same code.
   * Two runs of one validator over an unchanged value produce two instances of one message, and this is what lets
   * the validator hand the field back the instance it already holds rather than a fresh one: an equal error is not
   * a new error, and nothing re-renders over a verdict that did not move.
   *
   * The comparison is over what renders - the component, its bindings, its body and the classes - because that is
   * what a reader of `field.errors` sees. A structural comparison of the errors themselves answers nothing useful:
   * `ValidationErrorRenderContent` holds a Vue `computed`, and two of those are never structurally equal.
   */
  sameAs(other: ValidationError): boolean {
    return (
      Object.getPrototypeOf(this) === Object.getPrototypeOf(other) &&
      this.code === other.code &&
      this.statedOrigin === other.statedOrigin &&
      this.componentName === other.componentName &&
      isEqual(this.componentBody, other.componentBody) &&
      isEqual(this.componentBindings, other.componentBindings) &&
      isEqual(this.extraClasses, other.extraClasses)
    );
  }

  get componentName() {
    return 'Comment';
  }

  get componentBindings() {
    return {};
  }

  get componentBody() {
    return '';
  }

  get extraClasses(): ClassTypes {
    return '';
  }
}

/**
 * Simple text-only ValidationError
 */
export class ValidationErrorText extends ValidationError {
  constructor(
    public text: string,
    public classes: ClassTypes = '',
    code?: string,
    origin?: ErrorOrigin,
    params?: Readonly<Record<string, unknown>>,
  ) {
    super(code, origin, params);
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
    public classes: ClassTypes = '',
    code?: string,
    origin?: ErrorOrigin,
    params?: Readonly<Record<string, unknown>>,
  ) {
    super(code, origin, params);
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
 * An error stated as an `ErrorDescription`. It reads as what `errorText` in the configuration answers for it, and as
 * its English `detail` where `errorText` is not set or answers `undefined`. Every built-in validator reports its
 * failures this way, unless it is given a message of its own.
 */
export class ValidationErrorDescription extends ValidationErrorRenderContent implements ErrorDescription {
  declare code: string;

  constructor(
    code: string,
    params: Readonly<Record<string, unknown>>,
    public readonly detail: string,
    classes: ClassTypes = '',
    origin?: ErrorOrigin,
  ) {
    super(detail, classes, code, origin, params);
  }

  get resolvedText() {
    return getConfig().errorText?.(this) ?? this.detail;
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
