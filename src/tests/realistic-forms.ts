import { ConditionalAccessAction, ConditionalVisibilityAction, Operator, Statement } from '../actions';
import { Field } from '../field';
import type { FieldBase } from '../field-base';
import { Group } from '../group';
import { List } from '../list';
import { Validators } from '../validators';

/**
 * Forms shaped like the ones an application builds, with the records it loads into them. The invariant specs run
 * every check over each of them, so a rule that holds for a plain field but not for a conditional member, a
 * disabled row or a nested list fails there.
 */
export interface RealisticForm {
  name: string;
  /** Builds the form holding `record`: the declaration with its rules, bound to the record. */
  build: (record?: any) => Group<any>;
  /** Records the application loads: each differs from the others in what the conditional rules decide. */
  records: any[];
  /** Values a user types into a leaf, by the leaf's name. */
  inputs: Record<string, unknown[]>;
  /** Rows a user adds to a list, by the list's name. */
  newRows: Record<string, unknown[]>;
}

const contactTemplate = () => {
  const row = new Group({
    kind: new Field({ value: 'email' }),
    address: new Field({ value: '', validators: [new Validators.Required()] }),
    note: new Field({ value: '' }),
  });
  row.fields.note.registerAction(
    new ConditionalVisibilityAction(new Statement(row.fields.kind, Operator.EQUALS, 'phone'), 'full', 'hidden'),
  );
  return row;
};

/** A customer: the VAT id applies to a company only, the contacts are a list with a rule per row. */
const customer: RealisticForm = {
  name: 'customer',
  build: (record) => {
    const form = new Group({
      name: new Field({ value: '', validators: [new Validators.Required()] }),
      isCompany: new Field({ value: false }),
      vatId: new Field({ value: '', validators: [new Validators.Required(), new Validators.MinLength(8)] }),
      address: new Group({
        street: new Field({ value: '' }),
        city: new Field({ value: '', validators: [new Validators.Required()] }),
      }),
      contacts: new List(contactTemplate()),
    });
    form.fields.vatId.registerAction(
      new ConditionalAccessAction(new Statement(form.fields.isCompany, Operator.EQUALS, true), 'editable', 'disabled'),
    );
    return record === undefined ? form : form.bind(record);
  },
  records: [
    {
      name: 'Ana',
      isCompany: false,
      vatId: '',
      address: { street: 'Main 1', city: 'Ljubljana' },
      contacts: [{ kind: 'email', address: 'ana@example.com', note: '' }],
    },
    {
      name: 'Acme',
      isCompany: true,
      vatId: 'SI12345678',
      address: { street: 'Dock 4', city: 'Koper' },
      contacts: [
        { kind: 'phone', address: '+386 1 234', note: 'mornings' },
        { kind: 'email', address: 'office@acme.example', note: '' },
      ],
    },
    {
      name: 'Bor',
      isCompany: true,
      vatId: 'SI87654321',
      address: { street: '', city: 'Maribor' },
      contacts: [],
    },
  ],
  inputs: {
    name: ['Ana', 'Acme d.o.o.', ''],
    isCompany: [true, false],
    vatId: ['SI11112222', 'x'],
    street: ['Side 2', ''],
    city: ['Celje', ''],
    kind: ['email', 'phone'],
    address: ['new@example.com', ''],
    note: ['evenings', ''],
  },
  newRows: { contacts: [{ kind: 'phone', address: '+386 2 000', note: '' }, { kind: 'email' }] },
};

const lineTemplate = () => {
  const row = new Group({
    product: new Field({ value: '', validators: [new Validators.Required()] }),
    quantity: new Field({ value: 1, validators: [new Validators.MinValue(1)] }),
    kind: new Field({ value: 'stock' }),
    description: new Field({ value: '', validators: [new Validators.Required()] }),
    status: new Field({ value: 'open' }),
  });
  row.fields.description.registerAction(
    new ConditionalAccessAction(new Statement(row.fields.kind, Operator.EQUALS, 'custom'), 'editable', 'disabled'),
  );
  // a cancelled line is kept on screen and left out of what the order sends
  row.registerAction(
    new ConditionalAccessAction(new Statement(row.fields.status, Operator.EQUALS, 'cancelled'), 'disabled', 'editable'),
  );
  return row;
};

/** An order: lines with a custom description and a cancelled status, and a delivery address that can be omitted. */
const order: RealisticForm = {
  name: 'order',
  build: (record) => {
    const form = new Group({
      number: new Field({ value: '' }),
      separateDelivery: new Field({ value: false }),
      delivery: new Group({
        street: new Field({ value: '' }),
        city: new Field({ value: '', validators: [new Validators.Required()] }),
      }),
      lines: new List(lineTemplate()),
    });
    form.fields.delivery.registerAction(
      new ConditionalAccessAction(
        new Statement(form.fields.separateDelivery, Operator.EQUALS, true),
        'editable',
        'disabled',
      ),
    );
    return record === undefined ? form : form.bind(record);
  },
  records: [
    {
      number: 'O-1',
      separateDelivery: false,
      delivery: { street: '', city: '' },
      lines: [{ product: 'chair', quantity: 4, kind: 'stock', description: '', status: 'open' }],
    },
    {
      number: 'O-2',
      separateDelivery: true,
      delivery: { street: 'Port 3', city: 'Izola' },
      lines: [
        { product: 'table', quantity: 1, kind: 'custom', description: 'oak, 2 m', status: 'open' },
        { product: 'lamp', quantity: 2, kind: 'stock', description: '', status: 'cancelled' },
        { product: 'shelf', quantity: 3, kind: 'custom', description: 'pine', status: 'open' },
      ],
    },
    {
      number: 'O-3',
      separateDelivery: false,
      delivery: { street: 'Port 3', city: 'Izola' },
      lines: [{ product: 'desk', quantity: 1, kind: 'custom', description: 'walnut', status: 'cancelled' }],
    },
  ],
  inputs: {
    number: ['O-9', ''],
    separateDelivery: [true, false],
    street: ['Bay 7', ''],
    city: ['Piran', ''],
    product: ['sofa', ''],
    quantity: [5, 0],
    kind: ['stock', 'custom'],
    description: ['linen', ''],
    status: ['open', 'cancelled'],
  },
  newRows: { lines: [{ product: 'rug', quantity: 1, kind: 'custom', description: 'wool' }, {}] },
};

export const realisticForms: RealisticForm[] = [customer, order];

/** What an element exposes to a rendering layer and to the code that sends it, for every element of a tree. */
export function snapshot(element: FieldBase, path = '$'): Record<string, unknown> {
  const own = {
    value: element.value,
    originalValue: element.originalValue,
    isChanged: element.isChanged,
    access: element.access,
    visibility: element.visibility,
    valid: element.valid,
    errors: element.errors.map((error) => error.code),
    touched: element.touched,
  };
  const result: Record<string, unknown> = { [path]: own };
  if (element instanceof Group) {
    Object.entries(element.fields as Record<string, FieldBase>).forEach(([name, member]) =>
      Object.assign(result, snapshot(member, `${path}.${name}`)),
    );
  } else if (element instanceof List) {
    result[`${path}.length`] = element.length;
    for (let index = 0; index < element.length; index++) {
      Object.assign(result, snapshot(element.get(index)!, `${path}[${index}]`));
    }
  }
  return result;
}

/** Every leaf of the tree with its name, rows included. */
export function leaves(element: FieldBase, name = ''): { name: string; field: Field<any> }[] {
  if (element instanceof Group)
    return Object.entries(element.fields as Record<string, FieldBase>).flatMap(([key, member]) => leaves(member, key));
  if (element instanceof List) {
    const rows: { name: string; field: Field<any> }[] = [];
    for (let index = 0; index < element.length; index++) rows.push(...leaves(element.get(index)!, name));
    return rows;
  }
  return element instanceof Field ? [{ name, field: element }] : [];
}

/** Every list of the tree with its name. */
export function lists(element: FieldBase, name = ''): { name: string; list: List<any> }[] {
  if (element instanceof Group)
    return Object.entries(element.fields as Record<string, FieldBase>).flatMap(([key, member]) => lists(member, key));
  if (element instanceof List) {
    const found: { name: string; list: List<any> }[] = [{ name, list: element }];
    for (let index = 0; index < element.length; index++) found.push(...lists(element.get(index)!, ''));
    return found;
  }
  return [];
}

/** A deterministic sequence of numbers in [0, 1), so a failing run is repeated by its seed. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Makes one edit a user can make: types a value into an editable leaf, adds a row or removes one. Returns a
 * description of the edit, for the message of a failing check.
 */
export function edit(form: Group<any>, fixture: RealisticForm, next: () => number): string {
  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];
  const choice = next();
  const allLists = lists(form).filter(({ name }) => fixture.newRows[name]);
  if (choice < 0.15 && allLists.length) {
    const { name, list } = pick(allLists);
    list.push(pick(fixture.newRows[name]) as any);
    return `push ${name}`;
  }
  if (choice < 0.25 && allLists.length) {
    const { name, list } = pick(allLists);
    if (list.length === 0) return `remove ${name}: empty`;
    const index = Math.floor(next() * list.length);
    list.remove(index);
    return `remove ${name}[${index}]`;
  }
  const editable = leaves(form).filter(({ name, field }) => field.enabled && fixture.inputs[name]);
  if (!editable.length) return 'no editable leaf';
  const { name, field } = pick(editable);
  const value = pick(fixture.inputs[name]);
  field.value = value;
  field.touched = true;
  return `${name} = ${JSON.stringify(value)}`;
}
