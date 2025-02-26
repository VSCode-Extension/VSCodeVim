import { readFileAsync, writeFileAsync } from 'platform/fs';
import { Globals } from '../globals';
import { RecordedState } from './../state/recordedState';
import { VimState } from './../state/vimState';
import { Clipboard } from './../util/clipboard';

/**
 * This is included in the register file.
 * Whenever the format saved to disk changes, so should this.
 */
const REGISTER_FORMAT_VERSION = '1.0';

/**
 * There are two different modes of copy/paste in Vim - copy by character
 * and copy by line. Copy by line typically happens in Visual Line mode, but
 * also shows up in some other actions that work over lines (most notably dd,
 * yy).
 */
export enum RegisterMode {
  CharacterWise,
  LineWise,
  BlockWise,
}

export type RegisterContent = string | RecordedState;

export interface IRegisterContent {
  text: RegisterContent;
  registerMode: RegisterMode;
}

export class Register {
  private static readonly specialRegisters: readonly string[] = [
    '"', // Unnamed (default)
    '*', // Clipboard
    '+', // Clipboard
    '.', // Last inserted text
    '-', // Last deleted text less than a line
    '/', // Most recently executed search
    ':', // Most recently executed command
    '%', // Current file path (relative to workspace root)
    '#', // Previous file path (relative to workspace root)
    '_', // Black hole (always empty)
    '=', // Expression register
  ];

  private static registers: Map<string, IRegisterContent[]>;

  /**
   * Puts given content in the currently selected register, using the current RegisterMode.
   *
   * @param copyToUnnamed: If true, set the unnamed register (") as well
   */
  public static put(
    vimState: VimState,
    content: RegisterContent,
    multicursorIndex?: number,
    copyToUnnamed?: boolean, // TODO: This should be a part of the options object
    options: { registerName?: string; registerMode?: RegisterMode; forceOverwrite?: boolean } = {},
  ): void {
    const register = options.registerName || vimState.recordedState.registerName;

    if (!Register.isValidRegister(register)) {
      throw new Error(`Invalid register ${register}`);
    }

    if (Register.isBlackHoleRegister(register) || Register.isReadOnlyRegister(register)) {
      return;
    }

    if (Register.isValidUppercaseRegister(register) && !options.forceOverwrite) {
      Register.appendToRegister(
        vimState,
        Register.decapitalize(register),
        content,
        multicursorIndex ?? 0,
        options.registerMode,
      );
    } else {
      Register.overwriteRegister(
        vimState,
        Register.decapitalize(register),
        content,
        multicursorIndex ?? 0,
        options.registerMode,
      );
    }

    if (copyToUnnamed && register !== '"') {
      Register.registers.set('"', Register.registers.get(register)!);
    }
  }

  private static decapitalize(register: string): string {
    return Register.isValidUppercaseRegister(register) ? register.toLowerCase() : register;
  }

  public static isValidRegister(register: string): boolean {
    return (
      Register.isValidLowercaseRegister(register) ||
      Register.isValidUppercaseRegister(register) ||
      /^[0-9]$/.test(register) ||
      this.specialRegisters.includes(register)
    );
  }

  public static isValidRegisterForMacro(register: string): boolean {
    return /^[a-zA-Z0-9:]$/.test(register);
  }

  private static isBlackHoleRegister(registerName: string): boolean {
    return registerName === '_';
  }

  public static isClipboardRegister(registerName: string): boolean {
    return registerName === '*' || registerName === '+';
  }

  private static isReadOnlyRegister(registerName: string): boolean {
    return ['.', '%', ':', '#', '/'].includes(registerName);
  }

  private static isValidLowercaseRegister(register: string): boolean {
    return /^[a-z]$/.test(register);
  }

  public static isValidUppercaseRegister(register: string): boolean {
    return /^[A-Z]$/.test(register);
  }

  /**
   * Puts the content at the specified index of the multicursor Register.
   * If multicursorIndex === 0, the register will be completely overwritten. Otherwise, just that index will be.
   */
  public static overwriteRegister(
    vimState: VimState,
    register: string,
    content: RegisterContent,
    multicursorIndex: number,
    registerMode?: RegisterMode,
  ): void {
    if (multicursorIndex === 0 || !Register.registers.has(register)) {
      Register.registers.set(register, []);
    }

    Register.registers.get(register)![multicursorIndex] = {
      registerMode: registerMode || vimState.currentRegisterMode,
      text: content,
    };

    if (
      multicursorIndex === 0 &&
      this.isClipboardRegister(register) &&
      !(content instanceof RecordedState)
    ) {
      void Clipboard.Copy(content);
    }

    this.processNumberedRegisters(vimState, content);
  }

  /**
   * Appends the content at the specified index of the multicursor Register.
   */
  private static appendToRegister(
    vimState: VimState,
    register: string,
    content: RegisterContent,
    multicursorIndex: number,
    registerMode?: RegisterMode,
  ): void {
    if (!Register.registers.has(register)) {
      Register.registers.set(register, []);
    }

    const contentByCursor = Register.registers.get(register)!;
    const oldContent = contentByCursor[multicursorIndex];
    if (oldContent === undefined) {
      contentByCursor[multicursorIndex] = {
        registerMode: vimState.currentRegisterMode,
        text: content,
      };
    } else {
      if (!registerMode) {
        // Line-wise trumps other RegisterModes
        registerMode =
          vimState.currentRegisterMode === RegisterMode.LineWise
            ? RegisterMode.LineWise
            : oldContent.registerMode;
      }
      let newText: RegisterContent;
      if (oldContent.text instanceof RecordedState || content instanceof RecordedState) {
        newText = oldContent.text;
      } else {
        newText = oldContent.text + (registerMode === RegisterMode.LineWise ? '\n' : '') + content;
      }
      contentByCursor[multicursorIndex] = {
        registerMode,
        text: newText,
      };
    }

    if (multicursorIndex === 0 && this.isClipboardRegister(register)) {
      const newContent = contentByCursor[multicursorIndex].text;
      if (!(newContent instanceof RecordedState)) {
        void Clipboard.Copy(newContent);
      }
    }
  }

  /**
   * Updates a readonly register's content. This is the only way to do so.
   */
  public static setReadonlyRegister(
    register: '.' | '%' | ':' | '#' | '/',
    content: RegisterContent,
  ) {
    Register.registers.set(register, [
      {
        text: content,
        registerMode: RegisterMode.CharacterWise,
      },
    ]);
  }

  /**
   * Handles special cases for Yank- and DeleteOperator.
   */
  private static processNumberedRegisters(vimState: VimState, content: RegisterContent): void {
    // Find the BaseOperator of the current actions
    const baseOperator = vimState.recordedState.operator || vimState.recordedState.command;
    if (!baseOperator) {
      return;
    }

    if (baseOperator.name === 'yank_op' || baseOperator.name === 'yank_full_line') {
      // 'yank' to 0 only if no register was specified
      const registerCommand = vimState.recordedState.actionsRun.find((value) => {
        return value.name === 'cmd_register';
      });

      if (!registerCommand) {
        Register.registers.set('0', [
          {
            text: content,
            registerMode: vimState.currentRegisterMode,
          },
        ]);
      }
    } else if (
      (baseOperator.name === 'delete_op' ||
        baseOperator.name === 'delete_char' ||
        baseOperator.name === 'delete_last_char' ||
        baseOperator.name === 'delete_char_visual_line_mode' ||
        baseOperator.name === 'delete_char_with_del') &&
      !(vimState.macro !== undefined || vimState.isReplayingMacro)
    ) {
      if (
        !content.toString().match(/\n/g) &&
        vimState.currentRegisterMode !== RegisterMode.LineWise
      ) {
        Register.registers.set('-', [
          {
            text: content,
            registerMode: RegisterMode.CharacterWise,
          },
        ]);
      } else {
        // shift 'delete-history' register
        for (let index = 9; index > 1; index--) {
          const previous = Register.registers.get(String(index - 1));
          if (previous) {
            Register.registers.set(String(index), { ...previous });
          }
        }

        // Paste last delete into register '1'
        Register.registers.set('1', [
          {
            text: content,
            registerMode: vimState.currentRegisterMode,
          },
        ]);
      }
    }
  }

  /**
   * Gets content from a register. If no register is specified, uses `vimState.recordedState.registerName`.
   */
  public static async get(
    register: string,
    multicursorIndex = 0,
  ): Promise<IRegisterContent | undefined> {
    const contentByCursor = Register.getRegisterArray(register);

    if (Register.isClipboardRegister(register)) {
      const clipboardContent = (await Clipboard.Paste()).replace(/\r\n/g, '\n');
      const currentRegisterContent = (contentByCursor?.[0]?.text as string)?.replace(/\r\n/g, '\n');
      if (currentRegisterContent !== clipboardContent) {
        // System clipboard seems to have changed
        const registerContent = {
          text: clipboardContent,
          registerMode: RegisterMode.CharacterWise,
        };
        Register.registers.set(register, [registerContent]);
        return registerContent;
      }
    }

    // Default to the first cursor.
    if (contentByCursor?.[multicursorIndex] === undefined) {
      // If multicursorIndex is too high, try the first cursor
      multicursorIndex = 0;
    }

    return contentByCursor?.[multicursorIndex];
  }

  public static getRegisterArray(register: string): IRegisterContent[] | undefined {
    if (!Register.isValidRegister(register)) {
      throw new Error(`Invalid register ${register}`);
    }
    return Register.registers.get(register.toLowerCase());
  }

  public static has(register: string): boolean {
    return Register.registers.has(register);
  }

  public static getKeys(): string[] {
    return [...Register.registers.keys()];
  }

  public static clearAllRegisters(): void {
    Register.registers.clear();
  }

  public static async saveToDisk(supportNode: boolean): Promise<void> {
    if (supportNode) {
      const serializableRegisters = new Array<[string, IRegisterContent[]]>();
      for (const [key, contentByCursor] of Register.registers) {
        if (!contentByCursor.some((content) => content instanceof RecordedState)) {
          serializableRegisters.push([key, contentByCursor]);
        }
      }
      return import('path').then((path) => {
        return writeFileAsync(
          path.join(Globals.extensionStoragePath, '.registers'),
          JSON.stringify({
            version: REGISTER_FORMAT_VERSION,
            registers: serializableRegisters,
          }),
          'utf8',
        );
      });
    }
  }

  public static loadFromDisk(supportNode: boolean): void {
    if (supportNode) {
      Register.registers = new Map();
      void import('path').then((path) => {
        void readFileAsync(path.join(Globals.extensionStoragePath, '.registers'), 'utf8').then(
          (savedRegisters) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const parsed = JSON.parse(savedRegisters);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (parsed.version === REGISTER_FORMAT_VERSION) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
              Register.registers = new Map(parsed.registers);
            }
          },
        );
      });
    } else {
      Register.registers = new Map();
    }
  }
}
