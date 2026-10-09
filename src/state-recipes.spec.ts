import { nextTick, ref, shallowRef, watch } from 'vue';

import {
  Action,
  ContributionChangedAction,
  Field,
  Group,
  List,
  SubmitAction,
  transaction,
  ValueChangedAction,
  view,
} from './index';

const createState = () =>
  new Group({
    name: new Field({ value: 'Ada' }),
    secret: new Field({ value: 's', access: 'disabled' }),
    items: new List(new Group({ sku: new Field({ value: '' }) }), { value: [{ sku: 'a' }] }),
  });

describe('cookbook: keeping state across a hot module replacement', () => {
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
});

describe('cookbook: carrying server-rendered state to the client', () => {
  it('rebinds the client instance to the serialized fullValue, members that are not sent included', () => {
    const server = createState();
    server.fields.secret.value = 'from-db';
    const payload = JSON.parse(JSON.stringify(server.fullValue));

    const client = createState();
    client.rebind(payload);

    expect(client.fullValue).toEqual(server.fullValue);
    expect(client.fields.secret.value).toBe('from-db');
    expect(client.isChanged).toBe(false);
  });
});

describe('cookbook: free-form state', () => {
  it('builds the element tree from data and adds a key through the view', () => {
    const settings = view(Group.createFromFormData({ theme: 'dark', panels: [{ id: 1 }], editor: { tabSize: 2 } }));

    settings.$.addField('fontSize', new Field({ value: 14 }));
    (settings as any).editor.tabSize = 4;

    expect(settings.$.fullValue).toEqual({ theme: 'dark', panels: [{ id: 1 }], editor: { tabSize: 4 }, fontSize: 14 });
  });
});

describe('cookbook: reacting to every change below an element', () => {
  it('announces a transaction once on the container, and what it sends on a change of access too', () => {
    const state = createState();
    const values: unknown[] = [];
    const sent: unknown[] = [];
    state.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => (values.push(newValue), supr(f, newValue, oldValue))),
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

    expect(values).toHaveLength(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ name: 'Grace', secret: 's', items: [{ sku: 'a' }, { sku: 'b' }] });
  });
});

describe('cookbook: an optimistic update', () => {
  async function rename(field: Field<string>, name: string, save: (name: string) => Promise<void>) {
    const previous = field.value;
    field.value = name;
    try {
      await save(name);
    } catch (error) {
      // a newer write made while the request was out is kept
      if (field.value === name) field.value = previous;
      throw error;
    }
  }

  it('puts the previous value back when the server refuses', async () => {
    const field = new Field({ value: 'Ada' });

    await expect(rename(field, 'Grace', () => Promise.reject(new Error('refused')))).rejects.toThrow('refused');

    expect(field.value).toBe('Ada');
  });

  it('keeps a newer write made while the request was out', async () => {
    const field = new Field({ value: 'Ada' });
    let refuse: (error: Error) => void = () => null;
    const pending = rename(field, 'Grace', () => new Promise((resolve, reject) => (refuse = reject)));

    field.value = 'Linus';
    refuse(new Error('refused'));

    await expect(pending).rejects.toThrow('refused');
    expect(field.value).toBe('Linus');
  });
});

describe('cookbook: data from a server cache', () => {
  const createPersonForm = () => new Group({ name: new Field({ value: '' }), age: new Field({ value: 0 }) });

  it('rebinds the form to each result while it holds no edits, and to what the submit saved', async () => {
    const cache = ref<any>(undefined);
    const form = createPersonForm();
    watch(
      cache,
      (person) => {
        if (person && !form.isChanged) form.rebind(person);
      },
      { immediate: true },
    );
    const save = new Action({
      actions: [
        new SubmitAction(form, async (value) => {
          const saved = { ...value, age: 37 };
          cache.value = saved;
          return saved;
        }),
      ],
    });

    cache.value = { name: 'Ada', age: 36 };
    await nextTick();
    expect(form.value).toEqual({ name: 'Ada', age: 36 });

    form.fields.name.value = 'Grace';
    cache.value = { name: 'Ada', age: 40 };
    await nextTick();
    expect(form.value).toEqual({ name: 'Grace', age: 36 });

    await save.execute();
    await nextTick();
    expect(form.value).toEqual({ name: 'Grace', age: 37 });
    expect(form.isChanged).toBe(false);
  });

  it('builds a free-form tree from the first result and rebinds it to the following ones', async () => {
    const cache = ref<any>({ editor: { tabSize: 2 }, theme: 'dark' });
    const settings = shallowRef<Group>();
    watch(
      cache,
      (fetched) => {
        if (!fetched) return;
        if (!settings.value) settings.value = Group.createFromFormData(fetched);
        else if (!settings.value.isChanged) settings.value.rebind(fetched);
      },
      { immediate: true },
    );
    const first = settings.value;

    cache.value = { editor: { tabSize: 4 }, extra: 1 };
    await nextTick();

    expect(settings.value).toBe(first);
    expect(settings.value!.value).toEqual({ editor: { tabSize: 4 }, theme: 'dark' });
  });
});

describe('cookbook: a value loaded for another value', () => {
  it('writes the answer for the current source and drops an answer that a newer source replaced', async () => {
    const form = new Group({ postcode: new Field({ value: '' }), city: new Field({ value: '' }) });
    const pending: Record<string, (city: string) => void> = {};
    const city = (postcode: string) =>
      new Promise<string>((resolve) => {
        pending[postcode] = resolve;
      });
    watch(
      () => form.fields.postcode.value,
      async (postcode, _, onCleanup) => {
        let current = true;
        onCleanup(() => {
          current = false;
        });
        const result = postcode ? await city(postcode) : '';
        if (current) form.fields.city.value = result;
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
