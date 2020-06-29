import * as vscode from 'vscode';
import { Position } from '../../common/motion/position';
import { configuration } from '../../configuration/configuration';
import { Mode } from '../../mode/mode';
import { Register, RegisterMode } from '../../register/register';
import { VimState } from '../../state/vimState';
import { TextEditor } from '../../textEditor';
import { BaseOperator } from '../operator';
import { RegisterAction, RegisterPluginAction } from './../base';
import { BaseCommand } from '../commands/actions';

@RegisterPluginAction('replacewithregister')
export class ReplaceOperator extends BaseOperator {
  public pluginActionDefaultKeys = ['g', 'r'];
  public keys = ['<ReplaceWithRegisterOperator>'];
  public modes = [Mode.Normal];

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return configuration.replaceWithRegister && super.doesActionApply(vimState, keysPressed);
  }

  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return configuration.replaceWithRegister && super.doesActionApply(vimState, keysPressed);
  }

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    const range =
      vimState.currentRegisterMode === RegisterMode.LineWise
        ? new vscode.Range(start.getLineBegin(), end.getLineEndIncludingEOL())
        : new vscode.Range(start, end.getRight());
    const register = await Register.get(vimState);
    const replaceWith = register.text as string;

    await TextEditor.replace(range, replaceWith);
    await vimState.setCurrentMode(Mode.Normal);
    return updateCursorPosition(vimState, range, replaceWith);
  }
}

@RegisterPluginAction('replacewithregister')
export class ReplaceOperatorLine extends BaseCommand {
  public pluginActionDefaultKeys = ['g', 'r', 'r'];
  public keys = ['<ReplaceWithRegisterLine>'];
  public modes = [Mode.Normal];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    return new ReplaceOperator().runRepeat(vimState, position, vimState.recordedState.count);
  }

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return configuration.replaceWithRegister && super.doesActionApply(vimState, keysPressed);
  }

  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return configuration.replaceWithRegister && super.doesActionApply(vimState, keysPressed);
  }
}

@RegisterPluginAction('replacewithregister')
export class ReplaceOperatorVisual extends ReplaceOperator {
  public pluginActionDefaultKeys = ['g', 'r'];
  public keys = ['<ReplaceWithRegisterVisual>'];
  public modes = [Mode.Visual, Mode.VisualLine];
}

const updateCursorPosition = (
  vimState: VimState,
  range: vscode.Range,
  replaceWith: string
): VimState => {
  const {
    recordedState: { actionKeys },
  } = vimState;
  const lines = replaceWith.split('\n');
  const wasRunAsLineAction =
    actionKeys.indexOf('<ReplaceWithRegisterLine>') === 0 && actionKeys.length === 1; // ie. grr
  const registerAndRangeAreSingleLines = lines.length === 1 && range.isSingleLine;
  const singleLineAction = registerAndRangeAreSingleLines && !wasRunAsLineAction;

  const cursorPosition = singleLineAction
    ? cursorAtEndOfReplacement(range, replaceWith)
    : cursorAtFirstNonBlankCharOfLine(range);

  return vimStateWithCursorPosition(vimState, cursorPosition);
};

const cursorAtEndOfReplacement = (range: vscode.Range, replacement: string) =>
  new Position(range.start.line, Math.max(0, range.start.character + replacement.length - 1));

const cursorAtFirstNonBlankCharOfLine = (range: vscode.Range) =>
  TextEditor.getFirstNonWhitespaceCharOnLine(range.start.line);

const vimStateWithCursorPosition = (vimState: VimState, cursorPosition: Position): VimState => {
  vimState.cursorStopPosition = cursorPosition;
  vimState.cursorStartPosition = cursorPosition;

  return vimState;
};
