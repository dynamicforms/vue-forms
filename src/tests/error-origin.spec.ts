import { toRaw } from 'vue';

import { ValidChangedAction } from '../actions';
import { Field } from '../field';
import { Group } from '../group';
import { List } from '../list';
import { transaction } from '../transaction';
import { ValidationError, Validators } from '../validators';

const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });

const fromServer = (code: string) => new ValidationError(code, {}, code, 'server');

const codes = (element: { errors: ValidationError[] }) => element.errors.map((error) => error.code);

describe('The origin of an error', () => {
  it('is the one its author states, and otherwise validator or application by who wrote it', () => {
    const field = required('');

    expect(field.errors[0].origin).toBe('validator');
    expect(new ValidationError('invalid', {}, 'taken').origin).toBe('application');
    expect(new ValidationError('taken', {}, 'taken', 'server').origin).toBe('server');
    expect(new ValidationError('stale', {}, 'stale', 'sync').origin).toBe('sync');
  });
});

describe('An error of origin server', () => {
  it('is removed from a field whose value changes, and the field becomes valid', () => {
    const field = new Field<string>({ value: 'a' });
    const form = new Group({ name: field });
    field.errors = [fromServer('taken')];
    field.validate();
    expect(form.valid).toBe(false);

    const seen: boolean[] = [];
    field.registerAction(
      new ValidChangedAction((f, supr, valid, was) => {
        seen.push(valid);
        return supr(f, valid, was);
      }),
    );
    field.value = 'b';

    expect(field.errors).toEqual([]);
    expect(field.valid).toBe(true);
    expect(form.valid).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('is removed while the errors of other origins stay', () => {
    const field = new Field<string>({
      value: 'a',
      validators: [new Validators.MinLength(3)],
    });
    const mine = new ValidationError('checked', {}, 'checked');
    const synced = new ValidationError('stale', {}, 'stale', 'sync');
    field.errors.push(fromServer('taken'), mine, synced);

    field.value = 'bc';

    expect(codes(field)).toEqual(['checked', 'stale', 'min_length']);
    expect(field.errors.map((error) => error.origin)).toEqual(['application', 'sync', 'validator']);
  });

  it('stays when the field is assigned the value it holds', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));

    field.value = 'a';

    expect(codes(field)).toEqual(['taken']);
    expect(field.valid).toBe(false);
  });

  it("is removed from a group's own errors when a member changes, and the members' stay", () => {
    const form = new Group({ name: new Field<string>({ value: 'a' }), city: new Field<string>({ value: 'x' }) });
    form.errors.push(fromServer('duplicate'));
    form.fields.city.errors.push(fromServer('unknown'));
    form.validate();
    expect(form.valid).toBe(false);

    form.fields.name.value = 'b';

    expect(form.errors).toEqual([]);
    expect(codes(form.fields.city)).toEqual(['unknown']);
    expect(form.fields.city.valid).toBe(false);
  });

  it('is removed from every container above the changed field in a nested group', () => {
    const address = new Group({ street: new Field<string>({ value: 's' }) });
    const form = new Group({ address });
    form.errors.push(fromServer('form'));
    address.errors.push(fromServer('address'));
    address.fields.street.errors.push(fromServer('street'));

    address.fields.street.value = 't';

    expect(form.errors).toEqual([]);
    expect(address.errors).toEqual([]);
    expect(address.fields.street.errors).toEqual([]);
    expect(form.valid).toBe(true);
  });

  it('is removed from a field of a list row, the row and the list when the field changes', () => {
    const list = new List(new Group({ name: new Field<string>({ value: '' }) }), { value: [{ name: 'a' }] });
    const row = list.get(0)!;
    list.errors.push(fromServer('list'));
    row.errors.push(fromServer('row'));
    row.fields.name.errors.push(fromServer('name'));

    row.fields.name.value = 'b';

    expect(row.fields.name.errors).toEqual([]);
    expect(row.errors).toEqual([]);
    expect(list.errors).toEqual([]);
    expect(list.valid).toBe(true);
  });

  it("is removed from a list's own errors when a row is added", () => {
    const list = new List(new Group({ name: new Field<string>({ value: '' }) }));
    list.errors.push(fromServer('list'));

    list.push({ name: 'a' });

    expect(list.errors).toEqual([]);
  });

  it('is put back by a rollback of the change that removed it', () => {
    const form = new Group({ name: new Field<string>({ value: 'a' }) });
    const error = fromServer('taken');
    form.fields.name.errors.push(error);
    form.errors.push(fromServer('duplicate'));
    form.validate();

    expect(() =>
      transaction(() => {
        form.fields.name.value = 'b';
        expect(form.fields.name.errors).toEqual([]);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(form.fields.name.value).toBe('a');
    expect(form.fields.name.errors.map(toRaw)).toEqual([error]);
    expect(codes(form)).toEqual(['duplicate']);
    expect(form.fields.name.valid).toBe(false);
    expect(form.valid).toBe(false);
  });

  it('is removed by a rebind', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));

    field.rebind('b');

    expect(field.errors).toEqual([]);
  });
});
