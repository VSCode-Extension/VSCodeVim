import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { configuration } from '../configuration/configuration';
import { logger } from '../util/logger';
import { getExtensionDirPath } from '../util/util';

const mkdirp = require('mkdirp');

export class HistoryFile {
  private _historyFileName: string;
  private _historyDir: string;
  private _history: string[] = [];
  private get _historyFilePath(): string {
    return path.join(this._historyDir, this._historyFileName);
  }

  constructor(historyDir: string, historyFileName: string) {
    this._historyDir = historyDir;
    this._historyFileName = historyFileName;
  }

  public async add(value: string | undefined): Promise<void> {
    if (!value || value.length === 0) {
      return;
    }

    // remove duplicates
    let index: number = this._history.indexOf(value);
    if (index !== -1) {
      this._history.splice(index, 1);
    }

    // append to the end
    this._history.push(value);

    // resize array if necessary
    if (this._history.length > configuration.history) {
      this._history = this._history.slice(this._history.length - configuration.history);
    }

    await this.save();
  }

  public get(): string[] {
    // resize array if necessary
    if (this._history.length > configuration.history) {
      this._history = this._history.slice(this._history.length - configuration.history);
    }

    return this._history;
  }

  public clear() {
    try {
      fs.unlinkSync(this._historyFilePath);
    } catch (err) {
      logger.warn(`Unable to delete ${this._historyFilePath}. err=${err}.`);
    }
  }

  public async save(): Promise<void> {
    try {
      if (!(await util.promisify(fs.exists)(this._historyDir))) {
        await util.promisify(mkdirp)(this._historyDir, 0o775);
      }
    } catch (err) {
      logger.error(`Failed to create directory. path=${this._historyDir}. err=${err}.`);
      throw err;
    }

    try {
      await util.promisify(fs.writeFile)(
        this._historyFilePath,
        JSON.stringify(this._history),
        'utf-8'
      );
    } catch (err) {
      logger.error(`Failed to save history. path=${this._historyDir}. err=${err}.`);
      throw err;
    }
  }

  public async load() {
    let data = '';

    try {
      data = await util.promisify(fs.readFile)(this._historyFilePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.debug(`History does not exist. path=${this._historyDir}`);
      } else {
        logger.error(`Failed to load history. path=${this._historyDir} err=${err}.`);
        return;
      }
    }

    if (data.length === 0) {
      return;
    }

    try {
      let parsedData = JSON.parse(data);
      if (!Array.isArray(parsedData)) {
        throw Error('Expected JSON');
      }
      this._history = parsedData;
    } catch (e) {
      logger.error(`Deleting corrupted history file. path=${this._historyDir} err=${e}.`);
      this.clear();
    }
  }
}

export class SearchHistory extends HistoryFile {
  constructor() {
    super(getExtensionDirPath(), '.search_history');
  }
}

export class CommandLineHistory extends HistoryFile {
  constructor() {
    super(getExtensionDirPath(), '.cmdline_history');
  }
}
