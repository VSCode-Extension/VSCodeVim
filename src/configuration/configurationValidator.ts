import * as vscode from 'vscode';
import * as fs from 'fs';
import { IKeyRemapping } from './iconfiguration';
import { ConfigurationError } from './configurationError';
import { promisify } from 'util';

class ConfigurationValidator {
  private _commandMap: Map<string, boolean>;

  public async isCommandValid(command: string): Promise<boolean> {
    if (command.startsWith(':')) {
      return true;
    }

    return (await this.getCommandMap()).has(command);
  }

  public async isNeovimValid(
    isNeovimEnabled: boolean,
    neovimPath: string
  ): Promise<ConfigurationError[]> {
    if (isNeovimEnabled) {
      try {
        const stat = await promisify(fs.stat)(neovimPath);
        if (!stat.isFile()) {
          return [
            {
              level: 'error',
              message: `Invalid neovimPath. Please configure full path to nvim binary.`,
            },
          ];
        }
      } catch (e) {
        return [{ level: 'error', message: `Invalid neovimPath. ${e.message}.` }];
      }
    }
    return [];
  }

  public async isRemappingValid(remapping: IKeyRemapping): Promise<ConfigurationError[]> {
    if (!remapping.after && !remapping.commands) {
      return [{ level: 'error', message: `${remapping.before} missing 'after' key or 'command'.` }];
    }

    if (remapping.commands) {
      for (const command of remapping.commands) {
        let cmd: string;

        if (typeof command === 'string') {
          cmd = command;
        } else {
          cmd = command.command;
        }

        if (!(await configurationValidator.isCommandValid(cmd))) {
          return [{ level: 'warning', message: `${cmd} does not exist.` }];
        }
      }
    }

    return [];
  }

  async getCommandMap(): Promise<Map<string, boolean>> {
    if (this._commandMap == null) {
      this._commandMap = new Map(
        (await vscode.commands.getCommands(true)).map(x => [x, true] as [string, boolean])
      );
    }
    return this._commandMap;
  }
}

export const configurationValidator = new ConfigurationValidator();
