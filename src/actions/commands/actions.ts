import * as vscode from 'vscode';

import path from 'path';
import { doesFileExist } from 'platform/fs';
import { Position } from 'vscode';
import { WriteQuitCommand } from '../../cmd_line/commands/writequit';
import { Cursor } from '../../common/motion/cursor';
import { ErrorCode, VimError } from '../../error';
import { globalState } from '../../state/globalState';
import { RecordedState } from '../../state/recordedState';
import { VimState } from '../../state/vimState';
import { StatusBar } from '../../statusBar';
import { WordType } from '../../textobject/word';
import { Clipboard } from '../../util/clipboard';
import { SpecialKeys } from '../../util/specialKeys';
import { reportFileInfo, reportSearch } from '../../util/statusBarTextUtils';
import { getCursorsAfterSync } from '../../util/util';
import { SearchDirection } from '../../vimscript/pattern';
import { shouldWrapKey } from '../wrapping';
import { ExCommandLine, SearchCommandLine } from './../../cmd_line/commandLine';
import { FileCommand } from './../../cmd_line/commands/file';
import { QuitCommand } from './../../cmd_line/commands/quit';
import { TabCommand, TabCommandType } from './../../cmd_line/commands/tab';
import { PositionDiff, earlierOf, laterOf, sorted } from './../../common/motion/position';
import { NumericString } from './../../common/number/numericString';
import { configuration } from './../../configuration/configuration';
import {
  DotCommandStatus,
  Mode,
  isVisualMode,
  visualBlockGetBottomRightPosition,
  visualBlockGetTopLeftPosition,
} from './../../mode/mode';
import { Register, RegisterMode } from './../../register/register';
import { TextEditor } from './../../textEditor';
import { Transformation } from './../../transformations/transformations';
import { BaseCommand, RegisterAction } from './../base';
import * as operator from './../operator';

/**
 * A very special snowflake.
 *
 * Each keystroke when typing in Insert mode is its own Action, which means naively replaying a
 * realistic insertion (via `.` or a macro) does many small insertions, which is very slow.
 * So instead, we fold all those actions after the fact into a single DocumentContentChangeAction,
 * which compresses the changes, generally into a single document edit per cursor.
 */
export class DocumentContentChangeAction extends BaseCommand {
  modes = [];
  keys = [];
  private readonly cursorStart: Position;
  private cursorEnd: Position;

  constructor(cursorStart: Position) {
    super();
    this.cursorStart = cursorStart;
    this.cursorEnd = cursorStart;
  }

  private contentChanges: vscode.TextDocumentContentChangeEvent[] = [];

  public addChanges(changes: vscode.TextDocumentContentChangeEvent[], cursorPosition: Position) {
    this.contentChanges = [...this.contentChanges, ...changes];
    this.compressChanges();
    this.cursorEnd = cursorPosition;
  }

  public getTransformation(positionDiff: PositionDiff): Transformation {
    return {
      type: 'contentChange',
      changes: this.contentChanges,
      diff: positionDiff,
    };
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (this.contentChanges.length === 0) {
      return;
    }

    let originalLeftBoundary = this.cursorStart;

    let rightBoundary: Position = position;
    for (const change of this.contentChanges) {
      if (change.range.start.line < originalLeftBoundary.line) {
        // This change should be ignored
        const linesAffected = change.range.end.line - change.range.start.line + 1;
        const resultLines = change.text.split('\n').length;
        originalLeftBoundary = originalLeftBoundary.with(
          Math.max(0, originalLeftBoundary.line + resultLines - linesAffected),
        );
        continue;
      }

      // Translates diffPos from a position relative to originalLeftBoundary to one relative to position
      const translate = (diffPos: Position): Position => {
        const lineOffset = diffPos.line - originalLeftBoundary.line;
        const char =
          lineOffset === 0
            ? position.character + diffPos.character - originalLeftBoundary.character
            : diffPos.character;
        // TODO: Should we document.validate() this position?
        return new Position(Math.max(position.line + lineOffset, 0), Math.max(char, 0));
      };

      const replaceRange = new vscode.Range(
        translate(change.range.start),
        translate(change.range.end),
      );

      if (replaceRange.start.isAfter(rightBoundary)) {
        // This change should be ignored as it's out of boundary
        continue;
      }

      // Calculate new right boundary
      const textDiffLines = change.text.split('\n');
      const numLinesAdded = textDiffLines.length - 1;
      const newRightBoundary =
        numLinesAdded === 0
          ? new Position(replaceRange.start.line, replaceRange.start.character + change.text.length)
          : new Position(replaceRange.start.line + numLinesAdded, textDiffLines.pop()!.length);

      rightBoundary = laterOf(rightBoundary, newRightBoundary);

      if (replaceRange.start.isEqual(replaceRange.end)) {
        vimState.recordedState.transformer.insert(
          replaceRange.start,
          change.text,
          PositionDiff.exactPosition(translate(this.cursorEnd)),
        );
      } else {
        vimState.recordedState.transformer.replace(
          replaceRange,
          change.text,
          PositionDiff.exactPosition(translate(this.cursorEnd)),
        );
      }
    }
  }

  private compressChanges(): void {
    const merge = (
      first: vscode.TextDocumentContentChangeEvent,
      second: vscode.TextDocumentContentChangeEvent,
    ): vscode.TextDocumentContentChangeEvent | undefined => {
      if (first.rangeOffset + first.text.length === second.rangeOffset) {
        // Simple concatenation
        return {
          text: first.text + second.text,
          range: first.range,
          rangeOffset: first.rangeOffset,
          rangeLength: first.rangeLength,
        };
      } else if (
        first.rangeOffset <= second.rangeOffset &&
        first.text.length >= second.rangeLength
      ) {
        const start = second.rangeOffset - first.rangeOffset;
        const end = start + second.rangeLength;
        const text = first.text.slice(0, start) + second.text + first.text.slice(end);
        // `second` replaces part of `first`
        // Most often, this is the result of confirming an auto-completion
        return {
          text,
          range: first.range,
          rangeOffset: first.rangeOffset,
          rangeLength: first.rangeLength,
        };
      } else {
        // TODO: Do any of the cases falling into this `else` matter?
        // TODO: YES - make an insertion and then autocomplete to something totally different (replace subsumes insert)
        return undefined;
      }
    };

    const compressed: vscode.TextDocumentContentChangeEvent[] = [];
    let prev: vscode.TextDocumentContentChangeEvent | undefined;
    for (const change of this.contentChanges) {
      if (prev === undefined) {
        prev = change;
      } else {
        const merged = merge(prev, change);
        if (merged) {
          prev = merged;
        } else {
          compressed.push(prev);
          prev = change;
        }
      }
    }
    if (prev !== undefined) {
      compressed.push(prev);
    }
    this.contentChanges = compressed;
  }
}

@RegisterAction
class DisableExtension extends BaseCommand {
  modes = [
    Mode.Normal,
    Mode.Insert,
    Mode.Visual,
    Mode.VisualBlock,
    Mode.VisualLine,
    Mode.SearchInProgressMode,
    Mode.CommandlineInProgress,
    Mode.Replace,
    Mode.EasyMotionMode,
    Mode.EasyMotionInputMode,
    Mode.SurroundInputMode,
  ];
  keys = [SpecialKeys.ExtensionDisable];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Disabled);
  }
}

@RegisterAction
class EnableExtension extends BaseCommand {
  modes = [Mode.Disabled];
  keys = [SpecialKeys.ExtensionEnable];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
export class CommandNumber extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['<number>'];
  override name = 'cmd_num';
  override isCompleteAction = false;
  override actionType = 'number' as const;
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const num = parseInt(this.keysPressed[0], 10);
    const operatorCount = vimState.recordedState.operatorCount;

    if (operatorCount > 0) {
      const lastAction =
        vimState.recordedState.actionsRun[vimState.recordedState.actionsRun.length - 2];
      if (!(lastAction instanceof CommandNumber)) {
        // We have set an operatorCount !== 0 after an operator, but now we got another count
        // number so we need to multiply them.
        vimState.recordedState.count = operatorCount * num;
      } else {
        // We are now getting another digit which means we need to multiply by 10 and add
        // the new digit multiplied by operatorCount.
        //
        // Example: user presses '2d31w':
        // - After '2' the number 2 is stored in 'count'
        // - After 'd' the count (2) is stored in 'operatorCount'
        // - After '3' the number 3 multiplied by 'operatorCount' (3 x 2 = 6) is stored in 'count'
        // - After '1' the count is multiplied by 10 and added by number 1 multiplied by 'operatorCount'
        //   (6 * 10 + 1 * 2 = 62)
        // The final result will be the deletion of 62 words.
        vimState.recordedState.count = vimState.recordedState.count * 10 + num * operatorCount;
      }
    } else {
      vimState.recordedState.count = vimState.recordedState.count * 10 + num;
    }
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    const isZero = keysPressed[0] === '0';

    return (
      super.doesActionApply(vimState, keysPressed) &&
      ((isZero && vimState.recordedState.count > 0) || !isZero)
    );
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    const isZero = keysPressed[0] === '0';

    return (
      super.couldActionApply(vimState, keysPressed) &&
      ((isZero && vimState.recordedState.count > 0) || !isZero)
    );
  }
}

@RegisterAction
export class CommandRegister extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['"', '<register>'];
  override name = 'cmd_register';
  override isCompleteAction = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const register = this.keysPressed[1];

    if (Register.isValidRegister(register)) {
      vimState.recordedState.registerName = register;
    } else {
      // TODO: Changing isCompleteAction here is maybe a bit janky - should it be a function?
      this.isCompleteAction = true;
    }
  }
}

@RegisterAction
class CommandRecordMacro extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = [
    ['q', '<macro>'],
    ['q', '"'],
  ];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const registerKey = this.keysPressed[1];
    const register = registerKey.toLocaleLowerCase();
    vimState.macro = new RecordedState();
    vimState.macro.registerKey = registerKey;
    vimState.macro.registerName = register;

    if (!Register.isValidUppercaseRegister(registerKey) || !Register.has(register)) {
      // TODO: this seems suspect - why are we not putting `vimState.macro` in the register? Why are we setting `registerName`?
      const newRegister = new RecordedState();
      newRegister.registerName = register;

      vimState.recordedState.registerName = register;
      Register.put(vimState, newRegister);
    }
  }
}

@RegisterAction
export class CommandQuitRecordMacro extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['q'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const macro = vimState.macro;
    if (macro === undefined) {
      return;
    }

    const existingMacro = (await Register.get(macro.registerName))?.text;
    if (existingMacro instanceof RecordedState) {
      if (Register.isValidUppercaseRegister(macro.registerKey)) {
        existingMacro.actionsRun = existingMacro.actionsRun.concat(macro.actionsRun);
      } else {
        existingMacro.actionsRun = macro.actionsRun;
      }
    }

    vimState.macro = undefined;
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.doesActionApply(vimState, keysPressed) && vimState.macro !== undefined;
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.couldActionApply(vimState, keysPressed) && vimState.macro !== undefined;
  }
}

@RegisterAction
class CommandExecuteLastMacro extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['@', '@'];
  override runsOnceForEachCountPrefix = true;
  override createsUndoPoint = true;
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const { lastInvokedMacro } = globalState;

    if (lastInvokedMacro) {
      vimState.recordedState.transformer.addTransformation({
        type: 'macro',
        register: lastInvokedMacro.registerName,
        replay: 'contentChange',
      });
    } else {
      StatusBar.displayError(vimState, VimError.fromCode(ErrorCode.NoPreviouslyUsedRegister));
    }
  }
}

@RegisterAction
class CommandExecuteMacro extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['@', '<register>'];
  override runsOnceForEachCountPrefix = true;
  override createsUndoPoint = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const register = this.keysPressed[1].toLocaleLowerCase();

    const isFilenameRegister = register === '%' || register === '#';
    if (!Register.isValidRegister(register) || isFilenameRegister) {
      StatusBar.displayError(
        vimState,
        VimError.fromCode(ErrorCode.InvalidRegisterName, `'${register}'`),
      );
    }

    if (Register.has(register)) {
      vimState.recordedState.transformer.addTransformation({
        type: 'macro',
        register,
        replay: 'contentChange',
      });
    }
  }
}

@RegisterAction
class CommandEsc extends BaseCommand {
  modes = [
    Mode.Visual,
    Mode.VisualLine,
    Mode.VisualBlock,
    Mode.Normal,
    Mode.SurroundInputMode,
    Mode.EasyMotionMode,
    Mode.EasyMotionInputMode,
  ];
  keys = [['<Esc>'], ['<C-c>'], ['<C-[>']];

  override runsOnceForEveryCursor() {
    return false;
  }

  override preservesDesiredColumn = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal) {
      vimState.surround = undefined;

      if (vimState.isMultiCursor) {
        vimState.cursors = [vimState.cursors[0]];
      } else {
        // If there's nothing to do on the vim side, we might as well call some
        // of vscode's default "close notification" actions. I think we should
        // just add to this list as needed.
        await Promise.allSettled([
          vscode.commands.executeCommand('closeReferenceSearchEditor'),
          vscode.commands.executeCommand('closeMarkersNavigation'),
          vscode.commands.executeCommand('closeDirtyDiff'),
        ]);
      }
    } else {
      if (vimState.currentMode === Mode.EasyMotionMode) {
        vimState.easyMotion.clearDecorations(vimState.editor);
      } else if (vimState.currentMode === Mode.SurroundInputMode) {
        vimState.surround = undefined;
      }

      await vimState.setCurrentMode(Mode.Normal);
    }
  }
}

@RegisterAction
export class CommandInsertAtCursor extends BaseCommand {
  modes = [Mode.Normal];
  keys = [['i'], ['<Insert>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Only allow this command to be prefixed with a count or nothing, no other
    // actions or operators before
    let previousActionsNumbers = true;
    for (const prevAction of vimState.recordedState.actionsRun) {
      if (!(prevAction instanceof CommandNumber)) {
        previousActionsNumbers = false;
        break;
      }
    }

    if (vimState.recordedState.actionsRun.length === 0 || previousActionsNumbers) {
      return super.couldActionApply(vimState, keysPressed);
    }
    return false;
  }
}

@RegisterAction
export class CommandReplaceAtCursorFromNormalMode extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['R'];

  public override runsOnceForEveryCursor(): boolean {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Replace);
  }
}

/**
 * Our Vim implementation selects up to but not including the final character
 * of a visual selection, instead opting to render a block cursor on the final
 * character. This works for everything except VSCode's native copy command,
 * which loses the final character because it's not selected. We override that
 * copy command here by default to include the final character.
 */
@RegisterAction
class CommandOverrideCopy extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock, Mode.Insert, Mode.Normal];
  keys = ['<copy>']; // A special key - see ModeHandler

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    let text = '';

    if (vimState.currentMode === Mode.Visual) {
      text = vimState.cursors
        .map((range) => {
          const [start, stop] = sorted(range.start, range.stop);
          return vimState.document.getText(new vscode.Range(start, stop.getRight()));
        })
        .join('\n');
    } else if (vimState.currentMode === Mode.VisualLine) {
      text = vimState.cursors
        .map((range) => {
          return vimState.document.getText(
            new vscode.Range(
              earlierOf(range.start.getLineBegin(), range.stop.getLineBegin()),
              laterOf(range.start.getLineEnd(), range.stop.getLineEnd()),
            ),
          );
        })
        .join('\n');
    } else if (vimState.currentMode === Mode.VisualBlock) {
      for (const { line } of TextEditor.iterateLinesInBlock(vimState)) {
        text += line + '\n';
      }
    } else if (vimState.currentMode === Mode.Insert || vimState.currentMode === Mode.Normal) {
      text = vimState.editor.selections
        .map((selection) => {
          return vimState.document.getText(new vscode.Range(selection.start, selection.end));
        })
        .join('\n');
    }

    const editorSelection = vimState.editor.selection;
    const hasSelectedText = !editorSelection.active.isEqual(editorSelection.anchor);

    if (hasSelectedText) {
      await Clipboard.Copy(text);
    }

    // all vim yank operations return to normal mode.
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class CommandCmdA extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['<D-a>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.cursorStartPosition = new Position(0, vimState.desiredColumn);
    vimState.cursorStopPosition = new Position(
      vimState.document.lineCount - 1,
      vimState.desiredColumn,
    );
    await vimState.setCurrentMode(Mode.VisualLine);
  }
}

@RegisterAction
class MarkCommand extends BaseCommand {
  keys = ['m', '<register>'];
  modes = [Mode.Normal];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const markName = this.keysPressed[1];

    vimState.historyTracker.addMark(vimState.document, position, markName);
  }
}

@RegisterAction
class CommandShowCommandLine extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = [':'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    let commandLineText: string;
    if (vimState.currentMode === Mode.Normal) {
      if (vimState.recordedState.count) {
        commandLineText = `.,.+${vimState.recordedState.count - 1}`;
      } else {
        commandLineText = '';
      }
    } else {
      commandLineText = "'<,'>";
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
export class CommandShowCommandHistory extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['q', ':'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const cmd = await vscode.window.showQuickPick(ExCommandLine.history.get().slice().reverse(), {
      placeHolder: 'Vim command history',
      ignoreFocusOut: false,
    });
    if (cmd && cmd.length !== 0) {
      await new ExCommandLine(cmd, vimState.currentMode).run(vimState);
    }

    await vimState.setCurrentMode(Mode.Normal);
  }
}

ExCommandLine.onSearch = async (vimState: VimState) => {
  void new CommandShowCommandHistory().exec(vimState.cursorStopPosition, vimState);
};

@RegisterAction
export class CommandShowSearchHistory extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = [
    ['q', '/'],
    ['q', '?'],
  ];

  private direction = SearchDirection.Forward;

  override runsOnceForEveryCursor() {
    return false;
  }

  public constructor(direction = SearchDirection.Forward) {
    super();
    this.direction = direction;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (this.keysPressed.includes('?')) {
      this.direction = SearchDirection.Backward;
    }

    const searchState = await SearchCommandLine.showSearchHistory();
    if (searchState) {
      globalState.searchState = searchState;
      globalState.hl = true;

      const nextMatch = searchState.getNextSearchMatchPosition(
        vimState,
        vimState.cursorStartPosition,
        this.direction,
      );

      if (!nextMatch) {
        throw VimError.fromCode(
          this.direction > 0 ? ErrorCode.SearchHitBottom : ErrorCode.SearchHitTop,
          searchState.searchString,
        );
      }

      vimState.cursorStopPosition = nextMatch.pos;
      reportSearch(nextMatch.index, searchState.getMatchRanges(vimState).length, vimState);
    }

    await vimState.setCurrentMode(Mode.Normal);
  }
}

// Register the command to execute on CtrlF.
SearchCommandLine.onSearch = async (vimState: VimState, direction: SearchDirection) => {
  return new CommandShowSearchHistory(direction).exec(vimState.cursorStopPosition, vimState);
};

@RegisterAction
class CommandDot extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['.'];
  override createsUndoPoint = true;

  public override async execCount(position: Position, vimState: VimState): Promise<void> {
    if (globalState.previousFullAction) {
      const count = vimState.recordedState.count || 1;

      vimState.recordedState.transformer.addTransformation({
        type: 'replayRecordedState',
        count,
        recordedState: globalState.previousFullAction,
      });
    }
  }
}

@RegisterAction
class CommandRepeatSubstitution extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['&'];
  override createsUndoPoint = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    // Parsing the command from a string, while not ideal, is currently
    // necessary to make this work with and without neovim integration
    await ExCommandLine.parser.tryParse('s').command.execute(vimState);
  }
}

@RegisterAction
class CommandGoToOtherEndOfHighlightedText extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['o'];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    [vimState.cursorStartPosition, vimState.cursorStopPosition] = [
      vimState.cursorStopPosition,
      vimState.cursorStartPosition,
    ];
  }
}

@RegisterAction
class CommandGoToOtherSideOfHighlightedText extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['O'];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.VisualBlock) {
      [vimState.cursorStartPosition, vimState.cursorStopPosition] = [
        new vscode.Position(
          vimState.cursorStartPosition.line,
          vimState.cursorStopPosition.character,
        ),
        new vscode.Position(
          vimState.cursorStopPosition.line,
          vimState.cursorStartPosition.character,
        ),
      ];
    } else {
      return new CommandGoToOtherEndOfHighlightedText().exec(position, vimState);
    }
  }
}

@RegisterAction
export class CommandUndo extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['u'];
  // we support a count to undo by this setting
  override runsOnceForEachCountPrefix = true;
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const newPosition = await vimState.historyTracker.goBackHistoryStep();

    if (newPosition === undefined) {
      StatusBar.setText(vimState, 'Already at oldest change');
    } else {
      vimState.cursors = [new Cursor(newPosition, newPosition)];
    }
  }
}

@RegisterAction
class CommandUndoOnLine extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['U'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const newPosition = await vimState.historyTracker.goBackHistoryStepsOnLine();

    if (newPosition !== undefined) {
      vimState.cursors = [new Cursor(newPosition, newPosition)];
    }
  }
}

@RegisterAction
export class CommandRedo extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['<C-r>'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const newPosition = await vimState.historyTracker.goForwardHistoryStep();

    if (newPosition === undefined) {
      StatusBar.setText(vimState, 'Already at newest change');
    } else {
      vimState.cursors = [new Cursor(newPosition, newPosition)];
    }
  }
}

@RegisterAction
class CommandDeleteToLineEnd extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['D'];
  override createsUndoPoint = true;
  override runsOnceForEveryCursor() {
    return true;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (position.isLineEnd()) {
      return;
    }

    const linesDown = (vimState.recordedState.count || 1) - 1;
    const start = position;
    const end = position.getDown(linesDown).getLineEnd().getLeftThroughLineBreaks();

    await new operator.DeleteOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
export class CommandYankFullLine extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['Y'];
  override name = 'yank_full_line';

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const linesDown = (vimState.recordedState.count || 1) - 1;
    const start = position.getLineBegin();
    const end = position.getDown(linesDown).getLeft();

    vimState.currentRegisterMode = RegisterMode.LineWise;

    await new operator.YankOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
class CommandChangeToLineEnd extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['C'];
  override runsOnceForEachCountPrefix = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const count = vimState.recordedState.count || 1;

    await new operator.ChangeOperator(this.multicursorIndex).run(
      vimState,
      position,
      position
        .getDown(Math.max(0, count - 1))
        .getLineEnd()
        .getLeft(),
    );
  }
}

@RegisterAction
class CommandClearLine extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['S'];
  override runsOnceForEachCountPrefix = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await new operator.ChangeOperator(this.multicursorIndex).runRepeat(
      vimState,
      position,
      vimState.recordedState.count || 1,
    );
  }

  // Don't clash with sneak
  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.doesActionApply(vimState, keysPressed) && !configuration.sneak;
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.couldActionApply(vimState, keysPressed) && !configuration.sneak;
  }
}

@RegisterAction
class CommandExitVisualMode extends BaseCommand {
  modes = [Mode.Visual];
  keys = ['v'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class CommandVisualMode extends BaseCommand {
  modes = [Mode.Normal, Mode.VisualLine, Mode.VisualBlock];
  keys = ['v'];
  override isCompleteAction = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal && vimState.recordedState.count > 1) {
      vimState.cursorStopPosition = position.getRight(vimState.recordedState.count - 1);
    }
    await vimState.setCurrentMode(Mode.Visual);
  }
}

@RegisterAction
class RestoreVisualSelection extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'v'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.lastVisualSelection === undefined) {
      return;
    }

    let { start, end, mode } = vimState.lastVisualSelection;
    if (mode !== Mode.Visual || !start.isEqual(end)) {
      if (end.line <= vimState.document.lineCount - 1) {
        if (mode === Mode.Visual && start.isBefore(end)) {
          end = end.getLeftThroughLineBreaks(true);
        }

        await vimState.setCurrentMode(mode);
        vimState.cursorStartPosition = start;
        vimState.cursorStopPosition = end;
      }
    }
  }
}

@RegisterAction
class CommandVisualBlockMode extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = [['<C-v>'], ['<C-q>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal && vimState.recordedState.count > 1) {
      vimState.cursorStopPosition = position.getRight(vimState.recordedState.count - 1);
    }
    await vimState.setCurrentMode(Mode.VisualBlock);
  }
}

@RegisterAction
class CommandExitVisualBlockMode extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = [['<C-v>'], ['<C-q>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class CommandVisualLineMode extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock];
  keys = ['V'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal && vimState.recordedState.count > 1) {
      vimState.cursorStopPosition = position.getDown(vimState.recordedState.count - 1);
    }
    await vimState.setCurrentMode(Mode.VisualLine);
  }
}

@RegisterAction
class CommandExitVisualLineMode extends BaseCommand {
  modes = [Mode.VisualLine];
  keys = ['V'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class CommandOpenFile extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual];
  keys = ['g', 'f'];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    let fullFilePath: string;
    if (vimState.currentMode === Mode.Visual) {
      fullFilePath = vimState.document.getText(vimState.editor.selection);
    } else {
      const range = new vscode.Range(
        position.prevWordStart(vimState.document, { wordType: WordType.FileName, inclusive: true }),
        position.nextWordStart(vimState.document, { wordType: WordType.FileName }),
      );

      fullFilePath = vimState.document.getText(range).trim();
    }

    const fileInfo = fullFilePath.match(/(.*?(?=:[0-9]+)|.*):?([0-9]*)$/);
    if (fileInfo) {
      const workspaceRootPath = vscode.workspace.getWorkspaceFolder(vimState.document.uri)?.uri
        .fsPath;
      const filePath =
        configuration.openFilePosition === 'relative' ||
        path.isAbsolute(fileInfo[1]) ||
        !workspaceRootPath
          ? fileInfo[1]
          : path.join(workspaceRootPath, fileInfo[1]);
      const line = parseInt(fileInfo[2], 10);
      const fileCommand = new FileCommand({
        name: 'edit',
        bang: false,
        opt: [],
        file: filePath,
        cmd: isNaN(line) ? undefined : { type: 'line_number', line: line - 1 },
        createFileIfNotExists: false,
      });
      void fileCommand.execute(vimState);
    }
  }
}

@RegisterAction
class GoToDeclaration extends BaseCommand {
  modes = [Mode.Normal];
  keys = [
    ['g', 'd'],
    ['g', 'D'],
  ];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('editor.action.goToDeclaration');

    if (vimState.editor === vscode.window.activeTextEditor) {
      // We didn't switch to a different editor
      vimState.cursorStartPosition = vimState.editor.selection.start;
      vimState.cursorStopPosition = vimState.editor.selection.end;
    }
  }
}

@RegisterAction
class GoToDefinition extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['<C-]>'];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('editor.action.revealDefinition');

    if (vimState.editor === vscode.window.activeTextEditor) {
      // We didn't switch to a different editor
      vimState.cursorStopPosition = vimState.editor.selection.start;
    }
  }
}

@RegisterAction
class CommandOpenLink extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['g', 'x'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    void vscode.commands.executeCommand('editor.action.openLink');
  }
}

@RegisterAction
class CommandGoBackInChangelist extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', ';'];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const prevPos = vimState.historyTracker.prevChangeInChangeList();

    if (prevPos instanceof VimError) {
      StatusBar.displayError(vimState, prevPos);
    } else {
      vimState.cursorStopPosition = prevPos;
    }
  }
}

@RegisterAction
class CommandGoForwardInChangelist extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', ','];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const nextPos = vimState.historyTracker.nextChangeInChangeList();

    if (nextPos instanceof VimError) {
      StatusBar.displayError(vimState, nextPos);
    } else {
      vimState.cursorStopPosition = nextPos;
    }
  }
}

@RegisterAction
export class CommandInsertAtLastChange extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'i'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.cursorStopPosition = vimState.cursorStartPosition =
      vimState.historyTracker.getLastChangeEndPosition() ?? new Position(0, 0);

    await vimState.setCurrentMode(Mode.Insert);
  }
}

@RegisterAction
export class CommandInsertAtFirstCharacter extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['I'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    vimState.cursorStopPosition = vimState.cursorStartPosition =
      TextEditor.getFirstNonWhitespaceCharOnLine(vimState.document, position.line);
  }
}

@RegisterAction
export class CommandInsertAtLineBegin extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'I'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    vimState.cursorStopPosition = vimState.cursorStartPosition = position.getLineBegin();
  }
}

@RegisterAction
export class CommandInsertAfterCursor extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['a'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    vimState.cursorStopPosition = vimState.cursorStartPosition = position.getRight();
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Only allow this command to be prefixed with a count or nothing, no other actions or operators before
    if (!vimState.recordedState.actionsRun.every((action) => action instanceof CommandNumber)) {
      return false;
    }

    return super.couldActionApply(vimState, keysPressed);
  }
}

@RegisterAction
export class CommandInsertAtLineEnd extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['A'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    vimState.cursorStopPosition = vimState.cursorStartPosition = position.getLineEnd();
  }
}

@RegisterAction
export class CommandInsertNewLineAbove extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['O'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async execCount(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    const count = vimState.recordedState.count || 1;

    const charPos = position.getLineBeginRespectingIndent(vimState.document).character;

    for (let i = 0; i < count; i++) {
      await vscode.commands.executeCommand('editor.action.insertLineBefore');
    }

    vimState.cursors = getCursorsAfterSync(vimState.editor);
    const endPos = vimState.cursors[0].start.character;
    const indentAmt = charPos - endPos;

    for (let i = 0; i < count; i++) {
      const newPos = new Position(vimState.cursors[0].start.line + i, charPos);
      if (i === 0) {
        vimState.cursors[0] = new Cursor(newPos, newPos);
      } else {
        vimState.cursors.push(new Cursor(newPos, newPos));
      }
      if (indentAmt >= 0) {
        vimState.recordedState.transformer.addTransformation({
          type: 'insertText',
          // TODO: Use `editor.options.insertSpaces`, I think
          text: TextEditor.setIndentationLevel('', indentAmt, configuration.expandtab),
          position: newPos,
          cursorIndex: i,
          manuallySetCursorPositions: true,
        });
      } else {
        vimState.recordedState.transformer.addTransformation({
          type: 'deleteRange',
          cursorIndex: i,
          range: new vscode.Range(newPos, new Position(newPos.line, endPos)),
          manuallySetCursorPositions: true,
        });
      }
    }
    vimState.cursors = vimState.cursors.reverse();
    vimState.isFakeMultiCursor = true;
  }
}

@RegisterAction
export class CommandInsertNewLineBefore extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['o'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async execCount(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    const count = vimState.recordedState.count || 1;

    for (let i = 0; i < count; i++) {
      await vscode.commands.executeCommand('editor.action.insertLineAfter');
    }
    vimState.cursors = getCursorsAfterSync(vimState.editor);
    for (let i = 1; i < count; i++) {
      const newPos = new Position(
        vimState.cursorStartPosition.line - i,
        vimState.cursorStartPosition.character,
      );
      vimState.cursors.push(new Cursor(newPos, newPos));

      // Ahhhhhh. We have to manually set cursor position here as we need text
      // transformations AND to set multiple cursors.
      vimState.recordedState.transformer.addTransformation({
        type: 'insertText',
        // TODO: Use `editor.options.insertSpaces`, I think
        text: TextEditor.setIndentationLevel('', newPos.character, configuration.expandtab),
        position: newPos,
        cursorIndex: i,
        manuallySetCursorPositions: true,
      });
    }
    vimState.cursors = vimState.cursors.reverse();
    vimState.isFakeMultiCursor = true;
  }
}

@RegisterAction
class CommandNavigateBack extends BaseCommand {
  modes = [Mode.Normal];
  keys = [['<C-o>'], ['<C-t>']];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await globalState.jumpTracker.jumpBack(position, vimState);
  }
}

@RegisterAction
class CommandNavigateForward extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['<C-i>'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await globalState.jumpTracker.jumpForward(position, vimState);
  }
}

@RegisterAction
class CommandTabNext extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = [['g', 't'], ['<C-pagedown>']];
  override runsOnceForEachCountPrefix = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    // gt behaves differently than gT and goes to an absolute index tab
    // (1-based), it does NOT iterate over next tabs
    if (vimState.recordedState.count > 0) {
      void new TabCommand({
        type: TabCommandType.Edit,
        buf: vimState.recordedState.count,
      }).execute(vimState);
    } else {
      void new TabCommand({
        type: TabCommandType.Next,
        bang: false,
      }).execute(vimState);
    }
  }
}

@RegisterAction
class CommandTabPrevious extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = [['g', 'T'], ['<C-pageup>']];
  override runsOnceForEachCountPrefix = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    void new TabCommand({
      type: TabCommandType.Previous,
      bang: false,
    }).execute(vimState);
  }
}

@RegisterAction
export class ActionDeleteChar extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['x'];
  override name = 'delete_char';
  override createsUndoPoint = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    // If line is empty, do nothing
    if (vimState.document.lineAt(position).text.length === 0) {
      return;
    }

    const timesToRepeat = vimState.recordedState.count || 1;

    await new operator.DeleteOperator(this.multicursorIndex).run(
      vimState,
      position,
      position.getRight(timesToRepeat - 1).getLeftIfEOL(),
    );

    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
export class ActionDeleteCharWithDeleteKey extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['<Del>'];
  override name = 'delete_char_with_del';
  override runsOnceForEachCountPrefix = true;
  override createsUndoPoint = true;

  public override async execCount(position: Position, vimState: VimState): Promise<void> {
    // If <del> has a count in front of it, then <del> deletes a character
    // off the count. Therefore, 100<del>x, would apply 'x' 10 times.
    // http://vimdoc.sourceforge.net/htmldoc/change.html#<Del>
    if (vimState.recordedState.count !== 0) {
      vimState.recordedState.count = Math.floor(vimState.recordedState.count / 10);

      // Change actionsRunPressedKeys so that showCmd updates correctly
      vimState.recordedState.actionsRunPressedKeys =
        vimState.recordedState.count > 0 ? vimState.recordedState.count.toString().split('') : [];
      this.isCompleteAction = false;
    } else {
      await new ActionDeleteChar().execCount(position, vimState);
    }
  }
}

@RegisterAction
export class ActionDeleteLastChar extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['X'];
  override name = 'delete_last_char';
  override createsUndoPoint = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (position.character === 0) {
      return;
    }

    const timesToRepeat = vimState.recordedState.count || 1;

    await new operator.DeleteOperator(this.multicursorIndex).run(
      vimState,
      position.getLeft(timesToRepeat),
      position.getLeft(),
    );
  }
}

@RegisterAction
export class ActionReplaceCharacter extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['r', '<character>'];
  override createsUndoPoint = true;
  override runsOnceForEachCountPrefix = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const timesToRepeat = vimState.recordedState.count || 1;
    const toReplace = this.keysPressed[1];

    /**
     * <character> includes <BS>, <S-BS> and <TAB> but not any control keys,
     * so we ignore the former two keys and have a special handle for <tab>.
     */

    if (['<BS>', '<S-BS>'].includes(toReplace.toUpperCase())) {
      return;
    }

    if (position.character + timesToRepeat > position.getLineEnd().character) {
      return;
    }

    let endPos = new Position(position.line, position.character + timesToRepeat);

    // Return if tried to repeat longer than linelength
    if (endPos.character > vimState.document.lineAt(endPos).text.length) {
      return;
    }

    // If last char (not EOL char), add 1 so that replace selection is complete
    if (endPos.character > vimState.document.lineAt(endPos).text.length) {
      endPos = new Position(endPos.line, endPos.character + 1);
    }

    if (toReplace === '<tab>') {
      vimState.recordedState.transformer.delete(new vscode.Range(position, endPos));
      vimState.recordedState.transformer.vscodeCommand('tab');
      vimState.recordedState.transformer.moveCursor(
        PositionDiff.offset({ character: -1 }),
        this.multicursorIndex,
      );
    } else if (toReplace === '\n') {
      // A newline replacement always inserts exactly one newline (regardless
      // of count prefix) and puts the cursor on the next line.
      // We use `insertTextVSCode` so we get the right indentation
      vimState.recordedState.transformer.delete(new vscode.Range(position, endPos));
      vimState.recordedState.transformer.addTransformation({
        type: 'insertTextVSCode',
        text: '\n',
      });
    } else {
      vimState.recordedState.transformer.addTransformation({
        type: 'replaceText',
        text: toReplace.repeat(timesToRepeat),
        range: new vscode.Range(position, endPos),
        diff: PositionDiff.offset({ character: timesToRepeat - 1 }),
        manuallySetCursorPositions:
          vimState.dotCommandStatus === DotCommandStatus.Executing ? true : undefined,
      });
    }
  }
}

@RegisterAction
class ActionReplaceCharacterVisual extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = ['r', '<character>'];
  override runsOnceForEveryCursor() {
    return false;
  }
  override createsUndoPoint = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    let toInsert = this.keysPressed[1];

    if (toInsert === '<tab>') {
      toInsert = TextEditor.getTabCharacter(vimState.editor);
    }

    let visualSelectionOffset = 1;

    // If selection is reversed, reorganize it so that the text replace logic always works
    let [start, end] = sorted(vimState.cursorStartPosition, vimState.cursorStopPosition);
    if (vimState.currentMode === Mode.VisualLine) {
      [start, end] = [start.getLineBegin(), end.getLineEnd()];
    }

    // Limit to not replace EOL
    const textLength = vimState.document.lineAt(end).text.length;
    if (textLength <= 0) {
      visualSelectionOffset = 0;
    }
    end = new Position(end.line, Math.min(end.character, textLength > 0 ? textLength - 1 : 0));

    // Iterate over every line in the current selection
    for (let lineNum = start.line; lineNum <= end.line; lineNum++) {
      // Get line of text
      const lineText = vimState.document.lineAt(lineNum).text;

      if (start.line === end.line) {
        // This is a visual section all on one line, only replace the part within the selection
        vimState.recordedState.transformer.addTransformation({
          type: 'replaceText',
          text: Array(end.character - start.character + 2).join(toInsert),
          range: new vscode.Range(start, new Position(end.line, end.character + 1)),
          manuallySetCursorPositions: true,
        });
      } else if (lineNum === start.line) {
        // This is the first line of the selection so only replace after the cursor
        vimState.recordedState.transformer.addTransformation({
          type: 'replaceText',
          text: Array(lineText.length - start.character + 1).join(toInsert),
          range: new vscode.Range(start, new Position(start.line, lineText.length)),
          manuallySetCursorPositions: true,
        });
      } else if (lineNum === end.line) {
        // This is the last line of the selection so only replace before the cursor
        vimState.recordedState.transformer.addTransformation({
          type: 'replaceText',
          text: Array(end.character + 1 + visualSelectionOffset).join(toInsert),
          range: new vscode.Range(
            new Position(end.line, 0),
            new Position(end.line, end.character + visualSelectionOffset),
          ),
          manuallySetCursorPositions: true,
        });
      } else {
        // Replace the entire line length since it is in the middle of the selection
        vimState.recordedState.transformer.addTransformation({
          type: 'replaceText',
          text: Array(lineText.length + 1).join(toInsert),
          range: new vscode.Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
          manuallySetCursorPositions: true,
        });
      }
    }

    vimState.cursorStopPosition = start;
    vimState.cursorStartPosition = start;
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class ActionReplaceCharacterVisualBlock extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = ['r', '<character>'];
  override runsOnceForEveryCursor() {
    return false;
  }
  override createsUndoPoint = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    let toInsert = this.keysPressed[1];

    if (toInsert === '<tab>') {
      toInsert = TextEditor.getTabCharacter(vimState.editor);
    }

    for (const { start, end } of TextEditor.iterateLinesInBlock(vimState)) {
      if (end.isBeforeOrEqual(start)) {
        continue;
      }

      vimState.recordedState.transformer.addTransformation({
        type: 'replaceText',
        text: Array(end.character - start.character + 1).join(toInsert),
        range: new vscode.Range(start, end),
        manuallySetCursorPositions: true,
      });
    }

    const topLeft = visualBlockGetTopLeftPosition(
      vimState.cursorStopPosition,
      vimState.cursorStartPosition,
    );
    vimState.cursors = [new Cursor(topLeft, topLeft)];
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class ActionDeleteVisualBlock extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = [['d'], ['x'], ['X']];
  override createsUndoPoint = true;
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const lines: string[] = [];

    for (const { line, start, end } of TextEditor.iterateLinesInBlock(vimState)) {
      lines.push(line);
      vimState.recordedState.transformer.addTransformation({
        type: 'deleteRange',
        range: new vscode.Range(start, end),
        manuallySetCursorPositions: true,
      });
    }

    const text = lines.length === 1 ? lines[0] : lines.join('\n');
    vimState.currentRegisterMode = RegisterMode.BlockWise;
    Register.put(vimState, text, this.multicursorIndex, true);

    const topLeft = visualBlockGetTopLeftPosition(
      vimState.cursorStopPosition,
      vimState.cursorStartPosition,
    );

    vimState.cursors = [new Cursor(topLeft, topLeft)];
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class ActionShiftDVisualBlock extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = ['D'];
  override createsUndoPoint = true;
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const lines: string[] = [];
    for (const { start } of TextEditor.iterateLinesInBlock(vimState)) {
      const range = new vscode.Range(start, start.getLineEnd());
      lines.push(vimState.editor.document.getText(range));
      vimState.recordedState.transformer.addTransformation({
        type: 'deleteRange',
        range,
        manuallySetCursorPositions: true,
      });
    }

    const topLeft = visualBlockGetTopLeftPosition(
      vimState.cursorStopPosition,
      vimState.cursorStartPosition,
    );

    const text = lines.length === 1 ? lines[0] : lines.join('\n');
    Register.put(vimState, text, this.multicursorIndex, true);

    vimState.cursors = [new Cursor(topLeft, topLeft)];
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class ActionGoToInsertVisualBlockMode extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = ['I'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const cursors: Cursor[] = [];
    for (const cursor of vimState.cursors) {
      for (const { line, start } of TextEditor.iterateLinesInBlock(vimState, cursor)) {
        if (line === '' && start.character !== 0) {
          continue;
        }
        cursors.push(new Cursor(start, start));
      }
    }
    vimState.cursors = cursors;

    await vimState.setCurrentMode(Mode.Insert);
    vimState.isFakeMultiCursor = true;
  }
}

@RegisterAction
class ActionChangeInVisualBlockMode extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = [['c'], ['s']];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const cursors: Cursor[] = [];
    const lines: string[] = [];
    for (const cursor of vimState.cursors) {
      const width =
        1 +
        visualBlockGetBottomRightPosition(cursor.start, cursor.stop).character -
        visualBlockGetTopLeftPosition(cursor.start, cursor.stop).character;
      for (const { line, start, end } of TextEditor.iterateLinesInBlock(vimState, cursor)) {
        // TODO: is this behavior consistent with similar actions like VisualBlock `d`?
        lines.push(line.padEnd(width, ' '));
        if (line) {
          vimState.recordedState.transformer.addTransformation({
            type: 'deleteRange',
            range: new vscode.Range(start, end),
            manuallySetCursorPositions: true,
          });
          cursors.push(new Cursor(start, start));
        }
      }
    }
    vimState.cursors = cursors;

    const text = lines.length === 1 ? lines[0] : lines.join('\n');
    Register.put(vimState, text, this.multicursorIndex, true);

    await vimState.setCurrentMode(Mode.Insert);
    vimState.isFakeMultiCursor = true;
  }
}

@RegisterAction
class ActionChangeToEOLInVisualBlockMode extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = ['C'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const cursors: Cursor[] = [];
    for (const cursor of vimState.cursors) {
      for (const { start, end } of TextEditor.iterateLinesInBlock(vimState, cursor)) {
        vimState.recordedState.transformer.delete(new vscode.Range(start, start.getLineEnd()));
        cursors.push(new Cursor(end, end));
      }
    }
    vimState.cursors = cursors;

    await vimState.setCurrentMode(Mode.Insert);
    vimState.isFakeMultiCursor = true;
  }
}

abstract class ActionGoToInsertVisualLineModeCommand extends BaseCommand {
  override runsOnceForEveryCursor() {
    return false;
  }

  abstract getCursorRangeForLine(
    line: vscode.TextLine,
    selectionStart: Position,
    selectionEnd: Position,
  ): Cursor;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Insert);
    vimState.isFakeMultiCursor = true;

    const resultingCursors: Cursor[] = [];
    const cursorsOnBlankLines: Cursor[] = [];
    for (const selection of vimState.editor.selections) {
      const { start, end } = selection;

      for (let i = start.line; i <= end.line; i++) {
        const line = vimState.document.lineAt(i);

        const cursorRange = this.getCursorRangeForLine(line, start, end);
        if (!line.isEmptyOrWhitespace) {
          resultingCursors.push(cursorRange);
        } else {
          cursorsOnBlankLines.push(cursorRange);
        }
      }
    }

    if (resultingCursors.length > 0) {
      vimState.cursors = resultingCursors;
    } else {
      vimState.cursors = cursorsOnBlankLines;
    }
  }
}

@RegisterAction
class ActionGoToInsertVisualLineMode extends ActionGoToInsertVisualLineModeCommand {
  modes = [Mode.VisualLine];
  keys = ['I'];

  getCursorRangeForLine(line: vscode.TextLine): Cursor {
    const startCharacterPosition = new Position(
      line.lineNumber,
      line.firstNonWhitespaceCharacterIndex,
    );
    return new Cursor(startCharacterPosition, startCharacterPosition);
  }
}

@RegisterAction
class ActionGoToInsertVisualLineModeAppend extends ActionGoToInsertVisualLineModeCommand {
  modes = [Mode.VisualLine];
  keys = ['A'];

  getCursorRangeForLine(line: vscode.TextLine): Cursor {
    const endCharacterPosition = new Position(line.lineNumber, line.range.end.character);
    return new Cursor(endCharacterPosition, endCharacterPosition);
  }
}

@RegisterAction
class ActionGoToInsertVisualMode extends ActionGoToInsertVisualLineModeCommand {
  modes = [Mode.Visual];
  keys = ['I'];

  getCursorRangeForLine(
    line: vscode.TextLine,
    selectionStart: Position,
    selectionEnd: Position,
  ): Cursor {
    const startCharacterPosition =
      line.lineNumber === selectionStart.line
        ? selectionStart
        : new Position(line.lineNumber, line.firstNonWhitespaceCharacterIndex);
    return new Cursor(startCharacterPosition, startCharacterPosition);
  }
}

@RegisterAction
class ActionGoToInsertVisualModeAppend extends ActionGoToInsertVisualLineModeCommand {
  modes = [Mode.Visual];
  keys = ['A'];

  getCursorRangeForLine(
    line: vscode.TextLine,
    selectionStart: Position,
    selectionEnd: Position,
  ): Cursor {
    const endCharacterPosition =
      line.lineNumber === selectionEnd.line
        ? selectionEnd
        : new Position(line.lineNumber, line.range.end.character);
    return new Cursor(endCharacterPosition, endCharacterPosition);
  }
}

@RegisterAction
class ActionGoToInsertVisualBlockModeAppend extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = ['A'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const newCursors: Cursor[] = [];
    for (const cursor of vimState.cursors) {
      const [start, end] = sorted(cursor.start, cursor.stop);
      for (let lineNum = start.line; lineNum <= end.line; lineNum++) {
        const line = vimState.document.lineAt(lineNum);
        const insertionColumn =
          vimState.desiredColumn === Number.POSITIVE_INFINITY
            ? line.text.length
            : Math.max(cursor.start.character, cursor.stop.character) + 1;
        if (line.text.length < insertionColumn) {
          await TextEditor.insert(
            vimState.editor,
            ' '.repeat(insertionColumn - line.text.length),
            line.range.end,
            false,
          );
        }
        const newCursor = new Position(lineNum, insertionColumn);
        newCursors.push(new Cursor(newCursor, newCursor));
      }
    }

    vimState.cursors = newCursors;
    await vimState.setCurrentMode(Mode.Insert);
    vimState.isFakeMultiCursor = true;
  }
}

@RegisterAction
export class ActionDeleteCharVisualLineMode extends BaseCommand {
  modes = [Mode.VisualLine];
  keys = ['x'];
  override name = 'delete_char_visual_line_mode';

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const [start, end] = sorted(vimState.cursorStartPosition, vimState.cursorStopPosition);
    await new operator.DeleteOperator(this.multicursorIndex).run(
      vimState,
      start.getLineBegin(),
      end.getLineEnd(),
    );
  }
}

@RegisterAction
class ActionDeleteLineVisualMode extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = ['X'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const [start, end] = sorted(vimState.cursorStartPosition, vimState.cursorStopPosition);
    await new operator.DeleteOperator(this.multicursorIndex).run(
      vimState,
      start.getLineBegin(),
      end.getLineEnd(),
    );
  }
}

@RegisterAction
class ActionChangeLineVisualModeS extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = ['S'];

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return !configuration.surround && super.doesActionApply(vimState, keysPressed);
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    return new ActionChangeLineVisualMode().exec(position, vimState);
  }
}

@RegisterAction
class ActionChangeLineVisualMode extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = [['C'], ['R']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const [start, end] = sorted(vimState.cursorStartPosition, vimState.cursorStopPosition);
    await new operator.ChangeOperator(this.multicursorIndex).run(
      vimState,
      start.getLineBegin(),
      end.getLineEnd().getLeftIfEOL(),
    );
  }
}

@RegisterAction
class ActionChangeLineVisualBlockMode extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = [['R'], ['S']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    return new ActionChangeLineVisualMode().exec(position, vimState);
  }
}

@RegisterAction
class ActionChangeChar extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['s'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await new operator.ChangeOperator(this.multicursorIndex).run(
      vimState,
      position,
      position.getRight((vimState.recordedState.count || 1) - 1),
    );
  }

  // Don't clash with surround or sneak modes!
  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return (
      super.doesActionApply(vimState, keysPressed) &&
      !configuration.sneak &&
      !vimState.recordedState.operator
    );
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return (
      super.couldActionApply(vimState, keysPressed) &&
      !configuration.sneak &&
      !vimState.recordedState.operator
    );
  }
}

@RegisterAction
class ToggleCaseAndMoveForward extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['~'];
  override createsUndoPoint = true;

  private toggleCase(text: string): string {
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

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const count = vimState.recordedState.count || 1;
    const range = new vscode.Range(
      position,
      shouldWrapKey(vimState.currentMode, '~')
        ? position.getOffsetThroughLineBreaks(count)
        : position.getRight(count),
    );

    vimState.recordedState.transformer.addTransformation({
      type: 'replaceText',
      range,
      text: this.toggleCase(vimState.document.getText(range)),
      diff: PositionDiff.exactPosition(range.end),
    });
  }
}

abstract class IncrementDecrementNumberAction extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  override createsUndoPoint = true;
  abstract offset: number;
  abstract staircase: boolean;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const ranges = this.getSearchRanges(vimState);

    let stepNum = 1;

    for (const [idx, range] of ranges.entries()) {
      position = range.start;

      const text = vimState.document.lineAt(position).text;

      // Make sure position within the text is possible and return if not
      if (text.length <= position.character) {
        continue;
      }

      // Start looking to the right for the next word to increment, unless we're
      // already on a word to increment, in which case start at the beginning of
      // that word.
      const whereToStart = text[position.character].match(/\s/)
        ? position
        : position.prevWordStart(vimState.document, { inclusive: true });

      wordLoop: for (let { start, end, word } of TextEditor.iterateWords(
        vimState.document,
        whereToStart,
      )) {
        if (start.isAfter(range.stop)) {
          break;
        }

        // '-' doesn't count as a word, but is important to include in parsing
        // the number, as long as it is not just part of the word (-foo2 for example)
        if (text[start.character - 1] === '-' && /\d/.test(text[start.character])) {
          start = start.getLeft();
          word = text[start.character] + word;
        }
        // Strict number parsing so "1a" doesn't silently get converted to "1"
        do {
          const result = NumericString.parse(word);
          if (result === undefined) {
            break;
          }
          const { num, suffixOffset } = result;

          // Use suffix offset to check if current cursor is in or before detected number.
          if (position.character < start.character + suffixOffset) {
            const pos = await this.replaceNum(
              vimState,
              num,
              this.offset * stepNum * (vimState.recordedState.count || 1),
              start,
              end,
            );

            if (this.staircase) {
              stepNum++;
            }

            if (vimState.currentMode === Mode.Normal) {
              vimState.recordedState.transformer.moveCursor(
                PositionDiff.exactPosition(pos.getLeft(num.suffix.length)),
              );
            }
            break wordLoop;
          } else {
            // For situation like this: xyz1999em199[cursor]9m
            word = word.slice(suffixOffset);
            start = new Position(start.line, start.character + suffixOffset);
          }
        } while (true);
      }
    }

    if (isVisualMode(vimState.currentMode)) {
      vimState.recordedState.transformer.moveCursor(PositionDiff.exactPosition(ranges[0].start));
    }

    await vimState.setCurrentMode(Mode.Normal);
  }

  private async replaceNum(
    vimState: VimState,
    start: NumericString,
    offset: number,
    startPos: Position,
    endPos: Position,
  ): Promise<Position> {
    const oldLength = endPos.character + 1 - startPos.character;
    start.value += offset;
    const newNum = start.toString();

    const range = new vscode.Range(startPos, endPos.getRight());

    vimState.recordedState.transformer.replace(range, newNum);
    if (oldLength !== newNum.length) {
      // Adjust end position according to difference in width of number-string
      endPos = new Position(endPos.line, startPos.character + newNum.length - 1);
    }

    return endPos;
  }

  /**
   * @returns a list of Ranges in which to search for numbers
   */
  private getSearchRanges(vimState: VimState): Cursor[] {
    const ranges: Cursor[] = [];
    const [start, stop] = sorted(vimState.cursorStartPosition, vimState.cursorStopPosition);
    switch (vimState.currentMode) {
      case Mode.Normal: {
        ranges.push(
          new Cursor(vimState.cursorStopPosition, vimState.cursorStopPosition.getLineEnd()),
        );
        break;
      }

      case Mode.Visual: {
        ranges.push(new Cursor(start, start.getLineEnd()));
        for (let line = start.line + 1; line < stop.line; line++) {
          const lineStart = new Position(line, 0);
          ranges.push(new Cursor(lineStart, lineStart.getLineEnd()));
        }
        ranges.push(new Cursor(stop.getLineBegin(), stop));
        break;
      }

      case Mode.VisualLine: {
        for (let line = start.line; line <= stop.line; line++) {
          const lineStart = new Position(line, 0);
          ranges.push(new Cursor(lineStart, lineStart.getLineEnd()));
        }
        break;
      }

      case Mode.VisualBlock: {
        const topLeft = visualBlockGetTopLeftPosition(start, stop);
        const bottomRight = visualBlockGetBottomRightPosition(start, stop);
        for (let line = topLeft.line; line <= bottomRight.line; line++) {
          ranges.push(
            new Cursor(
              new Position(line, topLeft.character),
              new Position(line, bottomRight.character),
            ),
          );
        }
        break;
      }

      default:
        throw new Error(
          `Unexpected mode ${vimState.currentMode} in IncrementDecrementNumberAction.getPositions()`,
        );
    }
    return ranges;
  }
}

@RegisterAction
class IncrementNumberAction extends IncrementDecrementNumberAction {
  keys = ['<C-a>'];
  offset = +1;
  staircase = false;
}

@RegisterAction
class DecrementNumberAction extends IncrementDecrementNumberAction {
  keys = ['<C-x>'];
  offset = -1;
  staircase = false;
}

@RegisterAction
class IncrementNumberStaircaseAction extends IncrementDecrementNumberAction {
  keys = ['g', '<C-a>'];
  offset = +1;
  staircase = true;
}

@RegisterAction
class DecrementNumberStaircaseAction extends IncrementDecrementNumberAction {
  keys = ['g', '<C-x>'];
  offset = -1;
  staircase = true;
}

@RegisterAction
export class CommandUnicodeName extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'a'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const char = vimState.document.getText(new vscode.Range(position, position.getRight()));
    const charCode = char.charCodeAt(0);
    // TODO: Handle charCode > 127 by also including <M-x>
    StatusBar.setText(
      vimState,
      `<${char}>  ${charCode},  Hex ${charCode.toString(16)},  Octal ${charCode.toString(8)}`,
    );
  }
}

@RegisterAction
class ActionTriggerHover extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'h'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('editor.action.showHover');
  }
}

/**
 * Multi-Cursor Command Overrides
 *
 * We currently have to override the VSCode key commands that get us into multi-cursor mode.
 *
 * Normally, we'd just listen for another cursor to be added in order to go into multi-cursor
 * mode rather than rewriting each keybinding one-by-one. We can't currently do that because
 * Visual Block Mode also creates additional cursors, but will get confused if you're in
 * multi-cursor mode.
 */

@RegisterAction
export class ActionOverrideCmdD extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual];
  keys = [['<D-d>'], ['g', 'b']];
  override runsOnceForEveryCursor() {
    return false;
  }
  override runsOnceForEachCountPrefix = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('editor.action.addSelectionToNextFindMatch');
    vimState.cursors = getCursorsAfterSync(vimState.editor);

    // If this is the first cursor, select 1 character less
    // so that only the word is selected, no extra character
    vimState.cursors = vimState.cursors.map((x) => x.withNewStop(x.stop.getLeft()));

    await vimState.setCurrentMode(Mode.Visual);
  }
}

@RegisterAction
class ActionOverrideCmdDInsert extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<D-d>'];
  override runsOnceForEveryCursor() {
    return false;
  }
  override runsOnceForEachCountPrefix = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    // Since editor.action.addSelectionToNextFindMatch uses the selection to
    // determine where to add a word, we need to do a hack and manually set the
    // selections to the word boundaries before we make the api call.
    vimState.editor.selections = vimState.editor.selections.map((x, idx) => {
      const curPos = x.active;
      if (idx === 0) {
        return new vscode.Selection(
          curPos.prevWordStart(vimState.document),
          curPos.getLeft().nextWordEnd(vimState.document, { inclusive: true }).getRight(),
        );
      } else {
        // Since we're adding the selections ourselves, we need to make sure
        // that our selection is actually over what our original word is
        const matchWordPos = vimState.editor.selections[0].active;
        const matchWordLength =
          matchWordPos.getLeft().nextWordEnd(vimState.document, { inclusive: true }).getRight()
            .character - matchWordPos.prevWordStart(vimState.document).character;
        const wordBegin = curPos.getLeft(matchWordLength);
        return new vscode.Selection(wordBegin, curPos);
      }
    });
    vimState.recordedState.transformer.vscodeCommand('editor.action.addSelectionToNextFindMatch');
  }
}

@RegisterAction
class ActionOverrideCmdAltDown extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual];
  keys = [
    ['<D-alt+down>'], // OSX
    ['<C-alt+down>'], // Windows
  ];
  override runsOnceForEveryCursor() {
    return false;
  }
  override runsOnceForEachCountPrefix = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.recordedState.transformer.vscodeCommand('editor.action.insertCursorBelow');
  }
}

@RegisterAction
class ActionOverrideCmdAltUp extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual];
  keys = [
    ['<D-alt+up>'], // OSX
    ['<C-alt+up>'], // Windows
  ];
  override runsOnceForEveryCursor() {
    return false;
  }
  override runsOnceForEachCountPrefix = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.recordedState.transformer.vscodeCommand('editor.action.insertCursorAbove');
  }
}

@RegisterAction
class ActionShowFileInfo extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['<C-g>'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    reportFileInfo(position, vimState);
  }
}

@RegisterAction
class WriteQuit extends BaseCommand {
  modes = [Mode.Normal];
  keys = [['Z', 'Z']];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await new WriteQuitCommand({ bang: false, opt: [] }).execute(vimState);
  }
}

@RegisterAction
class Quit extends BaseCommand {
  modes = [Mode.Normal];
  keys = [['Z', 'Q']];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await new QuitCommand({ bang: true }).execute(vimState);
  }
}

@RegisterAction
class ActionGoToAlternateFile extends BaseCommand {
  modes = [Mode.Normal];
  keys = [['<C-6>'], ['<C-^>']];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const altFile = await Register.get('#');
    if (altFile?.text instanceof RecordedState) {
      throw new Error(`# register unexpectedly contained a RecordedState`);
    } else if (altFile === undefined || altFile.text === '') {
      StatusBar.displayError(vimState, VimError.fromCode(ErrorCode.NoAlternateFile));
    } else {
      let files: vscode.Uri[];
      if (await doesFileExist(vscode.Uri.file(altFile.text))) {
        files = [vscode.Uri.file(altFile.text)];
      } else {
        files = await vscode.workspace.findFiles(altFile.text);
      }

      // TODO: if the path matches a file from multiple workspace roots, we may not choose the right one
      if (files.length > 0) {
        const document = await vscode.workspace.openTextDocument(files[0]);
        await vscode.window.showTextDocument(document);
      }
    }
  }
}

@RegisterAction
class ShowFileOutline extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'O'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('outline.focus');
  }
}
