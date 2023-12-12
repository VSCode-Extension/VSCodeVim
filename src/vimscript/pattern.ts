import { alt, any, lazy, noneOf, oneOf, Parser, seq, string, seqMap, eof } from 'parsimmon';
import { Position, Range, TextDocument } from 'vscode';
import { configuration } from '../configuration/configuration';
import { VimState } from '../state/vimState';
import { TextEditor } from '../textEditor';
import { LineRange } from './lineRange';
import { numberParser } from './parserUtils';

export function searchStringParser(args: {
  direction: SearchDirection;
  ignoreSmartcase?: boolean;
}): Parser<{
  pattern: Pattern;
  offset: SearchOffset | undefined;
}> {
  return seq(
    Pattern.parser(args),
    lazy(() => SearchOffset.parser.fallback(undefined)),
  ).map(([pattern, offset]) => {
    return { pattern, offset };
  });
}

export enum SearchDirection {
  Forward = 1,
  Backward = -1,
}

export type PatternMatch = { range: Range; groups: string[] };

/**
 * See `:help pattern`
 *
 * TODO(#3996): Currently, this is a thin wrapper around JavaScript's regex engine.
 *              We should either re-implement Vim's regex engine from scratch or (more likely)
 *              implement a best-effort translation from Vim's syntax to JavaScript's.
 */
export class Pattern {
  public readonly patternString: string;
  public readonly direction: SearchDirection;
  public readonly regex: RegExp;
  public readonly ignorecase: boolean | undefined;
  public readonly inSelection: boolean;
  public readonly closed: boolean; // was an ending delimiter present?

  /** `true` if this pattern has an empty branch (/foo|/, for instance) */
  private readonly emptyBranch: boolean;

  private static readonly MAX_SEARCH_TIME = 1000;
  private static readonly SPECIAL_CHARS_REGEX = /[\-\[\]{}()*+?.,\\\^$|#\s]/g;

  public nextMatch(document: TextDocument, fromPosition: Position): Range | undefined {
    if (this.emptyBranch) {
      const pos = fromPosition.getRightThroughLineBreaks();
      return new Range(pos, pos);
    }
    const haystack = document.getText();
    this.regex.lastIndex = document.offsetAt(fromPosition) + 1;
    const match = this.regex.exec(haystack);
    return match
      ? new Range(document.positionAt(match.index), document.positionAt(match.index + match.length))
      : undefined;
  }

  /**
   * Every range in the document that matches the search string.
   *
   * This might not be 100% complete - @see Pattern::MAX_SEARCH_RANGES
   */
  public allMatches(
    vimState: VimState,
    args:
      | {
          fromPosition: Position;
          maxResults?: number;
        }
      | {
          lineRange: LineRange;
          maxResults?: number;
        },
  ): PatternMatch[] {
    if (this.emptyBranch) {
      // HACK: This pattern matches each character, but for purposes of perf when highlighting, merge them.
      return [
        {
          range: new Range(new Position(0, 0), TextEditor.getDocumentEnd(vimState.document)),
          groups: [],
        },
      ];
    }

    let fromPosition: Position;
    let lineRange:
      | {
          start: number;
          end: number;
        }
      | undefined;
    if ('lineRange' in args) {
      // TODO: We should be able to get away with only getting part of the document text in this case
      lineRange = args.lineRange.resolve(vimState);
      fromPosition = new Position(lineRange.start, 0);
    } else {
      fromPosition = args.fromPosition;
    }

    let haystack: string;
    let searchOffset: number;
    let startOffset: number;
    if (this.inSelection && vimState.lastVisualSelection) {
      // TODO: This is not exactly how Vim implements in-selection search (\%V), see :help \%V for more info.
      const searchRange = new Range(
        vimState.lastVisualSelection.start,
        vimState.lastVisualSelection.end,
      );
      haystack = vimState.document.getText(searchRange);
      searchOffset = vimState.document.offsetAt(vimState.lastVisualSelection.start);
      startOffset = searchRange.contains(fromPosition)
        ? vimState.document.offsetAt(fromPosition) - searchOffset
        : 0;
    } else {
      haystack = vimState.document.getText();
      searchOffset = 0;
      startOffset = vimState.document.offsetAt(fromPosition) - searchOffset;
    }

    this.regex.lastIndex = startOffset;

    const start = Date.now();

    const matchRanges = {
      beforeWrapping: [] as PatternMatch[],
      afterWrapping: [] as PatternMatch[],
    };
    let wrappedOver = false;
    while (true) {
      const match = this.regex.exec(haystack);

      if (match) {
        if (wrappedOver && match.index >= startOffset) {
          // We've found our first match again
          break;
        }

        const matchRange = new Range(
          vimState.document.positionAt(searchOffset + match.index),
          vimState.document.positionAt(searchOffset + match.index + match[0].length),
        );
        if (
          !this.inSelection &&
          lineRange &&
          (matchRange.start.line < lineRange.start || matchRange.end.line > lineRange.end)
        ) {
          break;
        }

        (wrappedOver ? matchRanges.afterWrapping : matchRanges.beforeWrapping).push({
          range: matchRange,
          groups: match,
        });

        if (
          args.maxResults !== undefined &&
          matchRanges.beforeWrapping.length + matchRanges.afterWrapping.length >= args.maxResults
        ) {
          break;
        }

        if (Date.now() - start > Pattern.MAX_SEARCH_TIME) {
          break;
        }

        // When we find a zero-length match, nudge the search position forward to avoid getting stuck
        if (matchRange.start.isEqual(matchRange.end)) {
          this.regex.lastIndex++;
        }
      } else if (!wrappedOver) {
        // We need to wrap around to the back if we reach the end.
        this.regex.lastIndex = 0;
        wrappedOver = true;
      } else {
        break;
      }
    }

    return matchRanges.afterWrapping.concat(matchRanges.beforeWrapping);
  }

  private static compileRegex(regexString: string, ignoreCase?: boolean): RegExp {
    const flags = ignoreCase ?? configuration.ignorecase ? 'gim' : 'gm';
    try {
      return new RegExp(regexString, flags);
    } catch (err) {
      // Couldn't compile the regexp, try again with special characters escaped
      return new RegExp(regexString.replace(Pattern.SPECIAL_CHARS_REGEX, '\\$&'), flags);
    }
  }

  public static parser(args: {
    direction: SearchDirection;
    ignoreSmartcase?: boolean;
    delimiter?: string;
    additionalParsers?: Array<Parser<string>>;
  }): Parser<Pattern> {
    const delimiter = args.delimiter
      ? args.delimiter
      : args.direction === SearchDirection.Forward
        ? '/'
        : '?';
    // TODO: Some escaped characters need special treatment
    return seqMap(
      string('|').result(true).fallback(false), // Leading | matches everything
      alt(
        ...(args.additionalParsers ?? []),
        string('\\%V').map((_) => ({ inSelection: true })),
        string('$').map(() => '(?:$(?<!\\r))'), // prevents matching \r\n as two lines
        string('^').map(() => '(?:^(?<!\\r))'), // prevents matching \r\n as two lines
        string('|')
          .then(eof)
          .map(() => ({ emptyBranch: true })), // Trailing | matches everything
        string('\\')
          .then(any.fallback(undefined))
          .map((escaped) => {
            if (escaped === undefined) {
              return '\\\\';
            } else if (escaped === delimiter) {
              return delimiter;
            } else if (escaped === 'c') {
              return { ignorecase: true };
            } else if (escaped === 'C') {
              return { ignorecase: false };
            } else if (escaped === '<' || escaped === '>') {
              // TODO: not QUITE the same
              return '\\b';
            } else if (escaped === 'n') {
              return '\\r?\\n';
            }
            return '\\' + escaped;
          }),
        alt(
          // Allow unescaped delimiter inside [], and don't transform ^ or $
          string('\\')
            .then(any.fallback(undefined))
            .map((escaped) => '\\' + (escaped ?? '\\')),
          noneOf(']'),
        )
          .many()
          .wrap(string('['), string(']'))
          .map((result) => '[' + result.join('') + ']'),
        noneOf(delimiter),
      ).many(),
      string(delimiter).fallback(undefined),
      (leadingBar, atoms, delim) => {
        let patternString = leadingBar ? '|' : '';
        let caseOverride: boolean | undefined;
        let inSelection: boolean | undefined;
        let emptyBranch: boolean = leadingBar;
        for (const atom of atoms) {
          if (typeof atom === 'string') {
            patternString += atom;
          } else {
            if (atom.emptyBranch) {
              emptyBranch = true;
              patternString += '|';
            } else if (atom.ignorecase) {
              caseOverride = true;
            } else if (atom.inSelection) {
              inSelection = atom.inSelection;
            } else if (caseOverride === undefined) {
              caseOverride = false;
            }
          }
        }
        return {
          patternString,
          caseOverride,
          inSelection,
          closed: delim !== undefined,
          emptyBranch,
        };
      },
    ).map(({ patternString, caseOverride, inSelection, closed, emptyBranch }) => {
      const ignoreCase = Pattern.getIgnoreCase(patternString, {
        caseOverride,
        ignoreSmartcase: args.ignoreSmartcase ?? false,
      });
      return new Pattern(
        patternString,
        args.direction,
        Pattern.compileRegex(patternString, ignoreCase),
        inSelection ?? false,
        closed,
        emptyBranch,
      );
    });
  }

  private static getIgnoreCase(
    patternString: string,
    flags: { caseOverride?: boolean; ignoreSmartcase: boolean },
  ): boolean {
    if (flags.caseOverride !== undefined) {
      return flags.caseOverride;
    } else if (configuration.smartcase && !flags.ignoreSmartcase && /[A-Z]/.test(patternString)) {
      return false;
    }
    return configuration.ignorecase;
  }

  private constructor(
    patternString: string,
    direction: SearchDirection,
    regex: RegExp,
    inSelection: boolean,
    closed: boolean,
    emptyBranch: boolean,
  ) {
    this.patternString = patternString;
    this.direction = direction;
    // TODO: Recalculate ignorecase if relevant config changes?
    this.regex = regex;
    this.inSelection = inSelection;
    this.closed = closed;
    this.emptyBranch = emptyBranch;
  }
}

type SearchOffsetData =
  | {
      type: 'lines' | 'chars_from_start' | 'chars_from_end';
      delta: number;
    }
  | {
      type: 'pattern';
      direction: SearchDirection;
      pattern: Pattern;
      offset?: SearchOffset;
    };

const searchOffsetTypeParser = oneOf('esb')
  .fallback(undefined)
  .map((esb) => {
    if (esb === undefined) {
      return 'lines';
    } else {
      return esb === 'e' ? 'chars_from_end' : 'chars_from_start';
    }
  });

/**
 * See `:help search-offset`
 */
export class SearchOffset {
  private readonly data: SearchOffsetData;

  public static parser: Parser<SearchOffset> = alt(
    seq(searchOffsetTypeParser, oneOf('+-').fallback('+'), numberParser).map(
      ([type, sign, num]) =>
        new SearchOffset({
          type,
          delta: sign === '-' ? -num : num,
        }),
    ),
    seq(searchOffsetTypeParser, oneOf('+-')).map(
      ([type, sign]) =>
        new SearchOffset({
          type,
          delta: sign === '-' ? -1 : 1,
        }),
    ),
    seq(searchOffsetTypeParser).map(([type]) => new SearchOffset({ type, delta: 0 })),
    string(';/')
      .then(searchStringParser({ direction: SearchDirection.Forward }))
      .map(({ pattern, offset }) => {
        return new SearchOffset({
          type: 'pattern',
          direction: SearchDirection.Forward,
          pattern,
          offset,
        });
      }),
    string(';?')
      .then(searchStringParser({ direction: SearchDirection.Backward }))
      .map(({ pattern, offset }) => {
        return new SearchOffset({
          type: 'pattern',
          direction: SearchDirection.Backward,
          pattern,
          offset,
        });
      }),
  );

  public constructor(data: SearchOffsetData) {
    this.data = data;
  }

  public apply(match: Range): Position {
    switch (this.data.type) {
      case 'lines':
        return this.data.delta === 0
          ? match.start
          : new Position(match.end.line + this.data.delta, 0);
      case 'chars_from_start':
        return match.start.getOffsetThroughLineBreaks(this.data.delta);
      case 'chars_from_end':
        return match.end.getOffsetThroughLineBreaks(this.data.delta - 1);
      case 'pattern': // TODO(#3919): Support `;` offset (`:help //;`)
      default:
        const guard: unknown = this.data;
        throw new Error('Unexpected SearchOffset type');
    }
  }
}
