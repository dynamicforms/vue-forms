/**
 * How a form element takes part in its form: whether it is shown, and what it contributes to the value and to the
 * validity of the container holding it.
 */
enum DisplayMode {
  /** Not part of the form: not rendered, left out of its container's value and fullValue, and not counted in its
   * container's validity. */
  SUPPRESS = 1,
  /** Part of the form but not shown (`display: none`): its container's value and fullValue carry `null` in its
   * place, and its validity is not counted. The element keeps what it holds, so showing it again brings it back. */
  HIDDEN = 5,
  /** Shown and serialized: its container carries its value, subject to `enabled`, and counts its validity. */
  FULL = 10,
}

/** What a form element's visibility is when nothing sets it. It is a starting value, never a fallback for input. */
export const defaultDisplayMode = DisplayMode.FULL;

// The reverse mapping of a numeric enum puts both the numbers and the names in Object.values, and each membership
// test needs one of the two: fromAny tests a number, isDefined tests a number or a name. Built once: the
// alternative is an array allocation per membership test, and visibility is written on every render pass that
// changes one.
const displayModeValues: ReadonlySet<number> = new Set(
  Object.values(DisplayMode).filter((entry): entry is number => typeof entry === 'number'),
);
const displayModeNames: ReadonlySet<string> = new Set(
  Object.values(DisplayMode).filter((entry): entry is string => typeof entry === 'string'),
);

// One error shape for every rejection in this module, so a caller recognises one wherever it was raised, and it
// names the value it refused.
function notADisplayMode(mode: any): Error {
  const quoted = typeof mode === 'string' ? `'${mode}'` : String(mode);
  return new Error(`${quoted} is not a DisplayMode constant`);
}

// eslint-disable-next-line @typescript-eslint/no-namespace, no-redeclare
namespace DisplayMode {
  /**
   * Resolves a constant's name, case insensitive, to the constant it names. Anything else - a misspelled name, a
   * value that is not a string - throws an `Error` naming it. A mode nobody defined is an error at the point it
   * arrives, not a field that renders as `FULL` and is never questioned.
   */
  export function fromString(mode: string): DisplayMode {
    const name = typeof mode === 'string' ? mode.toUpperCase() : '';
    if (name === 'SUPPRESS') return DisplayMode.SUPPRESS;
    if (name === 'HIDDEN') return DisplayMode.HIDDEN;
    if (name === 'FULL') return DisplayMode.FULL;
    throw notADisplayMode(mode);
  }

  /**
   * Resolves a DisplayMode number, or a constant's name (case insensitive), to a DisplayMode. A number that is
   * none of the constants, a string that names none, and input that is neither a number nor a string all throw an
   * `Error` naming the value. Ask `isDefined` where the answer is to be judged rather than raised.
   */
  export function fromAny(mode: any): DisplayMode {
    if (typeof mode === 'number') {
      if (displayModeValues.has(mode)) return mode;
      throw notADisplayMode(mode);
    }
    if (typeof mode !== 'string') throw notADisplayMode(mode);
    return DisplayMode.fromString(mode);
  }

  /**
   * Answers whether the input is a DisplayMode: a number that is one of the constants, or a string naming one,
   * case insensitive. This is the way to ask that does not throw; it answers `false` where `fromAny` raises.
   */
  export function isDefined(mode: number | string): boolean {
    if (typeof mode === 'number') return displayModeValues.has(mode);
    if (typeof mode === 'string') return displayModeNames.has(mode.toUpperCase());
    return false;
  }
}

Object.freeze(DisplayMode);

export default DisplayMode;
