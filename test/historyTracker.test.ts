import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Position } from 'vscode';

import { HistoryTracker, IMark } from '../src/history/historyTracker';
import { Jump } from '../src/jumps/jump';
import { globalState } from '../src/state/globalState';
import { VimState } from '../src/state/vimState';

suite('historyTracker unit tests', () => {
  let sandbox: sinon.SinonSandbox;
  let historyTracker: HistoryTracker;
  let activeTextEditor: vscode.TextEditor;

  const retrieveLocalMark = (markName: string): IMark | undefined =>
    historyTracker.getLocalMarks().find((mark) => mark.name === markName);

  const retrieveFileMark = (markName: string): IMark | undefined =>
    historyTracker.getGlobalMarks().find((mark) => mark.name === markName);

  const setupVimState = () => <VimState>(<any>sandbox.createStubInstance(VimState));

  const setupHistoryTracker = (vimState = setupVimState()) => new HistoryTracker(vimState);

  const setupVSCode = () => {
    activeTextEditor = sandbox.createStubInstance<vscode.TextEditor>(TextEditorStub);
    sandbox.stub(vscode, 'window').value({ activeTextEditor });
  };

  const buildMockPosition = (): Position => <any>sandbox.createStubInstance(Position);

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('addMark', () => {
    setup(() => {
      setupVSCode();
      historyTracker = setupHistoryTracker();
    });

    test('can set previous context mark from single quote', () => {
      const spy = sandbox.spy(globalState.jumpTracker, 'recordJump');
      const position = buildMockPosition();
      const mockJump = new Jump({ editor: null, fileName: 'file name', position });
      sandbox.stub(Jump, 'fromStateNow').returns(mockJump);

      historyTracker.addMark(position, "'");

      sinon.assert.calledWith(spy, mockJump);
    });
    test('can set previous context mark from backtick', () => {
      const spy = sandbox.spy(globalState.jumpTracker, 'recordJump');
      const position = buildMockPosition();
      const mockJump = new Jump({ editor: null, fileName: 'file name', position });
      sandbox.stub(Jump, 'fromStateNow').returns(mockJump);

      historyTracker.addMark(position, '`');

      sinon.assert.calledWith(spy, mockJump);
    });

    test('can create lowercase mark', () => {
      const position = buildMockPosition();
      historyTracker.addMark(position, 'a');
      const mark = retrieveLocalMark('a');
      assert.notStrictEqual(mark, undefined, 'failed to store lowercase mark');
      if (mark !== undefined) {
        assert.strictEqual(mark.position, position);
        assert.strictEqual(mark.isUppercaseMark, false);
        assert.strictEqual(mark.editor, undefined);
      }
    });

    test('can create uppercase mark', () => {
      const position = buildMockPosition();
      historyTracker.addMark(position, 'A');
      const mark = retrieveFileMark('A');
      assert.notStrictEqual(mark, undefined, 'failed to store file mark');
      if (mark !== undefined) {
        assert.strictEqual(mark.position, position);
        assert.strictEqual(mark.isUppercaseMark, true);
        assert.strictEqual(mark.editor, activeTextEditor);
      }
    });

    test('shares uppercase marks between editor instances', () => {
      const position = buildMockPosition();
      const firstHistoryTrackerInstance = historyTracker;
      const otherHistoryTrackerInstance = setupHistoryTracker(setupVimState());
      assert.notStrictEqual(firstHistoryTrackerInstance, otherHistoryTrackerInstance);
      otherHistoryTrackerInstance.addMark(position, 'A');
      const mark = retrieveFileMark('A');
      assert.notStrictEqual(mark, undefined);
      if (mark !== undefined) {
        assert.strictEqual(position, mark.position);
      }
    });

    test('does not share lower marks between editor instances', () => {
      const position = buildMockPosition();
      const firstHistoryTrackerInstance = historyTracker;
      const otherHistoryTrackerInstance = setupHistoryTracker(setupVimState());
      assert.notStrictEqual(firstHistoryTrackerInstance, otherHistoryTrackerInstance);
      otherHistoryTrackerInstance.addMark(position, 'a');
      const mark = retrieveLocalMark('a');
      assert.strictEqual(mark, undefined);
    });
  });
});

// tslint:disable: no-empty
class TextEditorStub implements vscode.TextEditor {
  readonly document: vscode.TextDocument;
  selection: vscode.Selection;
  selections: vscode.Selection[];
  readonly visibleRanges: vscode.Range[];
  options: vscode.TextEditorOptions;
  viewColumn?: vscode.ViewColumn;

  constructor() {}
  async edit(
    callback: (editBuilder: vscode.TextEditorEdit) => void,
    options?: { undoStopBefore: boolean; undoStopAfter: boolean }
  ) {
    return true;
  }
  async insertSnippet(
    snippet: vscode.SnippetString,
    location?:
      | vscode.Position
      | vscode.Range
      | ReadonlyArray<Position>
      | ReadonlyArray<vscode.Range>,
    options?: { undoStopBefore: boolean; undoStopAfter: boolean }
  ) {
    return true;
  }
  setDecorations(
    decorationType: vscode.TextEditorDecorationType,
    rangesOrOptions: vscode.Range[] | vscode.DecorationOptions[]
  ) {}
  revealRange(range: vscode.Range, revealType?: vscode.TextEditorRevealType) {}
  show(column?: vscode.ViewColumn) {}
  hide() {}
}
