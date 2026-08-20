import { expectTypeOf } from 'vitest';

import { Action, ActionValue } from './action';
import { ValueChangedAction } from './actions';
import { Field } from './field';
import { IFieldParams } from './field.interface';
import { Group } from './group';

/**
 * How a UI library renders an action: the value it widens `ActionValue` to. `label` and `icon` are restated at the
 * type this library renders them as - `ActionValue` leaves both `unknown` for exactly that - and the accessors the
 * base class declares answer at it, because they read their type off the value.
 */
interface RenderOptions extends ActionValue {
  label?: string;
  icon?: string;
  name?: string;
  renderAs?: 'button' | 'text';
  showLabel?: boolean;
  showIcon?: boolean;
  passthroughAttrs?: Record<string, any>;
}

/** the render options, together with the ones each breakpoint restates */
type BreakpointOptions = RenderOptions & { xs?: RenderOptions; md?: RenderOptions };

/** what a UI layer attaches to an action beside the options it renders it with */
interface Presentation {
  hint: string;
}

/**
 * An action of a UI library: the value carries the render options, the accessors narrow the reads the base class
 * answers unfiltered, and the factories build the actions the library offers ready-made.
 */
class RenderedAction extends Action<BreakpointOptions, Presentation> {
  get name() {
    return this.value.name;
  }

  /** the label an icon-only action carries is not the label it renders, so the read is filtered by `showLabel` */
  get label() {
    return this.value.showLabel ? this.value.label : undefined;
  }

  /** the write is the base class's and reaches `value.label` whatever `showLabel` says */
  set label(newValue: string | undefined) {
    super.label = newValue;
  }

  /** filtered by `showIcon` on the read, unfiltered on the write - as `label` is */
  get icon() {
    return this.value.showIcon ? this.value.icon : undefined;
  }

  set icon(newValue: string | undefined) {
    super.icon = newValue;
  }

  /** false where there is no label to show, whatever the value states */
  get showLabel(): boolean {
    return this.value.label ? (this.value.showLabel ?? false) : false;
  }

  /** false where there is no icon to show, whatever the value states */
  get showIcon(): boolean {
    return this.value.icon ? (this.value.showIcon ?? false) : false;
  }

  get renderAs() {
    return this.value.renderAs;
  }

  get passthroughAttrs() {
    return this.value.passthroughAttrs;
  }

  static save(data?: IFieldParams<BreakpointOptions, Presentation>) {
    const init: IFieldParams<BreakpointOptions, Presentation> = {
      ...(data ?? {}), // any property in data overwrites the one the constant states
      value: {
        name: 'save',
        label: 'Save',
        icon: 'mdi-content-save',
        renderAs: 'button',
        showLabel: true,
        showIcon: true,
      },
    };
    init.value = { ...init.value, ...(data?.value ?? {}) }; // data may state as little of the value as it likes
    return new RenderedAction(init);
  }
}

describe('an Action subclass with a widened value', () => {
  it('keeps a value naming neither label nor icon, breakpoint blocks and all', () => {
    const declared: BreakpointOptions = {
      name: 'save',
      renderAs: 'button',
      showLabel: true,
      showIcon: true,
      passthroughAttrs: { color: 'primary' },
      xs: { renderAs: 'text', showLabel: false },
      md: { showLabel: true },
    };

    const action = new RenderedAction({ value: { ...declared } });

    expect(action.value).toEqual(declared);
    expect(action.value.xs).toEqual({ renderAs: 'text', showLabel: false });
    expect(action.name).toBe('save');
    expect(action.renderAs).toBe('button');
    expect(action.passthroughAttrs).toEqual({ color: 'primary' });
    expect(action.label).toBeUndefined();
  });

  it('replaces a value whose every member states nothing', () => {
    const action = new RenderedAction({ value: { name: undefined, renderAs: undefined, xs: undefined } });

    expect(action.value).toEqual({ label: undefined, icon: undefined });
    expect(action.isChanged).toBe(false);
  });

  it('baselines the whole of the widened value it was declared with', () => {
    const declared: BreakpointOptions = {
      name: 'save',
      label: 'Save',
      icon: 'mdi-content-save',
      renderAs: 'button',
      showLabel: true,
      showIcon: false,
      xs: { showLabel: false },
    };

    const action = new RenderedAction({ value: { ...declared }, originalValue: { ...declared } });

    expect(action.originalValue).toEqual(declared);
    expect(action.isChanged).toBe(false);
  });

  it('reports a matching pair unchanged where the widened value names neither label nor icon', () => {
    const declared: BreakpointOptions = { name: 'save', renderAs: 'button', xs: { renderAs: 'text' } };

    const action = new RenderedAction({ value: { ...declared }, originalValue: { ...declared } });

    expect(action.originalValue).toEqual(declared);
    expect(action.isChanged).toBe(false);
  });

  it('reports its own change inside a group that reports itself unchanged', () => {
    const named: BreakpointOptions = { name: 'save', label: 'Save', icon: 'mdi-content-save', showLabel: true };
    const moved: BreakpointOptions = { name: 'close', renderAs: 'text', xs: { renderAs: 'button' } };
    const group = new Group({
      save: new RenderedAction({ value: { ...named }, originalValue: { ...named } }),
      close: new RenderedAction({ value: { ...moved }, originalValue: { ...moved, renderAs: 'button' } }),
    });

    expect(group.value).toEqual({ save: named, close: moved });
    expect(group.fields.save.isChanged).toBe(false);
    expect(group.fields.close.isChanged).toBe(true);
    // a group baselines the record its members were constructed with, so a member's verdict is not the group's
    expect(group.isChanged).toBe(false);
  });

  it('takes a widened originalValue as its value where no value is declared', () => {
    const action = new RenderedAction({ originalValue: { name: 'save', renderAs: 'text' } });

    expect(action.value).toEqual({ label: undefined, icon: undefined, name: 'save', renderAs: 'text' });
    expect(action.isChanged).toBe(false);
    // the value is a copy of the baseline rather than the frozen baseline itself, so label stays assignable
    expect(Object.isFrozen(action.value)).toBe(false);
  });

  it('throws on a write to label where the subclass declares the getter alone', () => {
    class GetterOnly extends Action<BreakpointOptions> {
      get label() {
        return this.value.showLabel ? this.value.label : undefined;
      }
    }
    const action = new GetterOnly({ value: { label: 'Save', showLabel: true } });

    expect(action.label).toBe('Save');
    // accessor shadowing: the prototype the write reaches carries a getter and no setter
    expect(() => {
      (action as any).label = 'Submit';
    }).toThrow(TypeError);
    expect(action.value.label).toBe('Save');
  });

  it('reads narrowed and writes through to the value where the subclass declares both', () => {
    const action = new RenderedAction({ value: { label: 'Save', icon: 'mdi-content-save', showIcon: true } });

    expect(action.label).toBeUndefined();
    expect(action.icon).toBe('mdi-content-save');
    expect(action.showLabel).toBe(false);
    expect(action.showIcon).toBe(true);

    action.label = 'Submit';

    expect(action.value.label).toBe('Submit');
    expect(action.label).toBeUndefined();
    expect(action.isChanged).toBe(true);
  });

  it('binds into the subclass, carrying the widened value', () => {
    const declaration = new RenderedAction({ value: { name: 'save', renderAs: 'button', xs: { renderAs: 'text' } } });

    const bound = declaration.bind({ name: 'save', renderAs: 'text', xs: { renderAs: 'text' } });

    expect(bound).toBeInstanceOf(RenderedAction);
    expect(bound.declaration).toBe(declaration);
    expect(bound.renderAs).toBe('text');
    expect(bound.value.xs).toEqual({ renderAs: 'text' });
    expect(bound.isChanged).toBe(false);
    expect(declaration.bind().value).toEqual({ name: 'save', renderAs: 'button', xs: { renderAs: 'text' } });
  });

  it('carries the extended properties the subclass declares', () => {
    const action = new RenderedAction({ value: { name: 'save' }, hint: 'saves the form' });

    expect(action.extra).toEqual({ hint: 'saves the form' });
    expect(action.value).toEqual({ name: 'save' });
    expect(action.bind({ name: 'save' }, { hint: 'submits the form' }).extra).toEqual({ hint: 'submits the form' });
  });

  it('builds the subclass from a static factory, over the value the caller restates part of', () => {
    const action = RenderedAction.save({ value: { showLabel: false }, hint: 'saves the form' });

    expect(action).toBeInstanceOf(RenderedAction);
    expect(action.value).toEqual({
      name: 'save',
      label: 'Save',
      icon: 'mdi-content-save',
      renderAs: 'button',
      showLabel: false,
      showIcon: true,
    });
    expect(action.extra).toEqual({ hint: 'saves the form' });
    expect(action.isChanged).toBe(false);
  });
});

describe('a Field subclass', () => {
  it('reads and writes a member of a widened value through an accessor of its own', () => {
    class Money extends Field<{ amount: number; currency: string }> {
      get amount() {
        return this.value.amount;
      }

      set amount(newValue: number) {
        this.value = { ...this.value, amount: newValue };
      }
    }
    const seen: object[] = [];
    const field = new Money({ value: { amount: 1, currency: 'EUR' } });
    field.registerAction(new ValueChangedAction((element, supr, newValue) => seen.push(newValue)));

    field.amount = 2;

    expect(field.value).toEqual({ amount: 2, currency: 'EUR' });
    expect(seen).toEqual([{ amount: 2, currency: 'EUR' }]);
    expect(field.isChanged).toBe(true);
  });

  it('loses what its init assigned to a member it also declares as a class field', () => {
    const seen: (string | undefined)[] = [];
    class Currency extends Field<number> {
      suffix = ' EUR';

      protected init(params?: IFieldParams<number>) {
        super.init(params);
        seen.push(this.suffix);
        this.suffix = ' USD';
        seen.push(this.suffix);
      }
    }

    const field = new Currency({ value: 12 });

    // init runs from the base constructor: it reads the member before the initializer defines it, and the
    // initializer overwrites what it wrote there
    expect(seen).toEqual([undefined, ' USD']);
    expect(field.suffix).toBe(' EUR');
    expect(field.value).toBe(12);
  });

  it('takes a parameter named after a class field as an extended property', () => {
    class Currency extends Field<number, { suffix: string }> {
      suffix = ' EUR';
    }

    const field = new Currency({ value: 12, suffix: ' USD' });

    expect(field.suffix).toBe(' EUR');
    expect(field.extra).toEqual({ suffix: ' USD' });
  });

  it('assigns a parameter named after an accessor the subclass declares', () => {
    const suffixes = new WeakMap<object, string>();
    class Currency extends Field<number, { suffix: string }> {
      get suffix(): string {
        return suffixes.get(this) ?? ' EUR';
      }

      set suffix(newValue: string) {
        suffixes.set(this, newValue);
      }
    }

    const field = new Currency({ value: 12, suffix: ' USD' });

    expect(field.suffix).toBe(' USD');
    expect(field.extra).toEqual({});
  });

  it('fills its own defaults in an init override', () => {
    class Amount extends Field<number> {
      protected init(params?: IFieldParams<number>) {
        super.init({ value: 0, ...params });
      }
    }

    expect(new Amount().value).toBe(0);
    expect(new Amount().isChanged).toBe(false);
    expect(new Amount({ value: 3 }).value).toBe(3);
  });

  it('binds into the subclass, through the constructor the subclass declares', () => {
    class Amount extends Field<number> {
      constructor(params?: IFieldParams<number>) {
        super({ value: 0, ...params });
      }
    }
    const declaration = new Amount();

    const bound = declaration.bind(7);

    expect(bound).toBeInstanceOf(Amount);
    expect(bound.declaration).toBe(declaration);
    expect(bound.value).toBe(7);
    expect(bound.isChanged).toBe(false);
  });
});

describe('an action whose label is not a string', () => {
  /** a markup-carrying label of the kind a UI library renders */
  class MdString {
    constructor(readonly md: string) {}
  }

  interface RichValue extends ActionValue {
    label?: string | MdString;
    icon?: string;
  }

  class RichAction extends Action<RichValue> {}

  it('carries and answers the label at the type the subclass stated', () => {
    const action = new RichAction({ value: { label: new MdString('**Save**') } });

    expectTypeOf(action.label).toEqualTypeOf<string | MdString | undefined>();
    expect(action.label).toBeInstanceOf(MdString);

    // the plain type the base class knows about is still one of them
    action.label = 'Save';
    expect(action.label).toBe('Save');

    // @ts-expect-error and the subclass's type is what a write is measured against
    action.label = 42;
  });

  it('reaches the base setter, so the write is an ordinary value change', () => {
    const action = new RichAction({ value: { label: 'Save', icon: 'save' } });
    const seen: unknown[] = [];
    action.registerAction(
      new ValueChangedAction((field, supr, newValue) => {
        seen.push((newValue as RichValue).label);
        return supr(field, newValue);
      }),
    );

    action.label = new MdString('**Save**');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(MdString);
    // the member the write did not name is carried over untouched
    expect(action.icon).toBe('save');
  });

  it('drops a member written undefined, so isChanged stays honest', () => {
    const action = new RichAction({ value: { label: new MdString('**Save**'), icon: 'save' } });

    action.icon = undefined;

    expect(Object.hasOwn(action.value, 'icon')).toBe(false);
    expect(action.label).toBeInstanceOf(MdString);
  });
});
