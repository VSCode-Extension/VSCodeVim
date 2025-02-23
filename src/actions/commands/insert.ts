import * as vscode from 'vscode';

import { Position } from 'vscode';
import { lineCompletionProvider } from '../../completion/lineCompletionProvider';
import { ErrorCode, VimError } from '../../error';
import { RecordedState } from '../../state/recordedState';
import { VimState } from '../../state/vimState';
import { StatusBar } from '../../statusBar';
import { isHighSurrogate, isLowSurrogate } from '../../util/util';
import { PositionDiff } from './../../common/motion/position';
import { configuration } from './../../configuration/configuration';
import { Mode } from './../../mode/mode';
import { Register, RegisterMode } from './../../register/register';
import { TextEditor } from './../../textEditor';
import { BaseCommand, RegisterAction } from './../base';
import { ArrowsInInsertMode } from './../motion';
import {
  CommandInsertAfterCursor,
  CommandInsertAtCursor,
  CommandInsertAtFirstCharacter,
  CommandInsertAtLastChange,
  CommandInsertAtLineBegin,
  CommandInsertAtLineEnd,
  CommandInsertNewLineAbove,
  CommandInsertNewLineBefore,
  CommandReplaceAtCursorFromNormalMode,
  DocumentContentChangeAction,
} from './actions';
import { DefaultDigraphs } from './digraphs';
import { globalState } from '../../state/globalState';

@RegisterAction
export class CommandEscInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = [['<Esc>'], ['<C-c>'], ['<C-[>']];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    void vscode.commands.executeCommand('closeParameterHints');

    vimState.cursors = vimState.cursors.map((x) => x.withNewStop(x.stop.getLeft()));
    if (vimState.returnToInsertAfterCommand && position.character !== 0) {
      vimState.cursors = vimState.cursors.map((x) => x.withNewStop(x.stop.getRight()));
    }

    // only remove leading spaces inserted by vscode.
    // vscode only inserts them when user enter a new line,
    // ie, o/O in Normal mode or \n in Insert mode.
    const lastActionBeforeEsc =
      vimState.recordedState.actionsRun[vimState.recordedState.actionsRun.length - 2];
    if (
      vimState.document.languageId !== 'plaintext' &&
      (lastActionBeforeEsc instanceof CommandInsertNewLineBefore ||
        lastActionBeforeEsc instanceof CommandInsertNewLineAbove ||
        (lastActionBeforeEsc instanceof DocumentContentChangeAction &&
          lastActionBeforeEsc.keysPressed[lastActionBeforeEsc.keysPressed.length - 1] === '\n'))
    ) {
      for (const cursor of vimState.cursors) {
        const line = vimState.document.lineAt(cursor.stop);
        if (line.text.length > 0 && line.isEmptyOrWhitespace) {
          vimState.recordedState.transformer.delete(line.range);
        }
      }
    }
    await vimState.setCurrentMode(Mode.Normal);

    // If we wanted to repeat this insert (only for i and a), now is the time to do it. Insert
    // count amount of these strings before returning back to normal mode
    const shouldRepeatInsert =
      vimState.recordedState.count > 1 &&
      vimState.recordedState.actionsRun.find(
        (a) =>
          a instanceof CommandInsertAtCursor ||
          a instanceof CommandInsertAfterCursor ||
          a instanceof CommandInsertAtLineBegin ||
          a instanceof CommandInsertAtLineEnd ||
          a instanceof CommandInsertAtFirstCharacter ||
          a instanceof CommandInsertAtLastChange,
      ) !== undefined;

    // If this is the type to repeat insert, do this now
    if (shouldRepeatInsert) {
      const changeAction = vimState.recordedState.actionsRun
        .slice()
        .reverse()
        .find((a) => a instanceof DocumentContentChangeAction);
      if (changeAction instanceof DocumentContentChangeAction) {
        // Add count amount of inserts in the case of 4i=<esc>
        // TODO: A few actions such as <C-t> should be repeated, but are not
        for (let i = 0; i < vimState.recordedState.count - 1; i++) {
          // If this is the last transform, move cursor back one character
          const positionDiff =
            i === vimState.recordedState.count - 2
              ? PositionDiff.offset({ character: -1 })
              : PositionDiff.identity();

          // Add a transform containing the change
          vimState.recordedState.transformer.addTransformation(
            changeAction.getTransformation(positionDiff),
          );
        }
      }
    }

    if (vimState.historyTracker.currentContentChanges.length > 0) {
      vimState.historyTracker.currentContentChanges = [];
    }

    if (vimState.isFakeMultiCursor) {
      vimState.cursors = [vimState.cursors[0]];
      vimState.isFakeMultiCursor = false;
    }
  }
}

@RegisterAction
export class CommandInsertPreviousText extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-a>'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const register = await Register.get('.');
    if (
      register === undefined ||
      !(register.text instanceof RecordedState) ||
      !register.text.actionsRun
    ) {
      throw VimError.fromCode(ErrorCode.NoInsertedTextYet);
    }

    const recordedState = register.text.clone();

    // The first action is entering Insert Mode, which is not necessary in this case
    recordedState.actionsRun.shift();

    // The last action is leaving Insert Mode, which is not necessary in this case
    recordedState.actionsRun.pop();

    if (recordedState.actionsRun?.[0] instanceof ArrowsInInsertMode) {
      // Note, arrow keys are the only Insert action command that can't be repeated here as far as @rebornix knows.
      recordedState.actionsRun.shift();
    }

    vimState.recordedState.transformer.addTransformation({
      type: 'replayRecordedState',
      count: 1,
      recordedState,
    });
  }
}

@RegisterAction
class CommandInsertPreviousTextAndQuit extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-shift+2>']; // <C-@>

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await new CommandInsertPreviousText().exec(position, vimState);
    await vimState.setCurrentMode(Mode.Normal);
  }
}

abstract class IndentCommand extends BaseCommand {
  modes = [Mode.Insert];
  abstract readonly delta: number;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const line = vimState.document.lineAt(position);
    const tabSize = Number(vimState.editor.options.tabSize);
    const indentationWidth = TextEditor.getIndentationLevel(line.text, tabSize);
    const newIndentationWidth = (Math.floor(indentationWidth / tabSize) + this.delta) * tabSize;

    vimState.recordedState.transformer.replace(
      new vscode.Range(
        position.getLineBegin(),
        position.with({ character: line.firstNonWhitespaceCharacterIndex }),
      ),
      TextEditor.setIndentationLevel(
        line.text,
        newIndentationWidth,
        vimState.editor.options.insertSpaces as boolean,
      ).match(/^(\s*)/)![1],
    );
  }
}

@RegisterAction
class IncreaseIndent extends IndentCommand {
  keys = ['<C-t>'];
  override readonly delta = 1;
}
@RegisterAction
class DecreaseIndent extends IndentCommand {
  keys = ['<C-d>'];
  override readonly delta = -1;
}

@RegisterAction
export class CommandBackspaceInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = [['<BS>'], ['<C-h>']];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.recordedState.transformer.vscodeCommand('deleteLeft');
  }
}

@RegisterAction
class CommandDeleteInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<Del>'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.recordedState.transformer.vscodeCommand('deleteRight');
  }
}

@RegisterAction
export class CommandInsertInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<character>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const char = this.keysPressed[this.keysPressed.length - 1];

    let text = char;

    if (char.length === 1) {
      const prevHighSurrogate =
        vimState.modeData.mode === Mode.Insert ? vimState.modeData.highSurrogate : undefined;

      if (isHighSurrogate(char.charCodeAt(0))) {
        await vimState.setModeData({
          mode: Mode.Insert,
          highSurrogate: char,
        });

        if (prevHighSurrogate === undefined) return;
        text = prevHighSurrogate;
      } else {
        if (isLowSurrogate(char.charCodeAt(0)) && prevHighSurrogate !== undefined) {
          text = prevHighSurrogate + char;
        }

        await vimState.setModeData({
          mode: Mode.Insert,
          highSurrogate: undefined,
        });
      }
    }

    vimState.recordedState.transformer.addTransformation({
      type: 'insertTextVSCode',
      text,
      isMultiCursor: vimState.isMultiCursor,
    });
  }

  public override toString(): string {
    return this.keysPressed[this.keysPressed.length - 1];
  }
}

@RegisterAction
class CommandInsertDigraph extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-k>', '<any>', '<any>'];
  override isCompleteAction = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const digraph = this.keysPressed.slice(1, 3).join('');
    const reverseDigraph = digraph.split('').reverse().join('');
    let charCodes = (DefaultDigraphs.get(digraph) ||
      DefaultDigraphs.get(reverseDigraph) ||
      configuration.digraphs[digraph] ||
      configuration.digraphs[reverseDigraph])[1];
    if (!(charCodes instanceof Array)) {
      charCodes = [charCodes];
    }
    const char = String.fromCharCode(...charCodes);
    vimState.recordedState.transformer.insert(position, char);
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (!super.doesActionApply(vimState, keysPressed)) {
      return false;
    }
    const chars = keysPressed.slice(1, 3).join('');
    const reverseChars = chars.split('').reverse().join('');
    return (
      chars in configuration.digraphs ||
      reverseChars in configuration.digraphs ||
      DefaultDigraphs.has(chars) ||
      DefaultDigraphs.has(reverseChars)
    );
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (!super.couldActionApply(vimState, keysPressed)) {
      return false;
    }
    const chars = keysPressed.slice(1, keysPressed.length).join('');
    const reverseChars = chars.split('').reverse().join('');
    if (chars.length > 0) {
      const predicate = (digraph: string) => {
        const digraphChars = digraph.substring(0, chars.length);
        return chars === digraphChars || reverseChars === digraphChars;
      };
      const match =
        Object.keys(configuration.digraphs).find(predicate) ||
        [...DefaultDigraphs.keys()].find(predicate);
      return match !== undefined;
    }
    return true;
  }
}

@RegisterAction
class CommandInsertRegisterContent extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-r>', '<character>'];
  override isCompleteAction = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const registerKey = this.keysPressed[1];
    if (!Register.isValidRegister(registerKey)) {
      return;
    }

    const register = await Register.get(registerKey, this.multicursorIndex);
    if (register === undefined) {
      StatusBar.displayError(vimState, VimError.fromCode(ErrorCode.NothingInRegister, registerKey));
      return;
    }

    if (register.text instanceof RecordedState) {
      vimState.recordedState.transformer.addTransformation({
        type: 'macro',
        register: vimState.recordedState.registerName,
        replay: 'keystrokes',
      });

      return;
    }

    let text = register.text;
    if (register.registerMode === RegisterMode.LineWise && !vimState.isMultiCursor) {
      text += '\n';
    }

    vimState.recordedState.transformer.insert(position, text);
  }
}

@RegisterAction
class CommandOneNormalCommandInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-o>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.returnToInsertAfterCommand = true;
    vimState.actionCount = 0;
    await new CommandEscInsertMode().exec(position, vimState);
  }
}

@RegisterAction
class CommandCtrlW extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-w>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (position.isAtDocumentBegin()) {
      return;
    }

    let wordBegin: Position;
    if (position.isInLeadingWhitespace(vimState.document)) {
      wordBegin = position.getLineBegin();
    } else if (position.isLineBeginning()) {
      wordBegin = position.getUp().getLineEnd();
    } else {
      wordBegin = position.prevWordStart(vimState.document);
    }

    vimState.recordedState.transformer.delete(new vscode.Range(wordBegin, position));

    vimState.cursorStopPosition = wordBegin;
  }
}

@RegisterAction
export class InsertCharAbove extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-y>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (position.line === 0) {
      return;
    }

    const charPos = position.getUp();
    if (charPos.isLineEnd()) {
      return;
    }

    const char = vimState.document.getText(new vscode.Range(charPos, charPos.getRight()));

    vimState.recordedState.transformer.insert(position, char);
  }
}

@RegisterAction
export class InsertCharBelow extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-e>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (position.line >= vimState.document.lineCount - 1) {
      return;
    }

    const charPos = position.getDown();
    if (charPos.isLineEnd()) {
      return;
    }

    const char = vimState.document.getText(new vscode.Range(charPos, charPos.getRight()));

    vimState.recordedState.transformer.insert(position, char);
  }
}

@RegisterAction
class CommandCtrlUInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-u>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    let start: Position;
    if (position.character === 0) {
      start = position.getLeftThroughLineBreaks(true);
    } else if (position.isInLeadingWhitespace(vimState.document)) {
      start = position.getLineBegin();
    } else {
      start = position.getLineBeginRespectingIndent(vimState.document);
    }

    vimState.recordedState.transformer.delete(new vscode.Range(start, position));

    vimState.cursorStopPosition = start;
    vimState.cursorStartPosition = start;
  }
}

@RegisterAction
class CommandNavigateAutocompleteDown extends BaseCommand {
  modes = [Mode.Insert];
  keys = [['<C-n>'], ['<C-j>']];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('selectNextSuggestion');
  }
}

@RegisterAction
class CommandNavigateAutocompleteUp extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-p>'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vscode.commands.executeCommand('selectPrevSuggestion');
  }
}

@RegisterAction
class CommandCtrlVInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-v>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const clipboard = await Register.get('*', this.multicursorIndex);
    const text = clipboard?.text instanceof RecordedState ? undefined : clipboard?.text;

    if (text) {
      vimState.recordedState.transformer.insert(vimState.cursorStopPosition, text);
    }
  }
}

@RegisterAction
class AltYInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<A-y>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const text = await vscode.window.showQuickPick([
      ...new Set(globalState.killRing.reverse()),
    ], {
      placeHolder: "Choose which kill to yank"
    });

    if (text) {
      vimState.recordedState.transformer.insert(vimState.cursorStopPosition, text);
    }
  }
}

@RegisterAction
class CommandShowLineAutocomplete extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-x>', '<C-l>'];
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await lineCompletionProvider.showLineCompletionsQuickPick(position, vimState);
  }
}

@RegisterAction
class NewLineInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = [['<C-j>'], ['<C-m>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.recordedState.transformer.insert(
      position,
      '\n',
      PositionDiff.offset({ character: -1 }),
    );
  }
}

@RegisterAction
class CommandReplaceAtCursorFromInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<Insert>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await new CommandReplaceAtCursorFromNormalMode().exec(position, vimState);
  }
}

@RegisterAction
class CreateUndoPoint extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-g>', 'u'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    vimState.historyTracker.addChange(true);
    vimState.historyTracker.finishCurrentStep();
  }
}
