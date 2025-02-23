export class Notation {
  // Mapping from a regex to the normalized string that it should be converted to.
  private static readonly notationMap: ReadonlyArray<[RegExp, string]> = [
    [/ctrl\+|c\-/gi, 'C-'],
    [/cmd\+|d\-/gi, 'D-'],
    [/alt\+|a\-/gi, 'A-'],
    [/shift\+|s\-/gi, 'S-'],
    [/escape|esc/gi, 'Esc'],
    [/backspace|bs/gi, 'BS'],
    [/delete|del/gi, 'Del'],
    [/home/gi, 'Home'],
    [/end/gi, 'End'],
    [/insert/gi, 'Insert'],
    [/<space>/gi, ' '],
    [/<cr>|<enter>|<return>/gi, '\n'],
  ];

  private static shiftedLetterRegex = /<S-[a-zA-Z]>/;

  /**
   * Converts keystroke like <tab> to a single control character like \t
   */
  public static ToControlCharacter(key: string) {
    if (key === '<tab>') {
      return '\t';
    }

    return key;
  }

  public static IsControlKey(key: string): boolean {
    key = key.toLocaleUpperCase();
    return (
      this.isSurroundedByAngleBrackets(key) && key !== '<BS>' && key !== '<S-BS>' && key !== '<TAB>'
    );
  }

  /**
   * Normalizes key to AngleBracketNotation
   * (e.g. <ctrl+x>, Ctrl+x, <c-x> normalized to <C-x>)
   * and converts the characters to their literals
   * (e.g. <space>, <cr>, <leader>)
   */
  public static NormalizeKey(key: string, leaderKey: string): string {
    if (typeof key !== 'string') {
      return key;
    }

    if (key.length === 1) {
      return key;
    }

    key = key.toLocaleLowerCase();

    if (!this.isSurroundedByAngleBrackets(key)) {
      key = `<${key}>`;
    }

    if (key === '<leader>') {
      return leaderKey;
    }

    if (['<up>', '<down>', '<left>', '<right>'].includes(key)) {
      return key;
    }

    for (const [regex, standardNotation] of this.notationMap) {
      key = key.replace(regex, standardNotation);
    }

    if (this.shiftedLetterRegex.test(key)) {
      key = key[3].toUpperCase();
    }

    return key;
  }

  /**
   * Converts a key to a form which will look nice when logged, etc.
   */
  public static printableKey(key: string, leaderKey: string) {
    const normalized = this.NormalizeKey(key, leaderKey);
    return normalized === ' ' ? '<space>' : normalized === '\n' ? '<enter>' : normalized;
  }

  private static isSurroundedByAngleBrackets(key: string): boolean {
    return key.startsWith('<') && key.endsWith('>');
  }
}
