import { VimState } from '../../../state/vimState';
import { configuration } from './../../../configuration/configuration';
import { Mode, isVisualMode } from './../../../mode/mode';
import { RegisterAction, BaseCommand } from './../../base';
import { EasyMotion } from './easymotion';
import {
  EasyMotionCharMoveOpions,
  EasyMotionMoveOptionsBase,
  EasyMotionWordMoveOpions,
  EasyMotionSearchAction,
  Match,
  SearchOptions,
} from './types';
import { globalState } from '../../../state/globalState';
import { TextEditor } from '../../../textEditor';
import { MarkerGenerator } from './markerGenerator';
import { Position } from 'vscode';
import { getAndUpdateModeHandler } from '../../../../extensionBase';
import { Jump } from '../../../jumps/jump';

export interface EasymotionTrigger {
  key: string;
  leaderCount?: number;
}

export function buildTriggerKeys(trigger: EasymotionTrigger) {
  return [
    ...Array.from({ length: trigger.leaderCount || 2 }, () => '<leader>'),
    ...trigger.key.split(''),
  ];
}

abstract class BaseEasyMotionCommand extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];

  private _baseOptions: EasyMotionMoveOptionsBase;

  public abstract getMatches(position: Position, vimState: VimState): Match[];

  constructor(baseOptions: EasyMotionMoveOptionsBase) {
    super();
    this._baseOptions = baseOptions;
  }

  public abstract resolveMatchPosition(match: Match): Position;

  public processMarkers(
    matches: Match[],
    cursorPosition: Position,
    vimState: VimState,
    nextKeys: Set<string> = new Set<string>(),
  ) {
    // Clear existing markers, just in case
    vimState.easyMotion.clearMarkers();

    let index = 0;
    const markerGenerator = new MarkerGenerator(matches.length, nextKeys);
    for (const match of matches) {
      const matchPosition = this.resolveMatchPosition(match);
      // Skip if the match position equals to cursor position
      if (!matchPosition.isEqual(cursorPosition)) {
        const marker = markerGenerator.generateMarker(index++, matchPosition);
        if (marker) {
          vimState.easyMotion.addMarker(marker);
        }
      }
    }
  }

  protected searchOptions(position: Position, vimState: VimState): SearchOptions {
    let minPosition: Position | undefined;
    let maxPosition: Position | undefined;
    const visibleRange = vimState.editor.visibleRanges[0];
    if (visibleRange) {
      minPosition = visibleRange.start.getUp();
      maxPosition = visibleRange.end.getDown().getLineEnd();
    }
    switch (this._baseOptions.searchOptions) {
      case 'min':
        return { min: position, max: maxPosition };
      case 'max':
        return { min: minPosition, max: position };
      default:
        return { min: minPosition, max: maxPosition };
    }
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    // Only execute the action if the configuration is set
    if (configuration.easymotion) {
      // Search all occurences of the character pressed
      const matches = this.getMatches(position, vimState);

      // Stop if there are no matches
      if (matches.length > 0) {
        vimState.easyMotion = new EasyMotion();
        this.processMarkers(matches, position, vimState);

        if (matches.length === 1) {
          // Only one found, navigate to it
          const marker = vimState.easyMotion.markers[0];
          // Set cursor position based on marker entered
          vimState.cursorStopPosition = marker.position;
          vimState.easyMotion.clearDecorations(vimState.editor);
        } else {
          // Store mode to return to after performing easy motion
          vimState.easyMotion.previousMode = vimState.currentMode;
          // Enter the EasyMotion mode and await further keys
          await vimState.setCurrentMode(Mode.EasyMotionMode);
        }
      }
    }
  }
}

function getMatchesForString(
  position: Position,
  vimState: VimState,
  searchString: string,
  options?: SearchOptions,
): Match[] {
  switch (searchString) {
    case '':
      return [];
    case ' ':
      // Searching for space should only find the first space
      return vimState.easyMotion.sortedSearch(
        vimState.document,
        position,
        new RegExp(' {1,}', 'g'),
        options,
      );
    default:
      // Search all occurences of the character pressed

      // If the input is not a letter, treating it as regex can cause issues
      if (/[^a-zA-Z]/.test(searchString)) {
        return vimState.easyMotion.sortedSearch(vimState.document, position, searchString, options);
      }

      const ignorecase =
        configuration.ignorecase && !(configuration.smartcase && /[A-Z]/.test(searchString));
      const regexFlags = ignorecase ? 'gi' : 'g';
      return vimState.easyMotion.sortedSearch(
        vimState.document,
        position,
        new RegExp(searchString, regexFlags),
        options,
      );
  }
}

export class SearchByCharCommand extends BaseEasyMotionCommand implements EasyMotionSearchAction {
  keys = [];
  public searchString: string = '';
  private _options: EasyMotionCharMoveOpions;

  get searchCharCount() {
    return this._options.charCount;
  }

  constructor(options: EasyMotionCharMoveOpions) {
    super(options);
    this._options = options;
  }

  public getMatches(position: Position, vimState: VimState): Match[] {
    return getMatchesForString(
      position,
      vimState,
      this.searchString,
      this.searchOptions(position, vimState),
    );
  }

  public shouldFire() {
    const charCount = this._options.charCount;
    return charCount ? this.searchString.length >= charCount : true;
  }

  public async fire(position: Position, vimState: VimState): Promise<void> {
    await this.exec(position, vimState);
  }

  public resolveMatchPosition(match: Match): Position {
    const { line, character } = match.position;
    switch (this._options.labelPosition) {
      case 'after':
        return new Position(line, character + this._options.charCount);
      case 'before':
        return new Position(line, Math.max(0, character - 1));
      default:
        return match.position;
    }
  }
}

export class SearchByNCharCommand extends BaseEasyMotionCommand implements EasyMotionSearchAction {
  keys = [];
  public searchString: string = '';

  get searchCharCount() {
    return -1;
  }

  constructor() {
    super({});
  }

  public resolveMatchPosition(match: Match): Position {
    return match.position;
  }

  public getMatches(position: Position, vimState: VimState): Match[] {
    return getMatchesForString(
      position,
      vimState,
      this.removeTrailingLineBreak(this.searchString),
      this.searchOptions(position, vimState),
    );
  }

  private removeTrailingLineBreak(s: string) {
    return s.replace(new RegExp('\n+$', 'g'), '');
  }

  public shouldFire() {
    // Fire when <CR> typed
    return this.searchString.endsWith('\n');
  }

  public async fire(position: Position, vimState: VimState): Promise<void> {
    if (this.removeTrailingLineBreak(this.searchString) !== '') {
      await this.exec(position, vimState);
    }
  }
}

export class SearchAroundCommand extends SearchByNCharCommand {
  public override shouldFire() {
    return true;
  }

  private getNextKeys(matchs: Match[], vimState: VimState): Set<string> {
    const result = new Set<string>();
    for (const match of matchs) {
      const lineText = vimState.document.lineAt(match.position.line).text;
      const index = match.position.character + match.text.length;
      if (index < lineText.length) {
        result.add(lineText.charAt(index));
      }
    }
    return result;
  }

  public override async fire(position: Position, vimState: VimState): Promise<void> {
    // Only execute the action if the configuration is set
    if (configuration.easymotion) {
      // Search all occurences of the character pressed
      const matches = this.getMatches(position, vimState);

      // Stop if there are no matches
      if (matches.length > 0) {
        const nextKeys = this.getNextKeys(matches, vimState);
        this.processMarkers(matches, position, vimState, nextKeys);

        // Store mode to return to after performing easy motion
        vimState.easyMotion.previousMode = vimState.currentMode;
        // Enter the EasyMotion mode and await further keys
        await vimState.setCurrentMode(Mode.EasyMotionInputMode);
      } else {
        vimState.easyMotion.clearDecorations(vimState.editor);
        vimState.easyMotion.clearMarkers();
      }
    }
  }
}
export abstract class EasyMotionCharMoveCommandBase extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  private _action: EasyMotionSearchAction;
  private _nCharSearch: boolean;
  private _remoteYank: boolean;

  constructor(
    action: EasyMotionSearchAction,
    nCharSearch: boolean = false,
    remoteYank: boolean = false,
  ) {
    super();
    this._action = action;
    this._nCharSearch = nCharSearch;
    this._remoteYank = remoteYank;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    // Only execute the action if easymotion is enabled
    if (configuration.easymotion) {
      vimState.easyMotion = new EasyMotion();
      vimState.easyMotion.previousMode = vimState.currentMode;
      vimState.easyMotion.searchAction = this._action;
      vimState.easyMotion.nCharSearch = this._nCharSearch;
      vimState.easyMotion.remoteYank = this._remoteYank;
      globalState.hl = true;

      await vimState.setCurrentMode(Mode.EasyMotionInputMode);
    }
  }
}

export abstract class EasyMotionWordMoveCommandBase extends BaseEasyMotionCommand {
  private _options: EasyMotionWordMoveOpions;

  constructor(options: EasyMotionWordMoveOpions = {}) {
    super(options);
    this._options = options;
  }

  public getMatches(position: Position, vimState: VimState): Match[] {
    return this.getMatchesForWord(position, vimState, this.searchOptions(position, vimState));
  }

  public resolveMatchPosition(match: Match): Position {
    const { line, character } = match.position;
    switch (this._options.labelPosition) {
      case 'after':
        return new Position(line, character + match.text.length - 1);
      default:
        return match.position;
    }
  }

  private getMatchesForWord(
    position: Position,
    vimState: VimState,
    options?: SearchOptions,
  ): Match[] {
    const regex = this._options.jumpToAnywhere
      ? new RegExp(configuration.easymotionJumpToAnywhereRegex, 'g')
      : new RegExp('\\w{1,}', 'g');
    return vimState.easyMotion.sortedSearch(vimState.document, position, regex, options);
  }
}

export abstract class EasyMotionLineMoveCommandBase extends BaseEasyMotionCommand {
  private _options: EasyMotionMoveOptionsBase;

  constructor(options: EasyMotionMoveOptionsBase = {}) {
    super(options);
    this._options = options;
  }

  public resolveMatchPosition(match: Match): Position {
    return match.position;
  }

  public getMatches(position: Position, vimState: VimState): Match[] {
    return this.getMatchesForLineStart(position, vimState, this.searchOptions(position, vimState));
  }

  private getMatchesForLineStart(
    position: Position,
    vimState: VimState,
    options?: SearchOptions,
  ): Match[] {
    // Search for the beginning of all non whitespace chars on each line before the cursor
    const matches = vimState.easyMotion.sortedSearch(
      vimState.document,
      position,
      new RegExp('^.', 'gm'),
      options,
    );
    for (const match of matches) {
      match.position = TextEditor.getFirstNonWhitespaceCharOnLine(
        vimState.document,
        match.position.line,
      );
    }
    return matches;
  }
}

@RegisterAction
class EasyMotionCharInputMode extends BaseCommand {
  modes = [Mode.EasyMotionInputMode];
  keys = ['<character>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const key = this.keysPressed[0];
    const action = vimState.easyMotion.searchAction;
    const index = vimState.easyMotion.markers.findIndex((m) => m.name === key);
    if (index < 0) {
      action.searchString =
        key === '<BS>' || key === '<S-BS>'
          ? action.searchString.slice(0, -1)
          : action.searchString + key;
      if (action.shouldFire()) {
        // Skip Easymotion input mode to make sure not to back to it
        await vimState.setCurrentMode(vimState.easyMotion.previousMode);
        await action.fire(vimState.cursorStopPosition, vimState);
      }
      return;
    }

    // Only one found, navigate to it
    const marker = vimState.easyMotion.markers[index];
    vimState.easyMotion.clearMarkers();
    action.searchString = '';
    // Set cursor position based on marker entered
    vimState.easyMotion.clearDecorations(vimState.editor);
    await vimState.setCurrentMode(vimState.easyMotion.previousMode);
    if (vimState.easyMotion.remoteYank) {
      vimState.easyMotion.remoteYankPosition = vimState.cursorStopPosition;
      vimState.cursorStopPosition = marker.position;
      const mh = await getAndUpdateModeHandler();
      void mh?.handleKeyEvent('y');
    } else {
      vimState.cursorStopPosition = marker.position;
      globalState.jumpTracker.recordJump(
        Jump.fromStateBefore(vimState),
        Jump.fromStateNow(vimState),
      );
    }
  }
}

@RegisterAction
class CommandEscEasyMotionCharInputMode extends BaseCommand {
  modes = [Mode.EasyMotionInputMode];
  keys = ['<Esc>'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class MoveEasyMotion extends BaseCommand {
  modes = [Mode.EasyMotionMode];
  keys = ['<character>'];
  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const key = this.keysPressed[0];
    if (key) {
      // "nail" refers to the accumulated depth keys
      const nail = vimState.easyMotion.accumulation + key;
      vimState.easyMotion.accumulation = nail;

      // Find markers starting with "nail"
      const markers = vimState.easyMotion.findMarkers(nail, true);

      if (markers.length === 1) {
        // Only one found, navigate to it
        const marker = markers[0];

        vimState.easyMotion.clearDecorations(vimState.editor);
        // Restore the mode from before easy motion
        await vimState.setCurrentMode(vimState.easyMotion.previousMode);

        // Set cursor position based on marker entered
        vimState.cursorStopPosition = marker.position;
      } else if (markers.length === 0) {
        // None found, exit mode
        vimState.easyMotion.clearDecorations(vimState.editor);
        await vimState.setCurrentMode(vimState.easyMotion.previousMode);
      }
    }
  }
}
