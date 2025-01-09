import { ErrorCode, VimError } from '../../error';
import { Register, RegisterMode } from '../../register/register';
import { list, register } from './build';
import { Value } from './types';

export function lookupRegister(registerName: string): Value {
  if (Register.isClipboardRegister(registerName)) {
    // Reading from the clipboard register is async, so for now is not supported
    throw VimError.fromCode(ErrorCode.CannotAccessClipboardRegister, registerName);
  }
  const registerArray = Register.getRegisterArray(registerName);
  if (registerArray === undefined || registerArray.length === 0) {
    throw VimError.fromCode(ErrorCode.NothingInRegister, registerName);
  }
  const values = registerArray.map((val) => {
    if (typeof val.text !== 'string') {
      throw VimError.fromCode(ErrorCode.CannotAccessRecordedStateRegister, registerName);
    }
    return register(val.text, registerModeToString(val.registerMode));
  });
  if (values.length === 1) {
    return values[0];
  }
  return list(values);
}

function registerModeToString(mode: RegisterMode): 'character' | 'line' | 'block' {
  switch (mode) {
    case RegisterMode.CharacterWise:
      return 'character';
    case RegisterMode.LineWise:
      return 'line';
    case RegisterMode.BlockWise:
      return 'block';
  }
}

export function stringToRegisterMode(mode: 'character' | 'line' | 'block'): RegisterMode {
  switch (mode) {
    case 'character':
      return RegisterMode.CharacterWise;
    case 'line':
      return RegisterMode.LineWise;
    case 'block':
      return RegisterMode.BlockWise;
  }
}
