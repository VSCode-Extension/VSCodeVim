import { configuration } from '../../../configuration/configuration';
import { SelectAroundArgument, SelectInnerArgument } from '../../../textobject/textobject';
import { RegisterAction } from '../../base';
import {
  MoveAroundCaret,
  MoveAroundCurlyBrace,
  MoveAroundParentheses,
  MoveAroundSquareBracket,
  MoveInsideCaret,
  MoveInsideCurlyBrace,
  MoveInsideParentheses,
  MoveInsideSquareBracket,
} from '../../motion';
import { LastArgument, LastObject, NextArgument, NextObject } from './lastNextObjectHelper';

@RegisterAction
class MoveInsideNextParentheses extends NextObject(MoveInsideParentheses) {
  override readonly charToFind: string = '(';
}

@RegisterAction
class MoveInsideLastParentheses extends LastObject(MoveInsideParentheses) {
  override readonly charToFind: string = ')';
}

@RegisterAction
class MoveAroundNextParentheses extends NextObject(MoveAroundParentheses) {
  override readonly charToFind: string = '(';
}

@RegisterAction
class MoveAroundLastParentheses extends LastObject(MoveAroundParentheses) {
  override readonly charToFind: string = ')';
}

@RegisterAction
class MoveInsideNextCurlyBrace extends NextObject(MoveInsideCurlyBrace) {
  override readonly charToFind: string = '{';
}

@RegisterAction
class MoveInsideLastCurlyBrace extends LastObject(MoveInsideCurlyBrace) {
  override readonly charToFind: string = '}';
}

@RegisterAction
class MoveAroundNextCurlyBrace extends NextObject(MoveAroundCurlyBrace) {
  override readonly charToFind: string = '{';
}

@RegisterAction
class MoveAroundLastCurlyBrace extends LastObject(MoveAroundCurlyBrace) {
  override readonly charToFind: string = '}';
}

@RegisterAction
class MoveInsideNextSquareBracket extends NextObject(MoveInsideSquareBracket) {
  override readonly charToFind: string = '[';
}

@RegisterAction
class MoveInsideLastSquareBracket extends LastObject(MoveInsideSquareBracket) {
  override readonly charToFind: string = ']';
}

@RegisterAction
class MoveAroundNextSquareBracket extends NextObject(MoveAroundSquareBracket) {
  override readonly charToFind: string = '[';
}

@RegisterAction
class MoveAroundLastSquareBracket extends LastObject(MoveAroundSquareBracket) {
  override readonly charToFind: string = ']';
}

@RegisterAction
class MoveInsideNextCaret extends NextObject(MoveInsideCaret) {
  override readonly charToFind: string = '<';
}

@RegisterAction
class MoveInsideLastCaret extends LastObject(MoveInsideCaret) {
  override readonly charToFind: string = '>';
}

@RegisterAction
class MoveAroundNextCaret extends NextObject(MoveAroundCaret) {
  override readonly charToFind: string = '<';
}

@RegisterAction
class MoveAroundLastCaret extends LastObject(MoveAroundCaret) {
  override readonly charToFind: string = '>';
}

@RegisterAction
class MoveInsideNextArgument extends NextArgument(SelectInnerArgument) {
  override readonly charsToFind: string[] = [
    ...configuration.argumentObjectSeparators,
    ...configuration.argumentObjectOpeningDelimiters,
  ];
}

@RegisterAction
class MoveInsideLastArgument extends LastArgument(SelectInnerArgument) {
  override readonly charsToFind: string[] = [
    ...configuration.argumentObjectSeparators,
    ...configuration.argumentObjectClosingDelimiters,
  ];
}

@RegisterAction
class MoveAroundNextArgument extends NextArgument(SelectAroundArgument) {
  override readonly charsToFind: string[] = [
    ...configuration.argumentObjectSeparators,
    ...configuration.argumentObjectOpeningDelimiters,
  ];
}

@RegisterAction
class MoveAroundLastArgument extends LastArgument(SelectAroundArgument) {
  override readonly charsToFind: string[] = [
    ...configuration.argumentObjectSeparators,
    ...configuration.argumentObjectClosingDelimiters,
  ];
}
