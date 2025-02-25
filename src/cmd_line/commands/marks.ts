import { QuickPickItem, window } from 'vscode';

// eslint-disable-next-line id-denylist
import { Parser, alt, noneOf, optWhitespace, regexp, seq, string, whitespace } from 'parsimmon';
import { Cursor } from '../../common/motion/cursor';
import { ErrorCode, VimError } from '../../error';
import { IMark } from '../../history/historyTracker';
import { VimState } from '../../state/vimState';
import { ExCommand } from '../../vimscript/exCommand';

class MarkQuickPickItem implements QuickPickItem {
  mark: IMark;

  label: string;
  description: string;
  detail: string;
  picked = false;
  alwaysShow = false;

  constructor(vimState: VimState, mark: IMark) {
    this.mark = mark;
    this.label = mark.name;
    if (mark.document && mark.document !== vimState.document) {
      this.description = mark.document.fileName;
    } else {
      this.description = vimState.document.lineAt(mark.position).text.trim();
    }
    this.detail = `line ${mark.position.line} col ${mark.position.character}`;
  }
}

export class MarksCommand extends ExCommand {
  public static readonly argParser: Parser<MarksCommand> = optWhitespace
    .then(noneOf('|'))
    .many()
    .map((marks) => new MarksCommand(marks));

  private marksFilter: string[];
  constructor(marksFilter: string[]) {
    super();
    this.marksFilter = marksFilter;
  }

  async execute(vimState: VimState): Promise<void> {
    const quickPickItems: MarkQuickPickItem[] = vimState.historyTracker
      .getMarks()
      .filter((mark) => {
        return this.marksFilter.length === 0 || this.marksFilter.includes(mark.name);
      })
      .map((mark) => new MarkQuickPickItem(vimState, mark));

    if (quickPickItems.length > 0) {
      const item = await window.showQuickPick(quickPickItems, {
        canPickMany: false,
      });
      if (item) {
        vimState.cursors = [new Cursor(item.mark.position, item.mark.position)];
      }
    } else {
      void window.showInformationMessage('No marks set');
    }
  }
}

type DeleteMarksArgs = Array<{ start: string; end: string } | string> | '!';

export class DeleteMarksCommand extends ExCommand {
  public static readonly argParser: Parser<DeleteMarksCommand> = alt<DeleteMarksArgs>(
    string('!'),
    whitespace.then(
      optWhitespace
        .then(
          alt<{ start: string; end: string } | string>(
            seq(regexp(/[a-z]/).skip(string('-')), regexp(/[a-z]/)).map(([start, end]) => {
              return { start, end };
            }),
            seq(regexp(/[A-Z]/).skip(string('-')), regexp(/[A-Z]/)).map(([start, end]) => {
              return { start, end };
            }),
            seq(regexp(/[0-9]/).skip(string('-')), regexp(/[0-9]/)).map(([start, end]) => {
              return { start, end };
            }),
            noneOf('-'),
          ),
        )
        .many(),
    ),
  ).map((marks) => new DeleteMarksCommand(marks));

  private args: DeleteMarksArgs;
  constructor(args: DeleteMarksArgs) {
    super();
    this.args = args;
  }

  private static resolveMarkList(vimState: VimState, args: DeleteMarksArgs) {
    const asciiRange = (start: string, end: string) => {
      if (start > end) {
        throw VimError.fromCode(ErrorCode.InvalidArgument474);
      }

      const [asciiStart, asciiEnd] = [start.charCodeAt(0), end.charCodeAt(0)];

      const chars: string[] = [];
      for (let ascii = asciiStart; ascii <= asciiEnd; ascii++) {
        chars.push(String.fromCharCode(ascii));
      }
      return chars;
    };

    if (args === '!') {
      // TODO: clear change list
      return asciiRange('a', 'z');
    }

    const marks: string[] = [];
    for (const x of args) {
      if (typeof x === 'string') {
        marks.push(x);
      } else {
        const range = asciiRange(x.start, x.end);
        if (range === undefined) {
          throw VimError.fromCode(ErrorCode.InvalidArgument474);
        }
        marks.push(...range.concat());
      }
    }
    return marks;
  }

  async execute(vimState: VimState): Promise<void> {
    const marks = DeleteMarksCommand.resolveMarkList(vimState, this.args);
    vimState.historyTracker.removeMarks(marks);
  }
}

export class MarkCommand extends ExCommand {
  public static readonly argParser: Parser<MarkCommand> = seq(
    optWhitespace,
    regexp(/[a-zA-Z'`<>[\].]/).desc('mark name'),
    optWhitespace,
  ).map(([, markName]) => new MarkCommand(markName));

  private markName: string;
  constructor(markName: string) {
    super();
    this.markName = markName;
  }

  async execute(vimState: VimState): Promise<void> {
    const position = vimState.cursorStopPosition;
    vimState.historyTracker.addMark(vimState.document, position, this.markName);
  }
}
