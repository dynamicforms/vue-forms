import { isRef } from 'vue';

import { RenderContentRef } from './validation-error';

/**
 * Tells a validator's message from its options where either may take the same argument position. Every form a
 * message takes is a string, a String subclass, a function, a reference or an object naming a component; an object
 * that is none of those is the options.
 */
export function isOptions<O extends object>(arg?: RenderContentRef | O): arg is O {
  return (
    typeof arg === 'object' && arg !== null && !isRef(arg) && !(arg instanceof String) && !('componentName' in arg)
  );
}
