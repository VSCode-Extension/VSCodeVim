import * as vscode from 'vscode';

import { VimState } from '../../state/vimState';
import { Position } from 'vscode';
import { configuration } from '../../configuration/configuration';

export type Pairing = {
  match: string;
  isNextMatchForward: boolean;
  directionless?: boolean;
};

/**
 * PairMatcher finds the position matching the given character, respecting nested
 * instances of the pair.
 */
export class PairMatcher {
  static pairings: {
    [key: string]: Pairing;
  } = {
    '(': { match: ')', isNextMatchForward: true },
    '{': { match: '}', isNextMatchForward: true },
    '[': { match: ']', isNextMatchForward: true },
    ')': { match: '(', isNextMatchForward: false },
    '}': { match: '{', isNextMatchForward: false },
    ']': { match: '[', isNextMatchForward: false },

    // These characters can't be used for "%"-based matching, but are still
    // useful for text objects.
    // matchesWithPercentageMotion can be overwritten with configuration.matchpairs
    '<': { match: '>', isNextMatchForward: true },
    '>': { match: '<', isNextMatchForward: false },
    // These are useful for deleting closing and opening quotes, but don't seem to negatively
    // affect how text objects such as `ci"` work, which was my worry.
    '"': { match: '"', isNextMatchForward: false, directionless: true },
    "'": { match: "'", isNextMatchForward: false, directionless: true },
    '`': { match: '`', isNextMatchForward: false, directionless: true },
  };

  private static findPairedChar(
    position: Position,
    charToFind: string,
    charToStack: string,
    stackHeight: number,
    isNextMatchForward: boolean,
    vimState: VimState,
    allowCurrentPosition: boolean,
  ): Position | undefined {
    let lineNumber = position.line;
    const linePosition = position.character;
    const lineCount = vimState.document.lineCount;
    const cursorChar = vimState.document.lineAt(position).text[position.character];
    if (
      allowCurrentPosition &&
      vimState.cursorStartPosition.isEqual(vimState.cursorStopPosition) &&
      cursorChar === charToFind
    ) {
      return position;
    }

    while (PairMatcher.keepSearching(lineNumber, lineCount, isNextMatchForward)) {
      let lineText = vimState.document.lineAt(lineNumber).text.split('');
      const originalLineLength = lineText.length;
      if (lineNumber === position.line) {
        if (isNextMatchForward) {
          lineText = lineText.slice(linePosition + 1, originalLineLength);
        } else {
          lineText = lineText.slice(0, linePosition);
        }
      }

      while (true) {
        if (lineText.length <= 0 || stackHeight <= -1) {
          break;
        }

        let nextChar: string | undefined;
        if (isNextMatchForward) {
          nextChar = lineText.shift();
        } else {
          nextChar = lineText.pop();
        }

        if (nextChar === charToStack) {
          stackHeight++;
        } else if (nextChar === charToFind) {
          stackHeight--;
        } else {
          continue;
        }
      }

      if (stackHeight <= -1) {
        let pairMemberChar: number;
        if (isNextMatchForward) {
          pairMemberChar = Math.max(0, originalLineLength - lineText.length - 1);
        } else {
          pairMemberChar = lineText.length;
        }
        return new Position(lineNumber, pairMemberChar);
      }

      if (isNextMatchForward) {
        lineNumber++;
      } else {
        lineNumber--;
      }
    }
    return undefined;
  }

  private static keepSearching(lineNumber: number, lineCount: number, isNextMatchForward: boolean) {
    if (isNextMatchForward) {
      return lineNumber <= lineCount - 1;
    } else {
      return lineNumber >= 0;
    }
  }

  static getPercentPairing(char: string): Pairing | undefined {
    for (const pairing of configuration.matchpairs.split(',')) {
      const components = pairing.split(':');
      if (components.length === 2) {
        if (components[0] === char) {
          return {
            match: components[1],
            isNextMatchForward: true,
          };
        } else if (components[1] === char) {
          return {
            match: components[0],
            isNextMatchForward: false,
          };
        }
      }
    }
    return undefined;
  }

  static async nextPairedChar(
    position: Position,
    charToMatch: string,
    vimState: VimState,
    allowCurrentPosition: boolean,
  ): Promise<Position | undefined> {
    /**
     * We do a fairly basic implementation that only tracks the state of the type of
     * character you're over and its pair (e.g. "[" and "]"). This is similar to
     * what Vim does.
     *
     * It can't handle strings very well - something like "|( ')' )" where | is the
     * cursor will cause it to go to the ) in the quotes, even though it should skip over it.
     *
     * PRs welcomed! (TODO)
     * Though ideally VSC implements https://github.com/Microsoft/vscode/issues/7177
     */

    // VSCode ctrl+shift+p Go to Bracket
    if (charToMatch === '{' || charToMatch === '}') {
      // vscode.window.showInformationMessage("try nextpairedchar jumpt to bracket");
      const editor = vscode.window.activeTextEditor;
      const oldSelection = editor?.selection;
      if (oldSelection && oldSelection.isEmpty) {
        await vscode.commands.executeCommand('editor.action.jumpToBracket');

        // return new cursor position
        return editor?.selection.active;
      } else {
        // If there is a selection, editor.action.jumpToBracket doesn't move and clear the selection
        // We need to save the selection anchor and active, move the cursor, and re-apply the correct selection.
        // If we try to do it here, vscode cursor and vim cursor are conflicting
      }
    }

    const pairing = this.pairings[charToMatch];

    if (pairing === undefined || pairing.directionless) {
      return undefined;
    }

    const stackHeight = 0;
    const charToFind = pairing.match;
    const charToStack = charToMatch;

    return PairMatcher.findPairedChar(
      position,
      charToFind,
      charToStack,
      stackHeight,
      pairing.isNextMatchForward,
      vimState,
      allowCurrentPosition,
    );
  }
}
