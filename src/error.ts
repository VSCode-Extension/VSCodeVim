interface IErrorMessage {
  [index: number]: string;
}

export enum ErrorCode {
  InvalidAddress = 14,
  InvalidExpression = 15,
  InvalidRange = 16,
  MarkNotSet = 20,
  NoAlternateFile = 23,
  NoInsertedTextYet = 29,
  NoFileName = 32,
  NoPreviousSubstituteRegularExpression = 33,
  NoPreviousCommand = 34,
  NoPreviousRegularExpression = 35,
  NoWriteSinceLastChange = 37,
  MultipleMatches = 93,
  NoMatchingBuffer = 94,
  MissingQuote = 114,
  UnknownFunction_call = 117,
  TooManyArgs = 118,
  NotEnoughArgs = 119,
  UndefinedVariable = 121,
  ErrorWritingToFile = 208,
  FileNoLongerAvailable = 211,
  RecursiveMapping = 223,
  NoStringUnderCursor = 348,
  NothingInRegister = 353,
  InvalidRegisterName = 354,
  SearchHitTop = 384,
  SearchHitBottom = 385,
  CannotCloseLastWindow = 444,
  ArgumentRequired = 471,
  InvalidArgument474 = 474,
  InvalidArgument475 = 475,
  NoRangeAllowed = 481,
  PatternNotFound = 486,
  TrailingCharacters = 488,
  NotAnEditorCommand = 492,
  NoBuffersDeleted = 516,
  UnknownOption = 518,
  NumberRequiredAfterEqual = 521,
  AtStartOfChangeList = 662,
  AtEndOfChangeList = 663,
  ChangeListIsEmpty = 664,
  ListIndexOutOfRange = 684,
  ArgumentOfSortMustBeAList = 686,
  CanOnlyCompareListWithList = 691,
  InvalidOperationForList = 692,
  CannotIndexAFuncref = 695,
  UnknownFunction_funcref = 700,
  InvalidTypeForLen = 701,
  UsingAFuncrefAsANumber = 703,
  FuncrefVariableNameMustStartWithACapital = 704,
  ArgumentOfMaxMustBeAListOrDictionary = 712, // TODO: This should be different for min(), count()
  ListRequired = 714,
  DictionaryRequired = 715,
  KeyNotPresentInDictionary = 716,
  CannotUseSliceWithADictionary = 719,
  DuplicateKeyInDictionary = 721,
  StrideIsZero = 726,
  StartPastEnd = 727,
  UsingADictionaryAsANumber = 728,
  UsingListAsAString = 730,
  UsingFuncrefAsAString = 729,
  UsingDictionaryAsAString = 731,
  CanOnlyCompareDictionaryWithDictionary = 735,
  InvalidOperationForDictionary = 736,
  ValueIsLocked = 741,
  UsingAListAsANumber = 745,
  NoPreviouslyUsedRegister = 748,
  CannotUseModuloWithFloat = 804,
  UsingAFloatAsANumber = 805,
  UsingFloatAsAString = 806,
  NumberOrFloatRequired = 808,
  ArgumentOfMapMustBeAListDictionaryOrBlob = 896,
  ListOrBlobRequired = 897,
  ExpectedADict = 922,
  SecondArgumentOfFunction = 923,
  BlobLiteralShouldHaveAnEvenNumberOfHexCharacters = 973,
  UsingABlobAsANumber = 974,
  CannotModifyExistingVariable = 995,
  CannotLockARegister = 996,
  CannotAccessClipboardRegister = 997,
  UsingARegisterAsANumber = 998,
  CannotAccessRecordedStateRegister = 999,
  InvalidOperationForRegister = 1000,
}

export const ErrorMessage: IErrorMessage = {
  14: 'Invalid address',
  15: 'Invalid expression',
  16: 'Invalid range',
  20: 'Mark not set',
  23: 'No alternate file',
  29: 'No inserted text yet',
  32: 'No file name',
  33: 'No previous substitute regular expression',
  34: 'No previous command',
  35: 'No previous regular expression',
  37: 'No write since last change (add ! to override)',
  93: 'More than one match',
  94: 'No matching buffer',
  114: 'Missing quote',
  117: 'Unknown function',
  118: 'Too many arguments for function',
  119: 'Not enough arguments for function',
  121: 'Undefined variable',
  208: 'Error writing to file',
  211: 'File no longer available', // TODO: Should be `File "[file_name]" no longer available`
  223: 'Recursive mapping',
  348: 'No string under cursor',
  353: 'Nothing in register',
  354: 'Invalid register name',
  384: 'Search hit TOP without match for',
  385: 'Search hit BOTTOM without match for',
  444: 'Cannot close last window',
  471: 'Argument required',
  474: 'Invalid argument',
  475: 'Invalid argument',
  481: 'No range allowed',
  486: 'Pattern not found',
  488: 'Trailing characters',
  492: 'Not an editor command',
  516: 'No buffers were deleted',
  518: 'Unknown option',
  521: 'Number required after =',
  662: 'At start of changelist',
  663: 'At end of changelist',
  664: 'changelist is empty',
  684: 'list index out of range',
  686: 'Argument of sort() must be a List',
  691: 'Can only compare List with List',
  692: 'Invalid operation for List',
  695: 'Cannot index a Funcref',
  700: 'Unknown function',
  701: 'Invalid type for len()',
  703: 'Using a Funcref as a Number',
  704: 'Funcref variable name must start with a capital',
  712: 'Argument of max() must be a List or Dictionary',
  714: 'List required',
  715: 'Dictionary required',
  716: 'Key not present in Dictionary',
  719: 'Cannot use [:] with a Dictionary',
  721: 'Duplicate key in Dictionary',
  726: 'Stride is zero',
  727: 'Start past end',
  728: 'Using a Dictionary as a Number',
  729: 'using Funcref as a String',
  730: 'Using List as a String',
  731: 'Using Dictionary as a String',
  735: 'Can only compare Dictionary with Dictionary',
  736: 'Invalid operation for Dictionary',
  741: 'Value is locked',
  745: 'Using a List as a Number',
  748: 'No previously used register',
  804: "Cannot use '%' with Float",
  805: 'Using a Float as a Number',
  806: 'Using Float as a String',
  808: 'Number or Float required',
  896: 'Argument of map() must be a List, Dictionary or Blob',
  897: 'List or Blob required',
  922: 'expected a dict',
  923: 'Second argument of function() must be a list or a dict',
  973: 'Blob literal should have an even number of hex characters',
  974: 'Using a Blob as a Number',
  995: 'Cannot modify existing variable',
  996: 'Cannot lock a register',
  997: 'Cannot access clipboard register',
  998: 'Using a register as a Number',
  999: 'Cannot access recorded state register',
  1000: 'Invalid operation for register',
};

export class VimError extends Error {
  public readonly code: number;
  public override readonly message: string;

  private constructor(code: number, message: string) {
    super();
    this.code = code;
    this.message = message;
  }

  static fromCode(code: ErrorCode, extraValue?: string): VimError {
    if (ErrorMessage[code]) {
      if (extraValue) {
        if (code === ErrorCode.NothingInRegister) {
          extraValue = ` ${extraValue}`;
        } else if (code === ErrorCode.NoMatchingBuffer || code === ErrorCode.MultipleMatches) {
          extraValue = ` for ${extraValue}`;
        } else {
          extraValue = `: ${extraValue}`;
        }
      }
      return new VimError(code, ErrorMessage[code] + (extraValue ?? ''));
    }

    throw new Error('unknown error code: ' + code);
  }

  override toString(): string {
    return `E${this.code}: ${this.message}`;
  }
}

/**
 * Used to stop a remapping or a chain of nested remappings after a VimError, a failed action
 * or the force stop recursive mapping key (<C-c> or <Esc>). (Vim doc :help map-error)
 */
export class ForceStopRemappingError extends Error {
  constructor(reason: string = 'StopRemapping') {
    super(reason);
  }

  static fromVimError(vimError: VimError): ForceStopRemappingError {
    return new ForceStopRemappingError(vimError.toString());
  }
}
