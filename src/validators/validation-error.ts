import { isEqual } from 'lodash-es';

/**
 * The source of an error. `'validator'` is an error a validator produced, `'server'` one the server returned and
 * `'application'` one the application's code computed and wrote into `errors`. Any other string is an
 * application-defined origin.
 */
export type ErrorOrigin = 'validator' | 'server' | 'application' | (string & {});

/**
 * The content of an error: what failed, the values it failed with, an English sentence describing it, and its
 * origin. It has the shape of an error a `@dynamicforms/fastapi-viewsets` server returns (`detail_code`,
 * `detail_params` and `detail`), so a renderer converts validator and server errors to text with one function.
 */
export interface ErrorDescription {
  /** Machine-readable identifier of what failed, in snake_case. */
  readonly code: string;
  /** The values of the failure, such as `minValue` for `min_value`. */
  readonly params: Readonly<Record<string, unknown>>;
  /** The failure in English, plain text, with `params` substituted. */
  readonly detail: string;
  /** The origin of the error; see `ValidationError.origin`. */
  readonly origin: ErrorOrigin;
}

/**
 * An error on an element. It is data: the library does not render it. A renderer chooses the text for `code` and
 * `params` and falls back to `detail`.
 */
export class ValidationError implements ErrorDescription {
  /**
   * @param code Machine-readable identifier of what failed, in snake_case.
   * @param params The values of the failure, such as `minValue` for `min_value`.
   * @param detail The failure in English, plain text. Stored as given.
   * @param statedOrigin The origin of the error, if its author sets it; see `origin`.
   */
  constructor(
    public readonly code: string,
    public readonly params: Readonly<Record<string, unknown>>,
    public readonly detail: string,
    private readonly statedOrigin?: ErrorOrigin,
  ) {}

  /**
   * The origin its author set. Otherwise `'validator'` for an error a validator produced (a validator stamps every
   * error it puts on a field) and `'application'` for one written into `errors` by any other code.
   */
  get origin(): ErrorOrigin {
    if (this.statedOrigin !== undefined) return this.statedOrigin;
    return typeof (this as { source?: unknown }).source === 'symbol' ? 'validator' : 'application';
  }

  /**
   * True if `other` has the same class, code, params, detail and stated origin. If a new run produces an error for
   * which this is true, the validator keeps the instance the field already holds, so an unchanged error is not
   * replaced in `field.errors`.
   */
  sameAs(other: ValidationError): boolean {
    return (
      Object.getPrototypeOf(this) === Object.getPrototypeOf(other) &&
      this.code === other.code &&
      this.detail === other.detail &&
      this.statedOrigin === other.statedOrigin &&
      isEqual(this.params, other.params)
    );
  }
}
