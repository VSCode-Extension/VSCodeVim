import * as vscode from 'vscode';

// eslint-disable-next-line id-denylist
import { Parser, alt, any, optWhitespace, seq, whitespace } from 'parsimmon';
import { Position } from 'vscode';
import { Register, RegisterMode } from '../../register/register';
import { VimState } from '../../state/vimState';
import { ExCommand } from '../../vimscript/exCommand';
import { LineRange } from '../../vimscript/lineRange';
import { numberParser } from '../../vimscript/parserUtils';

export interface IDeleteCommandArguments {
  register?: string;
  count?: number;
}

export class DeleteCommand extends ExCommand {
  // TODO: this is copy-pasted from `:y[ank]`
  public static readonly argParser: Parser<DeleteCommand> = optWhitespace.then(
    alt(
      numberParser.map((count) => {
        return { register: undefined, count };
      }),
      // eslint-disable-next-line id-denylist
      seq(any.fallback(undefined), whitespace.then(numberParser).fallback(undefined)).map(
        ([register, count]) => {
          return { register, count };
        },
      ),
    ).map(
      ({ register, count }) =>
        new DeleteCommand({
          register,
          count,
        }),
    ),
  );

  private readonly arguments: IDeleteCommandArguments;
  constructor(args: IDeleteCommandArguments) {
    super();
    this.arguments = args;
  }

  public override neovimCapable(): boolean {
    return true;
  }

  /**
   * Deletes text between `startLine` and `endLine`, inclusive.
   * Puts the cursor at the start of the line where the deleted range was.
   */
  private deleteRange(startLine: number, endLine: number, vimState: VimState): void {
    let start = new Position(startLine, 0);
    let end = new Position(endLine, 0).getLineEndIncludingEOL();

    if (endLine < vimState.document.lineCount - 1) {
      end = end.getRightThroughLineBreaks();
    } else if (startLine > 0) {
      start = start.getLeftThroughLineBreaks();
    }

    const range = new vscode.Range(start, end);
    const text = vimState.document
      .getText(range)
      // Remove leading or trailing newline
      .replace(/^\r?\n/, '')
      .replace(/\r?\n$/, '');

    vimState.recordedState.transformer.addTransformation({
      type: 'deleteRange',
      range: new vscode.Range(start, end),
      manuallySetCursorPositions: true,
    });
    vimState.cursorStopPosition = start.getLineBegin();

    if (this.arguments.register) {
      vimState.recordedState.registerName = this.arguments.register;
    }
    vimState.currentRegisterMode = RegisterMode.LineWise;
    Register.put(vimState, text, 0, true);
    // Put into kill ring
    vimState.historyTracker.yankToKillRing(text);
  }

  async execute(vimState: VimState): Promise<void> {
    const linesToRemove = this.arguments.count ?? 1;
    // :d[elete][cnt] removes [cnt] lines
    const startLine = vimState.cursorStartPosition.line;
    const endLine = startLine + (linesToRemove - 1);
    this.deleteRange(startLine, endLine, vimState);
  }

  override async executeWithRange(vimState: VimState, range: LineRange): Promise<void> {
    /**
     * If a [cnt] and [range] is specified (e.g. :.+2d3), :delete [cnt] is called from
     * the end of the [range].
     * Ex. if two lines are VisualLine highlighted, :<,>d3 will :d3
     * from the end of the selected lines.
     */
    const { start, end } = range.resolve(vimState);
    if (this.arguments.count) {
      vimState.cursorStartPosition = new Position(end, 0);
      await this.execute(vimState);
      return;
    }
    this.deleteRange(start, end, vimState);
  }
}
