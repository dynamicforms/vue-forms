import { expectTypeOf } from 'vitest';

import { Action } from './action';
import { Field } from './field';
import { type Extras } from './field.interface';
import { Group } from './group';
import { List } from './list';

/**
 * The augmentation a UI layer performs, written here against the module the interface is declared in; a consumer
 * writes the same block against the package name. The assertions are enforced by `vue-tsc --noEmit` rather than
 * by the vitest run, the way the rest of the type-level contract is - `expectTypeOf` is a no-op at runtime and a
 * `@ts-expect-error` that stops suppressing is itself a compile error.
 *
 * The interface is one per compilation, so this block is in force for every other spec too. Names that no other
 * spec uses keep it from answering for something a spec meant to reject.
 */
declare module './field.interface' {
  interface Extras {
    hint?: string;
    cssClass?: string;
  }
}

describe('an augmented Extras', () => {
  it('is what an element carries with no type argument at any construction site', () => {
    const field = new Field({ value: 'a', hint: 'in full', cssClass: 'w-50' });

    expect(field.value).toBe('a');
    expect(field.extra).toEqual({ hint: 'in full', cssClass: 'w-50' });
    expectTypeOf(field.extra.hint).toEqualTypeOf<string | undefined>();
    expectTypeOf(field).toEqualTypeOf<Field<string>>();
  });

  it('reaches the members of a group declared without one either', () => {
    const form = new Group({
      name: new Field({ value: '', hint: 'in full' }),
      age: new Field({ value: 0, cssClass: 'w-25' }),
    });

    expect(form.fields.name.extra.hint).toBe('in full');
    expectTypeOf(form.fields.name.extra.hint).toEqualTypeOf<string | undefined>();
    expectTypeOf(form.fields.age.extra.cssClass).toEqualTypeOf<string | undefined>();
  });

  it('is carried by a Group and a List of their own', () => {
    const group = new Group({ a: new Field({ value: 1 }) }, { hint: 'the address' });
    const list = new List(undefined, { hint: 'the rows' });

    expect(group.extra.hint).toBe('the address');
    expect(list.extra.hint).toBe('the rows');
  });

  it('leaves a property it does not declare an excess property', () => {
    // @ts-expect-error hintt is not a property the augmentation declares
    const field = new Field({ value: 'a', hintt: 'in full' });

    expect(field.extra).toEqual({ hintt: 'in full' });
  });

  it('leaves a member the class declares to the member', () => {
    const field = new Field({ value: 'a', enabled: false, hint: 'in full' });

    expect(field.enabled).toBe(false);
    expect(field.extra).toEqual({ hint: 'in full' });
  });

  it('types setExtendedValues and the bind overrides', () => {
    const field = new Field({ value: 'a', hint: 'in full' });

    field.setExtendedValues({ cssClass: 'w-50' });
    expect(field.extra).toEqual({ hint: 'in full', cssClass: 'w-50' });

    const bound = field.bind('b', { hint: 'abbreviated' });
    expect(bound.extra).toEqual({ hint: 'abbreviated', cssClass: 'w-50' });

    // @ts-expect-error the same rejection applies to a write and to a binding override
    field.setExtendedValues({ hintt: 'in full' });
  });

  it('is replaced by an X the element states, not added to', () => {
    const local = new Field<string, { badge: string }>({ value: 'a', badge: 'new' });
    expectTypeOf(local.extra.badge).toEqualTypeOf<string | undefined>();
    // @ts-expect-error an element that states its own X carries that one alone
    const both = new Field<string, { badge: string }>({ value: 'a', badge: 'new', hint: 'in full' });

    // `Extras & Local` is how an element carries both
    const merged = new Field<string, Extras & { badge: string }>({ value: 'a', badge: 'new', hint: 'in full' });
    expectTypeOf(merged.extra.hint).toEqualTypeOf<string | undefined>();
    expect([local.extra.badge, both.extra.badge, merged.extra.hint]).toEqual(['new', 'new', 'in full']);
  });
});

describe('an Action', () => {
  it('carries the properties that do not name a member of its own', () => {
    const action = new Action({ hint: 'saves the form' });

    expect(action.extra.hint).toBe('saves the form');
    expectTypeOf(action.extra.hint).toEqualTypeOf<string | undefined>();
  });

  it('does not promise label or icon among them, because they are members it declares', () => {
    const action = new Action({ value: { label: 'Save', icon: 'save' } });

    expect(action.label).toBe('Save');
    expect(action.extra).toEqual({});
    // @ts-expect-error label reaches the action's own value, so it is no extended property of an Action
    expectTypeOf(action.extra.label).toEqualTypeOf<string | undefined>();
  });
});
