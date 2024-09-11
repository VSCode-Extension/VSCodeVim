import { SelectArgument } from '../../../textobject/textobject';
import { Position } from 'vscode';
import { isVisualMode } from '../../../mode/mode';
import { VimState } from '../../../state/vimState';
import { Logger } from '../../../util/logger';
import { BaseMovement, failedMovement, IMovement } from '../../baseMotion';
import { MoveInsideCharacter } from '../../motion';
import { searchPosition } from './searchUtils';
import { bracketObjectsEnabled } from './targetsConfig';

/*
 * This function creates a last/next movement based on an existing one.
 * It works by searching for a next/last character, and then applying the given action in its position.
 * For examples of how to use it, see src/actions/plugins/targets/lastNextObjects.ts.
 */
function LastNextObject<T extends MoveInsideCharacter>(type: new () => T, which: 'l' | 'n') {
  abstract class NextHandlerClass extends BaseMovement {
    public override readonly keys: readonly string[] | readonly string[][];
    override isJump = true;

    // actual action (e.g. `i(` )
    private readonly actual: T;
    readonly secondKey: 'l' | 'n' = which;
    // character to search forward/backward for next/last (e.g. `(` for next parenthesis)
    abstract readonly charToFind: string;
    // this is just to make sure we won't register anything that we can't handle. see constructor.
    readonly valid: boolean;

    public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
      return this.valid && bracketObjectsEnabled() && super.doesActionApply(vimState, keysPressed);
    }

    constructor() {
      super();
      this.actual = new type();

      const secondKey = this.secondKey;
      const withWhichKey = (keys: string[]): string[] | undefined => {
        if (keys.length === 2) {
          return [keys[0], secondKey, keys[1]];
        } else {
          return undefined;
        }
      };

      // we want fail without throwing an exception, but with log, to not break the Vim
      const errMsg = `failed to register ${which === 'l' ? 'last' : 'next'} for ${type.name}`;
      // failed, but it should never happen
      if (this.actual.keys.length < 1) {
        this.valid = false;
        this.keys = [];
        Logger.error(errMsg);
        return;
      }
      if (typeof this.actual.keys[0] === 'string') {
        const keys = withWhichKey(this.actual.keys as string[]);
        // failed
        if (keys === undefined) {
          this.valid = false;
          this.keys = [];
          Logger.error(errMsg);
          return;
        } else {
          this.keys = keys;
        }
      } else {
        const keys = this.actual.keys.map((k) => withWhichKey(k as string[]));
        // failed
        if (!keys.every((p) => p !== undefined)) {
          this.valid = false;
          this.keys = [];
          Logger.error(errMsg);
          return;
        } else {
          this.keys = keys;
        }
      }
      this.valid = true;
    }

    public override async execAction(
      position: Position,
      vimState: VimState,
      firstIteration: boolean,
      lastIteration: boolean,
    ): Promise<IMovement> {
      const maybePosition = searchPosition(this.charToFind, vimState.document, position, {
        direction: which === 'l' ? '<' : '>',
        includeCursor: false,
        throughLineBreaks: true,
      });
      if (maybePosition === undefined) {
        return failedMovement(vimState);
      }
      vimState.cursorStartPosition = maybePosition;
      vimState.cursorStopPosition = maybePosition;
      const movement = await this.actual.execAction(
        maybePosition,
        vimState,
        firstIteration,
        lastIteration,
      );
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
    }
  }
  return NextHandlerClass;
}

export function LastObject<T extends MoveInsideCharacter>(type: new () => T) {
  return LastNextObject(type, 'l');
}
export function NextObject<T extends MoveInsideCharacter>(type: new () => T) {
  return LastNextObject(type, 'n');
}

function LastNextArgument<T extends SelectArgument>(type: new () => T, which: 'l' | 'n') {
  abstract class NextHandlerClass extends BaseMovement {
    public override readonly keys: readonly string[] | readonly string[][];
    override isJump = true;

    // actual action (e.g. `i(` )
    private readonly actual: T;
    readonly secondKey: 'l' | 'n' = which;
    // characters to search forward/backward for next/last
    // This is assumed to be separators ++ opening or closing (depending on the direction)
    abstract readonly charsToFind: string[];
    // this is just to make sure we won't register anything that we can't handle. see constructor.
    readonly valid: boolean;

    public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
      return this.valid && bracketObjectsEnabled() && super.doesActionApply(vimState, keysPressed);
    }

    constructor() {
      super();
      this.actual = new type();
      const logger = Logger.get(`${this.secondKey} Handler for ${type.name}`);

      const secondKey = this.secondKey;
      const withWhichKey = (keys: string[]): string[] | undefined => {
        if (keys.length === 2) {
          return [keys[0], secondKey, keys[1]];
        } else {
          return undefined;
        }
      };

      // we want fail without throwing an exception, but with log, to not break the Vim
      const errMsg = `failed to register ${which === 'l' ? 'last' : 'next'} for ${type.name}`;
      // failed, but it should never happen
      if (this.actual.keys.length < 1) {
        this.valid = false;
        this.keys = [];
        logger.error(errMsg);
        return;
      }
      if (typeof this.actual.keys[0] === 'string') {
        const keys = withWhichKey(this.actual.keys as string[]);
        // failed
        if (keys === undefined) {
          this.valid = false;
          this.keys = [];
          logger.error(errMsg);
          return;
        } else {
          this.keys = keys;
        }
      } else {
        const keys = this.actual.keys.map((k) => withWhichKey(k as string[]));
        // failed
        if (!keys.every((p) => p !== undefined)) {
          this.valid = false;
          this.keys = [];
          logger.error(errMsg);
          return;
        } else {
          this.keys = keys as string[][];
        }
      }
      this.valid = true;
    }

    public override async execAction(position: Position, vimState: VimState): Promise<IMovement> {
      const logger = Logger.get('LastNextArgument');
      let maybePosition;

      // Get the nearest char possible
      // TODO: Can be optimized to find the nearest char in one run
      // But it requires massive refactoring or code duplication
      for (const char of this.charsToFind) {
        const foundPosition = searchPosition(char, vimState.document, position, {
          direction: which === 'l' ? '<' : '>',
          includeCursor: false,
          throughLineBreaks: true,
        });
        if (!maybePosition) {
          maybePosition = foundPosition;
        } else if (foundPosition) {
          if (
            which === 'l'
              ? foundPosition.compareTo(maybePosition) > 0
              : foundPosition.compareTo(maybePosition) < 0
          )
            maybePosition = foundPosition;
        }
      }
      if (maybePosition === undefined) {
        return failedMovement(vimState);
      }

      // If we are searching backwards, We cannot just grab the delimiter and call it a day (like in the LastNextObject)
      // because SelectArgument textobject will assume it to be the delimiter BEFORE the argument.
      // In practice, we first find the delimiter like before, and advance to the left exactly 1 char to reach into the argument.
      if (which === 'l') {
        maybePosition = maybePosition.getLeftThroughLineBreaks(true);
      }

      vimState.cursorStartPosition = maybePosition;
      vimState.cursorStopPosition = maybePosition;
      const movement = await this.actual.execAction(maybePosition, vimState);
      if (movement.failed) {
        return movement;
      }
      let { start, stop } = movement;

      // Expand stop position to compensate for margin right
      if (!isVisualMode(vimState.currentMode)) {
        stop = stop.getRightThroughLineBreaks(true);
      }

      if (!isVisualMode(vimState.currentMode) && position.isBefore(start)) {
        vimState.recordedState.operatorPositionDiff = start.subtract(position);
      } else if (!isVisualMode(vimState.currentMode) && position.isAfter(stop)) {
        if (position.line === stop.line) {
          vimState.recordedState.operatorPositionDiff = stop.subtract(position);
        } else {
          vimState.recordedState.operatorPositionDiff = start.subtract(position);
        }
      }

      logger.debug(`----End of LastNextArgument Execution----`);
      logger.debug(`cursorPositions: start ${start}, stop ${stop}`);
      logger.debug(`operatorPositionDiff: ${vimState.recordedState.operatorPositionDiff}`);

      return { start, stop };
    }
  }
  return NextHandlerClass;
}

export function LastArgument<T extends SelectArgument>(type: new () => T) {
  return LastNextArgument(type, 'l');
}

export function NextArgument<T extends SelectArgument>(type: new () => T) {
  return LastNextArgument(type, 'n');
}
