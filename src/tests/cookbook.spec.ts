/* eslint-disable vue/one-component-per-file -- a component that provides the cart and one that injects it */
import { mount } from '@vue/test-utils';
import { vi } from 'vitest';
import {
  computed,
  defineComponent,
  effectScope,
  h,
  inject,
  type InjectionKey,
  nextTick,
  provide,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from 'vue';

import {
  Action,
  CommandException,
  ConditionalAccessAction,
  ConditionalVisibilityAction,
  ContributionChangedAction,
  Field,
  FieldBase,
  Group,
  List,
  Operator,
  RejectAction,
  Statement,
  SubmitAction,
  SubmitFailedException,
  transaction,
  ValidationError,
  Validators,
  ValueChangedAction,
  view,
} from '../index';

/**
 * The recipes of docs/guide/cookbook.md, each run as the page writes it.
 */

const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });

describe('Cookbook: loading, submitting and resetting', () => {
  it('loads a record, and makes it the baseline with rebind()', () => {
    const form = new Group({ name: new Field({ value: '' }), age: new Field({ value: 0 }) });

    form.value = { name: 'Ada' };
    expect(form.value).toEqual({ name: 'Ada', age: 0 });
    expect(form.isChanged).toBe(true);

    form.rebind({ name: 'Grace', age: 40 });
    expect(form.isChanged).toBe(false);
  });

  it('gives a member whose key the rebound record lacks its baseline', () => {
    const form = new Group({ name: new Field({ value: 'declared' }), age: new Field({ value: 0 }) });
    form.fields.name.value = 'edited';

    form.rebind({ age: 40 });

    expect(form.value).toEqual({ name: 'declared', age: 40 });
  });

  it('submits once validation has settled, keeps the inputs disabled while saving, and rebinds', async () => {
    const pending: ((value: null) => void)[] = [];
    const slow = new Validators.Validator(() => new Promise<null>((resolve) => pending.push(resolve)));
    const form = new Group({ name: new Field({ value: 'Ada', validators: [slow] }) });
    form.fields.name.value = 'Grace';
    const sent: unknown[] = [];
    let answer: (saved: { name: string }) => void = () => undefined;
    const api = {
      save: (payload: { name?: string | null }) => {
        sent.push(payload);
        return new Promise<{ name: string }>((resolve) => (answer = resolve));
      },
    };

    const saving = ref(false);

    async function submit() {
      await form.settled();
      if (!form.valid) return;
      saving.value = true;
      try {
        form.rebind(await api.save(form.value));
      } finally {
        saving.value = false;
      }
    }

    const running = submit();
    expect(sent).toEqual([]);
    pending.forEach((resolve) => resolve(null));
    await vi.waitFor(() => expect(sent).toEqual([{ name: 'Grace' }]));
    // busy counts only Action.execute() runs, so the plain submit carries its own flag
    expect(form.busy).toBe(false);
    expect(saving.value).toBe(true);

    answer({ name: 'Grace' });
    await running;
    expect(saving.value).toBe(false);
    expect(form.isChanged).toBe(false);
  });

  it('submits through a SubmitAction, which keeps the form busy while it runs', async () => {
    let answer: ((saved: { name: string }) => void) | undefined;
    const api = { save: () => new Promise<{ name: string }>((resolve) => (answer = resolve)) };
    const form = new Group({
      name: new Field({ value: '', validators: [new Validators.Required()] }),
      actions: new Group({
        save: new Action({
          value: { label: 'Save', defaultConfirm: true },
          actions: [
            new SubmitAction(
              (action) => action.parent?.parent,
              () => api.save(),
            ),
          ],
        }),
        cancel: new Action({
          value: { label: 'Cancel', defaultReject: true },
          actions: [new RejectAction((action) => action.parent?.parent)],
        }),
      }),
    });

    expect(form.fields.actions.fields.save.executable).toBe(false);
    form.fields.name.value = 'Ada';
    expect(form.fields.actions.fields.save.executable).toBe(true);
    expect(form.value).toEqual({ name: 'Ada' });

    const running = form.confirm();
    expect(form.busy).toBe(true);
    await vi.waitFor(() => expect(answer).toBeDefined());
    answer!({ name: 'Ada' });
    const result = await running;

    expect(result).toMatchObject({ sent: { name: 'Ada' }, received: { name: 'Ada' } });
    expect(form.busy).toBe(false);
    expect(form.isChanged).toBe(false);

    form.fields.name.value = 'Grace';
    await form.reject();
    expect(form.fields.name.value).toBe('Ada');
  });

  it('shows every error once the user tries to submit an invalid form', async () => {
    const form = new Group({
      email: required(''),
      lines: new List(new Group({ sku: required('') }), { value: [{ sku: '' }] }),
    });
    const saved: unknown[] = [];
    const api = { save: async (value: unknown) => (saved.push(value), value as any) };

    async function submit() {
      await form.settled();
      if (!form.valid) {
        form.touched = true;
        return;
      }
      form.rebind(await api.save(form.value));
    }

    expect(form.fields.email.touched).toBe(false);
    await submit();

    expect(saved).toEqual([]);
    expect(form.fields.email.touched).toBe(true);
    expect(form.fields.lines.get(0)!.fields.sku.touched).toBe(true);

    form.fields.email.value = 'ada@example.com';
    form.fields.lines.get(0)!.fields.sku.value = 'm-1';
    await submit();
    expect(saved).toHaveLength(1);
    expect(form.fields.email.touched).toBe(false);
  });

  it('puts a form back to its declaration, or empties it, with rebind()', () => {
    const group = new Group({ name: new Field<string | null>({ value: 'x' }), rows: new List(new Field<string>()) });
    const field = group.fields.name;
    const list = new List(new Field<string>(), { value: ['a'] });

    group.fields.rows.push('r');
    group.rebind(group.originalValue);
    expect(group.value).toEqual({ name: 'x', rows: [] });

    group.rebind(null);
    expect(group.value).toEqual({ name: null, rows: [] });
    expect(group.isChanged).toBe(false);

    field.value = 'y';
    field.rebind(field.originalValue);
    expect(field.value).toBeNull();
    field.rebind('');
    expect(field.value).toBe('');

    list.push('b');
    list.touched = true;
    list.rebind(list.originalValue);
    expect(list.value).toEqual(['a']);
    list.rebind(null);
    expect(list.value).toEqual([]);
    expect(list.touched).toBe(false);
    expect(list.isChanged).toBe(false);
  });
});

describe('Cookbook: errors the server returned', () => {
  class FieldErrors extends Error {
    constructor(readonly errors: Record<string, string[]>) {
      super('The server rejected the values');
    }
  }

  function elementAt(root: FieldBase, path: string | readonly (string | number)[]): FieldBase | undefined {
    const keys = typeof path === 'string' ? path.split('.') : path;
    let element: FieldBase | null | undefined = root;
    for (const key of keys) {
      if (element instanceof Group) element = element.field(String(key));
      else if (element instanceof List) element = element.get(Number(key));
      else return undefined;
    }
    return element ?? undefined;
  }

  function showServerErrors(root: FieldBase, errors: Record<string, string[]>) {
    Object.entries(errors).forEach(([path, messages]) => {
      // a message for a path the form does not hold is shown on the form itself
      const element = elementAt(root, path) ?? root;
      element.errors = [
        ...element.errors,
        ...messages.map((message) => new ValidationError('server_error', {}, message, 'server')),
      ];
    });
  }

  const createOrder = () =>
    new Group({
      email: new Field({ value: 'a@b.c' }),
      address: new Group({ city: new Field({ value: 'Kranj' }) }),
      items: new List(new Group({ price: new Field({ value: 1 }) }), { value: [{ price: 1 }, { price: -2 }] }),
    });

  it('resolves a dotted path and an array path through groups and list rows', () => {
    const form = createOrder();

    expect(elementAt(form, 'items.1.price')).toBe(form.fields.items.get(1)!.fields.price);
    expect(elementAt(form, ['address', 'city'])).toBe(form.fields.address.fields.city);
    expect(elementAt(form, ['items', 1, 'price'])).toBe(form.fields.items.get(1)!.fields.price);
    expect(form.field('address.city' as any)).toBeNull();
    expect(elementAt(form, 'items.7.price')).toBeUndefined();
  });

  it('writes the errors from the plain submit, rethrows, and drops each one when its element changes', async () => {
    const form = createOrder();
    const api = {
      save: async (): Promise<any> => {
        throw new FieldErrors({ 'items.1.price': ['Must be positive'], email: ['Taken'], '': ['Try again'] });
      },
    };
    const saving = ref(false);

    async function submit() {
      await form.settled();
      if (!form.valid) return;
      saving.value = true;
      try {
        form.rebind(await api.save());
      } catch (error) {
        if (error instanceof FieldErrors) showServerErrors(form, error.errors);
        throw error;
      } finally {
        saving.value = false;
      }
    }

    await expect(submit()).rejects.toBeInstanceOf(FieldErrors);
    const price = form.fields.items.get(1)!.fields.price;
    expect(price.errors.map((error) => [error.origin, error.detail])).toEqual([['server', 'Must be positive']]);
    expect(form.errors.map((error) => error.detail)).toEqual(['Try again']);
    expect(form.valid).toBe(false);
    expect(saving.value).toBe(false);

    price.value = 2;
    expect(price.errors).toEqual([]);
    // the form's own message goes with the first change below it
    expect(form.errors).toEqual([]);
    expect(form.fields.email.valid).toBe(false);
    form.fields.email.value = 'c@d.e';
    expect(form.valid).toBe(true);
  });

  it('writes the errors from the handler of a SubmitAction, which resolves with the failure', async () => {
    const form = createOrder();
    const api = {
      save: async (): Promise<any> => {
        throw new FieldErrors({ 'address.city': ['Not delivered to'] });
      },
    };
    const save = new Action({
      actions: [
        new SubmitAction(form, async (value, target) => {
          try {
            return await api.save();
          } catch (error) {
            if (error instanceof FieldErrors) showServerErrors(target, error.errors);
            throw error;
          }
        }),
      ],
    });

    const result = await save.execute();

    expect(result).toBeInstanceOf(SubmitFailedException);
    expect((result as SubmitFailedException).cause).toBeInstanceOf(FieldErrors);
    expect(form.fields.address.fields.city.errors[0].detail).toBe('Not delivered to');
    expect(form.valid).toBe(false);
    form.fields.address.fields.city.value = 'Bled';
    expect(form.valid).toBe(true);
  });
});

describe('Cookbook: leaving a changed form', () => {
  it('warns on unload and asks the router guard only while the form is changed', () => {
    const form = new Group({ name: new Field({ value: '' }) });
    const confirm = vi.fn<(message: string) => boolean>(() => false);
    const warn = (event: BeforeUnloadEvent) => {
      if (form.isChanged) event.preventDefault();
    };
    const guard = () => !form.isChanged || confirm('Leave without saving the changes?');

    const unchanged = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    warn(unchanged);
    expect(unchanged.defaultPrevented).toBe(false);
    expect(guard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    form.fields.name.value = 'Ada';
    const changed = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    warn(changed);
    expect(changed.defaultPrevented).toBe(true);
    expect(guard()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });
});

describe('Cookbook: what a form sends', () => {
  it('suppresses the fields that do not apply to a type within the write, and brings them back as they were', () => {
    const kind = new Field({ value: 'text' });
    const isImage = new Statement(kind, Operator.EQUALS, 'image');
    const isText = new Statement(kind, Operator.NOT_EQUALS, 'image');

    const appliesWhen = (statement: Statement) => [
      new ConditionalAccessAction(statement),
      new ConditionalVisibilityAction(statement),
    ];

    const label = new Group({
      kind,
      text: new Field({ value: '', actions: appliesWhen(isText) }),
      src: new Field({ value: '', actions: appliesWhen(isImage) }),
    });

    label.fields.text.value = 'hello';
    expect(label.value).toEqual({ kind: 'text', text: 'hello' });
    expect(label.fields.src.visibility).toBe('suppress');

    kind.value = 'image';
    expect(label.value).toEqual({ kind: 'image', src: '' });
    expect(label.fields.src.visibility).toBe('full');
    expect(label.fields.text.visibility).toBe('suppress');

    kind.value = 'text';
    expect(label.value).toEqual({ kind: 'text', text: 'hello' });
  });

  it('applies the type rule per row of a list, and a watchEffect rule on the next flush', async () => {
    const kind = new Field({ value: 'text' });
    const row = new Group({
      kind,
      src: new Field({
        value: '',
        actions: [new ConditionalAccessAction(new Statement(kind, Operator.EQUALS, 'image'))],
      }),
    });
    const rows = new List(row, { value: [{ kind: 'image' }, { kind: 'text' }] });
    expect(rows.value).toEqual([{ kind: 'image', src: '' }, { kind: 'text' }]);

    const form = new Group({ kind: new Field({ value: 'text' }), src: new Field({ value: '' }) });
    watchEffect(() => {
      form.fields.src.access = form.fields.kind.value === 'image' ? 'editable' : 'disabled';
    });
    form.fields.kind.value = 'image';
    expect(form.value).toEqual({ kind: 'image' });
    await nextTick();
    expect(form.value).toEqual({ kind: 'image', src: '' });
  });

  it('sends an optional section as null while it is off, keeps what it holds, and does not check it', () => {
    const separateBilling = new Field({ value: false });
    const billingEnabled = new Statement(separateBilling, Operator.EQUALS, true);

    const billing = new Group(
      {
        street: new Field({ value: '', validators: [new Validators.Required()] }),
        city: new Field({ value: '', validators: [new Validators.Required()] }),
      },
      {
        actions: [
          new ConditionalAccessAction(billingEnabled, 'editable', 'disabled-null'),
          new ConditionalVisibilityAction(billingEnabled, 'full', 'hidden'),
        ],
      },
    );
    const form = new Group({ customer: new Field({ value: 'Ada' }), billing });

    expect(form.value).toEqual({ customer: 'Ada', billing: null });
    expect(billing.visibility).toBe('hidden');
    expect(form.valid).toBe(true);
    billing.fields.street.value = 'Main 1';
    expect(form.fullValue.billing).toEqual({ street: 'Main 1', city: '' });

    separateBilling.value = true;
    expect(form.value).toEqual({ customer: 'Ada', billing: { street: 'Main 1', city: '' } });
    expect(billing.visibility).toBe('full');
    expect(form.valid).toBe(false);

    const record = { customer: 'Grace', billing: null };
    form.value = record;
    separateBilling.value = record.billing != null;
    expect(form.value).toEqual({ customer: 'Grace', billing: null });
  });

  it('sends an optional section as null until the user starts it, and then wants it complete', async () => {
    const billing = new Group({ street: required(''), city: required('') });
    const form = new Group({ customer: new Field({ value: 'Ada' }), billing });
    watchEffect(() => {
      const started = Object.values(billing.fields).some((field) => !Validators.isEmptyValue(field.value));
      billing.access = started ? 'editable' : 'disabled-null';
    });

    expect(form.value).toEqual({ customer: 'Ada', billing: null });
    expect(form.valid).toBe(true);

    billing.fields.street.value = 'Main 1';
    await nextTick();
    expect(form.value).toEqual({ customer: 'Ada', billing: { street: 'Main 1', city: '' } });
    expect(form.valid).toBe(false);
  });

  it('draws a section that is not editable through effectiveEnabled, and sends it only where it is readonly', () => {
    const address = new Group({ city: new Field({ value: 'Kranj' }) });
    const form = new Group({ address, name: new Field({ value: 'x' }) });

    address.access = 'readonly';
    expect(address.fields.city.effectiveEnabled).toBe(false);
    expect(form.value).toEqual({ address: { city: 'Kranj' }, name: 'x' });

    address.access = 'disabled';
    expect(form.value).toEqual({ name: 'x' });
  });
});

describe('Cookbook: rules over several fields', () => {
  it('compares a date range with CompareTo by name', () => {
    const booking = new Group({
      from: new Field({ value: '' }),
      to: new Field({
        value: '',
        validators: [
          new Validators.CompareTo<string>('from', (to, from) => !to || !from || to >= from, {
            code: 'range_reversed',
            detail: 'The end is before the start',
          }),
        ],
      }),
    });

    expect(booking.valid).toBe(true);
    booking.fields.to.value = '2026-10-01';
    expect(booking.valid).toBe(true);
    booking.fields.from.value = '2026-10-11';
    expect(booking.fields.to.errors.map((error) => error.code)).toEqual(['range_reversed']);
    booking.fields.from.value = '2026-09-30';
    expect(booking.valid).toBe(true);
  });

  it('compares two fields of each row of a list with CompareTo', () => {
    const lineItem = new Group({
      quantity: new Field({ value: 1 }),
      unitPrice: new Field<number | null>({
        value: null,
        validators: [
          new Validators.CompareTo<number | null>('quantity', (price, quantity) => !(quantity! > 0 && price == null), {
            code: 'unit_price_required',
            detail: 'Unit price is required when quantity is above zero',
          }),
        ],
      }),
    });
    const lines = new List(lineItem, {
      value: [
        { quantity: 2, unitPrice: null },
        { quantity: 0, unitPrice: null },
      ],
    });

    expect(lines.get(0)!.fields.unitPrice.valid).toBe(false);
    expect(lines.get(1)!.fields.unitPrice.valid).toBe(true);
    lines.get(1)!.fields.quantity.value = 3;
    expect(lines.get(1)!.fields.unitPrice.valid).toBe(false);
  });

  it('reads the record in a validator over three fields, and validates it again when the others change', () => {
    const line = new Group({
      quantity: new Field({ value: 1 }),
      unitPrice: new Field({ value: 0 }),
      discount: new Field({ value: 0 }),
    });

    line.fields.discount.registerAction(
      new Validators.Validator((discount, oldValue, field) => {
        const row = field.parent;
        if (!(row instanceof Group)) {
          field.markRecordIncomplete();
          return null;
        }
        return discount > row.fields.quantity.value * row.fields.unitPrice.value
          ? [new ValidationError('discount_too_high', {}, 'The discount exceeds the line total')]
          : null;
      }),
    );

    // a new quantity or unit price sends the discount of the same row through its validators again
    const validateDiscount = new ValueChangedAction((field, supr, newValue, oldValue) => {
      const result = supr(field, newValue, oldValue);
      if (field.parent instanceof Group) field.parent.fields.discount.validate(true);
      return result;
    });
    line.fields.quantity.registerAction(validateDiscount);
    line.fields.unitPrice.registerAction(validateDiscount);

    const lines = new List(line, {
      value: [
        { quantity: 2, unitPrice: 10, discount: 5 },
        { quantity: 1, unitPrice: 3, discount: 5 },
      ],
    });

    expect(lines.get(0)!.fields.discount.valid).toBe(true);
    expect(lines.get(1)!.fields.discount.valid).toBe(false);
    lines.get(1)!.fields.unitPrice.value = 10;
    expect(lines.get(1)!.fields.discount.valid).toBe(true);
    lines.get(0)!.fields.quantity.value = 0;
    expect(lines.get(0)!.fields.discount.valid).toBe(false);
  });
});

describe('Cookbook: asynchronous validation with a debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends only the value that stayed unchanged for the delay, and drops the earlier runs', async () => {
    const requested: string[] = [];
    const fetch = vi.fn(async (url: string, init: { signal: AbortSignal }) => {
      requested.push(new URL(url, 'http://localhost').searchParams.get('name')!);
      init.signal.throwIfAborted();
      return { json: async () => ({ free: !url.includes('ada') }) };
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function delay(ms: number, signal: AbortSignal) {
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    }

    const available = new Validators.Validator<string>(async (name, oldName, field, signal) => {
      if (Validators.isEmptyValue(name)) return null;
      await delay(300, signal);
      const response = await fetch(`/api/available?${new URLSearchParams({ name })}`, { signal });
      return (await response.json()).free ? null : [new ValidationError('name_taken', {}, 'This name is taken')];
    });

    const username = new Field({ value: '', validators: [new Validators.Required(), available] });

    username.value = 'a';
    await vi.advanceTimersByTimeAsync(100);
    username.value = 'ad';
    await vi.advanceTimersByTimeAsync(100);
    username.value = 'ada';
    expect(username.validating).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await username.settled();

    expect(requested).toEqual(['ada']);
    expect(username.errors.map((error) => error.code)).toEqual(['name_taken']);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('Cookbook: a multi-step form', () => {
  it('shows one step at a time, moves on while the step is valid, and sends every step', () => {
    const step = new Field({ value: 0 });
    const onStep = (index: number) => new ConditionalVisibilityAction(new Statement(step, Operator.EQUALS, index));

    const signup = new Group({
      account: new Group(
        {
          email: new Field({ value: '', validators: [new Validators.Required()] }),
          password: new Field({ value: '', validators: [new Validators.Required(), new Validators.MinLength(12)] }),
        },
        { actions: [onStep(0)] },
      ),
      address: new Group(
        {
          street: new Field({ value: '', validators: [new Validators.Required()] }),
          city: new Field({ value: '', validators: [new Validators.Required()] }),
        },
        { actions: [onStep(1)] },
      ),
    });
    const steps = [signup.fields.account, signup.fields.address];
    const current = computed(() => steps[step.value]);

    expect(signup.fields.account.visibility).toBe('full');
    expect(signup.fields.address.visibility).toBe('suppress');
    expect(current.value.valid).toBe(false);

    signup.fields.account.value = { email: 'ada@example.com', password: 'correct horse' };
    expect(current.value.valid).toBe(true);
    step.value++;

    expect(signup.fields.account.visibility).toBe('suppress');
    expect(signup.fields.address.visibility).toBe('full');
    expect(current.value).toBe(signup.fields.address);
    expect(signup.valid).toBe(false);

    signup.fields.address.value = { street: 'Main 1', city: 'Kranj' };
    expect(signup.valid).toBe(true);
    expect(signup.value).toEqual({
      account: { email: 'ada@example.com', password: 'correct horse' },
      address: { street: 'Main 1', city: 'Kranj' },
    });
  });
});

describe('Cookbook: lists', () => {
  it('holds a list of plain values', () => {
    const tags = new List(new Field<string>({ validators: [new Validators.Required()] }));
    expect(tags.value).toEqual([]);
    tags.push('urgent');
    expect(tags.value).toEqual(['urgent']);
    tags.push('');
    expect(tags.valid).toBe(false);
  });

  it('moves a row with its state, and announces the move once', () => {
    function move(list: List, from: number, to: number) {
      transaction(() => {
        list.insert(list.remove(from)!, to);
      });
    }

    const list = new List(new Group({ name: new Field({ value: '' }) }), {
      value: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    });
    const announced: unknown[] = [];
    list.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => {
        announced.push(newValue);
        return supr(f, newValue, oldValue);
      }),
    );
    const row = list.get(0)!;
    row.fields.name.touched = true;
    row.fields.name.errors = [new ValidationError('checked', {}, 'Checked')];

    move(list, 0, 2);

    expect(list.value).toEqual([{ name: 'b' }, { name: 'c' }, { name: 'a' }]);
    expect(list.get(2)).toBe(row);
    expect(row.fields.name.touched).toBe(true);
    expect(row.fields.name.errors.map((error) => error.code)).toEqual(['checked']);
    expect(announced).toHaveLength(1);
  });
});

describe('Cookbook: unit-testing a form', () => {
  function createSignupForm(api: { isTaken: (name: string) => Promise<boolean> }) {
    return new Group({
      username: new Field({
        value: '',
        validators: [
          new Validators.Required(),
          new Validators.Validator<string>(async (name) =>
            (await api.isTaken(name)) ? [new ValidationError('name_taken', {}, 'This name is taken')] : null,
          ),
        ],
      }),
      email: new Field({ value: '', validators: [new Validators.Required()] }),
    });
  }

  it('rejects a taken user name', async () => {
    const form = createSignupForm({ isTaken: async (name) => name === 'ada' });

    form.fields.username.value = 'ada';
    await form.settled();

    expect(form.fields.username.errors.map((error) => error.code)).toEqual(['name_taken']);
    expect(form.valid).toBe(false);
  });

  it('sends what the user entered', async () => {
    const form = createSignupForm({ isTaken: async () => false });

    form.value = { username: 'grace', email: 'grace@example.com' };
    await form.settled();

    expect(form.valid).toBe(true);
    expect(form.value).toEqual({ username: 'grace', email: 'grace@example.com' });
  });
});

function createCart() {
  const pickup = new Field({ value: false });
  return view(
    new Group({
      items: new List(
        new Group({
          sku: new Field({ value: '' }),
          name: new Field({ value: '' }),
          price: new Field({ value: 0 }),
          quantity: new Field({ value: 1, validators: [new Validators.MinValue(1)] }),
        }),
      ),
      coupon: new Field<string | null>({ value: null }),
      pickup,
      delivery: new Group(
        {
          street: new Field({ value: '', validators: [new Validators.Required()] }),
          city: new Field({ value: '', validators: [new Validators.Required()] }),
        },
        // a cart collected in the shop sends no delivery address, and keeps the one typed in
        {
          actions: [
            new ConditionalAccessAction(new Statement(pickup, Operator.EQUALS, true), 'disabled-null', 'editable'),
          ],
        },
      ),
    }),
  );
}

describe('Cookbook: application state', () => {
  it('reads, derives and changes the state through its view', async () => {
    const cart = createCart();
    const total = computed(() => cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const coupons: unknown[] = [];
    watch(
      () => cart.coupon,
      (coupon) => coupons.push(coupon),
    );

    cart.items.push({ sku: 'm-1', name: 'Mug', price: 12, quantity: 2 });
    cart.items.push({ sku: 'b-1', name: 'Bowl', price: 20, quantity: 1 });
    cart.items[0].quantity = 3;
    cart.items.sort((a, b) => a.name.localeCompare(b.name));
    await nextTick();

    expect(total.value).toBe(56);
    expect(cart.items.map((item) => item.sku)).toEqual(['b-1', 'm-1']);
    expect(coupons).toEqual([]);

    cart.coupon = 'SPRING';
    await nextTick();
    expect(coupons).toEqual(['SPRING']);

    cart.delivery.street = 'Main 1';
    cart.pickup = true;
    // the view reads what the cart holds, and the cart sends null in its place
    expect(cart.delivery.street).toBe('Main 1');
    expect(cart.$.value.delivery).toBeNull();
    // the address still missing a city is not checked while it is not delivered
    expect(cart.$.valid).toBe(true);

    cart.pickup = false;
    expect(cart.delivery.street).toBe('Main 1');
    expect(cart.$.valid).toBe(false);
  });

  it('builds one state per call, so each test and each application starts from its own', () => {
    const first = createCart();
    const second = createCart();

    first.items.push({ sku: 'm-1', name: 'Mug', price: 12, quantity: 1 });

    expect(second.items).toEqual([]);
  });

  it('shares one cart with the components below the one that provides it, typed by its InjectionKey', () => {
    type Cart = ReturnType<typeof createCart>;
    const cartKey: InjectionKey<Cart> = Symbol('cart');

    function useCart(): Cart {
      const cart = inject(cartKey);
      if (!cart) throw new Error('useCart() is called below a component that provides the cart');
      return cart;
    }

    const seen: Cart[] = [];
    const Child = defineComponent({
      setup() {
        const cart = useCart();
        seen.push(cart);
        return () => h('span', cart.items.length);
      },
    });
    const owned = createCart();
    const Owner = defineComponent({
      setup() {
        provide(cartKey, owned);
        return () => h('div', [h(Child), h(Child)]);
      },
    });

    mount(Owner);
    expect(seen).toEqual([owned, owned]);
    expect(() => mount(Child)).toThrow('useCart()');
  });
});

const createState = () =>
  new Group({
    name: new Field({ value: 'Ada' }),
    secret: new Field({ value: 's', access: 'disabled' }),
    items: new List(new Group({ sku: new Field({ value: '' }) }), { value: [{ sku: 'a' }] }),
  });

describe('Cookbook: keeping state across a hot module replacement', () => {
  it('restores what the old instance held, its baseline and what it reports as changed', () => {
    const old = createState();
    old.fields.name.value = 'Grace';
    old.fields.secret.value = 't';
    old.fields.items.push({ sku: 'b' });
    // import.meta.hot.dispose
    const data = { original: old.originalValue, full: old.fullValue };

    // the module runs again and builds a new instance
    const state = createState();
    state.rebind(data.original);
    state.value = data.full;

    expect(state.fullValue).toEqual(old.fullValue);
    expect(state.value).toEqual(old.value);
    expect(state.isChanged).toBe(true);
    expect(state.originalValue).toEqual(old.originalValue);
  });

  it("stops the old module's effects with its scope", async () => {
    const scope = effectScope();
    const { cart, total } = scope.run(() => {
      const cart = createCart();
      const total = computed(() => cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
      return { cart, total };
    })!;
    const runs = vi.fn();
    scope.run(() => watchEffect(() => runs(total.value)));
    expect(runs).toHaveBeenCalledTimes(1);

    // import.meta.hot.dispose
    scope.stop();
    cart.items.push({ sku: 'm-1', name: 'Mug', price: 12, quantity: 2 });
    await nextTick();

    expect(runs).toHaveBeenCalledTimes(1);
  });
});

describe('Cookbook: carrying server-rendered state to the client', () => {
  it('rebinds the client instance to the serialized fullValue, members that are not sent included', () => {
    const server = createState();
    server.fields.secret.value = 'from-db';
    const payload = JSON.stringify(server.fullValue);

    const client = createState();
    client.rebind(JSON.parse(payload));

    expect(client.fullValue).toEqual(server.fullValue);
    expect(client.fields.secret.value).toBe('from-db');
    expect(client.isChanged).toBe(false);
  });
});

describe('Cookbook: free-form state', () => {
  it('builds the element tree from data and adds a key through the view', () => {
    const settings = view(Group.createFromFormData({ theme: 'dark', panels: [{ id: 1 }], editor: { tabSize: 2 } }));

    settings.$.addField('fontSize', new Field({ value: 14 }));
    (settings as any).editor.tabSize = 4;

    expect(settings.$.fullValue).toEqual({ theme: 'dark', panels: [{ id: 1 }], editor: { tabSize: 4 }, fontSize: 14 });
  });
});

describe('Cookbook: data from a server cache', () => {
  const createPersonForm = () => new Group({ name: new Field({ value: '' }), age: new Field({ value: 0 }) });

  it('rebinds the form to each result while it holds no edits, to the saved record, and on a discard', async () => {
    const data = ref<any>(undefined);
    const form = createPersonForm();
    watch(
      data,
      (person) => {
        if (person && !form.isChanged) form.rebind(person);
      },
      { immediate: true },
    );
    const save = new Action({
      actions: [
        new SubmitAction(form, async (value) => {
          const saved = { ...value, age: 37 };
          data.value = saved;
          return saved;
        }),
      ],
    });

    function discard() {
      if (data.value) form.rebind(data.value);
    }

    data.value = { name: 'Ada', age: 36 };
    await nextTick();
    expect(form.value).toEqual({ name: 'Ada', age: 36 });

    form.fields.name.value = 'Grace';
    data.value = { name: 'Ada', age: 40 };
    await nextTick();
    expect(form.value).toEqual({ name: 'Grace', age: 36 });

    // the baseline is the record the form was last rebound to, older than the cache
    expect(form.originalValue).toEqual({ name: 'Ada', age: 36 });
    discard();
    expect(form.value).toEqual({ name: 'Ada', age: 40 });
    expect(form.isChanged).toBe(false);

    form.fields.name.value = 'Grace';
    await save.execute();
    await nextTick();
    expect(form.value).toEqual({ name: 'Grace', age: 37 });
    expect(form.isChanged).toBe(false);
  });

  it('builds a free-form tree from the first result and rebinds it to the following ones', async () => {
    const data = ref<any>({ editor: { tabSize: 2 }, theme: 'dark' });
    const settings = shallowRef<Group>();
    watch(
      data,
      (fetched) => {
        if (!fetched) return;
        if (!settings.value) settings.value = Group.createFromFormData(fetched);
        else if (!settings.value.isChanged) settings.value.rebind(fetched);
      },
      { immediate: true },
    );
    const first = settings.value;

    data.value = { editor: { tabSize: 4 }, extra: 1 };
    await nextTick();

    expect(settings.value).toBe(first);
    expect(settings.value!.value).toEqual({ editor: { tabSize: 4 }, theme: 'dark' });
  });
});

describe('Cookbook: a value loaded for another value', () => {
  it('writes the answer for the current source and drops an answer that a newer source replaced', async () => {
    const form = new Group({ postcode: new Field({ value: '' }), city: new Field({ value: '' }) });
    const pending: Record<string, (city: string) => void> = {};
    const api = {
      city: (postcode: string) =>
        new Promise<string>((resolve) => {
          pending[postcode] = resolve;
        }),
    };
    watch(
      () => form.fields.postcode.value,
      async (postcode, _, onCleanup) => {
        let current = true;
        onCleanup(() => {
          current = false;
        });
        const city = postcode ? await api.city(postcode) : '';
        if (current) form.fields.city.value = city;
      },
    );

    form.fields.postcode.value = '1000';
    await nextTick();
    form.fields.postcode.value = '4260';
    await nextTick();
    pending['4260']('Bled');
    pending['1000']('Ljubljana');
    await new Promise((resolve) => setTimeout(resolve));

    expect(form.fields.city.value).toBe('Bled');
  });
});

describe('Cookbook: reacting to every change below an element', () => {
  it('announces a transaction once on the container, and what it sends on a change of access too', () => {
    const state = createState();
    const values: unknown[] = [];
    const sent: unknown[] = [];
    const saveDraft = (value: unknown) => values.push(value);
    state.registerAction(
      new ValueChangedAction((element, supr, newValue, oldValue) => {
        saveDraft(newValue); // the container's fullValue
        return supr(element, newValue, oldValue);
      }),
    );
    state.registerAction(
      new ContributionChangedAction(
        (f, supr, newValue, oldValue) => (sent.push(newValue), supr(f, newValue, oldValue)),
      ),
    );

    transaction(() => {
      state.fields.name.value = 'Grace';
      state.fields.items.push({ sku: 'b' });
    });
    state.fields.secret.access = 'editable';

    expect(values).toEqual([{ name: 'Grace', secret: 's', items: [{ sku: 'a' }, { sku: 'b' }] }]);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ name: 'Grace', secret: 's', items: [{ sku: 'a' }, { sku: 'b' }] });
  });
});

describe('Cookbook: an optimistic update', () => {
  async function rename(field: Field<string>, name: string, api: { rename: (name: string) => Promise<void> }) {
    const previous = field.value;
    field.value = name;
    try {
      await api.rename(name);
    } catch (error) {
      // a newer write made while the request was out is kept
      if (field.value === name) field.value = previous;
      throw error;
    }
    // the server holds the name: it becomes the baseline, so isChanged is false
    if (field.value === name) field.rebind(name);
  }

  it('makes the saved value the baseline', async () => {
    const field = new Field({ value: 'Ada' });

    await rename(field, 'Grace', { rename: async () => undefined });

    expect(field.value).toBe('Grace');
    expect(field.isChanged).toBe(false);
  });

  it('puts the previous value back when the server refuses', async () => {
    const field = new Field({ value: 'Ada' });

    await expect(rename(field, 'Grace', { rename: () => Promise.reject(new Error('refused')) })).rejects.toThrow(
      'refused',
    );

    expect(field.value).toBe('Ada');
  });

  it('keeps a newer write made while the request was out', async () => {
    const field = new Field({ value: 'Ada' });
    let refuse: (error: Error) => void = () => null;
    let accept: () => void = () => null;
    const refused = rename(field, 'Grace', { rename: () => new Promise((resolve, reject) => (refuse = reject)) });

    field.value = 'Linus';
    refuse(new Error('refused'));

    await expect(refused).rejects.toThrow('refused');
    expect(field.value).toBe('Linus');

    const accepted = rename(field, 'Grace', { rename: () => new Promise<void>((resolve) => (accept = resolve)) });
    field.value = 'Margaret';
    accept();
    await accepted;
    expect(field.value).toBe('Margaret');
    expect(field.isChanged).toBe(true);
  });
});

describe('Cookbook: SubmitAction results', () => {
  it('resolves with a CommandException where nothing was saved', async () => {
    const form = new Group({ name: required('') });
    const save = new Action({ actions: [new SubmitAction(form, async (value) => value)] });

    expect(await save.execute()).toBeInstanceOf(CommandException);
  });
});
