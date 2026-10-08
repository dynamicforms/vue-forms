import { isString } from 'lodash-es';
import { unref } from 'vue';

import { resolveInScope } from '../../binding/resolve';
import { FieldBase } from '../../field-base';

import Operator from './operator';

// An operand is a nested Statement, an element whose current value is compared, or a literal of any type. The
// union with `any` is `any` for the type checker, so the alias documents intent and does not constrain callers;
// the constructor rejects undefined and a function, which are not operands.
export type OperandType = any | Statement | FieldBase;

function XOR(value1: boolean, value2: boolean): boolean {
  return value1 ? !value2 : value2;
}

export class Statement {
  private readonly operand1: OperandType;

  private readonly operator: Operator;

  private readonly operand2: OperandType;

  /**
   * An operand is a nested `Statement`, a `FieldBase` whose value is compared, or a literal. `undefined` and a
   * function are not operands: they result from a misspelled field name and from an accessor passed without being
   * called, and a statement built from one would compare nothing and never fire. The error message includes the
   * operand's position.
   */
  private static validateOperand(operand: OperandType, position: 1 | 2): void {
    if (operand === undefined) {
      throw new TypeError(
        `Statement operand ${position} is undefined: an operand is a field, a nested statement or a literal, ` +
          'and a name resolving to nothing is none of them. Compare against null to test for an unset value.',
      );
    }
    if (typeof operand === 'function') {
      throw new TypeError(
        `Statement operand ${position} is a function: an operand is a field, a nested statement or a literal, ` +
          "and a function is none of them. An accessor states the field it answers with: group.field('name').",
      );
    }
  }

  /**
   * `NOT` reads one operand, so it takes one. Every other operator compares two and takes both, as does an operator
   * held in a variable: `Operator.fromString()` returns the type, not the constant, so the compiler cannot
   * determine which of the two forms applies.
   *
   * @throws TypeError if an operand the statement reads is undefined or a function.
   */
  constructor(operand1: OperandType, operator: Operator.NOT);
  constructor(operand1: OperandType, operator: Operator, operand2: OperandType);
  constructor(operand1: OperandType, operator: Operator, operand2?: OperandType) {
    Statement.validateOperand(operand1, 1);
    // NOT reads only operand1, so the second position is neither compared nor validated
    if (operator !== Operator.NOT) Statement.validateOperand(operand2, 2);

    this.operand1 = operand1;
    this.operator = operator;
    this.operand2 = operand2;
  }

  /**
   * Returns the value of an operand. A field operand refers to the corresponding element of the record the
   * statement is evaluated in: the same statement over a `List` reads row 3's element when row 3 is the record, and
   * an element outside the statement's records (a form field above the list) is read directly. If the record does
   * not hold the element yet (a partially built row), the value is undefined.
   */
  private static valueOf(operand: OperandType, scope?: FieldBase) {
    if (operand instanceof Statement) return operand.evaluate(scope);
    if (operand instanceof FieldBase) {
      const field = scope ? resolveInScope(operand, scope) : operand;
      return field ? unref(field.value) : undefined;
    }
    return operand; // any
  }

  get operand1Value() {
    return Statement.valueOf(this.operand1);
  }

  get operand2Value() {
    return Statement.valueOf(this.operand2);
  }

  /**
   * The result of the statement, over the record `scope` belongs to if given, and over the elements the statement
   * was built from otherwise.
   */
  evaluate(scope?: FieldBase): boolean {
    const operand1 = Statement.valueOf(this.operand1, scope);
    const operand2 = Statement.valueOf(this.operand2, scope);

    switch (this.operator) {
      // logical operators
      // `&&` and `||` evaluate to one of their operands, which can be of any type. The coercion ensures evaluate()
      // returns a boolean, as its signature declares: otherwise `0` or `''` would be returned, and a consumer
      // comparing results with !== would see a change where the logical value is the same.
      case Operator.AND:
        return Boolean(operand1 && operand2);
      case Operator.OR:
        return Boolean(operand1 || operand2);
      case Operator.NAND:
        return !(operand1 && operand2);
      case Operator.NOR:
        return !(operand1 || operand2);
      case Operator.XOR:
        return XOR(Boolean(operand1), Boolean(operand2));
      case Operator.NOT:
        return !operand1;

      // comparison operators
      case Operator.EQUALS:
        return operand1 == operand2;
      case Operator.NOT_EQUALS:
        return operand1 != operand2;
      case Operator.LT:
        return operand1 < operand2;
      case Operator.LE:
        return operand1 <= operand2;
      case Operator.GE:
        return operand1 >= operand2;
      case Operator.GT:
        return operand1 > operand2;
      case Operator.IN:
        // `includes` is called on an operand of any type, so its return value is not necessarily a boolean; a
        // missing or non-callable `includes` yields undefined and therefore false. NOT_IN negates the same
        // expression, so for a right operand without `includes`, IN is false and NOT_IN is true.
        return Boolean(operand2?.includes?.(operand1));
      case Operator.NOT_IN:
        return !operand2?.includes?.(operand1);
      case Operator.INCLUDES:
        return isString(operand1) && isString(operand2) && operand1.indexOf(operand2) >= 0;
      case Operator.NOT_INCLUDES:
        return !(isString(operand1) && isString(operand2) && operand1.indexOf(operand2) >= 0);

      default:
        throw new Error(`Operator not implemented ${this.operator}`);
    }
  }

  /**
   * Recursively collects all fields used in this statement and its nested statements
   * @returns A set of all fields used in this statement
   */
  collectFields(): Set<FieldBase> {
    const fields = new Set<FieldBase>();

    function processOperand(op: OperandType) {
      if (op instanceof FieldBase) {
        fields.add(op);
      } else if (op instanceof Statement) {
        // For nested statements, merge their fields with our collection
        const nestedFields = op.collectFields();
        nestedFields.forEach((field) => fields.add(field));
      }
    }
    processOperand(this.operand1);
    processOperand(this.operand2);

    return fields;
  }
}
