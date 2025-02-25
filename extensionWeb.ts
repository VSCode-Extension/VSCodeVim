/**
 * Extension.ts is a lightweight wrapper around ModeHandler. It converts key
 * events to their string names and passes them on to ModeHandler via
 * handleKeyEvent().
 */
import './src/actions/include-main';
import './src/actions/include-plugins';

/**
 * Load configuration validator
 */

import './src/configuration/validators/inputMethodSwitcherValidator';
import './src/configuration/validators/remappingValidator';

import * as vscode from 'vscode';
import { activate as activateFunc } from './extensionBase';

export async function activate(context: vscode.ExtensionContext) {
  void activateFunc(context, false);
}
