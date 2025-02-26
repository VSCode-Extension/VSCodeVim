import {
  buildTriggerKeys,
  EasymotionTrigger,
} from '../../src/actions/plugins/easymotion/easymotion.cmd';
import { newTest } from '../testSimplifier';
import { setupWorkspace } from './../testUtils';

function easymotionCommand(trigger: EasymotionTrigger, searchWord: string, jumpKey: string) {
  return [...buildTriggerKeys(trigger), searchWord, jumpKey].join('');
}

suite('easymotion plugin', () => {
  suiteSetup(async () => {
    await setupWorkspace({
      config: { easymotion: true },
    });
  });

  newTest({
    title: 'Can handle s move',
    start: ['a|bcdabcd'],
    keysPressed: easymotionCommand({ key: 's' }, 'a', 'k'),
    end: ['|abcdabcd'],
  });

  newTest({
    title: 'Can handle 2s move',
    start: ['ab|cdabcd'],
    keysPressed: easymotionCommand({ key: '2s' }, 'ab', 'k'),
    end: ['|abcdabcd'],
  });

  newTest({
    title: 'Can handle f move',
    start: ['a|bcdabcdabcd'],
    keysPressed: easymotionCommand({ key: 'f' }, 'a', 'k'),
    end: ['abcdabcd|abcd'],
  });

  newTest({
    title: 'Can handle 2f move',
    start: ['a|bcdabcdabcd'],
    keysPressed: easymotionCommand({ key: '2f' }, 'ab', 'k'),
    end: ['abcdabcd|abcd'],
  });

  newTest({
    title: 'Can handle F move',
    start: ['abcdabc|dabcd'],
    keysPressed: easymotionCommand({ key: 'F' }, 'a', 'k'),
    end: ['|abcdabcdabcd'],
  });

  newTest({
    title: 'Can handle 2F move',
    start: ['abcdabc|dabcd'],
    keysPressed: easymotionCommand({ key: '2F' }, 'ab', 'k'),
    end: ['|abcdabcdabcd'],
  });

  newTest({
    title: 'Can handle t move',
    start: ['abcd|abcdabcd'],
    keysPressed: easymotionCommand({ key: 't' }, 'c', 'k'),
    end: ['abcdabcda|bcd'],
  });

  newTest({
    title: 'Can handle bd-t move',
    start: ['abcd|abcdabcd'],
    keysPressed: easymotionCommand({ key: 'bdt', leaderCount: 3 }, 'c', 'k'),
    end: ['a|bcdabcdabcd'],
  });

  newTest({
    title: 'Can handle 2t move',
    start: ['abcd|abcdabcd'],
    keysPressed: easymotionCommand({ key: '2t' }, 'cd', 'k'),
    end: ['abcdabcda|bcd'],
  });

  newTest({
    title: 'Can handle bd-t2 move',
    start: ['abcd|abcdabcd'],
    keysPressed: easymotionCommand({ key: 'bd2t', leaderCount: 3 }, 'cd', 'k'),
    end: ['a|bcdabcdabcd'],
  });

  newTest({
    title: 'Can handle T move',
    start: ['abcdab|cdabcd'],
    keysPressed: easymotionCommand({ key: 'T' }, 'a', 'k'),
    end: ['a|bcdabcdabcd'],
  });

  newTest({
    title: 'Can handle 2T move',
    start: ['abcdabc|dabcd'],
    keysPressed: easymotionCommand({ key: '2T' }, 'ab', 'k'),
    end: ['ab|cdabcdabcd'],
  });

  newTest({
    title: 'Can handle w move',
    start: ['abc |def ghi jkl'],
    keysPressed: easymotionCommand({ key: 'w' }, '', 'k'),
    end: ['abc def ghi |jkl'],
  });

  newTest({
    title: 'Can handle bd-w move',
    start: ['abc |def ghi jkl'],
    keysPressed: easymotionCommand({ key: 'bdw', leaderCount: 3 }, '', 'k'),
    end: ['|abc def ghi jkl'],
  });

  newTest({
    title: 'Can handle b move',
    start: ['abc def |ghi jkl'],
    keysPressed: easymotionCommand({ key: 'b' }, '', 'k'),
    end: ['|abc def ghi jkl'],
  });

  newTest({
    title: 'Can handle e move',
    start: ['abc |def ghi jkl'],
    keysPressed: easymotionCommand({ key: 'e' }, '', 'k'),
    end: ['abc def ghi jk|l'],
  });

  newTest({
    title: 'Can handle bd-e move',
    start: ['abc |def ghi jkl'],
    keysPressed: easymotionCommand({ key: 'bde', leaderCount: 3 }, '', 'k'),
    end: ['ab|c def ghi jkl'],
  });

  newTest({
    title: 'Can handle ge move',
    start: ['abc def |ghi jkl'],
    keysPressed: easymotionCommand({ key: 'ge' }, '', 'k'),
    end: ['ab|c def ghi jkl'],
  });

  newTest({
    title: 'Can handle n-char move',
    start: ['abc |def ghi jkl', 'abc def ghi jkl'],
    keysPressed: easymotionCommand({ key: '/' }, 'ghi\n', 'k'),
    end: ['abc def ghi jkl', 'abc def |ghi jkl'],
  });

  newTest({
    title: 'Can handle j move',
    start: ['abc', 'd|ef', 'ghi', 'jkl'],
    keysPressed: easymotionCommand({ key: 'j' }, '', 'k'),
    end: ['abc', 'def', 'ghi', '|jkl'],
  });

  newTest({
    title: 'Can handle k move',
    start: ['abc', 'def', 'g|hi', 'jkl'],
    keysPressed: easymotionCommand({ key: 'k' }, '', 'k'),
    end: ['abc', '|def', 'ghi', 'jkl'],
  });

  newTest({
    title: 'Can handle bd-jk move (1)',
    start: ['abc', 'def', '|ghi', 'jkl'],
    keysPressed: easymotionCommand({ key: 'bdjk', leaderCount: 3 }, '', 'k'),
    end: ['abc', '|def', 'ghi', 'jkl'],
  });

  newTest({
    title: 'Can handle bd-jk move (2)',
    start: ['abc', 'def', '|ghi', 'jkl'],
    keysPressed: easymotionCommand({ key: 'bdjk', leaderCount: 3 }, '', 'h'),
    end: ['abc', 'def', 'ghi', '|jkl'],
  });

  newTest({
    title: 'Can handle lineforward move (1)',
    start: ['|abcDefGhi'],
    keysPressed: easymotionCommand({ key: 'l', leaderCount: 2 }, '', 'h'),
    end: ['abc|DefGhi'],
  });

  newTest({
    title: 'Can handle lineforward move (2)',
    start: ['|abcDefGhi'],
    keysPressed: easymotionCommand({ key: 'l', leaderCount: 2 }, '', 'k'),
    end: ['abcDef|Ghi'],
  });

  newTest({
    title: 'Can handle linebackward move (1)',
    start: ['abcDefGh|i'],
    keysPressed: easymotionCommand({ key: 'h', leaderCount: 2 }, '', 'k'),
    end: ['abc|DefGhi'],
  });

  newTest({
    title: 'Can handle linebackward move (2)',
    start: ['abcDefGh|i'],
    keysPressed: easymotionCommand({ key: 'h', leaderCount: 2 }, '', 'h'),
    end: ['abcDef|Ghi'],
  });

  newTest({
    title: 'Can handle searching for backslash (\\)',
    start: ['|https:\\\\www.google.com'],
    keysPressed: easymotionCommand({ key: 'f' }, '\\', 'k'),
    end: ['https:\\|\\www.google.com'],
  });

  newTest({
    title: 'Can handle searching for carat (^)',
    start: ['|<^_^>'],
    keysPressed: easymotionCommand({ key: 'f' }, '^', 'h'),
    end: ['<|^_^>'],
  });

  newTest({
    title: 'Can handle searching for dot (.)',
    start: ['|https:\\\\www.google.com'],
    keysPressed: easymotionCommand({ key: 'f' }, '.', 'k'),
    end: ['https:\\\\www.google|.com'],
  });

  newTest({
    title: 'Can handle within-line search with single match',
    start: ['abc', '|abc'],
    keysPressed: easymotionCommand({ key: 'sl', leaderCount: 3 }, '', 'c'),
    end: ['abc', 'ab|c'],
  });

  newTest({
    title: 'Can handle within-line search with multiple matches',
    start: ['aaa', 'a|aa', 'aaa'],
    keysPressed: easymotionCommand({ key: 'sl', leaderCount: 3 }, 'a', 'h'),
    end: ['aaa', 'aa|a', 'aaa'],
  });

  newTest({
    title: 'Can handle within-line search with no match',
    start: ['abc', '|def'],
    keysPressed: easymotionCommand({ key: 'sl', leaderCount: 3 }, '', 'a'),
    end: ['abc', '|def'],
  });
});
