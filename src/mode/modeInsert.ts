"use strict";

import * as vscode from 'vscode';

import {ModeName, Mode} from './mode';
import {TextEditor} from './../textEditor';
import {Motion} from './../motion/motion';

export class InsertMode extends Mode {
    private activationKeyHandler : { [ key : string] : (motion : Motion) => Promise<{}> } = {
        "i" : async (c) => {
            // insert at cursor
            return c.move();
        },
        "I" : async (c) => {
            // insert at line beginning
            return c.lineBegin().move();
        },
        "a" : async (c) => {
            // append after the cursor
            return c.right().move();
        },
        "A" : async (c) => {
            // append at the end of the line
           return c.lineEnd().move();
        },
        "o" : async () => {
            // open blank line below current line
           return await vscode.commands.executeCommand("editor.action.insertLineAfter");
        },
        "O" : async () => {
            // open blank line above current line
           return await vscode.commands.executeCommand("editor.action.insertLineBefore");
        }
    };

    constructor(motion : Motion) {
        super(ModeName.Insert, motion);
    }

    shouldBeActivated(key : string, currentMode : ModeName) : boolean {
        return key in this.activationKeyHandler;
    }

    handleActivation(key : string) : Promise<{}> {
        return this.activationKeyHandler[key](this.motion);
    }

    async handleKeyEvent(key : string) : Promise<{}> {
        this.keyHistory.push(key);

        await TextEditor.insert(this.resolveKeyValue(key));

        return vscode.commands.executeCommand("editor.action.triggerSuggest");
    }

    // Some keys have names that are different to their value.
    // TODO: we probably need to put this somewhere else.
    private resolveKeyValue(key : string) : string {
        switch (key) {
            case 'space':
                return ' ';
            default:
                return key;
        }
    }
}
