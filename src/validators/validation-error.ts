import { isEqual } from 'lodash-es';

/**
 * Where an error comes from. `'validator'` is an error a validator produced, `'server'` one the server returned and
 * `'application'` one the application's own code computed and wrote into `errors`. Any other string is an origin of
 * the application's own.
 */
export type ErrorOrigin = 'validator' | 'server' | 'application' | (string & {});

/**
 * What an error states: what failed, the values it failed with, an English sentence saying so, and where it comes
 * from. It has the shape of an error a `@dynamicforms/fastapi-viewsets` server returns - `detail_code`,
 * `detail_params` and `detail` - so a renderer turns the errors of validators and of the server into text through
 * one function.
 */
export interface ErrorDescription {
  /** Machine-readable identifier of what failed, in snake_case. */
  readonly code: string;
  /** The values the failure is stated with, such as `minValue` for `min_value`. */
  readonly params: Readonly<Record<string, unknown>>;
  /** The failure in English, plain text, with `params` substituted. */
  readonly detail: string;
  /** Where the error comes from; see `ValidationError.origin`. */
  readonly origin: ErrorOrigin;
}

/**
 * An error a field carries. It is data: the library does not render it. A renderer chooses the text for `code` and
 * `params` and falls back to `detail`.
 */
export class ValidationError implements ErrorDescription {
  /**
   * @param code Machine-readable identifier of what failed, in snake_case.
   * @param params The values the failure is stated with, such as `minValue` for `min_value`.
   * @param detail The failure in English, plain text. Stored as given.
   * @param statedOrigin Where the error comes from, where its author states it; see `origin`.
   */
  constructor(
    public readonly code: string,
    public readonly params: Readonly<Record<string, unknown>>,
    public readonly detail: string,
    private readonly statedOrigin?: ErrorOrigin,
  ) {}

  /**
   * The origin its author stated. Otherwise `'validator'` for an error a validator produced (a validator stamps
   * every error it hands a field) and `'application'` for one written into `errors` by any other code.
   */
  get origin(): ErrorOrigin {
    if (this.statedOrigin !== undefined) return this.statedOrigin;
    return typeof (this as { source?: unknown }).source === 'symbol' ? 'validator' : 'application';
  }

  /**
   * True where `other` has the same class, code, params, detail and stated origin. A validator keeps the instance
   * the field already holds when the new run produces an error for which this is true, so an unchanged error does
   * not replace itself in `field.errors`.
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
