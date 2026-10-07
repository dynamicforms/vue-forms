import { isEqual } from 'lodash-es';

import { getConfig } from '../config';
import { ClassTypes, RenderableValue, RenderContentRef } from '../render-content';

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
 * An error a field carries: content rendered as plain text, markdown or a component, as any `RenderableValue` is,
 * together with what a program reads off it - the `code` of what failed, the `params` it failed with and its
 * `origin`.
 */
export class ValidationError extends RenderableValue {
  /**
   * @param content What the error reads as: plain text, an `MdString` or a component, a reference to one of those or
   * a function answering one.
   * @param classes CSS classes the error is rendered with.
   * @param code Machine-readable identifier of what failed, in snake_case. Every validator this library ships states
   * one, so code that reacts to a particular failure does not have to match the message text. It is optional: an
   * error built by hand carries whatever its author gives it, or nothing.
   * @param statedOrigin Where the error comes from, where its author states it; see `origin`.
   * @param params The values the failure is stated with, such as `minValue` for `min_value`.
   */
  constructor(
    content?: RenderContentRef,
    classes: ClassTypes = '',
    public code?: string,
    private readonly statedOrigin?: ErrorOrigin,
    public readonly params: Readonly<Record<string, unknown>> = {},
  ) {
    super(content, classes);
  }

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
   * an error holds a Vue `computed`, and two of those are never structurally equal.
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
}

/**
 * An error stated as an `ErrorDescription`. It reads as what `errorText` in the configuration answers for it, and as
 * its English `detail` where `errorText` is not set or answers `undefined`. Every built-in validator reports its
 * failures this way, unless it is given a message of its own.
 */
export class ValidationErrorDescription extends ValidationError implements ErrorDescription {
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
