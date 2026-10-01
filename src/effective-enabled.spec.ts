import { computed, effectScope } from 'vue';

import { Field } from './field';
import { Group } from './group';
import { List } from './list';

const form = () =>
  new Group({
    name: new Field({ value: 'x' }),
    section: new Group({
      a: new Field({ value: 1 }),
      inner: new Group({ b: new Field({ value: 2 }) }),
    }),
  });

describe('effectiveEnabled', () => {
  it('is the element and every container above it', () => {
    const f = form();

    expect(f.fields.section.fields.inner.fields.b.effectiveEnabled).toBe(true);

    f.fields.section.access = 'disabled';

    expect(f.fields.section.effectiveEnabled).toBe(false);
    expect(f.fields.section.fields.a.effectiveEnabled).toBe(false);
    expect(f.fields.section.fields.inner.effectiveEnabled).toBe(false);
    expect(f.fields.section.fields.inner.fields.b.effectiveEnabled).toBe(false);
    // an element outside the disabled subtree is untouched
    expect(f.fields.name.effectiveEnabled).toBe(true);
  });

  it("answers for the element's own enabled before it walks anything", () => {
    const f = form();
    f.fields.name.access = 'disabled';

    expect(f.fields.name.effectiveEnabled).toBe(false);
    expect(f.effectiveEnabled).toBe(true);
  });

  it('is true for a detached element, which has no container to ask', () => {
    const field = new Field({ value: 1 });

    expect(field.parent).toBeUndefined();
    expect(field.effectiveEnabled).toBe(true);
  });

  it('follows a row into and out of the list that holds it', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }), { value: [{ a: 1 }] });
    const row = list.get(0)!;

    list.access = 'disabled';
    expect(row.fields.a.effectiveEnabled).toBe(false);

    const removed = list.remove(0)!;
    expect(removed.fields.a.effectiveEnabled).toBe(true);
  });

  it('leaves enabled, the value and the writes exactly as they were', () => {
    const f = form();
    f.fields.section.access = 'readonly';

    // the member states its own enabled, unchanged
    expect(f.fields.section.fields.a.enabled).toBe(true);
    // and it goes on serializing and accepting writes
    expect(f.value).toEqual({ name: 'x', section: { a: 1, inner: { b: 2 } } });
    f.fields.section.fields.a.value = 9;
    expect(f.fields.section.fields.a.value).toBe(9);
  });

  it('is tracked, so a computed over it follows a container that is switched', () => {
    const f = form();
    const scope = effectScope();
    const seen: boolean[] = [];

    scope.run(() => {
      const c = computed(() => f.fields.section.fields.inner.fields.b.effectiveEnabled);
      seen.push(c.value);
      f.fields.section.access = 'disabled';
      seen.push(c.value);
      f.fields.section.access = 'editable';
      seen.push(c.value);
    });
    scope.stop();

    expect(seen).toEqual([true, false, true]);
  });

  it('is read-only, so a construction parameter of that name throws', () => {
    expect(() => new Field({ value: 1, effectiveEnabled: true } as any)).toThrow(TypeError);
  });
});

describe('effectiveAccess', () => {
  it("is the element's own access where nothing above narrows it", () => {
    const f = form();
    f.fields.section.fields.a.access = 'disabled-null';

    expect(f.fields.section.fields.a.effectiveAccess).toBe('disabled-null');
    expect(f.fields.name.effectiveAccess).toBe('editable');
  });

  it('makes an editable element readonly below a readonly container, and leaves a narrower one as it is', () => {
    const f = form();
    f.fields.section.access = 'readonly';
    f.fields.section.fields.a.access = 'disabled';

    expect(f.fields.section.fields.inner.fields.b.effectiveAccess).toBe('readonly');
    expect(f.fields.section.fields.a.effectiveAccess).toBe('disabled');
  });

  it('is disabled below a container that sends nothing or null', () => {
    const f = form();

    f.fields.section.access = 'disabled-null';
    expect(f.fields.section.effectiveAccess).toBe('disabled-null');
    expect(f.fields.section.fields.inner.fields.b.effectiveAccess).toBe('disabled');

    f.fields.section.access = 'disabled';
    expect(f.fields.section.fields.a.effectiveAccess).toBe('disabled');
  });
});
