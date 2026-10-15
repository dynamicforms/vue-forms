import { accessValues } from '../access';
import { ConditionalAccessAction, ConditionalVisibilityAction, Operator, Statement } from '../actions';
import type { FieldActionBase } from '../actions';
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
  /** Builds the form holding `record` by passing it to the constructor as its value, and then registers its rules. */
  construct: (record: any) => Group<any>;
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

const declareCustomer = (record?: any) => {
  const form = new Group(
    {
      name: new Field({ value: '', validators: [new Validators.Required()] }),
      isCompany: new Field({ value: false }),
      vatId: new Field({ value: '', validators: [new Validators.Required(), new Validators.MinLength(8)] }),
      address: new Group({
        street: new Field({ value: '' }),
        city: new Field({ value: '', validators: [new Validators.Required()] }),
      }),
      contacts: new List(contactTemplate()),
    },
    record === undefined ? undefined : { value: record },
  );
  form.fields.vatId.registerAction(
    new ConditionalAccessAction(new Statement(form.fields.isCompany, Operator.EQUALS, true), 'editable', 'disabled'),
  );
  return form;
};

/** A customer: the VAT id applies to a company only, the contacts are a list with a rule per row. */
const customer: RealisticForm = {
  name: 'customer',
  build: (record) => (record === undefined ? declareCustomer() : declareCustomer().bind(record)),
  construct: declareCustomer,
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

const declareOrder = (record?: any) => {
  const form = new Group(
    {
      number: new Field({ value: '' }),
      separateDelivery: new Field({ value: false }),
      delivery: new Group({
        street: new Field({ value: '' }),
        city: new Field({ value: '', validators: [new Validators.Required()] }),
      }),
      lines: new List(lineTemplate()),
    },
    record === undefined ? undefined : { value: record },
  );
  form.fields.delivery.registerAction(
    new ConditionalAccessAction(
      new Statement(form.fields.separateDelivery, Operator.EQUALS, true),
      'editable',
      'disabled',
    ),
  );
  return form;
};

/** An order: lines with a custom description and a cancelled status, and a delivery address that can be omitted. */
const order: RealisticForm = {
  name: 'order',
  build: (record) => (record === undefined ? declareOrder() : declareOrder().bind(record)),
  construct: declareOrder,
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

/** Every element of the tree with its path, in the order snapshot() lists them. */
export function elements(element: FieldBase, path = '$'): { path: string; element: FieldBase }[] {
  const found = [{ path, element }];
  if (element instanceof Group) {
    Object.entries(element.fields as Record<string, FieldBase>).forEach(([name, member]) =>
      found.push(...elements(member, `${path}.${name}`)),
    );
  } else if (element instanceof List) {
    for (let index = 0; index < element.length; index++)
      found.push(...elements(element.get(index)!, `${path}[${index}]`));
  }
  return found;
}

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
/** A number that identifies `item` for the duration of the run, so two structures compare by identity. */
const identity = (item: object | undefined): number | undefined => {
  if (!item) return undefined;
  if (!identities.has(item)) identities.set(item, nextIdentity++);
  return identities.get(item);
};

/** The registered rules of an element, in registration order: the ones of its declaration, shared by its bindings. */
const registrations = (element: FieldBase): readonly FieldActionBase[] =>
  (element as any).boundActions?.registrations ?? [];

/**
 * What a snapshot does not show, for every element of a tree in the order of its container: which element it is,
 * the container and the name it is held under, and the rules registered on it in their order. Elements and rules
 * are listed by identity.
 */
export function structure(form: FieldBase): Record<string, unknown>[] {
  return elements(form).map(({ path, element }) => ({
    path,
    element: identity(element),
    parent: identity(element.parent),
    fieldName: element.fieldName,
    rules: registrations(element).map(identity),
  }));
}

/**
 * The paths whose element is not held by the container its `parent` names: a member of a group is held under its
 * `fieldName`, a row of a list is one of its rows.
 */
export function detachedLinks(form: FieldBase): string[] {
  return elements(form)
    .filter(({ element }) => {
      const parent = element.parent;
      if (element === form) return parent !== undefined && !(parent instanceof Group || parent instanceof List);
      if (parent instanceof Group) return (parent.fields as Record<string, FieldBase>)[element.fieldName!] !== element;
      if (parent instanceof List) return !parent.items.includes(element as any);
      return true;
    })
    .map(({ path }) => path);
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

/**
 * Makes one edit of what a form consists of, as code that adapts a form does: registers a validator or a
 * visibility rule, unregisters a rule, clears the validators, writes an access, adds a member to a group or removes
 * one. Returns a description of the edit, for the message of a failing check.
 */
export function structuralEdit(form: Group<any>, next: () => number): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const all = elements(form);
  const choice = next();
  if (choice < 0.2) {
    const { path, element } = pick(all);
    element.registerAction(new Validators.Required());
    return `register Required on ${path}`;
  }
  if (choice < 0.3) {
    // a rule on an element outside the lists, over another such leaf: a row's rule is declared on its template
    const outside = all.filter(({ path }) => !path.includes('['));
    const sources = outside.filter(({ element }) => element instanceof Field);
    const { path, element } = pick(outside);
    const source = pick(sources);
    element.registerAction(
      new ConditionalVisibilityAction(new Statement(source.element, Operator.EQUALS, ''), 'hidden', 'full'),
    );
    return `register visibility on ${path} over ${source.path}`;
  }
  if (choice < 0.5) {
    const registered = all.filter(({ element }) => registrations(element).length);
    if (!registered.length) return 'unregister: nothing registered';
    const { path, element } = pick(registered);
    const rules = registrations(element);
    const index = Math.floor(next() * rules.length);
    element.unregisterAction(rules[index]);
    return `unregister ${rules[index].constructor.name} [${index}] of ${path}`;
  }
  if (choice < 0.6) {
    const { path, element } = pick(all);
    element.clearValidators();
    return `clear validators of ${path}`;
  }
  if (choice < 0.8) {
    const { path, element } = pick(all);
    const access = pick(accessValues);
    element.access = access;
    return `${path}.access = ${access}`;
  }
  const groups = all.filter(({ element }) => element instanceof Group) as { path: string; element: Group<any> }[];
  const { path, element: group } = pick(groups);
  if (choice < 0.9) {
    const name = `added${Math.floor(next() * 1000)}`;
    if (name in group.fields) return `add ${path}.${name}: present`;
    group.addField(name, new Field({ value: name, validators: [new Validators.Required()] }));
    return `add ${path}.${name}`;
  }
  const names = Object.keys(group.fields);
  if (!names.length) return `remove from ${path}: empty`;
  const name = pick(names);
  group.removeField(name);
  return `remove ${path}.${name}`;
}
