'use strict';

/**
 * Extension.ts is a lightweight wrapper around ModeHandler. It converts key
 * events to their string names and passes them on to ModeHandler via
 * handleKeyEvent().
 */

import * as vscode from 'vscode';
import * as _ from "lodash";
import { showCmdLine } from './src/cmd_line/main';
import { ModeHandler } from './src/mode/modeHandler';
import { taskQueue } from './src/taskQueue';
import { Position } from './src/motion/position';
import { Globals } from './src/globals';
import { AngleBracketNotation } from './src/notation';
import { ModeName } from './src/mode/mode';
import { Configuration } from './src/configuration/configuration'
import { ICodeKeybinding } from './src/mode/remapper';
import { runCmdLine } from './src/cmd_line/main';

interface VSCodeKeybinding {
  key: string;
  mac?: string;
  linux?: string;
  command: string;
  when: string;
}

const packagejson: {
  contributes: {
    keybindings: VSCodeKeybinding[];
  }
} = require('../package.json'); // out/../package.json

export class EditorIdentity {
  private _fileName: string;
  private _viewColumn: vscode.ViewColumn;

  constructor(textEditor?: vscode.TextEditor) {
    this._fileName = textEditor && textEditor.document.fileName || "";
    this._viewColumn = textEditor && textEditor.viewColumn || vscode.ViewColumn.One;
  }

  get fileName() {
    return this._fileName;
  }

  get viewColumn() {
    return this._viewColumn;
  }

  public hasSameBuffer(identity: EditorIdentity): boolean {
    return this.fileName === identity.fileName;
  }

  public isEqual(identity: EditorIdentity): boolean {
    return this.fileName === identity.fileName && this.viewColumn === identity.viewColumn;
  }

  public toString() {
    return this.fileName + this.viewColumn;
  }
}

let extensionContext: vscode.ExtensionContext;

/**
 * Note: We can't initialize modeHandler here, or even inside activate(), because some people
 * see a bug where VSC hasn't fully initialized yet, which pretty much breaks VSCodeVim entirely.
 */
let modeHandlerToEditorIdentity: { [key: string]: ModeHandler } = {};
let previousActiveEditorId: EditorIdentity = new EditorIdentity();

export async function getAndUpdateModeHandler(): Promise<ModeHandler> {
  const oldHandler = modeHandlerToEditorIdentity[previousActiveEditorId.toString()];
  const activeEditorId = new EditorIdentity(vscode.window.activeTextEditor);

  const oldModeHandler = modeHandlerToEditorIdentity[activeEditorId.toString()];

  if (!oldModeHandler ||
      oldModeHandler.vimState.editor !== vscode.window.activeTextEditor) {

    const newModeHandler = new ModeHandler();

    modeHandlerToEditorIdentity[activeEditorId.toString()] = newModeHandler;
    extensionContext.subscriptions.push(newModeHandler);

    if (oldModeHandler) {
      oldModeHandler.dispose();
    }
  }

  const handler = modeHandlerToEditorIdentity[activeEditorId.toString()];

  handler.vimState.editor = vscode.window.activeTextEditor!;

  if (previousActiveEditorId.hasSameBuffer(activeEditorId)) {
    if (!previousActiveEditorId.isEqual(activeEditorId)) {
      // We have opened two editors, working on the same file.
      previousActiveEditorId = activeEditorId;
    }
  } else {
    previousActiveEditorId = activeEditorId;

    await handler.updateView(handler.vimState, {drawSelection: false, revealRange: false});
  }

  if (oldHandler && oldHandler.vimState.focusChanged) {
    oldHandler.vimState.focusChanged = false;
    handler.vimState.focusChanged = true;
  }

  vscode.commands.executeCommand('setContext', 'vim.mode', handler.vimState.currentModeName());

  // Temporary workaround for vscode bug not changing cursor style properly
  // https://github.com/Microsoft/vscode/issues/17472
  // https://github.com/Microsoft/vscode/issues/17513
  const options = handler.vimState.editor.options;
  const desiredStyle = options.cursorStyle;

  // Temporarily change to any other cursor style besides the desired type, then change back
  if (desiredStyle === vscode.TextEditorCursorStyle.Block) {
    handler.vimState.editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;
    handler.vimState.editor.options.cursorStyle = desiredStyle;
  } else {
    handler.vimState.editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
    handler.vimState.editor.options.cursorStyle = desiredStyle;
  }

  return handler;
}

class CompositionState {
  public isInComposition: boolean = false;
  public composingText: string = "";
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  let compositionState = new CompositionState();

  // Event to update active configuration items when changed without restarting vscode
  vscode.workspace.onDidChangeConfiguration((e: void) => {
    Configuration.updateConfiguration();

    // Update the remappers foreach modehandler
    for (let mh in modeHandlerToEditorIdentity) {
      modeHandlerToEditorIdentity[mh].createRemappers();
    }
  })

  vscode.window.onDidChangeActiveTextEditor(handleActiveEditorChange, this);

  vscode.workspace.onDidChangeTextDocument((event) => {
    /**
     * Change from vscode editor should set document.isDirty to true but they initially don't!
     * There is a timing issue in vscode codebase between when the isDirty flag is set and
     * when registered callbacks are fired. https://github.com/Microsoft/vscode/issues/11339
     */

    let contentChangeHandler = (modeHandler: ModeHandler) => {
      if (modeHandler.vimState.currentMode === ModeName.Insert) {
        if (modeHandler.vimState.historyTracker.currentContentChanges === undefined) {
          modeHandler.vimState.historyTracker.currentContentChanges = [];
        }

        modeHandler.vimState.historyTracker.currentContentChanges =
          modeHandler.vimState.historyTracker.currentContentChanges.concat(event.contentChanges);
      }
    }

    if (Globals.isTesting) {
      contentChangeHandler(Globals.modeHandlerForTesting as ModeHandler);
    } else {
      _.filter(modeHandlerToEditorIdentity, modeHandler => modeHandler.identity.fileName === event.document.fileName)
        .forEach(modeHandler => {
          contentChangeHandler(modeHandler);
        });
    }

    setTimeout(() => {
      if (!event.document.isDirty && !event.document.isUntitled) {
        handleContentChangedFromDisk(event.document);
      }
    }, 0);
  });

  registerCommand(context, 'type', async (args) => {
    taskQueue.enqueueTask({
      promise: async () => {
        const mh = await getAndUpdateModeHandler();

        if (compositionState.isInComposition) {
          compositionState.composingText += args.text;
        } else {
          await mh.handleKeyEvent(args.text);
        }
      },
      isRunning: false
    });
  });

  registerCommand(context, 'replacePreviousChar', async (args) => {
    taskQueue.enqueueTask({
      promise: async () => {
        const mh = await getAndUpdateModeHandler();

        if (compositionState.isInComposition) {
          compositionState.composingText = compositionState.composingText.substr(0, compositionState.composingText.length - args.replaceCharCnt) + args.text;
        } else {
          await vscode.commands.executeCommand('default:replacePreviousChar', {
            text: args.text,
            replaceCharCnt: args.replaceCharCnt
          });
          mh.vimState.cursorPosition = Position.FromVSCodePosition(mh.vimState.editor.selection.start);
          mh.vimState.cursorStartPosition = Position.FromVSCodePosition(mh.vimState.editor.selection.start);
        }
      },
      isRunning: false
    });
  });

  registerCommand(context, 'compositionStart', async (args) => {
    taskQueue.enqueueTask({
      promise: async () => {
        const mh = await getAndUpdateModeHandler();
        compositionState.isInComposition = true;
      },
      isRunning: false
    });
  });

  registerCommand(context, 'compositionEnd', async (args) => {
    taskQueue.enqueueTask({
      promise: async () => {
        const mh = await getAndUpdateModeHandler();
        let text = compositionState.composingText;
        compositionState = new CompositionState();
        await mh.handleMultipleKeyEvents(text.split(""));
      },
      isRunning: false
    });
  });

  registerCommand(context, 'extension.showCmdLine', () => {
    showCmdLine("", modeHandlerToEditorIdentity[new EditorIdentity(vscode.window.activeTextEditor).toString()]);
  });

  registerCommand(context, 'vim.remap', async (args: ICodeKeybinding) => {
    taskQueue.enqueueTask({
      promise: async () => {
        const mh = await getAndUpdateModeHandler();
        if (args.after) {
          for (const key of args.after) {
            await mh.handleKeyEvent(AngleBracketNotation.Normalize(key));
          }
          return;
        }

        if (args.commands) {
          for (const command of args.commands) {
            // Check if this is a vim command by looking for :
            if (command.command.slice(0, 1) === ":") {
              await runCmdLine(command.command.slice(1, command.command.length), mh);
              await mh.updateView(mh.vimState);
            } else {
              await vscode.commands.executeCommand(command.command, command.args);
            }
          }
        }
      },
      isRunning: false
    });
  });
  // Clear boundKeyCombinations array incase there are any entries in it so
  // that we have a clean list of keys with no duplicates
  Configuration.boundKeyCombinations = [];

  for (let keybinding of packagejson.contributes.keybindings) {
    let keyToBeBound = "";

    /**
     * On OSX, handle mac keybindings if we specified one.
     */
    if (process.platform === "darwin") {
      keyToBeBound = keybinding.mac || keybinding.key;
    } else if (process.platform === "linux") {
      keyToBeBound = keybinding.linux || keybinding.key;
    } else {
      keyToBeBound = keybinding.key;
    }

    const bracketedKey = AngleBracketNotation.Normalize(keyToBeBound);

    // Store registered key bindings in bracket notation form
    Configuration.boundKeyCombinations.push(bracketedKey);

    registerCommand(context, keybinding.command, () => handleKeyEvent(`${ bracketedKey }`));
  }

  // Update configuration now that bound keys array is populated
  Configuration.updateConfiguration();

  // Initialize mode handler for current active Text Editor at startup.
  if (vscode.window.activeTextEditor) {
    let mh = await getAndUpdateModeHandler();
    mh.updateView(mh.vimState, {drawSelection: false, revealRange: false});
  }
}

function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any) {
  let disposable = vscode.commands.registerCommand(command, async (args) => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    if (vscode.window.activeTextEditor.document && vscode.window.activeTextEditor.document.uri.toString() === "debug:input") {
      await vscode.commands.executeCommand("default:" + command, args);
      return;
    }

    callback(args);
  });
  context.subscriptions.push(disposable);
}

async function handleKeyEvent(key: string): Promise<void> {
  const mh = await getAndUpdateModeHandler();

  taskQueue.enqueueTask({
    promise   : async () => {
      await mh.handleKeyEvent(key);
    },
    isRunning : false
  });
}

function handleContentChangedFromDisk(document : vscode.TextDocument) : void {
  _.filter(modeHandlerToEditorIdentity, modeHandler => modeHandler.identity.fileName === document.fileName)
    .forEach(modeHandler => {
      modeHandler.vimState.historyTracker.clear();
    });
}

async function handleActiveEditorChange(): Promise<void> {

  // Don't run this event handler during testing
  if (Globals.isTesting) {
    return;
  }

  taskQueue.enqueueTask({
    promise: async () => {
      if (vscode.window.activeTextEditor !== undefined) {
        const mh = await getAndUpdateModeHandler();

        mh.updateView(mh.vimState, {drawSelection: false, revealRange: false});
      }
    },
    isRunning: false
  });
}

process.on('unhandledRejection', function(reason: any, p: any) {
  console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
});
