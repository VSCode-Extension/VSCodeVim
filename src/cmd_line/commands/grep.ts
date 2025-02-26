import { VimState } from '../../state/vimState';
import { ExCommand } from '../../vimscript/exCommand';
import { optWhitespace, Parser, regex } from 'parsimmon';
import * as vscode from 'vscode';

export class GrepCommand extends ExCommand {
  public static readonly argParser: Parser<GrepCommand> = optWhitespace
    .then(regex(/.*/))
    .map((pattern) => new GrepCommand(pattern.trim()));

  private pattern: string;
  private constructor(pattern: string) {
    super();
    this.pattern = pattern;
  }

  async execute(vimState: VimState): Promise<void> {
    vscode.commands.executeCommand('workbench.action.findInFiles', {
      query: this.pattern,
      triggerSearch: true,
    });
  }
}
