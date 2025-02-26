import { ExtensionContext } from 'vscode';
import { configuration } from '../configuration/configuration';
import { Globals } from '../globals';
import { HistoryBase } from 'platform/history';
import { IMark } from './historyTracker';
import * as vscode from 'vscode';

// TODO(jfields): What's going on here? Just combine HistoryFile and HistoryBase...
export class HistoryFile {
  private base: HistoryBase;

  get historyFilePath(): string {
    return this.base.historyKey;
  }

  constructor(context: ExtensionContext, historyFileName: string) {
    this.base = new HistoryBase(context, historyFileName, Globals.extensionStoragePath);
  }

  public async add(value: string | undefined): Promise<void> {
    return this.base.add(value, configuration.history);
  }

  public get(): string[] {
    return this.base.get(configuration.history);
  }

  public clear() {
    this.base.clear();
  }

  public remove(predicate: (value: string) => boolean) {
    this.base.remove(predicate);
  }

  public async load(): Promise<void> {
    await this.base.load();
  }
}

export class SearchHistory extends HistoryFile {
  constructor(context: ExtensionContext) {
    super(context, '.search_history');
  }
}

export class CommandLineHistory extends HistoryFile {
  constructor(context: ExtensionContext) {
    super(context, '.cmdline_history');
  }
}

export class MarkHistory extends HistoryFile {
  constructor(context: ExtensionContext) {
    super(context, '.mark_history');
  }

  public removeMark(mark: IMark, document: vscode.TextDocument) {
    if (mark.isUppercaseMark) {
      // remove old entry from history by finding a mark with the same name before adding this mark
      // ((value) => (JSON.parse(value) as IMark).name !== mark.name)
      this.remove((value) => (JSON.parse(value) as IMark).name !== mark.name);
    } else {
      // remove marks which with this name which belong to this document
      this.remove((value) => {
        const parsed: IMark = JSON.parse(value) as IMark;
        return !(parsed.name === mark.name && parsed.document?.uri.path === document.uri.path);
      });
    }
  }

  public addMark(mark: IMark, document: vscode.TextDocument) {
    // add the entry to the history to persist it over sessions
    if (mark.isUppercaseMark) {
      void this.add(JSON.stringify(mark));
    } else {
      // local marks do not store the path, but we still need to include it in the
      // history file so we know which file it belongs to
      void this.add(JSON.stringify({ ...mark, document }));
    }
  }
}
