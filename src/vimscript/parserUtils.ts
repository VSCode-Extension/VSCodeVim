// eslint-disable-next-line id-denylist
import { alt, any, noneOf, Parser, regexp, seq, string, succeed, whitespace } from 'parsimmon';
import { configuration } from '../configuration/configuration';

export const numberParser: Parser<number> = regexp(/\d+/)
  .map((num) => Number.parseInt(num, 10))
  .desc('a number');
export const integerParser: Parser<number> = regexp(/-?\d+/).map((num) => Number.parseInt(num, 10));

export const bangParser: Parser<boolean> = string('!')
  .fallback(undefined)
  .map((bang) => bang !== undefined);

export function nameAbbrevParser(abbrev: string, rest: string): Parser<string> {
  const suffixes = [...Array(rest.length + 1).keys()]
    .reverse()
    .map((idx) => rest.substring(0, idx));
  return string(abbrev)
    .then(alt(...suffixes.map(string)))
    .map((suffix) => abbrev + suffix);
}

// TODO: `:help cmdline-special`
// TODO: `:help filename-modifiers`
export const fileNameParser: Parser<string> = alt<string>(
  string('\\').then(
    // eslint-disable-next-line id-denylist
    any.fallback(undefined).map((escaped) => {
      if (escaped === undefined || escaped === '\\') {
        return '\\';
      } else if (escaped === ' ') {
        return ' ';
      } else {
        // TODO: anything else that needs escaping?
        return `\\${escaped}`;
      }
    }),
  ),
  regexp(/\S/),
)
  .atLeast(1)
  .map((chars) => chars.join(''));

/**
 * Options for how a file should be encoded
 * See `:help ++opt`
 */
export type FileOpt = Array<[string, string | undefined]>;
export const fileOptParser: Parser<FileOpt> = string('++')
  .then(
    seq(
      alt(
        alt(string('ff'), string('fileformat')).result('ff'),
        alt(string('enc'), string('encoding')).result('enc'),
        alt(string('bin'), string('binary')).result('bin'),
        alt(string('nobin'), string('nobinary')).result('nobin'),
        string('bad'),
        string('edit'),
      ),
      string('=').then(regexp(/\S+/)).fallback(undefined),
    ),
  )
  .sepBy(whitespace)
  .desc('[++opt]');

/**
 * A Command which will be run after opening a file
 * See `:help +cmd`
 */
export type FileCmd =
  | {
      type: 'line_number';
      line: number;
    }
  | {
      type: 'last_line';
    };
export const fileCmdParser: Parser<FileCmd | undefined> = string('+')
  .then(
    alt<FileCmd>(
      // Exact line number
      numberParser.map((line) => ({ type: 'line_number', line })),
      // TODO: Next match of pattern
      // string('/').then(Pattern.parser({ direction: SearchDirection.Forward })),
      // TODO: Ex command
      // lazy(() => exCommandParser),
      // Last line
      succeed({ type: 'last_line' }),
    ),
  )
  .fallback(undefined)
  .desc('[+cmd]');

// TODO: re-create parser when leader changes
const leaderParser = regexp(/<leader>/).map(() => configuration.leader); // lazy evaluation of configuration.leader
const specialCharacters = regexp(/<(?:Esc|C-\w|A-\w|C-A-\w)>/);

const specialCharacterParser = alt(specialCharacters, leaderParser);

// TODO: Add more special characters
const escapedParser = string('\\')
  // eslint-disable-next-line id-denylist
  .then(any.fallback(undefined))
  .map((escaped) => {
    if (escaped === undefined) {
      return '\\\\';
    } else if (escaped === 'n') {
      return '\n';
    }
    return '\\' + escaped;
  });

export const keystrokesExpressionParser: Parser<string[]> = alt(
  escapedParser,
  specialCharacterParser,
  regexp(/./),
).many();

export const keystrokesExpressionForMacroParser: Parser<string[]> = alt(
  escapedParser,
  specialCharacterParser,
  noneOf('"'),
).many();
