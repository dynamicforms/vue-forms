/*
 * Stands in for the `vue` module inside the memory harness bundle. Every import of `vue` from the library source
 * resolves here, so `reactive` is counted at the one call site that creates a field's proxy. The counter is the
 * only difference from the real module: everything else is re-exported unchanged, and a local export wins over a
 * star export, so this `reactive` is the one the library sees.
 *
 * `vue-actual` is resolved to the installed vue package by the build script; it is not a package name.
 */
import * as vue from 'vue-actual';

export * from 'vue-actual';

let count = 0;

export const reactive = (target) => {
  count += 1;
  return vue.reactive(target);
};

export const proxyCount = () => count;

export const resetProxyCount = () => {
  count = 0;
};
