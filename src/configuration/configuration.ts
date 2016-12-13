"use strict";

import * as vscode from 'vscode';
import { taskQueue } from '../../src/taskQueue';
import { Globals } from '../../src/globals';

export type OptionValue = number | string | boolean;
export type ValueMapping = {
  [key: number]: OptionValue
  [key: string]: OptionValue
}

/**
 * Every Vim option we support should
 * 1. Be added to contribution section of `package.json`.
 * 2. Named as `vim.{optionName}`, `optionName` is the name we use in Vim.
 * 3. Define a public property in `Configuration `with the same name and a default value.
 *    Or define a private propery and define customized Getter/Setter accessors for it.
 *    Always remember to decorate Getter accessor as @enumerable()
 * 4. If user doesn't set the option explicitly
 *    a. we don't have a similar setting in Code, initialize the option as default value.
 *    b. we have a similar setting in Code, use Code's setting.
 *
 * Vim option override sequence.
 * 1. `:set {option}` on the fly
 * 2. TODO .vimrc.
 * 2. `vim.{option}`
 * 3. VS Code configuration
 * 4. VSCodeVim flavored Vim option default values
 *
 */
class ConfigurationClass {
  private static _instance: ConfigurationClass | null;

  constructor() {
    /**
     * Load Vim options from User Settings.
     */
    let vimOptions = vscode.workspace.getConfiguration("vim");
    /* tslint:disable:forin */
    // Disable forin rule here as we make accessors enumerable.`
    for (const option in this) {
      const vimOptionValue = vimOptions[option];
      if (vimOptionValue !== null && vimOptionValue !== undefined) {
        this[option] = vimOptionValue;
      }
    }
  }

  public static getInstance(): ConfigurationClass {
    if (ConfigurationClass._instance == null) {
      ConfigurationClass._instance = new ConfigurationClass();
    }

    return ConfigurationClass._instance;
  }

  /**
   * Should the block cursor not blink?
   */
  useSolidBlockCursor = false;

  /**
   * Use the system's clipboard when copying.
   */
  useSystemClipboard = false;

  /**
   * Enable ctrl- actions that would override existing VSCode actions.
   */
  useCtrlKeys = false;

  /**
   * Width in characters to word-wrap to.
   */
  textwidth = 80;

  /**
   * Should we highlight incremental search matches?
   */
  hlsearch = false;

  /**
   * Used internally for nohl.
   */
  hl = true;

  /**
   * Ignore case when searching with / or ?.
   */
  ignorecase = true;

  /**
   * In / or ?, default to ignorecase=true unless the user types a capital
   * letter.
   */
  smartcase = true;

  /**
   * Indent automatically?
   */
  autoindent = true;

  /**
   * Use EasyMotion plugin?
   */
  easymotion = false;

  /**
   * Timeout in milliseconds for remapped commands.
   */
  timeout = 1000;

  /**
   * Display partial commands on status bar?
   */
  showcmd = true;

  /**
   * What key should <leader> map to in key remappings?
   */
  leader = "\\";

  /**
   * How much search or command history should be remembered
   */
  history = 50;

  /**
   * Show results of / or ? search as user is typing?
   */
  incsearch = true;

  /**
   * Start in insert mode?
   */
  startInInsertMode = false;

  /**
   * Color of search highlights.
   */
  searchHighlightColor = "rgba(150, 150, 255, 0.3)";

  /**
   * Size of a tab character.
   */
  @overlapSetting({ codeName: "tabSize", default: 8})
  tabstop: number | undefined = undefined;

  /**
   * Use spaces when the user presses tab?
   */
  @overlapSetting({ codeName: "insertSpaces", default: false})
  expandtab: boolean | undefined = undefined;

  @overlapSetting({ codeName: "lineNumbers", default: true, codeValueMapping: {true: "on", false: "off"}})
  number: boolean | undefined = undefined;

  /**
   * Show relative line numbers?
   */
  @overlapSetting({ codeName: "lineNumbers", default: false, codeValueMapping: {true: "relative", false: "off"}})
  relativenumber: boolean | undefined = undefined;

  iskeyword: string = "/\\()\"':,.;<>~!@#$%^&*|+=[]{}`?-";
}

function overlapSetting(args: {codeName: string, default: OptionValue, codeValueMapping?: ValueMapping}) {
  return function (target: any, propertyKey: string) {
    Object.defineProperty(target, propertyKey, {
      get: function () {
        if (this["_" + propertyKey] !== undefined) {
          return this["_" + propertyKey];
        }

        if (args.codeValueMapping) {
          let val = vscode.workspace.getConfiguration("editor").get(args.codeName);

          if (val !== undefined) {
            return args.codeValueMapping[val as string];
          }
        } else {
          return vscode.workspace.getConfiguration("editor").get(args.codeName, args.default);
        }
      },
      set: function (value) {
        this["_" + propertyKey] = value;

        taskQueue.enqueueTask({
          promise: async () => {
            if (value === undefined || Globals.isTesting) {
              return;
            }

            let codeValue = value;

            if (args.codeValueMapping) {
              codeValue = args.codeValueMapping[value];
            }

            await vscode.workspace.getConfiguration("editor").update(args.codeName, codeValue, true);
          },
          isRunning: false,
          queue: "config"
        });
      },
      enumerable: true,
      configurable: true
    });
  };
}

export const Configuration = ConfigurationClass.getInstance();