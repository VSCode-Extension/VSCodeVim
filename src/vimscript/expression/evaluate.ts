import { all } from 'parsimmon';
import { configuration } from '../../configuration/configuration';
import { ErrorCode, VimError } from '../../error';
import { globalState } from '../../state/globalState';
import { blob, bool, float, funcCall, funcref, int, list, listExpr, str } from './build';
import { displayValue } from './displayValue';
import { expressionParser, numberParser } from './parser';
import { lookupRegister } from './registerUtils';
import {
  BinaryOp,
  ComparisonOp,
  DictionaryValue,
  Expression,
  FloatValue,
  FunctionCallExpression,
  ListValue,
  NumberValue,
  StringValue,
  UnaryOp,
  Value,
  VariableExpression,
} from './types';

// ID of next lambda; incremented each time one is created
let lambdaNumber = 1;

function toInt(value: Value): number {
  switch (value.type) {
    case 'number':
      return value.value;
    case 'float':
      throw VimError.fromCode(ErrorCode.UsingAFloatAsANumber);
    case 'string':
      const parsed = numberParser.skip(all).parse(value.value);
      if (parsed.status === false) {
        return 0;
      }
      return parsed.value.value;
    case 'list':
      throw VimError.fromCode(ErrorCode.UsingAListAsANumber);
    case 'dict_val':
      throw VimError.fromCode(ErrorCode.UsingADictionaryAsANumber);
    case 'funcref':
      throw VimError.fromCode(ErrorCode.UsingAFuncrefAsANumber);
    case 'blob':
      throw VimError.fromCode(ErrorCode.UsingABlobAsANumber);
    case 'register_val':
      throw VimError.fromCode(ErrorCode.UsingARegisterAsANumber);
  }
}

function toFloat(value: Value): number {
  switch (value.type) {
    case 'number':
      return value.value;
    case 'float':
      return value.value;
    case 'string':
    case 'list':
    case 'dict_val':
    case 'funcref':
    case 'blob':
    case 'register_val':
      throw VimError.fromCode(ErrorCode.NumberOrFloatRequired);
  }
}

export function toString(value: Value): string {
  switch (value.type) {
    case 'number':
      return value.value.toString();
    case 'float':
      throw VimError.fromCode(ErrorCode.UsingFloatAsAString);
    case 'string':
      return value.value;
    case 'list':
      throw VimError.fromCode(ErrorCode.UsingListAsAString);
    case 'dict_val':
      throw VimError.fromCode(ErrorCode.UsingDictionaryAsAString);
    case 'funcref':
      throw VimError.fromCode(ErrorCode.UsingFuncrefAsAString);
    case 'blob':
      return displayValue(value);
    case 'register_val':
      return value.content;
  }
}

function toList(value: Value): ListValue {
  switch (value.type) {
    case 'number':
    case 'float':
    case 'string':
    case 'funcref':
    case 'dict_val':
    case 'blob':
    case 'register_val':
      throw VimError.fromCode(ErrorCode.ListRequired);
    case 'list':
      return value;
  }
}

function toDict(value: Value): DictionaryValue {
  switch (value.type) {
    case 'number':
    case 'float':
    case 'string':
    case 'list':
    case 'funcref':
    case 'blob':
    case 'register_val':
      throw VimError.fromCode(ErrorCode.DictionaryRequired);
    case 'dict_val':
      return value;
  }
}

function mapNumber(value: Value, f: (x: number) => number): NumberValue | FloatValue {
  switch (value.type) {
    case 'float':
      return float(f(value.value));
    default:
      return int(f(toInt(value)));
  }
}

export class Variable {
  public value: Value;
  public locked: boolean = false;

  constructor(value: Value, locked: boolean = false) {
    this.value = value;
    this.locked = locked;
  }
}

type VariableStore = Map<string, Variable>;

export class EvaluationContext {
  private static globalVariables: VariableStore = new Map();

  private localScopes: VariableStore[] = [];
  private errors: string[] = [];

  /**
   * Fully evaluates the given expression and returns the resulting value.
   * May throw a variety of VimErrors if the expression is semantically invalid.
   */
  public evaluate(expression: Expression): Value {
    switch (expression.type) {
      case 'number':
      case 'float':
      case 'string':
      case 'dict_val':
      case 'funcref':
      case 'blob':
      case 'register_val':
        return expression;
      case 'list':
        return list(expression.items.map((x) => this.evaluate(x)));
      case 'dictionary': {
        const items = new Map<string, Value>();
        for (const [key, val] of expression.items) {
          const keyStr = toString(this.evaluate(key));
          if (items.has(keyStr)) {
            throw VimError.fromCode(ErrorCode.DuplicateKeyInDictionary, `"${keyStr}"`);
          } else {
            items.set(keyStr, this.evaluate(val));
          }
        }
        return {
          type: 'dict_val',
          items,
        };
      }
      case 'variable':
        return this.evaluateVariable(expression);
      case 'register':
        return lookupRegister(expression.name);
      case 'option':
        return str(''); // TODO
      case 'env_variable':
        return str(process.env[expression.name] ?? '');
      case 'function_call':
        return this.evaluateFunctionCall(expression);
      case 'index': {
        return this.evaluateIndex(
          this.evaluate(expression.expression),
          this.evaluate(expression.index),
        );
      }
      case 'slice': {
        return this.evaluateSlice(
          this.evaluate(expression.expression),
          expression.start ? this.evaluate(expression.start) : int(0),
          expression.end ? this.evaluate(expression.end) : int(-1),
        );
      }
      case 'entry': {
        const entry = toDict(this.evaluate(expression.expression)).items.get(expression.entryName);
        if (!entry) {
          throw VimError.fromCode(ErrorCode.KeyNotPresentInDictionary, expression.entryName);
        }
        return entry;
      }
      case 'funcrefCall': {
        const fref = this.evaluate(expression.expression);
        if (fref.type !== 'funcref') {
          // TODO
          throw new Error(`Expected funcref, got ${fref.type}`);
        }
        // TODO: use `fref.dict`
        if (fref.body) {
          return fref.body(expression.args.map((x) => this.evaluate(x)));
        } else {
          return this.evaluateFunctionCall(
            funcCall(
              fref.name,
              (fref.arglist?.items ?? []).concat(expression.args.map((x) => this.evaluate(x))),
            ),
          );
        }
      }
      case 'methodCall': {
        const obj = this.evaluate(expression.expression);
        return this.evaluateFunctionCall(
          funcCall(expression.methodName, [obj, ...expression.args]),
        );
      }
      case 'lambda': {
        return {
          type: 'funcref',
          name: `<lambda>${lambdaNumber++}`,
          body: (args: Value[]) => {
            // TODO: handle wrong # of args
            const store: VariableStore = new Map();
            for (let i = 0; i < args.length; i++) {
              store.set(expression.args[i], new Variable(args[i]));
            }

            this.localScopes.push(store);
            const retval = this.evaluate(expression.body);
            this.localScopes.pop();
            return retval;
          },
        };
      }
      case 'unary':
        return this.evaluateUnary(expression.operator, expression.operand);
      case 'binary':
        return this.evaluateBinary(expression.operator, expression.lhs, expression.rhs);
      case 'ternary':
        return this.evaluate(
          toInt(this.evaluate(expression.if)) !== 0 ? expression.then : expression.else,
        );
      case 'comparison':
        return bool(
          this.evaluateComparison(
            expression.operator,
            expression.matchCase ?? configuration.ignorecase,
            expression.lhs,
            expression.rhs,
          ),
        );
      default: {
        const guard: never = expression;
        throw new Error(`evaluate() got unexpected expression type`);
      }
    }
  }

  public setVariable(varExpr: VariableExpression, value: Value, lock: boolean): void {
    if (value.type === 'funcref' && varExpr.name[0] === varExpr.name[0].toLowerCase()) {
      throw VimError.fromCode(ErrorCode.FuncrefVariableNameMustStartWithACapital, varExpr.name);
    }

    let store: VariableStore | undefined;
    if (this.localScopes.length > 0 && varExpr.namespace === undefined) {
      store = this.localScopes[this.localScopes.length - 1];
    } else if (varExpr.namespace === 'g' || varExpr.namespace === undefined) {
      store = EvaluationContext.globalVariables;
    } else {
      // TODO
    }

    if (store) {
      const _var = store.get(varExpr.name);
      if (_var) {
        if (lock) {
          throw VimError.fromCode(ErrorCode.CannotModifyExistingVariable);
        }
        if (_var.locked) {
          throw VimError.fromCode(ErrorCode.ValueIsLocked, varExpr.name);
        }
        _var.value = value;
      } else {
        store.set(varExpr.name, new Variable(value, lock));
      }
    }
  }

  private evaluateVariable(varExpr: VariableExpression): Value {
    if (varExpr.namespace === undefined) {
      for (let i = this.localScopes.length - 1; i >= 0; i--) {
        const _var = this.localScopes[i].get(varExpr.name);
        if (_var !== undefined) {
          return _var.value;
        }
      }
    }

    if (varExpr.namespace === 'g' || varExpr.namespace === undefined) {
      const _var = EvaluationContext.globalVariables.get(varExpr.name);
      if (_var === undefined) {
        throw VimError.fromCode(
          ErrorCode.UndefinedVariable,
          varExpr.namespace ? `${varExpr.namespace}:${varExpr.name}` : varExpr.name,
        );
      } else {
        return _var.value;
      }
    } else if (varExpr.namespace === 'v') {
      // TODO: v:count, v:count1, v:prevcount
      // TODO: v:operator
      // TODO: v:register
      // TODO: v:searchforward
      // TODO: v:statusmsg, v:warningmsg, v:errmsg
      if (varExpr.name === 'true') {
        return bool(true);
      } else if (varExpr.name === 'false') {
        return bool(false);
      } else if (varExpr.name === 'hlsearch') {
        return bool(globalState.hl);
      } else if (varExpr.name === 't_number') {
        return int(0);
      } else if (varExpr.name === 't_string') {
        return int(1);
      } else if (varExpr.name === 't_func') {
        return int(2);
      } else if (varExpr.name === 't_list') {
        return int(3);
      } else if (varExpr.name === 't_dict') {
        return int(4);
      } else if (varExpr.name === 't_float') {
        return int(5);
      } else if (varExpr.name === 't_bool') {
        return int(6);
      } else if (varExpr.name === 't_blob') {
        return int(10);
      } else if (varExpr.name === 'numbermax') {
        return int(Number.MAX_VALUE);
      } else if (varExpr.name === 'numbermin') {
        return int(Number.MIN_VALUE);
      } else if (varExpr.name === 'numbersize') {
        // NOTE: In VimScript this refers to a 64 bit integer; we have a 64 bit float because JavaScript
        return int(64);
      } else if (varExpr.name === 'errors') {
        return list(this.errors.map(str));
      }

      // HACK: for things like v:key & v:val
      return this.evaluate({
        type: 'variable',
        namespace: undefined,
        name: `v:${varExpr.name}`,
      });
    }

    throw VimError.fromCode(
      ErrorCode.UndefinedVariable,
      varExpr.namespace ? `${varExpr.namespace}:${varExpr.name}` : varExpr.name,
    );
  }

  private evaluateIndex(sequence: Value, index: Value): Value {
    switch (sequence.type) {
      case 'string':
      case 'number':
      case 'float': {
        const idx = toInt(index);
        return str(idx >= 0 ? (toString(sequence)[idx] ?? '') : '');
      }
      case 'list': {
        let idx = toInt(index);
        idx = idx < 0 ? sequence.items.length - idx : idx;
        if (idx < 0 || idx >= sequence.items.length) {
          throw VimError.fromCode(ErrorCode.ListIndexOutOfRange, idx.toString());
        }
        return sequence.items[idx];
      }
      case 'dict_val': {
        const key = toString(index);
        const result = sequence.items.get(key);
        if (result === undefined) {
          throw VimError.fromCode(ErrorCode.KeyNotPresentInDictionary, key);
        }
        return result;
      }
      case 'funcref': {
        throw VimError.fromCode(ErrorCode.CannotIndexAFuncref);
      }
      case 'blob': {
        const bytes = new Uint8Array(sequence.data);
        return int(bytes[toInt(index)]);
      }
      case 'register_val': {
        return this.evaluateIndex(str(toString(sequence)), index);
      }
    }
  }

  private evaluateSlice(sequence: Value, start: Value, end: Value): Value {
    let _start = toInt(start);
    let _end = toInt(end);
    switch (sequence.type) {
      case 'string':
      case 'number':
      case 'float': {
        const _sequence = toString(sequence);
        while (_start < 0) {
          _start += _sequence.length;
        }
        while (_end < 0) {
          _end += _sequence.length;
        }
        if (_end < _start) {
          return str('');
        }
        return str(_sequence.substring(_start, _end + 1));
      }
      case 'list': {
        while (_start < 0) {
          _start += sequence.items.length;
        }
        while (_end < 0) {
          _end += sequence.items.length;
        }
        if (_end < _start) {
          return list([]);
        }
        return list(sequence.items.slice(_start, _end + 1));
      }
      case 'dict_val': {
        throw VimError.fromCode(ErrorCode.CannotUseSliceWithADictionary);
      }
      case 'funcref': {
        throw VimError.fromCode(ErrorCode.CannotIndexAFuncref);
      }
      case 'blob': {
        return blob(new Uint8Array(sequence.data).slice(_start, _end + 1));
      }
      case 'register_val': {
        return this.evaluateSlice(str(toString(sequence)), start, end);
      }
    }
  }

  private evaluateUnary(operator: UnaryOp, operand: Expression): NumberValue | FloatValue {
    return mapNumber(this.evaluate(operand), (x: number) => {
      switch (operator) {
        case '+':
          return x;
        case '-':
          return -x;
        case '!':
          return x === 0 ? 1 : 0;
        default:
          throw new Error('Impossible');
      }
    });
  }

  private evaluateBinary(operator: BinaryOp, lhsExpr: Expression, rhsExpr: Expression): Value {
    let [lhs, rhs] = [this.evaluate(lhsExpr), this.evaluate(rhsExpr)];

    const arithmetic = (f: (x: number, y: number) => number) => {
      const numType = lhs.type === 'float' || rhs.type === 'float' ? float : int;
      if (lhs.type === 'string') {
        lhs = int(toInt(lhs));
      }
      if (rhs.type === 'string') {
        rhs = int(toInt(rhs));
      }
      return numType(f(toFloat(lhs), toFloat(rhs)));
    };

    switch (operator) {
      case '+':
        if (lhs.type === 'list' && rhs.type === 'list') {
          return listExpr(lhs.items.concat(rhs.items)) as ListValue;
        } else {
          return arithmetic((x, y) => x + y);
        }
      case '-':
        return arithmetic((x, y) => x - y);
      case '*':
        return arithmetic((x, y) => x * y);
      case '/':
        return arithmetic((x, y) => x / y);
      case '.':
      case '..':
        return str(toString(lhs) + toString(rhs));
      case '%': {
        if (lhs.type === 'float' || rhs.type === 'float') {
          throw VimError.fromCode(ErrorCode.CannotUseModuloWithFloat);
        }
        const [_lhs, _rhs] = [toInt(lhs), toInt(rhs)];
        if (_rhs === 0) {
          return int(0);
        }

        return int(_lhs % _rhs);
      }
      case '&&':
        return bool(toInt(lhs) !== 0 && toInt(rhs) !== 0);
      case '||':
        return bool(toInt(lhs) !== 0 || toInt(rhs) !== 0);
    }
  }

  private evaluateComparison(
    operator: ComparisonOp,
    matchCase: boolean,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): boolean {
    switch (operator) {
      case '==':
        return this.evaluateBasicComparison('==', matchCase, lhsExpr, rhsExpr);
      case '!=':
        return !this.evaluateBasicComparison('==', matchCase, lhsExpr, rhsExpr);
      case '>':
        return this.evaluateBasicComparison('>', matchCase, lhsExpr, rhsExpr);
      case '>=':
        return (
          this.evaluateBasicComparison('>', matchCase, lhsExpr, rhsExpr) ||
          this.evaluateBasicComparison('==', matchCase, lhsExpr, rhsExpr)
        );
      case '<':
        return this.evaluateBasicComparison('>', matchCase, rhsExpr, lhsExpr);
      case '<=':
        return !this.evaluateBasicComparison('>', matchCase, lhsExpr, rhsExpr);
      case '=~':
        return this.evaluateBasicComparison('=~', matchCase, lhsExpr, rhsExpr);
      case '!~':
        return !this.evaluateBasicComparison('=~', matchCase, lhsExpr, rhsExpr);
      case 'is':
        return this.evaluateBasicComparison('is', matchCase, lhsExpr, rhsExpr);
      case 'isnot':
        return !this.evaluateBasicComparison('is', matchCase, lhsExpr, rhsExpr);
    }
  }

  private evaluateBasicComparison(
    operator: '==' | '>' | '=~' | 'is',
    matchCase: boolean,
    lhsExpr: Expression,
    rhsExpr: Expression,
    topLevel: boolean = true,
  ): boolean {
    if (operator === 'is' && lhsExpr.type !== rhsExpr.type) {
      return false;
    }

    if (lhsExpr.type === 'list') {
      if (rhsExpr.type === 'list') {
        switch (operator) {
          case '==':
            return (
              lhsExpr.items.length === rhsExpr.items.length &&
              lhsExpr.items.every((left, idx) =>
                this.evaluateBasicComparison('==', matchCase, left, rhsExpr.items[idx], false),
              )
            );
          case 'is':
            return lhsExpr.items === rhsExpr.items;
          default:
            throw VimError.fromCode(ErrorCode.InvalidOperationForList);
        }
      } else {
        throw VimError.fromCode(ErrorCode.CanOnlyCompareListWithList);
      }
    } else if (rhsExpr.type === 'list') {
      throw VimError.fromCode(ErrorCode.CanOnlyCompareListWithList);
    } else if (lhsExpr.type === 'dictionary') {
      if (rhsExpr.type === 'dictionary') {
        const [lhs, rhs] = [this.evaluate(lhsExpr), this.evaluate(rhsExpr)] as [
          DictionaryValue,
          DictionaryValue,
        ];
        switch (operator) {
          case '==':
            return (
              lhs.items.size === rhs.items.size &&
              [...lhs.items.entries()].every(
                ([key, value]) =>
                  rhs.items.has(key) &&
                  this.evaluateBasicComparison('==', matchCase, value, rhs.items.get(key)!, false),
              )
            );
          case 'is':
            return lhs.items === rhs.items;
          default:
            throw VimError.fromCode(ErrorCode.InvalidOperationForDictionary);
        }
      } else {
        throw VimError.fromCode(ErrorCode.CanOnlyCompareDictionaryWithDictionary);
      }
    } else if (rhsExpr.type === 'dictionary') {
      throw VimError.fromCode(ErrorCode.CanOnlyCompareDictionaryWithDictionary);
    } else {
      let [lhs, rhs] = [this.evaluate(lhsExpr), this.evaluate(rhsExpr)] as [
        NumberValue | StringValue,
        NumberValue | StringValue,
      ];
      if (lhs.type === 'number' || rhs.type === 'number') {
        if (topLevel) {
          // Strings are automatically coerced to numbers, except within a list/dict
          // i.e. 4 == "4" but [4] != ["4"]
          [lhs, rhs] = [int(toInt(lhs)), int(toInt(rhs))];
        }
      } else if (!matchCase) {
        lhs.value = lhs.value.toLowerCase();
        rhs.value = rhs.value.toLowerCase();
      }
      switch (operator) {
        case '==':
          return lhs.value === rhs.value;
        case 'is':
          return lhs.type === rhs.type && lhs.value === rhs.value;
        case '>':
          return lhs.value > rhs.value;
        case '=~':
          return false; // TODO
      }
    }
  }

  private evaluateFunctionCall(call: FunctionCallExpression): Value {
    const getArgs = (min: number, max?: number) => {
      if (max === undefined) {
        max = min;
      }
      if (call.args.length < min) {
        throw VimError.fromCode(ErrorCode.NotEnoughArgs, call.func);
      }
      if (call.args.length > max) {
        throw VimError.fromCode(ErrorCode.TooManyArgs, call.func);
      }
      const args: Array<Value | undefined> = call.args.map((arg) => this.evaluate(arg));
      while (args.length < max) {
        args.push(undefined);
      }
      return args;
    };
    switch (call.func) {
      case 'abs': {
        const [x] = getArgs(1);
        return float(Math.abs(toFloat(x!)));
      }
      case 'acos': {
        const [x] = getArgs(1);
        return float(Math.acos(toFloat(x!)));
      }
      case 'add': {
        const [l, expr] = getArgs(2);
        // TODO: should also work with blob
        const lst = toList(l!);
        lst.items.push(expr!);
        return lst;
      }
      case 'asin': {
        const [x] = getArgs(1);
        return float(Math.asin(toFloat(x!)));
      }
      case 'atan2': {
        const [x, y] = getArgs(2);
        return float(Math.atan2(toFloat(x!), toFloat(y!)));
      }
      case 'and': {
        const [x, y] = getArgs(2);
        // eslint-disable-next-line no-bitwise
        return int(toInt(x!) & toInt(y!));
      }
      // TODO: assert_*()
      case 'assert_equal': {
        const [expected, actual, msg] = getArgs(2, 3);
        if (this.evaluateComparison('==', true, expected!, actual!)) {
          return int(0);
        }
        this.errors.push(
          msg
            ? toString(msg)
            : `Expected ${displayValue(expected!)} but got ${displayValue(actual!)}`, // TODO: Include file & line
        );
        return int(1);
      }
      case 'assert_notequal': {
        const [expected, actual, msg] = getArgs(2, 3);
        if (this.evaluateComparison('!=', true, expected!, actual!)) {
          return int(0);
        }
        this.errors.push(
          msg ? toString(msg) : `Expected not equal to ${displayValue(expected!)}`, // TODO: Include file & line
        );
        return int(1);
      }
      case 'assert_report': {
        this.errors.push(toString(getArgs(1)[0]!));
        return int(1);
      }
      case 'assert_true': {
        const [actual, msg] = getArgs(2, 3);
        if (this.evaluateComparison('==', true, bool(true), actual!)) {
          return int(0);
        }
        this.errors.push(
          msg ? toString(msg) : `Expected True but got ${displayValue(actual!)}`, // TODO: Include file & line
        );
        return int(1);
      }
      // TODO: call()
      case 'ceil': {
        const [x] = getArgs(1);
        return float(Math.ceil(toFloat(x!)));
      }
      case 'copy': {
        const [x] = getArgs(1);
        switch (x?.type) {
          case 'list':
            return list([...x.items]);
          case 'dict_val':
            return {
              type: 'dict_val',
              items: new Map(x.items),
            };
        }
        return x!;
      }
      case 'cos': {
        const [x] = getArgs(1);
        return float(Math.cos(toFloat(x!)));
      }
      case 'cosh': {
        const [x] = getArgs(1);
        return float(Math.cosh(toFloat(x!)));
      }
      case 'count': {
        let [comp, expr, ic, start] = getArgs(2, 4);
        const matchCase = toInt(ic ?? bool(false)) === 0;
        if (start !== undefined) {
          if (comp!.type !== 'list') {
            throw VimError.fromCode(ErrorCode.InvalidArgument474);
          }
          if (toInt(start) >= comp!.items.length) {
            throw VimError.fromCode(ErrorCode.ListIndexOutOfRange);
          }
          while (toInt(start) < 0) {
            start = int(toInt(start) + comp!.items.length);
          }
        }
        let count = 0;
        switch (comp!.type) {
          // TODO: case 'string':
          case 'list':
            const startIdx = start ? toInt(start) : 0;
            for (let i = startIdx; i < comp!.items.length; i++) {
              if (this.evaluateComparison('==', matchCase, comp!.items[i], expr!)) {
                count++;
              }
            }
            break;
          case 'dict_val':
            for (const val of comp!.items.values()) {
              if (this.evaluateComparison('==', matchCase, val, expr!)) {
                count++;
              }
            }
            break;
          default:
            throw VimError.fromCode(ErrorCode.ArgumentOfMaxMustBeAListOrDictionary);
        }
        return int(count);
      }
      case 'deepcopy': {
        // TODO: real deep copy once references are implemented
        const [x] = getArgs(1);
        return x!;
      }
      case 'empty': {
        let [x] = getArgs(1);
        x = x!;
        switch (x.type) {
          case 'number':
          case 'float':
            return bool(x.value === 0);
          case 'string':
            return bool(x.value.length === 0);
          case 'list':
            return bool(x.items.length === 0);
          case 'dict_val':
            return bool(x.items.size === 0);
          // TODO:
          // case 'blob':
          default:
            return bool(false);
        }
      }
      case 'eval': {
        const [expr] = getArgs(1);
        return this.evaluate(expressionParser.tryParse(toString(expr!)));
      }
      // TODO: exists()
      case 'exp': {
        const [x] = getArgs(1);
        return float(Math.exp(toFloat(x!)));
      }
      // TODO: extend()
      // TODO: filter()
      // TODO: flatten()
      case 'float2nr': {
        const [x] = getArgs(1);
        return int(toFloat(x!));
      }
      // TODO: fullcommand()
      case 'function': {
        const [name, arglist, dict] = getArgs(1, 3);
        if (arglist) {
          if (arglist.type === 'list') {
            if (dict && dict.type !== 'dict_val') {
              throw VimError.fromCode(ErrorCode.ExpectedADict);
            }
            return funcref(toString(name!), arglist, dict);
          } else if (arglist.type === 'dict_val') {
            if (dict) {
              // function('abs', {}, {})
              throw VimError.fromCode(ErrorCode.SecondArgumentOfFunction);
            }
            return funcref(toString(name!), undefined, arglist);
          } else {
            throw VimError.fromCode(ErrorCode.SecondArgumentOfFunction);
          }
        }
        if (dict && dict.type !== 'dict_val') {
          throw VimError.fromCode(ErrorCode.ExpectedADict);
        }
        // TODO:
        // if (toString(name!) is invalid function) {
        //   throw VimError.fromCode(ErrorCode.UnknownFunction_funcref, toString(name!));
        // }
        return {
          type: 'funcref',
          name: toString(name!),
          arglist,
          dict,
        };
      }
      case 'floor': {
        const [x] = getArgs(1);
        return float(Math.floor(toFloat(x!)));
      }
      case 'fmod': {
        const [x, y] = getArgs(2);
        return float(toFloat(x!) % toFloat(y!));
      }
      case 'get': {
        const [_haystack, _idx, _default] = getArgs(2, 3);
        const haystack = this.evaluate(_haystack!);
        if (haystack.type === 'list') {
          let idx = toInt(this.evaluate(_idx!));
          idx = idx < 0 ? haystack.items.length + idx : idx;
          return idx < haystack.items.length ? haystack.items[idx] : (_default ?? int(0));
        } else if (haystack.type === 'blob') {
          const bytes = new Uint8Array(haystack.data);
          let idx = toInt(this.evaluate(_idx!));
          idx = idx < 0 ? bytes.length + idx : idx;
          return idx < bytes.length ? int(bytes[idx]) : (_default ?? int(-1));
        } else if (haystack.type === 'dict_val') {
          const key = this.evaluate(_idx!);
          const val = haystack.items.get(toString(key));
          return val ? val : (_default ?? int(0));
        }
        return _default ?? int(0);
        // TODO: get({func}, {what})
      }
      // TODO: getcurpos()
      // TODO: getline()
      // TODO: getreg()
      // TODO: getreginfo()
      // TODO: getregtype()
      // TODO: gettext()
      case 'gettext': {
        const [s] = getArgs(1);
        return str(toString(s!));
      }
      // TODO: glob2regpat()
      case 'has': {
        const [feature] = getArgs(1);
        return bool(toString(feature!) === 'vscode');
      }
      case 'has_key': {
        const [d, k] = getArgs(2);
        return bool(toDict(d!).items.has(toString(k!)));
      }
      // TODO: hasmapto()
      // TODO: histadd()/histdel()/histget()/histnr()
      // TODO: id()
      case 'index': {
        const [_haystack, _needle, _start, ic] = getArgs(2, 4);
        const haystack = this.evaluate(_haystack!);
        const needle = this.evaluate(_needle!);

        if (haystack.type === 'list') {
          let start: number | undefined;
          if (_start) {
            start = toInt(_start);
            start = start < 0 ? haystack.items.length + start : start;
          }

          for (const [idx, item] of haystack.items.entries()) {
            if (start && idx < start) {
              continue;
            }
            if (this.evaluateComparison('==', true, item, needle)) {
              return int(idx);
            }
          }
          return int(-1);
        }
        // TODO: handle blob
        throw VimError.fromCode(ErrorCode.ListOrBlobRequired);
      }
      // TODO: indexof()
      // TODO: input()/inputlist()
      // TODO: insert()
      // TODO: invert()
      case 'isinf': {
        const [x] = getArgs(1);
        const _x = toFloat(x!);
        return int(_x === Infinity ? 1 : _x === -Infinity ? -1 : 0);
      }
      // TODO: islocked()
      case 'isnan': {
        const [x] = getArgs(1);
        return bool(isNaN(toFloat(x!)));
      }
      case 'items': {
        const [d] = getArgs(1);
        return list([...toDict(d!).items.entries()].map(([k, v]) => list([str(k), v])));
      }
      case 'join': {
        const [l, sep] = getArgs(1, 2);
        return str(
          toList(l!)
            .items.map(toString)
            .join(sep ? toString(sep) : ''),
        );
      }
      // TODO: json_encode()/json_decode()
      case 'keys': {
        const [d] = getArgs(1);
        return list([...toDict(d!).items.keys()].map(str));
      }
      case 'len': {
        const [x] = getArgs(1);
        switch (x!.type) {
          case 'number':
            return int(x!.value.toString().length);
          case 'string':
            return int(x!.value.length);
          case 'list':
            return int(x!.items.length);
          case 'dict_val':
            return int(x!.items.size);
          case 'blob':
            return int(x!.data.byteLength);
          default:
            throw VimError.fromCode(ErrorCode.InvalidTypeForLen);
        }
      }
      case 'localtime': {
        return int(Date.now() / 1000);
      }
      case 'log': {
        const [x] = getArgs(1);
        return float(Math.log(toFloat(x!)));
      }
      case 'log10': {
        const [x] = getArgs(1);
        return float(Math.log10(toFloat(x!)));
      }
      case 'map': {
        const [seq, fn] = getArgs(2);
        switch (seq?.type) {
          case 'list':
            return list(
              seq.items.map((val, idx) => {
                switch (fn?.type) {
                  case 'funcref':
                    return this.evaluate({
                      type: 'funcrefCall',
                      expression: fn,
                      args: [int(idx), val],
                    });
                  default:
                    this.localScopes.push(
                      new Map([
                        ['v:key', new Variable(int(idx))],
                        ['v:val', new Variable(val)],
                      ]),
                    );
                    const retval = this.evaluate(expressionParser.tryParse(toString(fn!)));
                    this.localScopes.pop();
                    return retval;
                }
              }),
            );
          case 'dict_val':
          // TODO
          // case 'blob':
          // TODO
          // eslint-disable-next-line no-fallthrough
          default:
            throw VimError.fromCode(ErrorCode.ArgumentOfMapMustBeAListDictionaryOrBlob);
        }
      }
      // TODO: matchadd()/matchaddpos()/matcharg()/matchdelete()
      // TODO: match()/matchend()/matchlist()/matchstr()/matchstrpos()
      case 'max': {
        const [l] = getArgs(1);
        let values: Value[];
        if (l?.type === 'list') {
          values = l.items;
        } else if (l?.type === 'dict_val') {
          values = [...l.items.values()];
        } else {
          throw VimError.fromCode(ErrorCode.ArgumentOfMaxMustBeAListOrDictionary);
        }
        return int(values.length === 0 ? 0 : Math.max(...values.map(toInt)));
      }
      case 'min': {
        const [l] = getArgs(1);
        let values: Value[];
        if (l?.type === 'list') {
          values = l.items;
        } else if (l?.type === 'dict_val') {
          values = [...l.items.values()];
        } else {
          // TODO: This should say "min", but still have code 712
          throw VimError.fromCode(ErrorCode.ArgumentOfMaxMustBeAListOrDictionary);
        }
        return int(values.length === 0 ? 0 : Math.min(...values.map(toInt)));
      }
      // TODO: mode()
      case 'or': {
        const [x, y] = getArgs(2);
        // eslint-disable-next-line no-bitwise
        return int(toInt(x!) | toInt(y!));
      }
      case 'pow': {
        const [x, y] = getArgs(2);
        return float(Math.pow(toFloat(x!), toFloat(y!)));
      }
      // TODO: printf()
      // TODO: rand()
      case 'range': {
        const [val, max, stride] = getArgs(1, 3);
        const start = max !== undefined ? toInt(val!) : 0;
        const end = max !== undefined ? toInt(max) : toInt(val!) - 1;
        const step = stride !== undefined ? toInt(stride) : 1;
        if (step === 0) {
          throw VimError.fromCode(ErrorCode.StrideIsZero);
        }
        if (step > 0 !== start < end && Math.abs(start - end) > 1) {
          throw VimError.fromCode(ErrorCode.StartPastEnd);
        }
        const items: Value[] = [];
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          items.push(int(i));
        }
        return list(items);
      }
      // TODO: reduce()
      // TODO: reg_executing()
      // TODO: reg_recorded()
      // TODO: reg_recording()
      // TODO: reltime*()
      case 'repeat': {
        const [val, count] = getArgs(2);
        if (val?.type === 'list') {
          const items: Value[] = new Array<Value[]>(toInt(count!)).fill(val.items).flat();
          return list(items);
        } else {
          return str(toString(val!).repeat(toInt(count!)));
        }
      }
      case 'remove': {
        const [_haystack, _idx, _end] = getArgs(2, 3);
        const haystack = this.evaluate(_haystack!);
        if (haystack.type === 'list') {
          let idx = toInt(this.evaluate(_idx!));
          idx = idx < 0 ? haystack.items.length + idx : idx;
          if (_end === undefined) {
            return haystack.items.splice(idx, 1)[0]; // TODO: This doesn't remove the item?
          } else {
            // TODO: remove({list}, {idx}, {end})
          }
        }
        // TODO: remove({blob}, {idx}, [{end}])
        else if (haystack.type === 'dict_val') {
          const key = toString(this.evaluate(_idx!));
          const val = haystack.items.get(key);
          if (val) {
            haystack.items.delete(key);
            return val;
          }
        }
        return int(0);
      }
      case 'reverse': {
        const [l] = getArgs(1);
        if (l?.type === 'list') {
          l.items.reverse();
          return l;
        } else if (l?.type === 'blob') {
          l.data = new Uint8Array(l.data).reverse();
          return l;
        }
        return int(0);
      }
      case 'round': {
        const [x] = getArgs(1);
        const _x = toFloat(x!);
        // Halfway between integers, Math.round() rounds toward infinity while Vim's round() rounds away from 0.
        return float(_x < 0 ? -Math.round(-_x) : Math.round(_x));
      }
      // TODO: setreg()
      case 'sin': {
        const [x] = getArgs(1);
        return float(Math.sin(toFloat(x!)));
      }
      case 'sinh': {
        const [x] = getArgs(1);
        return float(Math.sinh(toFloat(x!)));
      }
      case 'sort': {
        // TODO: use dict
        const [l, func, dict] = getArgs(1, 3);
        if (l?.type !== 'list') {
          throw VimError.fromCode(ErrorCode.ArgumentOfSortMustBeAList);
        }
        let compare: (x: Value, y: Value) => number;
        if (func !== undefined) {
          if (func.type === 'string' || func.type === 'number') {
            if (func.value === 1 || func.value === '1' || func.value === 'i') {
              // Ignore case
              compare = (x, y) => {
                const [_x, _y] = [displayValue(x).toLowerCase(), displayValue(y).toLowerCase()];
                return _x === _y ? 0 : _x > _y ? 1 : -1;
              };
            } else {
              // TODO: handle other special cases ('l', 'n', 'N', 'f')
              throw Error('compare() with function name is not yet implemented');
            }
          } else if (func.type === 'funcref') {
            compare = (x, y) =>
              toInt(
                this.evaluate({
                  type: 'funcrefCall',
                  expression: func,
                  args: [x, y],
                }),
              );
          } else {
            throw VimError.fromCode(ErrorCode.InvalidArgument474);
          }
        } else {
          compare = (x, y) => (displayValue(x) > displayValue(y) ? 1 : -1);
        }
        // TODO: Numbers after Strings, Lists after Numbers
        return list(l.items.sort(compare));
      }
      case 'split': {
        const [s, pattern, keepempty] = getArgs(1, 3);
        // TODO: Actually parse pattern
        const result = toString(s!).split(pattern && toString(pattern) ? toString(pattern) : /\s+/);
        if (!(keepempty && toInt(this.evaluate(keepempty)))) {
          if (result[0] === '') {
            result.shift();
          }
          if (result && result[result.length - 1] === '') {
            result.pop();
          }
        }
        return list(result.map(str));
      }
      case 'sqrt': {
        const [x] = getArgs(1);
        return float(Math.sqrt(toFloat(x!)));
      }
      // TODO: str2float()
      case 'str2list': {
        const [s, _ignored] = getArgs(1, 2);
        const result: number[] = [];
        for (const char of toString(s!)) {
          result.push(char.charCodeAt(0));
        }
        return list(result.map(int));
      }
      // TODO: str2nr()
      // TODO: stridx()
      case 'string': {
        const [x] = getArgs(1);
        return str(displayValue(x!));
      }
      case 'strlen': {
        const [s] = getArgs(1);
        return int(toString(s!).length);
      }
      // TODO: strpart()
      // TODO: submatch()
      // TODO: substitute()
      case 'tan': {
        const [x] = getArgs(1);
        return float(Math.tan(toFloat(x!)));
      }
      case 'tanh': {
        const [x] = getArgs(1);
        return float(Math.tanh(toFloat(x!)));
      }
      case 'tolower': {
        const [s] = getArgs(1);
        return str(toString(s!).toLowerCase());
      }
      case 'toupper': {
        const [s] = getArgs(1);
        return str(toString(s!).toUpperCase());
      }
      case 'tr': {
        const [_src, _from, _to] = getArgs(1, 3);
        const src = toString(_src!);
        const from = toString(_from!);
        const to = toString(_to!);
        if (from.length !== to.length) {
          throw VimError.fromCode(ErrorCode.InvalidArgument475, from);
        }
        const charMap = new Map<string, string>();
        for (let i = 0; i < from.length; i++) {
          charMap.set(from[i], to[i]);
        }
        return str([...src].map((c) => charMap.get(c) ?? c).join(''));
      }
      case 'trim': {
        const [_s, mask, _dir] = getArgs(1, 3);
        // TODO: use mask
        let s = toString(_s!);
        const dir = _dir ? toInt(_dir) : 0;
        if (dir === 0) {
          // Trim start and end
          s = s.trimStart().trimEnd();
        } else if (dir === 1) {
          // Trim start
          s = s.trimStart();
        } else if (dir === 2) {
          // Trim end
          s = s.trimEnd();
        } else {
          throw VimError.fromCode(ErrorCode.InvalidArgument475, dir.toString());
        }
        return str(s);
      }
      case 'trunc': {
        const [x] = getArgs(1);
        return float(Math.trunc(toFloat(x!)));
      }
      case 'type': {
        let [x] = getArgs(1);
        x = x!;
        switch (x.type) {
          case 'number':
            return int(0);
          case 'string':
            return int(1);
          case 'funcref':
            return int(2);
          case 'list':
            return int(3);
          case 'dict_val':
            return int(4);
          case 'float':
            return int(5);
          // case 'bool':
          //   return int(6);
          // case 'null':
          //   return int(7);
          case 'blob':
            return int(8);
          case 'register_val':
            return int(9);
          default:
            const guard: never = x;
            throw new Error('type() got unexpected type');
        }
      }
      case 'uniq': {
        const [l, func, dict] = getArgs(1, 3);
        // TODO: Use func (see sort() and try to re-use implementation)
        // TODO: Use dict
        if (l!.type !== 'list') {
          throw VimError.fromCode(ErrorCode.ArgumentOfSortMustBeAList); // TODO: Correct error message
        }
        if (l!.items.length > 1) {
          let prev: Value = l!.items[0];
          for (let i = 1; i < l!.items.length; ) {
            const val = l!.items[i];
            if (this.evaluateComparison('==', true, prev, val)) {
              l!.items.splice(i, 1);
            } else {
              prev = val;
              i++;
            }
          }
        }
        return l!;
      }
      case 'values': {
        const [d] = getArgs(1);
        return list([...toDict(d!).items.values()]);
      }
      // TODO: visualmode()
      // TODO: wordcount()
      case 'xor': {
        const [x, y] = getArgs(2);
        // eslint-disable-next-line no-bitwise
        return int(toInt(x!) ^ toInt(y!));
      }
      default: {
        throw VimError.fromCode(ErrorCode.UnknownFunction_call, call.func);
      }
    }
  }
}
