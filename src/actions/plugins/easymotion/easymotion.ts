import * as vscode from 'vscode';

import { Position } from 'vscode';
import { Mode } from '../../../mode/mode';
import { configuration } from './../../../configuration/configuration';
import { TextEditor } from './../../../textEditor';
import { EasyMotionSearchAction, IEasyMotion, Marker, Match, SearchOptions } from './types';
import { VimState } from 'src/state/vimState';

export class EasyMotion implements IEasyMotion {
  /**
   * Refers to the accumulated keys for depth navigation
   */
  public accumulation = '';

  // TODO: is this actually always set?
  public searchAction!: EasyMotionSearchAction;

  public nCharSearch: boolean = false;
  public remoteYank: boolean = false;
  public remoteYankPosition: Position | undefined;
  /**
   * Array of all markers and decorations
   */
  public readonly markers: Marker[];

  private visibleMarkers: Marker[]; // Array of currently showing markers
  private decorations: vscode.DecorationOptions[][];

  private static fade: vscode.TextEditorDecorationType | null = null;
  private static getFadeDecorationType(): vscode.TextEditorDecorationType {
    if (this.fade === null) {
      this.fade = vscode.window.createTextEditorDecorationType({
        color: configuration.easymotionDimColor,
      });
    }
    return this.fade;
  }

  private static readonly hide = vscode.window.createTextEditorDecorationType({
    color: 'transparent',
  });

  /**
   * TODO: For future motions
   */
  private static specialCharactersRegex: RegExp = /[\-\[\]{}()*+?.,\\\^$|#\s]/g;

  /**
   * Caches for decorations
   */
  private static decorationTypeCache: vscode.TextEditorDecorationType[] = [];

  /**
   * Mode to return to after attempting easymotion
   */
  // TODO: make this optional (in some circumstances it isn't actually set)
  public previousMode!: Mode;

  constructor() {
    this.markers = [];
    this.visibleMarkers = [];
    this.decorations = [];
  }
  public clearRemoteYank(vimState: VimState): boolean {
    if (this.remoteYankPosition) {
      vimState.cursorStopPosition = this.remoteYankPosition;
      this.remoteYankPosition = undefined;
      return true;
    }
    return false;
  }
  /**
   * Create and cache decoration types for different marker lengths
   */
  public static getDecorationType(
    length: number,
    decorations?: vscode.DecorationRenderOptions,
  ): vscode.TextEditorDecorationType {
    const cache = this.decorationTypeCache[length];
    if (cache) {
      return cache;
    } else {
      const type = vscode.window.createTextEditorDecorationType(decorations || {});

      this.decorationTypeCache[length] = type;

      return type;
    }
  }

  /**
   * Clear all decorations
   */
  public clearDecorations(editor: vscode.TextEditor) {
    for (let i = 1; i <= this.decorations.length; i++) {
      editor.setDecorations(EasyMotion.getDecorationType(i), []);
    }

    editor.setDecorations(EasyMotion.getFadeDecorationType(), []);
    editor.setDecorations(EasyMotion.hide, []);
  }

  /**
   * Clear all markers
   */
  public clearMarkers() {
    while (this.markers.length) {
      this.markers.pop();
    }
    this.visibleMarkers = [];
  }

  public addMarker(marker: Marker) {
    this.markers.push(marker);
  }

  /**
   * Find markers beginning with a string
   */
  public findMarkers(nail: string, onlyVisible: boolean): Marker[] {
    const markers = onlyVisible ? this.visibleMarkers : this.markers;
    return markers.filter((marker) => marker.name.startsWith(nail));
  }

  /**
   * Search and sort using the index of a match compared to the index of position (usually the cursor)
   */
  public sortedSearch(
    document: vscode.TextDocument,
    position: Position,
    search: string | RegExp = '',
    options: SearchOptions = {},
  ): Match[] {
    const regex =
      typeof search === 'string'
        ? new RegExp(search.replace(EasyMotion.specialCharactersRegex, '\\$&'), 'g')
        : search;

    const matches: Match[] = [];

    // Cursor index refers to the index of the marker that is on or to the right of the cursor
    let cursorIndex = position.character;
    let prevMatch: Match | undefined;

    // Calculate the min/max bounds for the search
    const lineCount = document.lineCount;
    const lineMin = options.min ? Math.max(options.min.line, 0) : 0;
    const lineMax = options.max ? Math.min(options.max.line + 1, lineCount) : lineCount;

    outer: for (let lineIdx = lineMin; lineIdx < lineMax; lineIdx++) {
      const line = document.lineAt(lineIdx).text;
      let result = regex.exec(line);

      while (result) {
        if (matches.length >= 1000) {
          break outer;
        } else {
          const pos = new Position(lineIdx, result.index);

          // Check if match is within bounds
          if (
            (options.min && pos.isBefore(options.min)) ||
            (options.max && pos.isAfter(options.max)) ||
            Math.abs(pos.line - position.line) > 100
          ) {
            // Stop searching after 100 lines in both directions
            result = regex.exec(line);
          } else {
            // Update cursor index to the marker on the right side of the cursor
            if (!prevMatch || prevMatch.position.isBefore(position)) {
              cursorIndex = matches.length;
            }
            // Matches on the cursor position should be ignored
            if (pos.isEqual(position)) {
              result = regex.exec(line);
            } else {
              prevMatch = new Match(pos, result[0], matches.length);
              matches.push(prevMatch);
              result = regex.exec(line);
            }
          }
        }
      }
    }

    // Sort by the index distance from the cursor index
    matches.sort((a: Match, b: Match): number => {
      const computeAboluteDiff = (matchIndex: number) => {
        const absDiff = Math.abs(cursorIndex - matchIndex);
        // Prioritize the matches on the right side of the cursor index
        return matchIndex < cursorIndex ? absDiff - 0.5 : absDiff;
      };

      const absDiffA = computeAboluteDiff(a.index);
      const absDiffB = computeAboluteDiff(b.index);
      return absDiffA - absDiffB;
    });

    return matches;
  }

  private getMarkerColor(
    customizedValue: string,
    themeColorId: string,
  ): string | vscode.ThemeColor {
    if (customizedValue) {
      return customizedValue;
    } else if (!themeColorId.startsWith('#')) {
      return new vscode.ThemeColor(themeColorId);
    } else {
      return themeColorId;
    }
  }

  private getEasymotionMarkerBackgroundColor() {
    return this.getMarkerColor(configuration.easymotionMarkerBackgroundColor, '#0000');
  }

  private getEasymotionMarkerForegroundColorOneChar() {
    return this.getMarkerColor(configuration.easymotionMarkerForegroundColorOneChar, '#ff0000');
  }

  private getEasymotionMarkerForegroundColorTwoCharFirst() {
    return this.getMarkerColor(
      configuration.easymotionMarkerForegroundColorTwoCharFirst,
      '#ffb400',
    );
  }

  private getEasymotionMarkerForegroundColorTwoCharSecond() {
    return this.getMarkerColor(
      configuration.easymotionMarkerForegroundColorTwoCharSecond,
      '#b98300',
    );
  }

  private getEasymotionDimColor() {
    return this.getMarkerColor(configuration.easymotionDimColor, '#777777');
  }

  public updateDecorations(editor: vscode.TextEditor) {
    this.clearDecorations(editor);

    this.visibleMarkers = [];
    this.decorations = [];

    const offset = this.searchAction?.searchString
      ? this.searchAction.searchString.length === 0
        ? 0
        : this.searchAction.searchString.length
      : 0;

    // Set the decorations for all the different marker lengths
    const dimmingZones: vscode.DecorationOptions[] = [];
    const dimmingRenderOptions: vscode.ThemableDecorationRenderOptions = {
      // we update the color here again in case the configuration has changed
      color: this.getEasymotionDimColor(),
    };
    // Why this instead of `background-color` on the marker?
    // The easy fix would've been to let the user set the marker background to the same
    // color as the editor so it would hide the character behind, However this would require
    // the user to do more work, with this solution we temporarily hide the marked character
    // so no user specific setting is needed
    const hiddenChars: vscode.Range[] = [];
    const markers = this.markers
      .filter((m) => m.name.startsWith(this.accumulation))
      .sort((a, b) => (a.position.isBefore(b.position) ? -1 : 1));

    // Ignore markers that do not start with the accumulated depth level
    for (const marker of markers) {
      const pos = marker.position;
      // Get keys after the depth we're at
      const keystroke = marker.name.substr(this.accumulation.length);

      if (!this.decorations[keystroke.length]) {
        this.decorations[keystroke.length] = [];
      }

      // #region Hack (remove once backend handles this)

      /*
        This hack is here because the backend for easy motion reports two adjacent
        2 char markers resulting in a 4 char wide markers, this isn't what happens in
        original easymotion for instance: for doom
            - original reports d[m][m2]m where [m] is a marker and [m2] is secondary
            - here it reports d[m][m][m][m]m
        The reason this won't work with current impl is that it overflows resulting in
        one extra hidden character, hence the check below (until backend truely mimics original)

        if two consecutive 2 char markers, we only use the first char from the current marker
        and reduce the char substitution by 1. Once backend properly reports adjacent markers
        all instances of `trim` can be removed
      */
      let trim = 0;
      const next = markers[markers.indexOf(marker) + 1];

      if (
        next &&
        next.position.character - pos.character === 1 &&
        next.position.line === pos.line
      ) {
        const nextKeystroke = next.name.substr(this.accumulation.length);

        if (keystroke.length > 1 && nextKeystroke.length > 1) {
          trim = -1;
        }
      }

      // #endregion

      // First Char/One Char decoration
      const firstCharFontColor =
        keystroke.length > 1
          ? this.getEasymotionMarkerForegroundColorTwoCharFirst()
          : this.getEasymotionMarkerForegroundColorOneChar();
      const backgroundColor = this.getEasymotionMarkerBackgroundColor();
      const firstCharRange = new vscode.Range(
        pos.line,
        pos.character + offset,
        pos.line,
        pos.character + offset,
      );
      const firstCharRenderOptions: vscode.ThemableDecorationInstanceRenderOptions = {
        before: {
          contentText: keystroke.substring(0, 1),
          backgroundColor,
          color: firstCharFontColor,
          margin: `0 -1ch 0 0;
          position: absolute;
          font-weight: ${configuration.easymotionMarkerFontWeight};`,
          height: '100%',
        },
      };

      this.decorations[keystroke.length].push({
        range: firstCharRange,
        renderOptions: {
          dark: firstCharRenderOptions,
          light: firstCharRenderOptions,
        },
      });

      // Second Char decoration
      if (keystroke.length + trim > 1) {
        const secondCharFontColor = this.getEasymotionMarkerForegroundColorTwoCharSecond();
        const secondCharRange = new vscode.Range(
          pos.line,
          pos.character + 1,
          pos.line,
          pos.character + 1,
        );

        const secondCharRenderOptions: vscode.ThemableDecorationInstanceRenderOptions = {
          before: {
            contentText: keystroke.slice(1),
            backgroundColor,
            color: secondCharFontColor,
            margin: `0 -1ch 0 0;
            position: absolute;
            font-weight: ${configuration.easymotionMarkerFontWeight};`,
            height: '100%',
          },
        };
        this.decorations[keystroke.length].push({
          range: secondCharRange,
          renderOptions: {
            dark: secondCharRenderOptions,
            light: secondCharRenderOptions,
          },
        });
      }

      hiddenChars.push(
        new vscode.Range(
          pos.line,
          pos.character + offset,
          pos.line,
          pos.character + keystroke.length + trim + offset,
        ),
      );

      if (configuration.easymotionDimBackground && offset === 0) {
        // This excludes markers from the dimming ranges by using them as anchors
        // each marker adds the range between it and previous marker to the dimming zone
        // except last marker after which the rest of document is dimmed
        //
        // example [m1] text that has multiple [m2] marks
        // |<------    |<----------------------     ---->|
        if (dimmingZones.length === 0) {
          dimmingZones.push({
            range: new vscode.Range(0, 0, pos.line, pos.character),
            renderOptions: dimmingRenderOptions,
          });
        } else {
          const prevMarker = markers[markers.indexOf(marker) - 1];
          const prevKeystroke = prevMarker.name.substring(this.accumulation.length);
          const prevDimPos = prevMarker.position;
          const offsetPrevDimPos = prevDimPos.withColumn(
            prevDimPos.character + prevKeystroke.length,
          );

          // Don't create dimming ranges in between consecutive markers (the 'after' is in the cases
          // where you have 2 char consecutive markers where the first one only shows the first char.
          // since we don't take that into account when creating 'offsetPrevDimPos' it will be after
          // the current marker position which means we are in the middle of two consecutive markers.
          // See the hack region above.)
          if (!offsetPrevDimPos.isAfterOrEqual(pos)) {
            dimmingZones.push({
              range: new vscode.Range(
                offsetPrevDimPos.line,
                offsetPrevDimPos.character,
                pos.line,
                pos.character,
              ),
              renderOptions: dimmingRenderOptions,
            });
          }
        }
      }

      this.visibleMarkers.push(marker);
    }

    // for the last marker dim till document end
    if (configuration.easymotionDimBackground && markers.length > 0 && offset === 0) {
      const prevMarker = markers[markers.length - 1];
      const prevKeystroke = prevMarker.name.substring(this.accumulation.length);
      const prevDimPos = dimmingZones[dimmingZones.length - 1].range.end;
      const offsetPrevDimPos = prevDimPos.withColumn(prevDimPos.character + prevKeystroke.length);

      // Don't create any more dimming ranges when the last marker is at document end
      if (!offsetPrevDimPos.isEqual(TextEditor.getDocumentEnd(editor.document))) {
        dimmingZones.push({
          range: new vscode.Range(
            offsetPrevDimPos,
            new Position(editor.document.lineCount, Number.MAX_VALUE),
          ),
          renderOptions: dimmingRenderOptions,
        });
      }
    }

    for (let j = 1; j < this.decorations.length; j++) {
      if (this.decorations[j]) {
        editor.setDecorations(EasyMotion.getDecorationType(j), this.decorations[j]);
      }
    }

    editor.setDecorations(EasyMotion.hide, hiddenChars);

    if (configuration.easymotionDimBackground) {
      editor.setDecorations(EasyMotion.getFadeDecorationType(), dimmingZones);
    }
  }
}
