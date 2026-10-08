import { ValueChangedAction } from './actions';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { ValidationError, Validators } from './validators';

/** a unit price that is required while the quantity of the same row is above zero */
function lineItem() {
  const template = new Group({
    quantity: new Field({ value: 1 }),
    unitPrice: new Field<number | null>({ value: null }),
  });
  template.fields.unitPrice.registerAction(
    new Validators.Validator((newValue, oldValue, field) => {
      const row = field.parent;
      if (!(row instanceof Group)) {
        field.markRecordIncomplete();
        return null;
      }
      return row.fields.quantity.value > 0 && newValue == null
        ? [new ValidationError('invalid', {}, 'required')]
        : null;
    }),
  );
  return template;
}

describe('A rule that reads another field of its record', () => {
  it('reaches its verdict over the data a row is built with', () => {
    const lines = new List(lineItem(), {
      value: [
        { quantity: 2, unitPrice: null },
        { quantity: 0, unitPrice: null },
      ],
    });

    expect(lines.get(0)!.fields.unitPrice.valid).toBe(false);
    expect(lines.get(1)!.fields.unitPrice.valid).toBe(true);
  });

  it('reaches its verdict over the data a pushed row and a bound group are built with', () => {
    const lines = new List(lineItem());
    lines.push({ quantity: 0, unitPrice: null });
    expect(lines.get(0)!.fields.unitPrice.valid).toBe(true);

    expect(lineItem().bind({ quantity: 0, unitPrice: null }).fields.unitPrice.valid).toBe(true);
  });

  it('still reaches its verdict where the group is built empty and gains its members later', () => {
    const quantity = new Field({ value: 3 });
    const unitPrice = lineItem().fields.unitPrice.bind();
    const row = new Group({ quantity });

    row.addField('unitPrice', unitPrice);

    expect(unitPrice.valid).toBe(false);
  });

  it('follows the other field once the row exists, through an action on it', () => {
    const template = lineItem();
    template.fields.quantity.registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        const result = supr(field, newValue, oldValue);
        if (field.parent instanceof Group) field.parent.fields.unitPrice.validate(true);
        return result;
      }),
    );
    const lines = new List(template, { value: [{ quantity: 0, unitPrice: null }] });

    lines.get(0)!.fields.quantity.value = 5;

    expect(lines.get(0)!.fields.unitPrice.valid).toBe(false);
  });
});
