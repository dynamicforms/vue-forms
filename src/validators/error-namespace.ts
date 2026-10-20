/**
 * The namespace of the error codes this library declares. A code the library raises is `${ERROR_NAMESPACE}.<code>`,
 * such as `vue-forms.required`.
 */
export const ERROR_NAMESPACE = 'vue-forms';

/** The full code of `code`, an error code this library declares. */
export function namespaced(code: string): string {
  return `${ERROR_NAMESPACE}.${code}`;
}
