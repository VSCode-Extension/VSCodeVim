import * as vscode from 'vscode';
import fs from 'fs';
import * as path from 'path';
import { ExCommand } from '../../vimscript/exCommand';
import { alt, letters, optWhitespace, Parser, regex } from 'parsimmon';
import { VimState } from '../../state/vimState';

// TODO: Add support for commands not enclosed in quotes (e.g. :help 'arabic' works, but :help arabic does not)
// TODO: Add support for files wihtout .txt (e.g. :help eidting.txt works, but :help editing does not)

// Load tags file into a map
function loadTags(): Map<string, [string, string]> {
  const tagsFile = path.join(__dirname, '/helpfiles/tags');
  const lines = fs.readFileSync(tagsFile, 'utf8').split('\n');
  const tagsMap = new Map<string, [string, string]>();

  for (const line of lines) {
    const [key, ...valueParts] = line.split('\t');
    if (key && valueParts.length > 0) {
      const fullValue = valueParts.join('\t').trimEnd();
      const [value1, value2 = ''] = fullValue.split('\t');
      tagsMap.set(key.trim(), [value1.trim(), value2.trim()]);
    }
  }
  return tagsMap;
}

const tags = loadTags();

interface CommandArguments {
  command: string;
}

export class HelpCommand extends ExCommand {
  private readonly arguments: CommandArguments;
  private currentTopic: string | undefined;
  private currentPattern: string | undefined;

  public static readonly argParser: Parser<HelpCommand> = optWhitespace
    .then(alt(regex(/[^\s]+/), letters))
    .map((command) => new HelpCommand({ command }));

  constructor(args: CommandArguments) {
    super();
    this.arguments = args;
  }

  public override neovimCapable(): boolean {
    return false;
  }

  private async showHelp(topic?: string, pattern?: string) {
    if (!topic) {
      topic = 'help.txt'; // Default to main help file
    }

    if (!pattern) {
      pattern = ''; // Default to no pattern
    }

    const filePath = path.join(__dirname, `/helpfiles/${topic}`);
    await this.showHelpContent(filePath, pattern);
  }

  private async showHelpContent(filePath: string, pattern: string) {
    const document = await vscode.workspace.openTextDocument(filePath);

    if (!pattern) {
      await vscode.window.showTextDocument(document, { preview: false });
      return;
    }

    // Remove the first character from the string regex pattern, it's always a '/' and messes up the RegExp constructor
    pattern = pattern.slice(1);
    const escapedPattern = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Escape special characters
    const patternRegex = new RegExp(escapedPattern);

    const text = document.getText();
    const lines = text.split('\n');
    let lineNumber = 0;

    // Look for the first instance of the pattern in the file
    for (let i = 0; i < lines.length; i++) {
      if (patternRegex.test(lines[i])) {
        lineNumber = i;
        break;
      }
    }

    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = new vscode.Position(lineNumber, 0);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
    editor.selection = new vscode.Selection(position, position);
  }

  async execute(vimState: VimState): Promise<void> {
    // Checks if there is a command and if it is in the tags file
    if (this.arguments.command && tags.has(this.arguments.command)) {
      const topicPattern = tags.get(this.arguments.command);
      this.currentTopic = topicPattern ? topicPattern[0] : '';
      this.currentPattern = topicPattern ? topicPattern[1] : '';
    } else if (!this.arguments.command) {
      // If no command is given, default to main help file at position 0
      this.currentTopic = 'help.txt';
      this.currentPattern = '';
    } else {
      this.currentTopic = '';
      this.currentPattern = '';
    }

    if (this.currentTopic) {
      await this.showHelp(this.currentTopic, this.currentPattern);
    } else {
      void vscode.window.showErrorMessage('Command not found');
    }
  }
}
