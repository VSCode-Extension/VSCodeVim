import * as vscode from 'vscode';
import { Position } from 'vscode';
import { Mode } from '../../../mode/mode';
import type { VimState } from '../../../state/vimState';

export type LabelPosition = 'after' | 'before';
export type JumpToAnywhere = true | false;

export interface EasyMotionMoveOptionsBase {
  searchDirection?: 'forward' | 'backward'; // If empty, assume bidirectional
  searchRange?: 'within_line'; // If empty, assume full page
  // searchOptions?: 'min' | 'max';
}

export interface EasyMotionCharMoveOpions extends EasyMotionMoveOptionsBase {
  charCount: number;
  labelPosition?: LabelPosition;
}

export interface EasyMotionWordMoveOpions extends EasyMotionMoveOptionsBase {
  labelPosition?: LabelPosition;
  jumpToAnywhere?: JumpToAnywhere;
}

export interface Marker {
  name: string;
  position: Position;
}

export class Match {
  public position: Position;
  public readonly text: string;
  public readonly index: number;

  constructor(position: Position, text: string, index: number) {
    this.position = position;
    this.text = text;
    this.index = index;
  }

  public toRange(): vscode.Range {
    return new vscode.Range(this.position, this.position.translate(0, this.text.length));
  }
}

export interface SearchOptions {
  /**
   * The minimum bound of the search
   */
  min?: Position;

  /**
   * The maximum bound of the search
   */
  max?: Position;
}

export interface EasyMotionSearchAction {
  searchString: string;

  /**
   * True if it should go to Easymotion mode
   */
  shouldFire(): boolean;

  /**
   * Command to execute when it should fire
   */
  fire(position: Position, vimState: VimState): Promise<void>;
  getMatches(position: Position, vimState: VimState): Match[];
  readonly searchCharCount: number;
}

export interface IEasyMotion {
  accumulation: string;
  previousMode: Mode;
  markers: Marker[];
  searchAction: EasyMotionSearchAction;

  addMarker(marker: Marker): void;
  findMarkers(nail: string, onlyVisible: boolean): Marker[];
  sortedSearch(
    document: vscode.TextDocument,
    position: Position,
    search?: string | RegExp,
    options?: SearchOptions,
  ): Match[];
  updateDecorations(editor: vscode.TextEditor): void;
  clearMarkers(): void;
  clearDecorations(editor: vscode.TextEditor): void;
}
