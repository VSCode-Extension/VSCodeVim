import { Position, Range } from 'vscode';

import { configuration } from '../configuration/configuration';
import { Pattern, SearchDirection, SearchOffset, searchStringParser } from '../vimscript/pattern';
import { VimState } from './vimState';

export type IndexedRange = {
  range: Range;
  index: number;
};

export type IndexedPosition = {
  pos: Position;
  index: number;
};

/**
 * @returns the least residue of n mod m in the range [0, m) if m > 0, or (m, 0] if m < 0
 */
function mod(n: number, m: number): number {
  return (m + (n % m)) % m;
}

/**
 * State involved with beginning a search (/).
 */
export class SearchState {
  constructor(
    direction: SearchDirection,
    startPosition: Position,
    searchString = '',
    { ignoreSmartcase = false } = {},
  ) {
    this._searchString = searchString;

    const result = searchStringParser({ direction, ignoreSmartcase }).parse(this._searchString);
    const { pattern, offset } = result.status
      ? result.value
      : { pattern: undefined, offset: undefined };
    this.pattern = pattern;
    this.offset = offset;

    this.cursorStartPosition = startPosition;
    this.ignoreSmartcase = ignoreSmartcase;
    this._nextMatchIndex = undefined;
  }

  private _searchString: string;
  public pattern?: Pattern;
  private offset?: SearchOffset;

  public readonly cursorStartPosition: Position;
  private _nextMatchIndex: number | undefined;

  public get nextMatchIndex(): number | undefined {
    return this._nextMatchIndex;
  }

  public get searchString(): string {
    return this._searchString;
  }
  public set searchString(str: string) {
    this._searchString = str;
    const result = searchStringParser({
      direction: this.direction,
      ignoreSmartcase: this.ignoreSmartcase,
    }).parse(str);
    const { pattern, offset } = result.status
      ? result.value
      : { pattern: undefined, offset: undefined };
    if (pattern?.patternString !== this.pattern?.patternString) {
      this.pattern = pattern;
      this.matchRanges.clear();
    }
    this.offset = offset;
  }

  public get direction(): SearchDirection {
    // TODO: Defaulting to forward is wrong - I think storing the direction in the pattern is a mistake
    return this.pattern?.direction ?? SearchDirection.Forward;
  }

  /**
   * Every range in the document that matches the search string.
   *
   * This might not be 100% complete - @see Pattern::MAX_SEARCH_RANGES
   */
  public getMatchRanges(vimState: VimState): Range[] {
    return this.recalculateSearchRanges(vimState);
  }
  private matchRanges: Map<string, { version: number; ranges: Range[] }> = new Map();

  /**
   * If true, an all-lowercase needle will not be treated as case-insensitive, even if smartcase is enabled.
   * This is used for [g]* and [g]#.
   */
  private readonly ignoreSmartcase: boolean;

  private recalculateSearchRanges(vimState: VimState): Range[] {
    if (this.searchString === '' || this.pattern === undefined) {
      return [];
    }

    const document = vimState.document;

    const cached = this.matchRanges.get(document.fileName);
    if (cached?.version === document.version) {
      return cached.ranges;
    }

    // TODO: It's weird to use the active selection for this...
    const matchRanges = this.pattern
      .allMatches(vimState, { fromPosition: vimState.editor.selection.active })
      .map((match) => match.range);

    this.matchRanges.set(document.fileName, {
      version: document.version,
      ranges: matchRanges,
    });

    return matchRanges;
  }

  /**
   * @returns The start of the next match range, after applying the search offset
   *
   * @see getNextSearchMatchRange for parameters
   */
  public getNextSearchMatchPosition(
    vimState: VimState,
    startPosition: Position,
    direction = SearchDirection.Forward,
    relativeIndex = 0,
  ): IndexedPosition | undefined {
    const nextMatch = this.getNextSearchMatchRange(
      vimState,
      startPosition,
      direction,
      relativeIndex,
    );
    if (nextMatch === undefined) {
      return undefined;
    }
    const { range, index } = nextMatch;
    this._nextMatchIndex = nextMatch.index;

    return { pos: this.offset ? this.offset.apply(range) : range.start, index };
  }

  /**
   * @returns The next match range from the given position and its rank in the document's matches, or undefined if none exists.
   * An optional index can be provided to target other matches relative to the next.
   *
   * @param direction If `SearchDirection.Backward`, this will search in the opposite of the pattern's direction
   *
   * @param relativeIndex Which match to return, relative to the next match. 0 (default) corresponds to the next match,
   * 1 corresponds to the match after next (in the given direction), -1 corresponds to the match before next, etc.
   *
   * NOTE: This method does not take the search offset into account
   */
  public getNextSearchMatchRange(
    vimState: VimState,
    fromPosition: Position,
    direction = SearchDirection.Forward,
    relativeIndex = 0,
  ): IndexedRange | undefined {
    const matchRanges = this.recalculateSearchRanges(vimState);

    if (matchRanges.length === 0) {
      return undefined;
    }

    const effectiveDirection = (direction * this.direction) as SearchDirection;
    let index: number | undefined;

    if (effectiveDirection === SearchDirection.Forward) {
      for (let i = 0; i < matchRanges.length; i++) {
        if (
          (this.offset?.apply(matchRanges[i]) ?? matchRanges[i].start).compareTo(fromPosition) > 0
        ) {
          index = i;
          break;
        }
      }
    } else {
      for (let i = matchRanges.length - 1; i >= 0; i--) {
        if (
          (this.offset?.apply(matchRanges[i]) ?? matchRanges[i].start).compareTo(fromPosition) < 0
        ) {
          index = i;
          break;
        }
      }
    }

    if (index === undefined) {
      // We've hit the top/bottom of the file. Wrap around if configured to do so, or return undefined.
      if (configuration.wrapscan) {
        index = effectiveDirection === SearchDirection.Forward ? 0 : matchRanges.length - 1;
      } else {
        return undefined;
      }
    }

    // index of the first match now stored in variable index.
    // Offsetting it by relativeIndex in the appropriate direction gets the index of the desired match.
    index += effectiveDirection * relativeIndex;

    if (0 <= index && index < matchRanges.length) {
      return { index, range: matchRanges[index] };
    }

    // We've hit the top/bottom of the file. Wrap around (possibly many times) if configured to do so, or return undefined
    if (configuration.wrapscan) {
      index = mod(index, matchRanges.length);
      return { index, range: matchRanges[index] };
    } else {
      return undefined;
    }
  }

  /**
   * @returns the match range which contains the given Position, or undefined if none exists
   */
  public findContainingMatchRange(vimState: VimState, pos: Position): IndexedRange | undefined {
    const matchRanges = this.recalculateSearchRanges(vimState);

    if (matchRanges.length === 0) {
      return undefined;
    }

    for (const [index, range] of matchRanges.entries()) {
      if (range.start.isBeforeOrEqual(pos) && range.end.isAfter(pos)) {
        return {
          range,
          index,
        };
      }
    }

    return undefined;
  }
}
