import { computed, nextTick, ref, watch, watchEffect } from 'vue';

import { ValueChangedAction } from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { ValidationErrorText, Validators } from './validators';
import { view } from './view';

/**
 * The recipes of docs/guide/cookbook.md, each run as the page writes it.
 */

const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });

describe('Cookbook: what a form sends', () => {
  it('suppresses the fields that do not apply to a type, and brings them back as they were', async () => {
    const form = new Group({
      kind: new Field({ value: 'text' }),
      text: new Field({ value: 'hello' }),
      src: new Field({ value: '' }),
    });
    watchEffect(() => {
      const image = form.fields.kind.value === 'image';
      form.fields.src.visibility = image ? DisplayMode.FULL : DisplayMode.SUPPRESS;
      form.fields.text.visibility = image ? DisplayMode.SUPPRESS : DisplayMode.FULL;
    });

    expect(form.value).toEqual({ kind: 'text', text: 'hello' });
    form.fields.kind.value = 'image';
    await nextTick();
    expect(form.value).toEqual({ kind: 'image', src: '' });
    form.fields.kind.value = 'text';
    await nextTick();
    expect(form.value).toEqual({ kind: 'text', text: 'hello' });
  });

  it('sends an optional section as null while it is off, keeps what it holds, and does not count it', async () => {
    const club = new Group({ name: required(''), city: new Field({ value: '' }) });
    const form = new Group({ member: new Field({ value: 'Ada' }), club });
    const hasClub = ref(false);
    watchEffect(() => {
      club.visibility = hasClub.value ? DisplayMode.FULL : DisplayMode.HIDDEN;
    });

    expect(form.value).toEqual({ member: 'Ada', club: null });
    expect(form.valid).toBe(true);
    expect(form.fullValue.club).toBeNull();
    club.fields.name.value = 'NK';
    expect(club.fullValue).toEqual({ name: 'NK', city: '' });

    hasClub.value = true;
    await nextTick();
    expect(form.value).toEqual({ member: 'Ada', club: { name: 'NK', city: '' } });
  });

  it('loads a record without touching visibility, and follows the data where the rule says so', async () => {
    const club = new Group({ name: new Field({ value: 'NK' }) });
    const form = new Group({ member: new Field({ value: '' }), club });
    const hasClub = ref(true);
    watchEffect(() => {
      club.visibility = hasClub.value ? DisplayMode.FULL : DisplayMode.HIDDEN;
    });

    const record = { member: 'Grace', club: null };
    form.value = record;
    expect(club.visibility).toBe(DisplayMode.FULL);
    expect(form.value).toEqual({ member: 'Grace', club: { name: null } });

    hasClub.value = record.club != null;
    await nextTick();
    expect(form.value).toEqual({ member: 'Grace', club: null });
  });

  it('clears a form with rebind(null)', () => {
    const form = new Group({ name: new Field<string | null>({ value: 'x' }), rows: new List(new Field<string>()) });
    form.fields.rows.push('r');

    form.rebind(null);

    expect(form.value).toEqual({ name: null, rows: [] });
    expect(form.isChanged).toBe(false);
  });
});

describe('Cookbook: loading, submitting and resetting', () => {
  it('loads a record, and makes it the baseline with rebind()', () => {
    const form = new Group({ name: new Field({ value: '' }), age: new Field({ value: 0 }) });

    form.value = { name: 'Ada' };
    expect(form.value).toEqual({ name: 'Ada', age: 0 });
    expect(form.isChanged).toBe(true);

    form.rebind({ name: 'Grace', age: 40 });
    expect(form.isChanged).toBe(false);
  });

  it('submits once validation has settled, and leaves the form unchanged after the save', async () => {
    const pending: ((value: null) => void)[] = [];
    const slow = new Validators.Validator(() => new Promise<null>((resolve) => pending.push(resolve)));
    const form = new Group({ name: new Field({ value: 'Ada', validators: [slow] }) });
    form.fields.name.value = 'Grace';
    const sent: unknown[] = [];
    const api = { save: async (payload: unknown) => (sent.push(payload), payload as { name: string }) };

    async function submit() {
      await form.settled();
      if (!form.valid) return;
      const saved = await api.save(form.value);
      form.rebind(saved);
    }

    const running = submit();
    expect(sent).toEqual([]);
    pending.forEach((resolve) => resolve(null));
    await running;

    expect(sent).toEqual([{ name: 'Grace' }]);
    expect(form.isChanged).toBe(false);
  });

  it("shows errors the server returned until they are cleared, and keeps the validators' own", () => {
    const form = new Group({ email: new Field({ value: 'a@b.c' }), name: required('') });
    const showServerErrors = (target: Group, errors: Record<string, string>) => {
      Object.entries(errors).forEach(([name, message]) => {
        const field = target.field(name);
        if (field) field.errors = [...field.errors, new ValidationErrorText(message)];
      });
    };
    const clearServerErrors = (target: Group) => {
      Object.values(target.fields).forEach((field) => {
        field.errors = [];
      });
      target.validate(true);
    };

    showServerErrors(form, { email: 'already taken' });
    expect(form.fields.email.valid).toBe(false);
    form.fields.email.value = 'x@y.z';
    expect(form.fields.email.valid).toBe(false);

    clearServerErrors(form);
    expect(form.fields.email.valid).toBe(true);
    expect(form.fields.name.errors.length).toBe(1);
  });

  it('reports a changed form exactly while something was edited since the last rebind()', () => {
    const form = new Group({ name: new Field({ value: '' }) });
    form.rebind({ name: 'Ada' });
    expect(form.isChanged).toBe(false);

    form.fields.name.value = 'Grace';
    expect(form.isChanged).toBe(true);
    form.rebind(form.value);
    expect(form.isChanged).toBe(false);
  });
});

describe('Cookbook: fields, sections and lists', () => {
  it('draws a disabled section through effectiveEnabled, and leaves it out only while it is empty', () => {
    const address = new Group({ city: new Field({ value: 'Kranj' }) });
    const form = new Group({ address, name: new Field({ value: 'x' }) });

    address.enabled = false;

    expect(address.fields.city.effectiveEnabled).toBe(false);
    expect(address.fields.city.enabled).toBe(true);
    expect(form.value).toEqual({ address: { city: 'Kranj' }, name: 'x' });
  });

  it('reads another field of the row once the row exists', () => {
    const lineItem = new Group({
      quantity: new Field({ value: 1 }),
      unitPrice: new Field<number | null>({ value: null }),
    });
    lineItem.fields.unitPrice.registerAction(
      new Validators.Validator((newValue, oldValue, field) => {
        const row = field.parent;
        if (!(row instanceof Group)) {
          field.markRecordIncomplete();
          return null;
        }
        return row.fields.quantity.value > 0 && newValue == null
          ? [new ValidationErrorText('Unit price is required when quantity is above zero')]
          : null;
      }),
    );
    lineItem.fields.quantity.registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        const result = supr(field, newValue, oldValue);
        if (field.parent instanceof Group) field.parent.fields.unitPrice.validate(true);
        return result;
      }),
    );
    const lines = new List(lineItem, {
      value: [
        { quantity: 2, unitPrice: null },
        { quantity: 0, unitPrice: null },
      ],
    });

    expect(lines.get(0)!.fields.unitPrice.valid).toBe(false);
    expect(lines.get(1)!.fields.unitPrice.valid).toBe(true);
  });

  it('holds a list of plain values', () => {
    const tags = new List(new Field<string>({ validators: [new Validators.Required()] }));
    expect(tags.value).toEqual([]);
    tags.push('urgent');
    expect(tags.value).toEqual(['urgent']);
    tags.push('');
    expect(tags.valid).toBe(false);
  });
});

describe('Cookbook: a group as a store', () => {
  const clubGroup = () => new Group({ slug: new Field({ value: '' }), name: new Field({ value: '' }) });
  const makeSession = () =>
    view(
      new Group({
        account: new Group({
          email: new Field({ value: '' }),
          full_name: new Field({ value: '' }),
          is_superuser: new Field({ value: false }),
        }),
        clubs: new List(clubGroup()),
        club: clubGroup(),
        permissions: new Field<string[]>({ value: [] }),
      }),
    );

  it('reads, derives and applies a session through its view', async () => {
    const session = makeSession();
    // a section nobody is logged into, or no club is selected in, is hidden: it reads null
    session.$fields.account.visibility = DisplayMode.HIDDEN;
    session.$fields.club.visibility = DisplayMode.HIDDEN;

    const loggedIn = computed(() => session.account != null);
    const userDisplayName = computed(() => session.account?.full_name || session.account?.email);
    const hasPermission = (codename: string) =>
      !!session.account?.is_superuser || !!session.permissions?.includes(codename);

    function apply(state: Record<string, unknown>) {
      transaction(() => {
        session.$value = state;
        (['account', 'club'] as const).forEach((name) => {
          if (name in state) session.$fields[name].visibility = state[name] ? DisplayMode.FULL : DisplayMode.HIDDEN;
        });
      });
    }

    expect(loggedIn.value).toBe(false);
    const names: unknown[] = [];
    watch(
      () => session.account?.email,
      (email) => names.push(email),
    );

    apply({
      account: { email: 'ada@x', full_name: '', is_superuser: false },
      clubs: [{ slug: 'nk', name: 'NK' }],
      club: { slug: 'nk', name: 'NK' },
      permissions: ['read'],
    });
    await nextTick();

    expect(loggedIn.value).toBe(true);
    expect(userDisplayName.value).toBe('ada@x');
    expect(hasPermission('read')).toBe(true);
    expect(session.club?.slug).toBe('nk');
    expect(session.$value).toEqual({
      account: { email: 'ada@x', full_name: '', is_superuser: false },
      clubs: [{ slug: 'nk', name: 'NK' }],
      club: { slug: 'nk', name: 'NK' },
      permissions: ['read'],
    });

    session.permissions = ['read', 'write'];
    await nextTick();
    apply({ account: null, clubs: [], club: null, permissions: [] });
    await nextTick();

    expect(loggedIn.value).toBe(false);
    expect(session.$value).toEqual({ account: null, clubs: [], club: null, permissions: [] });
    // the e-mail watch ran for the login and for the logout, not for the permissions in between
    expect(names).toEqual(['ada@x', undefined]);
  });
});
