import * as vscode from 'vscode';

import { ExCommandLine, SearchCommandLine } from './src/cmd_line/commandLine';
import { configuration } from './src/configuration/configuration';
import { Notation } from './src/configuration/notation';
import { Globals } from './src/globals';
import { Jump } from './src/jumps/jump';
import { Mode } from './src/mode/mode';
import { ModeHandler } from './src/mode/modeHandler';
import { ModeHandlerMap } from './src/mode/modeHandlerMap';
import { Register } from './src/register/register';
import { CompositionState } from './src/state/compositionState';
import { globalState } from './src/state/globalState';
import { StatusBar } from './src/statusBar';
import { taskQueue } from './src/taskQueue';
import { Logger } from './src/util/logger';
import { SpecialKeys } from './src/util/specialKeys';
import { VSCodeContext } from './src/util/vscodeContext';
import { exCommandParser } from './src/vimscript/exCommandParser';
import { HistoryStep } from './src/history/historyTracker';

let extensionContext: vscode.ExtensionContext;
let previousActiveEditorUri: vscode.Uri | undefined;
let lastClosedModeHandler: ModeHandler | null = null;

interface ICodeKeybinding {
  after?: string[];
  commands?: Array<{ command: string; args: any[] }>;
}

export async function getAndUpdateModeHandler(
  forceSyncAndUpdate = false,
): Promise<ModeHandler | undefined> {
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor === undefined || activeTextEditor.document.isClosed) {
    return undefined;
  }

  const [curHandler, isNew] = await ModeHandlerMap.getOrCreate(activeTextEditor);
  if (isNew) {
    extensionContext.subscriptions.push(curHandler);
  }

  curHandler.vimState.editor = activeTextEditor;

  if (
    forceSyncAndUpdate ||
    !previousActiveEditorUri ||
    previousActiveEditorUri !== activeTextEditor.document.uri
  ) {
    // We sync the cursors here because ModeHandler is specific to a document, not an editor, so we
    // need to update our representation of the cursors when switching between editors for the same document.
    // This will be unnecessary once #4889 is fixed.
    curHandler.syncCursors();
    curHandler.updateView({ drawSelection: false, revealRange: false });
  }

  previousActiveEditorUri = activeTextEditor.document.uri;

  if (curHandler.focusChanged) {
    curHandler.focusChanged = false;

    if (previousActiveEditorUri) {
      const prevHandler = ModeHandlerMap.get(previousActiveEditorUri);
      prevHandler!.focusChanged = true;
    }
  }

  return curHandler;
}

/**
 * Loads and validates the user's configuration
 */
export async function loadConfiguration() {
  const validatorResults = await configuration.load();

  Logger.debug(`${validatorResults.numErrors} errors found with vim configuration`);

  if (validatorResults.numErrors > 0) {
    for (const validatorResult of validatorResults.get()) {
      switch (validatorResult.level) {
        case 'error':
          Logger.error(validatorResult.message);
          break;
        case 'warning':
          Logger.warn(validatorResult.message);
          break;
      }
    }
  }
}

/**
 * The extension's entry point
 */
export async function activate(context: vscode.ExtensionContext, handleLocal: boolean = true) {
  ExCommandLine.parser = exCommandParser;

  Logger.init();

  // before we do anything else, we need to load the configuration
  await loadConfiguration();

  Logger.debug('Start');

  extensionContext = context;
  extensionContext.subscriptions.push(StatusBar);

  // Load state
  Register.loadFromDisk(handleLocal);
  await Promise.all([
    ExCommandLine.loadHistory(context),
    SearchCommandLine.loadHistory(context),
    HistoryStep.loadHistory(context),
  ]);

  if (vscode.window.activeTextEditor) {
    const filepathComponents = vscode.window.activeTextEditor.document.fileName.split(/\\|\//);
    Register.setReadonlyRegister('%', filepathComponents[filepathComponents.length - 1]);
  }

  // workspace events
  registerEventListener(
    context,
    vscode.workspace.onDidChangeConfiguration,
    async () => {
      Logger.info('Configuration changed');
      await loadConfiguration();
    },
    false,
  );

  registerEventListener(context, vscode.workspace.onDidChangeTextDocument, async (event) => {
    if (event.document.uri.scheme === 'output') {
      // Without this, we'll get an infinite logging loop
      return;
    }
    if (event.contentChanges.length === 0) {
      // This happens when the document is saved
      return;
    }

    Logger.debug(
      `${event.contentChanges.length} change(s) to ${event.document.fileName} because ${event.reason}`,
    );
    for (const x of event.contentChanges) {
      Logger.trace(`\t-${x.rangeLength}, +'${x.text}'`);
    }

    if (event.contentChanges.length === 1) {
      const change = event.contentChanges[0];

      const anyLinesDeleted = change.range.start.line !== change.range.end.line;

      if (anyLinesDeleted && change.text === '') {
        globalState.jumpTracker.handleTextDeleted(event.document, change.range);
      } else if (!anyLinesDeleted && change.text.includes('\n')) {
        globalState.jumpTracker.handleTextAdded(event.document, change.range, change.text);
      } else {
        // TODO: What to do here?
      }
    } else {
      // TODO: In this case, we should probably loop over the content changes...
    }

    // Change from VSCode editor should set document.isDirty to true but they initially don't!
    // There is a timing issue in VSCode codebase between when the isDirty flag is set and
    // when registered callbacks are fired. https://github.com/Microsoft/vscode/issues/11339
    const contentChangeHandler = (modeHandler: ModeHandler) => {
      if (modeHandler.vimState.currentMode === Mode.Insert) {
        if (modeHandler.vimState.historyTracker.currentContentChanges === undefined) {
          modeHandler.vimState.historyTracker.currentContentChanges = [];
        }

        modeHandler.vimState.historyTracker.currentContentChanges =
          modeHandler.vimState.historyTracker.currentContentChanges.concat(event.contentChanges);
      }
    };

    const mh = ModeHandlerMap.get(event.document.uri);
    if (mh) {
      contentChangeHandler(mh);
    }
  });

  registerEventListener(
    context,
    vscode.workspace.onDidCloseTextDocument,
    async (closedDocument) => {
      Logger.info(`${closedDocument.fileName} closed`);

      // Delete modehandler once all tabs of this document have been closed
      for (const [uri, modeHandler] of ModeHandlerMap.entries()) {
        let shouldDelete = false;
        if (modeHandler == null) {
          shouldDelete = true;
        } else {
          const document = modeHandler.vimState.document;
          if (!vscode.workspace.textDocuments.includes(document)) {
            shouldDelete = true;
            if (closedDocument === document) {
              lastClosedModeHandler = modeHandler;
            }
          }
        }

        if (shouldDelete) {
          ModeHandlerMap.delete(uri);
        }
      }
    },
    false,
  );

  // window events
  registerEventListener(
    context,
    vscode.window.onDidChangeActiveTextEditor,
    async (activeTextEditor: vscode.TextEditor | undefined) => {
      if (activeTextEditor) {
        Logger.info(`Active editor: ${activeTextEditor.document.uri}`);
      } else {
        Logger.debug(`No active editor`);
      }

      const mhPrevious: ModeHandler | undefined = previousActiveEditorUri
        ? ModeHandlerMap.get(previousActiveEditorUri)
        : undefined;
      // Track the closed editor so we can use it the next time an open event occurs.
      // When vscode changes away from a temporary file, onDidChangeActiveTextEditor first twice.
      // First it fires when leaving the closed editor. Then onDidCloseTextDocument first, and we delete
      // the old ModeHandler. Then a new editor opens.
      //
      // This also applies to files that are merely closed, which allows you to jump back to that file similarly
      // once a new file is opened.
      lastClosedModeHandler = mhPrevious || lastClosedModeHandler;

      const oldFileRegister = (await Register.get('%'))?.text;
      const relativePath = activeTextEditor
        ? vscode.workspace.asRelativePath(activeTextEditor.document.uri, false)
        : '';

      if (relativePath !== oldFileRegister) {
        if (oldFileRegister && oldFileRegister !== '') {
          Register.setReadonlyRegister('#', oldFileRegister as string);
        }
        Register.setReadonlyRegister('%', relativePath);
      }

      if (activeTextEditor === undefined) {
        return;
      }

      taskQueue.enqueueTask(async () => {
        const mh = await getAndUpdateModeHandler(true);
        if (mh) {
          globalState.jumpTracker.handleFileJump(
            lastClosedModeHandler ? Jump.fromStateNow(lastClosedModeHandler.vimState) : null,
            Jump.fromStateNow(mh.vimState),
          );
        }
      });
    },
    true,
    true,
  );

  registerEventListener(
    context,
    vscode.window.onDidChangeTextEditorSelection,
    async (e: vscode.TextEditorSelectionChangeEvent) => {
      if (e.textEditor.document.uri.scheme === 'output') {
        // Without this, we can an infinite logging loop
        return;
      }
      if (
        vscode.window.activeTextEditor === undefined ||
        e.textEditor.document !== vscode.window.activeTextEditor.document
      ) {
        // We don't care if user selection changed in a paneled window (e.g debug console/terminal)
        return;
      }

      const mh = ModeHandlerMap.get(vscode.window.activeTextEditor.document.uri);
      if (mh === undefined) {
        // We don't care if there is no active editor
        return;
      }

      if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
        const selectionsHash = e.selections.reduce(
          (hash, s) =>
            hash +
            `[${s.anchor.line}, ${s.anchor.character}; ${s.active.line}, ${s.active.character}]`,
          '',
        );
        const idx = mh.selectionsChanged.ourSelections.indexOf(selectionsHash);
        if (idx > -1) {
          mh.selectionsChanged.ourSelections.splice(idx, 1);
          Logger.trace(
            `Ignoring selection: ${selectionsHash}. ${mh.selectionsChanged.ourSelections.length} left`,
          );
          return;
        } else if (mh.selectionsChanged.ignoreIntermediateSelections) {
          Logger.trace(`Ignoring intermediate selection change: ${selectionsHash}`);
          return;
        } else if (mh.selectionsChanged.ourSelections.length > 0) {
          // Some intermediate selection must have slipped in after setting the
          // 'ignoreIntermediateSelections' to false. Which means we didn't count
          // for it yet, but since we have selections to be ignored then we probably
          // wanted this one to be ignored as well.
          Logger.warn(`Ignoring slipped selection: ${selectionsHash}`);
          return;
        }
      }

      // We may receive changes from other panels when, having selections in them containing the same file
      // and changing text before the selection in current panel.
      if (e.textEditor !== mh.vimState.editor) {
        return;
      }

      if (mh.focusChanged) {
        mh.focusChanged = false;
        return;
      }

      if (mh.vimState.currentMode === Mode.EasyMotionMode) {
        return;
      }

      taskQueue.enqueueTask(() => mh.handleSelectionChange(e));
    },
    true,
    false,
  );

  registerEventListener(
    context,
    vscode.window.onDidChangeTextEditorVisibleRanges,
    async (e: vscode.TextEditorVisibleRangesChangeEvent) => {
      if (e.textEditor !== vscode.window.activeTextEditor) {
        return;
      }
      taskQueue.enqueueTask(async () => {
        // Scrolling the viewport clears any status bar message, even errors.
        const mh = await getAndUpdateModeHandler();
        if (mh && StatusBar.lastMessageTime) {
          // TODO: Using the time elapsed works most of the time, but is a bit of a hack
          const timeElapsed = Date.now() - Number(StatusBar.lastMessageTime);
          if (timeElapsed > 100) {
            StatusBar.clear(mh.vimState, true);
          }
        }
      });
    },
  );

  const compositionState = new CompositionState();

  // Override VSCode commands
  overrideCommand(context, 'type', async (args: { text: string }) => {
    taskQueue.enqueueTask(async () => {
      const mh = await getAndUpdateModeHandler();
      if (mh) {
        if (compositionState.isInComposition) {
          compositionState.composingText += args.text;
          if (mh.vimState.currentMode === Mode.Insert) {
            compositionState.insertedText = true;
            void vscode.commands.executeCommand('default:type', { text: args.text });
          }
        } else {
          await mh.handleKeyEvent(args.text);
        }
      }
    });
  });

  overrideCommand(
    context,
    'replacePreviousChar',
    async (args: { replaceCharCnt: number; text: string }) => {
      taskQueue.enqueueTask(async () => {
        const mh = await getAndUpdateModeHandler();
        if (mh) {
          if (compositionState.isInComposition) {
            compositionState.composingText =
              compositionState.composingText.substr(
                0,
                compositionState.composingText.length - args.replaceCharCnt,
              ) + args.text;
          }
          if (compositionState.insertedText) {
            await vscode.commands.executeCommand('default:replacePreviousChar', {
              text: args.text,
              replaceCharCnt: args.replaceCharCnt,
            });
            mh.vimState.cursorStopPosition = mh.vimState.editor.selection.start;
            mh.vimState.cursorStartPosition = mh.vimState.editor.selection.start;
          }
        } else {
          await vscode.commands.executeCommand('default:replacePreviousChar', {
            text: args.text,
            replaceCharCnt: args.replaceCharCnt,
          });
        }
      });
    },
  );

  overrideCommand(context, 'compositionStart', async () => {
    taskQueue.enqueueTask(async () => {
      compositionState.isInComposition = true;
    });
  });

  overrideCommand(context, 'compositionEnd', async () => {
    taskQueue.enqueueTask(async () => {
      const mh = await getAndUpdateModeHandler();
      if (mh) {
        if (compositionState.insertedText) {
          mh.selectionsChanged.ignoreIntermediateSelections = true;
          await vscode.commands.executeCommand('default:replacePreviousChar', {
            text: '',
            replaceCharCnt: compositionState.composingText.length,
          });
          mh.vimState.cursorStopPosition = mh.vimState.editor.selection.active;
          mh.vimState.cursorStartPosition = mh.vimState.editor.selection.active;
          mh.selectionsChanged.ignoreIntermediateSelections = false;
        }
        const text = compositionState.composingText;
        await mh.handleMultipleKeyEvents(text.split(''));
      }
      compositionState.reset();
    });
  });

  // Register extension commands
  registerCommand(context, 'vim.showQuickpickCmdLine', async () => {
    const mh = await getAndUpdateModeHandler();
    if (mh) {
      const cmd = await vscode.window.showInputBox({
        prompt: 'Vim command line',
        value: '',
        ignoreFocusOut: false,
        valueSelection: [0, 0],
      });
      if (cmd) {
        await new ExCommandLine(cmd, mh.vimState.currentMode).run(mh.vimState);
      }
      void mh.updateView();
    }
  });

  registerCommand(context, 'vim.remap', async (args: ICodeKeybinding) => {
    taskQueue.enqueueTask(async () => {
      const mh = await getAndUpdateModeHandler();
      if (mh === undefined) {
        return;
      }

      if (!args) {
        throw new Error(
          "'args' is undefined. For this remap to work it needs to have 'args' with an '\"after\": string[]' and/or a '\"commands\": { command: string; args: any[] }[]'",
        );
      }

      if (args.after) {
        for (const key of args.after) {
          await mh.handleKeyEvent(Notation.NormalizeKey(key, configuration.leader));
        }
      }

      if (args.commands) {
        for (const command of args.commands) {
          // Check if this is a vim command by looking for :
          if (command.command.startsWith(':')) {
            await new ExCommandLine(
              command.command.slice(1, command.command.length),
              mh.vimState.currentMode,
            ).run(mh.vimState);
            void mh.updateView();
          } else {
            await vscode.commands.executeCommand(command.command, command.args);
          }
        }
      }
    });
  });

  registerCommand(context, 'toggleVim', async () => {
    configuration.disableExtension = !configuration.disableExtension;
    void toggleExtension(configuration.disableExtension, compositionState);
  });

  for (const boundKey of configuration.boundKeyCombinations) {
    const command = ['<Esc>', '<C-c>'].includes(boundKey.key)
      ? async () => {
          const mh = await getAndUpdateModeHandler();
          if (mh && !(await forceStopRecursiveRemap(mh))) {
            await mh.handleKeyEvent(`${boundKey.key}`);
          }
        }
      : async () => {
          const mh = await getAndUpdateModeHandler();
          if (mh) {
            await mh.handleKeyEvent(`${boundKey.key}`);
          }
        };
    registerCommand(context, boundKey.command, async () => {
      taskQueue.enqueueTask(command);
    });
  }

  {
    // Initialize mode handler for current active Text Editor at startup.
    const modeHandler = await getAndUpdateModeHandler();
    if (modeHandler) {
      if (!configuration.startInInsertMode) {
        const vimState = modeHandler.vimState;

        // Make sure no cursors start on the EOL character (which is invalid in normal mode)
        // This can happen if we quit last session in insert mode at the end of the line
        vimState.cursors = vimState.cursors.map((cursor) => {
          const eolColumn = vimState.document.lineAt(cursor.stop).text.length;
          if (cursor.stop.character >= eolColumn) {
            const character = Math.max(eolColumn - 1, 0);
            return cursor.withNewStop(cursor.stop.with({ character }));
          } else {
            return cursor;
          }
        });
      }

      // This is called last because getAndUpdateModeHandler() will change cursor
      void modeHandler.updateView({ drawSelection: true, revealRange: false });
    }
  }

  // Disable automatic keyboard navigation in lists, so it doesn't interfere
  // with our list navigation keybindings
  await VSCodeContext.set('listAutomaticKeyboardNavigation', false);

  await toggleExtension(configuration.disableExtension, compositionState);

  Logger.debug('Finish.');
}

/**
 * Toggles the VSCodeVim extension between Enabled mode and Disabled mode. This
 * function is activated by calling the 'toggleVim' command from the Command Palette.
 *
 * @param isDisabled if true, sets VSCodeVim to Disabled mode; else sets to enabled mode
 */
async function toggleExtension(isDisabled: boolean, compositionState: CompositionState) {
  await VSCodeContext.set('vim.active', !isDisabled);
  const mh = await getAndUpdateModeHandler();
  if (mh) {
    if (isDisabled) {
      await mh.handleKeyEvent(SpecialKeys.ExtensionDisable);
      compositionState.reset();
      ModeHandlerMap.clear();
    } else {
      await mh.handleKeyEvent(SpecialKeys.ExtensionEnable);
    }
  }
}

function overrideCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: any[]) => any,
) {
  const disposable = vscode.commands.registerCommand(command, async (args) => {
    if (configuration.disableExtension) {
      return vscode.commands.executeCommand('default:' + command, args);
    }

    if (!vscode.window.activeTextEditor) {
      return;
    }

    if (
      vscode.window.activeTextEditor.document &&
      vscode.window.activeTextEditor.document.uri.toString() === 'debug:input'
    ) {
      return vscode.commands.executeCommand('default:' + command, args);
    }

    return callback(args) as vscode.Disposable;
  });
  context.subscriptions.push(disposable);
}

export function registerCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: any[]) => any,
  requiresActiveEditor: boolean = true,
) {
  const disposable = vscode.commands.registerCommand(command, async (args) => {
    if (requiresActiveEditor && !vscode.window.activeTextEditor) {
      return;
    }

    callback(args);
  });
  context.subscriptions.push(disposable);
}

export function registerEventListener<T>(
  context: vscode.ExtensionContext,
  event: vscode.Event<T>,
  listener: (e: T) => Promise<void>,
  exitOnExtensionDisable = true,
  exitOnTests = false,
) {
  const disposable = event(async (e) => {
    if (exitOnExtensionDisable && configuration.disableExtension) {
      return;
    }

    if (exitOnTests && Globals.isTesting) {
      return;
    }

    await listener(e);
  });
  context.subscriptions.push(disposable);
}

/**
 * @returns true if there was a remap being executed to stop
 */
async function forceStopRecursiveRemap(mh: ModeHandler): Promise<boolean> {
  if (mh.remapState.isCurrentlyPerformingRecursiveRemapping) {
    mh.remapState.forceStopRecursiveRemapping = true;
    return true;
  }

  return false;
}
