"use strict";

import * as _ from 'lodash';
import * as vscode from 'vscode';

import {ModeName, Mode} from './mode';
import {showCmdLine} from './../cmd_line/main';
import {Motion} from './../motion/motion';
import {ModeHandler} from './modeHandler';
import {ChangeOperator} from './../operator/change';
import {DeleteOperator} from './../operator/delete';
import {Position} from './../motion/position';

enum ParserState {
    CountPending,
    CommandPending,
    OperatorPending  // expects number (for count), or non-number for motion/text-object/argument
}

export class NormalMode extends Mode {
    protected keyHandler : { [key : string] : (mover) => Promise<{}>; } = {
        ":" : async () => { return showCmdLine(""); },
        "u" : async () => { return vscode.commands.executeCommand("undo"); },
        "ctrl+r" : async () => { return vscode.commands.executeCommand("redo"); },

        // TODO move these to motions map in Mode.keyToNewPosition
        "^" : async () => { return vscode.commands.executeCommand("cursorHome"); },
        "W" : async () => { return this.motion.bigWordRight().move(); },
        "B" : async () => { return this.motion.bigWordLeft().move(); },
        "ctrl+f": async () => { return vscode.commands.executeCommand("cursorPageDown"); },
        "ctrl+b": async () => { return vscode.commands.executeCommand("cursorPageUp"); },
        "%" : async () => { return vscode.commands.executeCommand("editor.action.jumpToBracket"); },
        "t{argument}" : async () => { return showCmdLine(""); },
        "T{argument}" : async () => { return showCmdLine(""); },
        "f{argument}" : async () => { return showCmdLine(""); },
        "F{argument}" : async () => { return showCmdLine(""); },

        ">>" : async () => { return vscode.commands.executeCommand("editor.action.indentLines"); },
        "<<" : async () => { return vscode.commands.executeCommand("editor.action.outdentLines"); },
        "dd" : async () => { return vscode.commands.executeCommand("editor.action.deleteLines"); },
        "d{rangeable}" : async (mover) => {
            await new DeleteOperator(this._modeHandler).run(this.motion.position, await mover()); return {};
        },
        "c{rangeable}" : async (mover) => {
            await new ChangeOperator(this._modeHandler).run(this.motion.position, await mover()); return {};
        },
        "x" : async (c) => { await new DeleteOperator(this._modeHandler).run(this.motion.position, this.motion.position.getRight()); return {}; },
        "X" : async (c) => { return vscode.commands.executeCommand("deleteLeft"); },
        "esc": async () => { this.resetState(); return vscode.commands.executeCommand("workbench.action.closeMessages"); }
    };
    // TODO: motion => ctX, cfX

    private static ValidTextObjectPrefixes = ['i', 'a'];
    private static ValidTextObjectSuffixes = ['w', 's', 'p', '"', '\'', '`', ')', ']', '}', 't', '>'];

    private _modeHandler: ModeHandler;

    private _state: ParserState;
    private _commandCount;
    private _motionCount;

    constructor(motion : Motion, modeHandler: ModeHandler) {
        super(ModeName.Normal, motion);

        this._modeHandler = modeHandler;
        this.resetState();
    }

    shouldBeActivated(key : string, currentMode : ModeName) : boolean {
        return (key === 'esc' || key === 'ctrl+[' || key === "ctrl+c");
    }

    async handleActivation(key : string): Promise<void> {
        this.motion.left().move();
        this.resetState();
    }

    async handleKeyEvent(key : string): Promise<void> {
        if (this._state === ParserState.CountPending) {
            if (key.match(/^\d$/)) {
                this._commandCount = this._commandCount * 10 + parseInt(key, 10);
                return;
            }
            this._state = ParserState.CommandPending;
            return this.handleKeyEvent(key);
        } else if (this._state === ParserState.CommandPending) {
            this.keyHistory.push(key);
            return this.tryToHandleCommand();
        } else if (this._state === ParserState.OperatorPending) {
            if (key.match(/^\d$/)) {
                this._motionCount = this._motionCount * 10 + parseInt(key, 10);
                return;
            }
            this.keyHistory.push(key);
            return this.tryToHandleCommand();
        }
    }

    private resetState() {
        this._state = ParserState.CountPending;
        this._commandCount = 0;
        this._motionCount = 0;
        this.keyHistory = [];
    }

    private async tryToHandleCommand() : Promise<void> {
        // handler will be a function, true or false
        const retval = this.findCommandHandler();
        if (typeof retval[0] === 'function') {
            // we can handle this now
            const handler = retval[0];
            const argument = retval[1];
            const mover = this.makeMotion(this._motionCount, argument);
            await handler(this._commandCount, mover);
            this.resetState();
        } else if (retval === true) {
            // handler === true, valid command prefix
            // can't do anything for now
        } else {
            // handler === false, not valid, reset state
            this.resetState();
        }
    }

    private findCommandHandler() : any {
        // see if it fits a command now, returns handler if found
        for (let window = this.keyHistory.length; window > 0; window--) {
            let command = _.take(this.keyHistory, window).join('');
            let argument = _.takeRight(this.keyHistory, this.keyHistory.length - window).join('');

            // check if motion
            const motionHandler = this.findInCommandMap(command, argument, this.keyToNewPosition);
            if (motionHandler) {
                if (command === "G" && this._commandCount > 0) {
                    // special case G (goto line number)
                    return [async (c) => {
                        const lastLine = this.motion.position.getDocumentEnd().line;
                        const newLine = Math.min(c - 1, lastLine);
                        return this.motion.moveTo(newLine, Position.getFirstNonBlankCharAtLine(newLine));
                    }, null];
                }
                return [async (c) => {
                    let position = this.motion.position;
                    for (let i = 0; i < (c || 1); i++) {
                        position = await motionHandler(position);
                    }
                    return this.motion.moveTo(position.line, position.character);
                }, null];
            }

            // check if non-motion command
            let handler = this.findInCommandMap(command, argument, this.keyHandler);
            if (handler) {
                return [async (c, mover) => {
                    for (let i = 0; i < (c || 1); i++) {
                        await handler(mover);
                    }
                }, argument];
            }
        }

        // no handler found yet, see if it is a valid prefix
        for (let window = this.keyHistory.length; window > 0; window--) {
            let command = _.take(this.keyHistory, window).join('');
            let argument = _.takeRight(this.keyHistory, this.keyHistory.length - window).join('');

            if (this.isValidPrefixInCommandMap(command, argument, this.keyToNewPosition) ||
                this.isValidPrefixInCommandMap(command, argument, this.keyHandler)) {
                return true;
            }
        }

        return false;
    }

    private findInCommandMap(command, argument, map) : any {
        if (argument.length === 0) {
            let handler = map[command];
            if (handler) {
                return handler;
            }
        } else {
            let keys = command + '{argument}';
            let handler = map[keys];
            if (handler) {
                return handler;
            }

            keys = command + '{rangeable}';
            handler = map[keys];
            if (handler) {
                if (this.isValidMotion(argument)) {
                    return handler;
                } else if (this.isValidTextObject(argument)) {
                    return handler;
                }
            }
            return null;
        }
    }

    private isValidPrefixInCommandMap(command, argument, map) : any {
        if (argument.length === 0) {
           return !!_.find(_.keys(map), key => _.startsWith(key, command) );
        } else {
            // no need to test command+{argument} because argument is only single key
            // see if it is a valid motion/text object prefix
            const keys = command + '{rangeable}';
            return map[keys] && (this.isValidMotionPrefix(argument) || this.isValidTextObjectPrefix(argument));
        }
    }

    private isValidMotion(input : string) : boolean {
        for (let window = input.length; window > 0; window--) {
            const command = input.slice(0, window);
            const argument = input.slice(window);

            const handler = this.findInCommandMap(command, argument, this.keyToNewPosition);
            if (handler) {
                return true;
            }
        }
        return false;
    }

    private isValidTextObject(argument : string) : boolean {
        const prefix = argument.slice(0, 1);
        const suffix = argument.slice(1);
        return NormalMode.ValidTextObjectPrefixes.indexOf(prefix) > -1 &&
               NormalMode.ValidTextObjectSuffixes.indexOf(suffix) > -1;
    }

    private isValidMotionPrefix(input: string) : boolean {
        return this.isValidPrefixInCommandMap(input, '', this.keyToNewPosition);
    }

    private isValidTextObjectPrefix(argument : string) : boolean {
        return NormalMode.ValidTextObjectPrefixes.indexOf(argument) > -1;
    }

    // input can be motion or text object
    private makeMotion(count, input) : any {
        if (!input) {
            return () => this.motion.position;
        }

        if (this.isValidTextObject(input)) {
            // TODO make a text object mover
            return () => this.motion.position;
        }

        // make motion mover
        let command, argument, handler;
        for (let window = input.length; window > 0; window--) {
            command = input.slice(0, window);
            argument = input.slice(window);

            handler = this.findInCommandMap(command, argument, this.keyToNewPosition);
            if (handler) {
                break;
            }
        }

        if (handler) {
            return async () => {
                console.log('running motion');
                let position = this.motion.position;
                for (let i = 0; i < (count || 1); i++) {
                    position = await handler(position, argument);
                }
                return position;
            };
        }

        return () => this.motion.position;
    }
}
