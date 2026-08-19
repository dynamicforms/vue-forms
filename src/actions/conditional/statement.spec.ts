import Operator from './operator';
import { Statement } from './statement';

import { Field } from '@/field';
import { Group } from '@/group';
import { List } from '@/list';

describe('Statement', () => {
  it('evaluates simple comparison with literals', () => {
    const statement = new Statement(5, Operator.EQUALS, 5);
    expect(statement.evaluate()).toBe(true);

    const statement2 = new Statement(5, Operator.EQUALS, 10);
    expect(statement2.evaluate()).toBe(false);
  });

  it('evaluates logical operators', () => {
    // AND
    expect(new Statement(true, Operator.AND, true).evaluate()).toBe(true);
    expect(new Statement(true, Operator.AND, false).evaluate()).toBe(false);

    // OR
    expect(new Statement(true, Operator.OR, false).evaluate()).toBe(true);
    expect(new Statement(false, Operator.OR, false).evaluate()).toBe(false);

    // NOT
    expect(new Statement(false, Operator.NOT, null).evaluate()).toBe(true);

    // XOR
    expect(new Statement(true, Operator.XOR, true).evaluate()).toBe(false);
    expect(new Statement(true, Operator.XOR, false).evaluate()).toBe(true);
    expect(new Statement(false, Operator.XOR, true).evaluate()).toBe(true);
    expect(new Statement(false, Operator.XOR, false).evaluate()).toBe(false);

    // NAND
    expect(new Statement(true, Operator.NAND, true).evaluate()).toBe(false);
    expect(new Statement(true, Operator.NAND, false).evaluate()).toBe(true);

    // NOR
    expect(new Statement(true, Operator.NOR, false).evaluate()).toBe(false);
    expect(new Statement(false, Operator.NOR, false).evaluate()).toBe(true);
  });

  it('evaluates comparison operators', () => {
    // EQUALS
    expect(new Statement('abc', Operator.EQUALS, 'abc').evaluate()).toBe(true);
    expect(new Statement('abc', Operator.EQUALS, 'def').evaluate()).toBe(false);

    // NOT_EQUALS
    expect(new Statement('abc', Operator.NOT_EQUALS, 'def').evaluate()).toBe(true);

    // GT
    expect(new Statement(10, Operator.GT, 5).evaluate()).toBe(true);
    expect(new Statement(5, Operator.GT, 10).evaluate()).toBe(false);

    // GE
    expect(new Statement(10, Operator.GE, 10).evaluate()).toBe(true);

    // LT
    expect(new Statement(5, Operator.LT, 10).evaluate()).toBe(true);

    // LE
    expect(new Statement(5, Operator.LE, 5).evaluate()).toBe(true);
  });

  it('evaluates array operators', () => {
    // IN
    expect(new Statement('b', Operator.IN, ['a', 'b', 'c']).evaluate()).toBe(true);
    expect(new Statement('d', Operator.IN, ['a', 'b', 'c']).evaluate()).toBe(false);

    // NOT_IN
    expect(new Statement('d', Operator.NOT_IN, ['a', 'b', 'c']).evaluate()).toBe(true);
  });

  it('evaluates string operators', () => {
    // INCLUDES
    expect(new Statement('abcdef', Operator.INCLUDES, 'cd').evaluate()).toBe(true);
    expect(new Statement('abcdef', Operator.INCLUDES, 'xy').evaluate()).toBe(false);

    // NOT_INCLUDES
    expect(new Statement('abcdef', Operator.NOT_INCLUDES, 'xy').evaluate()).toBe(true);

    // Edge cases
    expect(new Statement(123, Operator.INCLUDES, 'cd').evaluate()).toBe(false);
    expect(new Statement('abcdef', Operator.INCLUDES, 123).evaluate()).toBe(false);
  });

  it('evaluates with Field values', () => {
    const field1 = new Field({ value: 10 });
    const field2 = new Field({ value: 20 });

    const statement = new Statement(field1, Operator.LT, field2);
    expect(statement.evaluate()).toBe(true);

    // Change values and re-evaluate
    field1.value = 30;
    expect(statement.evaluate()).toBe(false);

    field2.value = 40;
    expect(statement.evaluate()).toBe(true);
  });

  it('evaluates nested statements', () => {
    const innerStatement1 = new Statement(5, Operator.LT, 10);
    const innerStatement2 = new Statement('abc', Operator.EQUALS, 'abc');

    const statement = new Statement(innerStatement1, Operator.AND, innerStatement2);
    expect(statement.evaluate()).toBe(true);

    const statement2 = new Statement(
      new Statement(true, Operator.AND, false),
      Operator.OR,
      new Statement(10, Operator.GT, 5),
    );
    expect(statement2.evaluate()).toBe(true);
  });

  it('throws for unimplemented operators', () => {
    // Using a non-existent operator (casting to trick TypeScript)
    const statement = new Statement(true, 999 as unknown as Operator, false);

    expect(() => statement.evaluate()).toThrow('Operator not implemented');
  });

  it('handles null and unset fields', () => {
    const unset = new Field();

    expect(new Statement(null, Operator.EQUALS, null).evaluate()).toBe(true);
    expect(new Statement(unset, Operator.EQUALS, new Field()).evaluate()).toBe(true);
    expect(new Statement(null, Operator.EQUALS, unset).evaluate()).toBe(true);

    // IN and INCLUDES with null
    expect(new Statement('a', Operator.IN, null).evaluate()).toBe(false);
    expect(new Statement(null, Operator.INCLUDES, 'a').evaluate()).toBe(false);
  });

  it('handles complex Field and Statement combinations', () => {
    const nameField = new Field({ value: 'John' });
    const ageField = new Field({ value: 25 });
    const activeField = new Field({ value: true });

    // (name === 'John' AND age > 18) OR active === false
    const statement = new Statement(
      new Statement(
        new Statement(nameField, Operator.EQUALS, 'John'),
        Operator.AND,
        new Statement(ageField, Operator.GT, 18),
      ),
      Operator.OR,
      new Statement(activeField, Operator.EQUALS, false),
    );

    expect(statement.evaluate()).toBe(true);

    // Change values
    ageField.value = 15;
    expect(statement.evaluate()).toBe(false);

    activeField.value = false;
    expect(statement.evaluate()).toBe(true);
  });
});

describe('Statement.evaluate return type', () => {
  const operators: [string, Operator][] = [
    ['NOT', Operator.NOT],
    ['OR', Operator.OR],
    ['AND', Operator.AND],
    ['XOR', Operator.XOR],
    ['NAND', Operator.NAND],
    ['NOR', Operator.NOR],
    ['EQUALS', Operator.EQUALS],
    ['NOT_EQUALS', Operator.NOT_EQUALS],
    ['GT', Operator.GT],
    ['LT', Operator.LT],
    ['GE', Operator.GE],
    ['LE', Operator.LE],
    ['IN', Operator.IN],
    ['NOT_IN', Operator.NOT_IN],
    ['INCLUDES', Operator.INCLUDES],
    ['NOT_INCLUDES', Operator.NOT_INCLUDES],
  ];

  // Falsy values that are not `false` and truthy values that are not `true`: an implementation returning a
  // raw operand passes a `=== false` / `=== true` check for none of them.
  const operands: [string, any][] = [
    ['0', 0],
    ["''", ''],
    ['null', null],
    ['a field holding undefined', new Field()],
    ['NaN', NaN],
    ["'x'", 'x'],
    ['1', 1],
    ['{}', {}],
    ['[]', []],
  ];

  it.each(operators)('returns a boolean for %s over every operand pairing', (_name, operator) => {
    for (const [label1, operand1] of operands) {
      for (const [label2, operand2] of operands) {
        const result = new Statement(operand1, operator, operand2).evaluate();
        expect(typeof result, `${label1} ${_name} ${label2} produced ${String(result)}`).toBe('boolean');
      }
    }
  });

  it('reduces logical operators over non-boolean operands to their logical value', () => {
    expect(new Statement(0, Operator.AND, true).evaluate()).toBe(false);
    expect(new Statement(1, Operator.AND, 'x').evaluate()).toBe(true);
    expect(new Statement('', Operator.OR, 'x').evaluate()).toBe(true);
    expect(new Statement('', Operator.OR, NaN).evaluate()).toBe(false);
    expect(new Statement(0, Operator.XOR, 'x').evaluate()).toBe(true);
    expect(new Statement('x', Operator.XOR, 1).evaluate()).toBe(false);
    expect(new Statement(null, Operator.XOR, new Field()).evaluate()).toBe(false);
  });

  it('returns a boolean for IN when the container reports membership with a non-boolean', () => {
    const container = { includes: (value: any) => (value === 'a' ? 1 : 0) };

    expect(new Statement('a', Operator.IN, container).evaluate()).toBe(true);
    expect(new Statement('b', Operator.IN, container).evaluate()).toBe(false);
  });

  it.each([
    ['an array holding the operand', ['a', 'b'], true],
    ['an array without the operand', ['x', 'y'], false],
    ['an empty array', [], false],
    ['a string holding the operand', 'abc', true],
    ['a string without the operand', 'xyz', false],
    ['a container reporting membership with a non-boolean', { includes: (v: any) => (v === 'a' ? 1 : 0) }, true],
    ['null', null, false],
    ['an object without includes', {}, false],
    ['a number', 0, false],
  ])('evaluates NOT_IN as the exact negation of IN over %s', (name, operand2, inResult) => {
    expect(new Statement('a', Operator.IN, operand2).evaluate()).toBe(inResult);
    expect(new Statement('a', Operator.NOT_IN, operand2).evaluate()).toBe(!inResult);
  });

  it('reports membership in an unset field and an empty list as false and non-membership as true', () => {
    const unset = new Field();
    const empty = new List(new Group({ a: new Field() }));

    expect(new Statement('a', Operator.IN, unset).evaluate()).toBe(false);
    expect(new Statement('a', Operator.NOT_IN, unset).evaluate()).toBe(true);
    expect(new Statement('a', Operator.IN, empty).evaluate()).toBe(false);
    expect(new Statement('a', Operator.NOT_IN, empty).evaluate()).toBe(true);
  });

  it('returns a boolean when a Field holds a non-boolean value', () => {
    const field = new Field<any>({ value: 0 });
    const statement = new Statement(field, Operator.AND, true);

    expect(statement.evaluate()).toBe(false);

    field.value = 'x';
    expect(statement.evaluate()).toBe(true);
  });
});

describe('Statement.evaluate over a record', () => {
  const listOf = (values: Record<string, any>[]) => {
    const template = new Group({
      quantity: new Field<number>({ value: 0 }),
      limit: new Field<number>({ value: 0 }),
    });
    return { template, list: new List(template, { value: values }) };
  };

  it('reads the fields of the row it is given', () => {
    const { template, list } = listOf([
      { quantity: 5, limit: 10 },
      { quantity: 20, limit: 10 },
    ]);
    const statement = new Statement(template.fields.quantity, Operator.GT, template.fields.limit);

    expect(statement.evaluate(list.get(0)!)).toBe(false);
    expect(statement.evaluate(list.get(1)!)).toBe(true);
    // with no record named, the fields the statement was built from are the ones it reads
    expect(statement.evaluate()).toBe(false);
  });

  it('reads a field of another record where it stands', () => {
    const { template, list } = listOf([{ quantity: 5, limit: 10 }]);
    const ceiling = new Field<number>({ value: 3 });
    const statement = new Statement(template.fields.quantity, Operator.GT, ceiling);

    expect(statement.evaluate(list.get(0)!)).toBe(true);

    ceiling.value = 8;
    expect(statement.evaluate(list.get(0)!)).toBe(false);
  });
});

describe('Statement.collectFields', () => {
  it('returns the field instances the statement was built from', () => {
    const field1 = new Field({ value: 1 });
    const field2 = new Field({ value: 2 });
    const statement = new Statement(new Statement(field1, Operator.LT, field2), Operator.AND, true);

    const collected = statement.collectFields();
    expect(collected.size).toBe(2);
    expect(collected.has(field1)).toBe(true);
    expect(collected.has(field2)).toBe(true);
  });
});

describe('Statement operand rejection', () => {
  const form = new Group({ quantity: new Field<number>({ value: 1 }) });

  it('rejects a misspelled field name at the position it was written', () => {
    expect(() => new Statement((form.fields as any).quantitiy, Operator.GT, 0)).toThrow(TypeError);
    expect(() => new Statement((form.fields as any).quantitiy, Operator.GT, 0)).toThrow('Statement operand 1');
    expect(() => new Statement(0, Operator.LT, (form.fields as any).quantitiy)).toThrow('Statement operand 2');
  });

  it('rejects a function operand', () => {
    expect(() => new Statement(() => 1, Operator.EQUALS, 1)).toThrow(TypeError);
    expect(() => new Statement(1, Operator.EQUALS, form.field.bind(form))).toThrow('Statement operand 2');
  });

  it('accepts fields, nested statements and literals', () => {
    expect(() => new Statement(form.fields.quantity, Operator.GT, 0)).not.toThrow();
    expect(() => new Statement(form, Operator.EQUALS, null)).not.toThrow();
    expect(() => new Statement(new Statement(1, Operator.LT, 2), Operator.AND, true)).not.toThrow();
    expect(() => new Statement(null, Operator.EQUALS, NaN)).not.toThrow();
    expect(() => new Statement(0, Operator.EQUALS, '')).not.toThrow();
    expect(() => new Statement('a', Operator.IN, ['a'])).not.toThrow();
    expect(() => new Statement('a', Operator.IN, { includes: (v: any) => v === 'a' })).not.toThrow();
  });

  it('leaves the second operand of NOT unchecked, because NOT does not read it', () => {
    expect(new Statement(false, Operator.NOT, undefined).evaluate()).toBe(true);
    expect(new Statement(true, Operator.NOT, undefined as any).evaluate()).toBe(false);
  });
});
