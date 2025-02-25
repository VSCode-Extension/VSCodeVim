import { TextObject } from '../../../textobject/textobject';
import { RegisterAction } from '../../base';
import { VimState } from '../../../state/vimState';
import { failedMovement, IMovement } from '../../baseMotion';
import { Position } from 'vscode';
import { isVisualMode } from '../../../mode/mode';
import { separatorObjectsEnabled } from './targetsConfig';

abstract class SeparatorTextObjectMovement extends TextObject {
  protected abstract readonly separator: string;
  protected abstract includeLeadingSeparator: boolean;

  public override doesActionApply(vimState: VimState, keysPressed: string[]) {
    return super.doesActionApply(vimState, keysPressed) && separatorObjectsEnabled();
  }

  public override couldActionApply(vimState: VimState, keysPressed: string[]) {
    return super.couldActionApply(vimState, keysPressed) && separatorObjectsEnabled();
  }

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const res = this.matchSeparators(position, vimState);
    if (res === undefined) {
      return failedMovement(vimState);
    }

    let { start, stop } = res;

    stop = stop.translate({ characterDelta: -1 });
    if (!this.includeLeadingSeparator) {
      start = start.getRightThroughLineBreaks(false);
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
  }

  private matchSeparators(
    position: Position,
    vimState: VimState,
  ): { start: Position; stop: Position } | undefined {
    let start = this.getPrevTarget(position, vimState);
    let stop = this.getNextTarget(position, vimState);

    if (start === undefined && stop !== undefined) {
      start = stop;
      stop = this.getNextTarget(start, vimState);
    } else if (start !== undefined && stop === undefined) {
      stop = start;
      start = this.getPrevTarget(stop, vimState);
    }
    if (start === undefined || stop === undefined) {
      return undefined;
    }
    return {
      start,
      stop,
    };
  }

  private getPrevTarget(position: Position, vimState: VimState): Position | undefined {
    let lineText = vimState.document.lineAt(position).text;
    for (let i = position.character - 1; i >= 0; i--) {
      if (lineText[i] === this.separator) {
        return position.with({ character: i });
      }
    }

    // If opening character not found, search backwards across lines
    for (let line = position.line - 1; line >= 0; line--) {
      lineText = vimState.document.lineAt(line).text;
      const matchIndex = lineText.lastIndexOf(this.separator);
      if (matchIndex !== -1) {
        return position.with({ line, character: matchIndex });
      }
    }
    return undefined;
  }

  private getNextTarget(position: Position, vimState: VimState): Position | undefined {
    let lineText = vimState.document.lineAt(position).text;
    for (let i = position.character + 1; i < lineText.length; i++) {
      if (lineText[i] === this.separator) {
        return position.with({ character: i });
      }
    }

    // If closing character not found, search forwards across lines
    for (let line = position.line + 1; line < vimState.document.lineCount; line++) {
      lineText = vimState.document.lineAt(line).text;
      const matchIndex = lineText.indexOf(this.separator);
      if (matchIndex !== -1) {
        return position.with({ line, character: matchIndex });
      }
    }
    return undefined;
  }
}

@RegisterAction
class SelectInsideComma extends SeparatorTextObjectMovement {
  keys = ['i', ','];
  readonly separator = ',';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundComma extends SeparatorTextObjectMovement {
  keys = ['a', ','];
  readonly separator = ',';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsidePeriod extends SeparatorTextObjectMovement {
  keys = ['i', '.'];
  readonly separator = '.';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundPeriod extends SeparatorTextObjectMovement {
  keys = ['a', '.'];
  readonly separator = '.';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideSemicolon extends SeparatorTextObjectMovement {
  keys = ['i', ';'];
  readonly separator = ';';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundSemicolon extends SeparatorTextObjectMovement {
  keys = ['a', ';'];
  readonly separator = ';';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideColon extends SeparatorTextObjectMovement {
  keys = ['i', ':'];
  readonly separator = ':';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundColon extends SeparatorTextObjectMovement {
  keys = ['a', ':'];
  readonly separator = ':';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsidePlus extends SeparatorTextObjectMovement {
  keys = ['i', '+'];
  readonly separator = '+';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundPlus extends SeparatorTextObjectMovement {
  keys = ['a', '+'];
  readonly separator = '+';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideMinus extends SeparatorTextObjectMovement {
  keys = ['i', '-'];
  readonly separator = '-';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundMinus extends SeparatorTextObjectMovement {
  keys = ['a', '-'];
  readonly separator = '-';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideEquals extends SeparatorTextObjectMovement {
  keys = ['i', '='];
  readonly separator = '=';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundEquals extends SeparatorTextObjectMovement {
  keys = ['a', '='];
  readonly separator = '=';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideTilde extends SeparatorTextObjectMovement {
  keys = ['i', '~'];
  readonly separator = '~';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundTilde extends SeparatorTextObjectMovement {
  keys = ['a', '~'];
  readonly separator = '~';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideUnderscore extends SeparatorTextObjectMovement {
  keys = ['i', '_'];
  readonly separator = '_';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundUnderscore extends SeparatorTextObjectMovement {
  keys = ['a', '_'];
  readonly separator = '_';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideAsterisk extends SeparatorTextObjectMovement {
  keys = ['i', '*'];
  readonly separator = '*';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundAsterisk extends SeparatorTextObjectMovement {
  keys = ['a', '*'];
  readonly separator = '*';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideHash extends SeparatorTextObjectMovement {
  keys = ['i', '#'];
  readonly separator = '#';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundHash extends SeparatorTextObjectMovement {
  keys = ['a', '#'];
  readonly separator = '#';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideSlash extends SeparatorTextObjectMovement {
  keys = ['i', '/'];
  readonly separator = '/';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundSlash extends SeparatorTextObjectMovement {
  keys = ['a', '/'];
  readonly separator = '/';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsidePipe extends SeparatorTextObjectMovement {
  keys = ['i', '|'];
  readonly separator = '|';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundPipe extends SeparatorTextObjectMovement {
  keys = ['a', '|'];
  readonly separator = '|';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideBackslash extends SeparatorTextObjectMovement {
  keys = ['i', '\\'];
  readonly separator = '\\';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundBackslash extends SeparatorTextObjectMovement {
  keys = ['a', '\\'];
  readonly separator = '\\';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideAmpersand extends SeparatorTextObjectMovement {
  keys = ['i', '&'];
  readonly separator = '&';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundAmpersand extends SeparatorTextObjectMovement {
  keys = ['a', '&'];
  readonly separator = '&';
  readonly includeLeadingSeparator = true;
}

@RegisterAction
class SelectInsideDollar extends SeparatorTextObjectMovement {
  keys = ['i', '$'];
  readonly separator = '$';
  readonly includeLeadingSeparator = false;
}

@RegisterAction
class SelectAroundDollar extends SeparatorTextObjectMovement {
  keys = ['a', '$'];
  readonly separator = '$';
  readonly includeLeadingSeparator = true;
}
