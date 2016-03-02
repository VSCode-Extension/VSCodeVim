"use strict";

import * as assert from 'assert';
import * as vscode from "vscode";
import {TextEditor} from './../src/textEditor';
import {Motion, MotionMode} from './../src/motion/motion';
import {setupWorkspace, cleanUpWorkspace} from './testUtils';

suite("motion", () => {
    let motionModes = [MotionMode.Caret, MotionMode.Cursor];
    let text: string[] = [
        "mary had",
        "a",
        "little lamb",
        " whose fleece was "
    ];

    suiteSetup(async () => {
        await setupWorkspace();
        await TextEditor.insert(text.join('\n'));
    });

    suiteTeardown(cleanUpWorkspace);

    test("char right: should move one column right", () => {
        for (let o of motionModes) {
            let motion = new Motion(o).moveTo(0, 0);
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);

            let next = motion.right().move();
            assert.equal(next.position.line, 0);
            assert.equal(next.position.character, 1);

            let curPos = vscode.window.activeTextEditor.selection.active;
            assert.equal(next.position.line, curPos.line);
            assert.equal(next.position.character, curPos.character);
        };
    });

    test("char right: caret", () => {
        let motion = new Motion(MotionMode.Caret);

        motion = motion.moveTo(0, 7).right();
        assert.equal(motion.position.line, 0);
        assert.equal(motion.position.character, 7);
    });

    test("char right: cursor", () => {
        let motion = new Motion(MotionMode.Cursor);
        motion = motion.moveTo(0, 8).right();

        assert.equal(motion.position.line, 0);
        assert.equal(motion.position.character, 8);
    });

    test("char left: should move cursor one column left", () => {
        motionModes.forEach(o => {
            let motion = new Motion(o).moveTo(0, 5);
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 5);

            motion = motion.left().move();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 4);

            let curPos = vscode.window.activeTextEditor.selection.active;
            assert.equal(motion.position.line, curPos.line);
            assert.equal(motion.position.character, curPos.character);
        });
    });

    test("char left: left-most column should stay at the same location", () => {
        motionModes.forEach(o => {
            let motion = new Motion(o).moveTo(0, 0);
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);

            motion = motion.left().move();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);

            let curPos = vscode.window.activeTextEditor.selection.active;
            assert.equal(motion.position.line, curPos.line);
            assert.equal(motion.position.character, curPos.character);
        });
    });

    test("line down: should move cursor one line down", () => {
        motionModes.forEach(o => {
            let motion = new Motion(o).moveTo(1, 0);
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 0);

            motion = motion.down().move();
            assert.equal(motion.position.line, 2);
            assert.equal(motion.position.character, 0);

            let curPos = vscode.window.activeTextEditor.selection.active;
            assert.equal(motion.position.line, curPos.line);
            assert.equal(motion.position.character, curPos.character);
        });
    });

    test("line down: bottom-most line should stay at the same location", () => {
        motionModes.forEach(o => {
            let motion = new Motion(o).moveTo(3, 0);
            assert.equal(motion.position.line, 3);
            assert.equal(motion.position.character, 0);

            motion = motion.down().move();
            assert.equal(motion.position.line, 3);
            assert.equal(motion.position.character, 0);

            let curPos = vscode.window.activeTextEditor.selection.active;
            assert.equal(motion.position.line, curPos.line);
            assert.equal(motion.position.character, curPos.character);
        });
    });

    suite("line up", () => {
        motionModes.forEach(o => {
            test("should move cursor one line up", () => {
                let motion = new Motion(o).moveTo(1, 0);
                assert.equal(motion.position.line, 1);
                assert.equal(motion.position.character, 0);

                motion = motion.up().move();
                assert.equal(motion.position.line, 0);
                assert.equal(motion.position.character, 0);

                let curPos = vscode.window.activeTextEditor.selection.active;
                assert.equal(motion.position.line, curPos.line);
                assert.equal(motion.position.character, curPos.character);
            });

            test("top-most line should stay at the same location", () => {
                let motion = new Motion(o).moveTo(0, 1);
                assert.equal(motion.position.line, 0);
                assert.equal(motion.position.character, 1);

                motion = motion.up().move();
                assert.equal(motion.position.line, 0);
                assert.equal(motion.position.character, 1);

                let curPos = vscode.window.activeTextEditor.selection.active;
                assert.equal(motion.position.line, curPos.line);
                assert.equal(motion.position.character, curPos.character);
            });
        });
    });

    test("keep same column as up/down", () => {
        let motion = new Motion(MotionMode.Caret).moveTo(0, 2);

        motion = motion.down();
        assert.equal(motion.position.line, 1);
        assert.equal(motion.position.character, 0);

        motion = motion.down();
        assert.equal(motion.position.line, 2);
        assert.equal(motion.position.character, 2);
    });

    test("line begin", () => {
        motionModes.forEach(o => {
            let motion = new Motion(o).moveTo(0, 3).lineBegin();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);
        });
    });

    test("line end", () => {
        let motion = new Motion(MotionMode.Cursor).moveTo(0, 0).lineEnd();
        assert.equal(motion.position.line, 0);
        assert.equal(motion.position.character, text[0].length);

        motion = motion.moveTo(2, 0).lineEnd();
        assert.equal(motion.position.line, 2);
        assert.equal(motion.position.character, text[2].length);
    });

    test("document begin", () => {
        motionModes.forEach(o => {
            let motion = new Motion(o).moveTo(1, 0).documentBegin();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);
        });
    });

    test("document end", () => {
        let motion = new Motion(MotionMode.Cursor).moveTo(0, 0).documentEnd();
        assert.equal(motion.position.line, text.length - 1);
        assert.equal(motion.position.character, text[text.length - 1].length);
    });

    test("line begin cursor on first non-blank character", () => {
        let motion = new Motion(MotionMode.Caret).moveTo(3, 3).firstLineNonBlankChar();
        assert.equal(motion.position.line, 0);
        assert.equal(motion.position.character, 0);
    });

    test("last line begin cursor on first non-blank character", () => {
        let motion = new Motion(MotionMode.Caret).moveTo(0, 0).lastLineNonBlankChar();
        assert.equal(motion.position.line, 3);
        assert.equal(motion.position.character, 1);
    });
});

suite("word motion", () => {
    let text: string[] = [
        "if (true) {",
        "  return true;",
        "} else {",
        "",
        "  return false;",
        "  ",
        "} // endif"
    ];

    suiteSetup(() => {
        return setupWorkspace().then(() => {
            return TextEditor.insert(text.join('\n'));
        });
    });

    suiteTeardown(cleanUpWorkspace);

    suite("word right", () => {
        test("move to word right", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 3).wordRight();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 4);
        });

        test("last word should move to next line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 10).wordRight();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 2);
        });

        test("last word should move to next line stops on empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(2, 7).wordRight();
            assert.equal(motion.position.line, 3);
            assert.equal(motion.position.character, 0);
        });

        test("last word should move to next line skips whitespace only line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 14).wordRight();
            assert.equal(motion.position.line, 6);
            assert.equal(motion.position.character, 0);
        });

        test("last word on last line should go to end of document (special case!)", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(6, 6).wordRight();
            assert.equal(motion.position.line, 6);
            assert.equal(motion.position.character, 9);
        });

    });

    suite("word left", () => {
        test("move cursor word left across spaces", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 3).wordLeft();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);
        });

        test("move cursor word left within word", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 5).wordLeft();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 4);
        });

        test("first word should move to previous line, beginning of last word", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(1, 2).wordLeft();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 10);
        });

        test("first word should move to previous line, stops on empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 2).wordLeft();
            assert.equal(motion.position.line, 3);
            assert.equal(motion.position.character, 0);
        });

        test("first word should move to previous line, skips whitespace only line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(6, 0).wordLeft();
            assert.equal(motion.position.line, 4);
            assert.equal(motion.position.character, 14);
        });
    });

    suite("WORD right", () => {
        test("move to WORD right", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 3).bigWordRight();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 10);
        });

        test("last WORD should move to next line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(1, 10).bigWordRight();
            assert.equal(motion.position.line, 2);
            assert.equal(motion.position.character, 0);
        });

        test("last WORD should move to next line stops on empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(2, 7).bigWordRight();
            assert.equal(motion.position.line, 3);
            assert.equal(motion.position.character, 0);
        });

        test("last WORD should move to next line skips whitespace only line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 12).bigWordRight();
            assert.equal(motion.position.line, 6);
            assert.equal(motion.position.character, 0);
        });
    });

    suite("WORD left", () => {
        test("move cursor WORD left across spaces", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 3).bigWordLeft();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);
        });

        test("move cursor WORD left within WORD", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 5).bigWordLeft();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 3);
        });

        test("first WORD should move to previous line, beginning of last WORD", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(2, 0).bigWordLeft();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 9);
        });

        test("first WORD should move to previous line, stops on empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 2).bigWordLeft();
            assert.equal(motion.position.line, 3);
            assert.equal(motion.position.character, 0);
        });

        test("first WORD should move to previous line, skips whitespace only line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(6, 0).bigWordLeft();
            assert.equal(motion.position.line, 4);
            assert.equal(motion.position.character, 9);
        });
    });

    suite("end of word right", () => {
        test("move to end of current word right", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 4).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 7);
        });

        test("move to end of next word right", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 7).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 8);
        });

        test("end of last word should move to next line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 10).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 7);
        });

        test("end of last word should move to next line skips empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(2, 7).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 4);
            assert.equal(motion.position.character, 7);
        });

        test("end of last word should move to next line skips whitespace only line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 14).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 6);
            assert.equal(motion.position.character, 0);
        });
    });

    suite("end of WORD right", () => {
        test("move to end of current WORD right", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 4).goToEndOfCurrentBigWord();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 8);
        });

        test("move to end of next WORD right", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 8).goToEndOfCurrentBigWord();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 10);
        });

        test("end of last WORD should move to next line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 10).goToEndOfCurrentBigWord();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 7);
        });

        test("end of last WORD should move to next line skips empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(2, 7).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 4);
            assert.equal(motion.position.character, 7);
        });

        test("end of last WORD should move to next line skips whitespace only line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 14).goToEndOfCurrentWord();
            assert.equal(motion.position.line, 6);
            assert.equal(motion.position.character, 0);
        });
    });

    test("line begin cursor on first non-blank character", () => {
        let motion = new Motion(MotionMode.Caret).moveTo(4, 3).firstLineNonBlankChar();
        assert.equal(motion.position.line, 0);
        assert.equal(motion.position.character, 0);
    });

    test("last line begin cursor on first non-blank character", () => {
        let motion = new Motion(MotionMode.Caret).moveTo(0, 0).lastLineNonBlankChar();
        assert.equal(motion.position.line, 6);
        assert.equal(motion.position.character, 0);
    });
});


suite("paragraph motion", () => {
    let text: Array<string> = [
        "this text has", // 0
        "",              // 1
        "many",          // 2
        "paragraphs",    // 3
        "",              // 4
        "",              // 5
        "in it.",        // 6
        "",              // 7
        "WOW"            // 8
    ];

    suiteSetup(() => {
        return setupWorkspace().then(() => {
            return TextEditor.insert(text.join('\n'));
        });
    });

    suiteTeardown(cleanUpWorkspace);

    suite("paragraph down", () => {
        test("move down normally", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(0, 0).goToEndOfCurrentParagraph();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 0);
        });

        test("move down longer paragraph", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(2, 0).goToEndOfCurrentParagraph();
            assert.equal(motion.position.line, 4);
            assert.equal(motion.position.character, 0);
        });

        test("move down starting inside empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(4, 0).goToEndOfCurrentParagraph();
            assert.equal(motion.position.line, 7);
            assert.equal(motion.position.character, 0);
        });

        test("paragraph at end of document", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(7, 0).goToEndOfCurrentParagraph();
            assert.equal(motion.position.line, 8);
            assert.equal(motion.position.character, 2);
        });
    });

    suite("paragraph up", () => {
        test("move up short paragraph", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(1, 0).goToBeginningOfCurrentParagraph();
            assert.equal(motion.position.line, 0);
            assert.equal(motion.position.character, 0);
        });

        test("move up longer paragraph", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(3, 0).goToBeginningOfCurrentParagraph();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 0);
        });

        test("move up starting inside empty line", () => {
            let motion = new Motion(MotionMode.Caret).moveTo(5, 0).goToBeginningOfCurrentParagraph();
            assert.equal(motion.position.line, 1);
            assert.equal(motion.position.character, 0);
        });
    });
});
