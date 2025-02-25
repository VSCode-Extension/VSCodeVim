/**
 * HistoryTracker is a handrolled undo/redo tracker for VSC. We currently
 * track history as a list of "steps", each of which consists of 1 or more
 * "changes".
 *
 * A Change is something like adding or deleting a few letters.
 *
 * A Step is multiple Changes.
 *
 * Undo/Redo will advance forward or backwards through Steps.
 */
import * as DiffMatchPatch from 'diff-match-patch';
import * as vscode from 'vscode';

import { VimState } from './../state/vimState';
import { TextEditor } from './../textEditor';
import { StatusBar } from '../statusBar';
import { Position } from 'vscode';
import { Jump } from '../jumps/jump';
import { globalState } from '../state/globalState';
import { Mode } from '../mode/mode';
import { ErrorCode, VimError } from '../error';
import { Logger } from '../util/logger';
import { earlierOf } from '../common/motion/position';
import { MarkHistory } from './historyFile';
import { ExtensionContext } from 'vscode';

const diffEngine = new DiffMatchPatch.diff_match_patch();
diffEngine.Diff_Timeout = 1; // 1 second

class DocumentChange {
  /**
   * The Position at which this change starts
   */
  public readonly start: Position;

  /**
   * The text that existed before this change
   */
  public readonly before: string;

  /**
   * The text that exists after this change
   */
  public readonly after: string;

  public static insert(start: Position, text: string) {
    return new DocumentChange(start, '', text);
  }

  public static delete(start: Position, text: string) {
    return new DocumentChange(start, text, '');
  }

  public static replace(start: Position, before: string, after: string) {
    return new DocumentChange(start, before, after);
  }

  /**
   * @returns A new DocumentChange that represents undoing this change
   */
  public reversed() {
    return DocumentChange.replace(this.start, this.after, this.before);
  }

  private constructor(start: Position, before: string, after: string) {
    this.start = start;
    this.before = before;
    this.after = after;
  }

  /**
   * Run this change.
   */
  public async do(editor: vscode.TextEditor): Promise<void> {
    await TextEditor.replace(editor, this.beforeRange, this.after);
  }

  /**
   * Run this change in reverse.
   */
  public async undo(editor: vscode.TextEditor): Promise<void> {
    await TextEditor.replace(editor, this.afterRange, this.before);
  }

  /**
   * The Range that the before text occupied
   */
  public get beforeRange(): vscode.Range {
    return new vscode.Range(this.start, this.start.advancePositionByText(this.before));
  }

  /**
   * The Range that the after text occupies
   */
  public get afterRange(): vscode.Range {
    return new vscode.Range(this.start, this.start.advancePositionByText(this.after));
  }
}

export interface IMark {
  name: string;
  position: Position;
  isUppercaseMark: boolean;
  document?: vscode.TextDocument; // only required when using global marks (isUppercaseMark is true)
}

/**
 * An undo's worth of changes; generally corresponds to a single action.
 */
export class HistoryStep {
  /**
   * The insertions and deletions that occured in this history step.
   */
  public changes: DocumentChange[];

  /**
   * Whether the user is still inserting or deleting for this history step.
   */
  public isFinished = false;

  /**
   * When this step was finished.
   * // TODO: we currently set it to the current time upon creation to cover some edge cases, but this is messy.
   */
  public timestamp: Date;

  /**
   * The cursor position at the start of this history step.
   * Restored by `u`. Currently, only one cursor is remembered.
   */
  public cursorStart: Position | undefined;

  /**
   * The position of every mark at the start of this history step.
   */
  public marks: IMark[] = [];

  /**
   * HACK: true if this step came from `U`.
   * In `UU`, the second `U` should undo the first, and no more.
   */
  public readonly cameFromU: boolean;

  /**
   * "global" marks which operate across files. (when IMark.name is uppercase)
   */
  static globalMarks: IMark[] = [];

  /**
   * all the local marks which were restored from the history file
   */
  static historyLocalMarks: IMark[] = [];

  public static markHistory: MarkHistory;

  public static async loadHistory(context: ExtensionContext): Promise<void> {
    HistoryStep.markHistory = new MarkHistory(context);
    await HistoryStep.markHistory.load();
    HistoryStep.markHistory.get().forEach((row) => {
      const newMark: IMark = JSON.parse(row) as IMark;
      newMark.position = new Position(newMark.position.line, newMark.position.character);
      if (newMark.isUppercaseMark) {
        HistoryStep.globalMarks.push(newMark);
      } else {
        this.historyLocalMarks.push(newMark);
      }
    });
  }

  constructor(init: { marks: IMark[]; changes?: DocumentChange[]; cameFromU?: boolean }) {
    this.changes = init.changes ?? [];
    this.marks = init.marks ?? [];
    this.cameFromU = init.cameFromU ?? false;

    // This will usually be overwritten when the HistoryStep is finished
    this.timestamp = new Date();
  }

  /**
   * Collapse individual character changes into larger blocks of changes
   */
  public merge(document: vscode.TextDocument): void {
    if (this.changes.length < 2) {
      return;
    }

    // merged will replace this.changes
    const merged: DocumentChange[] = [];
    // manually reduce() this.changes with variables `current` and `next`
    // we can't use reduce() directly because the loop can emit multiple elements
    let current = this.changes[0];
    for (const next of this.changes.slice(1)) {
      if (current.before.length + current.after.length === 0) {
        // current is eliminated, replace it with top of merged, or adopt next as current
        // see also add+del case
        if (merged.length > 0) {
          current = merged.pop()!;
        } else {
          current = next;
          continue;
        }
      }

      const intersect = current.afterRange.intersection(next.beforeRange);
      if (intersect) {
        const [first, second] = current.start.isBeforeOrEqual(next.start)
          ? [current, next]
          : [next, current];
        const intersectLength =
          document.offsetAt(intersect.end) - document.offsetAt(intersect.start);
        current = DocumentChange.replace(
          first.start,
          first.before + second.before.slice(intersectLength),
          first.after.slice(0, first.after.length - intersectLength) + second.after,
        );
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    this.changes = merged;
  }

  /**
   * Returns, as a string, the time that has passed since this step took place.
   */
  public howLongAgo(): string {
    const now = new Date();
    const timeDiffMillis = now.getTime() - this.timestamp.getTime();
    const timeDiffSeconds = Math.floor(timeDiffMillis / 1000);
    if (timeDiffSeconds === 1) {
      return `1 second ago`;
    } else if (timeDiffSeconds >= 100) {
      const hours = this.timestamp.getHours();
      const minutes = this.timestamp.getMinutes().toString().padStart(2, '0');
      const seconds = this.timestamp.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    } else {
      return `${timeDiffSeconds} seconds ago`;
    }
  }
}

/**
 * A simple wrapper around a list of HistorySteps, for sanity's sake
 */
class UndoStack {
  private historySteps: HistoryStep[] = [];
  private currentStepIndex = -1;

  // The marks as they existed before the first HistoryStep
  private initialMarks: IMark[];

  constructor(initialMarks: IMark[]) {
    this.initialMarks = initialMarks;
  }

  public getHistoryStepAtIndex(idx: number): HistoryStep | undefined {
    return this.historySteps[idx];
  }

  public getCurrentHistoryStepIndex(): number {
    return this.currentStepIndex;
  }

  public getStackDepth(): number {
    return this.historySteps.length;
  }

  /**
   * @returns the current HistoryStep, or undefined if nothing's been done yet
   */
  public getCurrentHistoryStep(): HistoryStep | undefined {
    if (this.currentStepIndex === -1) {
      return undefined;
    }

    return this.historySteps[this.currentStepIndex];
  }

  /**
   * Goes forward in time (redo), if possible
   *
   * @returns the new current HistoryStep, or undefined if none exists
   */
  public stepForward(): HistoryStep | undefined {
    if (this.currentStepIndex === this.historySteps.length - 1) {
      return undefined;
    }

    this.currentStepIndex++;
    return this.getCurrentHistoryStep();
  }

  /**
   * Goes backward in time (undo), if possible
   *
   * @returns the old HistoryStep, or undefined if there was none
   */
  public stepBackward(): HistoryStep | undefined {
    const step = this.getCurrentHistoryStep();
    if (step) {
      this.currentStepIndex--;
    }
    return step;
  }

  /**
   * Adds a change to the current unfinished step if there is one, or a new step if there isn't
   */
  public pushChange(change: DocumentChange): void {
    let step = this.getCurrentHistoryStep();
    if (step === undefined || step.isFinished) {
      this.currentStepIndex++;
      this.historySteps.splice(this.currentStepIndex);
      step = new HistoryStep({
        marks: step?.marks ?? this.initialMarks,
      });
      this.historySteps.push(step);
    }

    step.changes.push(change);
  }

  /**
   * You probably don't want to use this.
   * @see pushChange
   */
  public pushHistoryStep(step: HistoryStep) {
    this.currentStepIndex++;
    this.historySteps.splice(this.currentStepIndex + 1);
    this.historySteps.push(step);
  }

  public getCurrentMarkList(): IMark[] {
    const step = this.getCurrentHistoryStep();
    return step?.marks ?? this.initialMarks;
  }

  public removeMarks(marks?: string[]): void {
    const step = this.getCurrentHistoryStep();
    if (marks === undefined) {
      if (step) {
        step.marks = [];
      } else {
        this.initialMarks = [];
      }
    } else {
      if (step) {
        step.marks = step.marks.filter((m) => !marks.includes(m.name));
      } else {
        this.initialMarks = this.initialMarks.filter((m) => !marks.includes(m.name));
      }
    }
  }
}

class ChangeList {
  private readonly changeLocations: Position[] = [];
  private index: number | undefined;

  public addChangePosition(position: Position) {
    if (
      this.changeLocations.length > 0 &&
      this.changeLocations[this.changeLocations.length - 1].line === position.line
    ) {
      this.changeLocations[this.changeLocations.length - 1] = position;
    } else {
      this.changeLocations.push(position);
    }

    this.index = undefined;
  }

  public nextChangePosition(): Position | VimError {
    if (this.index === undefined) {
      if (this.changeLocations.length === 0) {
        return VimError.fromCode(ErrorCode.ChangeListIsEmpty);
      }
      this.index = this.changeLocations.length - 1;
      return this.changeLocations[this.index];
    } else if (this.index < this.changeLocations.length - 1) {
      this.index++;
      return this.changeLocations[this.index];
    } else {
      return VimError.fromCode(ErrorCode.AtEndOfChangeList);
    }
  }

  public prevChangePosition(): Position | VimError {
    if (this.index === undefined) {
      if (this.changeLocations.length === 0) {
        return VimError.fromCode(ErrorCode.ChangeListIsEmpty);
      }
      this.index = this.changeLocations.length - 1;
      return this.changeLocations[this.index];
    } else if (this.index > 0) {
      this.index--;
      return this.changeLocations[this.index];
    } else {
      return VimError.fromCode(ErrorCode.AtStartOfChangeList);
    }
  }
}

export class HistoryTracker {
  public currentContentChanges: vscode.TextDocumentContentChangeEvent[];

  private nextStepStartPosition: Position | undefined;

  private readonly undoStack: UndoStack;

  private readonly changeList: ChangeList;

  /**
   * The state of the document the last time HistoryTracker.addChange() or HistoryTracker.ignoreChange() was called.
   * This is used to avoid retrieiving the document text and doing a full diff when it isn't necessary.
   */
  private previousDocumentState: {
    text: string;
    versionNumber: number;
  };

  private readonly vimState: VimState;

  constructor(vimState: VimState) {
    this.vimState = vimState;

    // get all the local marks which belong to this document and set these as the initial marks
    const initialMarks = HistoryStep.historyLocalMarks.filter((mark) => {
      return !mark.isUppercaseMark && mark.document?.uri.path === vimState.document.uri.path;
    });
    this.undoStack = new UndoStack(initialMarks);
    this.changeList = new ChangeList();
    this.previousDocumentState = {
      text: this.getDocumentText(),
      versionNumber: this.getDocumentVersion(),
    };
    this.currentContentChanges = [];
  }

  private getDocumentText(): string {
    // vimState.editor can be undefined in some unit tests
    return this.vimState.editor?.document.getText() ?? '';
  }

  private getDocumentVersion(): number {
    // vimState.editor can be undefined in some unit tests
    return this.vimState.editor?.document.version ?? -1;
  }

  /**
   * Marks refer to relative locations in the document, rather than absolute ones.
   *
   * This big gnarly method updates our marks such that they continue to mark
   * the same character when the user does a document edit that would move the
   * text that was marked.
   */
  private updateAndReturnMarks(document: vscode.TextDocument): IMark[] {
    const previousMarks = this.getAllMarksInDocument(document);
    const newMarks: IMark[] = [];

    // clone old marks into new marks
    for (const mark of previousMarks) {
      newMarks.push({ ...mark });
    }

    for (const change of this.undoStack.getCurrentHistoryStep()?.changes ?? []) {
      for (const newMark of newMarks) {
        // Run through each character added/deleted, and see if it could have
        // affected the position of this mark.

        let pos = change.start;

        // Pull mark back with deleted text
        for (const ch of change.before.replace(/\r/g, '')) {
          if (pos.isBefore(newMark.position)) {
            if (ch === '\n') {
              newMark.position = new Position(
                Math.max(newMark.position.line - 1, 0),
                newMark.position.character,
              );
            } else if (pos.line === newMark.position.line) {
              newMark.position = new Position(
                newMark.position.line,
                Math.max(newMark.position.character - 1, 0),
              );
            }
          }

          if (ch === '\n') {
            // The 99999 is a bit of a hack here. It's very difficult and
            // completely unnecessary to get the correct position, so we
            // just fake it.
            pos = new Position(Math.max(pos.line - 1, 0), 99999);
          } else {
            pos = new Position(pos.line, Math.max(pos.character - 1, 0));
          }
        }

        pos = change.start;

        // Push mark forward with added text
        for (const ch of change.after.replace(/\r/g, '')) {
          if (pos.isBeforeOrEqual(newMark.position)) {
            if (ch === '\n') {
              newMark.position = new Position(
                newMark.position.line + 1,
                newMark.position.character,
              );
            } else if (pos.line === newMark.position.line) {
              newMark.position = new Position(
                newMark.position.line,
                newMark.position.character + 1,
              );
            }
          }

          if (ch === '\n') {
            pos = new Position(pos.line + 1, 0);
          } else {
            pos = new Position(pos.line, pos.character + 1);
          }
        }
      }
    }

    // Ensure the position of every mark is within the range of the document.

    const docEnd = TextEditor.getDocumentEnd(this.vimState.document);
    for (const mark of newMarks) {
      if (mark.position.isAfter(docEnd)) {
        mark.position = docEnd;
      }
    }

    return newMarks;
  }

  /**
   * @returns the shared static list if isFileMark is true, otherwise returns the currentHistoryStep.marks.
   */
  private getMarkList(isFileMark: boolean): IMark[] {
    return isFileMark ? HistoryStep.globalMarks : this.undoStack.getCurrentMarkList();
  }

  /**
   * @returns all local and global marks in the given editor
   */
  private getAllMarksInDocument(document: vscode.TextDocument): IMark[] {
    const globalMarks = HistoryStep.globalMarks.filter((mark) => mark.document === document);
    return [...this.getLocalMarks(), ...globalMarks];
  }

  /**
   * Adds a mark.
   */
  public addMark(document: vscode.TextDocument, position: Position, markName: string): void {
    if (markName === "'" || markName === '`') {
      globalState.jumpTracker.recordJump(Jump.fromStateNow(this.vimState));
    } else if (markName === '<') {
      if (this.vimState.lastVisualSelection) {
        this.vimState.lastVisualSelection.start = position;
      } else {
        this.vimState.lastVisualSelection = {
          mode: Mode.Visual,
          start: position,
          end: position,
        };
      }
      if (
        this.vimState.lastVisualSelection.mode === Mode.Visual &&
        this.vimState.lastVisualSelection.end.isBefore(this.vimState.lastVisualSelection.start)
      ) {
        // HACK: Visual mode representation is stupid
        this.vimState.lastVisualSelection.end = this.vimState.lastVisualSelection.start;
      }
    } else if (markName === '>') {
      if (this.vimState.lastVisualSelection) {
        this.vimState.lastVisualSelection.end = position.getRight();
      } else {
        this.vimState.lastVisualSelection = {
          mode: Mode.Visual,
          start: position.getRight(),
          end: position.getRight(),
        };
      }
      if (
        this.vimState.lastVisualSelection.mode === Mode.Visual &&
        this.vimState.lastVisualSelection.start.isAfter(this.vimState.lastVisualSelection.end)
      ) {
        // HACK: Visual mode representation is stupid
        this.vimState.lastVisualSelection.start = this.vimState.lastVisualSelection.end.getLeft();
        this.vimState.lastVisualSelection.end = this.vimState.lastVisualSelection.start;
      }
    } else {
      const isUppercaseMark = markName.toUpperCase() === markName;
      const newMark: IMark = {
        position,
        name: markName,
        isUppercaseMark,
        document: isUppercaseMark ? document : undefined,
      };
      this.putMarkInList(newMark, document);
    }
  }

  /**
   * Puts the mark into either the global or local marks array depending on mark.isUppercaseMark.
   */
  private putMarkInList(mark: IMark, document: vscode.TextDocument): void {
    const marks = this.getMarkList(mark.isUppercaseMark);
    const previousIndex = marks.findIndex((existingMark) => existingMark.name === mark.name);
    if (previousIndex !== -1) {
      marks[previousIndex] = mark;
      HistoryStep.markHistory.removeMark(mark, document);
    } else {
      marks.push(mark);
    }

    HistoryStep.markHistory.addMark(mark, document);
  }

  /**
   * Retrieves a mark from either the global or local array depending on mark.isUppercaseMark.
   */
  public getMark(name: string): IMark | undefined {
    // First, handle "special" marks
    let position: Position | undefined;
    if (name === '<') {
      const linewise = this.vimState.lastVisualSelection?.mode === Mode.VisualLine;
      position = linewise
        ? this.vimState.lastVisualSelection?.start.with({ character: 0 })
        : this.vimState.lastVisualSelection?.start;
    } else if (name === '>') {
      const linewise = this.vimState.lastVisualSelection?.mode === Mode.VisualLine;
      position = linewise
        ? this.vimState.lastVisualSelection?.end.getLineEnd()
        : this.vimState.lastVisualSelection?.end.getLeft();
    } else if (name === '[') {
      position = this.getLastChangeStartPosition();
    } else if (name === ']') {
      position = this.getLastChangeEndPosition();
    } else if (name === '.') {
      position = this.getLastHistoryStartPosition();
    } else if (name === "'" || name === '`') {
      position = globalState.jumpTracker.end?.position;
    }
    if (position) {
      return {
        name,
        position,
        isUppercaseMark: false,
      };
    }

    const marks = this.getMarkList(name.toUpperCase() === name);
    return marks.find((mark) => mark.name === name);
  }

  /**
   * Removes all local marks.
   */
  public removeLocalMarks(): void {
    this.undoStack.removeMarks();
  }

  /**
   * Removes all marks matching from either the global or local array.
   */
  public removeMarks(markNames: string[]): void {
    if (markNames.length === 0) {
      return;
    }

    this.undoStack.removeMarks(markNames);

    HistoryStep.globalMarks = HistoryStep.globalMarks.filter(
      (mark) => mark.name === '' || !markNames.includes(mark.name),
    );
  }

  /**
   * Gets all local marks.  I.e., marks that are specific for the current
   * editor.
   */
  public getLocalMarks(): IMark[] {
    return [...this.undoStack.getCurrentMarkList()];
  }

  /**
   * Gets all global marks.  I.e., marks that are shared among all editors.
   */
  public getGlobalMarks(): IMark[] {
    return [...HistoryStep.globalMarks];
  }

  public getMarks(): IMark[] {
    return [...this.getLocalMarks(), ...HistoryStep.globalMarks];
  }

  /**
   * Adds an individual Change to the current Step.
   *
   * Determines what changed by diffing the document against what it used to look like.
   */
  public addChange(force: boolean = false): void {
    if (this.getDocumentVersion() === this.previousDocumentState.versionNumber) {
      return;
    }

    if (this.nextStepStartPosition === undefined) {
      const cursor = this.vimState.cursorsInitialState[0];
      this.nextStepStartPosition = earlierOf(cursor.start, cursor.stop);
      Logger.debug(`Set nextStepStartPosition to ${this.nextStepStartPosition}`);
    }

    if (
      !force &&
      (this.vimState.currentMode === Mode.Insert || this.vimState.currentMode === Mode.Replace)
    ) {
      // We can ignore changes while we're in insert/replace mode, since we can't interact with them (via undo, etc.) until we're back to normal mode
      // This allows us to avoid a little bit of work per keystroke, but more importantly, it means we'll get bigger contiguous edit chunks to merge.
      // This is particularly impactful when there are multiple cursors, which are otherwise difficult to optimize.
      return;
    }

    const newText = this.getDocumentText();
    if (newText === this.previousDocumentState.text) {
      return;
    }

    // TODO: This is actually pretty stupid! Since we already have the cursorPosition,
    // and most diffs are just +/- a few characters, we can just do a direct comparison rather
    // than using jsdiff.

    // The difficulty is with a few rare commands like :%s/one/two/g that make
    // multiple changes in different places simultaneously. For those, we could require
    // them to call addChange manually, I guess...

    const diffs = diffEngine.diff_main(this.previousDocumentState.text, newText);
    diffEngine.diff_cleanupEfficiency(diffs);

    let currentPosition = new Position(0, 0);

    for (const diff of diffs) {
      const [whatHappened, text] = diff;
      const added = whatHappened === DiffMatchPatch.DIFF_INSERT;
      const removed = whatHappened === DiffMatchPatch.DIFF_DELETE;

      if (added || removed) {
        this.undoStack.pushChange(
          added
            ? DocumentChange.insert(currentPosition, text)
            : DocumentChange.delete(currentPosition, text),
        );
      }

      if (!removed) {
        currentPosition = currentPosition.advancePositionByText(text);
      }
    }

    this.previousDocumentState = {
      text: newText,
      versionNumber: this.getDocumentVersion(),
    };
  }

  /**
   * Tells the HistoryTracker that although the document has changed, we should simply
   * ignore that change. Most often used when the change was itself triggered by
   * the HistoryTracker.
   */
  public ignoreChange(): void {
    this.previousDocumentState = {
      text: this.getDocumentText(),
      versionNumber: this.getDocumentVersion(),
    };
  }

  /**
   * Until we mark it as finished, the active Step will
   * accrue multiple changes. This function will mark it as finished,
   * and the next time we add a change, it'll be added to a new Step.
   */
  public finishCurrentStep(): void {
    const currentHistoryStep = this.undoStack.getCurrentHistoryStep();
    if (currentHistoryStep && !currentHistoryStep.isFinished) {
      currentHistoryStep.isFinished = true;
      currentHistoryStep.timestamp = new Date();

      currentHistoryStep.cursorStart ??= this.nextStepStartPosition;
      this.nextStepStartPosition = undefined;

      currentHistoryStep.merge(this.vimState.document);

      currentHistoryStep.marks = this.updateAndReturnMarks(this.vimState.document);

      const changes = currentHistoryStep.changes;
      if (changes) {
        const changePos = changes[0].after ? changes[0].afterRange.end.getLeft() : changes[0].start;
        this.changeList.addChangePosition(changePos);
      }

      Logger.debug(`Finished history step with ${changes.length} change(s)`);
    }
  }

  /**
   * Undo the current HistoryStep, if there is one
   *
   * @returns the new cursor positions, or undefined if there are no steps to undo
   */
  public async goBackHistoryStep(): Promise<Position | undefined> {
    const step = this.undoStack.stepBackward();
    if (step === undefined) {
      return undefined;
    }

    for (const change of step.changes.slice(0).reverse()) {
      await change.undo(this.vimState.editor);
    }

    this.ignoreChange();

    // TODO: if there are more/fewer lines after undoing the change, it should say so
    const changes = step.changes.length === 1 ? `1 change` : `${step.changes.length} changes`;
    StatusBar.setText(
      this.vimState,
      `${changes}; before #${
        this.undoStack.getCurrentHistoryStepIndex() + 1
      }  ${step.howLongAgo()}`,
    );

    return step.cursorStart;
  }

  /**
   * Redo the next HistoryStep, if there is one
   *
   * @returns the new cursor positions, or undefined if there are no steps to redo
   */
  public async goForwardHistoryStep(): Promise<Position | undefined> {
    const step = this.undoStack.stepForward();
    if (step === undefined) {
      return undefined;
    }

    // TODO: do these transformations in a batch
    for (const change of step.changes) {
      await change.do(this.vimState.editor);
    }

    this.ignoreChange();

    const changes = step.changes.length === 1 ? `1 change` : `${step.changes.length} changes`;
    StatusBar.setText(
      this.vimState,
      `${changes}; after #${this.undoStack.getCurrentHistoryStepIndex()}  ${step.howLongAgo()}`,
    );

    return step.cursorStart;
  }

  /**
   * Logic for command U.
   *
   * Performs an undo action for all changes which occurred on
   * the same line as the most recent change.
   * Returns undefined if there's no more steps back to go.
   * Only acts upon consecutive changes on the most-recently-changed line.
   * U itself is a change, so all the changes are reversed and added back
   * to the history.
   *
   * This method contains a significant amount of extra logic to account for
   * the difficult scenario where a newline is embedded in a change (ex: '\nhello'), which
   * is created by the 'o' command. Vim behavior for the 'U' command does
   * not undo newlines, so the change text needs to be checked & trimmed.
   * This worst-case scenario tends to offset line values and make it harder to
   * determine the line of the change, so this behavior is also compensated.
   */
  public async goBackHistoryStepsOnLine(): Promise<Position | undefined> {
    const currentHistoryStep = this.undoStack.getCurrentHistoryStep();
    if (currentHistoryStep === undefined) {
      return undefined;
    }

    let done: boolean = false;
    const changesToUndo: DocumentChange[] = [];

    let lastChange = currentHistoryStep.changes[currentHistoryStep.changes.length - 1];
    const undoLine = lastChange.afterRange.end.line;

    for (let stepIdx = this.undoStack.getCurrentHistoryStepIndex(); stepIdx >= 0; stepIdx--) {
      const step = this.undoStack.getHistoryStepAtIndex(stepIdx)!;
      for (let change of [...step.changes].reverse()) {
        /*
         * This conditional accounts for the behavior where the change is a newline
         * followed by text to undo. Note the line offset behavior that must be compensated.
         */
        const newlines = [...change.after.matchAll(/\n/g)];
        if (newlines.length > 0 && change.start.line + newlines.length === undoLine) {
          // Modify & replace the change to avoid undoing the newline embedded in the change
          change = DocumentChange.insert(
            new Position(change.start.line + 1, 0),
            change.after.slice(change.after.lastIndexOf('\n')),
          );
          done = true;
        } else if (newlines.length > 0 || change.start.line !== undoLine) {
          done = true;
          break;
        }

        changesToUndo.push(change);
        lastChange = change;
        if (done) {
          break;
        }
      }
      if (step.cameFromU) {
        done = true;
      }
      if (done) {
        break;
      }
    }

    if (changesToUndo.length > 0) {
      for (const change of changesToUndo) {
        await change.undo(this.vimState.editor);
      }

      const newStep = new HistoryStep({
        marks: this.undoStack.getCurrentMarkList(),
        changes: changesToUndo.map((change) => change.reversed()).reverse(),
        cameFromU: true,
      });
      this.nextStepStartPosition = lastChange.start;
      this.undoStack.pushHistoryStep(newStep);

      this.finishCurrentStep();
    }

    this.ignoreChange();

    /*
     * Unlike the goBackHistoryStep() function, this function does not trust the
     * HistoryStep.cursorStart property. This can lead to invalid cursor position errors.
     * Since this function reverses change-by-change, rather than step-by-step,
     * the cursor position is based on the start of the last change that is undone.
     */
    return lastChange?.start;
  }

  /**
   * Gets the ending cursor position of the last Change of the last Step.
   *
   * In practice, this sets the cursor position to the end of
   * the most recent text change.
   */
  public getLastChangeEndPosition(): Position | undefined {
    const currentHistoryStep = this.undoStack.getCurrentHistoryStep();
    if (currentHistoryStep === undefined) {
      return undefined;
    }

    const lastChangeIndex = currentHistoryStep.changes.length;
    if (lastChangeIndex === 0) {
      return undefined;
    }

    const lastChange = currentHistoryStep.changes[lastChangeIndex - 1];
    return lastChange.afterRange.end;
  }

  public getLastHistoryStartPosition(): Position | undefined {
    return this.undoStack.getCurrentHistoryStep()?.cursorStart;
  }

  private getLastChangeStartPosition(): Position | undefined {
    const currentHistoryStep = this.undoStack.getCurrentHistoryStep();
    if (currentHistoryStep === undefined) {
      return undefined;
    }

    const changes = currentHistoryStep.changes;
    if (changes.length === 0) {
      return undefined;
    }

    return changes[changes.length - 1].start;
  }

  /**
   * Logic for `g,` command
   */
  public nextChangeInChangeList(): Position | VimError {
    return this.changeList.nextChangePosition();
  }

  /**
   * Logic for `g;` command
   */
  public prevChangeInChangeList(): Position | VimError {
    return this.changeList.prevChangePosition();
  }
}
