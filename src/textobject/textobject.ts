import { Cursor } from '../common/motion/cursor';
import { Mode } from '../mode/mode';
import { RegisterMode } from '../register/register';
import { VimState } from '../state/vimState';
import { TextEditor } from '../textEditor';
import { RegisterAction } from '../actions/base';
import { BaseMovement, IMovement, failedMovement } from '../actions/baseMotion';
import {
  MoveAroundDoubleQuotes,
  MoveAroundParentheses,
  MoveAroundSingleQuotes,
  MoveAroundSquareBracket,
  MoveAroundBacktick,
  MoveAroundTag,
  ExpandingSelection,
  MoveAroundCurlyBrace,
} from '../actions/motion';
import { ChangeOperator } from '../actions/operator';
import { configuration } from '../configuration/configuration';
import { getCurrentParagraphBeginning, getCurrentParagraphEnd } from './paragraph';
import { Position, TextDocument } from 'vscode';
import { WordType } from './word';

export abstract class TextObject extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock];

  public static readonly attrRegExp = /[\w.:@-]+=(["']).*?\1|[\w.:@-]+=\{.*?\}/;

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    // Since we need to handle leading spaces, we cannot use MoveWordBegin.execActionForOperator
    // In normal mode, the character on the stop position will be the first character after the operator executed
    // and we do left-shifting in operator-pre-execution phase, here we need to right-shift the stop position accordingly.
    res.stop = new Position(res.stop.line, res.stop.character + 1);

    return res;
  }

  public abstract override execAction(position: Position, vimState: VimState): Promise<IMovement>;
}

@RegisterAction
export class SelectWord extends TextObject {
  keys = ['a', 'w'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position;
    let stop: Position;
    const currentChar = TextEditor.getCharAt(vimState.document, position);

    if (currentChar === undefined) {
      start = position;
      stop = position.nextWordEnd(vimState.document);
    } else if (/\s/.test(currentChar)) {
      start = position.prevWordEnd(vimState.document).getRight();
      stop = position.nextWordEnd(vimState.document);
    } else {
      stop = position.nextWordStart(vimState.document);
      // If the next word is not at the beginning of the next line, we want to pretend it is.
      // This is because 'aw' has two fundamentally different behaviors distinguished by whether
      // the next word is directly after the current word, as described in the following comment.
      // The only case that's not true is in cases like #1350.
      if (stop.isEqual(TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, stop.line))) {
        stop = stop.getLineBegin();
      }
      stop = stop.getLeftThroughLineBreaks().getLeftIfEOL();
      // If we aren't separated from the next word by whitespace(like in "horse ca|t,dog" or at the end of the line)
      // then we delete the spaces to the left of the current word. Otherwise, we delete to the right.
      // Also, if the current word is the leftmost word, we only delete from the start of the word to the end.
      if (
        stop.isEqual(position.nextWordEnd(vimState.document, { inclusive: true })) &&
        !position
          .prevWordStart(vimState.document, { inclusive: true })
          .isEqual(TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, stop.line)) &&
        vimState.recordedState.count === 0
      ) {
        start = position.prevWordEnd(vimState.document).getRight();
      } else {
        start = position.prevWordStart(vimState.document, { inclusive: true });
      }
    }

    if (
      vimState.currentMode === Mode.Visual &&
      !vimState.cursorStopPosition.isEqual(vimState.cursorStartPosition)
    ) {
      start = vimState.cursorStartPosition;

      if (vimState.cursorStopPosition.isBefore(vimState.cursorStartPosition)) {
        // If current cursor position is before cursor start position, we are selecting words in reverser order.
        if (/\s/.test(currentChar)) {
          stop = position.prevWordStart(vimState.document, { inclusive: true });
        } else {
          stop = position.prevWordEnd(vimState.document).getRight();
        }
      }
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectABigWord extends TextObject {
  keys = ['a', 'W'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position;
    let stop: Position;

    const currentChar = vimState.document.lineAt(position).text[position.character];

    if (currentChar === undefined) {
      start = position;
      stop = position.nextWordEnd(vimState.document);
    } else if (/\s/.test(currentChar)) {
      start = position.prevWordEnd(vimState.document, { wordType: WordType.Big }).getRight();
      stop = position.nextWordEnd(vimState.document, { wordType: WordType.Big });
    } else {
      // Check 'aw' code for much of the reasoning behind this logic.
      const nextWord = position.nextWordStart(vimState.document, { wordType: WordType.Big });
      if (
        (nextWord.line > position.line || nextWord.isAtDocumentEnd()) &&
        vimState.recordedState.count === 0
      ) {
        if (position.prevWordEnd(vimState.document, { wordType: WordType.Big }).isLineBeginning()) {
          start = position.prevWordEnd(vimState.document, { wordType: WordType.Big });
        } else {
          start = position.prevWordEnd(vimState.document, { wordType: WordType.Big }).getRight();
        }
        stop = position.getLineEnd();
      } else if (
        (nextWord.isEqual(
          TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, nextWord.line),
        ) ||
          nextWord.isLineEnd()) &&
        vimState.recordedState.count === 0
      ) {
        start = position.prevWordEnd(vimState.document).getRight();
        stop = position.getLineEnd();
      } else {
        start = position.prevWordStart(vimState.document, {
          wordType: WordType.Big,
          inclusive: true,
        });
        stop = position.nextWordStart(vimState.document, { wordType: WordType.Big }).getLeft();
      }
    }
    if (
      vimState.currentMode === Mode.Visual &&
      !vimState.cursorStopPosition.isEqual(vimState.cursorStartPosition)
    ) {
      start = vimState.cursorStartPosition;

      if (vimState.cursorStopPosition.isBefore(vimState.cursorStartPosition)) {
        // If current cursor postion is before cursor start position, we are selecting words in reverser order.
        if (/\s/.test(currentChar)) {
          stop = position.prevWordStart(vimState.document, { wordType: WordType.Big });
        } else {
          stop = position.prevWordEnd(vimState.document, { wordType: WordType.Big }).getRight();
        }
      }
    }

    return {
      start,
      stop,
    };
  }
}

/**
 * This is a custom action that I (johnfn) added. It selects procedurally
 * larger blocks. e.g. if you had "blah (foo [bar 'ba|z'])" then it would
 * select 'baz' first. If you pressed af again, it'd then select [bar 'baz'],
 * and if you did it a third time it would select "(foo [bar 'baz'])".
 *
 * Very similar is the now built-in `editor.action.smartSelect.expand`
 */
@RegisterAction
export class SelectAnExpandingBlock extends ExpandingSelection {
  keys = ['a', 'f'];
  override modes = [Mode.Visual, Mode.VisualLine];

  public override async execAction(
    position: Position,
    vimState: VimState,
    firstIteration: boolean,
    lastIteration: boolean,
  ): Promise<IMovement> {
    const blocks = [
      new MoveAroundDoubleQuotes(),
      new MoveAroundSingleQuotes(),
      new MoveAroundBacktick(),
      new MoveAroundCurlyBrace(),
      new MoveAroundParentheses(),
      new MoveAroundSquareBracket(),
      new MoveAroundTag(),
    ];
    // ideally no state would change as we test each of the possible expansions
    // a deep copy of vimState could work here but may be expensive
    let ranges: IMovement[] = [];
    for (const block of blocks) {
      const cursorPos = new Position(position.line, position.character);
      const cursorStartPos = new Position(
        vimState.cursorStartPosition.line,
        vimState.cursorStartPosition.character,
      );
      ranges.push(await block.execAction(cursorPos, vimState, firstIteration, lastIteration));
      vimState.cursorStartPosition = cursorStartPos;
    }

    ranges = ranges.filter((range) => {
      return !range.failed;
    });

    let smallestRange: Cursor | undefined;

    for (const iMotion of ranges) {
      const currentSelectedRange = new Cursor(
        vimState.cursorStartPosition,
        vimState.cursorStopPosition,
      );
      if (iMotion.failed) {
        continue;
      }

      const range = new Cursor(iMotion.start, iMotion.stop);
      let contender: Cursor | undefined;

      if (
        range.start.isBefore(currentSelectedRange.start) &&
        range.stop.isAfter(currentSelectedRange.stop)
      ) {
        if (!smallestRange) {
          contender = range;
        } else {
          if (range.start.isAfter(smallestRange.start) && range.stop.isBefore(smallestRange.stop)) {
            contender = range;
          }
        }
      }

      if (contender) {
        const areTheyEqual =
          contender.equals(new Cursor(vimState.cursorStartPosition, vimState.cursorStopPosition)) ||
          (vimState.currentMode === Mode.VisualLine &&
            contender.start.line === vimState.cursorStartPosition.line &&
            contender.stop.line === vimState.cursorStopPosition.line);

        if (!areTheyEqual) {
          smallestRange = contender;
        }
      }
    }
    if (!smallestRange) {
      return {
        start: vimState.cursorStartPosition,
        stop: vimState.cursorStopPosition,
      };
    } else {
      // revert relevant state changes
      vimState.cursorStartPosition = new Position(
        smallestRange.start.line,
        smallestRange.start.character,
      );
      vimState.cursorStopPosition = new Position(
        smallestRange.stop.line,
        smallestRange.stop.character,
      );
      vimState.recordedState.operatorPositionDiff = undefined;
      return {
        start: smallestRange.start,
        stop: smallestRange.stop,
      };
    }
  }
}

@RegisterAction
export class SelectInnerWord extends TextObject {
  override modes = [Mode.Normal, Mode.Visual];
  keys = ['i', 'w'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position;
    let stop: Position;
    const currentChar = vimState.document.lineAt(position).text[position.character];

    if (currentChar === undefined) {
      start = position;
      stop = position.nextWordStart(vimState.document).getLeftThroughLineBreaks();
    } else if (/\s/.test(currentChar)) {
      start = position.prevWordEnd(vimState.document).getRight();
      stop = position.nextWordStart(vimState.document).getLeftThroughLineBreaks();
    } else {
      start = position.prevWordStart(vimState.document, { inclusive: true });
      stop = position.nextWordEnd(vimState.document, { inclusive: true });
    }

    if (
      vimState.currentMode === Mode.Visual &&
      !vimState.cursorStopPosition.isEqual(vimState.cursorStartPosition)
    ) {
      start = vimState.cursorStartPosition;

      if (vimState.cursorStopPosition.isBefore(vimState.cursorStartPosition)) {
        // If current cursor postion is before cursor start position, we are selecting words in reverser order.
        if (/\s/.test(currentChar)) {
          stop = position.prevWordEnd(vimState.document).getRight();
        } else {
          stop = position.prevWordStart(vimState.document, { inclusive: true });
        }
      }
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectInnerBigWord extends TextObject {
  override modes = [Mode.Normal, Mode.Visual];
  keys = ['i', 'W'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position;
    let stop: Position;
    const currentChar = vimState.document.lineAt(position).text[position.character];

    if (currentChar === undefined) {
      start = position;
      stop = position.nextWordStart(vimState.document).getLeftThroughLineBreaks();
    } else if (/\s/.test(currentChar)) {
      start = position.prevWordEnd(vimState.document, { wordType: WordType.Big }).getRight();
      stop = position.nextWordStart(vimState.document, { wordType: WordType.Big }).getLeft();
    } else {
      start = position.prevWordStart(vimState.document, {
        wordType: WordType.Big,
        inclusive: true,
      });
      stop = position.nextWordEnd(vimState.document, {
        wordType: WordType.Big,
        inclusive: true,
      });
    }

    if (
      vimState.currentMode === Mode.Visual &&
      !vimState.cursorStopPosition.isEqual(vimState.cursorStartPosition)
    ) {
      start = vimState.cursorStartPosition;

      if (vimState.cursorStopPosition.isBefore(vimState.cursorStartPosition)) {
        // If current cursor postion is before cursor start position, we are selecting words in reverser order.
        if (/\s/.test(currentChar)) {
          stop = position.prevWordEnd(vimState.document, { wordType: WordType.Big }).getRight();
        } else {
          stop = position.prevWordStart(vimState.document, { wordType: WordType.Big });
        }
      }
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectSentence extends TextObject {
  keys = ['a', 's'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position;
    let stop: Position;

    const currentSentenceBegin = position.getSentenceBegin({ forward: false });
    const currentSentenceNonWhitespaceEnd = currentSentenceBegin.getSentenceEnd();

    if (currentSentenceNonWhitespaceEnd.isBefore(position)) {
      // The cursor is on a trailing white space.
      start = currentSentenceNonWhitespaceEnd.getRight();
      stop = currentSentenceBegin.getSentenceBegin({ forward: true }).getSentenceEnd();
    } else {
      const nextSentenceBegin = currentSentenceBegin.getSentenceBegin({ forward: true });

      // If the sentence has no trailing white spaces, `as` should include its leading white spaces.
      if (nextSentenceBegin.isEqual(currentSentenceBegin.getSentenceEnd())) {
        start = currentSentenceBegin
          .getSentenceBegin({ forward: false })
          .getSentenceEnd()
          .getRight();
        stop = nextSentenceBegin;
      } else {
        start = currentSentenceBegin;
        stop = nextSentenceBegin.getLeft();
      }
    }

    if (
      vimState.currentMode === Mode.Visual &&
      !vimState.cursorStopPosition.isEqual(vimState.cursorStartPosition)
    ) {
      start = vimState.cursorStartPosition;

      if (vimState.cursorStopPosition.isBefore(vimState.cursorStartPosition)) {
        // If current cursor postion is before cursor start position, we are selecting sentences in reverser order.
        if (currentSentenceNonWhitespaceEnd.isAfter(vimState.cursorStopPosition)) {
          stop = currentSentenceBegin
            .getSentenceBegin({ forward: false })
            .getSentenceEnd()
            .getRight();
        } else {
          stop = currentSentenceBegin;
        }
      }
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectInnerSentence extends TextObject {
  keys = ['i', 's'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position;
    let stop: Position;

    const currentSentenceBegin = position.getSentenceBegin({ forward: false });
    const currentSentenceNonWhitespaceEnd = currentSentenceBegin.getSentenceEnd();

    if (currentSentenceNonWhitespaceEnd.isBefore(position)) {
      // The cursor is on a trailing white space.
      start = currentSentenceNonWhitespaceEnd.getRight();
      stop = currentSentenceBegin.getSentenceBegin({ forward: true }).getLeft();
    } else {
      start = currentSentenceBegin;
      stop = currentSentenceNonWhitespaceEnd;
    }

    if (
      vimState.currentMode === Mode.Visual &&
      !vimState.cursorStopPosition.isEqual(vimState.cursorStartPosition)
    ) {
      start = vimState.cursorStartPosition;

      if (vimState.cursorStopPosition.isBefore(vimState.cursorStartPosition)) {
        // If current cursor postion is before cursor start position, we are selecting sentences in reverser order.
        if (currentSentenceNonWhitespaceEnd.isAfter(vimState.cursorStopPosition)) {
          stop = currentSentenceBegin;
        } else {
          stop = currentSentenceNonWhitespaceEnd.getRight();
        }
      }
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectParagraph extends TextObject {
  keys = ['a', 'p'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    let start: Position;
    const currentParagraphBegin = getCurrentParagraphBeginning(position, true);

    if (vimState.document.lineAt(position).isEmptyOrWhitespace) {
      // The cursor is at an empty line, it can be both the start of next paragraph and the end of previous paragraph
      start = getCurrentParagraphEnd(getCurrentParagraphBeginning(position, true), true);
    } else {
      if (currentParagraphBegin.isLineBeginning() && currentParagraphBegin.isLineEnd()) {
        start = currentParagraphBegin.getRightThroughLineBreaks();
      } else {
        start = currentParagraphBegin;
      }
    }

    // Include additional blank lines.
    let stop = getCurrentParagraphEnd(position, true);
    while (
      stop.line < vimState.document.lineCount - 1 &&
      vimState.document.lineAt(stop.getDown()).isEmptyOrWhitespace
    ) {
      stop = stop.with({ character: 0 }).getDown();
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectInnerParagraph extends TextObject {
  keys = ['i', 'p'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    let start: Position;
    let stop: Position;

    if (vimState.document.lineAt(position).isEmptyOrWhitespace) {
      // The cursor is at an empty line, so white lines are the paragraph.
      start = position.getLineBegin();
      stop = position.getLineEnd();
      while (start.line > 0 && vimState.document.lineAt(start.getUp()).isEmptyOrWhitespace) {
        start = start.getUp();
      }
      while (
        stop.line < vimState.document.lineCount - 1 &&
        vimState.document.lineAt(stop.getDown()).isEmptyOrWhitespace
      ) {
        stop = stop.with({ character: 0 }).getDown();
      }
    } else {
      const currentParagraphBegin = getCurrentParagraphBeginning(position, true);
      stop = getCurrentParagraphEnd(position, true);
      if (vimState.document.lineAt(currentParagraphBegin).isEmptyOrWhitespace) {
        start = currentParagraphBegin.getRightThroughLineBreaks();
      } else {
        start = currentParagraphBegin;
      }

      // Exclude additional blank lines.
      while (stop.line > 0 && vimState.document.lineAt(stop).isEmptyOrWhitespace) {
        stop = stop.getUp().getLineEnd();
      }
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectEntire extends TextObject {
  keys = ['a', 'e'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    return {
      start: TextEditor.getDocumentBegin(),
      stop: TextEditor.getDocumentEnd(vimState.document),
    };
  }
}

@RegisterAction
export class SelectEntireIgnoringLeadingTrailing extends TextObject {
  keys = ['i', 'e'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start: Position = TextEditor.getDocumentBegin();
    let stop: Position = TextEditor.getDocumentEnd(vimState.document);

    while (start.line < stop.line && vimState.document.lineAt(start).isEmptyOrWhitespace) {
      start = start.getDown();
    }

    while (stop.line > start.line && vimState.document.lineAt(stop).isEmptyOrWhitespace) {
      stop = stop.getUp();
    }
    stop = stop.getLineEnd();

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectAttrs extends TextObject {
  keys = ['a', 'r'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start = position;
    let stop = position;

    const range = vimState.document.getWordRangeAtPosition(position, TextObject.attrRegExp);

    if (range) {
      start = range.start;
      stop = range.end;
    }

    return {
      start,
      stop,
    };
  }
}

@RegisterAction
export class SelectInnerAttrs extends TextObject {
  keys = ['i', 'r'];

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    let start = position;
    let stop = position;

    const range = vimState.document.getWordRangeAtPosition(position, TextObject.attrRegExp);

    if (range) {
      start = range.start;
      stop = range.end.getLeft();
    }

    return {
      start,
      stop,
    };
  }
}

abstract class IndentObjectMatch extends TextObject {
  override setsDesiredColumnToEOL = true;

  protected includeLineAbove = false;
  protected includeLineBelow = false;

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const isChangeOperator = vimState.recordedState.operator instanceof ChangeOperator;
    const firstValidLineNumber = IndentObjectMatch.findFirstValidLine(vimState.document, position);
    const firstValidLine = vimState.document.lineAt(firstValidLineNumber);
    const cursorIndent = firstValidLine.firstNonWhitespaceCharacterIndex;

    let startLineNumber = IndentObjectMatch.findRangeStartOrEnd(
      vimState.document,
      firstValidLineNumber,
      cursorIndent,
      -1,
    );
    let endLineNumber = IndentObjectMatch.findRangeStartOrEnd(
      vimState.document,
      firstValidLineNumber,
      cursorIndent,
      1,
    );

    // Adjust the start line as needed.
    if (this.includeLineAbove) {
      startLineNumber -= 1;
    }
    // Check for OOB.
    if (startLineNumber < 0) {
      startLineNumber = 0;
    }

    // Adjust the end line as needed.
    if (this.includeLineBelow) {
      endLineNumber += 1;
    }
    // Check for OOB.
    if (endLineNumber > vimState.document.lineCount - 1) {
      endLineNumber = vimState.document.lineCount - 1;
    }

    // If initiated by a change operation, adjust the cursor to the indent level
    // of the block.
    let startCharacter = 0;
    if (isChangeOperator) {
      startCharacter = vimState.document.lineAt(startLineNumber).firstNonWhitespaceCharacterIndex;
    }
    // TextEditor.getLineMaxColumn throws when given line 0, which we don't
    // care about here since it just means this text object wouldn't work on a
    // single-line document.
    let endCharacter: number;
    if (
      endLineNumber === vimState.document.lineCount - 1 ||
      vimState.currentMode === Mode.Visual ||
      vimState.currentMode === Mode.VisualLine
    ) {
      endCharacter = TextEditor.getLineLength(endLineNumber);
    } else {
      endCharacter = 0;
      endLineNumber++;
    }
    return {
      start: new Position(startLineNumber, startCharacter),
      stop: new Position(endLineNumber, endCharacter),
    };
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<IMovement> {
    return this.execAction(position, vimState);
  }

  /**
   * Searches up from the cursor for the first non-empty line.
   */
  public static findFirstValidLine(document: TextDocument, cursorPosition: Position): number {
    for (let i = cursorPosition.line; i >= 0; i--) {
      if (!document.lineAt(i).isEmptyOrWhitespace) {
        return i;
      }
    }

    return cursorPosition.line;
  }

  /**
   * Searches up or down from a line finding the first with a lower indent level.
   */
  public static findRangeStartOrEnd(
    document: TextDocument,
    startIndex: number,
    cursorIndent: number,
    step: -1 | 1,
  ): number {
    let i = startIndex;
    let ret = startIndex;
    const end = step === 1 ? document.lineCount : -1;

    for (; i !== end; i += step) {
      const line = document.lineAt(i);
      if (line.firstNonWhitespaceCharacterIndex < cursorIndent && !line.isEmptyOrWhitespace) {
        break;
      }

      ret = i;
    }

    return ret;
  }
}

@RegisterAction
class InsideIndentObject extends IndentObjectMatch {
  keys = ['i', 'i'];
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
}

@RegisterAction
class InsideIndentObjectAbove extends IndentObjectMatch {
  keys = ['a', 'i'];
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  override includeLineAbove = true;
}

@RegisterAction
class InsideIndentObjectBoth extends IndentObjectMatch {
  keys = ['a', 'I'];
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  override includeLineAbove = true;
  override includeLineBelow = true;
}

abstract class SelectArgument extends TextObject {
  override modes = [Mode.Normal, Mode.Visual];

  private static openingDelimiterCharacters(): string[] {
    return configuration.argumentObjectOpeningDelimiters;
  }
  private static closingDelimiterCharacters(): string[] {
    return configuration.argumentObjectClosingDelimiters;
  }
  private static separatorCharacters(): string[] {
    return configuration.argumentObjectSeparators;
  }

  // SelectArgument supports two select types: inner and around.
  //
  // Inner will adjust start/stop positions, so that they are inside
  // the delimiters (excluding the delimiters themselves).
  // Around will adjust start/stop positions, so that ONE of them includes
  // a separator character (optionally including extra whitespace).
  protected selectAround = false;

  // Requirement is that below example still works as expected, i.e.
  // when we have nested pairs of parens
  //
  //        ( a, b, (void*) | c(void*, void*), a)
  //
  // Warning: For now, mismatched opening and closing delimiters, e.g.
  // in (foo] will still be matched by this movement.
  //
  // Procedure:
  //
  // 1   Find boundaries left/right (i.e. where the argument starts/ends)
  // 1.1 Walk left until we find a comma or an opening paren, that does not
  //     have a matching closed one. This way we can ignore pairs
  //     of parentheses which are part of the current argument.
  // 1.2 Vice versa for walking right.
  // 2   Depending on our mode (inner or around), improve the start/stop
  //     locations for most consistent behaviour, especially in case of
  //     multi-line statements.

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const failure = failedMovement(vimState);

    let leftSearchStartPosition = position;
    let rightSearchStartPosition = position;

    const charAtPos = TextEditor.getCharAt(vimState.document, position);

    // When the cursor is on a delimiter already, pre-advance the cursor,
    // so that our search actually spans a range. We will advance to the next argument,
    // in case of opening delimiters or separators, and advance to the
    // previous on closing delimiters.
    if (
      SelectArgument.separatorCharacters().includes(charAtPos) ||
      SelectArgument.openingDelimiterCharacters().includes(charAtPos)
    ) {
      rightSearchStartPosition = position.getRightThroughLineBreaks(true);
    } else if (SelectArgument.closingDelimiterCharacters().includes(charAtPos)) {
      leftSearchStartPosition = position.getLeftThroughLineBreaks(true);
    }

    // Early abort, if no delimiters (i.e. (), [], etc.) surround us.
    // This prevents applying the movement to surrounding separators across the buffer.
    if (
      SelectInnerArgument.findLeftArgumentBoundary(
        vimState.document,
        leftSearchStartPosition,
        true,
      ) === undefined ||
      SelectInnerArgument.findRightArgumentBoundary(
        vimState.document,
        rightSearchStartPosition,
        true,
      ) === undefined
    ) {
      return failure;
    }

    const leftArgumentBoundary = SelectInnerArgument.findLeftArgumentBoundary(
      vimState.document,
      leftSearchStartPosition,
    );
    if (leftArgumentBoundary === undefined) {
      return failure;
    }

    const rightArgumentBoundary = SelectInnerArgument.findRightArgumentBoundary(
      vimState.document,
      rightSearchStartPosition,
    );
    if (rightArgumentBoundary === undefined) {
      return failure;
    }

    let start: Position;
    let stop: Position;

    if (this.selectAround) {
      const isLeftOnOpening: boolean = SelectArgument.openingDelimiterCharacters().includes(
        TextEditor.getCharAt(vimState.document, leftArgumentBoundary),
      );
      const isRightOnClosing: boolean = SelectArgument.closingDelimiterCharacters().includes(
        TextEditor.getCharAt(vimState.document, rightArgumentBoundary),
      );

      // Edge-case:
      // Ensure we do not select anything if we have an empty argument list, e.g. "()"
      const isEmptyArgumentList =
        leftArgumentBoundary.getRight().isEqual(rightArgumentBoundary) &&
        isLeftOnOpening &&
        isRightOnClosing;
      if (isEmptyArgumentList) {
        return failure;
      }

      // Only when we are in the first argument we outset the right boundary
      // until the first non-whitespace, so we do not end up with whitespace
      // at the beginning of the parens.
      const isInFirstArgument = isLeftOnOpening && !isRightOnClosing;
      if (isInFirstArgument) {
        stop = rightArgumentBoundary.getRight();
        // Walk right until non-whitespace
        while (/\s/.test(TextEditor.getCharAt(vimState.document, stop.getRight()))) {
          stop = stop.getRight();
        }
      } else {
        // In any other case, we inset
        stop = rightArgumentBoundary.getLeftThroughLineBreaks(true);
      }

      // In case the left boundary is on a opening delimiter, move that position inwards
      if (isLeftOnOpening) {
        start = leftArgumentBoundary.getRightThroughLineBreaks(true);
      } else {
        start = leftArgumentBoundary;
      }
    } else {
      // Inset the start once to get off the boundary and then keep
      // going until the first non whitespace.
      // This ensures that indented argument-lists keep the indentation.
      start = leftArgumentBoundary.getRightThroughLineBreaks(false);
      while (/\s/.test(TextEditor.getCharAt(vimState.document, start))) {
        start = start.getRightThroughLineBreaks(false);
      }

      // Same procedure for stop.
      stop = rightArgumentBoundary.getLeftThroughLineBreaks(false);
      while (/\s/.test(TextEditor.getCharAt(vimState.document, stop))) {
        stop = stop.getLeftThroughLineBreaks(false);
      }

      // Edge-case: Seems there is only whitespace in this argument.
      // Omit any weird handling and just clear all whitespace.
      if (stop.isBeforeOrEqual(start)) {
        start = leftArgumentBoundary.getRightThroughLineBreaks(true);
        stop = rightArgumentBoundary.getLeftThroughLineBreaks(true);
      }
    }

    // Handle case when cursor is not inside the anticipated movement range
    if (position.isBefore(start)) {
      vimState.recordedState.operatorPositionDiff = start.subtract(position);
    }
    vimState.cursorStartPosition = start;

    return {
      start,
      stop,
    };
  }

  private static findLeftArgumentBoundary(
    document: TextDocument,
    position: Position,
    ignoreSeparators: boolean = false,
  ): Position | undefined {
    let delimiterPosition: Position | undefined;
    let walkingPosition = position;
    let closedParensCount = 0;

    while (true) {
      const char = TextEditor.getCharAt(document, walkingPosition);
      if (closedParensCount === 0) {
        let isOnBoundary: boolean = SelectArgument.openingDelimiterCharacters().includes(char);
        if (!ignoreSeparators) {
          isOnBoundary ||= SelectArgument.separatorCharacters().includes(char);
        }

        if (isOnBoundary) {
          // We have found the left most delimiter or the first proper delimiter
          // in our cursor's list 'depth' and thus can abort.
          delimiterPosition = walkingPosition;
          break;
        }
      }
      if (SelectArgument.closingDelimiterCharacters().includes(char)) {
        closedParensCount++;
      }
      if (SelectArgument.openingDelimiterCharacters().includes(char)) {
        closedParensCount--;
      }

      if (walkingPosition.isAtDocumentBegin()) {
        break;
      }

      walkingPosition = walkingPosition.getLeftThroughLineBreaks(true);
    }

    return delimiterPosition;
  }

  private static findRightArgumentBoundary(
    document: TextDocument,
    position: Position,
    ignoreSeparators: boolean = false,
  ): Position | undefined {
    let delimiterPosition: Position | undefined;
    let walkingPosition = position;
    let openedParensCount = 0;

    while (true) {
      const char = TextEditor.getCharAt(document, walkingPosition);
      if (openedParensCount === 0) {
        let isOnBoundary: boolean = SelectArgument.closingDelimiterCharacters().includes(char);
        if (!ignoreSeparators) {
          isOnBoundary ||= SelectArgument.separatorCharacters().includes(char);
        }

        if (isOnBoundary) {
          delimiterPosition = walkingPosition;
          break;
        }
      }
      if (SelectArgument.openingDelimiterCharacters().includes(char)) {
        openedParensCount++;
      }
      if (SelectArgument.closingDelimiterCharacters().includes(char)) {
        openedParensCount--;
      }

      if (walkingPosition.isAtDocumentEnd()) {
        break;
      }

      // We need to include the EOL so that isAtDocumentEnd actually
      // becomes true.
      walkingPosition = walkingPosition.getRightThroughLineBreaks(true);
    }

    return delimiterPosition;
  }
}

@RegisterAction
export class SelectInnerArgument extends SelectArgument {
  override modes = [Mode.Normal, Mode.Visual];
  keys = ['i', 'a'];
}

@RegisterAction
export class SelectAroundArgument extends SelectArgument {
  override modes = [Mode.Normal, Mode.Visual];
  keys = ['a', 'a'];
  override selectAround = true;
}
