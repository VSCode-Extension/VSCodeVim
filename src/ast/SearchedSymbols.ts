import * as vscode from 'vscode';
import { SymbolSearchResult, SymbolFound } from './SymbolSearchResult';

/**
 * This is a class that contains the symbols that were searched and the resulting searchResult.
 * This makes it possible to keep track of the ancestors of a symbol as well as its full position
 * in the Abstract Syntax Tree (AST).
 *
 * The symbol class provided by VSCode is not enough and makes it hard to traverse the AST if
 * not starting from the root or if the cursor is in between 2 symbols.
 *
 * Also by using keeping of a symbol's parents it becomes much easier to
 * get the ancestry of a symbol.
 */
export class SearchedSymbols {
  symbols: vscode.DocumentSymbol[];
  searchResult: SymbolSearchResult;
  parent?: SearchedSymbols;

  constructor(
    symbols: vscode.DocumentSymbol[],
    searchResult: SymbolSearchResult,
    parent?: SearchedSymbols
  ) {
    this.symbols = symbols;
    this.searchResult = searchResult;
    this.parent = parent;
  }

  /**
   * Returns a list containing all the ancestors of a symbol. We go from left (child) to
   * right (ancestor) in the list where index 0 is the child symbol and last index is the
   * root symbol. This is the opposite of VSCode's breadcrumbs that go from
   * ancestor (left) to children (right).
   */
  public listCurrentAndAncestors(): SearchedSymbols[] {
    let current: SearchedSymbols | undefined = this;
    const listAncestry: SearchedSymbols[] = [];

    while (current !== undefined) {
      listAncestry.push(current);
      current = current.parent;
    }

    return listAncestry;
  }

  /**
   * Searches the current symbol and then its ancestors to find the first symbol
   * whose SymbolKind is in the whitelist (for example a function symbol or a
   * class symbol depending on the whitelist). The starting node is included
   * here.
   *
   * @param whitelist, a set of SymbolKind containing the type of symbol to search
   *
   * @returns the first ancestor that has the right SymbolKind
   */
  public searchUpward(whitelist: Set<vscode.SymbolKind>): SearchedSymbols | null {
    const listAncestors = this.listCurrentAndAncestors();
    for (const ancestor of listAncestors) {
      if (
        ancestor.searchResult instanceof SymbolFound &&
        ancestor.searchResult.symbol !== undefined &&
        whitelist.has(ancestor.searchResult.symbol.kind)
      ) {
        return ancestor;
      }
    }
    return null;
  }
}
