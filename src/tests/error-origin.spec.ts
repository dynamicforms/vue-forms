import { toRaw } from 'vue';

import { Action } from '../action';
import { SubmitAction, SubmitRefusedException, ValidChangedAction } from '../actions';
import { Field } from '../field';
import { type FieldBase } from '../field-base';
import { Group } from '../group';
import { List } from '../list';
import { transaction } from '../transaction';
import { ErrorPolicy, setDefaultErrorPolicies, ValidationError, Validators } from '../validators';

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

describe('An error of origin server, under the default rule', () => {
  it('stays while the field changes, and goes when the user leaves the changed field', () => {
    const field = new Field<string>({ value: 'a' });
    const form = new Group({ name: field });
    field.errors = [fromServer('taken')];
    field.validate();
    const seen: boolean[] = [];
    field.registerAction(
      new ValidChangedAction((f, supr, valid, was) => {
        seen.push(valid);
        return supr(f, valid, was);
      }),
    );

    field.value = 'b';
    expect(codes(field)).toEqual(['taken']);
    expect(form.valid).toBe(false);

    field.touched = true;
    expect(field.errors).toEqual([]);
    expect(field.valid).toBe(true);
    expect(form.valid).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('stays when the user leaves the field without a change, or with the value it was written with', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors = [fromServer('taken')];

    field.touched = true;
    expect(codes(field)).toEqual(['taken']);

    field.value = 'ab';
    field.value = 'a';
    field.touched = true;
    expect(codes(field)).toEqual(['taken']);
    expect(field.valid).toBe(false);
  });

  it('given as a construction parameter, is compared against the value the element is built with', () => {
    const field = new Field<string>({ value: 'a', errors: [fromServer('taken')] });
    const form = new Group({ field }, { errors: [fromServer('form')] });

    field.touched = true;
    expect(codes(field)).toEqual(['taken']);
    expect(codes(form)).toEqual(['form']);

    field.value = 'b';
    field.touched = true;
    expect(field.errors).toEqual([]);
    expect(form.errors).toEqual([]);
  });

  it('added to the array in place, goes once the field changed and the user leaves it', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));

    field.value = 'b';
    field.touched = true;

    expect(field.errors).toEqual([]);
  });

  it('added to the array in place and not read, compares against the value at the first touched write', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));

    field.touched = true;
    field.value = 'b';
    field.value = 'a';
    field.touched = true;
    expect(field.errors.map((error) => error.code)).toEqual(['taken']);

    field.value = 'b';
    field.touched = true;
    expect(field.errors).toEqual([]);
  });

  it('added to the array in place, compares against the value at the next read of the errors', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));
    expect(codes(field)).toEqual(['taken']);

    field.touched = true;
    expect(codes(field)).toEqual(['taken']);
    field.value = 'b';
    field.touched = true;
    expect(field.errors).toEqual([]);
  });

  it('keeps the errors of the other origins, and of the members the user did not leave', () => {
    const form = new Group({
      name: new Field<string>({ value: 'a', validators: [new Validators.MinLength(3)] }),
      city: new Field<string>({ value: 'x' }),
    });
    const mine = new ValidationError('checked', {}, 'checked');
    form.fields.name.errors.push(fromServer('taken'), mine);
    form.fields.city.errors.push(fromServer('unknown'));

    form.fields.name.value = 'bc';
    form.fields.name.touched = true;

    expect(codes(form.fields.name)).toEqual(['checked', 'min_length']);
    expect(codes(form.fields.city)).toEqual(['unknown']);
  });

  it("goes from the form when the user leaves any member after a change of the form's value", () => {
    const form = new Group({ user: new Field<string>({ value: 'ada' }), password: new Field<string>({ value: 'x' }) });
    form.errors = [fromServer('invalid_credentials')];

    form.fields.user.touched = true;
    expect(codes(form)).toEqual(['invalid_credentials']);

    form.fields.password.value = 'y';
    form.fields.user.touched = true;
    expect(form.errors).toEqual([]);
    expect(form.valid).toBe(true);
  });

  it('goes from every container above the field whose value changed, in nested groups and list rows', () => {
    const list = new List(new Group({ name: new Field<string>({ value: '' }) }), { value: [{ name: 'a' }] });
    const form = new Group({ rows: list });
    const row = list.get(0)!;
    form.errors.push(fromServer('form'));
    list.errors.push(fromServer('list'));
    row.errors.push(fromServer('row'));
    row.fields.name.errors.push(fromServer('name'));

    row.fields.name.value = 'b';
    row.fields.name.touched = true;

    expect(row.fields.name.errors).toEqual([]);
    expect(row.errors).toEqual([]);
    expect(list.errors).toEqual([]);
    expect(form.errors).toEqual([]);
    expect(form.valid).toBe(true);
  });

  it('goes where the value changed when the whole form is touched, and stays on the unchanged members', () => {
    const form = new Group({ name: new Field<string>({ value: 'a' }), city: new Field<string>({ value: 'x' }) });
    form.fields.name.errors = [fromServer('taken')];
    form.fields.city.errors = [fromServer('unknown')];

    form.fields.name.value = 'b';
    form.touched = true;

    expect(form.fields.name.errors).toEqual([]);
    expect(codes(form.fields.city)).toEqual(['unknown']);
  });

  it('is put back by a rollback of the touched write that removed it', () => {
    const form = new Group({ name: new Field<string>({ value: 'a' }) });
    const error = fromServer('taken');
    form.fields.name.errors = [error];
    form.fields.name.validate();
    form.fields.name.value = 'b';

    transaction((tx) => {
      form.fields.name.touched = true;
      expect(form.fields.name.errors).toEqual([]);
      tx.rollback();
    });

    expect(form.fields.name.errors.map(toRaw)).toEqual([error]);
    expect(form.fields.name.touched).toBe(false);
    expect(form.valid).toBe(false);
  });

  it('is removed by a rebind', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));

    field.rebind('b');

    expect(field.errors).toEqual([]);
  });

  it('is removed by a rebind with the errors of every rule, on the element and below it', () => {
    const form = new Group(
      { name: new Field<string>({ value: 'a' }) },
      { actions: [new ErrorPolicy({ server: { validEffect: true, removeOn: 'never' } })] },
    );
    form.errors = [fromServer('form'), new ValidationError('mine', {}, 'mine')];
    form.fields.name.errors = [fromServer('name')];

    form.rebind({ name: 'b' });

    expect(form.errors).toEqual([]);
    expect(form.fields.name.errors).toEqual([]);
    expect(form.valid).toBe(true);
  });
});

describe("The rule removeOn: 'change'", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = setDefaultErrorPolicies({ server: { validEffect: true, removeOn: 'change' } });
  });
  afterEach(() => restore());

  it('removes the error from a field whose value changes, and the field becomes valid', () => {
    const field = new Field<string>({ value: 'a' });
    const form = new Group({ name: field });
    field.errors = [fromServer('taken')];
    field.validate();
    expect(form.valid).toBe(false);

    field.value = 'b';

    expect(field.errors).toEqual([]);
    expect(field.valid).toBe(true);
    expect(form.valid).toBe(true);
  });

  it('keeps the error when the field is assigned the value it holds', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors.push(fromServer('taken'));

    field.value = 'a';

    expect(codes(field)).toEqual(['taken']);
  });

  it("removes a container's own error when a member changes, and the members' stay", () => {
    const form = new Group({ name: new Field<string>({ value: 'a' }), city: new Field<string>({ value: 'x' }) });
    form.errors.push(fromServer('duplicate'));
    form.fields.city.errors.push(fromServer('unknown'));

    form.fields.name.value = 'b';

    expect(form.errors).toEqual([]);
    expect(codes(form.fields.city)).toEqual(['unknown']);
  });

  it("removes a list's own error when a row is added", () => {
    const list = new List(new Group({ name: new Field<string>({ value: '' }) }));
    list.errors.push(fromServer('list'));

    list.push({ name: 'a' });

    expect(list.errors).toEqual([]);
  });

  it('is put back by a rollback of the change that removed it', () => {
    const form = new Group({ name: new Field<string>({ value: 'a' }) });
    const error = fromServer('taken');
    form.fields.name.errors.push(error);
    form.fields.name.validate();

    transaction((tx) => {
      form.fields.name.value = 'b';
      expect(form.fields.name.errors).toEqual([]);
      tx.rollback();
    });

    expect(form.fields.name.errors.map(toRaw)).toEqual([error]);
    expect(form.valid).toBe(false);
  });
});

describe("The rule removeOn: 'submit'", () => {
  const holder = (action: FieldBase) => action.parent;
  const policy = () => new ErrorPolicy({ server: { validEffect: false, removeOn: 'submit' } });

  it('leaves the form valid and executable, and removes the errors below the target before sending', async () => {
    const seen: string[][] = [];
    const form = new Group(
      {
        user: new Field<string>({ value: 'ada' }),
        save: new Action({
          actions: [new SubmitAction(holder, (value, target) => void seen.push(codes(target)))],
        }),
      },
      { actions: [policy()] },
    );
    form.errors = [fromServer('invalid_credentials')];
    form.fields.user.errors = [fromServer('locked')];
    form.fields.save.errors = [new ValidationError('mine', {}, 'mine')];
    form.fields.save.registerAction(new ErrorPolicy({ application: { validEffect: false, removeOn: 'never' } }));
    form.fields.user.value = 'bob';
    form.fields.user.touched = true;

    expect(codes(form)).toEqual(['invalid_credentials']);
    expect(form.valid).toBe(true);
    expect(form.fields.save.executable).toBe(true);

    await form.fields.save.execute();

    expect(seen).toEqual([[]]);
    expect(form.errors).toEqual([]);
    expect(form.fields.user.errors).toEqual([]);
    expect(codes(form.fields.save)).toEqual(['mine']);
  });

  it('keeps the errors above the target, and those of a submit refused as invalid', async () => {
    const address = new Group({
      city: new Field<string>({ value: '', validators: [new Validators.Required()] }),
      save: new Action({ actions: [new SubmitAction(holder, () => undefined)] }),
    });
    const form = new Group({ address }, { actions: [policy()] });
    form.errors = [fromServer('form')];
    address.errors = [fromServer('address')];

    const refused = await address.fields.save.execute();
    expect(refused).toBeInstanceOf(SubmitRefusedException);
    expect(codes(address)).toEqual(['address']);

    address.fields.city.value = 'Bled';
    await address.fields.save.execute();
    expect(address.errors).toEqual([]);
    expect(codes(form)).toEqual(['form']);
  });
});

describe("The rule removeOn: 'never'", () => {
  it('keeps the error through changes and touched writes; validEffect decides whether it counts', () => {
    const counted = new Field<string>({ value: 'a' });
    const notCounted = new Field<string>({ value: 'a' });
    const form = new Group(
      { counted, notCounted },
      { actions: [new ErrorPolicy({ server: { validEffect: true, removeOn: 'never' } })] },
    );
    notCounted.registerAction(new ErrorPolicy({ server: { validEffect: false, removeOn: 'never' } }));
    counted.errors = [fromServer('stale')];
    notCounted.errors = [fromServer('stale')];

    counted.value = 'b';
    counted.touched = true;
    notCounted.value = 'b';
    notCounted.touched = true;

    expect(codes(counted)).toEqual(['stale']);
    expect(codes(notCounted)).toEqual(['stale']);
    expect(counted.valid).toBe(false);
    expect(notCounted.valid).toBe(true);
    expect(form.valid).toBe(false);
  });
});

describe('ErrorPolicy', () => {
  it('rules an application-defined origin and application errors as well', () => {
    const field = new Field<string>({ value: 'a' });
    const form = new Group(
      { field },
      {
        actions: [
          new ErrorPolicy({
            application: { validEffect: true, removeOn: 'change' },
            warning: { validEffect: false, removeOn: 'edit' },
          }),
        ],
      },
    );
    field.errors = [new ValidationError('mine', {}, 'mine'), new ValidationError('soft', {}, 'soft', 'warning')];
    expect(field.valid).toBe(false);

    field.value = 'b';
    expect(codes(field)).toEqual(['soft']);
    expect(form.valid).toBe(true);

    field.touched = true;
    expect(field.errors).toEqual([]);
  });

  it('applies the nearest policy naming the origin; an origin it does not name falls through to the one above', () => {
    const field = new Field<string>({ value: 'a' });
    const inner = new Group(
      { field },
      { actions: [new ErrorPolicy({ sync: { validEffect: true, removeOn: 'never' } })] },
    );
    const form = new Group(
      { inner },
      {
        actions: [
          new ErrorPolicy({
            server: { validEffect: false, removeOn: 'never' },
            sync: { validEffect: false, removeOn: 'never' },
          }),
        ],
      },
    );
    field.errors = [fromServer('taken')];
    expect(field.valid).toBe(true);

    field.errors = [new ValidationError('stale', {}, 'stale', 'sync')];
    expect(field.valid).toBe(false);
    expect(form.valid).toBe(false);
  });

  it('recomputes the validity below it when registered and unregistered; a rollback undoes the registration', () => {
    const field = new Field<string>({ value: 'a' });
    const form = new Group({ field });
    field.errors = [fromServer('taken')];
    field.validate();
    const seen: boolean[] = [];
    form.registerAction(
      new ValidChangedAction((f, supr, valid, was) => {
        seen.push(valid);
        return supr(f, valid, was);
      }),
    );
    const policy = new ErrorPolicy({ server: { validEffect: false, removeOn: 'never' } });

    transaction((tx) => {
      form.registerAction(policy);
      expect(form.valid).toBe(true);
      tx.rollback();
    });
    expect(form.valid).toBe(false);
    expect(seen).toEqual([]);

    form.registerAction(policy);
    expect(form.valid).toBe(true);
    expect(seen).toEqual([true]);

    form.unregisterAction(policy);
    expect(form.valid).toBe(false);
    expect(seen).toEqual([true, false]);
    expect(codes(field)).toEqual(['taken']);
  });

  it('rules the errors of an element a container with a policy takes, and stops when it releases it', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors = [fromServer('taken')];
    field.validate();
    const form = new Group({}, { actions: [new ErrorPolicy({ server: { validEffect: false, removeOn: 'never' } })] });

    form.addField('field', field);
    expect(field.valid).toBe(true);
    expect(form.valid).toBe(true);

    form.removeField('field');
    expect(field.valid).toBe(false);
  });

  it('registered on the item template of a list, rules every row', () => {
    const template = new Group({ name: new Field<string>({ value: '' }) });
    const list = new List(template, { value: [{ name: 'a' }] });
    template.registerAction(new ErrorPolicy({ server: { validEffect: false, removeOn: 'never' } }));
    list.push({ name: 'b' });

    list.get(0)!.errors = [fromServer('row')];
    list.get(1)!.fields.name.errors = [fromServer('name')];

    expect(list.valid).toBe(true);
  });

  it('throws a TypeError for a rule it cannot take', () => {
    expect(() => new ErrorPolicy({ validator: { validEffect: true, removeOn: 'never' } } as any)).toThrow(TypeError);
    expect(() => new ErrorPolicy({ server: { validEffect: 'yes', removeOn: 'never' } } as any)).toThrow(TypeError);
    expect(() => new ErrorPolicy({ server: { validEffect: true, removeOn: 'blur' } } as any)).toThrow(TypeError);
    expect(() => new ErrorPolicy({ server: { validEffect: true, removeOn: 'submit' } })).toThrow(TypeError);
    expect(() => new ErrorPolicy({ server: null } as any)).toThrow(TypeError);
    expect(() => new ErrorPolicy(null as any)).toThrow(TypeError);
  });

  it('throws a TypeError where another policy on the element names one of its origins, and registers nothing', () => {
    const field = new Field<string>({ value: 'a' });
    const first = new ErrorPolicy({ server: { validEffect: false, removeOn: 'never' } });
    const second = new ErrorPolicy({
      application: { validEffect: false, removeOn: 'never' },
      server: { validEffect: true, removeOn: 'never' },
    });
    field.registerAction(first);

    expect(() => field.registerAction(second)).toThrow(TypeError);
    field.errors = [new ValidationError('mine', {}, 'mine')];
    expect(field.valid).toBe(false);

    field.registerAction(new ErrorPolicy({ application: { validEffect: false, removeOn: 'never' } }));
    expect(field.valid).toBe(true);
    expect(() => new Field({ actions: [first, second] })).toThrow(TypeError);
  });
});

describe('setDefaultErrorPolicies', () => {
  it('sets the rule of the origins it names until the returned function restores the previous rules', () => {
    const field = new Field<string>({ value: 'a' });
    field.errors = [new ValidationError('stale', {}, 'stale', 'sync'), fromServer('taken')];
    expect(field.valid).toBe(false);

    const restore = setDefaultErrorPolicies({
      sync: { validEffect: false, removeOn: 'never' },
      server: { validEffect: false, removeOn: 'edit' },
    });
    expect(field.valid).toBe(true);
    restore();
    expect(field.valid).toBe(false);
  });

  it('throws a TypeError for a rule ErrorPolicy refuses, and changes nothing', () => {
    expect(() => setDefaultErrorPolicies({ server: { validEffect: true, removeOn: 'submit' } })).toThrow(TypeError);
    const field = new Field<string>({ value: 'a' });
    field.errors = [fromServer('taken')];
    field.value = 'b';
    expect(codes(field)).toEqual(['taken']);
  });
});
