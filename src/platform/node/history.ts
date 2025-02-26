import * as path from 'path';
import { mkdirAsync, readFileAsync, unlinkSync, writeFileAsync } from 'platform/fs';
import * as vscode from 'vscode';
import { Globals } from '../../globals';
import { Logger } from '../../util/logger';

export class HistoryBase {
  private readonly extensionStoragePath: string;
  private readonly historyFileName: string;
  private history: string[] = [];

  get historyKey(): string {
    return path.join(this.extensionStoragePath, this.historyFileName);
  }

  constructor(
    context: vscode.ExtensionContext,
    historyFileName: string,
    extensionStoragePath: string,
  ) {
    this.historyFileName = historyFileName;
    this.extensionStoragePath = extensionStoragePath;
  }

  public async add(value: string | undefined, history: number): Promise<void> {
    if (!value || value.length === 0) {
      return;
    }

    // remove duplicates
    const index: number = this.history.indexOf(value);
    if (index !== -1) {
      this.history.splice(index, 1);
    }

    // append to the end
    this.history.push(value);

    // resize array if necessary
    if (this.history.length > history) {
      this.history = this.history.slice(this.history.length - history);
    }

    return this.save();
  }

  public get(history: number): string[] {
    // resize array if necessary
    if (this.history.length > history) {
      this.history = this.history.slice(this.history.length - history);
    }

    return this.history;
  }

  public clear() {
    try {
      this.history = [];
      unlinkSync(this.historyKey);
    } catch (err) {
      Logger.warn(`Unable to delete ${this.historyKey}. err=${err}.`);
    }
  }

  // filter history based on predicate
  public remove(predicate: (value: string) => boolean) {
    this.history = this.history.filter(predicate);
  }

  public async load(): Promise<void> {
    // await this._base.load();
    let data = '';

    try {
      data = await readFileAsync(this.historyKey, 'utf-8');
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (err.code === 'ENOENT') {
        Logger.debug(`History does not exist. path=${this.historyKey}`);
      } else {
        Logger.warn(`Failed to load history. path=${this.historyKey} err=${err}.`);
      }
      return;
    }

    if (data.length === 0) {
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsedData = JSON.parse(data);
      if (!Array.isArray(parsedData)) {
        throw Error('Unexpected format in history file. Expected JSON.');
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.history = parsedData;
    } catch (e) {
      Logger.warn(`Deleting corrupted history file. path=${this.historyKey} err=${e}.`);
      this.clear();
    }
  }

  async save(): Promise<void> {
    try {
      // create supplied directory. if directory already exists, do nothing and move on
      try {
        await mkdirAsync(Globals.extensionStoragePath, { recursive: true });
      } catch (createDirectoryErr) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (createDirectoryErr.code !== 'EEXIST') {
          throw createDirectoryErr;
        }
      }

      // create file
      await writeFileAsync(this.historyKey, JSON.stringify(this.history), 'utf-8');
    } catch (err) {
      Logger.error(`Failed to save history. filepath=${this.historyKey}. err=${err}.`);
      throw err;
    }
  }
}
