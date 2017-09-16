import { setupWorkspace, cleanUpWorkspace } from './../testUtils';
import { ModeName } from '../../src/mode/mode';
import { ModeHandler } from '../../src/mode/modeHandler';
import { getTestingFunctions } from '../testSimplifier';
import { getAndUpdateModeHandler } from '../../extension';
import { Configuration } from '../../src/configuration/configuration';

function easymotionCommand(trigger: string, searchWord: string, jumpKey: string) {
  return ['<leader><leader>', trigger, searchWord, jumpKey].join('');
}

suite('easymotion plugin', () => {
  let modeHandler: ModeHandler;
  let { newTest, newTestOnly } = getTestingFunctions();

  setup(async () => {
    await setupWorkspace();
    modeHandler = await getAndUpdateModeHandler();
    Configuration.easymotion = true;
  });

  teardown(async () => {
    Configuration.easymotion = false;
    await cleanUpWorkspace();
  });

  newTest({
    title: 'Can handle s move',
    start: ['a|bcdabcd'],
    keysPressed: easymotionCommand('s', 'a', 'k'),
    end: ['|abcdabcd'],
  });

  newTest({
    title: 'Can handle 2s move',
    start: ['ab|cdabcd'],
    keysPressed: easymotionCommand('2s', 'ab', 'k'),
    end: ['|abcdabcd'],
  });

  newTest({
    title: 'Can handle f move',
    start: ['a|bcdabcdabcd'],
    keysPressed: easymotionCommand('f', 'a', 'k'),
    end: ['abcdabcd|abcd'],
  });

  newTest({
    title: 'Can handle 2f move',
    start: ['a|bcdabcdabcd'],
    keysPressed: easymotionCommand('2f', 'ab', 'k'),
    end: ['abcdabcd|abcd'],
  });

  newTest({
    title: 'Can handle F move',
    start: ['abcdabc|dabcd'],
    keysPressed: easymotionCommand('F', 'a', 'k'),
    end: ['|abcdabcdabcd'],
  });

  newTest({
    title: 'Can handle 2F move',
    start: ['abcdabc|dabcd'],
    keysPressed: easymotionCommand('2F', 'ab', 'k'),
    end: ['|abcdabcdabcd'],
  });

  newTest({
    title: 'Can handle t move',
    start: ['abcd|abcdabcd'],
    keysPressed: easymotionCommand('t', 'c', 'k'),
    end: ['abcdabcda|bcd'],
  });

  newTest({
    title: 'Can handle 2t move',
    start: ['abcd|abcdabcd'],
    keysPressed: easymotionCommand('2t', 'cd', 'k'),
    end: ['abcdabcda|bcd'],
  });

  newTest({
    title: 'Can handle T move',
    start: ['abcdab|cdabcd'],
    keysPressed: easymotionCommand('T', 'a', 'k'),
    end: ['a|bcdabcdabcd'],
  });

  newTest({
    title: 'Can handle 2T move',
    start: ['abcdabc|dabcd'],
    keysPressed: easymotionCommand('2T', 'ab', 'k'),
    end: ['ab|cdabcdabcd'],
  });

  newTest({
    title: 'Can handle w move',
    start: ['abc |def ghi jkl'],
    keysPressed: easymotionCommand('w', '', 'k'),
    end: ['abc def ghi |jkl'],
  });

  newTest({
    title: 'Can handle b move',
    start: ['abc def |ghi jkl'],
    keysPressed: easymotionCommand('b', '', 'k'),
    end: ['|abc def ghi jkl'],
  });

  newTest({
    title: 'Can handle e move',
    start: ['abc |def ghi jkl'],
    keysPressed: easymotionCommand('e', '', 'k'),
    end: ['abc def ghi jk|l'],
  });

  newTest({
    title: 'Can handle ge move',
    start: ['abc def |ghi jkl'],
    keysPressed: easymotionCommand('ge', '', 'k'),
    end: ['ab|c def ghi jkl'],
  });

  newTest({
    title: 'Can handle n-char move',
    start: ['abc |def ghi jkl', 'abc def ghi jkl'],
    keysPressed: easymotionCommand('/', 'ghi\n', 'k'),
    end: ['abc def ghi jkl', 'abc def |ghi jkl'],
  });

  newTest({
    title: 'Can handle j move',
    start: ['abc', 'd|ef', 'ghi', 'jkl'],
    keysPressed: easymotionCommand('j', '', 'k'),
    end: ['abc', 'def', 'ghi', '|jkl'],
  });

  newTest({
    title: 'Can handle k move',
    start: ['abc', 'def', 'g|hi', 'jkl'],
    keysPressed: easymotionCommand('k', '', 'k'),
    end: ['abc', '|def', 'ghi', 'jkl'],
  });
});
