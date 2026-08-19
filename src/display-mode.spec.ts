import DisplayMode, { defaultDisplayMode } from './display-mode';
import { Field } from './field';

describe('Display Mode', () => {
  it('Create Display Mode From String', () => {
    expect(DisplayMode.fromString('SUPPRESS')).toBe(DisplayMode.SUPPRESS);
    expect(DisplayMode.fromString('HIDDEN')).toBe(DisplayMode.HIDDEN);
    expect(DisplayMode.fromString('INVISIBLE')).toBe(DisplayMode.INVISIBLE);
    expect(DisplayMode.fromString('FULL')).toBe(DisplayMode.FULL);
    expect(DisplayMode.fromString('hidden')).toBe(DisplayMode.HIDDEN);

    expect(() => DisplayMode.fromString('HIDEN')).toThrow("'HIDEN' is not a DisplayMode constant");
    expect(() => DisplayMode.fromString('THIS WILL NEVER BE A DISPLAY MODE')).toThrow('is not a DisplayMode constant');
    expect(() => DisplayMode.fromString(null as any)).toThrow('null is not a DisplayMode constant');
  });

  it('Create Display Modes From Any', () => {
    expect(DisplayMode.fromAny(DisplayMode.SUPPRESS)).toBe(DisplayMode.SUPPRESS);
    expect(DisplayMode.fromAny('SUPPRESS')).toBe(DisplayMode.SUPPRESS);
    expect(DisplayMode.fromAny('SUPPRESS')).toBe(DisplayMode.fromAny(DisplayMode.SUPPRESS));

    expect(DisplayMode.fromAny(DisplayMode.HIDDEN)).toBe(DisplayMode.HIDDEN);
    expect(DisplayMode.fromAny('HIDDEN')).toBe(DisplayMode.HIDDEN);
    expect(DisplayMode.fromAny('HIDDEN')).toBe(DisplayMode.fromAny(DisplayMode.HIDDEN));

    expect(DisplayMode.fromAny(DisplayMode.INVISIBLE)).toBe(DisplayMode.INVISIBLE);
    expect(DisplayMode.fromAny('INVISIBLE')).toBe(DisplayMode.INVISIBLE);
    expect(DisplayMode.fromAny('INVISIBLE')).toBe(DisplayMode.fromAny(DisplayMode.INVISIBLE));

    expect(DisplayMode.fromAny(DisplayMode.FULL)).toBe(DisplayMode.FULL);
    expect(DisplayMode.fromAny('FULL')).toBe(DisplayMode.FULL);
    expect(DisplayMode.fromAny('FULL')).toBe(DisplayMode.fromAny(DisplayMode.FULL));

    expect(() => DisplayMode.fromAny(100)).toThrow('100 is not a DisplayMode constant');
    expect(() => DisplayMode.fromAny('THIS WILL NEVER BE A DISPLAY MODE')).toThrow('is not a DisplayMode constant');
    expect(() => DisplayMode.fromAny(null)).toThrow('null is not a DisplayMode constant');
    expect(() => DisplayMode.fromAny(undefined)).toThrow('undefined is not a DisplayMode constant');
    expect(() => DisplayMode.fromAny(true)).toThrow('true is not a DisplayMode constant');
  });

  it('Check If Defined', () => {
    expect(DisplayMode.isDefined(DisplayMode.SUPPRESS)).toBe(true);
    expect(DisplayMode.isDefined('SUPPRESS')).toBe(true);
    expect(DisplayMode.isDefined('HIDDEN')).toBe(true);
    expect(DisplayMode.isDefined('INVISIBLE')).toBe(true);
    expect(DisplayMode.isDefined('FULL')).toBe(true);
    expect(DisplayMode.isDefined('hidden')).toBe(true);

    expect(DisplayMode.isDefined(100)).toBe(false);
    expect(DisplayMode.isDefined('HIDEN')).toBe(false);
    expect(DisplayMode.isDefined('THIS WILL NEVER BE A DISPLAY MODE')).toBe(false);
    expect(DisplayMode.isDefined(undefined as any)).toBe(false);
  });

  it('A field starts at the default display mode', () => {
    expect(new Field({ value: 'a' }).visibility).toBe(defaultDisplayMode);
  });

  it('Refuses a visibility that names no constant', () => {
    const field = new Field({ value: 'a' });

    field.visibility = 'HIDDEN' as any;
    expect(field.visibility).toBe(DisplayMode.HIDDEN);

    field.visibility = DisplayMode.INVISIBLE;
    expect(field.visibility).toBe(DisplayMode.INVISIBLE);

    expect(() => {
      field.visibility = 'HIDEN' as any;
    }).toThrow('visibility must be a DisplayMode constant');
    expect(() => {
      field.visibility = 999 as any;
    }).toThrow('visibility must be a DisplayMode constant');
    expect(field.visibility).toBe(DisplayMode.INVISIBLE);
  });
});
