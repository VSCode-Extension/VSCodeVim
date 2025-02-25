import _ from 'lodash';
import * as vscode from 'vscode';

import * as process from 'process';
import { Position, Range, Uri } from 'vscode';
import { BaseMovement } from '../actions/baseMotion';
import { BaseOperator } from '../actions/operator';
import { EasyMotion } from '../actions/plugins/easymotion/easymotion';
import { SearchByNCharCommand } from '../actions/plugins/easymotion/easymotion.cmd';
import { IBaseAction } from '../actions/types';
import { Cursor } from '../common/motion/cursor';
import { configuration } from '../configuration/configuration';
import { decoration } from '../configuration/decoration';
import { Notation } from '../configuration/notation';
import { Remappers } from '../configuration/remapper';
import { Jump } from '../jumps/jump';
import { globalState } from '../state/globalState';
import { RemapState } from '../state/remapState';
import { StatusBar } from '../statusBar';
import { IModeHandler, executeTransformations } from '../transformations/execute';
import { Dot, isTextTransformation } from '../transformations/transformations';
import { SearchDecorations, getDecorationsForSearchMatchRanges } from '../util/decorationUtils';
import { Logger } from '../util/logger';
import { SpecialKeys } from '../util/specialKeys';
import { scrollView } from '../util/util';
import { VSCodeContext } from '../util/vscodeContext';
import { BaseAction, BaseCommand, KeypressState, getRelevantAction } from './../actions/base';
import {
  ActionOverrideCmdD,
  ActionReplaceCharacter,
  CommandInsertAtCursor,
  CommandNumber,
  CommandQuitRecordMacro,
  CommandRegister,
  DocumentContentChangeAction,
} from './../actions/commands/actions';
import {
  CommandBackspaceInInsertMode,
  CommandEscInsertMode,
  CommandInsertInInsertMode,
  CommandInsertPreviousText,
  InsertCharAbove,
  InsertCharBelow,
} from './../actions/commands/insert';
import { PairMatcher } from './../common/matching/matcher';
import { earlierOf, laterOf } from './../common/motion/position';
import { ForceStopRemappingError, VimError } from './../error';
import { Register, RegisterMode } from './../register/register';
import { RecordedState } from './../state/recordedState';
import { VimState } from './../state/vimState';
import { TextEditor } from './../textEditor';
import {
  DotCommandStatus,
  Mode,
  NormalCommandState,
  ReplayMode,
  VSCodeVimCursorType,
  getCursorStyle,
  isStatusBarMode,
  isVisualMode,
} from './mode';
import { isLiteralMode, remapKey } from '../configuration/langmap';

interface IModeHandlerMap {
  get(editorId: Uri): ModeHandler | undefined;
}

/**
 * ModeHandler is the extension's backbone. It listens to events and updates the VimState.
 * One of these exists for each editor - see ModeHandlerMap
 *
 * See:  https://github.com/VSCodeVim/Vim/blob/master/.github/CONTRIBUTING.md#the-vim-state-machine
 */
export class ModeHandler implements vscode.Disposable, IModeHandler {
  public readonly vimState: VimState;
  public readonly remapState: RemapState;

  public lastMovementFailed: boolean = false;

  public focusChanged = false;

  private searchDecorationCacheKey: { searchString: string; documentVersion: number } | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly handlerMap: IModeHandlerMap;
  private readonly remappers: Remappers;

  /**
   * Used internally to ignore selection changes that were performed by us.
   * 'ignoreIntermediateSelections': set to true when running an action, during this time
   * all selections change events will be ignored.
   * 'ourSelections': keeps track of our selections that will trigger a selection change event
   * so that we can ignore them.
   */
  public selectionsChanged = {
    /**
     * Set to true when running an action, during this time
     * all selections change events will be ignored.
     */
    ignoreIntermediateSelections: false,
    /**
     * keeps track of our selections that will trigger a selection change event
     * so that we can ignore them.
     */
    ourSelections: Array<string>(),
  };

  /**
   * Was the previous mouse click past EOL
   */
  private lastClickWasPastEol: boolean = false;

  private _currentMode!: Mode;
  private get currentMode(): Mode {
    return this._currentMode;
  }
  private async setCurrentMode(mode: Mode): Promise<void> {
    if (this.vimState.currentMode !== mode) {
      await this.vimState.setCurrentMode(mode);
    }
    this._currentMode = mode;
  }

  public static async create(
    handlerMap: IModeHandlerMap,
    textEditor: vscode.TextEditor,
  ): Promise<ModeHandler> {
    const modeHandler = new ModeHandler(handlerMap, textEditor);
    await modeHandler.vimState.load();
    await modeHandler.setCurrentMode(configuration.startInInsertMode ? Mode.Insert : Mode.Normal);
    modeHandler.syncCursors();
    return modeHandler;
  }

  private constructor(handlerMap: IModeHandlerMap, textEditor: vscode.TextEditor) {
    this.handlerMap = handlerMap;
    this.remappers = new Remappers();

    this.vimState = new VimState(textEditor, new EasyMotion());
    this.remapState = new RemapState();
    this.disposables.push(this.vimState);
  }

  /**
   * Updates VSCodeVim's internal representation of cursors to match VSCode's selections.
   * This loses some information, so it should only be done when necessary.
   */
  public syncCursors() {
    // TODO: getCursorsAfterSync() is basically this, but stupider
    const { selections } = this.vimState.editor;
    // TODO: this if block is a workaround for a problem described here https://github.com/VSCodeVim/Vim/pull/8426
    if (
      selections.length === 1 &&
      selections[0].isEqual(new Range(new Position(0, 0), new Position(0, 0)))
    ) {
      return;
    }

    if (
      !this.vimState.cursorStartPosition.isEqual(selections[0].anchor) ||
      !this.vimState.cursorStopPosition.isEqual(selections[0].active)
    ) {
      this.vimState.desiredColumn = selections[0].active.character;
    }

    this.vimState.cursors = selections.map(({ active, anchor }) =>
      active.isBefore(anchor) ? new Cursor(anchor.getLeft(), active) : new Cursor(anchor, active),
    );
  }

  /**
   * This is easily the worst function in VSCodeVim.
   *
   * We need to know when VSCode has updated our selection, so that we can sync
   * that internally. Unfortunately, VSCode has a habit of calling this
   * function at weird times, or or with incomplete information, so we have to
   * do a lot of voodoo to make sure we're updating the cursors correctly.
   *
   * Even worse, we don't even know how to test this stuff.
   *
   * Anyone who wants to change the behavior of this method should make sure
   * all selection related test cases pass. Follow this spec
   * https://gist.github.com/rebornix/d21d1cc060c009d4430d3904030bd4c1 to
   * perform the manual testing. Besides this testing you should still test
   * commands like 'editor.action.smartSelect.grow' and you should test moving
   * continuously up/down or left/right with and without remapped movement keys
   * because sometimes vscode lags behind and calls this function with information
   * that is not up to date with our selections yet and we need to make sure we don't
   * change our cursors to previous information (this usally is only an issue in visual
   * mode because of our different ways of handling selections and in those cases
   * updating our cursors with not up to date info might result in us changing our
   * cursor start position).
   */
  public async handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    if (
      vscode.window.activeTextEditor === undefined ||
      e.textEditor.document !== vscode.window.activeTextEditor.document
    ) {
      // we don't care if there is no active editor
      // or user selection changed in a paneled window (e.g debug console/terminal)
      // This check is made before enqueuing this selection change, but sometimes
      // between the enqueueing and the actual calling of this function the editor
      // might close or change to other document
      return;
    }
    const selection = e.selections[0];
    Logger.debug(
      `Selection change: ${selection.anchor.toString()}, ${selection.active}, SelectionsLength: ${
        e.selections.length
      }`,
    );

    // If our previous cursors are not included on any of the current selections, then a snippet
    // must have been inserted.
    const isSnippetSelectionChange = () => {
      return e.selections.every((s) => {
        return this.vimState.cursors
          .filter((c) => !c.start.isEqual(c.stop))
          .every((c) => {
            return !s.contains(new vscode.Range(c.start, c.stop));
          });
      });
    };

    if (
      (e.selections.length !== this.vimState.cursors.length || this.vimState.isMultiCursor) &&
      this.vimState.currentMode !== Mode.VisualBlock
    ) {
      const allowedModes = [Mode.Normal];
      if (!isSnippetSelectionChange()) {
        allowedModes.push(Mode.Insert, Mode.Replace);
      }
      // Number of selections changed, make sure we know about all of them still
      this.vimState.cursors = e.textEditor.selections.map(
        (sel) =>
          new Cursor(
            // Adjust the cursor positions because cursors & selections don't match exactly
            sel.anchor.isAfter(sel.active) ? sel.anchor.getLeft() : sel.anchor,
            sel.active,
          ),
      );
      if (
        e.selections.some((s) => !s.anchor.isEqual(s.active)) &&
        allowedModes.includes(this.vimState.currentMode)
      ) {
        // If we got a visual selection and we are on normal, insert or replace mode, enter visual mode.
        // We shouldn't go to visual mode on any other mode, because the other visual modes are handled
        // very differently than vscode so only our extension will create them. And the other modes
        // like the plugin modes shouldn't be changed or else it might mess up the plugins actions.
        await this.setCurrentMode(Mode.Visual);
      }
      return this.updateView({ drawSelection: false, revealRange: false });
    }

    /**
     * We only trigger our view updating process if it's a mouse selection.
     * Otherwise we only update our internal cursor positions accordingly.
     */
    if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
      if (selection) {
        if (e.kind === vscode.TextEditorSelectionChangeKind.Command) {
          // This 'Command' kind is triggered when using a command like 'editor.action.smartSelect.grow'
          // but it is also triggered when we set the 'editor.selections' on 'updateView'.
          const allowedModes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
          if (!isSnippetSelectionChange()) {
            // if we just inserted a snippet then don't allow insert modes to go to visual mode
            allowedModes.push(Mode.Insert, Mode.Replace);
          }
          if (allowedModes.includes(this.vimState.currentMode)) {
            // Since the selections weren't ignored then probably we got change of selection from
            // a command, so we need to update our start and stop positions. This is where commands
            // like 'editor.action.smartSelect.grow' are handled.
            if (this.vimState.currentMode === Mode.Visual) {
              Logger.trace('Updating Visual Selection!');
              this.vimState.cursorStopPosition = selection.active;
              this.vimState.cursorStartPosition = selection.anchor;
              this.updateView({ drawSelection: false, revealRange: false });

              // Store selection for commands like gv
              this.vimState.lastVisualSelection = {
                mode: this.vimState.currentMode,
                start: this.vimState.cursorStartPosition,
                end: this.vimState.cursorStopPosition,
              };
              return;
            } else if (!selection.active.isEqual(selection.anchor)) {
              Logger.trace('Creating Visual Selection from command!');
              this.vimState.cursorStopPosition = selection.active;
              this.vimState.cursorStartPosition = selection.anchor;
              await this.setCurrentMode(Mode.Visual);
              this.updateView({ drawSelection: false, revealRange: false });

              // Store selection for commands like gv
              this.vimState.lastVisualSelection = {
                mode: Mode.Visual,
                start: this.vimState.cursorStartPosition,
                end: this.vimState.cursorStopPosition,
              };
              return;
            }
          }
        }
        // Here we are on the selection changed of kind 'Keyboard' or 'undefined' which is triggered
        // when pressing movement keys that are not caught on the 'type' override but also when using
        // commands like 'cursorMove'.

        if (isVisualMode(this.vimState.currentMode)) {
          /**
           * In Visual Mode, our `cursorPosition` and `cursorStartPosition` can not reflect `active`,
           * `start`, `end` and `anchor` information in a selection.
           * See `Fake block cursor with text decoration` section of `updateView` method.
           * Besides this, sometimes on visual modes our start position is not the same has vscode
           * anchor because we need to move vscode anchor one to the right of our start when our start
           * is after our stop in order to include the start character on vscodes selection.
           */
          return;
        }

        const cursorEnd = laterOf(
          this.vimState.cursorStartPosition,
          this.vimState.cursorStopPosition,
        );
        if (e.textEditor.document.validatePosition(cursorEnd).isBefore(cursorEnd)) {
          // The document changed such that our cursor position is now out of bounds, possibly by
          // another program. Let's just use VSCode's selection.
          // TODO: if this is the case, but we're in visual mode, we never get here (because of branch above)
        } else if (
          e.kind === vscode.TextEditorSelectionChangeKind.Keyboard &&
          this.vimState.cursorStopPosition.isEqual(this.vimState.cursorStartPosition) &&
          this.vimState.cursorStopPosition.getRight().isLineEnd() &&
          this.vimState.cursorStopPosition.getLineEnd().isEqual(selection.active)
        ) {
          // We get here when we use a 'cursorMove' command (that is considered a selection changed
          // kind of 'Keyboard') that ends past the line break. But our cursors are already on last
          // character which is what we want. Even though our cursors will be corrected again when
          // checking if they are in bounds on 'runAction' there is no need to be changing them back
          // and forth so we check for this situation here.
          return;
        }

        // Here we allow other 'cursorMove' commands to update our cursors in case there is another
        // extension making cursor changes that we need to catch.
        //
        // We still need to be careful with this because this here might be changing our cursors
        // in ways we don't want to. So with future selection issues this is a good place to start
        // looking.
        Logger.debug(
          `Selections: Changing Cursors from selection handler... ${selection.anchor.toString()}, ${
            selection.active
          }`,
        );
        this.vimState.cursorStopPosition = selection.active;
        this.vimState.cursorStartPosition = selection.anchor;
        this.vimState.desiredColumn = selection.active.character;
        this.updateView({ drawSelection: false, revealRange: false });
      }
      return;
    }

    if (isStatusBarMode(this.vimState.currentMode)) {
      return;
    }

    let toDraw = false;

    if (selection) {
      let newPosition = selection.active;

      // Only check on a click, not a full selection (to prevent clicking past EOL)
      if (newPosition.character >= newPosition.getLineEnd().character && selection.isEmpty) {
        if (this.vimState.currentMode !== Mode.Insert) {
          this.lastClickWasPastEol = true;

          // This prevents you from mouse clicking past the EOL
          newPosition = newPosition.withColumn(Math.max(newPosition.getLineEnd().character - 1, 0));

          // Switch back to normal mode since it was a click not a selection
          await this.setCurrentMode(Mode.Normal);

          toDraw = true;
        }
      } else if (selection.isEmpty) {
        this.lastClickWasPastEol = false;
      }

      this.vimState.cursorStopPosition = newPosition;
      this.vimState.cursorStartPosition = newPosition;
      this.vimState.desiredColumn = newPosition.character;

      // start visual mode?
      if (
        selection.anchor.line === selection.active.line &&
        selection.anchor.character >= newPosition.getLineEnd().character &&
        selection.active.character >= newPosition.getLineEnd().character
      ) {
        // This prevents you from selecting EOL
      } else if (!selection.anchor.isEqual(selection.active)) {
        let selectionStart = new Position(selection.anchor.line, selection.anchor.character);

        if (selectionStart.character > selectionStart.getLineEnd().character) {
          selectionStart = new Position(selectionStart.line, selectionStart.getLineEnd().character);
        }

        this.vimState.cursorStartPosition = selectionStart;

        if (selectionStart.isAfter(newPosition)) {
          this.vimState.cursorStartPosition = this.vimState.cursorStartPosition.getLeft();
        }

        // If we prevented from clicking past eol but it is part of this selection, include the last char
        if (this.lastClickWasPastEol) {
          const newStart = new Position(selection.anchor.line, selection.anchor.character + 1);
          this.vimState.editor.selection = new vscode.Selection(newStart, selection.active);
          this.vimState.cursorStartPosition = selectionStart;
          this.lastClickWasPastEol = false;
        }

        if (
          configuration.mouseSelectionGoesIntoVisualMode &&
          !isVisualMode(this.vimState.currentMode) &&
          this.currentMode !== Mode.Insert
        ) {
          await this.setCurrentMode(Mode.Visual);

          // double click mouse selection causes an extra character to be selected so take one less character
        }
      } else if (this.vimState.currentMode !== Mode.Insert) {
        await this.setCurrentMode(Mode.Normal);
      }

      if (isVisualMode(this.vimState.currentMode)) {
        // Store selection for commands like gv
        this.vimState.lastVisualSelection = {
          mode: this.vimState.currentMode,
          start: this.vimState.cursorStartPosition,
          end: this.vimState.cursorStopPosition,
        };
      }
      void this.updateView({ drawSelection: toDraw, revealRange: false });
    }
  }

  async handleMultipleKeyEvents(keys: string[], alreadyRemapped: boolean = true): Promise<void> {
    for (const key of keys) {
      await (alreadyRemapped ? this.handleKeyEventLangmapped(key) : this.handleKeyEvent(key));
    }
  }

  public async handleKeyEvent(keyRaw: string): Promise<void> {
    const key =
      isLiteralMode(this.currentMode) || this.vimState.isReplayingMacro ? keyRaw : remapKey(keyRaw);
    return this.handleKeyEventLangmapped(key);
  }

  private async handleKeyEventLangmapped(key: string): Promise<void> {
    if (this.remapState.forceStopRecursiveRemapping) {
      return;
    }

    const now = Date.now();

    const printableKey = Notation.printableKey(key, configuration.leader);
    Logger.debug(`Handling key: ${printableKey}`);

    if (
      (key === SpecialKeys.TimeoutFinished ||
        this.vimState.recordedState.bufferedKeys.length > 0) &&
      this.vimState.recordedState.bufferedKeysTimeoutObj
    ) {
      // Handle the bufferedKeys or append the new key to the previously bufferedKeys
      clearTimeout(this.vimState.recordedState.bufferedKeysTimeoutObj);
      this.vimState.recordedState.bufferedKeysTimeoutObj = undefined;
      this.vimState.recordedState.commandList = [...this.vimState.recordedState.bufferedKeys];
      this.vimState.recordedState.bufferedKeys = [];
    }

    // rewrite copy
    if (configuration.overrideCopy) {
      // The conditions when you trigger a "copy" rather than a ctrl-c are
      // too sophisticated to be covered by the "when" condition in package.json
      if (key === '<D-c>') {
        key = '<copy>';
      }

      if (key === '<C-c>' && process.platform !== 'darwin') {
        if (
          !configuration.useCtrlKeys ||
          this.vimState.currentMode === Mode.Visual ||
          this.vimState.currentMode === Mode.VisualBlock ||
          this.vimState.currentMode === Mode.VisualLine
        ) {
          key = '<copy>';
        }
      }
    }

    // <C-d> triggers "add selection to next find match" by default,
    // unless users explicity make <C-d>: true
    // TODO: Destroy this silliness
    if (key === '<C-d>' && !(configuration.handleKeys['<C-d>'] === true)) {
      key = '<D-d>';
    }

    this.vimState.cursorsInitialState = this.vimState.cursors;
    this.vimState.recordedState.commandList.push(key);

    const oldMode = this.vimState.currentMode;
    const oldFullMode = this.vimState.currentModeIncludingPseudoModes;
    const oldStatusBarText = StatusBar.getText();
    const oldWaitingForAnotherActionKey = this.vimState.recordedState.waitingForAnotherActionKey;

    let handledAsRemap = false;
    let handledAsAction = false;
    try {
      // Handling special case for '0'. From Vim documentation (:help :map-modes)
      // Special case: While typing a count for a command in Normal mode, mapping zero
      // is disabled. This makes it possible to map zero without making it impossible
      // to type a count with a zero.
      const preventZeroRemap =
        key === '0' &&
        this.vimState.recordedState.actionsRun[
          this.vimState.recordedState.actionsRun.length - 1
        ] instanceof CommandNumber;

      // Check for remapped keys if:
      // 1. We are not currently performing a non-recursive remapping
      // 2. We are not typing '0' after starting to type a count
      // 3. We are not waiting for another action key
      //    Example: jj should not remap the second 'j', if jj -> <Esc> in insert mode
      //             0 should not be remapped if typed after another number, like 10
      //             for actions with multiple keys like 'gg' or 'fx' the second character
      //           shouldn't be mapped
      if (
        !this.remapState.isCurrentlyPerformingNonRecursiveRemapping &&
        !preventZeroRemap &&
        !this.vimState.recordedState.waitingForAnotherActionKey
      ) {
        handledAsRemap = await this.remappers.sendKey(
          this.vimState.recordedState.commandList,
          this,
        );
      }

      this.vimState.recordedState.allowPotentialRemapOnFirstKey = true;

      if (!handledAsRemap) {
        if (key === SpecialKeys.TimeoutFinished) {
          // Remove the <TimeoutFinished> key and get the key before that. If the <TimeoutFinished>
          // key was the last key, then 'key' will be undefined and won't be sent to handle action.
          this.vimState.recordedState.commandList.pop();
          key =
            this.vimState.recordedState.commandList[
              this.vimState.recordedState.commandList.length - 1
            ];
        }
        if (key !== undefined) {
          handledAsAction = await this.handleKeyAsAnAction(key);
        }
      }
    } catch (e) {
      this.selectionsChanged.ignoreIntermediateSelections = false;
      if (e instanceof VimError) {
        StatusBar.displayError(this.vimState, e);
        this.vimState.recordedState = new RecordedState();
        if (this.remapState.isCurrentlyPerformingRemapping) {
          // If we are handling a remap and we got a VimError stop handling the remap
          // and discard the rest of the keys. We throw an Exception here to stop any other
          // remapping handling steps and go straight to the 'finally' step of the remapper.
          throw ForceStopRemappingError.fromVimError(e);
        }
      } else if (e instanceof ForceStopRemappingError) {
        // If this is a ForceStopRemappingError rethrow it until it gets to the remapper
        throw e;
      } else if (e instanceof Error) {
        e.message = `Failed to handle key \`${key}\`: ${e.message}`;
        throw e;
      } else {
        throw new Error(`Failed to handle key \`${key}\` due to an unknown error.`);
      }
    }

    this.remapState.lastKeyPressedTimestamp = now;

    StatusBar.updateShowCmd(this.vimState);

    // We don't want to immediately erase any message that resulted from the action just performed
    if (StatusBar.getText() === oldStatusBarText) {
      // Clear the status bar of high priority messages if the mode has changed, the view has scrolled
      // or it is recording a Macro
      const forceClearStatusBar =
        (this.vimState.currentMode !== oldMode && this.vimState.currentMode !== Mode.Normal) ||
        this.vimState.macro !== undefined;
      StatusBar.clear(this.vimState, forceClearStatusBar);
    }

    // We either already ran an action or we have a potential action to run but
    // the key is already stored on 'actionKeys' in that case we don't need it
    // anymore on commandList that is only used for the remapper and 'showCmd'
    // and both had already been handled at this point.
    // If we got here it means that there is no potential remap for the key
    // either so we need to clear it from commandList so that it doesn't interfere
    // with the next remapper check.
    this.vimState.recordedState.resetCommandList();

    Logger.trace(`handleKeyEvent('${printableKey}') took ${Date.now() - now}ms`);

    // If we are handling a remap and the last movement failed stop handling the remap
    // and discard the rest of the keys. We throw an Exception here to stop any other
    // remapping handling steps and go straight to the 'finally' step of the remapper.
    if (this.remapState.isCurrentlyPerformingRemapping && this.lastMovementFailed) {
      this.lastMovementFailed = false;
      throw new ForceStopRemappingError('Last movement failed');
    }

    // Reset lastMovementFailed. Anyone who needed it has probably already handled it.
    // And keeping it past this point would make any following remapping force stop.
    this.lastMovementFailed = false;

    if (!handledAsAction) {
      // There was no action run yet but we still want to update the view to be able
      // to show the potential remapping keys being pressed, the `"` character when
      // waiting on a register key or the `?` character and any following character
      // when waiting on digraph keys. The 'oldWaitingForAnotherActionKey' is used
      // to call the updateView after we are no longer waiting keys so that any
      // existing overlapped key is removed.
      if (
        ((this.vimState.currentMode === Mode.Insert ||
          this.vimState.currentMode === Mode.Replace) &&
          (this.vimState.recordedState.bufferedKeys.length > 0 ||
            this.vimState.recordedState.waitingForAnotherActionKey ||
            this.vimState.recordedState.waitingForAnotherActionKey !==
              oldWaitingForAnotherActionKey)) ||
        this.vimState.currentModeIncludingPseudoModes !== oldFullMode
      ) {
        // TODO: this call to updateView is only used to update the virtualCharacter and halfBlock
        // cursor decorations, if in the future we split up the updateView function there should
        // be no need to call all of it.
        this.updateView({ drawSelection: false, revealRange: false });
      }
    }
  }

  private async handleKeyAsAnAction(key: string): Promise<boolean> {
    if (vscode.window.activeTextEditor !== this.vimState.editor) {
      Logger.warn('Current window is not active');
      return false;
    }

    // Catch any text change not triggered by us (example: tab completion).
    this.vimState.historyTracker.addChange();

    const recordedState = this.vimState.recordedState;
    recordedState.actionKeys.push(key);
    void VSCodeContext.set('vim.command', recordedState.commandString);

    const action = getRelevantAction(recordedState.actionKeys, this.vimState);
    switch (action) {
      case KeypressState.NoPossibleMatch:
        if (this.vimState.currentMode === Mode.Insert) {
          this.vimState.recordedState.actionKeys = [];
        } else {
          this.vimState.recordedState = new RecordedState();
        }
        // Since there is no possible action we are no longer waiting any action keys
        this.vimState.recordedState.waitingForAnotherActionKey = false;
        void VSCodeContext.set('vim.command', '');

        return false;
      case KeypressState.WaitingOnKeys:
        this.vimState.recordedState.waitingForAnotherActionKey = true;

        return false;
    }

    if (
      !this.remapState.remapUsedACharacter &&
      this.remapState.isCurrentlyPerformingRecursiveRemapping
    ) {
      // Used a character inside a recursive remapping so we reset the mapDepth.
      this.remapState.remapUsedACharacter = true;
      this.remapState.mapDepth = 0;
    }

    // Since we got an action we are no longer waiting any action keys
    this.vimState.recordedState.waitingForAnotherActionKey = false;

    // Store action pressed keys for showCmd
    recordedState.actionsRunPressedKeys.push(...recordedState.actionKeys);

    let actionToRecord: BaseAction | undefined = action;
    if (recordedState.actionsRun.length === 0) {
      recordedState.actionsRun.push(action);
    } else {
      const lastAction = recordedState.actionsRun[recordedState.actionsRun.length - 1];

      const actionCanBeMergedWithDocumentChange =
        action instanceof CommandInsertInInsertMode ||
        action instanceof CommandBackspaceInInsertMode ||
        action instanceof CommandInsertPreviousText ||
        action instanceof InsertCharAbove ||
        action instanceof InsertCharBelow;

      if (lastAction instanceof DocumentContentChangeAction) {
        if (!(action instanceof CommandEscInsertMode)) {
          // TODO: this includes things like <BS>, which it shouldn't
          lastAction.keysPressed.push(key);
        }

        if (actionCanBeMergedWithDocumentChange) {
          // delay the macro recording
          actionToRecord = undefined;
        } else {
          // Push document content change to the stack
          lastAction.addChanges(
            this.vimState.historyTracker.currentContentChanges,
            this.vimState.cursorStopPosition,
          );
          this.vimState.historyTracker.currentContentChanges = [];
          recordedState.actionsRun.push(action);
        }
      } else {
        if (actionCanBeMergedWithDocumentChange) {
          // This means we are already in Insert Mode but there is still not DocumentContentChangeAction in stack
          this.vimState.historyTracker.currentContentChanges = [];
          const newContentChange = new DocumentContentChangeAction(
            this.vimState.cursorStopPosition,
          );
          newContentChange.keysPressed.push(key);
          recordedState.actionsRun.push(newContentChange);
          actionToRecord = newContentChange;
        } else {
          recordedState.actionsRun.push(action);
        }
      }
    }

    if (
      this.vimState.macro !== undefined &&
      actionToRecord &&
      !(actionToRecord instanceof CommandQuitRecordMacro)
    ) {
      this.vimState.macro.actionsRun.push(actionToRecord);
    }

    await this.runAction(recordedState, action);

    if (this.vimState.currentMode === Mode.Insert) {
      recordedState.isInsertion = true;
    }

    // Update view
    this.updateView();

    if (action.isJump) {
      globalState.jumpTracker.recordJump(
        Jump.fromStateBefore(this.vimState),
        Jump.fromStateNow(this.vimState),
      );
    }

    return true;
  }

  private async runAction(recordedState: RecordedState, action: IBaseAction): Promise<void> {
    this.selectionsChanged.ignoreIntermediateSelections = true;

    // We handle the end of selections different to VSCode. In order for VSCode to select
    // including the last character we will at the end of 'runAction' shift our stop position
    // to the right. So here we shift it back by one so that our actions have our correct
    // position instead of the position sent to VSCode.
    if (this.vimState.currentMode === Mode.Visual) {
      this.vimState.cursors = this.vimState.cursors.map((c) =>
        c.start.isBefore(c.stop) ? c.withNewStop(c.stop.getLeftThroughLineBreaks(true)) : c,
      );
    }

    // Make sure all cursors are within the document's bounds before running any action
    // It's not 100% clear to me that this is the correct place to do this, but it should solve a lot of issues
    this.vimState.cursors = this.vimState.cursors.map(
      (c) =>
        new Cursor(
          this.vimState.document.validatePosition(c.start),
          this.vimState.document.validatePosition(c.stop),
        ),
    );

    let ranRepeatableAction = false;
    let ranAction = false;

    if (action instanceof BaseMovement) {
      recordedState = await this.executeMovement(action);
      ranAction = true;
    } else if (action instanceof BaseCommand) {
      await action.execCount(this.vimState.cursorStopPosition, this.vimState);

      const transformer = this.vimState.recordedState.transformer;
      await executeTransformations(this, transformer.transformations);

      if (action.isCompleteAction) {
        ranAction = true;
      }

      if (action.createsUndoPoint) {
        ranRepeatableAction = true;
      }

      if (this.vimState.normalCommandState === NormalCommandState.Finished) {
        ranRepeatableAction = true;
      }
    } else if (action instanceof BaseOperator) {
      recordedState.operatorCount = recordedState.count;
    } else {
      throw new Error('Unknown action type');
    }

    // Update mode (note the ordering allows you to go into search mode,
    // then return and have the motion immediately applied to an operator).
    const prevMode = this.currentMode;
    if (this.vimState.currentMode !== this.currentMode) {
      await this.setCurrentMode(this.vimState.currentMode);

      // We don't want to mark any searches as a repeatable action
      if (
        this.vimState.currentMode === Mode.Normal &&
        prevMode !== Mode.SearchInProgressMode &&
        prevMode !== Mode.EasyMotionInputMode &&
        prevMode !== Mode.EasyMotionMode &&
        !(
          prevMode === Mode.CommandlineInProgress &&
          this.vimState.normalCommandState === NormalCommandState.Executing
        )
      ) {
        ranRepeatableAction = true;
      }
    }

    // If there's an operator pending and we have a motion or visual selection, run the operator
    if (recordedState.getOperatorState(this.vimState.currentMode) === 'ready') {
      const operator = this.vimState.recordedState.operator;
      if (operator) {
        await this.executeOperator();
        this.vimState.recordedState.hasRunOperator = true;
        ranRepeatableAction = operator.createsUndoPoint;
        ranAction = true;
      }
    }

    // And then we have to do it again because an operator could
    // have changed it as well. (TODO: do you even decomposition bro)
    if (this.vimState.currentMode !== this.currentMode) {
      await this.setCurrentMode(this.vimState.currentMode);

      if (this.vimState.currentMode === Mode.Normal) {
        ranRepeatableAction = true;
      }
    }

    ranRepeatableAction =
      (ranRepeatableAction && this.vimState.currentMode === Mode.Normal) ||
      this.createUndoPointForBrackets();

    // We don't want to record a repeatable action when exiting from these modes
    // by pressing <Esc>
    if (
      (prevMode === Mode.Visual ||
        prevMode === Mode.VisualBlock ||
        prevMode === Mode.VisualLine ||
        prevMode === Mode.CommandlineInProgress) &&
      action.keysPressed[0] === '<Esc>'
    ) {
      ranRepeatableAction = false;
    }

    // Record down previous action and flush temporary state
    if (
      ranRepeatableAction &&
      this.vimState.lastCommandDotRepeatable &&
      this.vimState.dotCommandStatus !== DotCommandStatus.Finished
    ) {
      globalState.previousFullAction = _.cloneDeep(this.vimState.recordedState);

      if (recordedState.isInsertion) {
        Register.setReadonlyRegister('.', recordedState);
      }
    }
    this.vimState.lastCommandDotRepeatable = true;

    // Update desiredColumn
    const preservesDesiredColumn =
      action instanceof BaseOperator && !ranAction ? true : action.preservesDesiredColumn;
    if (!preservesDesiredColumn) {
      if (action instanceof BaseMovement) {
        // We check !operator here because e.g. d$ should NOT set the desired column to EOL.
        if (action.setsDesiredColumnToEOL && !recordedState.operator) {
          this.vimState.desiredColumn = Number.POSITIVE_INFINITY;
        } else {
          this.vimState.desiredColumn = this.vimState.cursorStopPosition.character;
        }
      } else if (this.vimState.currentMode !== Mode.VisualBlock) {
        // TODO: explain why not VisualBlock
        this.vimState.desiredColumn = this.vimState.cursorStopPosition.character;
      }
    }

    // Like previously stated we handle the end of selections different to VSCode. In order
    // for VSCode to select including the last character we shift our stop position to the
    // right now that all steps that need that position have already run. On the next action
    // we will shift it back again on the start of 'runAction'.
    if (this.vimState.currentMode === Mode.Visual) {
      this.vimState.cursors = this.vimState.cursors.map((c) =>
        c.start.isBeforeOrEqual(c.stop)
          ? c.withNewStop(
              c.stop.isLineEnd() ? c.stop.getRightThroughLineBreaks() : c.stop.getRight(),
            )
          : c,
      );
    }

    // We've run a complete action sequence - wipe the slate clean with a new RecordedState
    if (
      ranAction &&
      this.vimState.currentMode === Mode.Normal &&
      this.vimState.dotCommandStatus !== DotCommandStatus.Executing
    ) {
      this.vimState.recordedState = new RecordedState();

      // Return to insert mode after 1 command in this case for <C-o>
      if (this.vimState.returnToInsertAfterCommand) {
        if (this.vimState.actionCount > 0) {
          await this.setCurrentMode(Mode.Insert);
        } else {
          this.vimState.actionCount++;
        }
      }
    }

    if (this.vimState.dotCommandStatus === DotCommandStatus.Finished) {
      this.vimState.dotCommandStatus = DotCommandStatus.Waiting;
    }

    // track undo history
    if (!this.focusChanged) {
      // important to ensure that focus didn't change, otherwise
      // we'll grab the text of the incorrect active window and assume the
      // whole document changed!

      this.vimState.historyTracker.addChange();
    }

    // Don't record an undo point for every action of a macro, only at the very end
    if (
      ranRepeatableAction &&
      !this.vimState.isReplayingMacro &&
      this.vimState.normalCommandState !== NormalCommandState.Executing &&
      this.vimState.dotCommandStatus !== DotCommandStatus.Executing &&
      !this.remapState.isCurrentlyPerformingRemapping
    ) {
      this.vimState.historyTracker.finishCurrentStep();
    }

    if (this.vimState.normalCommandState === NormalCommandState.Finished) {
      this.vimState.normalCommandState = NormalCommandState.Waiting;
    }

    recordedState.actionKeys = [];
    this.vimState.currentRegisterMode = undefined;

    // If we're in Normal mode, collapse each cursor down to one character
    if (this.currentMode === Mode.Normal) {
      this.vimState.cursors = this.vimState.cursors.map(
        (cursor) => new Cursor(cursor.stop, cursor.stop),
      );
    }

    // Ensure cursors are within bounds
    if (
      !this.vimState.document.isClosed &&
      this.vimState.editor === vscode.window.activeTextEditor
    ) {
      const documentEndPosition = TextEditor.getDocumentEnd(this.vimState.document);
      const documentLineCount = this.vimState.document.lineCount;

      this.vimState.cursors = this.vimState.cursors.map((cursor: Cursor) => {
        // Adjust start/stop
        if (cursor.start.line >= documentLineCount) {
          cursor = cursor.withNewStart(documentEndPosition);
        }
        if (cursor.stop.line >= documentLineCount) {
          cursor = cursor.withNewStop(documentEndPosition);
        }

        // Adjust column. When getting from insert into normal mode with <C-o>,
        // the cursor position should remain even if it is behind the last
        // character in the line
        if (
          !this.vimState.returnToInsertAfterCommand &&
          (this.vimState.currentMode === Mode.Normal || isVisualMode(this.vimState.currentMode))
        ) {
          const currentLineLength = TextEditor.getLineLength(cursor.stop.line);
          const currentStartLineLength = TextEditor.getLineLength(cursor.start.line);

          // When in visual mode you can move the cursor past the last character in order
          // to select that character. We use this offset to allow for that, otherwise
          // we would consider the position invalid and change it to the left of the last
          // character.
          const offsetAllowed =
            isVisualMode(this.vimState.currentMode) && currentLineLength > 0 ? 1 : 0;
          if (cursor.start.character >= currentStartLineLength) {
            cursor = cursor.withNewStart(
              cursor.start.withColumn(Math.max(currentStartLineLength - 1, 0)),
            );
          }

          if (cursor.stop.character >= currentLineLength + offsetAllowed) {
            cursor = cursor.withNewStop(cursor.stop.withColumn(Math.max(currentLineLength - 1, 0)));
          }
        }
        return cursor;
      });
    }

    if (
      isVisualMode(this.vimState.currentMode) &&
      this.vimState.dotCommandStatus !== DotCommandStatus.Executing
    ) {
      // Store selection for commands like gv
      this.vimState.lastVisualSelection = {
        mode: this.vimState.currentMode,
        start: this.vimState.cursorStartPosition,
        end: this.vimState.cursorStopPosition,
      };
    }

    this.selectionsChanged.ignoreIntermediateSelections = false;
  }

  private async executeMovement(movement: BaseMovement): Promise<RecordedState> {
    this.lastMovementFailed = false;
    const recordedState = this.vimState.recordedState;
    const cursorsToRemove: number[] = [];

    for (let i = 0; i < this.vimState.cursors.length; i++) {
      /**
       * Essentially what we're doing here is pretending like the
       * current VimState only has one cursor (the cursor that we just
       * iterated to).
       *
       * We set the cursor position to be equal to the iterated one,
       * and then set it back immediately after we're done.
       *
       * The slightly more complicated logic here allows us to write
       * Action definitions without having to think about multiple
       * cursors in almost all cases.
       */
      const oldCursorPositionStart = this.vimState.cursorStartPosition;
      const oldCursorPositionStop = this.vimState.cursorStopPosition;
      movement.multicursorIndex = i;

      this.vimState.cursorStartPosition = this.vimState.cursors[i].start;
      const cursorPosition = this.vimState.cursors[i].stop;
      this.vimState.cursorStopPosition = cursorPosition;

      const result = await movement.execActionWithCount(
        cursorPosition,
        this.vimState,
        recordedState.count,
      );

      // We also need to update the specific cursor, in case the cursor position was modified inside
      // the handling functions (e.g. 'it')
      this.vimState.cursors[i] = new Cursor(
        this.vimState.cursorStartPosition,
        this.vimState.cursorStopPosition,
      );

      this.vimState.cursorStartPosition = oldCursorPositionStart;
      this.vimState.cursorStopPosition = oldCursorPositionStop;

      if (result instanceof Position) {
        this.vimState.cursors[i] = this.vimState.cursors[i].withNewStop(result);

        if (!isVisualMode(this.currentMode) && !this.vimState.recordedState.operator) {
          this.vimState.cursors[i] = this.vimState.cursors[i].withNewStart(result);
        }
      } else {
        if (result.failed) {
          this.vimState.recordedState = new RecordedState();
          this.lastMovementFailed = true;
        }

        if (result.removed) {
          cursorsToRemove.push(i);
        } else {
          this.vimState.cursors[i] = new Cursor(result.start, result.stop);
        }
      }
    }

    if (cursorsToRemove.length > 0) {
      // Remove the cursors that no longer exist. Remove from the end to the start
      // so that the index values don't change.
      for (let i = cursorsToRemove.length - 1; i >= 0; i--) {
        const idx = cursorsToRemove[i];
        if (idx !== 0) {
          // We should never remove the main selection! This shouldn't happen, but just
          // in case it does, lets protect against it. Remember kids, always use protection!
          this.vimState.cursors.splice(idx, 1);
        }
      }
    }

    this.vimState.recordedState.count = 0;

    // Keep the cursor within bounds
    if (this.vimState.currentMode !== Mode.Normal || recordedState.operator) {
      const stop = this.vimState.cursorStopPosition;

      // Vim does this weird thing where it allows you to select and delete
      // the newline character, which it places 1 past the last character
      // in the line. This is why we use > instead of >=.

      if (stop.character > TextEditor.getLineLength(stop.line)) {
        this.vimState.cursorStopPosition = stop.getLineEnd();
      }
    }

    return recordedState;
  }

  private async executeOperator(): Promise<void> {
    const recordedState = this.vimState.recordedState;
    const operator = recordedState.operator!;

    // TODO - if actions were more pure, this would be unnecessary.
    const startingMode = this.vimState.currentMode;
    const startingRegisterMode = this.vimState.currentRegisterMode;

    const resultingCursors: Cursor[] = [];
    for (let [i, { start, stop }] of this.vimState.cursors.entries()) {
      operator.multicursorIndex = i;

      if (start.isAfter(stop)) {
        [start, stop] = [stop, start];
      }

      if (!isVisualMode(startingMode) && startingRegisterMode !== RegisterMode.LineWise) {
        stop = stop.getLeftThroughLineBreaks(true);
      }

      if (this.currentMode === Mode.VisualLine) {
        start = start.getLineBegin();
        stop = stop.getLineEnd();

        this.vimState.currentRegisterMode = RegisterMode.LineWise;
      }

      await this.vimState.setCurrentMode(startingMode);

      // We run the repeat version of an operator if the last 2 operators are the same.
      if (
        recordedState.operators.length > 1 &&
        recordedState.operators.reverse()[0].constructor ===
          recordedState.operators.reverse()[1].constructor
      ) {
        await operator.runRepeat(this.vimState, start, recordedState.count);
      } else {
        await operator.run(this.vimState, start, stop);
      }

      for (const transformation of this.vimState.recordedState.transformer.transformations) {
        if (isTextTransformation(transformation) && transformation.cursorIndex === undefined) {
          transformation.cursorIndex = operator.multicursorIndex;
        }
      }

      const resultingCursor = new Cursor(
        this.vimState.cursorStartPosition,
        this.vimState.cursorStopPosition,
      );

      resultingCursors.push(resultingCursor);
    }

    if (this.vimState.recordedState.transformer.transformations.length > 0) {
      const transformer = this.vimState.recordedState.transformer;
      await executeTransformations(this, transformer.transformations);
    } else {
      // Keep track of all cursors (in the case of multi-cursor).
      this.vimState.cursors = resultingCursors;
    }
  }

  public async rerunRecordedState(transformation: Dot): Promise<void> {
    let recordedState = transformation.recordedState.clone();
    const actions = [...recordedState.actionsRun];

    this.vimState.dotCommandStatus = DotCommandStatus.Executing;

    // If a previous visual selection exists, store it for use in replay of some commands
    if (this.vimState.lastVisualSelection) {
      this.vimState.dotCommandPreviousVisualSelection = new vscode.Selection(
        this.vimState.lastVisualSelection.start,
        this.vimState.lastVisualSelection.end,
      );
    }

    let replayMode = null;
    if (actions[0] instanceof CommandInsertAtCursor) {
      replayMode = ReplayMode.Insert;
    } else if (actions[0] instanceof ActionReplaceCharacter) {
      replayMode = ReplayMode.Replace;
    } else if (actions[0] instanceof CommandRegister) {
      // Increment numbered registers "1 to "9.
      const keyPressed = Number(actions[0].keysPressed[1]);
      if (!isNaN(keyPressed) && keyPressed > 0 && keyPressed < 9) {
        actions[0].keysPressed[1] = String(keyPressed + 1);
      }
    }
    for (let j = 0; j < transformation.count; j++) {
      recordedState = new RecordedState();
      this.vimState.recordedState = recordedState;
      for (const [i, action] of actions.entries()) {
        if (
          replayMode === ReplayMode.Insert &&
          !(j === transformation.count - 1 && i === actions.length - 1) &&
          action instanceof CommandEscInsertMode
        ) {
          continue;
        }
        recordedState.actionsRun = actions.slice(0, i + 1);
        await this.runAction(recordedState, action);

        if (this.lastMovementFailed) {
          break;
        }

        this.updateView();
        if (
          replayMode === ReplayMode.Replace &&
          !(j === transformation.count - 1 && i === actions.length - 1)
        ) {
          this.vimState.cursorStopPosition = this.vimState.cursorStartPosition = new Position(
            this.vimState.cursorStopPosition.line,
            this.vimState.cursorStopPosition.character + 1,
          );
        }
      }
    }
    let combinedActions: IBaseAction[] = [];
    for (let i = 0; i < transformation.count; i++) {
      combinedActions = combinedActions.concat(actions);
    }
    recordedState.actionsRun = combinedActions;
    this.vimState.dotCommandStatus = DotCommandStatus.Finished;
  }

  public async runMacro(recordedMacro: RecordedState): Promise<void> {
    let recordedState = new RecordedState();
    this.vimState.recordedState = recordedState;

    for (const action of recordedMacro.actionsRun) {
      const originalLocation = Jump.fromStateNow(this.vimState);

      this.vimState.cursorsInitialState = this.vimState.cursors;

      recordedState.actionsRun.push(action);

      await this.runAction(recordedState, action);

      // We just finished a full action; let's clear out our current state.
      if (this.vimState.recordedState.actionsRun.length === 0) {
        recordedState = new RecordedState();
        this.vimState.recordedState = recordedState;
      }

      if (this.lastMovementFailed) {
        break;
      }

      this.updateView();

      if (action.isJump) {
        globalState.jumpTracker.recordJump(originalLocation, Jump.fromStateNow(this.vimState));
      }
    }

    this.vimState.dotCommandStatus = DotCommandStatus.Finished;
    this.vimState.cursorsInitialState = this.vimState.cursors;
  }

  private updateSearchHighlights(showHighlights: boolean) {
    const cacheKey = this.searchDecorationCacheKey;
    this.searchDecorationCacheKey = undefined;

    let decorations: SearchDecorations | undefined;
    if (showHighlights) {
      if (
        this.vimState.modeData.mode === Mode.CommandlineInProgress ||
        this.vimState.modeData.mode === Mode.SearchInProgressMode
      ) {
        decorations = this.vimState.modeData.commandLine.getDecorations(this.vimState);
      } else if (globalState.searchState) {
        if (
          cacheKey &&
          cacheKey.searchString === globalState.searchState.searchString &&
          cacheKey.documentVersion === this.vimState.document.version
        ) {
          // The decorations are fine as-is, don't waste time re-calculating
          this.searchDecorationCacheKey = cacheKey;
          return;
        }
        // If there are no decorations from the command line, get decorations for previous SearchState
        decorations = getDecorationsForSearchMatchRanges(
          globalState.searchState.getMatchRanges(this.vimState),
        );
        this.searchDecorationCacheKey = {
          searchString: globalState.searchState.searchString,
          documentVersion: this.vimState.document.version,
        };
      }
    }

    this.vimState.editor.setDecorations(
      decoration.searchHighlight,
      decorations?.searchHighlight ?? [],
    );
    this.vimState.editor.setDecorations(decoration.searchMatch, decorations?.searchMatch ?? []);
    this.vimState.editor.setDecorations(
      decoration.substitutionAppend,
      decorations?.substitutionAppend ?? [],
    );
    this.vimState.editor.setDecorations(
      decoration.substitutionReplace,
      decorations?.substitutionReplace ?? [],
    );
  }

  public updateView(
    args: { drawSelection: boolean; revealRange: boolean } = {
      drawSelection: true,
      revealRange: true,
    },
  ): void {
    // Draw selection (or cursor)
    if (args.drawSelection) {
      let selectionMode: Mode = this.vimState.currentMode;
      if (this.vimState.modeData.mode === Mode.SearchInProgressMode) {
        selectionMode = this.vimState.modeData.commandLine.previousMode;
      } else if (this.vimState.modeData.mode === Mode.CommandlineInProgress) {
        selectionMode = this.vimState.modeData.commandLine.previousMode;
      } else if (this.vimState.modeData.mode === Mode.SurroundInputMode) {
        selectionMode = this.vimState.surround!.previousMode;
      }

      let selections: vscode.Selection[] = [];
      for (const cursor of this.vimState.cursors) {
        let { start, stop } = cursor;
        switch (selectionMode) {
          case Mode.Visual:
            /**
             * Always select the letter that we started visual mode on, no matter
             * if we are in front or behind it. Imagine that we started visual mode
             * with some text like this:
             *
             *   abc|def
             *
             * (The | represents the cursor.) If we now press w, we'll select def,
             * but if we hit b we expect to select abcd, so we need to getRight() on the
             * start of the selection when it precedes where we started visual mode.
             */
            if (start.isAfterOrEqual(stop)) {
              start = start.getRight();
            }

            selections.push(new vscode.Selection(start, stop));
            break;

          case Mode.VisualLine:
            if (start.isBeforeOrEqual(stop)) {
              selections.push(new vscode.Selection(start.getLineBegin(), stop.getLineEnd()));
            } else {
              selections.push(new vscode.Selection(start.getLineEnd(), stop.getLineBegin()));
            }
            break;

          case Mode.VisualBlock:
            for (const line of TextEditor.iterateLinesInBlock(this.vimState, cursor)) {
              selections.push(
                new vscode.Selection(
                  this.vimState.document.validatePosition(line.start),
                  this.vimState.document.validatePosition(line.end),
                ),
              );
            }
            break;

          case Mode.Insert:
            // Don't collapse existing selections in insert mode
            selections.push(new vscode.Selection(start, stop));
            break;

          default:
            // Note that this collapses the selection onto one position
            selections.push(new vscode.Selection(stop, stop));
            break;
        }
      }

      /**
       * Combine instersected selections - When we have multiple cursors
       * sometimes those cursors selections intersect and combine, we need
       * to check that here so that we know if our currents cursors will
       * trigger a selectionChangeEvent or not. If we didn't check for this
       * vscode might already have the resulting combined selection selected
       * but since that wouldn't be the same as our selections we would think
       * there would be a selectionChangeEvent when there wouldn't be any.
       */
      const getSelectionsCombined = (sel: vscode.Selection[]) => {
        const combinedSelections: vscode.Selection[] = [];
        sel.forEach((s, i) => {
          if (i > 0) {
            const previousSelection = combinedSelections[combinedSelections.length - 1];
            const overlap = s.intersection(previousSelection);
            if (overlap) {
              combinedSelections[combinedSelections.length - 1] = s.anchor.isBeforeOrEqual(s.active)
                ? // Forwards Selection
                  new vscode.Selection(
                    earlierOf(s.anchor, previousSelection.anchor),
                    laterOf(s.active, previousSelection.active),
                  )
                : // Backwards Selection
                  new vscode.Selection(
                    laterOf(s.anchor, previousSelection.anchor),
                    earlierOf(s.active, previousSelection.active),
                  );
            } else {
              combinedSelections.push(s);
            }
          } else {
            combinedSelections.push(s);
          }
        });
        return combinedSelections;
      };
      selections = getSelectionsCombined(selections);

      // Check if the selection we are going to set is different than the current one.
      // If they are the same vscode won't trigger a selectionChangeEvent so we don't
      // have to add it to the ignore selections.
      const willTriggerChange =
        selections.length !== this.vimState.editor.selections.length ||
        selections.some(
          (s, i) =>
            !s.anchor.isEqual(this.vimState.editor.selections[i].anchor) ||
            !s.active.isEqual(this.vimState.editor.selections[i].active),
        );

      if (willTriggerChange) {
        const selectionsHash = selections.reduce(
          (hash, s) =>
            hash +
            `[${s.anchor.line}, ${s.anchor.character}; ${s.active.line}, ${s.active.character}]`,
          '',
        );
        this.selectionsChanged.ourSelections.push(selectionsHash);
        Logger.trace(
          `Adding selection change to be ignored! (total: ${
            this.selectionsChanged.ourSelections.length
          }) Hash: ${selectionsHash}, Selections: ${selections[0].anchor.toString()}, ${selections[0].active.toString()}`,
        );
      }

      this.vimState.editor.selections = selections;
    }

    // cursor style
    let cursorStyle = configuration.getCursorStyleForMode(this.currentMode);
    if (!cursorStyle) {
      const cursorType = getCursorType(
        this.vimState,
        this.vimState.currentModeIncludingPseudoModes,
      );
      cursorStyle = getCursorStyle(cursorType);
      if (
        cursorType === VSCodeVimCursorType.Native &&
        configuration.editorCursorStyle !== undefined
      ) {
        cursorStyle = configuration.editorCursorStyle;
      }
    }
    this.vimState.editor.options.cursorStyle = cursorStyle;

    // Scroll to position of cursor
    // (This needs to run after cursor style as setting editor.options recomputes the scroll position and breaks when smooth scrolling is enabled: #8254)
    if (
      this.vimState.editor.visibleRanges.length > 0 &&
      !this.vimState.postponedCodeViewChanges.some((change) => change.command === 'editorScroll')
    ) {
      /**
       * This variable decides to which cursor we scroll the view.
       * It is meant as a patch to #880.
       * Extend this condition if it is the desired behaviour for other actions as well.
       */
      const isLastCursorTracked =
        this.vimState.recordedState.actionsRun[
          this.vimState.recordedState.actionsRun.length - 1
        ] instanceof ActionOverrideCmdD;

      let cursorToTrack: Cursor;
      if (isLastCursorTracked) {
        cursorToTrack = this.vimState.cursors[this.vimState.cursors.length - 1];
      } else {
        cursorToTrack = this.vimState.cursors[0];
      }

      const isCursorAboveRange = (visibleRange: vscode.Range): boolean =>
        visibleRange.start.line - cursorToTrack.stop.line >= 15;
      const isCursorBelowRange = (visibleRange: vscode.Range): boolean =>
        cursorToTrack.stop.line - visibleRange.end.line >= 15;

      const { visibleRanges } = this.vimState.editor;
      const centerViewportAroundCursor =
        visibleRanges.every(isCursorAboveRange) || visibleRanges.every(isCursorBelowRange);

      const revealType = centerViewportAroundCursor
        ? vscode.TextEditorRevealType.InCenter
        : vscode.TextEditorRevealType.Default;

      if (this.vimState.modeData.mode === Mode.SearchInProgressMode && configuration.incsearch) {
        const currentMatch = this.vimState.modeData.commandLine.getCurrentMatchRange(this.vimState);

        if (currentMatch) {
          this.vimState.editor.revealRange(currentMatch.range, revealType);
        } else if (this.vimState.modeData.mode === Mode.SearchInProgressMode) {
          const offset =
            this.vimState.editor.visibleRanges[0].start.line -
            this.vimState.modeData.firstVisibleLineBeforeSearch;
          scrollView(this.vimState, offset);
        }
      } else if (args.revealRange) {
        if (
          !isLastCursorTracked ||
          this.vimState.cursorsInitialState.length !== this.vimState.cursors.length
        ) {
          /**
           * We scroll the view if either:
           * 1. the cursor we want to keep in view is the main one (this is the "standard"
           * (before this commit) situation)
           * 2. if we track the last cursor, but no additional cursor was created in this step
           * (in the Cmd+D situation this means that no other matches were found)
           */
          this.vimState.editor.revealRange(
            new vscode.Range(cursorToTrack.stop, cursorToTrack.stop),
            revealType,
          );
        }
      }
    }

    // cursor block
    const cursorRange: vscode.Range[] = [];
    if (
      getCursorType(this.vimState, this.currentMode) === VSCodeVimCursorType.TextDecoration &&
      this.currentMode !== Mode.Insert
    ) {
      // Fake block cursor with text decoration. Unfortunately we can't have a cursor
      // in the middle of a selection natively, which is what we need for Visual Mode.
      if (this.currentMode === Mode.Visual) {
        for (const { start: cursorStart, stop: cursorStop } of this.vimState.cursors) {
          if (cursorStart.isBefore(cursorStop)) {
            cursorRange.push(new vscode.Range(cursorStop.getLeft(), cursorStop));
          } else {
            cursorRange.push(new vscode.Range(cursorStop, cursorStop.getRight()));
          }
        }
      } else {
        for (const { stop: cursorStop } of this.vimState.cursors) {
          cursorRange.push(new vscode.Range(cursorStop, cursorStop.getRight()));
        }
      }
    }

    this.vimState.editor.setDecorations(decoration.default, cursorRange);

    // Insert Mode virtual characters: used to temporarily show the remapping pressed keys on
    // insert mode, to show the `"` character after pressing `<C-r>`, and to show `?` and the
    // first character when inserting digraphs with `<C-k>`.
    const iModeVirtualCharDecorationOptions: vscode.DecorationOptions[] = [];
    if (this.vimState.currentMode === Mode.Insert || this.vimState.currentMode === Mode.Replace) {
      let virtualKey: string | undefined;
      if (this.vimState.recordedState.bufferedKeys.length > 0) {
        virtualKey =
          this.vimState.recordedState.bufferedKeys[
            this.vimState.recordedState.bufferedKeys.length - 1
          ];
      } else if (this.vimState.recordedState.waitingForAnotherActionKey) {
        virtualKey =
          this.vimState.recordedState.actionKeys[this.vimState.recordedState.actionKeys.length - 1];
        if (virtualKey === '<C-r>') {
          virtualKey = '"';
        } else if (virtualKey === '<C-k>') {
          virtualKey = '?';
        }
      }
      // Don't show keys with `<` like `<C-x>` but show everything else
      virtualKey = virtualKey && /<[^>]+>/.test(virtualKey) ? undefined : virtualKey;

      if (virtualKey) {
        // Normal Render Options with the key to overlap on the next character
        const renderOptions: vscode.ThemableDecorationRenderOptions = {
          before: {
            contentText: virtualKey,
          },
        };

        /**
         * EOL Render Options:
         * Some times when at the end of line the `currentColor` won't work, or it might be
         * transparent, so we set the color to 'editor.foreground' when at EOL to avoid the
         * virtualKey character not showing up.
         */
        const eolRenderOptions: vscode.ThemableDecorationRenderOptions = {
          before: {
            contentText: virtualKey,
            color: new vscode.ThemeColor('editor.foreground'),
          },
        };

        for (const { stop: cursorStop } of this.vimState.cursors) {
          if (cursorStop.isLineEnd()) {
            iModeVirtualCharDecorationOptions.push({
              range: new vscode.Range(cursorStop, cursorStop.getLineEndIncludingEOL()),
              renderOptions: eolRenderOptions,
            });
          } else {
            iModeVirtualCharDecorationOptions.push({
              range: new vscode.Range(cursorStop, cursorStop.getRightThroughLineBreaks(true)),
              renderOptions,
            });
          }
        }
      }
    }

    this.vimState.editor.setDecorations(
      decoration.insertModeVirtualCharacter,
      iModeVirtualCharDecorationOptions,
    );

    // OperatorPendingMode half block cursor
    const opCursorDecorations: vscode.DecorationOptions[] = [];
    const opCursorCharDecorations: vscode.DecorationOptions[] = [];
    if (this.vimState.currentModeIncludingPseudoModes === Mode.OperatorPendingMode) {
      for (const { stop: cursorStop } of this.vimState.cursors) {
        let text = TextEditor.getCharAt(this.vimState.document, cursorStop);
        // the ' ' (<space>) needs to be changed to '&nbsp;'
        text = text === ' ' ? '\u00a0' : text;
        const decorationOptions = {
          range: new vscode.Range(cursorStop, cursorStop.getRight()),
          renderOptions: {
            before: {
              contentText: text,
            },
          },
        };
        opCursorDecorations.push(decorationOptions);
        opCursorCharDecorations.push(decorationOptions);
      }
    }

    this.vimState.editor.setDecorations(decoration.operatorPendingModeCursor, opCursorDecorations);
    this.vimState.editor.setDecorations(
      decoration.operatorPendingModeCursorChar,
      opCursorCharDecorations,
    );

    for (const markDecoration of decoration.allMarkDecorations()) {
      this.vimState.editor.setDecorations(markDecoration, []);
    }

    if (configuration.showMarksInGutter) {
      for (const mark of this.vimState.historyTracker.getMarks()) {
        if (mark.isUppercaseMark && mark.document !== this.vimState.document) {
          continue;
        }

        const markDecoration = decoration.getOrCreateMarkDecoration(mark.name);
        const markLine = mark.position.getLineBegin();
        const markRange = new vscode.Range(markLine, markLine);

        this.vimState.editor.setDecorations(markDecoration, [markRange]);
      }
    }

    const showHighlights =
      (configuration.incsearch &&
        (this.currentMode === Mode.SearchInProgressMode ||
          this.currentMode === Mode.CommandlineInProgress)) ||
      (configuration.inccommand && this.currentMode === Mode.CommandlineInProgress) ||
      (configuration.hlsearch && globalState.hl);
    for (const editor of vscode.window.visibleTextEditors) {
      const mh = this.handlerMap.get(editor.document.uri);
      if (mh) {
        mh.updateSearchHighlights(showHighlights);
      }
    }

    const easyMotionDimRanges =
      this.currentMode === Mode.EasyMotionInputMode &&
      configuration.easymotionDimBackground &&
      this.vimState.easyMotion.searchAction instanceof SearchByNCharCommand
        ? [
            new vscode.Range(
              TextEditor.getDocumentBegin(),
              TextEditor.getDocumentEnd(this.vimState.document),
            ),
          ]
        : [];
    const easyMotionHighlightRanges =
      this.currentMode === Mode.EasyMotionInputMode &&
      this.vimState.easyMotion.searchAction instanceof SearchByNCharCommand
        ? this.vimState.easyMotion.searchAction
            .getMatches(this.vimState.cursorStopPosition, this.vimState)
            .map((match) => match.toRange())
        : [];
    this.vimState.editor.setDecorations(decoration.easyMotionDimIncSearch, easyMotionDimRanges);
    this.vimState.editor.setDecorations(decoration.easyMotionIncSearch, easyMotionHighlightRanges);

    for (const viewChange of this.vimState.postponedCodeViewChanges) {
      void vscode.commands.executeCommand(viewChange.command, viewChange.args);
    }
    this.vimState.postponedCodeViewChanges = [];

    if (this.currentMode === Mode.EasyMotionMode) {
      // Update all EasyMotion decorations
      this.vimState.easyMotion.updateDecorations(this.vimState.editor);
    }

    StatusBar.clear(this.vimState, false);

    // NOTE: this is not being awaited to save the 15-20ms block - I think this is fine
    void VSCodeContext.set('vim.mode', Mode[this.vimState.currentMode]);

    // Tell VSCode that the cursor position changed, so it updates its highlights for `editor.occurrencesHighlight`.
    const range = new vscode.Range(
      this.vimState.cursorStartPosition,
      this.vimState.cursorStopPosition,
    );
    if (!/\s+/.test(this.vimState.document.getText(range))) {
      void vscode.commands.executeCommand('editor.action.wordHighlight.trigger');
    }
  }

  // Return true if a new undo point should be created based on brackets and parentheses
  private createUndoPointForBrackets(): boolean {
    // }])> keys all start a new undo state when directly next to an {[(< opening character
    const key =
      this.vimState.recordedState.actionKeys[this.vimState.recordedState.actionKeys.length - 1];

    if (key === undefined) {
      return false;
    }

    if (this.vimState.currentMode === Mode.Insert) {
      // Check if the keypress is a closing bracket to a corresponding opening bracket right next to it
      let result = PairMatcher.nextPairedChar(
        this.vimState.cursorStopPosition,
        key,
        this.vimState,
        false,
      );
      if (result !== undefined) {
        if (this.vimState.cursorStopPosition.isEqual(result)) {
          return true;
        }
      }

      result = PairMatcher.nextPairedChar(
        this.vimState.cursorStopPosition.getLeft(),
        key,
        this.vimState,
        false,
      );
      if (result !== undefined) {
        if (this.vimState.cursorStopPosition.getLeft(2).isEqual(result)) {
          return true;
        }
      }
    }

    return false;
  }

  dispose() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    this.disposables.map((d) => d.dispose());
  }
}

function getCursorType(vimState: VimState, mode: Mode): VSCodeVimCursorType {
  switch (mode) {
    case Mode.Normal:
      return VSCodeVimCursorType.Block;
    case Mode.Insert:
      return VSCodeVimCursorType.Native;
    case Mode.Visual:
      return VSCodeVimCursorType.TextDecoration;
    case Mode.VisualBlock:
      return VSCodeVimCursorType.TextDecoration;
    case Mode.VisualLine:
      return VSCodeVimCursorType.TextDecoration;
    case Mode.SearchInProgressMode:
      return VSCodeVimCursorType.UnderlineThin;
    case Mode.CommandlineInProgress:
      return VSCodeVimCursorType.UnderlineThin;
    case Mode.Replace:
      return VSCodeVimCursorType.Underline;
    case Mode.EasyMotionMode:
      return VSCodeVimCursorType.Block;
    case Mode.EasyMotionInputMode:
      return VSCodeVimCursorType.Block;
    case Mode.SurroundInputMode:
      return getCursorType(vimState, vimState.surround!.previousMode);
    case Mode.OperatorPendingMode:
      return VSCodeVimCursorType.UnderlineThin;
    case Mode.Disabled:
    default:
      return VSCodeVimCursorType.Line;
  }
}
