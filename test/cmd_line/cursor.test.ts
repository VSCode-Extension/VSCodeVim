import { getAndUpdateModeHandler } from '../../extension';
import { setupWorkspace, cleanUpWorkspace } from '../testUtils';
import { newTest } from '../testSimplifier';
import { CursorCommand } from '../../src/cmd_line/commands/cursor';

function cursor(pattern: string, then: string, count?: number): string {
  const countStr = count ? `${count}` : '';
  return `:cur ${countStr} ${pattern}\n${then}`;
}

suite('cursor', () => {
  const CH = CursorCommand.CURSOR_HERE;

  setup(async () => {
    await setupWorkspace();
    await getAndUpdateModeHandler();
  });

  suiteTeardown(cleanUpWorkspace);

  newTest({
    title: 'All matches',
    start: ['|abaa', 'aac'],
    keysPressed: cursor('a', 'x'),
    end: ['|b', 'c'],
  });

  newTest({
    title: 'Limit to one match',
    start: ['|aba'],
    keysPressed: cursor('a', 'x', 1),
    end: ['|ba'],
  });

  newTest({
    title: 'Start at end of line',
    start: ['abaa|', 'aac'],
    keysPressed: cursor('a', 'x', 2),
    end: ['abaa', '|c'],
  });

  newTest({
    title: 'With cursor position indicator',
    start: ['|abc'],
    keysPressed: cursor(`a${CH}bc`, 'x'),
    end: ['a|c'],
  });

  newTest({
    title: 'With multiple cursor position indicators',
    start: ['|abcde'],
    keysPressed: cursor(`a${CH}bc${CH}d`, 'x'),
    end: ['a|ce'],
  });

  newTest({
    title: 'With multiple cursor position indicators with limit',
    start: ['abc|de', 'abcde', 'abcde', 'abcde'],
    keysPressed: cursor(`a${CH}bc${CH}d`, 'x', 2),
    end: ['abcde', 'a|ce', 'ace', 'abcde'],
  });

  newTest({
    title: 'With multiple cursor position indicators with regex',
    start: ['|abc!e', 'a123!e'],
    keysPressed: cursor(`${CH}a\\w+${CH}!`, 'x'),
    end: ['|bce', '123e'],
  });

  // tests for empty pattern. should use the current word/selection as pattern
  newTest({
    title: 'Empty pattern',
    start: ['|abc', 'abc', 'bbc', 'abc'],
    keysPressed: cursor('', 'dw'),
    end: ['|', '', 'bbc', ''],
  });

  newTest({
    title: 'Empty pattern with limit',
    start: ['|abc', 'abc', 'bbc', 'abc'],
    keysPressed: cursor('', 'dw', 2),
    end: ['|', '', 'bbc', 'abc'],
  });

  newTest({
    title: 'Empty pattern, selection',
    start: ['|abcd', 'abcd', 'bbcd', 'abcd'],
    keysPressed: 'lvll' + cursor('', 'dw'),
    end: ['|a', 'a', 'b', 'a'],
  });

  newTest({
    title: 'Empty pattern, selection with limit',
    start: ['|abcd', 'abcd', 'bbcd', 'abcd'],
    keysPressed: 'lvll' + cursor('', 'dw', 3),
    end: ['|a', 'a', 'b', 'abcd'],
  });
});
