/**
 * DisplayMode enum provides an enumeration for supported ways of rendering a particular object in the DOM
 */
enum DisplayMode {
  // This enum is actually declared in dynamicforms.mixins.field_render.py
  SUPPRESS = 1, // Field will be entirely suppressed. it will not render (not even to JSON) and will not parse for PUT
  HIDDEN = 5, // Field will render as <input type="hidden"> or <tr data-field_name>
  INVISIBLE = 8, // Field will render completely, but with display: none. Equal to setting its style = {display: none}
  FULL = 10, // Field will render completely
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
    if (name === 'INVISIBLE') return DisplayMode.INVISIBLE;
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
