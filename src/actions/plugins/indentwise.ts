import { VimState } from '../../state/vimState';
import { configuration } from './../../configuration/configuration';
import { RegisterAction } from './../base';
import { BaseMovement, IMovement } from '../baseMotion';
import { Position } from 'vscode';
import { TextDocument } from 'vscode';

function getIndentDepth(line: string): number {
  const match = line.match(/^\s*/);
  if (match) {
    return match[0].length;
  }
  return 0;
}

abstract class IndentwiseNextBase extends BaseMovement {
  override isJump = true;
  abstract isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean;
  abstract setRepeatActions(vimState: VimState): void;

  public override async execAction(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    if (!this.isRepeat) {
      this.setRepeatActions(vimState);
    }

    const document = vimState.document;
    const lineCount = document.lineCount;
    const cursorLine = document.lineAt(position.line);
    const cursorLineIndentation = getIndentDepth(cursorLine.text);
    for (let i = position.line + 1; i < lineCount; ++i) {
      const lineText = document.lineAt(i).text;

      // Ignore lines that are entirely empty
      if (lineText.trim() === '') continue;

      const currentLineIndentation = getIndentDepth(lineText);

      if (this.isDesiredIndentLevel(currentLineIndentation, cursorLineIndentation)) {
        return new Position(i, currentLineIndentation);
      }
    }

    return position;
  }
}

@RegisterAction
export class IndentwiseNextLesserIndent extends IndentwiseNextBase {
  keys = [[']', '-']];

  override setRepeatActions(vimState: VimState): void {
    vimState.lastSemicolonRepeatableMovement = new IndentwiseNextLesserIndent(
      this.keysPressed,
      true
    );
    vimState.lastCommaRepeatableMovement = new IndentwisePreviousLesserIndent(
      this.keysPressed,
      true
    );
  }

  override isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean {
    return currentLineIndentation < cursorLineIndentation;
  }
}

@RegisterAction
export class IndentwiseNextEqualIndent extends IndentwiseNextBase {
  keys = [[']', '=']];

  override setRepeatActions(vimState: VimState): void {
    vimState.lastSemicolonRepeatableMovement = new IndentwiseNextEqualIndent(
      this.keysPressed,
      true
    );
    vimState.lastCommaRepeatableMovement = new IndentwisePreviousEqualIndent(
      this.keysPressed,
      true
    );
  }

  override isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean {
    return currentLineIndentation === cursorLineIndentation;
  }
}

@RegisterAction
export class IndentwiseNextGreaterIndent extends IndentwiseNextBase {
  keys = [[']', '+']];

  override setRepeatActions(vimState: VimState): void {
    vimState.lastSemicolonRepeatableMovement = new IndentwiseNextGreaterIndent(
      this.keysPressed,
      true
    );
    vimState.lastCommaRepeatableMovement = new IndentwisePreviousGreaterIndent(
      this.keysPressed,
      true
    );
  }

  override isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean {
    return currentLineIndentation > cursorLineIndentation;
  }
}

abstract class IndentwisePreviousBase extends BaseMovement {
  override isJump = true;
  abstract isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean;
  abstract setRepeatActions(vimState: VimState): void;

  public override async execAction(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    if (!this.isRepeat) {
      this.setRepeatActions(vimState);
    }

    const document = vimState.document;
    const cursorLine = document.lineAt(position.line);
    const cursorLineIndentation = getIndentDepth(cursorLine.text);
    for (let i = position.line - 1; i >= 0; --i) {
      const lineText = document.lineAt(i).text;

      // Ignore lines that are entirely empty
      if (lineText.trim() === '') continue;

      const currentLineIndentation = getIndentDepth(lineText);

      if (this.isDesiredIndentLevel(currentLineIndentation, cursorLineIndentation)) {
        return new Position(i, currentLineIndentation);
      }
    }

    return position;
  }
}

@RegisterAction
export class IndentwisePreviousLesserIndent extends IndentwisePreviousBase {
  keys = [['[', '-']];

  override setRepeatActions(vimState: VimState): void {
    vimState.lastSemicolonRepeatableMovement = new IndentwisePreviousLesserIndent(
      this.keysPressed,
      true
    );
    vimState.lastCommaRepeatableMovement = new IndentwiseNextLesserIndent(this.keysPressed, true);
  }

  override isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean {
    return currentLineIndentation < cursorLineIndentation;
  }
}

@RegisterAction
export class IndentwisePreviousEqualIndent extends IndentwisePreviousBase {
  keys = [['[', '=']];

  override setRepeatActions(vimState: VimState): void {
    vimState.lastSemicolonRepeatableMovement = new IndentwisePreviousEqualIndent(
      this.keysPressed,
      true
    );
    vimState.lastCommaRepeatableMovement = new IndentwiseNextEqualIndent(this.keysPressed, true);
  }

  override isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean {
    return currentLineIndentation === cursorLineIndentation;
  }
}

@RegisterAction
export class IndentwisePreviousGreaterIndent extends IndentwisePreviousBase {
  keys = [['[', '+']];

  override setRepeatActions(vimState: VimState): void {
    vimState.lastSemicolonRepeatableMovement = new IndentwisePreviousGreaterIndent(
      this.keysPressed,
      true
    );
    vimState.lastCommaRepeatableMovement = new IndentwiseNextGreaterIndent(this.keysPressed, true);
  }

  override isDesiredIndentLevel(
    currentLineIndentation: number,
    cursorLineIndentation: number
  ): boolean {
    return currentLineIndentation > cursorLineIndentation;
  }
}

@RegisterAction
export class IndentwiseNextAbsoluteIndent extends BaseMovement {
  keys = [
    [']', '_', '0'],
    [']', '_', '1'],
    [']', '_', '2'],
    [']', '_', '3'],
    [']', '_', '4'],
    [']', '_', '5'],
    [']', '_', '6'],
    [']', '_', '7'],
    [']', '_', '8'],
    [']', '_', '9'],
  ];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    if (!this.isRepeat) {
      vimState.lastSemicolonRepeatableMovement = new IndentwiseNextAbsoluteIndent(
        this.keysPressed,
        true
      );
      vimState.lastCommaRepeatableMovement = new IndentwisePreviousAbsoluteIndent(
        this.keysPressed,
        true
      );
    }

    const document = vimState.document;
    const lineCount = document.lineCount;
    const documentIndentation = vimState.editor.options.insertSpaces
      ? (vimState.editor.options.tabSize as number)
      : 1;
    for (let i = position.line + 1; i < lineCount; ++i) {
      const lineText = document.lineAt(i).text;

      // Ignore lines that are entirely empty
      if (lineText.trim() === '') continue;

      const currentLineIndentation = getIndentDepth(lineText);

      if (
        Math.floor(currentLineIndentation / documentIndentation) ===
        Number.parseInt(this.keysPressed[2], 10)
      ) {
        return new Position(i, currentLineIndentation);
      }
    }

    return position;
  }
}

@RegisterAction
export class IndentwisePreviousAbsoluteIndent extends BaseMovement {
  keys = [
    ['[', '_', '0'],
    ['[', '_', '1'],
    ['[', '_', '2'],
    ['[', '_', '3'],
    ['[', '_', '4'],
    ['[', '_', '5'],
    ['[', '_', '6'],
    ['[', '_', '7'],
    ['[', '_', '8'],
    ['[', '_', '9'],
  ];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    if (!this.isRepeat) {
      vimState.lastSemicolonRepeatableMovement = new IndentwisePreviousAbsoluteIndent(
        this.keysPressed,
        true
      );
      vimState.lastCommaRepeatableMovement = new IndentwiseNextAbsoluteIndent(
        this.keysPressed,
        true
      );
    }

    const document = vimState.document;

    const documentIndentation = vimState.editor.options.insertSpaces
      ? (vimState.editor.options.tabSize as number)
      : 1;
    for (let i = position.line - 1; i >= 0; --i) {
      const lineText = document.lineAt(i).text;

      // Ignore lines that are entirely empty
      if (lineText.trim() === '') continue;

      const currentLineIndentation = getIndentDepth(lineText);

      if (
        Math.floor(currentLineIndentation / documentIndentation) ===
        Number.parseInt(this.keysPressed[2], 10)
      ) {
        return new Position(i, currentLineIndentation);
      }
    }

    return position;
  }
}

@RegisterAction
export class IndentwiseBlockScopeBoundaryEnd extends BaseMovement {
  keys = [[']', '%']];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    if (!this.isRepeat) {
      vimState.lastSemicolonRepeatableMovement = new IndentwiseBlockScopeBoundaryEnd(
        this.keysPressed,
        true
      );
      vimState.lastCommaRepeatableMovement = new IndentwiseBlockScopeBoundaryBegin(
        this.keysPressed,
        true
      );
    }

    const document = vimState.document;
    const lineCount = document.lineCount;
    const cursorLine = document.lineAt(position.line);
    const cursorLineIndentation = getIndentDepth(cursorLine.text);

    let nextLogicalLineIndentation;
    if (cursorLineIndentation > 0)
      // Special case handling for the cursor being at end of a logical block already - in this case
      // we want to proceed with the level of the next logical block indentation. There might be empty
      // lines which we want to ignore so we loop and break if we find a line that is indented the same
      // or more
      for (
        let i = position.line + 1;
        i < lineCount && nextLogicalLineIndentation === undefined;
        ++i
      ) {
        const lineText = document.lineAt(i).text;
        // Ignore lines that are entirely empty
        if (lineText.trim() === '') continue;
        const indentDepth = getIndentDepth(lineText);
        if (indentDepth >= cursorLineIndentation) break;
        nextLogicalLineIndentation = indentDepth;
      }
    const startLineIndentation =
      nextLogicalLineIndentation === undefined ? cursorLineIndentation : nextLogicalLineIndentation;
    for (let i = position.line + 1; i < lineCount; ++i) {
      const lineText = document.lineAt(i).text;

      // Ignore lines that are entirely empty
      if (lineText.trim() === '') continue;

      const currentLineIndentation = getIndentDepth(lineText);

      if (currentLineIndentation < startLineIndentation) {
        return new Position(i - 1, startLineIndentation);
      }
    }

    return position;
  }
}

@RegisterAction
export class IndentwiseBlockScopeBoundaryBegin extends BaseMovement {
  keys = [['[', '%']];
  override isJump = true;

  public override async execAction(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    if (!this.isRepeat) {
      vimState.lastSemicolonRepeatableMovement = new IndentwiseBlockScopeBoundaryBegin(
        this.keysPressed,
        true
      );
      vimState.lastCommaRepeatableMovement = new IndentwiseBlockScopeBoundaryEnd(
        this.keysPressed,
        true
      );
    }

    const document = vimState.document;
    const cursorLine = document.lineAt(position.line);
    const cursorLineIndentation = getIndentDepth(cursorLine.text);
    let nextLogicalLineIndentation;
    if (cursorLineIndentation > 0)
      // Special case handling for the cursor being at end of a logical block already - in this case
      // we want to proceed with the level of the next logical block indentation. There might be empty
      // lines which we want to ignore so we loop and break if we find a line that is indented the same
      // or more
      for (let i = position.line - 1; i > 0 && nextLogicalLineIndentation === undefined; --i) {
        const lineText = document.lineAt(i).text;
        // Ignore lines that are entirely empty
        if (lineText.trim() === '') continue;
        const indentDepth = getIndentDepth(lineText);
        if (indentDepth >= cursorLineIndentation) break;
        nextLogicalLineIndentation = indentDepth;
      }
    const startLineIndentation =
      nextLogicalLineIndentation === undefined ? cursorLineIndentation : nextLogicalLineIndentation;
    for (let i = position.line - 1; i >= 0; --i) {
      const lineText = document.lineAt(i).text;

      // Ignore lines that are entirely empty
      if (lineText.trim() === '') continue;

      const currentLineIndentation = getIndentDepth(lineText);

      if (currentLineIndentation < startLineIndentation) {
        return new Position(i + 1, startLineIndentation);
      }
    }

    return position;
  }
}
