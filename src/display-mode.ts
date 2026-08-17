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

export const defaultDisplayMode = DisplayMode.FULL;

// The reverse mapping of a numeric enum puts both the names and the numbers in Object.values, and both fromAny and
// isDefined only ever test a number, so the numbers are all that has to be kept. Built once: the alternative is two
// array allocations on every write to visibility.
const displayModeValues: ReadonlySet<number> = new Set(
  Object.values(DisplayMode).filter((entry): entry is number => typeof entry === 'number'),
);

// eslint-disable-next-line @typescript-eslint/no-namespace, no-redeclare
namespace DisplayMode {
  export function fromString(mode: string): DisplayMode {
    if (mode.toUpperCase() === 'SUPPRESS') return DisplayMode.SUPPRESS;
    if (mode.toUpperCase() === 'HIDDEN') return DisplayMode.HIDDEN;
    if (mode.toUpperCase() === 'INVISIBLE') return DisplayMode.INVISIBLE;
    return defaultDisplayMode;
  }

  export function fromAny(mode: any): DisplayMode {
    const input = typeof mode === 'number' ? mode : DisplayMode.fromString(mode as string);
    if (displayModeValues.has(input)) return input;
    return defaultDisplayMode;
  }

  export function isDefined(mode: number | string): boolean {
    const check = typeof mode === 'number' ? mode : DisplayMode.fromString(mode as string);
    return displayModeValues.has(check);
  }
}

Object.freeze(DisplayMode);

export default DisplayMode;
