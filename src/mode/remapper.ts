import * as vscode from 'vscode';
import * as _ from 'lodash';
import { ModeName } from './mode';
import { ModeHandler, VimState } from './modeHandler';
import { AngleBracketNotation } from './../notation';

interface IKeybinding {
  before   : string[];
  after?   : string[];
  commands?: { command: string; args: any[] }[];
}

class Remapper {
  private _remappings: IKeybinding[] = [];

  /**
   * Modes that this Remapper is active for.
   */
  private _remappedModes: ModeName[];
  private _recursive: boolean;

  constructor(configKey: string, remappedModes: ModeName[], recursive: boolean) {
    this._recursive = recursive;
    this._remappedModes = remappedModes;

    let remappings = vscode.workspace.getConfiguration('vim')
      .get<IKeybinding[]>(configKey, []);

    for (let remapping of remappings) {
      let before: string[] = [];
      remapping.before.forEach(item => before.push(AngleBracketNotation.Normalize(item)));

      let after: string[] = [];
      if (remapping.after) {
        remapping.after.forEach(item => after.push(AngleBracketNotation.Normalize(item)));
      }

      this._remappings.push(<IKeybinding> {
        before: before,
        after: after,
        commands: remapping.commands,
      });
    }
  }

  private _longestKeySequence(): number {
    if (this._remappings.length > 0) {
      return _.maxBy(this._remappings, map => map.before.length).before.length;
    } else {
      return 1;
    }
  }

  public async sendKey(keys: string[], modeHandler: ModeHandler, vimState: VimState): Promise<boolean> {
    if (this._remappedModes.indexOf(vimState.currentMode) === -1) {
      return false;
    }

    const longestKeySequence = this._longestKeySequence();

    let remapping: IKeybinding | undefined;

    /**
     * Check to see if the keystrokes match any user-specified remapping.
     *
     * In non-Insert mode, we have to precisely match the entire keysequence,
     * but in insert mode, we allow the users to precede the remapped command
     * with extraneous keystrokes ("hello world jj")
     */

    if (this._remappedModes.indexOf(ModeName.Insert) === -1) {
      remapping = _.find(this._remappings, map => {
        return map.before.join("") === keys.join("");
      });
    } else {
      for (let sliceLength = 1; sliceLength <= longestKeySequence; sliceLength++) {
        const slice = keys.slice(-sliceLength);
        const result = _.find(this._remappings, map => map.before.join("") === slice.join(""));

        if (result) {
          remapping = result;

          break;
        }
      }
    }

    if (remapping) {
      // If we remapped e.g. jj to esc, we have to revert the inserted "jj"

      if (this._remappedModes.indexOf(ModeName.Insert) >= 0) {
        // Revert every single inserted character. This is actually a bit of
        // a hack since we aren't guaranteed that each insertion inserted
        // only a single character.

        // We subtract 1 because we haven't actually applied the last key.

        // TODO(johnfn) - study - actions need to be paired up with text
        // changes... this is a complicated problem.

        await vimState.historyTracker.undoAndRemoveChanges(
          Math.max(0, (remapping.before.length - 1) * vimState.allCursors.length));
      }

      vimState.isCurrentlyPerformingRemapping = false;

      // We need to remove the keys that were remapped into different keys
      // from the state.
      const numToRemove = remapping.before.length - 1;
      vimState.recordedState.actionKeys = vimState.recordedState.actionKeys.slice(0, -numToRemove);

      if (remapping.after) {
        await modeHandler.handleMultipleKeyEvents(remapping.after);
      }

      if (remapping.commands) {
        for (const command of remapping.commands) {
          await vscode.commands.executeCommand(command.command, command.args);
        }
      }

      vimState.isCurrentlyPerformingRemapping = false;

      return true;
    }

    return false;
  }
}

export class InsertModeRemapper extends Remapper {
  constructor(recursive: boolean) {
    super(
      "insertModeKeyBindings" + (recursive ? "" : "NonRecursive"),
      [ModeName.Insert],
      recursive
    );
  }
}

export class OtherModesRemapper extends Remapper {
  constructor(recursive: boolean) {
    super(
      "otherModesKeyBindings" + (recursive ? "" : "NonRecursive"),
      [ModeName.Normal, ModeName.Visual, ModeName.VisualLine],
      recursive
    );
  }
}

