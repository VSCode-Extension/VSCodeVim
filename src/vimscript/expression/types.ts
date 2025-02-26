// -------------------- Values --------------------

export type NumberValue = {
  type: 'number';
  value: number;
};

export type FloatValue = {
  type: 'float';
  value: number;
};

export type StringValue = {
  type: 'string';
  value: string;
};

export type ListValue = {
  type: 'list';
  items: Value[];
};

export type DictionaryValue = {
  type: 'dict_val';
  items: Map<string, Value>;
};

export type FuncRefValue = {
  type: 'funcref';
  name: string;
  body?: (args: Value[]) => Value;
  arglist?: ListValue;
  dict?: DictionaryValue;
};

export type BlobValue = {
  type: 'blob';
  data: ArrayBuffer;
};

export type RegisterValue = {
  type: 'register_val';
  content: string;
  registerMode: 'character' | 'line' | 'block';
};

export type Value =
  | NumberValue
  | FloatValue
  | StringValue
  | ListValue
  | DictionaryValue
  | FuncRefValue
  | BlobValue
  | RegisterValue;

// -------------------- Expressions --------------------

export type ListExpression = {
  type: 'list';
  items: Expression[];
};

export type DictionaryExpression = {
  type: 'dictionary';
  items: Array<[Expression, Expression]>;
};

export type OptionExpression = {
  type: 'option';
  scope: 'l' | 'g' | undefined;
  name: string;
};

export type Namespace = 'b' | 'w' | 't' | 'g' | 'l' | 's' | 'a' | 'v';
export type VariableExpression = {
  type: 'variable';
  namespace: Namespace | undefined;
  name: string;
};

export type EnvVariableExpression = {
  type: 'env_variable';
  name: string;
};

export type RegisterExpression = {
  type: 'register';
  name: string;
};

export type FunctionCallExpression = {
  type: 'function_call';
  func: string;
  args: Expression[];
};

export type LambdaExpression = {
  type: 'lambda';
  args: string[];
  body: Expression;
};

export type IndexExpression = {
  type: 'index';
  expression: Expression;
  index: Expression;
};

export type SliceExpression = {
  type: 'slice';
  expression: Expression;
  start: Expression | undefined;
  end: Expression | undefined;
};

export type EntryExpression = {
  type: 'entry';
  expression: Expression;
  entryName: string;
};

export type FuncrefCallExpression = {
  type: 'funcrefCall';
  expression: Expression;
  args: Expression[];
};

export type MethodCallExpression = {
  type: 'methodCall';
  expression: Expression;
  methodName: string;
  args: Expression[];
};

export type UnaryOp = '!' | '-' | '+';
export type UnaryExpression = {
  type: 'unary';
  operator: UnaryOp;
  operand: Expression;
};

export type ComparisonOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | '=~' | '!~' | 'is' | 'isnot';
export type ComparisonExpression = {
  type: 'comparison';
  operator: ComparisonOp;
  matchCase: boolean | undefined;
  lhs: Expression;
  rhs: Expression;
};

export type BinaryOp = '*' | '/' | '%' | '.' | '..' | '-' | '+' | '&&' | '||';
export type BinaryExpression = {
  type: 'binary';
  operator: BinaryOp;
  lhs: Expression;
  rhs: Expression;
};

export type TernaryExpression = {
  type: 'ternary';
  if: Expression;
  then: Expression;
  else: Expression;
};

export type Expression =
  | Value
  | ListExpression
  | DictionaryExpression
  | OptionExpression
  | VariableExpression
  | LambdaExpression
  | IndexExpression
  | SliceExpression
  | EntryExpression
  | FuncrefCallExpression
  | MethodCallExpression
  | EnvVariableExpression
  | RegisterExpression
  | FunctionCallExpression
  | ComparisonExpression
  | BinaryExpression
  | UnaryExpression
  | TernaryExpression;
