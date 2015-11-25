import * as vscode from "vscode";
import * as token from "./token";
import {Mappings} from "../mapping/main";
export * from "./command_node";

export class LineRange {
	left : token.Token[];
	separator : token.Token;
	right : token.Token[];

	constructor() {
		this.left = [];
		this.right = [];
	}

	addToken(tok : token.Token) : void  {
		if (tok.type === token.TokenType.Comma) {
			this.separator = tok;
			return;
		}

		if (!this.separator) {
			if (this.left.length > 0 && tok.type !== token.TokenType.Offset) {
				// XXX: is this always this error?
				throw Error("not a Vim command");
			}
			this.left.push(tok);
		} else {
			if (this.right.length > 0 && tok.type !== token.TokenType.Offset) {
				// XXX: is this always this error?
				throw Error("not a Vim command");
			}
			this.right.push(tok);
		}
	}

	get isEmpty() : boolean {
		return this.left.length === 0 && this.right.length === 0 && !this.separator;
	}

	toString() : string {
		return this.left.toString() + this.separator.content + this.right.toString();
	}

	runOn(document : vscode.TextEditor) : void {
		if (this.isEmpty) {
			return;
		}
		var lineRef = this.right.length === 0 ? this.left : this.right;
		var pos = this.lineRefToPosition(document, lineRef);
		document.selection = new vscode.Selection(pos, pos);
	}

	lineRefToPosition(doc : vscode.TextEditor, toks : token.Token[]) : vscode.Position {
		var first = toks[0];
		switch (first.type) {
			case token.TokenType.Dollar:
			case token.TokenType.Percent:
				return new vscode.Position(doc.document.lineCount, 0);
			case token.TokenType.Dot:
				return new vscode.Position(doc.selection.active.line, 0);
			case token.TokenType.LineNumber:
				var line = Number.parseInt(first.content);
				line = Math.max(0, line - 1);
				line = Math.min(doc.document.lineCount, line);
				return new vscode.Position(line, 0);
			default:
				throw new Error("not implemented");
		}
	}
}

export class CommandLine {
	range : LineRange;
	command : CommandBase;

	constructor() {
		this.range = new LineRange();
	}

	get isEmpty() : boolean {
		return this.range.isEmpty && !this.command;
	}

	toString() : string {
		return ":" + this.range.toString() + " " + this.command.toString();
	}

	runOn(document : vscode.TextEditor, mapping : Mappings = null) : void {
		if (!this.command) {
			this.range.runOn(document);
			return;
		}

		// TODO: calc range
		this.command.runOn(document, mapping);
	}
}

export interface CommandBase {
	name : string;
	shortName : string;
	runOn(textEditor : vscode.TextEditor, mapping : Mappings) : void;
}
