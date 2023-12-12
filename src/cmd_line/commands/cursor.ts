import { escapeRegExp } from 'lodash';
import { optWhitespace, Parser, seq, string, whitespace, eof } from 'parsimmon';
import { Position } from 'vscode';
import { Cursor } from '../../common/motion/cursor';
import { isVisualMode, Mode } from '../../mode/mode';
import { VimState } from '../../state/vimState';
import { TextEditor } from '../../textEditor';
import { ExCommand } from '../../vimscript/exCommand';
import { LineRange } from '../../vimscript/lineRange';
import { numberParser } from '../../vimscript/parserUtils';
import {
  Pattern,
  PatternMatch,
  SearchDirection,
  searchStringParser,
} from '../../vimscript/pattern';

export class CursorCommand extends ExCommand {
  public static readonly CURSOR_HERE = '\\#';
  private static readonly CURSOR_LOCATION_REGEX = '(?:VSCodeVimCursor){0}';
  public override isRepeatableWithDot: boolean = false;
  private readonly count: number | undefined; // undefined mean all matches.
  private readonly pattern: Pattern | undefined; // undefined mean use current word/selection as pattern
  public static readonly argParser: Parser<CursorCommand> = optWhitespace
    .then(
      seq(
        numberParser.skip(whitespace.or(eof)).fallback(-1),
        Pattern.parser({
          direction: SearchDirection.Forward,
          additionalParsers: [
            string(CursorCommand.CURSOR_HERE).map(() => CursorCommand.CURSOR_LOCATION_REGEX),
          ],
        })
          .map((p) => (p.patternString.length === 0 ? undefined : p))
          .fallback(undefined) // fallback to undefined if pattern is empty, so we can use current word/selection as pattern
      )
    )
    .map(([c, sp]) => new CursorCommand(c, sp));

  constructor(count: number, pattern: Pattern | undefined) {
    super();
    this.count = count === -1 ? undefined : count;
    this.pattern = pattern;
  }

  cursorFromMatches(matches: PatternMatch[], pattern: Pattern): Cursor[] {
    const matchToPosition = pattern.patternString.includes(CursorCommand.CURSOR_LOCATION_REGEX)
      ? (match: PatternMatch): Position[] => {
          const groupBetweenCursorRegex = new RegExp(
            pattern.patternString
              .split(CursorCommand.CURSOR_LOCATION_REGEX)
              .slice(undefined, -1)
              .map((s) => `(${s})`)
              .join('')
          );
          const groupedMatches = groupBetweenCursorRegex.exec(match.groups[0]);
          const cursorPositions =
            groupedMatches?.slice(1).reduce((acc: Position[], v): Position[] => {
              const pos = acc[acc.length - 1] ?? match.range.start;
              return [...acc, pos.advancePositionByText(v)];
            }, []) ?? [];
          return cursorPositions;
        }
      : (match: PatternMatch): Position[] => {
          return [match.range.start];
        };

    return matches.flatMap(matchToPosition).map((p) => new Cursor(p, p));
  }

  async execute(vimState: VimState): Promise<void> {
    const pattern = this.pattern ?? patternFromCurrentSelection(vimState);
    const allMatches = pattern.allMatches(vimState, {
      fromPosition: vimState.editor.selection.active,
      maxResults: this.count,
    });
    vimState.cursors = this.cursorFromMatches(allMatches, pattern);
  }

  override async executeWithRange(vimState: VimState, range: LineRange): Promise<void> {
    const pattern = this.pattern ?? patternFromCurrentSelection(vimState);
    const allMatchesArgs = this.pattern
      ? { lineRange: range, maxResults: this.count } // range is used for search RANGE
      : { fromPosition: vimState.editor.selection.start, maxResults: this.count }; // range is used for search PATTERN
    const allMatches = pattern.allMatches(vimState, allMatchesArgs);
    vimState.cursors = this.cursorFromMatches(allMatches, pattern);
  }
}

function patternFromCurrentSelection(vimState: VimState): Pattern {
  // adapted from actions/commands/search.ts, that's why it's messy
  let needle: string;
  let isExact: boolean;
  if (
    vimState.currentMode === Mode.CommandlineInProgress && // should always be true
    'commandLine' in vimState.modeData && // should always be true, given the previous line
    isVisualMode(vimState.modeData.commandLine.previousMode) // the only interesting part of the condition
  ) {
    needle = vimState.document.getText(vimState.editor.selection);
    isExact = false;
  } else {
    isExact = true;
    let currentWord = TextEditor.getWord(vimState.document, vimState.editor.selection.active);
    if (currentWord === undefined) {
      throw new Error('No word under cursor');
    }
    if (/\W/.test(currentWord[0]) || /\W/.test(currentWord[currentWord.length - 1])) {
      // TODO: this kind of sucks. JS regex does not consider the boundary between a special
      // character and whitespace to be a "word boundary", so we can't easily do an exact search.
      isExact = false;
    }

    if (isExact) {
      currentWord = escapeRegExp(currentWord);
    }
    needle = currentWord;
  }

  const escapedNeedle = escapeRegExp(needle).replace('/', '\\/');
  const searchString = isExact ? `\\<${escapedNeedle}\\>` : escapedNeedle;
  const result = searchStringParser({
    direction: SearchDirection.Forward,
    ignoreSmartcase: true,
  }).parse(searchString);
  const { pattern, offset } = result.status
    ? result.value
    : { pattern: undefined, offset: undefined };

  if (pattern === undefined) {
    // TODO: improve error handling
    throw new Error('No pattern');
  }

  return pattern;
}
