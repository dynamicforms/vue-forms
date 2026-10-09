import { BeginValidating } from '../element-state';
import {
  ConditionalVisibilityAction,
  Field,
  Group,
  List,
  ListItemAddedAction,
  ListItemRemovedAction,
  Operator,
  Statement,
  transaction,
  ValueChangedAction,
  view,
} from '../index';

const events = (list: List<any>) => {
  const seen: string[] = [];
  list.registerAction(
    new ListItemAddedAction((f, s, item, index: number) => (seen.push(`+${index}`), s(f, item, index))),
  );
  list.registerAction(
    new ListItemRemovedAction((f, s, item, index: number) => (seen.push(`-${index}`), s(f, item, index))),
  );
  return seen;
};

describe('list row events', () => {
  it('fire for the rows a value assignment adds and removes, not for the rows it reuses', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }), { value: [{ a: 1 }, { a: 2 }, { a: 3 }] });
    const seen = events(list);

    list.value = [{ a: 4 }];
    expect(seen).toEqual(['-2', '-1']);

    seen.length = 0;
    list.value = [{ a: 5 }, { a: 6 }];
    expect(seen).toEqual(['+1']);
  });

  it('fire a removal per row for clear()', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }), { value: [{ a: 1 }, { a: 2 }] });
    const seen = events(list);

    list.clear();

    expect(seen).toEqual(['-1', '-0']);
  });

  it('do not fire for sort() and reverse() of the view, which reorder the rows in place', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }), { value: [{ a: 2 }, { a: 1 }, { a: 3 }] });
    const rows = [...list.items];
    const seen = events(list);
    const data = view(list) as any;

    data.sort((x: any, y: any) => x.a - y.a);
    expect(list.value).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    data.reverse();

    expect(list.value).toEqual([{ a: 3 }, { a: 2 }, { a: 1 }]);
    expect(seen).toEqual([]);
    expect(new Set(list.items)).toEqual(new Set(rows));
  });
});

describe('an asynchronous validation run', () => {
  it('ends once: a second call of its end function does not end another run', () => {
    const field = new Field({ value: 1 });
    const endFirst = field[BeginValidating]();
    const endSecond = field[BeginValidating]();

    endFirst();
    endFirst();

    expect(field.validating).toBe(true);
    endSecond();
    expect(field.validating).toBe(false);
  });
});

describe('a rollback whose signal the application catches', () => {
  it('still rolls the transaction back', () => {
    const field = new Field({ value: 1 });

    transaction((tx) => {
      field.value = 2;
      try {
        tx.rollback();
      } catch {
        // an application catch-all
      }
    });

    expect(field.value).toBe(1);
  });
});

describe('the listener a conditional action installs on the fields its statement reads', () => {
  it('runs although a later ValueChangedAction on that field does not call supr', () => {
    const source = new Field({ value: 1 });
    const target = new Field({ value: 0 });
    new Group({ source, target });
    target.registerAction(
      new ConditionalVisibilityAction(new Statement(source, Operator.EQUALS, 2), 'full', 'suppress'),
    );
    source.registerAction(new ValueChangedAction(() => null));

    source.value = 2;

    expect(target.visibility).toBe('full');
  });

  it('is removed with the action from its last element, and restored by a rollback', () => {
    const source = new Field({ value: 1 });
    const target = new Field({ value: 0 });
    new Group({ source, target });
    const rule = new ConditionalVisibilityAction(new Statement(source, Operator.EQUALS, 2), 'full', 'suppress');
    target.registerAction(rule);
    const handlers = () => (source as any).boundActions.ofClass(ValueChangedAction.classIdentifier).length;
    expect(handlers()).toBe(1);

    transaction((tx) => {
      target.unregisterAction(rule);
      expect(handlers()).toBe(0);
      tx.rollback();
    });
    expect(handlers()).toBe(1);

    target.unregisterAction(rule);
    expect(handlers()).toBe(0);
  });
});

describe('Group.createFromFormData', () => {
  it('builds a group for an object and a list for an array, at every level', () => {
    const data = { name: 'a', address: { city: 'Kranj' }, tags: ['x', 'y'], rows: [{ n: 1 }] };
    const form = Group.createFromFormData(data);

    expect(form.fields.address).toBeInstanceOf(Group);
    expect(form.fields.tags).toBeInstanceOf(List);
    expect((form.fields.rows as List).get(0)).toBeInstanceOf(Group);
    expect(form.fullValue).toEqual(data);
  });
});
