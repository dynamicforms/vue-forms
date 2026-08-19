import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { Validators } from './validators';

describe('a rule written against a field of an enclosing row', () => {
  const buildOrders = (target: any) => {
    const lineTemplate = new Group({ amount: new Field<number>({ value: 0 }) });
    const orderTemplate = new Group({
      total: new Field<number>({ value: 0 }),
      lines: new List(lineTemplate),
    });
    lineTemplate.fields.amount.registerAction(
      new Validators.CompareTo<number>(target(orderTemplate), (amount, total) => amount <= total, 'over the total'),
    );
    return new List(orderTemplate);
  };

  it('reads the row it runs in, whether it names the field or the name', () => {
    for (const target of [(t: any) => t.fields.total, () => 'total']) {
      const orders = buildOrders(target);
      orders.push({ total: 250, lines: [{ amount: 100 }, { amount: 400 }] });
      orders.push({ total: 50, lines: [{ amount: 100 }] });

      const lines = (row: number) => orders.get(row)!.fields.lines;
      // 100 fits in this order's 250, 400 does not
      expect(lines(0).get(0)!.fields.amount.valid).toBe(true);
      expect(lines(0).get(1)!.fields.amount.valid).toBe(false);
      // the same 100 does not fit in the next order's 50, so the rows answer for themselves
      expect(lines(1).get(0)!.fields.amount.valid).toBe(false);
    }
  });

  it('follows the enclosing row when its field changes', () => {
    const orders = buildOrders((t: any) => t.fields.total);
    orders.push({ total: 50, lines: [{ amount: 100 }] });
    const amount = orders.get(0)!.fields.lines.get(0)!.fields.amount;

    expect(amount.valid).toBe(false);
    orders.get(0)!.fields.total.value = 250;
    expect(amount.valid).toBe(true);
  });

  it('leaves a field above the list as the one every row reads', () => {
    const rowTemplate = new Group({ amount: new Field<number>({ value: 0 }) });
    const form = new Group({
      maxAmount: new Field<number>({ value: 50 }),
      rows: new List(rowTemplate),
    });
    rowTemplate.fields.amount.registerAction(
      new Validators.CompareTo<number>(form.fields.maxAmount, (a, max) => a <= max, 'too big'),
    );

    form.fields.rows.push({ amount: 10 });
    form.fields.rows.push({ amount: 999 });

    expect(form.fields.rows.get(0)!.fields.amount.valid).toBe(true);
    expect(form.fields.rows.get(1)!.fields.amount.valid).toBe(false);
  });
});
