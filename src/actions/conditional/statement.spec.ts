import Operator from './operator';
import { Statement } from './statement';

import { Field } from '@/field';

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
    const field1 = Field.create({ value: 10 });
    const field2 = Field.create({ value: 20 });

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

  it('handles null and undefined', () => {
    expect(new Statement(null, Operator.EQUALS, null).evaluate()).toBe(true);
    expect(new Statement(undefined, Operator.EQUALS, undefined).evaluate()).toBe(true);
    expect(new Statement(null, Operator.EQUALS, undefined).evaluate()).toBe(true);

    // IN and INCLUDES with null
    expect(new Statement('a', Operator.IN, null).evaluate()).toBe(false);
    expect(new Statement(null, Operator.INCLUDES, 'a').evaluate()).toBe(false);
  });

  it('handles complex Field and Statement combinations', () => {
    const nameField = Field.create({ value: 'John' });
    const ageField = Field.create({ value: 25 });
    const activeField = Field.create({ value: true });

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
