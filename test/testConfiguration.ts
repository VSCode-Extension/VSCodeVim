import * as vscode from 'vscode';

import {
  IConfiguration,
  IHighlightedYankConfiguration,
  IKeyRemapping,
  IModeSpecificStrings,
  ITargetsConfiguration,
} from '../src/configuration/iconfiguration';

export class Configuration implements IConfiguration {
  [key: string]: any;

  useSystemClipboard = false;
  useCtrlKeys = false;
  overrideCopy = true;
  textwidth = 80;
  hlsearch = false;
  ignorecase = true;
  smartcase = true;
  autoindent = true;
  joinspaces = true;
  camelCaseMotion = {
    enable: false,
  };
  replaceWithRegister = false;
  smartRelativeLine = false;
  sneak = false;
  sneakUseIgnorecaseAndSmartcase = false;
  sneakReplacesF = false;
  surround = false;
  argumentObjectSeparators = [','];
  argumentObjectOpeningDelimiters = ['(', '['];
  argumentObjectClosingDelimiters = [')', ']'];
  easymotion = false;
  easymotionMarkerBackgroundColor = '#0000';
  easymotionMarkerForegroundColorOneChar = '#ff0000';
  easymotionMarkerForegroundColorTwoCharFirst = '#ffb400';
  easymotionMarkerForegroundColorTwoCharSecond = '#b98300';
  easymotionIncSearchForegroundColor = '#7fbf00';
  easymotionDimColor = '#777777';
  easymotionDimBackground = true;
  easymotionMarkerFontWeight = 'bold';
  easymotionKeys = 'hklyuiopnm,qwertzxcvbasdgjf;';
  targets: ITargetsConfiguration = {
    enable: false,
    bracketObjects: {
      enable: true,
    },
    smartQuotes: {
      enable: false,
      breakThroughLines: true,
      aIncludesSurroundingSpaces: true,
    },
  };
  autoSwitchInputMethod = {
    enable: false,
    defaultIM: '',
    switchIMCmd: '',
    obtainIMCmd: '',
  };
  timeout = 1000;
  maxmapdepth = 1000;
  showcmd = true;
  showmodename = true;
  leader = '//';
  history = 50;
  incsearch = true;
  inccommand = '' as const;
  openFilePosition = 'relative' as const;
  startInInsertMode = false;
  statusBarColorControl = false;
  statusBarColors: IModeSpecificStrings<string | string[]> = {
    normal: ['#8FBCBB', '#434C5E'],
    insert: '#BF616A',
    visual: '#B48EAD',
    visualline: '#B48EAD',
    visualblock: '#A3BE8C',
    replace: '#D08770',
  };
  searchHighlightColor = 'rgba(150, 150, 255, 0.3)';
  searchHighlightTextColor = '';
  searchMatchColor = 'rgba(255, 150, 150, 0.3)';
  searchMatchTextColor = '';
  substitutionColor = 'rgba(100, 255, 150, 0.3)';
  substitutionTextColor = '';
  highlightedyank: IHighlightedYankConfiguration = {
    enable: false,
    color: 'rgba(250, 240, 170, 0.5)',
    textColor: '',
    duration: 200,
  };
  tabstop = 2;
  editorCursorStyle = vscode.TextEditorCursorStyle.Line;
  expandtab = true;
  // eslint-disable-next-line id-denylist
  number = true;
  relativenumber = false;
  iskeyword = ''; // Use `editor.wordSeparators`
  matchpairs = '(:),{:},[:]';
  visualstar = false;
  mouseSelectionGoesIntoVisualMode = true;
  changeWordIncludesWhitespace = false;
  foldfix = false;
  disableExtension = false;
  enableNeovim = false;
  gdefault = false;
  substituteGlobalFlag = false; // Deprecated in favor of gdefault
  neovimPath = 'nvim';
  neovimUseConfigFile = false;
  neovimConfigPath = '';
  vimrc = {
    enable: false,
    path: '',
  };
  cursorStylePerMode: IModeSpecificStrings<string> = {
    normal: 'line',
    insert: 'block',
    visual: 'underline',
    visualline: 'line-thin',
    visualblock: 'block-outline',
    replace: 'underline-thin,',
  };
  insertModeKeyBindings: IKeyRemapping[] = [];
  insertModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  normalModeKeyBindings: IKeyRemapping[] = [];
  normalModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  operatorPendingModeKeyBindings: IKeyRemapping[] = [];
  operatorPendingModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  visualModeKeyBindings: IKeyRemapping[] = [];
  visualModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  commandLineModeKeyBindings: IKeyRemapping[] = [];
  commandLineModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  insertModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  normalModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  operatorPendingModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  visualModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  commandLineModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  whichwrap = 'b,s';
  wrapKeys = {};
  report = 2;
  digraphs = {};
  wrapscan = true;
  scroll = 20;
  scrolloff = 5;
  startofline = true;
  showMarksInGutter = true;
  shell = '';
  handleKeys = {
    '<C-d>': true,
  };
  langmap = '';
}
