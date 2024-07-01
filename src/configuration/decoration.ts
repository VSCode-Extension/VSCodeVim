import * as vscode from 'vscode';
import { IConfiguration } from './iconfiguration';

class DecorationImpl {
  private _default!: vscode.TextEditorDecorationType;
  private _searchHighlight!: vscode.TextEditorDecorationType;
  private _searchMatch!: vscode.TextEditorDecorationType;
  private _substitutionAppend!: vscode.TextEditorDecorationType;
  private _substitutionReplace!: vscode.TextEditorDecorationType;
  private _easyMotionIncSearch!: vscode.TextEditorDecorationType;
  private _easyMotionDimIncSearch!: vscode.TextEditorDecorationType;
  private _insertModeVirtualCharacter!: vscode.TextEditorDecorationType;
  private _operatorPendingModeCursor!: vscode.TextEditorDecorationType;
  private _operatorPendingModeCursorChar!: vscode.TextEditorDecorationType;

  private _markDecorationCache = new Map<string, vscode.TextEditorDecorationType>();

  private _createMarkDecoration(name: string): vscode.TextEditorDecorationType {
    const escape: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
    };
    if (name in escape) {
      name = escape[name];
    }
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="30px" height="30px">',
      '<style>text { font-family: sans-serif; font-size: 0.8em; }</style>',
      '<path fill="rgb(3,102,214)" d="M23,27l-8-7l-8,7V5c0-1.105,0.895-2,2-2h12c1.105,0,2,0.895,2,2V27z"/>',
      `<text x="50%" y="40%" fill="rgb(200,200,200)" text-anchor="middle" dominant-baseline="middle">${name}</text>`,
      '</svg>',
    ].join('');

    const uri = vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURI(svg)}`, true);

    return vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      gutterIconPath: uri,
      gutterIconSize: 'cover',
    });
  }

  public readonly confirmedSubstitution = vscode.window.createTextEditorDecorationType({
    letterSpacing: '-9999999px',
    opacity: '0',
  });

  public set default(value: vscode.TextEditorDecorationType) {
    if (this._default) {
      this._default.dispose();
    }
    this._default = value;
  }

  public get default() {
    return this._default;
  }

  public set searchHighlight(value: vscode.TextEditorDecorationType) {
    if (this._searchHighlight) {
      this._searchHighlight.dispose();
    }
    this._searchHighlight = value;
  }

  public get searchHighlight() {
    return this._searchHighlight;
  }

  public set searchMatch(value: vscode.TextEditorDecorationType) {
    if (this._searchMatch) {
      this._searchMatch.dispose();
    }
    this._searchMatch = value;
  }

  public get searchMatch() {
    return this._searchMatch;
  }

  public set substitutionAppend(value: vscode.TextEditorDecorationType) {
    if (this._substitutionAppend) {
      this._substitutionAppend.dispose();
    }
    this._substitutionAppend = value;
  }

  public get substitutionAppend() {
    return this._substitutionAppend;
  }

  public set substitutionReplace(value: vscode.TextEditorDecorationType) {
    if (this._substitutionReplace) {
      this._substitutionReplace.dispose();
    }
    this._substitutionReplace = value;
  }

  public get substitutionReplace() {
    return this._substitutionReplace;
  }

  public get easyMotionIncSearch() {
    return this._easyMotionIncSearch;
  }

  public set easyMotionIncSearch(value: vscode.TextEditorDecorationType) {
    if (this._easyMotionIncSearch) {
      this._easyMotionIncSearch.dispose();
    }
    this._easyMotionIncSearch = value;
  }

  public get easyMotionDimIncSearch() {
    return this._easyMotionDimIncSearch;
  }

  public set easyMotionDimIncSearch(value: vscode.TextEditorDecorationType) {
    if (this._easyMotionDimIncSearch) {
      this._easyMotionDimIncSearch.dispose();
    }
    this._easyMotionDimIncSearch = value;
  }

  public getOrCreateMarkDecoration(name: string): vscode.TextEditorDecorationType {
    const decorationType = this.getMarkDecoration(name);

    if (decorationType) {
      return decorationType;
    } else {
      const type = this._createMarkDecoration(name);
      this._markDecorationCache.set(name, type);
      return type;
    }
  }

  public getMarkDecoration(name: string): vscode.TextEditorDecorationType | undefined {
    return this._markDecorationCache.get(name);
  }

  public allMarkDecorations(): IterableIterator<vscode.TextEditorDecorationType> {
    return this._markDecorationCache.values();
  }

  public set insertModeVirtualCharacter(value: vscode.TextEditorDecorationType) {
    if (this._insertModeVirtualCharacter) {
      this._insertModeVirtualCharacter.dispose();
    }
    this._insertModeVirtualCharacter = value;
  }

  public get insertModeVirtualCharacter() {
    return this._insertModeVirtualCharacter;
  }

  public set operatorPendingModeCursor(value: vscode.TextEditorDecorationType) {
    if (this._operatorPendingModeCursor) {
      this._operatorPendingModeCursor.dispose();
    }
    this._operatorPendingModeCursor = value;
  }

  public get operatorPendingModeCursor() {
    return this._operatorPendingModeCursor;
  }

  public set operatorPendingModeCursorChar(value: vscode.TextEditorDecorationType) {
    if (this._operatorPendingModeCursorChar) {
      this._operatorPendingModeCursorChar.dispose();
    }
    this._operatorPendingModeCursorChar = value;
  }

  public get operatorPendingModeCursorChar() {
    return this._operatorPendingModeCursorChar;
  }

  public load(configuration: IConfiguration) {
    this.default = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editorCursor.foreground'),
      borderColor: new vscode.ThemeColor('editorCursor.foreground'),
      dark: {
        color: 'rgb(81,80,82)',
      },
      light: {
        // used for light colored themes
        color: 'rgb(255, 255, 255)',
      },
      borderStyle: 'solid',
      borderWidth: '1px',
    });

    const searchHighlightBackgroundColor = configuration.searchHighlightColor
      ? configuration.searchHighlightColor
      : new vscode.ThemeColor('editor.findMatchHighlightBackground');

    this.searchHighlight = vscode.window.createTextEditorDecorationType({
      backgroundColor: searchHighlightBackgroundColor,
      color: configuration.searchHighlightTextColor,
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      after: {
        color: 'transparent',
        backgroundColor: searchHighlightBackgroundColor,
      },
      border: '1px solid',
      borderColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
    });

    const searchMatchBackgroundColor = configuration.searchMatchColor
      ? configuration.searchMatchColor
      : new vscode.ThemeColor('editor.findMatchBackground');

    this.searchMatch = vscode.window.createTextEditorDecorationType({
      backgroundColor: searchMatchBackgroundColor,
      color: configuration.searchMatchTextColor,
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      after: {
        color: 'transparent',
        backgroundColor: searchMatchBackgroundColor,
      },
      border: '2px solid',
      borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    });

    const substitutionBackgroundColor = configuration.substitutionColor
      ? configuration.substitutionColor
      : new vscode.ThemeColor('editor.findMatchBackground');

    this.substitutionAppend = vscode.window.createTextEditorDecorationType({
      backgroundColor: searchHighlightBackgroundColor,
      color: configuration.searchHighlightTextColor,
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      after: {
        color: configuration.substitutionTextColor,
        backgroundColor: substitutionBackgroundColor,
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
      },
      border: '1px dashed',
      borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    });

    // Use letterSpacing and opacity to hide the decorated range, so that before text gets rendered over it
    this.substitutionReplace = vscode.window.createTextEditorDecorationType({
      letterSpacing: '-9999999px',
      opacity: '0',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      before: {
        color: configuration.substitutionTextColor,
        backgroundColor: substitutionBackgroundColor,
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
      },
    });

    this.easyMotionIncSearch = vscode.window.createTextEditorDecorationType({
      color: configuration.easymotionIncSearchForegroundColor,
      backgroundColor: configuration.easymotionIncSearchBackgroundColor,
      fontWeight: configuration.easymotionMarkerFontWeight,
    });

    this.easyMotionDimIncSearch = vscode.window.createTextEditorDecorationType({
      color: configuration.easymotionDimColor,
      backgroundColor: '#0000',
    });

    this.insertModeVirtualCharacter = vscode.window.createTextEditorDecorationType({
      color: 'transparent', // no color to hide the existing character
      before: {
        color: 'currentColor',
        backgroundColor: new vscode.ThemeColor('editor.background'),
        borderColor: new vscode.ThemeColor('editor.background'),
        margin: '0 -1ch 0 0',
        height: '100%',
      },
    });

    // This creates the half block cursor when on operator pending mode
    this.operatorPendingModeCursor = vscode.window.createTextEditorDecorationType({
      before: {
        // no color to hide the existing character. We only need the character here to make
        // the width be the same as the existing character.
        color: 'transparent',
        // The '-1ch' right margin is so that it displays on top of the existing character. The amount
        // here doesn't really matter, it could be '-1px' it just needs to be negative so that the left
        // of this 'before' element coincides with the left of the existing character.
        margin: `0 -1ch 0 0;
        position: absolute;
        bottom: 0;
        line-height: 0;`,
        height: '50%',
        backgroundColor: new vscode.ThemeColor('editorCursor.foreground'),
      },
    });

    // This puts a character on top of the half block cursor and on top of the existing character
    // to create the mix-blend 'magic'
    this.operatorPendingModeCursorChar = vscode.window.createTextEditorDecorationType({
      // We make the existing character 'black' -> rgb(0,0,0), because when using the mix-blend-mode
      // with 'exclusion' it subtracts the darker color from the lightest color which means we will
      // subtract zero from our 'currentcolor' leaving us with 'currentcolor' on the part above the
      // background of the half cursor.
      color: 'black',
      before: {
        color: 'currentcolor',
        // The '-1ch' right margin is so that it displays on top of the existing character. The amount
        // here doesn't really matter, it could be '-1px' it just needs to be negative so that the left
        // of this 'before' element coincides with the left of the existing character.
        margin: `0 -1ch 0 0;
        position: absolute;
        mix-blend-mode: exclusion;`,
        height: '100%',
      },
    });
  }
}

export const decoration = new DecorationImpl();
