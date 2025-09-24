import { isString } from 'lodash-es';
import { unref } from 'vue';

import { FieldBase } from '../../field-base';
import { IField } from '../../field.interface';

import Operator from './operator';

export type OperandType = any | Statement | IField;

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

  get operand1Value() {
    if (this.operand1 instanceof Statement) return this.operand1.evaluate();
    if (this.operand1 instanceof FieldBase) return unref(this.operand1.value);
    return this.operand1; // any
  }

  get operand2Value() {
    if (this.operand2 instanceof Statement) return this.operand2.evaluate();
    if (this.operand2 instanceof FieldBase) return unref(this.operand2.value);
    return this.operand2; // any
  }

  evaluate(): boolean {
    const operand1 = this.operand1Value;
    const operand2 = this.operand2Value;

    switch (this.operator) {
      // logical operators
      case Operator.AND:
        return operand1 && operand2;
      case Operator.OR:
        return operand1 || operand2;
      case Operator.NAND:
        return !(operand1 && operand2);
      case Operator.NOR:
        return !(operand1 || operand2);
      case Operator.XOR:
        return XOR(operand1, operand2);
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
        return operand2?.includes?.(operand1) ?? false;
      case Operator.NOT_IN:
        return !(operand2?.includes?.(operand1) ?? true);
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
  collectFields(): Set<IField> {
    const fields = new Set<IField>();

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
