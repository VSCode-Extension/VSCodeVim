import {
  BinaryExpression,
  BinaryOp,
  BlobValue,
  DictionaryValue,
  Expression,
  FloatValue,
  FuncRefValue,
  FunctionCallExpression,
  LambdaExpression,
  ListExpression,
  ListValue,
  Namespace,
  NumberValue,
  RegisterValue,
  StringValue,
  UnaryExpression,
  Value,
  VariableExpression,
} from './types';

export function int(value: number): NumberValue {
  return {
    type: 'number',
    value: Math.trunc(value),
  };
}

export function float(value: number): FloatValue {
  return {
    type: 'float',
    value,
  };
}

export function bool(value: boolean): NumberValue {
  return int(value ? 1 : 0);
}

export function str(value: string): StringValue {
  return {
    type: 'string',
    value,
  };
}

export function list(items: Value[]): ListValue {
  return {
    type: 'list',
    items,
  };
}

export function funcref(name: string, arglist?: ListValue, dict?: DictionaryValue): FuncRefValue {
  return {
    type: 'funcref',
    name,
    arglist,
    dict,
  };
}

export function blob(data: ArrayBuffer): BlobValue {
  return {
    type: 'blob',
    data,
  };
}

export function register(
  content: string,
  registerMode: 'character' | 'line' | 'block',
): RegisterValue {
  return {
    type: 'register_val',
    content,
    registerMode,
  };
}

export function listExpr(items: Expression[]): ListExpression {
  return {
    type: 'list',
    items,
  };
}

export function variable(name: string, namespace?: Namespace): VariableExpression {
  return {
    type: 'variable',
    name,
    namespace,
  };
}

export function lambda(args: string[], body: Expression): LambdaExpression {
  return {
    type: 'lambda',
    args,
    body,
  };
}

export function negative(operand: Expression): UnaryExpression {
  return {
    type: 'unary',
    operator: '-',
    operand,
  };
}

export function positive(operand: Expression): UnaryExpression {
  return {
    type: 'unary',
    operator: '+',
    operand,
  };
}

export function binary(lhs: Expression, operator: BinaryOp, rhs: Expression): BinaryExpression {
  return {
    type: 'binary',
    operator,
    lhs,
    rhs,
  };
}

export function add(lhs: Expression, rhs: Expression): BinaryExpression {
  return binary(lhs, '+', rhs);
}

export function subtract(lhs: Expression, rhs: Expression): BinaryExpression {
  return binary(lhs, '-', rhs);
}

export function multiply(lhs: Expression, rhs: Expression): BinaryExpression {
  return binary(lhs, '*', rhs);
}

export function divide(lhs: Expression, rhs: Expression): BinaryExpression {
  return binary(lhs, '/', rhs);
}

export function modulo(lhs: Expression, rhs: Expression): BinaryExpression {
  return binary(lhs, '%', rhs);
}

export function concat(lhs: Expression, rhs: Expression): BinaryExpression {
  return binary(lhs, '..', rhs);
}

export function funcCall(func: string, args: Expression[]): FunctionCallExpression {
  return {
    type: 'function_call',
    func,
    args,
  };
}
