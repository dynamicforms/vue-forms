import { isString } from 'lodash-es';
import { unref } from 'vue';

import { resolveInScope } from '../../binding/resolve';
import { FieldBase } from '../../field-base';

import Operator from './operator';

// An operand is a nested Statement, a field whose current value is compared, or a literal of any type. The
// union with `any` collapses to `any` for the type checker, so the alias documents intent rather than
// constraining callers.
export type OperandType = any | Statement | FieldBase;

function XOR(value1: boolean, value2: boolean): boolean {
  return value1 ? !value2 : value2;
}

export class Statement {
  private readonly operand1: OperandType;

  private readonly operator: Operator;

  private readonly operand2: OperandType;

  constructor(operand1: OperandType, operator: Operator, operand2: OperandType) {
    this.operand1 = operand1;
    this.operator = operator;
    this.operand2 = operand2;
  }

  /**
   * The value an operand contributes. A field operand names a field of the record the statement is evaluated in:
   * the same statement over a `List` reads row 3's field while row 3 is the record, and a field belonging to no
   * record of the statement's own - a form field above the list - is read where it stands. A record that does not
   * hold the field yet contributes undefined, which is what a half-built row answers with.
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
   * The result of the statement, over the record `scope` belongs to where one is given and over the fields the
   * statement was built from where it is not.
   */
  evaluate(scope?: FieldBase): boolean {
    const operand1 = Statement.valueOf(this.operand1, scope);
    const operand2 = Statement.valueOf(this.operand2, scope);

    switch (this.operator) {
      // logical operators
      // `&&` and `||` evaluate to one of their operands, and the operands are of any type. Without the
      // coercion evaluate() would hand out the operand itself, so `0` or `''` would reach callers that the
      // signature promises a boolean, and consumers comparing results with !== would see a change where the
      // logical value stayed the same.
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
        // `includes` is called on an operand of any type, so its return value is not guaranteed to be a
        // boolean; a missing or non-callable `includes` yields undefined and therefore false. NOT_IN negates
        // exactly this, so a right operand that reports no membership at all is IN false and NOT_IN true.
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
