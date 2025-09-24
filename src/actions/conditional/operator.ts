/**
 * Operators provides us a functionality for backend to send us complex condition upon which we send
 * dynamic visibility prop for form input fields
 */
enum Operator {
  // Logic Operators
  NOT = 0,
  OR = 1,
  AND = 2,
  XOR = 3,
  NAND = 4,
  NOR = 5,

  // Comparators (comparison operators)
  EQUALS = -1,
  NOT_EQUALS = -2,
  GT = -3,
  LT = -4,
  GE = -5,
  LE = -6,
  IN = -7,
  NOT_IN = -8,
  INCLUDES = -9,
  NOT_INCLUDES = -10,
}

// eslint-disable-next-line @typescript-eslint/no-namespace, no-redeclare
namespace Operator {
  export function fromString(operator: string): Operator {
    const op = operator.toLowerCase();
    if (op === 'not') return Operator.NOT;
    if (op === 'or') return Operator.OR;
    if (op === 'and') return Operator.AND;
    if (op === 'xor') return Operator.XOR;
    if (op === 'nand') return Operator.NAND;
    if (op === 'nor') return Operator.NOR;

    if (op === 'equals') return Operator.EQUALS;
    if (['not_equals', 'not-equals', 'not equals'].includes(op)) return Operator.NOT_EQUALS;
    if (op === 'gt') return Operator.GT;
    if (op === 'lt') return Operator.LT;
    if (op === 'ge') return Operator.GE;
    if (op === 'le') return Operator.LE;
    if (op === 'in') return Operator.IN;
    if (['not_in', 'not-in', 'not in'].includes(op)) return Operator.NOT_IN;
    if (op === 'includes') return Operator.INCLUDES;
    if (['not_includes', 'not-includes', 'not includes'].includes(op)) return Operator.NOT_INCLUDES;
    throw new Error(`Unrecognised operator ${op}`);
  }

  export function fromAny(mode: any): Operator {
    const input = typeof mode === 'number' ? mode : Operator.fromString(mode as string);
    if (Object.values(Operator).includes(input)) return input;
    throw new Error(`Unrecognised operator ${mode}`);
  }

  export function isDefined(operator: number | string): boolean {
    const check = typeof operator === 'number' ? operator : Operator.fromString(operator as string);
    return Object.values(Operator).includes(check);
  }

  // c8 bug: it doesn't matter what there is in the next line (e.g. console.log()).
  // it will always be a branch with one branch not covered
  export function isLogicOperator(operator: Operator): boolean {
    return operator >= 0;
  }
}

Object.freeze(Operator);

export default Operator;
