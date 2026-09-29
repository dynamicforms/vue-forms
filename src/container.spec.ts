import { Container } from './container';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
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
