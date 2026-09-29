import { Action } from './action';
import { ExecuteAction, ValidChangedAction } from './actions';
import { Container } from './container';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { Validators } from './validators';

describe('Container', () => {
  it('is what a Group and a List are, and what holds every element', () => {
    const field = new Field({ value: 1 });
    const group = new Group({ n: field });
    const list = new List(new Group({ n: new Field({ value: 1 }) }), { value: [{ n: 2 }] });

    expect(group).toBeInstanceOf(Container);
    expect(list).toBeInstanceOf(Container);
    expect(field).not.toBeInstanceOf(Container);
    expect(field.parent).toBe(group);
    expect(list.get(0)!.parent).toBe(list);
  });

  it('keeps the class tag of the element it is', () => {
    expect(Object.prototype.toString.call(new Group({}))).toBe('[object Group]');
    expect(Object.prototype.toString.call(new List())).toBe('[object List]');
  });

  it('composes touched, valid and busy over the children of a Group and of a List alike', () => {
    const required = () => new Field<string>({ value: 'x', validators: [new Validators.Required()] });
    const group = new Group({ a: required() });
    const list = new List(new Group({ a: required() }), { value: [{ a: 'x' }] });

    for (const container of [group, list]) {
      expect(container.touched).toBe(false);
      container.touched = true;
      expect(container.touched).toBe(true);
      expect(container.valid).toBe(true);
      expect(container.busy).toBe(false);
    }
    group.fields.a.value = '';
    list.get(0)!.fields.a.value = '';
    expect(group.valid).toBe(false);
    expect(list.valid).toBe(false);
  });
});

/** a field that is invalid while it holds an empty string */
const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });

/** the verdict transitions a container announces */
function watchValid(container: Container): boolean[] {
  const seen: boolean[] = [];
  container.registerAction(
    new ValidChangedAction((element, supr, newValue: boolean, oldValue: boolean) => {
      if (element === container) seen.push(newValue);
      return supr(element, newValue, oldValue);
    }),
  );
  return seen;
}

/**
 * The two containers, driven through one shape: a container over children that each hold one required field, and
 * the operations that add a child, take one out, and reach the field of one.
 */
interface Shape {
  build(values: string[]): Container;
  add(container: Container, value: string): void;
  remove(container: Container, index: number): void;
  field(container: Container, index: number): Field<string>;
}

const groupShape: Shape = {
  build: (values) => new Group(Object.fromEntries(values.map((value, index) => [`f${index}`, required(value)]))),
  add: (container, value) => {
    const group = container as Group;
    group.addField(`f${Object.keys(group.fields).length}`, required(value));
  },
  remove: (container, index) => {
    (container as Group).removeField(`f${index}`);
  },
  field: (container, index) => (container as Group).fields[`f${index}`] as Field<string>,
};

const listShape: Shape = {
  build: (values) =>
    new List(new Group({ a: required('') }), { value: values.map((value) => ({ a: value })) }) as Container,
  add: (container, value) => {
    (container as List).push({ a: value });
  },
  remove: (container, index) => {
    (container as List).remove(index);
  },
  field: (container, index) => (container as List).get(index)!.fields.a as Field<string>,
};

describe.each([
  ['Group', groupShape],
  ['List', listShape],
])('%s in a transaction', (_, shape) => {
  it('puts the invalid-child tally back when adding an invalid child is rolled back', () => {
    const container = shape.build(['x']);
    const seen = watchValid(container);

    transaction((tx) => {
      shape.add(container, '');
      expect(container.valid).toBe(false);
      tx.rollback();
    });

    expect(container.valid).toBe(true);
    expect(seen).toEqual([]);
    // a tally left counting the dropped child would keep the verdict false through a write that settles it
    shape.field(container, 0).value = 'y';
    expect(seen).toEqual([]);
    shape.field(container, 0).value = '';
    expect(seen).toEqual([false]);
  });

  it('puts the invalid-child tally back when removing an invalid child is rolled back', () => {
    const container = shape.build(['x', '']);
    const seen = watchValid(container);
    expect(container.valid).toBe(false);

    transaction((tx) => {
      shape.remove(container, 1);
      expect(container.valid).toBe(true);
      tx.rollback();
    });

    expect(container.valid).toBe(false);
    expect(seen).toEqual([]);
    // the child counts again, so fixing it is what turns the container valid, and it does so once
    shape.field(container, 1).value = 'y';
    expect(container.valid).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('puts touched back on every child when the assignment is rolled back', () => {
    const container = shape.build(['x', 'y']);

    transaction((tx) => {
      container.touched = true;
      expect(container.touched).toBe(true);
      tx.rollback();
    });

    expect(container.touched).toBe(false);
    expect(shape.field(container, 0).touched).toBe(false);
    expect(shape.field(container, 1).touched).toBe(false);
  });

  it('puts the errors and the verdict back when validate(true) is rolled back', () => {
    const container = shape.build(['']);
    const seen = watchValid(container);
    const field = shape.field(container, 0);
    // an error dropped by hand, which only a revalidation brings back
    field.errors = [];
    expect(container.valid).toBe(true);

    transaction((tx) => {
      container.validate(true);
      expect(field.errors.length).toBe(1);
      expect(container.valid).toBe(false);
      tx.rollback();
    });

    expect(field.errors).toEqual([]);
    expect(container.valid).toBe(true);
    expect(seen).toEqual([]);
  });

  it('announces no verdict for a child that turns invalid and back within one transaction', () => {
    const container = shape.build(['x']);
    const seen = watchValid(container);

    transaction(() => {
      shape.field(container, 0).value = '';
      shape.field(container, 0).value = 'y';
    });

    expect(container.valid).toBe(true);
    expect(seen).toEqual([]);
  });
});

describe('nested containers in a transaction', () => {
  it('composes valid over a list nested in a group after a rolled-back push', () => {
    const rows = new List(new Group({ a: required('') }), { value: [{ a: 'x' }] });
    const form = new Group({ rows });
    const seen = watchValid(form);

    transaction((tx) => {
      rows.push({ a: '' });
      expect(form.valid).toBe(false);
      tx.rollback();
    });

    expect(form.valid).toBe(true);
    expect(seen).toEqual([]);
    rows.push({ a: '' });
    expect(form.valid).toBe(false);
    expect(seen).toEqual([false]);
  });

  it('composes busy over a list nested in a group after a rolled-back removal', async () => {
    let settle: () => void = () => null;
    const save = new Action({ actions: [new ExecuteAction(() => new Promise<void>((resolve) => (settle = resolve)))] });
    const rows = new List(new Group({ save: new Action() }));
    rows.push(new Group({ save }));
    const form = new Group({ rows });

    const running = save.execute();
    expect(form.busy).toBe(true);

    transaction((tx) => {
      rows.remove(0);
      expect(form.busy).toBe(false);
      tx.rollback();
    });

    expect(form.busy).toBe(true);
    settle();
    await running;
    expect(form.busy).toBe(false);
  });
});
