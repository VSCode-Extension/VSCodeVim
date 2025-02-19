import * as vscode from 'vscode';

import { ChangeOperator, DeleteOperator, YankOperator } from './operator';
import { CursorMoveByUnit, CursorMovePosition, TextEditor } from './../textEditor';
import { isVisualMode, Mode } from './../mode/mode';
import { PairMatcher } from './../common/matching/matcher';
import { QuoteMatcher } from './../common/matching/quoteMatcher';
import { RegisterAction } from './base';
import { RegisterMode } from './../register/register';
import { TagMatcher } from './../common/matching/tagMatcher';
import { VimState } from './../state/vimState';
import { configuration } from './../configuration/configuration';
import { shouldWrapKey } from './wrapping';
import { VimError, ErrorCode } from '../error';
import { BaseMovement, SelectionType, IMovement, isIMovement, failedMovement } from './baseMotion';
import { globalState } from '../state/globalState';
import { reportSearch } from '../util/statusBarTextUtils';
import { SneakForward, SneakBackward } from './plugins/sneak';
import { Notation } from '../configuration/notation';
import { StatusBar } from '../statusBar';
import { clamp, isHighSurrogate, isLowSurrogate } from '../util/util';
import { getCurrentParagraphBeginning, getCurrentParagraphEnd } from '../textobject/paragraph';
import { PythonDocument } from './languages/python/motion';
import { Position } from 'vscode';
import { sorted } from '../common/motion/position';
import { WordType } from '../textobject/word';
import { CommandInsertAtCursor } from './commands/actions';
import { SearchDirection } from '../vimscript/pattern';
import { SmartQuoteMatcher, WhichQuotes } from './plugins/targets/smartQuotesMatcher';
import { useSmartQuotes } from './plugins/targets/targetsConfig';
import { ModeDataFor } from '../mode/modeData';

/**
 * A movement is something like 'h', 'k', 'w', 'b', 'gg', etc.
 */

export function isFullWidthCharacter(charCode: number): boolean {
  // Do a cheap trick to better support wrapping of wide characters, treat them as 2 columns
  // http://jrgraphix.net/research/unicode_blocks.php
  //          2E80 - 2EFF   CJK Radicals Supplement
  //          2F00 - 2FDF   Kangxi Radicals
  //          2FF0 - 2FFF   Ideographic Description Characters
  //          3000 - 303F   CJK Symbols and Punctuation
  //          3040 - 309F   Hiragana
  //          30A0 - 30FF   Katakana
  //          3100 - 312F   Bopomofo
  //          3130 - 318F   Hangul Compatibility Jamo
  //          3190 - 319F   Kanbun
  //          31A0 - 31BF   Bopomofo Extended
  //          31F0 - 31FF   Katakana Phonetic Extensions
  //          3200 - 32FF   Enclosed CJK Letters and Months
  //          3300 - 33FF   CJK Compatibility
  //          3400 - 4DBF   CJK Unified Ideographs Extension A
  //          4DC0 - 4DFF   Yijing Hexagram Symbols
  //          4E00 - 9FFF   CJK Unified Ideographs
  //          A000 - A48F   Yi Syllables
  //          A490 - A4CF   Yi Radicals
  //          AC00 - D7AF   Hangul Syllables
  // [IGNORE] D800 - DB7F   High Surrogates
  // [IGNORE] DB80 - DBFF   High Private Use Surrogates
  // [IGNORE] DC00 - DFFF   Low Surrogates
  // [IGNORE] E000 - F8FF   Private Use Area
  //          F900 - FAFF   CJK Compatibility Ideographs
  // [IGNORE] FB00 - FB4F   Alphabetic Presentation Forms
  // [IGNORE] FB50 - FDFF   Arabic Presentation Forms-A
  // [IGNORE] FE00 - FE0F   Variation Selectors
  // [IGNORE] FE20 - FE2F   Combining Half Marks
  // [IGNORE] FE30 - FE4F   CJK Compatibility Forms
  // [IGNORE] FE50 - FE6F   Small Form Variants
  // [IGNORE] FE70 - FEFF   Arabic Presentation Forms-B
  //          FF00 - FFEF   Halfwidth and Fullwidth Forms
  //               [https://en.wikipedia.org/wiki/Halfwidth_and_fullwidth_forms]
  //               of which FF01 - FF5E fullwidth ASCII of 21 to 7E
  // [IGNORE]    and FF65 - FFDC halfwidth of Katakana and Hangul
  // [IGNORE] FFF0 - FFFF   Specials
  return (
    (charCode >= 0x2e80 && charCode <= 0xd7af) ||
    (charCode >= 0xf900 && charCode <= 0xfaff) ||
    (charCode >= 0xff01 && charCode <= 0xff5e)
  );
}

export abstract class ExpandingSelection extends BaseMovement {
  protected override selectionType = SelectionType.Expanding;

  protected override adjustPosition(position: Position, result: IMovement, lastIteration: boolean) {
    if (!lastIteration) {
      position = result.stop;
    }
    return position;
  }
}

abstract class MoveByScreenLine extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  abstract movementType: CursorMovePosition;
  by?: CursorMoveByUnit;
  value: number = 1;

  public override async execAction(position: Position, vimState: VimState) {
    return this.execActionWithCount(position, vimState, 1);
  }

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    const multicursorIndex = this.multicursorIndex ?? 0;

    if (multicursorIndex === 0) {
      if (vimState.currentMode === Mode.Visual) {
        // If we change the `vimState.editor.selections` directly with the forEach
        // for some reason vscode doesn't update them. But doing it this way does
        // update vscode's selections.
        vimState.editor.selections = vimState.editor.selections.map((s, i) => {
          if (s.active.isAfter(s.anchor)) {
            // The selection is on the right side of the cursor, while our representation
            // considers the cursor to be the left edge, so we need to move the selection
            // to the right place before executing the 'cursorMove' command.
            const active = s.active.getLeftThroughLineBreaks();
            return new vscode.Selection(s.anchor, active);
          } else {
            return s;
          }
        });
      }

      // When we have multicursors and run a 'cursorMove' command, vscode applies that command
      // to all cursors at the same time. So we should only run it once.
      await vscode.commands.executeCommand('cursorMove', {
        to: this.movementType,
        select: vimState.currentMode !== Mode.Normal,
        // select: ![Mode.Normal, Mode.Insert].includes(vimState.currentMode),
        by: this.by,
        value: this.value * count,
      });
    }

    /**
     * HACK:
     * The `cursorMove` command is handling the selection for us.
     * So we are not following our design principal (do no real movement inside an action) here
     */
    if (!vimState.editor.selections[multicursorIndex]) {
      // VS Code selections no longer have the same amount of cursors as we do. This means that
      // two or more selections combined into one. In this case we return these cursors as they
      // were with the removed flag so that they can be removed.
      // TODO: does this work in VisualBlock (where cursors are not 1 to 1 with selections)?
      return {
        start: vimState.cursorStartPosition,
        stop: vimState.cursorStopPosition,
        removed: true,
      };
    }

    if (vimState.currentMode === Mode.Normal) {
      return vimState.editor.selections[multicursorIndex].active;
    } else {
      let start = vimState.editor.selections[multicursorIndex].anchor;
      const stop = vimState.editor.selections[multicursorIndex].active;

      // If we are moving up we need to keep getting the left of anchor/start because vscode is
      // to the right of the character in order to include it but our positions are always on the
      // left side of the character.
      // Also when we switch from being before anchor to being after anchor we need to move
      // the anchor/start to the left as well in order to include the character.
      if (
        (start.isAfter(stop) &&
          vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) ||
        (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition) &&
          start.isBeforeOrEqual(stop))
      ) {
        start = start.getLeft();
      }

      return { start, stop };
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const multicursorIndex = this.multicursorIndex ?? 0;
    if (multicursorIndex === 0) {
      // When we have multicursors and run a 'cursorMove' command, vscode applies that command
      // to all cursors at the same time. So we should only run it once.
      await vscode.commands.executeCommand('cursorMove', {
        to: this.movementType,
        select: true,
        by: this.by,
        value: this.value,
      });
    }

    if (!vimState.editor.selections[multicursorIndex]) {
      // Vscode selections no longer have the same amount of cursors as we do. This means that
      // two or more selections combined into one. In this case we return these cursors as they
      // were with the removed flag so that they can be removed.
      return {
        start: vimState.cursorStartPosition,
        stop: vimState.cursorStopPosition,
        removed: true,
      };
    }

    return {
      start: vimState.editor.selections[multicursorIndex].start,
      stop: vimState.editor.selections[multicursorIndex].end,
    };
  }
}

class MoveUpByScreenLine extends MoveByScreenLine {
  keys = [];
  movementType: CursorMovePosition = 'up';
  override by: CursorMoveByUnit = 'wrappedLine';
  override value = 1;
}

class MoveDownByScreenLine extends MoveByScreenLine {
  keys = [];
  movementType: CursorMovePosition = 'down';
  override by: CursorMoveByUnit = 'wrappedLine';
  override value = 1;
}

abstract class MoveByScreenLineMaintainDesiredColumn extends MoveByScreenLine {
  override preservesDesiredColumn = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const prevDesiredColumn = vimState.desiredColumn;
    const prevLine = vimState.editor.selection.active.line;

    if (vimState.currentMode !== Mode.Normal) {
      /**
       * As VIM and VSCode handle the end of selection index a little
       * differently we need to sometimes move the cursor at the end
       * of the selection back by a character.
       */
      const start = vimState.editor.selection.start;
      if (
        (this.movementType === 'down' && position.line > start.line) ||
        (this.movementType === 'up' && position.line < prevLine)
      ) {
        await vscode.commands.executeCommand('cursorMove', {
          to: 'left',
          select: true,
          by: 'character',
          value: 1,
        });
      }
    }

    await vscode.commands.executeCommand('cursorMove', {
      to: this.movementType,
      select: vimState.currentMode !== Mode.Normal,
      by: this.by,
      value: this.value,
    });

    if (vimState.currentMode === Mode.Normal) {
      let returnedPos = vimState.editor.selection.active;
      if (prevLine !== returnedPos.line) {
        returnedPos = returnedPos.withColumn(prevDesiredColumn);
      }
      return returnedPos;
    } else {
      /**
       * cursorMove command is handling the selection for us.
       * So we are not following our design principal (do no real movement inside an action) here.
       */
      let start = vimState.editor.selection.start;
      let stop = vimState.editor.selection.end;
      const curPos = vimState.editor.selection.active;

      // We want to swap the cursor start stop positions based on which direction we are moving, up or down
      if (start.isEqual(curPos) && !start.isEqual(stop)) {
        [start, stop] = [stop, start];
        if (prevLine !== start.line) {
          start = start.getLeft();
        }
      }

      if (position.line !== stop.line) {
        stop = stop.withColumn(prevDesiredColumn);
      }

      return { start, stop };
    }
  }
}

class MoveDownFoldFix extends MoveByScreenLineMaintainDesiredColumn {
  keys = [];
  movementType: CursorMovePosition = 'down';
  override by: CursorMoveByUnit = 'line';
  override value = 1;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (position.line >= vimState.document.lineCount - 1) {
      return position;
    }
    let t: Position | IMovement = position;
    let prevLine: number = position.line;
    let prevChar: number = position.character;
    const moveDownByScreenLine = new MoveDownByScreenLine();
    do {
      t = await moveDownByScreenLine.execAction(t, vimState);
      t = t instanceof Position ? t : t.stop;
      const lineChanged = prevLine !== t.line;
      // wrappedLine movement goes to eol character only when at the last line
      // thus a column change on wrappedLine movement represents a visual last line
      const colChanged = prevChar !== t.character;
      if (lineChanged || !colChanged) {
        break;
      }
      prevChar = t.character;
      prevLine = t.line;
    } while (t.line === position.line);
    return t.with({ character: vimState.desiredColumn });
  }
}

@RegisterAction
class MoveDown extends BaseMovement {
  keys = [['j'], ['<down>'], ['<C-j>'], ['<C-n>']];
  override preservesDesiredColumn = true;

  public static nextRenderTabStop(visibleColumn: number, tabSize: number): number {
    return visibleColumn + tabSize - (visibleColumn % tabSize);
  }

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (
      vimState.currentMode === Mode.Insert &&
      this.keysPressed[0] === '<down>' &&
      vimState.editor.document.uri.scheme === 'vscode-interactive-input' &&
      position.line === vimState.document.lineCount - 1 &&
      vimState.editor.selection.isEmpty
    ) {
      // navigate history in interactive window
      await vscode.commands.executeCommand('interactive.history.next');
      return vimState.editor.selection.active;
    }

    if (configuration.foldfix && vimState.currentMode !== Mode.VisualBlock) {
      return new MoveDownFoldFix().execAction(position, vimState);
    }

    if (position.line < vimState.document.lineCount - 1) {
      const newPosition = position.with({ character: vimState.desiredColumn }).getDown();
      const lineText = vimState.document.lineAt(position.line).text;
      const nextLineText = vimState.document.lineAt(newPosition.line).text;
      let characterPositionNormalized = 0;
      const minLineLength = Math.min(lineText.length, nextLineText.length, vimState.desiredColumn);
      let fullWidthCharacters = 0;
      for (let i = 0; i < minLineLength; i++) {
        const charCode = nextLineText.charCodeAt(i);
        if (charCode === 9) {
          characterPositionNormalized += MoveDown.nextRenderTabStop(
            characterPositionNormalized,
            Number(vimState.editor.options.tabSize!),
          );
        } else if (isFullWidthCharacter(charCode)) {
          characterPositionNormalized += 2;
          fullWidthCharacters++;
        } else {
          characterPositionNormalized += 1;
        }
      }
      for (let i = 0; i < minLineLength + fullWidthCharacters; i++) {
        const charCode = nextLineText.charCodeAt(i);
        if (charCode === 9) {
          characterPositionNormalized += MoveDown.nextRenderTabStop(
            characterPositionNormalized,
            Number(vimState.editor.options.tabSize!),
          );
        } else if (isFullWidthCharacter(charCode)) {
          characterPositionNormalized -= 1;
          fullWidthCharacters--;
        }
      }

      return newPosition.with({ character: characterPositionNormalized });
    } else {
      return position;
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getDown();
  }
}

@RegisterAction
class MoveUp extends BaseMovement {
  keys = [['k'], ['<up>'], ['<C-p>']];
  override preservesDesiredColumn = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (
      vimState.currentMode === Mode.Insert &&
      this.keysPressed[0] === '<up>' &&
      vimState.editor.document.uri.scheme === 'vscode-interactive-input' &&
      position.line === 0 &&
      vimState.editor.selection.isEmpty
    ) {
      // navigate history in interactive window
      await vscode.commands.executeCommand('interactive.history.previous');
      return vimState.editor.selection.active;
    }

    if (configuration.foldfix && vimState.currentMode !== Mode.VisualBlock) {
      return new MoveUpFoldFix().execAction(position, vimState);
    }

    if (position.line > 0) {
      const newPosition = position.with({ character: vimState.desiredColumn }).getUp();
      const lineText = vimState.document.lineAt(position.line).text;
      const nextLineText = vimState.document.lineAt(newPosition.line).text;
      let characterPositionNormalized = 0;
      const minLineLength = Math.min(lineText.length, nextLineText.length, vimState.desiredColumn);
      let fullWidthCharacters = 0;
      for (let i = 0; i < minLineLength; i++) {
        const charCode = nextLineText.charCodeAt(i);
        if (charCode === 9) {
          characterPositionNormalized += MoveDown.nextRenderTabStop(
            characterPositionNormalized,
            Number(vimState.editor.options.tabSize!),
          );
        } else if (isFullWidthCharacter(charCode)) {
          characterPositionNormalized += 2;
          fullWidthCharacters++;
        } else {
          characterPositionNormalized += 1;
        }
      }

      for (let i = 0; i < minLineLength + fullWidthCharacters; i++) {
        const charCode = nextLineText.charCodeAt(i);
        if (charCode === 9) {
          characterPositionNormalized += MoveDown.nextRenderTabStop(
            characterPositionNormalized,
            Number(vimState.editor.options.tabSize!),
          );
        } else if (isFullWidthCharacter(charCode)) {
          characterPositionNormalized -= 1;
          fullWidthCharacters--;
        }
      }

      return newPosition.with({ character: characterPositionNormalized });
    } else {
      return position;
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getUp();
  }
}

@RegisterAction
class MoveUpFoldFix extends MoveByScreenLineMaintainDesiredColumn {
  keys = [];
  movementType: CursorMovePosition = 'up';
  override by: CursorMoveByUnit = 'line';
  override value = 1;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (position.line === 0) {
      return position;
    }
    let t: Position | IMovement;
    const moveUpByScreenLine = new MoveUpByScreenLine();
    do {
      t = await moveUpByScreenLine.execAction(position, vimState);
      t = t instanceof Position ? t : t.stop;
    } while (t.line === position.line);
    return t.with({ character: vimState.desiredColumn });
  }
}

@RegisterAction
export class ArrowsInInsertMode extends BaseMovement {
  override modes = [Mode.Insert];
  keys = [['<up>'], ['<down>'], ['<left>'], ['<right>']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    // Moving with the arrow keys in Insert mode "resets" our insertion for the purpose of repeating with dot or `<C-a>`.
    // No matter how we got into Insert mode, repeating will now be done as if we started with `i`.
    // Note that this does not affect macros, which re-construct a list of actions based on keypresses.
    // TODO: ACTUALLY, we should reset this only after something is typed (`Axyz<Left><Esc>.` does repeat the insertion)
    // TODO: This also should mark an "insertion end" for the purpose of `<C-a>` (try `ixyz<Right><C-a>`)
    vimState.recordedState.actionsRun = [new CommandInsertAtCursor()];

    // Force an undo point to be created
    vimState.historyTracker.addChange(true);
    vimState.historyTracker.finishCurrentStep();

    let newPosition: Position;
    switch (this.keysPressed[0]) {
      case '<up>':
        newPosition = await new MoveUp(this.keysPressed).execAction(position, vimState);
        break;
      case '<down>':
        newPosition = await new MoveDown(this.keysPressed).execAction(position, vimState);
        break;
      case '<left>':
        newPosition = await new MoveLeft(this.keysPressed).execAction(position, vimState);
        break;
      case '<right>':
        newPosition = await new MoveRight(this.keysPressed).execAction(position, vimState);
        break;
      default:
        throw new Error(`Unexpected 'arrow' key: ${this.keys[0]}`);
    }
    return newPosition;
  }
}

@RegisterAction
class ArrowsInReplaceMode extends BaseMovement {
  override modes = [Mode.Replace];
  keys = [['<up>'], ['<down>'], ['<left>'], ['<right>']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    // Force an undo point to be created
    vimState.historyTracker.addChange(true);
    vimState.historyTracker.finishCurrentStep();

    let newPosition: Position = position;
    switch (this.keysPressed[0]) {
      case '<up>':
        newPosition = await new MoveUp(this.keysPressed).execAction(position, vimState);
        break;
      case '<down>':
        newPosition = await new MoveDown(this.keysPressed).execAction(position, vimState);
        break;
      case '<left>':
        newPosition = await new MoveLeft(this.keysPressed).execAction(position, vimState);
        break;
      case '<right>':
        newPosition = await new MoveRight(this.keysPressed).execAction(position, vimState);
        break;
      default:
        throw new Error(`Unexpected 'arrow' key: ${this.keys[0]}`);
    }
    (vimState.modeData as ModeDataFor<Mode.Replace>).replaceState.resetChanges(
      this.multicursorIndex ?? 0,
    );
    return newPosition;
  }
}

@RegisterAction
class CommandNextSearchMatch extends BaseMovement {
  keys = ['n'];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const searchState = globalState.searchState;

    if (!searchState || searchState.searchString === '') {
      return position;
    }

    // Turn one of the highlighting flags back on (turned off with :nohl)
    globalState.hl = true;

    if (searchState.getMatchRanges(vimState).length === 0) {
      StatusBar.displayError(
        vimState,
        VimError.fromCode(ErrorCode.PatternNotFound, searchState.searchString),
      );
      return failedMovement(vimState);
    }

    // we have to handle a special case here: searching for $ or \n,
    // which we approximate by positionIsEOL. In that case (but only when searching forward)
    // we need to "offset" by getRight for searching the next match, otherwise we get stuck.
    const searchForward = searchState.direction === SearchDirection.Forward;
    const positionIsEOL = position.getRight().isEqual(position.getLineEnd());
    const nextMatch =
      positionIsEOL && searchForward
        ? searchState.getNextSearchMatchPosition(vimState, position.getRight())
        : searchState.getNextSearchMatchPosition(vimState, position);

    if (!nextMatch) {
      StatusBar.displayError(
        vimState,
        VimError.fromCode(
          searchState.direction === SearchDirection.Forward
            ? ErrorCode.SearchHitBottom
            : ErrorCode.SearchHitTop,
          searchState.searchString,
        ),
      );
      return failedMovement(vimState);
    }

    reportSearch(nextMatch.index, searchState.getMatchRanges(vimState).length, vimState);

    return nextMatch.pos;
  }
}

@RegisterAction
class CommandPreviousSearchMatch extends BaseMovement {
  keys = ['N'];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const searchState = globalState.searchState;

    if (!searchState || searchState.searchString === '') {
      return position;
    }

    // Turn one of the highlighting flags back on (turned off with :nohl)
    globalState.hl = true;

    if (searchState.getMatchRanges(vimState).length === 0) {
      StatusBar.displayError(
        vimState,
        VimError.fromCode(ErrorCode.PatternNotFound, searchState.searchString),
      );
      return failedMovement(vimState);
    }

    const searchForward = searchState.direction === SearchDirection.Forward;
    const positionIsEOL = position.getRight().isEqual(position.getLineEnd());

    // see implementation of n, above.
    const prevMatch =
      positionIsEOL && !searchForward
        ? searchState.getNextSearchMatchPosition(
            vimState,
            position.getRight(),
            SearchDirection.Backward,
          )
        : searchState.getNextSearchMatchPosition(vimState, position, SearchDirection.Backward);

    if (!prevMatch) {
      StatusBar.displayError(
        vimState,
        VimError.fromCode(
          searchState.direction === SearchDirection.Forward
            ? ErrorCode.SearchHitTop
            : ErrorCode.SearchHitBottom,
          searchState.searchString,
        ),
      );
      return failedMovement(vimState);
    }

    reportSearch(prevMatch.index, searchState.getMatchRanges(vimState).length, vimState);

    return prevMatch.pos;
  }
}

@RegisterAction
class MarkMovementBOL extends BaseMovement {
  keys = ["'", '<register>'];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const markName = this.keysPressed[1];
    const mark = vimState.historyTracker.getMark(markName);

    if (mark === undefined) {
      throw VimError.fromCode(ErrorCode.MarkNotSet);
    }

    vimState.currentRegisterMode = RegisterMode.LineWise;

    if (mark.isUppercaseMark && mark.document !== undefined) {
      if (vimState.recordedState.operator && mark.document !== vimState.document) {
        // Operators don't work across files
        throw VimError.fromCode(ErrorCode.MarkNotSet);
      }
      await ensureEditorIsActive(mark.document);
    }

    return TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, mark.position.line);
  }
}

@RegisterAction
class MarkMovement extends BaseMovement {
  keys = ['`', '<register>'];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const markName = this.keysPressed[1];
    const mark = vimState.historyTracker.getMark(markName);

    if (mark === undefined) {
      throw VimError.fromCode(ErrorCode.MarkNotSet);
    }

    if (mark.isUppercaseMark && mark.document !== undefined) {
      if (vimState.recordedState.operator && mark.document !== vimState.document) {
        // Operators don't work across files
        throw VimError.fromCode(ErrorCode.MarkNotSet);
      }
      await ensureEditorIsActive(mark.document);
    }

    return mark.position;
  }
}

@RegisterAction
class NextMark extends BaseMovement {
  keys = [']', '`'];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const positions = vimState.historyTracker
      .getLocalMarks()
      .filter((mark) => mark.position.isAfter(position))
      .map((mark) => mark.position)
      .sort((x, y) => x.compareTo(y));
    return positions.length === 0 ? position : positions[0];
  }
}

@RegisterAction
class PrevMark extends BaseMovement {
  keys = ['[', '`'];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const positions = vimState.historyTracker
      .getLocalMarks()
      .filter((mark) => mark.position.isBefore(position))
      .map((mark) => mark.position)
      .sort((x, y) => y.compareTo(x));
    return positions.length === 0 ? position : positions[0];
  }
}

@RegisterAction
class NextMarkLinewise extends BaseMovement {
  keys = [']', "'"];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    const lines = vimState.historyTracker
      .getLocalMarks()
      .filter((mark) => mark.position.line > position.line)
      .map((mark) => mark.position.line);
    const line = lines.length === 0 ? position.line : Math.min(...lines);
    return new Position(line, 0).getLineBeginRespectingIndent(vimState.document);
  }
}

@RegisterAction
class PrevMarkLinewise extends BaseMovement {
  keys = ['[', "'"];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    const lines = vimState.historyTracker
      .getLocalMarks()
      .filter((mark) => mark.position.line < position.line)
      .map((mark) => mark.position.line);
    const line = lines.length === 0 ? position.line : Math.max(...lines);
    return new Position(line, 0).getLineBeginRespectingIndent(vimState.document);
  }
}

async function ensureEditorIsActive(document: vscode.TextDocument) {
  if (document !== vscode.window.activeTextEditor?.document) {
    await vscode.window.showTextDocument(document);
  }
}

@RegisterAction
class MoveLeft extends BaseMovement {
  keys = [['h'], ['<left>'], ['<BS>'], ['<C-BS>'], ['<S-BS>']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const getLeftWhile = (p: Position): Position => {
      const line = vimState.document.lineAt(p.line).text;

      if (p.character === 0) {
        return p;
      }
      if (
        isLowSurrogate(line.charCodeAt(p.character)) &&
        isHighSurrogate(line.charCodeAt(p.character - 1))
      ) {
        p = p.getLeft();
      }

      const newPosition = p.getLeft();
      if (
        newPosition.character > 0 &&
        isLowSurrogate(line.charCodeAt(newPosition.character)) &&
        isHighSurrogate(line.charCodeAt(newPosition.character - 1))
      ) {
        return newPosition.getLeft();
      } else {
        return newPosition;
      }
    };
    return shouldWrapKey(vimState.currentMode, this.keysPressed[0])
      ? position.getLeftThroughLineBreaks(
          [Mode.Insert, Mode.Replace].includes(vimState.currentMode),
        )
      : getLeftWhile(position);
  }
}

@RegisterAction
class MoveRight extends BaseMovement {
  keys = [['l'], ['<right>'], [' ']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const getRightWhile = (p: Position): Position => {
      const line = vimState.document.lineAt(p.line).text;
      const newPosition = p.getRight();
      if (newPosition.character >= vimState.document.lineAt(newPosition.line).text.length) {
        return newPosition;
      }
      if (
        isLowSurrogate(line.charCodeAt(newPosition.character)) &&
        isHighSurrogate(line.charCodeAt(p.character))
      ) {
        return newPosition.getRight();
      } else {
        return newPosition;
      }
    };
    return shouldWrapKey(vimState.currentMode, this.keysPressed[0])
      ? position.getRightThroughLineBreaks(
          [Mode.Insert, Mode.Replace].includes(vimState.currentMode),
        )
      : getRightWhile(position);
  }
}

@RegisterAction
class MoveDownNonBlank extends BaseMovement {
  keys = [['+'], ['\n'], ['<C-m>']];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return TextEditor.getFirstNonWhitespaceCharOnLine(
      vimState.document,
      position.getDown(Math.max(count, 1)).line,
    );
  }
}

@RegisterAction
class MoveUpNonBlank extends BaseMovement {
  keys = ['-'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return TextEditor.getFirstNonWhitespaceCharOnLine(
      vimState.document,
      position.getUp(Math.max(count, 1)).line,
    );
  }
}

@RegisterAction
class MoveDownUnderscore extends BaseMovement {
  keys = ['_'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    const pos = position.getDown(Math.max(count - 1, 0));
    return vimState.recordedState.operator
      ? pos
      : TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, pos.line);
  }
}

@RegisterAction
class MoveToColumn extends BaseMovement {
  keys = ['|'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    return new Position(position.line, Math.max(0, count - 1));
  }
}

/**
 * Returns the Postion of the next instance of `char` on the line
 * @param char character to look for
 * @param count number of times to look
 * @param direction direction to look in
 */
function findHelper(
  vimState: VimState,
  start: Position,
  char: string,
  count: number,
  direction: 'forward' | 'backward',
): Position | undefined {
  const line = vimState.document.lineAt(start);

  let index = start.character;
  while (count > 0 && index >= 0) {
    if (direction === 'forward') {
      index = line.text.indexOf(char, index + 1);
    } else {
      index = line.text.lastIndexOf(char, index - 1);
    }
    count--;
  }

  if (index >= 0) {
    return new Position(start.line, index);
  }

  return undefined;
}

@RegisterAction
class MoveFindForward extends BaseMovement {
  keys = ['f', '<character>'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    if (configuration.sneakReplacesF) {
      const pos = await new SneakForward(
        this.keysPressed.concat('\n'),
        this.isRepeat,
      ).execActionWithCount(position, vimState, count);
      if (vimState.recordedState.operator && !isIMovement(pos)) {
        return pos.getRight();
      }

      return pos;
    }

    count ||= 1;
    const toFind = Notation.ToControlCharacter(this.keysPressed[1]);
    let result = findHelper(vimState, position, toFind, count, 'forward');

    vimState.lastSemicolonRepeatableMovement = new MoveFindForward(this.keysPressed, true);
    vimState.lastCommaRepeatableMovement = new MoveFindBackward(this.keysPressed, true);

    if (!result) {
      return failedMovement(vimState);
    }

    if (vimState.recordedState.operator) {
      result = result.getRight();
    }

    return result;
  }
}

@RegisterAction
class MoveFindBackward extends BaseMovement {
  keys = ['F', '<character>'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    if (configuration.sneakReplacesF) {
      return new SneakBackward(this.keysPressed.concat('\n'), this.isRepeat).execActionWithCount(
        position,
        vimState,
        count,
      );
    }

    count ||= 1;
    const toFind = Notation.ToControlCharacter(this.keysPressed[1]);
    const result = findHelper(vimState, position, toFind, count, 'backward');

    vimState.lastSemicolonRepeatableMovement = new MoveFindBackward(this.keysPressed, true);
    vimState.lastCommaRepeatableMovement = new MoveFindForward(this.keysPressed, true);

    if (!result) {
      return failedMovement(vimState);
    }

    return result;
  }
}

function tilHelper(
  vimState: VimState,
  start: Position,
  char: string,
  count: number,
  direction: 'forward' | 'backward',
) {
  const result = findHelper(vimState, start, char, count, direction);
  return direction === 'forward' ? result?.getLeft() : result?.getRight();
}

@RegisterAction
class MoveTilForward extends BaseMovement {
  keys = ['t', '<character>'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    count ||= 1;
    const toFind = Notation.ToControlCharacter(this.keysPressed[1]);
    let result = tilHelper(vimState, position, toFind, count, 'forward');

    // For t<character> vim executes ; as 2; and , as 2,
    if (result && this.isRepeat && position.isEqual(result) && count === 1) {
      result = tilHelper(vimState, position, toFind, 2, 'forward');
    }

    vimState.lastSemicolonRepeatableMovement = new MoveTilForward(this.keysPressed, true);
    vimState.lastCommaRepeatableMovement = new MoveTilBackward(this.keysPressed, true);

    if (!result) {
      return failedMovement(vimState);
    }

    if (vimState.recordedState.operator) {
      result = result.getRight();
    }

    return result;
  }
}

@RegisterAction
class MoveTilBackward extends BaseMovement {
  keys = ['T', '<character>'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    count ||= 1;
    const toFind = Notation.ToControlCharacter(this.keysPressed[1]);
    let result = tilHelper(vimState, position, toFind, count, 'backward');

    // For T<character> vim executes ; as 2; and , as 2,
    if (result && this.isRepeat && position.isEqual(result) && count === 1) {
      result = tilHelper(vimState, position, toFind, 2, 'backward');
    }

    vimState.lastSemicolonRepeatableMovement = new MoveTilBackward(this.keysPressed, true);
    vimState.lastCommaRepeatableMovement = new MoveTilForward(this.keysPressed, true);

    if (!result) {
      return failedMovement(vimState);
    }

    return result;
  }
}

@RegisterAction
class MoveRepeat extends BaseMovement {
  keys = [';'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    const movement = vimState.lastSemicolonRepeatableMovement;
    if (movement) {
      return movement.execActionWithCount(position, vimState, count);
    }
    return position;
  }
}

@RegisterAction
class MoveRepeatReversed extends BaseMovement {
  keys = [','];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    const semiColonMovement = vimState.lastSemicolonRepeatableMovement;
    const commaMovement = vimState.lastCommaRepeatableMovement;
    if (commaMovement) {
      const result = commaMovement.execActionWithCount(position, vimState, count);

      // Make sure these don't change. Otherwise, comma's direction flips back
      // and forth when done repeatedly. This is a bit hacky, so feel free to refactor.
      vimState.lastSemicolonRepeatableMovement = semiColonMovement;
      vimState.lastCommaRepeatableMovement = commaMovement;

      return result;
    }
    return position;
  }
}

@RegisterAction
class MoveLineEnd extends BaseMovement {
  keys = [['$'], ['<End>'], ['<D-right>']];
  override setsDesiredColumnToEOL = true;

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    return position.getDown(Math.max(count - 1, 0)).getLineEnd();
  }
}

@RegisterAction
class MoveLineBegin extends BaseMovement {
  keys = [['0'], ['<Home>'], ['<D-left>']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getLineBegin();
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.doesActionApply(vimState, keysPressed) && vimState.recordedState.count === 0;
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.couldActionApply(vimState, keysPressed) && vimState.recordedState.count === 0;
  }
}

@RegisterAction
class MoveScreenLineBegin extends MoveByScreenLine {
  keys = ['g', '0'];
  movementType: CursorMovePosition = 'wrappedLineStart';
}

@RegisterAction
class MoveScreenNonBlank extends MoveByScreenLine {
  keys = ['g', '^'];
  movementType: CursorMovePosition = 'wrappedLineFirstNonWhitespaceCharacter';
}

@RegisterAction
class MoveScreenLineEnd extends MoveByScreenLine {
  keys = ['g', '$'];
  movementType: CursorMovePosition = 'wrappedLineEnd';
}

@RegisterAction
class MoveScreenLineEndNonBlank extends MoveByScreenLine {
  keys = ['g', '_'];
  movementType: CursorMovePosition = 'wrappedLineLastNonWhitespaceCharacter';

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    count ||= 1;
    const pos = await super.execActionWithCount(position, vimState, count);

    // If in visual, return a selection
    if (pos instanceof Position) {
      return pos.getDown(count - 1);
    } else {
      return { start: pos.start, stop: pos.stop.getDown(count - 1).getLeftThroughLineBreaks() };
    }
  }
}

@RegisterAction
class MoveScreenLineCenter extends MoveByScreenLine {
  keys = ['g', 'm'];
  movementType: CursorMovePosition = 'wrappedLineColumnCenter';
}

@RegisterAction
class MoveUpByDisplayLine extends MoveByScreenLine {
  override modes = [Mode.Normal, Mode.Visual];
  keys = [
    ['g', 'k'],
    ['g', '<up>'],
  ];
  movementType: CursorMovePosition = 'up';
  override by: CursorMoveByUnit = 'wrappedLine';
  override value = 1;
}

@RegisterAction
class MoveDownByDisplayLine extends MoveByScreenLine {
  override modes = [Mode.Normal, Mode.Visual];
  keys = [
    ['g', 'j'],
    ['g', '<down>'],
  ];
  movementType: CursorMovePosition = 'down';
  override by: CursorMoveByUnit = 'wrappedLine';
  override value = 1;
}

// Because we can't support moving by screen line when in visualLine mode,
// we change to moving by regular line in visualLine mode. We can't move by
// screen line is that our ranges only support a start and stop attribute,
// and moving by screen line just snaps us back to the original position.
// Check PR #1600 for discussion.
@RegisterAction
class MoveUpByScreenLineVisualLine extends MoveByScreenLine {
  override modes = [Mode.VisualLine];
  keys = [
    ['g', 'k'],
    ['g', '<up>'],
  ];
  movementType: CursorMovePosition = 'up';
  override by: CursorMoveByUnit = 'line';
  override value = 1;
}

@RegisterAction
class MoveDownByScreenLineVisualLine extends MoveByScreenLine {
  override modes = [Mode.VisualLine];
  keys = [
    ['g', 'j'],
    ['g', '<down>'],
  ];
  movementType: CursorMovePosition = 'down';
  override by: CursorMoveByUnit = 'line';
  override value = 1;
}

@RegisterAction
class MoveUpByScreenLineVisualBlock extends BaseMovement {
  override modes = [Mode.VisualBlock];
  keys = [
    ['g', 'k'],
    ['g', '<up>'],
  ];
  override preservesDesiredColumn = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    if (position.line > 0) {
      return position.with({ character: vimState.desiredColumn }).getUp();
    } else {
      return position;
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getUp();
  }
}

@RegisterAction
class MoveDownByScreenLineVisualBlock extends BaseMovement {
  override modes = [Mode.VisualBlock];
  keys = [
    ['g', 'j'],
    ['g', '<down>'],
  ];
  override preservesDesiredColumn = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    if (position.line < vimState.document.lineCount - 1) {
      return position.with({ character: vimState.desiredColumn }).getDown();
    } else {
      return position;
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getDown();
  }
}

@RegisterAction
class MoveScreenToRight extends MoveByScreenLine {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['z', 'h'];
  movementType: CursorMovePosition = 'right';
  override by: CursorMoveByUnit = 'character';
  override value = 1;

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveScreenToLeft extends MoveByScreenLine {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['z', 'l'];
  movementType: CursorMovePosition = 'left';
  override by: CursorMoveByUnit = 'character';
  override value = 1;

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveScreenToRightHalf extends MoveByScreenLine {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['z', 'H'];
  movementType: CursorMovePosition = 'right';
  override by: CursorMoveByUnit = 'halfLine';
  override value = 1;

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveScreenToLeftHalf extends MoveByScreenLine {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['z', 'L'];
  movementType: CursorMovePosition = 'left';
  override by: CursorMoveByUnit = 'halfLine';
  override value = 1;
  override isJump = true;

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveToLineFromViewPortTop extends BaseMovement {
  keys = ['H'];
  override isJump = true;

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    const topLine = vimState.editor.visibleRanges[0].start.line ?? 0;
    if (topLine === 0) {
      return {
        start: vimState.cursorStartPosition,
        stop: position.with({ line: topLine }).obeyStartOfLine(vimState.document),
      };
    }

    const scrolloff = configuration
      .getConfiguration('editor')
      .get<number>('cursorSurroundingLines', 0);
    const line = topLine + scrolloff;

    return {
      start: vimState.cursorStartPosition,
      stop: position.with({ line }).obeyStartOfLine(vimState.document),
    };
  }
}

@RegisterAction
class MoveToLineFromViewPortBottom extends BaseMovement {
  keys = ['L'];
  override isJump = true;

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    const bottomLine = vimState.editor.visibleRanges[0].end.line ?? 0;
    const numLines = vimState.editor.document.lineCount;
    if (bottomLine === numLines - 1) {
      // NOTE: editor will scroll to accommodate editor.cursorSurroundingLines in this scenario
      return {
        start: vimState.cursorStartPosition,
        stop: position.with({ line: bottomLine }).obeyStartOfLine(vimState.document),
      };
    }

    const scrolloff = configuration
      .getConfiguration('editor')
      .get<number>('cursorSurroundingLines', 0);
    const line = bottomLine - scrolloff;

    return {
      start: vimState.cursorStartPosition,
      stop: position.with({ line }).obeyStartOfLine(vimState.document),
    };
  }
}

@RegisterAction
class MoveToMiddleLineInViewPort extends MoveByScreenLine {
  keys = ['M'];
  movementType: CursorMovePosition = 'viewPortCenter';
  override by: CursorMoveByUnit = 'line';
  override isJump = true;
}

@RegisterAction
class MoveNonBlank extends BaseMovement {
  keys = ['^'];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, position.line);
  }
}

@RegisterAction
class MoveNonBlankFirst extends BaseMovement {
  keys = [['g', 'g'], ['<C-Home>']];
  override isJump = true;

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    const line = clamp(count, 1, vimState.document.lineCount) - 1;

    return {
      start: vimState.cursorStartPosition,
      stop: position.with({ line }).obeyStartOfLine(vimState.document),
    };
  }
}

@RegisterAction
class MoveNonBlankLast extends BaseMovement {
  keys = ['G'];
  override isJump = true;

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    let stop: Position;
    if (count === 0) {
      stop = new Position(vimState.document.lineCount - 1, position.character).obeyStartOfLine(
        vimState.document,
      );
    } else {
      stop = new Position(
        Math.min(count, vimState.document.lineCount) - 1,
        position.character,
      ).obeyStartOfLine(vimState.document);
    }

    return {
      start: vimState.cursorStartPosition,
      stop,
    };
  }
}

@RegisterAction
class EndOfSpecificLine extends BaseMovement {
  keys = ['<C-End>'];

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position> {
    const line = count
      ? clamp(count - 1, 0, vimState.document.lineCount - 1)
      : vimState.document.lineCount - 1;

    return new Position(line, 0).getLineEnd();
  }
}

@RegisterAction
export class MoveWordBegin extends BaseMovement {
  keys = ['w'];

  public override async execAction(
    position: Position,
    vimState: VimState,
    firstIteration: boolean,
    lastIteration: boolean,
  ): Promise<Position> {
    if (
      lastIteration &&
      !configuration.changeWordIncludesWhitespace &&
      vimState.recordedState.operator instanceof ChangeOperator
    ) {
      const line = vimState.document.lineAt(position);
      if (line.text.length === 0) {
        return position;
      }

      const char = line.text[position.character];

      /*
            From the Vim manual:

            Special case: "cw" and "cW" are treated like "ce" and "cE" if the cursor is
            on a non-blank.  This is because "cw" is interpreted as change-word, and a
            word does not include the following white space.
            */

      if (' \t'.includes(char)) {
        return position.nextWordStart(vimState.document);
      } else {
        return position.nextWordEnd(vimState.document, { inclusive: true }).getRight();
      }
    } else {
      return position.nextWordStart(vimState.document);
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
    firstIteration: boolean,
    lastIteration: boolean,
  ): Promise<Position> {
    const result = await this.execAction(position, vimState, firstIteration, lastIteration);

    /*
        From the Vim documentation:

        Another special case: When using the "w" motion in combination with an
        operator and the last word moved over is at the end of a line, the end of
        that word becomes the end of the operated text, not the first word in the
        next line.
        */

    if (
      result.line > position.line + 1 ||
      (result.line === position.line + 1 && result.isFirstWordOfLine(vimState.document))
    ) {
      return position.getLineEnd();
    }

    if (result.isLineEnd()) {
      return new Position(result.line, result.character + 1);
    }

    return result;
  }
}

@RegisterAction
export class MoveFullWordBegin extends BaseMovement {
  keys = [['W'], ['<C-right>']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (
      !configuration.changeWordIncludesWhitespace &&
      vimState.recordedState.operator instanceof ChangeOperator
    ) {
      // TODO use execForOperator? Or maybe dont?

      // See note for w
      return position
        .nextWordEnd(vimState.document, { wordType: WordType.Big, inclusive: true })
        .getRight();
    } else {
      return position.nextWordStart(vimState.document, { wordType: WordType.Big });
    }
  }
}

@RegisterAction
class MoveWordEnd extends BaseMovement {
  keys = ['e'];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.nextWordEnd(vimState.document);
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position> {
    const end = position.nextWordEnd(vimState.document);

    return new Position(end.line, end.character + 1);
  }
}

@RegisterAction
class MoveFullWordEnd extends BaseMovement {
  keys = ['E'];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.nextWordEnd(vimState.document, { wordType: WordType.Big });
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position> {
    return position.nextWordEnd(vimState.document, { wordType: WordType.Big }).getRight();
  }
}

@RegisterAction
class MoveLastWordEnd extends BaseMovement {
  keys = ['g', 'e'];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.prevWordEnd(vimState.document);
  }
}

@RegisterAction
class MoveLastFullWordEnd extends BaseMovement {
  keys = ['g', 'E'];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.prevWordEnd(vimState.document, { wordType: WordType.Big });
  }
}

@RegisterAction
class MoveBeginningWord extends BaseMovement {
  keys = [['b'], ['<C-left>']];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.prevWordStart(vimState.document);
  }
}

@RegisterAction
class MoveBeginningFullWord extends BaseMovement {
  keys = ['B'];

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.prevWordStart(vimState.document, { wordType: WordType.Big });
  }
}

@RegisterAction
class MovePreviousSentenceBegin extends BaseMovement {
  keys = ['('];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getSentenceBegin({ forward: false });
  }
}

@RegisterAction
class GoToOffset extends BaseMovement {
  keys = ['g', 'o'];
  override isJump = true;

  public override async execActionWithCount(position: Position, vimState: VimState, count: number) {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return vimState.document.positionAt((count || 1) - 1);
  }
}

@RegisterAction
class MoveNextSentenceBegin extends BaseMovement {
  keys = [')'];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getSentenceBegin({ forward: true });
  }
}

@RegisterAction
class MoveParagraphEnd extends BaseMovement {
  keys = ['}'];
  override isJump = true;
  iteration = 0;
  isFirstLineWise = false;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    const hasOperator = vimState.recordedState.operator;
    const paragraphEnd = getCurrentParagraphEnd(position);

    if (hasOperator) {
      /**
       * When paired with an `operator` and a `count` this move will be executed
       * multiple times which could cause issues like https://github.com/VSCodeVim/Vim/issues/4488
       * because subsequent runs will receive back whatever position we return
       * (See comment in `BaseMotion.execActionWithCount()`).
       *
       * We keep track of the iteration we are in, this way we can
       * return the correct position when on the last iteration, and we don't
       * accidentally set the `registerMode` incorrectly.
       */
      this.iteration++;

      const isLineWise = position.isLineBeginning() && vimState.currentMode === Mode.Normal;

      // TODO: `execAction` receives `firstIteration` and `lastIteration` - don't reinvent the wheel
      const isLastIteration = vimState.recordedState.count
        ? vimState.recordedState.count === this.iteration
        : true;

      /**
       * `position` may not represent the position of the cursor from which the command was initiated.
       * In the case that we will be repeating this move more than once
       * we want to respect whether the starting position was at the beginning of line or not.
       */
      this.isFirstLineWise = this.iteration === 1 ? isLineWise : this.isFirstLineWise;

      vimState.currentRegisterMode = this.isFirstLineWise ? RegisterMode.LineWise : undefined;

      /**
       * `paragraphEnd` is the first blank line after the last word in the
       * current paragraph, we want the position just before that one to
       * accurately emulate Vim's behaviour, unless we are at EOF.
       */
      return isLastIteration && !paragraphEnd.isAtDocumentEnd()
        ? paragraphEnd.getLeftThroughLineBreaks(true)
        : paragraphEnd;
    }

    return paragraphEnd;
  }
}

@RegisterAction
class MoveParagraphBegin extends BaseMovement {
  keys = ['{'];
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<Position> {
    return getCurrentParagraphBeginning(position);
  }
}

abstract class MoveSectionBoundary extends BaseMovement {
  abstract begin: boolean;
  abstract forward: boolean;
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const document = vimState.document;

    switch (document.languageId) {
      case 'python':
        return PythonDocument.moveClassBoundary(
          document,
          position,
          vimState,
          this.forward,
          this.begin,
        );
    }

    const boundary = this.begin ? '{' : '}';
    let line = position.line;

    if (
      (this.forward && line === vimState.document.lineCount - 1) ||
      (!this.forward && line === 0)
    ) {
      return TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, line);
    }

    line = this.forward ? line + 1 : line - 1;

    while (!vimState.document.lineAt(line).text.startsWith(boundary)) {
      if (this.forward) {
        if (line === vimState.document.lineCount - 1) {
          break;
        }

        line++;
      } else {
        if (line === 0) {
          break;
        }

        line--;
      }
    }

    return TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, line);
  }
}

@RegisterAction
class MoveNextSectionBegin extends MoveSectionBoundary {
  keys = [']', ']'];
  begin = true;
  forward = true;
}

@RegisterAction
class MoveNextSectionEnd extends MoveSectionBoundary {
  keys = [']', '['];
  begin = false;
  forward = true;
}

@RegisterAction
class MovePreviousSectionBegin extends MoveSectionBoundary {
  keys = ['[', '['];
  begin = true;
  forward = false;
}

@RegisterAction
class MovePreviousSectionEnd extends MoveSectionBoundary {
  keys = ['[', ']'];
  begin = false;
  forward = false;
}

@RegisterAction
class MoveToMatchingBracket extends BaseMovement {
  keys = ['%'];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    position = position.getLeftIfEOL();

    const lineText = vimState.document.lineAt(position).text;
    const failure = failedMovement(vimState);

    for (let col = position.character; col < lineText.length; col++) {
      const currentChar = lineText[col];
      const pairing = PairMatcher.getPercentPairing(currentChar);

      // we need to check pairing, because with text: bla |bla < blub > blub
      // this for loop will walk over bla and check for a pairing till it finds <
      if (pairing) {
        // We found an opening char, now move to the matching closing char
        return (
          PairMatcher.nextPairedChar(
            new Position(position.line, col),
            lineText[col],
            vimState,
            false,
          ) || failure
        );
      }
    }

    // No matchable character on the line; admit defeat
    return failure;
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const result = await this.execAction(position, vimState);

    if (isIMovement(result)) {
      if (result.failed) {
        return result;
      } else {
        throw new Error('Did not ever handle this case!');
      }
    }

    if (position.isAfter(result)) {
      return {
        start: result,
        stop: position.getRight(),
      };
    } else {
      return result.getRight();
    }
  }

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<Position | IMovement> {
    // % has a special mode that lets you use it to jump to a percentage of the file
    // However, some other bracket motions inherit from this so only do this behavior for % explicitly
    if (Object.getPrototypeOf(this) === MoveToMatchingBracket.prototype) {
      if (count === 0) {
        if (vimState.recordedState.operator) {
          return this.execActionForOperator(position, vimState);
        } else {
          return this.execAction(position, vimState);
        }
      }

      // Check to make sure this is a valid percentage
      if (count < 0 || count > 100) {
        return failedMovement(vimState);
      }

      // See `:help N%`
      const targetLine = Math.trunc((count * vimState.document.lineCount + 99) / 100) - 1;

      return position.with({ line: targetLine }).obeyStartOfLine(vimState.document);
    } else {
      return super.execActionWithCount(position, vimState, count);
    }
  }
}

export abstract class MoveInsideCharacter extends ExpandingSelection {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  protected abstract charToMatch: string;

  /** True for "around" actions, such as `a(`, and false for "inside" actions, such as `i(`  */
  protected includeSurrounding = false;
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState,
    firstIteration: boolean,
    lastIteration: boolean,
  ): Promise<IMovement> {
    const closingChar = PairMatcher.pairings[this.charToMatch].match;
    const [selStart, selEnd] = sorted(vimState.cursorStartPosition, position);

    // First, search backwards for the opening character of the sequence
    let openPos = PairMatcher.nextPairedChar(selStart, closingChar, vimState, true);
    if (openPos === undefined) {
      // If opening character not found, search forwards
      let lineNum = selStart.line;
      while (true) {
        if (lineNum >= vimState.document.lineCount) {
          break;
        }
        const lineText = vimState.document.lineAt(lineNum).text;
        const matchIndex = lineText.indexOf(this.charToMatch);
        if (matchIndex !== -1) {
          openPos = new Position(lineNum, matchIndex);
          break;
        }
        ++lineNum;
      }
      if (openPos === undefined) return failedMovement(vimState);
    }

    // Next, search forwards for the closing character which matches
    let closePos = PairMatcher.nextPairedChar(openPos, this.charToMatch, vimState, true);
    if (closePos === undefined) {
      return failedMovement(vimState);
    }

    if (
      !this.includeSurrounding &&
      (isVisualMode(vimState.currentMode) || !firstIteration) &&
      selStart.getLeftThroughLineBreaks(false).isBeforeOrEqual(openPos) &&
      selEnd.getRightThroughLineBreaks(false).isAfterOrEqual(closePos)
    ) {
      // Special case: inner, with all inner content already selected
      const outerOpenPos = PairMatcher.nextPairedChar(openPos, closingChar, vimState, false);
      const outerClosePos = outerOpenPos
        ? PairMatcher.nextPairedChar(outerOpenPos, this.charToMatch, vimState, false)
        : undefined;

      if (outerOpenPos && outerClosePos) {
        openPos = outerOpenPos;
        closePos = outerClosePos;
      }
    }

    if (this.includeSurrounding) {
      if (vimState.currentMode !== Mode.Visual) {
        closePos = new Position(closePos.line, closePos.character + 1);
      }
    } else {
      openPos = openPos.getRightThroughLineBreaks();
      // If the closing character is the first on the line, don't swallow it.
      if (closePos.isInLeadingWhitespace(vimState.document)) {
        closePos = closePos.getLineBegin();
      }

      if (vimState.currentMode === Mode.Visual) {
        closePos = closePos.getLeftThroughLineBreaks();
      }
    }

    if (lastIteration && !isVisualMode(vimState.currentMode) && selStart.isBefore(openPos)) {
      vimState.recordedState.operatorPositionDiff = openPos.subtract(selStart);
    }

    // TODO: setting the cursor manually like this shouldn't be necessary (probably a Cursor, not Position, should be passed to `exec`)
    vimState.cursorStartPosition = openPos;
    return {
      start: openPos,
      stop: closePos,
    };
  }
}

@RegisterAction
export class MoveInsideParentheses extends MoveInsideCharacter {
  keys = [
    ['i', '('],
    ['i', ')'],
    ['i', 'b'],
  ];
  charToMatch = '(';
}

@RegisterAction
export class MoveAroundParentheses extends MoveInsideCharacter {
  keys = [
    ['a', '('],
    ['a', ')'],
    ['a', 'b'],
  ];
  charToMatch = '(';
  override includeSurrounding = true;
}

// special treatment for curly braces
export abstract class MoveCurlyBrace extends MoveInsideCharacter {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  protected charToMatch: string = '{';

  public override async execAction(
    position: Position,
    vimState: VimState,
    firstIteration: boolean,
    lastIteration: boolean,
  ): Promise<IMovement> {
    // curly braces has a special treatment. In case the cursor is before an opening curly brace,
    // and there are no characters before the opening curly brace in the same line, it should jump
    // to the next opening curly brace, even if it already inside a pair of curly braces.
    const text = vimState.document.lineAt(position).text;
    const openCurlyBraceIndexFromCursor = text.substring(position.character).indexOf('{');
    const startSameAsEnd = vimState.cursorStartPosition.isEqual(position);
    if (
      openCurlyBraceIndexFromCursor !== -1 &&
      text.substring(0, position.character + openCurlyBraceIndexFromCursor).trim().length === 0 &&
      startSameAsEnd
    ) {
      const curlyPos = position.with(
        position.line,
        position.character + openCurlyBraceIndexFromCursor,
      );
      vimState.cursorStartPosition = vimState.cursorStopPosition = curlyPos;
      const movement = await super.execAction(curlyPos, vimState, firstIteration, lastIteration);
      if (movement.failed) {
        return movement;
      }
      const { start, stop } = movement;
      if (!isVisualMode(vimState.currentMode) && position.isBefore(start)) {
        vimState.recordedState.operatorPositionDiff = start.subtract(position);
      } else if (!isVisualMode(vimState.currentMode) && position.isAfter(stop)) {
        if (position.line === stop.line) {
          vimState.recordedState.operatorPositionDiff = stop.subtract(position);
        } else {
          vimState.recordedState.operatorPositionDiff = start.subtract(position);
        }
      }

      vimState.cursorStartPosition = start;
      vimState.cursorStopPosition = stop;
      return movement;
    } else {
      return super.execAction(position, vimState, firstIteration, lastIteration);
    }
  }
}

@RegisterAction
export class MoveInsideCurlyBrace extends MoveCurlyBrace {
  keys = [
    ['i', '{'],
    ['i', '}'],
    ['i', 'B'],
  ];
}

@RegisterAction
export class MoveAroundCurlyBrace extends MoveCurlyBrace {
  keys = [
    ['a', '{'],
    ['a', '}'],
    ['a', 'B'],
  ];
  override includeSurrounding = true;
}

@RegisterAction
export class MoveInsideCaret extends MoveInsideCharacter {
  keys = [
    ['i', '<'],
    ['i', '>'],
  ];
  charToMatch = '<';
}

@RegisterAction
export class MoveAroundCaret extends MoveInsideCharacter {
  keys = [
    ['a', '<'],
    ['a', '>'],
  ];
  charToMatch = '<';
  override includeSurrounding = true;
}

@RegisterAction
export class MoveInsideSquareBracket extends MoveInsideCharacter {
  keys = [
    ['i', '['],
    ['i', ']'],
  ];
  charToMatch = '[';
}

@RegisterAction
export class MoveAroundSquareBracket extends MoveInsideCharacter {
  keys = [
    ['a', '['],
    ['a', ']'],
  ];
  charToMatch = '[';
  override includeSurrounding = true;
}

// TODO: Shouldn't this be a TextObject? A clearer delineation between motions and objects should be made.
export abstract class MoveQuoteMatch extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock];
  protected readonly anyQuote: boolean = false;
  protected abstract readonly charToMatch: '"' | "'" | '`';
  protected includeQuotes = false;
  override isJump = true;
  readonly which: WhichQuotes = 'current';

  // HACK: surround uses these classes, but does not want trailing whitespace to be included
  private adjustForTrailingWhitespace: boolean = true;

  constructor(adjustForTrailingWhitespace: boolean = true) {
    super();
    this.adjustForTrailingWhitespace = adjustForTrailingWhitespace;
  }

  public override async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number,
  ): Promise<IMovement> {
    // TODO: this is super janky
    return (await super.execActionWithCount(position, vimState, 1)) as IMovement;
  }

  public override async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    if (
      !this.includeQuotes &&
      (vimState.recordedState.count > 1 || vimState.recordedState.operatorCount > 1)
    ) {
      // i" special case: With a count of 2 the quotes are included, but no extra white space as with a"/a'/a`.
      // (a" does not make use of count)
      this.includeQuotes = true;
      this.adjustForTrailingWhitespace = false;
    }

    if (useSmartQuotes()) {
      const quoteMatcher = new SmartQuoteMatcher(
        this.anyQuote ? 'any' : this.charToMatch,
        vimState.document,
      );
      const res = quoteMatcher.smartSurroundingQuotes(position, this.which);

      if (res === undefined) {
        return failedMovement(vimState);
      }
      let { start, stop, lineText } = res;

      if (!this.includeQuotes) {
        // Don't include the quotes
        start = start.translate({ characterDelta: 1 });
        stop = stop.translate({ characterDelta: -1 });
      } else if (
        this.adjustForTrailingWhitespace &&
        configuration.targets.smartQuotes.aIncludesSurroundingSpaces
      ) {
        // Include trailing whitespace if there is any...
        const trailingWhitespace = lineText.substring(stop.character + 1).search(/\S|$/);
        if (trailingWhitespace > 0) {
          stop = stop.translate({ characterDelta: trailingWhitespace });
        } else {
          // ...otherwise include leading whitespace
          start = start.with({ character: lineText.substring(0, start.character).search(/\s*$/) });
        }
      }

      if (!isVisualMode(vimState.currentMode) && position.isBefore(start)) {
        vimState.recordedState.operatorPositionDiff = start.subtract(position);
      } else if (!isVisualMode(vimState.currentMode) && position.isAfter(stop)) {
        if (position.line === stop.line) {
          vimState.recordedState.operatorPositionDiff = stop.getRight().subtract(position);
        } else {
          vimState.recordedState.operatorPositionDiff = start.subtract(position);
        }
      }

      vimState.cursorStartPosition = start;
      return {
        start,
        stop,
      };
    } else {
      const text = vimState.document.lineAt(position).text;
      const quoteMatcher = new QuoteMatcher(this.charToMatch, text);
      const quoteIndices = quoteMatcher.surroundingQuotes(position.character);

      if (quoteIndices === undefined) {
        return failedMovement(vimState);
      }

      let [start, end] = quoteIndices;

      if (!this.includeQuotes) {
        // Don't include the quotes
        start++;
        end--;
      } else if (this.adjustForTrailingWhitespace) {
        // Include trailing whitespace if there is any...
        const trailingWhitespace = text.substring(end + 1).search(/\S|$/);
        if (trailingWhitespace > 0) {
          end += trailingWhitespace;
        } else {
          // ...otherwise include leading whitespace
          start = text.substring(0, start).search(/\s*$/);
        }
      }

      const startPos = new Position(position.line, start);
      const endPos = new Position(position.line, end);

      if (!isVisualMode(vimState.currentMode) && position.isBefore(startPos)) {
        vimState.recordedState.operatorPositionDiff = startPos.subtract(position);
      }

      return {
        start: startPos,
        stop: endPos,
      };
    }
  }

  public override async execActionForOperator(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const result = await this.execAction(position, vimState);
    if (isIMovement(result)) {
      if (result.failed) {
        vimState.recordedState.hasRunOperator = false;
        vimState.recordedState.actionsRun = [];
      } else {
        result.stop = result.stop.getRight();
      }
    }
    return result;
  }
}

@RegisterAction
class MoveInsideSingleQuotes extends MoveQuoteMatch {
  keys = ['i', "'"];
  readonly charToMatch = "'";
  override includeQuotes = false;
}

@RegisterAction
export class MoveAroundSingleQuotes extends MoveQuoteMatch {
  keys = ['a', "'"];
  readonly charToMatch = "'";
  override includeQuotes = true;
}

@RegisterAction
class MoveInsideDoubleQuotes extends MoveQuoteMatch {
  keys = ['i', '"'];
  readonly charToMatch = '"';
  override includeQuotes = false;
}

@RegisterAction
export class MoveAroundDoubleQuotes extends MoveQuoteMatch {
  keys = ['a', '"'];
  readonly charToMatch = '"';
  override includeQuotes = true;
}

@RegisterAction
class MoveInsideBacktick extends MoveQuoteMatch {
  keys = ['i', '`'];
  readonly charToMatch = '`';
  override includeQuotes = false;
}

@RegisterAction
export class MoveAroundBacktick extends MoveQuoteMatch {
  keys = ['a', '`'];
  readonly charToMatch = '`';
  override includeQuotes = true;
}

@RegisterAction
class MoveToUnclosedRoundBracketBackward extends MoveToMatchingBracket {
  override keys = ['[', '('];

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const charToMatch = ')';
    const result = PairMatcher.nextPairedChar(position, charToMatch, vimState, false);

    if (!result) {
      return failedMovement(vimState);
    }
    return result;
  }
}

@RegisterAction
class MoveToUnclosedRoundBracketForward extends MoveToMatchingBracket {
  override keys = [']', ')'];

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const charToMatch = '(';
    const result = PairMatcher.nextPairedChar(position, charToMatch, vimState, false);

    if (!result) {
      return failedMovement(vimState);
    }

    if (
      vimState.recordedState.operator instanceof ChangeOperator ||
      vimState.recordedState.operator instanceof DeleteOperator ||
      vimState.recordedState.operator instanceof YankOperator
    ) {
      return result.getLeftThroughLineBreaks();
    }

    return result;
  }
}

@RegisterAction
class MoveToUnclosedCurlyBracketBackward extends MoveToMatchingBracket {
  override keys = ['[', '{'];

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const charToMatch = '}';
    const result = PairMatcher.nextPairedChar(position, charToMatch, vimState, false);

    if (!result) {
      return failedMovement(vimState);
    }
    return result;
  }
}

@RegisterAction
class MoveToUnclosedCurlyBracketForward extends MoveToMatchingBracket {
  override keys = [']', '}'];

  public override async execAction(
    position: Position,
    vimState: VimState,
  ): Promise<Position | IMovement> {
    const charToMatch = '{';
    const result = PairMatcher.nextPairedChar(position, charToMatch, vimState, false);

    if (!result) {
      return failedMovement(vimState);
    }

    if (
      vimState.recordedState.operator instanceof ChangeOperator ||
      vimState.recordedState.operator instanceof DeleteOperator ||
      vimState.recordedState.operator instanceof YankOperator
    ) {
      return result.getLeftThroughLineBreaks();
    }

    return result;
  }
}

abstract class MoveTagMatch extends ExpandingSelection {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock];
  protected includeTag = false;
  override isJump = true;

  public override async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const editorText = vimState.document.getText();
    const offset = vimState.document.offsetAt(position);
    const tagMatcher = new TagMatcher(editorText, offset, vimState);
    const start = tagMatcher.findOpening(this.includeTag);
    const end = tagMatcher.findClosing(this.includeTag);

    if (start === undefined || end === undefined) {
      return failedMovement(vimState);
    }

    const startPosition =
      start >= 0 ? vimState.document.positionAt(start) : vimState.cursorStartPosition;
    let endPosition = end >= 0 ? vimState.document.positionAt(end) : position;
    if (vimState.currentMode === Mode.Visual || vimState.currentMode === Mode.SurroundInputMode) {
      endPosition = endPosition.getLeftThroughLineBreaks();
    }

    if (position.isAfter(endPosition)) {
      vimState.recordedState.transformer.moveCursor(endPosition.subtract(position));
    } else if (position.isBefore(startPosition)) {
      vimState.recordedState.transformer.moveCursor(startPosition.subtract(position));
    }
    // if (start === end) {
    //   if (vimState.recordedState.operator instanceof ChangeOperator) {
    //     await vimState.setCurrentMode(ModeName.Insert);
    //   }
    //   return failedMovement(vimState);
    // }
    vimState.cursorStartPosition = startPosition;
    return {
      start: startPosition,
      stop: endPosition,
    };
  }
}

@RegisterAction
export class MoveInsideTag extends MoveTagMatch {
  keys = ['i', 't'];
  override includeTag = false;
}

@RegisterAction
export class MoveAroundTag extends MoveTagMatch {
  keys = ['a', 't'];
  override includeTag = true;
}
