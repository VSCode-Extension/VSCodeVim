import * as vscode from 'vscode';

import { Position } from 'vscode';
import { reportLinesChanged, reportLinesYanked } from '../util/statusBarTextUtils';
import { isHighSurrogate, isLowSurrogate } from '../util/util';
import { ExCommandLine } from './../cmd_line/commandLine';
import { Cursor } from './../common/motion/cursor';
import { PositionDiff, earlierOf, sorted } from './../common/motion/position';
import { configuration } from './../configuration/configuration';
import { DotCommandStatus, Mode, isVisualMode } from './../mode/mode';
import { Register, RegisterMode } from './../register/register';
import { VimState } from './../state/vimState';
import { TextEditor } from './../textEditor';
import { BaseAction, RegisterAction } from './base';

export abstract class BaseOperator extends BaseAction {
  override actionType = 'operator' as const;

  constructor(multicursorIndex?: number) {
    super();
    this.multicursorIndex = multicursorIndex;
  }
  override createsUndoPoint = true;

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (this.doesRepeatedOperatorApply(vimState, keysPressed)) {
      return true;
    }
    if (!this.modes.includes(vimState.currentMode)) {
      return false;
    }
    if (!BaseAction.CompareKeypressSequence(this.keys, keysPressed)) {
      return false;
    }
    if (this instanceof BaseOperator && vimState.recordedState.operator) {
      return false;
    }

    return true;
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (!this.modes.includes(vimState.currentMode)) {
      return false;
    }
    if (!BaseAction.CompareKeypressSequence(this.keys.slice(0, keysPressed.length), keysPressed)) {
      return false;
    }
    if (this instanceof BaseOperator && vimState.recordedState.operator) {
      return false;
    }

    return true;
  }

  public doesRepeatedOperatorApply(vimState: VimState, keysPressed: string[]) {
    const nonCountActions = vimState.recordedState.actionsRun.filter((x) => x.name !== 'cmd_num');
    const prevAction = nonCountActions[nonCountActions.length - 1];
    return (
      keysPressed.length === 1 &&
      prevAction &&
      this.modes.includes(vimState.currentMode) &&
      // The previous action is the same as the one we're testing
      prevAction.constructor === this.constructor &&
      // The key pressed is the same as the previous action's last key.
      BaseAction.CompareKeypressSequence(prevAction.keysPressed.slice(-1), keysPressed)
    );
  }

  /**
   * Run this operator on a range, returning the new location of the cursor.
   */
  public abstract run(vimState: VimState, start: Position, stop: Position): Promise<void>;

  public async runRepeat(vimState: VimState, position: Position, count: number): Promise<void> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    await this.run(
      vimState,
      position.getLineBegin(),
      position.getDown(Math.max(0, count - 1)).getLineEnd(),
    );
  }

  public highlightYankedRanges(vimState: VimState, ranges: vscode.Range[]) {
    if (!configuration.highlightedyank.enable) {
      return;
    }

    const yankDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: configuration.highlightedyank.color,
      color: configuration.highlightedyank.textColor,
    });

    vimState.editor.setDecorations(yankDecoration, ranges);
    setTimeout(() => yankDecoration.dispose(), configuration.highlightedyank.duration);
  }
}

@RegisterAction
export class DeleteOperator extends BaseOperator {
  public override name = 'delete_op';
  public keys = ['d'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    // TODO: this is off by one when character-wise and not including last EOL
    const numLinesDeleted = Math.abs(start.line - end.line) + 1;

    if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      start = start.getLineBegin();
      end = end.getLineEnd();
    }

    end = new Position(end.line, end.character + 1);

    const isOnLastLine = end.line === vimState.document.lineCount - 1;

    // Vim does this weird thing where it allows you to select and delete
    // the newline character, which it places 1 past the last character
    // in the line. Here we interpret a character position 1 past the end
    // as selecting the newline character. Don't allow this in visual block mode
    if (
      vimState.currentMode !== Mode.VisualBlock &&
      !isOnLastLine &&
      end.character === vimState.document.lineAt(end).text.length + 1
    ) {
      end = new Position(end.line + 1, 0);
    }

    const sLine = vimState.document.lineAt(start.line).text;
    const eLine = vimState.document.lineAt(end.line).text;
    if (
      start.character !== 0 &&
      isLowSurrogate(sLine.charCodeAt(start.character)) &&
      isHighSurrogate(sLine.charCodeAt(start.character - 1))
    ) {
      start = start.getLeft();
    }
    if (
      end.character !== 0 &&
      isLowSurrogate(eLine.charCodeAt(end.character)) &&
      isHighSurrogate(eLine.charCodeAt(end.character - 1))
    ) {
      end = end.getRight();
    }

    // Yank the text
    let text = vimState.document.getText(new vscode.Range(start, end));
    if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      // When deleting linewise, exclude final newline
      text = text.endsWith('\r\n')
        ? text.slice(0, -2)
        : text.endsWith('\n')
          ? text.slice(0, -1)
          : text;
    }
    Register.put(vimState, text, this.multicursorIndex, true);
    // Put into kill ring
    vimState.historyTracker.yankToKillRing(text);

    // When deleting the last line linewise, we need to delete the newline
    // character BEFORE the range because there isn't one after the range.
    if (
      isOnLastLine &&
      start.line !== 0 &&
      vimState.currentRegisterMode === RegisterMode.LineWise
    ) {
      start = start.getUp().getLineEnd();
    }

    let diff: PositionDiff | undefined;
    if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      diff = PositionDiff.startOfLine();
    } else if (start.character > vimState.document.lineAt(start).text.length) {
      diff = PositionDiff.offset({ character: -1 });
    }

    vimState.recordedState.transformer.addTransformation({
      type: 'deleteRange',
      range: new vscode.Range(start, end),
      diff,
    });

    await vimState.setCurrentMode(Mode.Normal);

    reportLinesChanged(-numLinesDeleted, vimState);
  }
}

@RegisterAction
class DeleteOperatorVisual extends BaseOperator {
  public keys = ['D'];
  public modes = [Mode.Visual, Mode.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    // ensures linewise deletion when in visual mode
    // see special case in DeleteOperator.delete()
    vimState.currentRegisterMode = RegisterMode.LineWise;

    await new DeleteOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
export class YankOperator extends BaseOperator {
  public keys = ['y'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  override name = 'yank_op';
  override createsUndoPoint = false;

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    [start, end] = sorted(start, end);
    let extendedEnd = new Position(end.line, end.character + 1);

    if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      start = start.getLineBegin();
      extendedEnd = extendedEnd.getLineEnd();
    }

    const sLine = vimState.document.lineAt(start.line).text;
    const eLine = vimState.document.lineAt(extendedEnd.line).text;
    if (
      start.character !== 0 &&
      isLowSurrogate(sLine.charCodeAt(start.character)) &&
      isHighSurrogate(sLine.charCodeAt(start.character - 1))
    ) {
      start = start.getLeft();
    }
    if (
      extendedEnd.character !== 0 &&
      isLowSurrogate(eLine.charCodeAt(extendedEnd.character)) &&
      isHighSurrogate(eLine.charCodeAt(extendedEnd.character - 1))
    ) {
      extendedEnd = extendedEnd.getRight();
    }
    const range = new vscode.Range(start, extendedEnd);
    let text = vimState.document.getText(range);

    // If we selected the newline character, add it as well.
    if (
      vimState.currentMode === Mode.Visual &&
      extendedEnd.character === vimState.document.lineAt(extendedEnd).text.length + 1
    ) {
      text = text + '\n';
    }

    this.highlightYankedRanges(vimState, [range]);

    Register.put(vimState, text, this.multicursorIndex, true);
    // Put into kill ring
    vimState.historyTracker.yankToKillRing(text);

    vimState.cursorStopPosition =
      vimState.currentMode === Mode.Normal && vimState.currentRegisterMode === RegisterMode.LineWise
        ? start.with({ character: vimState.cursorStopPosition.character })
        : start;

    await vimState.setCurrentMode(Mode.Normal);

    const numLinesYanked = text.split('\n').length;
    reportLinesYanked(numLinesYanked, vimState);
  }
}

@RegisterAction
class FilterOperator extends BaseOperator {
  public keys = ['!'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    [start, end] = sorted(start, end);

    let commandLineText: string;
    if (vimState.currentMode === Mode.Normal && start.line === end.line) {
      commandLineText = '.!';
    } else if (vimState.currentMode === Mode.Normal && start.line !== end.line) {
      commandLineText = `.,.+${end.line - start.line}!`;
    } else {
      commandLineText = "'<,'>!";
    }

    vimState.cursorStartPosition = start;
    if (vimState.currentMode === Mode.Normal) {
      vimState.cursorStopPosition = start;
    } else {
      vimState.cursors = [...vimState.cursorsInitialState];
    }

    const previousMode = vimState.currentMode;
    await vimState.setCurrentMode(Mode.CommandlineInProgress);
    // TODO: Change or supplement `setCurrentMode` API so this isn't necessary
    if (vimState.modeData.mode === Mode.CommandlineInProgress) {
      vimState.modeData.commandLine = new ExCommandLine(commandLineText, previousMode);
    }
  }
}

@RegisterAction
class ShiftYankOperatorVisual extends BaseOperator {
  public keys = ['Y'];
  public modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    await new YankOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
class DeleteOperatorXVisual extends BaseOperator {
  public keys = [['x'], ['<Del>']];
  public modes = [Mode.Visual, Mode.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    await new DeleteOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
class ChangeOperatorSVisual extends BaseOperator {
  public keys = ['s'];
  public modes = [Mode.Visual, Mode.VisualLine];

  // Don't clash with Sneak plugin
  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.doesActionApply(vimState, keysPressed) && !configuration.sneak;
  }

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    await new ChangeOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
class FormatOperator extends BaseOperator {
  public keys = ['='];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    // = operates on complete lines
    vimState.editor.selection = new vscode.Selection(start.getLineBegin(), end.getLineEnd());
    await vscode.commands.executeCommand('editor.action.formatSelection');
    let line = vimState.cursorStartPosition.line;

    if (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) {
      line = vimState.cursorStopPosition.line;
    }

    const newCursorPosition = TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, line);
    vimState.cursorStopPosition = newCursorPosition;
    vimState.cursorStartPosition = newCursorPosition;
    await vimState.setCurrentMode(Mode.Normal);
  }
}

abstract class ChangeCaseOperator extends BaseOperator {
  public modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  abstract transformText(text: string): string;

  public async run(vimState: VimState, startPos: Position, endPos: Position): Promise<void> {
    if (vimState.currentMode === Mode.VisualBlock) {
      for (const { start, end } of TextEditor.iterateLinesInBlock(vimState)) {
        const range = new vscode.Range(start, end);
        vimState.recordedState.transformer.replace(
          range,
          this.transformText(vimState.document.getText(range)),
        );
      }

      // HACK: currently must do this nonsense to collapse all cursors into one
      for (let i = 0; i < vimState.editor.selections.length; i++) {
        vimState.recordedState.transformer.moveCursor(
          PositionDiff.exactPosition(earlierOf(startPos, endPos)),
          i,
        );
      }
    } else {
      if (vimState.currentRegisterMode === RegisterMode.LineWise) {
        startPos = startPos.getLineBegin();
        endPos = endPos.getLineEnd();
      }

      const range = new vscode.Range(startPos, new Position(endPos.line, endPos.character + 1));

      vimState.recordedState.transformer.addTransformation({
        type: 'replaceText',
        range,
        text: this.transformText(vimState.document.getText(range)),
        diff: PositionDiff.exactPosition(startPos),
      });
    }

    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class UpperCaseOperator extends ChangeCaseOperator {
  public keys = [['g', 'U'], ['U']];

  public transformText(text: string): string {
    return text.toUpperCase();
  }
}

@RegisterAction
class UpperCaseWithMotion extends UpperCaseOperator {
  public override keys = [['g', 'U']];
  public override modes = [Mode.Normal];
}

@RegisterAction
class LowerCaseOperator extends ChangeCaseOperator {
  public keys = [['g', 'u'], ['u']];

  public transformText(text: string): string {
    return text.toLowerCase();
  }
}

@RegisterAction
class LowerCaseWithMotion extends LowerCaseOperator {
  public override keys = [['g', 'u']];
  public override modes = [Mode.Normal];
}

@RegisterAction
class ToggleCaseOperator extends ChangeCaseOperator {
  public keys = [['g', '~'], ['~']];

  public transformText(text: string): string {
    let newText = '';
    for (const char of text) {
      let toggled = char.toLocaleLowerCase();
      if (toggled === char) {
        toggled = char.toLocaleUpperCase();
      }
      newText += toggled;
    }
    return newText;
  }
}

@RegisterAction
class ToggleCaseWithMotion extends ToggleCaseOperator {
  public override keys = [['g', '~']];
  public override modes = [Mode.Normal];
}

@RegisterAction
class IndentOperator extends BaseOperator {
  modes = [Mode.Normal];
  keys = ['>'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    vimState.editor.selection = new vscode.Selection(start.getLineBegin(), end.getLineEnd());

    await vscode.commands.executeCommand('editor.action.indentLines');

    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursorStopPosition = start.obeyStartOfLine(vimState.document);
  }
}

/**
 * `3>` to indent a line 3 times in visual mode is actually a bit of a special case.
 *
 * > is an operator, and generally speaking, you don't run operators multiple times, you run motions multiple times.
 * e.g. `d3w` runs `w` 3 times, then runs d once.
 *
 * Same with literally every other operator motion combination... until `3>`in visual mode
 * walked into my life.
 */
@RegisterAction
class IndentOperatorVisualAndVisualLine extends BaseOperator {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = ['>'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    // Repeating this command with dot should apply the indent to the previous selection
    if (
      vimState.dotCommandStatus === DotCommandStatus.Executing &&
      vimState.dotCommandPreviousVisualSelection
    ) {
      if (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) {
        const shiftSelectionByNum =
          vimState.dotCommandPreviousVisualSelection.end.line -
          vimState.dotCommandPreviousVisualSelection.start.line;

        start = vimState.cursorStartPosition;
        const newEnd = vimState.cursorStartPosition.getDown(shiftSelectionByNum);

        vimState.editor.selection = new vscode.Selection(start, newEnd);
      }
    }

    for (let i = 0; i < (vimState.recordedState.count || 1); i++) {
      await vscode.commands.executeCommand('editor.action.indentLines');
    }

    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursorStopPosition = start.obeyStartOfLine(vimState.document);
  }
}

@RegisterAction
class IndentOperatorVisualBlock extends BaseOperator {
  modes = [Mode.VisualBlock];
  keys = ['>'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    /**
     * Repeating this command with dot should apply the indent to the left edge of the
     * block formed by extending the cursor start position downward by the number of lines
     * in the previous visual block selection.
     */
    if (
      vimState.dotCommandStatus === DotCommandStatus.Executing &&
      vimState.dotCommandPreviousVisualSelection
    ) {
      const shiftSelectionByNum = Math.abs(
        vimState.dotCommandPreviousVisualSelection.end.line -
          vimState.dotCommandPreviousVisualSelection.start.line,
      );

      start = vimState.cursorStartPosition;
      end = vimState.cursorStartPosition.getDown(shiftSelectionByNum);

      vimState.editor.selection = new vscode.Selection(start, end);
    }

    for (let lineIdx = 0; lineIdx < end.line - start.line + 1; lineIdx++) {
      const tabSize = Number(vimState.editor.options.tabSize);
      const currentLineEnd = vimState.document.lineAt(start.line + lineIdx).range.end.character;

      if (currentLineEnd > start.character) {
        vimState.recordedState.transformer.addTransformation({
          type: 'insertText',
          text: ' '.repeat(tabSize).repeat(vimState.recordedState.count || 1),
          position: start.getDown(lineIdx),
          manuallySetCursorPositions: true,
        });
      }
    }

    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursors = [new Cursor(start, start)];
  }
}
@RegisterAction
class OutdentOperator extends BaseOperator {
  modes = [Mode.Normal];
  keys = ['<'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    vimState.editor.selection = new vscode.Selection(start, end.getLineEnd());

    await vscode.commands.executeCommand('editor.action.outdentLines');
    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursorStopPosition = TextEditor.getFirstNonWhitespaceCharOnLine(
      vimState.document,
      start.line,
    );
  }
}

/**
 * See comment for IndentOperatorVisualAndVisualLine
 */
@RegisterAction
class OutdentOperatorVisualAndVisualLine extends BaseOperator {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = ['<'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    // Repeating this command with dot should apply the indent to the previous selection
    if (
      vimState.dotCommandStatus === DotCommandStatus.Executing &&
      vimState.dotCommandPreviousVisualSelection
    ) {
      if (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) {
        const shiftSelectionByNum =
          vimState.dotCommandPreviousVisualSelection.end.line -
          vimState.dotCommandPreviousVisualSelection.start.line;

        start = vimState.cursorStartPosition;
        const newEnd = vimState.cursorStartPosition.getDown(shiftSelectionByNum);

        vimState.editor.selection = new vscode.Selection(start, newEnd);
      }
    }

    for (let i = 0; i < (vimState.recordedState.count || 1); i++) {
      await vscode.commands.executeCommand('editor.action.outdentLines');
    }

    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursorStopPosition = TextEditor.getFirstNonWhitespaceCharOnLine(
      vimState.document,
      start.line,
    );
  }
}

@RegisterAction
class OutdentOperatorVisualBlock extends BaseOperator {
  modes = [Mode.VisualBlock];
  keys = ['<'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    /**
     * Repeating this command with dot should apply the outdent to the left edge of the
     * block formed by extending the cursor start position downward by the number of lines
     * in the previous visual block selection.
     */
    if (
      vimState.dotCommandStatus === DotCommandStatus.Executing &&
      vimState.dotCommandPreviousVisualSelection
    ) {
      const shiftSelectionByNum = Math.abs(
        vimState.dotCommandPreviousVisualSelection.end.line -
          vimState.dotCommandPreviousVisualSelection.start.line,
      );

      start = vimState.cursorStartPosition;
      end = vimState.cursorStartPosition.getDown(shiftSelectionByNum);

      vimState.editor.selection = new vscode.Selection(start, end);
    }

    for (let lineIdx = 0; lineIdx < end.line - start.line + 1; lineIdx++) {
      const tabSize = Number(vimState.editor.options.tabSize);
      const currentLine = vimState.document.lineAt(start.line + lineIdx);
      const currentLineEnd = currentLine.range.end.character;

      if (currentLineEnd > start.character) {
        const currentLineFromStart = currentLine.text.slice(start.character);
        const isFirstCharBlank = /\s/.test(currentLineFromStart.charAt(0));

        if (isFirstCharBlank) {
          const currentLinePosition = start.getDown(lineIdx);
          const distToNonBlankChar = currentLineFromStart.match(/\S/)?.index ?? 0;
          const outdentDist = Math.min(
            distToNonBlankChar,
            tabSize * (vimState.recordedState.count || 1),
          );

          vimState.recordedState.transformer.addTransformation({
            type: 'deleteRange',
            range: new vscode.Range(currentLinePosition, currentLinePosition.getRight(outdentDist)),
            manuallySetCursorPositions: true,
          });
        }
      }
    }

    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursors = [new Cursor(start, start)];
  }
}

@RegisterAction
export class ChangeOperator extends BaseOperator {
  public keys = ['c'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      start = start.getLineBegin();
      end = end.getLineEnd();
    } else if (vimState.currentMode === Mode.Visual && end.isLineEnd()) {
      end = end.getRightThroughLineBreaks();
    } else {
      end = end.getRight();
    }

    const deleteRange = new vscode.Range(start, end);
    const text = vimState.document.getText(deleteRange);

    Register.put(vimState, text, this.multicursorIndex, true);
    // Put into kill ring
    vimState.historyTracker.yankToKillRing(text);

    if (vimState.currentRegisterMode === RegisterMode.LineWise && configuration.autoindent) {
      // Linewise is a bit of a special case - we want to preserve the first line's indentation,
      // then let the language server adjust that indentation if it can.

      const firstLineIndent = vimState.document.getText(
        new vscode.Range(
          deleteRange.start.getLineBegin(),
          deleteRange.start.getLineBeginRespectingIndent(vimState.document),
        ),
      );

      vimState.recordedState.transformer.replace(
        deleteRange,
        firstLineIndent,
        PositionDiff.exactPosition(new Position(deleteRange.start.line, firstLineIndent.length)),
      );

      if (vimState.document.languageId !== 'plaintext') {
        vimState.recordedState.transformer.vscodeCommand('editor.action.reindentselectedlines');
        vimState.recordedState.transformer.moveCursor(
          PositionDiff.endOfLine(),
          this.multicursorIndex,
        );
      }
    } else {
      vimState.recordedState.transformer.delete(deleteRange);
    }

    await vimState.setCurrentMode(Mode.Insert);
  }
}

@RegisterAction
class YankVisualBlockMode extends BaseOperator {
  public keys = ['y'];
  public modes = [Mode.VisualBlock];
  override createsUndoPoint = false;
  runsOnceForEveryCursor() {
    return false;
  }

  public async run(vimState: VimState, startPos: Position, endPos: Position): Promise<void> {
    const ranges: vscode.Range[] = [];
    const lines: string[] = [];
    for (const { line, start, end } of TextEditor.iterateLinesInBlock(vimState)) {
      lines.push(line);
      ranges.push(new vscode.Range(start, end));
    }

    vimState.currentRegisterMode = RegisterMode.BlockWise;

    this.highlightYankedRanges(vimState, ranges);

    const text = lines.join('\n')
    Register.put(vimState, text, this.multicursorIndex, true);
    // Put into kill ring
    vimState.historyTracker.yankToKillRing(text);

    vimState.historyTracker.addMark(vimState.document, startPos, '<');
    vimState.historyTracker.addMark(vimState.document, endPos, '>');

    const numLinesYanked = lines.length;
    reportLinesYanked(numLinesYanked, vimState);

    await vimState.setCurrentMode(Mode.Normal);
    vimState.cursorStopPosition = startPos;
  }
}

@RegisterAction
class CommentOperator extends BaseOperator {
  public keys = ['g', 'c'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    vimState.editor.selection = new vscode.Selection(start.getLineBegin(), end.getLineEnd());
    await vscode.commands.executeCommand('editor.action.commentLine');

    vimState.cursorStopPosition = new Position(start.line, 0);
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
export class ROT13Operator extends BaseOperator {
  public keys = ['g', '?'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    let selections: readonly vscode.Selection[];
    if (isVisualMode(vimState.currentMode)) {
      selections = vimState.editor.selections;
    } else if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      selections = [new vscode.Selection(start.getLineBegin(), end.getLineEnd())];
    } else {
      selections = [new vscode.Selection(start, end.getRight())];
    }

    for (const range of selections) {
      const original = vimState.document.getText(range);
      vimState.recordedState.transformer.replace(range, ROT13Operator.rot13(original));
    }
  }

  /**
   * https://en.wikipedia.org/wiki/ROT13
   */
  public static rot13(str: string) {
    return str
      .split('')
      .map((char: string) => {
        let charCode = char.charCodeAt(0);

        if (char >= 'a' && char <= 'z') {
          const a = 'a'.charCodeAt(0);
          charCode = ((charCode - a + 13) % 26) + a;
        }

        if (char >= 'A' && char <= 'Z') {
          const A = 'A'.charCodeAt(0);
          charCode = ((charCode - A + 13) % 26) + A;
        }

        return String.fromCharCode(charCode);
      })
      .join('');
  }
}

@RegisterAction
class CommentBlockOperator extends BaseOperator {
  public keys = ['g', 'C'];
  public modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    if (vimState.currentMode === Mode.Normal) {
      // If we're in normal mode, we need to construct a selection for the
      // command to operate on. If we're not, we've already got it.
      const endPosition = end.getRight();
      vimState.editor.selection = new vscode.Selection(start, endPosition);
    }
    await vscode.commands.executeCommand('editor.action.blockComment');

    vimState.cursorStopPosition = start;
    await vimState.setCurrentMode(Mode.Normal);
  }
}

interface CommentTypeSingle {
  singleLine: true;

  start: string;
}

interface CommentTypeMultiLine {
  singleLine: false;

  start: string;
  inner: string;
  final: string;
}

type CommentType = CommentTypeSingle | CommentTypeMultiLine;

@RegisterAction
class ActionVisualReflowParagraph extends BaseOperator {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['g', 'q'];

  public static CommentTypes: CommentType[] = [
    { singleLine: false, start: '/**', inner: '*', final: '*/' },
    { singleLine: false, start: '/*', inner: '*', final: '*/' },
    { singleLine: false, start: '{-', inner: '-', final: '-}' },
    { singleLine: true, start: '///' },
    { singleLine: true, start: '//!' },
    { singleLine: true, start: '//' },
    { singleLine: true, start: '--' },
    { singleLine: true, start: '#' },
    { singleLine: true, start: ';' },
    { singleLine: true, start: '*' },
    { singleLine: true, start: '%' },

    // Needs to come last, since everything starts with the empty string!
    { singleLine: true, start: '' },
  ];

  public getIndentation(s: string): string {
    // Use the indentation of the first non-whitespace line, if any such line is
    // selected.
    for (const line of s.split('\n')) {
      const result = line.match(/^\s+/g);
      const indent = result ? result[0] : '';

      if (indent !== line) {
        return indent;
      }
    }

    return '';
  }

  public reflowParagraph(s: string): string {
    const indent = this.getIndentation(s);

    let indentLevel = 0;
    for (const char of indent) {
      indentLevel += char === '\t' ? configuration.tabstop : 1;
    }
    const maximumLineLength = configuration.textwidth - indentLevel;

    // Chunk the lines by commenting style.

    interface Chunk {
      commentType: CommentType;
      content: string;
      indentLevelAfterComment: number;
      final: boolean;
    }
    const chunksToReflow: Chunk[] = [];

    for (const line of s.split('\n')) {
      let lastChunk: Chunk | undefined = chunksToReflow[chunksToReflow.length - 1];
      const trimmedLine = line.trimStart();

      // See what comment type they are using.

      let commentType: CommentType | undefined;

      for (const type of ActionVisualReflowParagraph.CommentTypes) {
        if (trimmedLine.startsWith(type.start)) {
          commentType = type;

          break;
        }

        // If they're currently in a multiline comment, see if they continued it.
        if (
          lastChunk &&
          !lastChunk.final &&
          type.start === lastChunk.commentType.start &&
          !type.singleLine
        ) {
          if (trimmedLine.startsWith(type.inner)) {
            commentType = type;

            break;
          }

          if (trimmedLine.endsWith(type.final)) {
            commentType = type;

            break;
          }
        }
      }

      if (!commentType) {
        break;
      } // will never happen, just to satisfy typechecker.

      // Did they start a new comment type?
      if (!lastChunk || lastChunk.final || commentType.start !== lastChunk.commentType.start) {
        const chunk = {
          commentType,
          content: `${trimmedLine.substr(commentType.start.length).trimStart()}`,
          indentLevelAfterComment: 0,
          final: false,
        };
        if (commentType.singleLine) {
          chunk.indentLevelAfterComment =
            trimmedLine.substr(commentType.start.length).length - chunk.content.length;
        } else if (chunk.content.endsWith(commentType.final)) {
          // Multiline comment started and ended on one line
          chunk.content = chunk.content
            .substr(0, chunk.content.length - commentType.final.length)
            .trim();
          chunk.final = true;
        }
        chunksToReflow.push(chunk);

        continue;
      }

      // Parse out commenting style, gather words.

      lastChunk = chunksToReflow[chunksToReflow.length - 1];

      if (lastChunk.commentType.singleLine) {
        // is it a continuation of a comment like "//"
        lastChunk.content += `\n${trimmedLine
          .substr(lastChunk.commentType.start.length)
          .trimStart()}`;
      } else if (!lastChunk.final) {
        // are we in the middle of a multiline comment like "/*"
        if (trimmedLine.endsWith(lastChunk.commentType.final)) {
          lastChunk.final = true;
          const prefix = trimmedLine.startsWith(lastChunk.commentType.inner)
            ? lastChunk.commentType.inner.length
            : 0;
          lastChunk.content += `\n${trimmedLine
            .substr(prefix, trimmedLine.length - lastChunk.commentType.final.length - prefix)
            .trim()}`;
        } else if (trimmedLine.startsWith(lastChunk.commentType.inner)) {
          lastChunk.content += `\n${trimmedLine
            .substr(lastChunk.commentType.inner.length)
            .trimStart()}`;
        } else if (trimmedLine.startsWith(lastChunk.commentType.start)) {
          lastChunk.content += `\n${trimmedLine
            .substr(lastChunk.commentType.start.length)
            .trimStart()}`;
        }
      }
    }

    // Reflow each chunk.
    const result: string[] = [];

    for (const { commentType, content, indentLevelAfterComment } of chunksToReflow) {
      const indentAfterComment = Array(indentLevelAfterComment + 1).join(' ');
      const commentLength = commentType.start.length + indentAfterComment.length;

      // Start with a single empty content line.
      const lines: string[] = [``];

      for (let line of content.split('\n')) {
        // Preserve blank lines in output.
        if (line.trim() === '') {
          // Replace empty content line with blank line.
          if (lines[lines.length - 1] === '') {
            lines.pop();
          }

          lines.push(line);

          // Add new empty content line for remaining content.
          lines.push(``);

          continue;
        }

        // Repeatedly partition line into pieces that fit in maximumLineLength
        while (line) {
          const lastLine = lines[lines.length - 1];

          // Determine the separator that we'd need to add to the last line
          // in order to join onto this line.
          let separator;
          if (!lastLine) {
            separator = '';
          } else if (
            configuration.joinspaces &&
            (lastLine.endsWith('.') || lastLine.endsWith('?') || lastLine.endsWith('!'))
          ) {
            separator = '  ';
          } else if (lastLine.endsWith(' ')) {
            if (
              configuration.joinspaces &&
              (lastLine.endsWith('. ') || lastLine.endsWith('? ') || lastLine.endsWith('! '))
            ) {
              separator = ' ';
            } else {
              separator = '';
            }
          } else {
            separator = ' ';
          }

          // Consider appending separator and part of line to last line
          const remaining = maximumLineLength - separator.length - lastLine.length - commentLength;
          const trimmedLine = line.trimStart();
          if (trimmedLine.length <= remaining) {
            // Entire line fits on last line
            lines[lines.length - 1] += `${separator}${trimmedLine}`;
            break;
          } else {
            // Find largest portion of line that fits on last line,
            // by searching backward for a whitespace character (space or tab).
            let breakpoint = Math.max(
              trimmedLine.lastIndexOf(' ', remaining),
              trimmedLine.lastIndexOf('\t', remaining),
            );
            if (breakpoint < 0) {
              // Next word is too long to fit on the current line.
              if (lastLine) {
                // Start a new line and try again next round.
                lines.push('');
                continue;
              } else {
                // Next word is too long to fit on a line by itself.
                // Break it at the next word boundary, if there is one.
                breakpoint = trimmedLine.search(/[ \t]/);
                if (breakpoint < 0) breakpoint = line.length;
              }
            }

            // Split the line into the part that fits on the last line
            // and the remainder.  Start a new line for the remainder.
            lines[lines.length - 1] += `${separator}${trimmedLine.slice(0, breakpoint).trimEnd()}`;
            line = line.slice(breakpoint + 1);
            lines.push('');
          }
        }
      }

      // Drop final empty content line.
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      for (let i = 0; i < lines.length; i++) {
        if (commentType.singleLine) {
          lines[i] = `${indent}${commentType.start}${indentAfterComment}${lines[i]}`;
        } else {
          if (i === 0) {
            if (lines[i] === '') {
              lines[i] = `${indent}${commentType.start}`;
            } else {
              lines[i] = `${indent}${commentType.start} ${lines[i]}`;
            }
            if (i === lines.length - 1) {
              lines[i] += ` ${commentType.final}`;
            }
          } else if (i === lines.length - 1) {
            if (lines[i] === '') {
              lines[i] = `${indent} ${commentType.final}`;
            } else {
              lines[i] = `${indent} ${commentType.inner} ${lines[i]} ${commentType.final}`;
            }
          } else {
            if (lines[i] === '') {
              lines[i] = `${indent} ${commentType.inner}`;
            } else {
              lines[i] = `${indent} ${commentType.inner} ${lines[i]}`;
            }
          }
        }
      }

      result.push(...lines);
    }

    return result.join('\n');
  }

  public async run(vimState: VimState, start: Position, end: Position): Promise<void> {
    [start, end] = sorted(start, end);

    start = start.getLineBegin();
    end = end.getLineEnd();

    let textToReflow = vimState.document.getText(new vscode.Range(start, end));
    textToReflow = this.reflowParagraph(textToReflow);

    vimState.recordedState.transformer.addTransformation({
      type: 'replaceText',
      text: textToReflow,
      range: new vscode.Range(start, end),
      // Move cursor to front of line to realign the view
      diff: PositionDiff.exactCharacter({ character: 0 }),
    });

    await vimState.setCurrentMode(Mode.Normal);
  }
}
