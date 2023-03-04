import * as assert from 'assert';
import * as srcConfiguration from '../../src/configuration/configuration';
import * as testConfiguration from '../testConfiguration';
import * as vscode from 'vscode';
import { cleanUpWorkspace, setupWorkspace } from './../testUtils';
import { Mode } from '../../src/mode/mode';
import { newTest } from '../testSimplifier';

suite('Configuration', () => {
  const configuration = new testConfiguration.Configuration();
  configuration.leader = '<space>';
  configuration.normalModeKeyBindingsNonRecursive = [
    {
      before: ['leader', 'o'],
      after: ['o', 'eSc', 'k'],
    },
    {
      before: ['<leader>', 'f', 'e', 's'],
      after: ['v'],
    },
  ];
  configuration.whichwrap = 'h,l';

  setup(async () => {
    await setupWorkspace(configuration);
  });

  teardown(cleanUpWorkspace);

  test('remappings are normalized', async () => {
    const normalizedKeybinds = srcConfiguration.configuration.normalModeKeyBindingsNonRecursive;
    const normalizedKeybindsMap = srcConfiguration.configuration.normalModeKeyBindingsMap;
    const testingKeybinds = configuration.normalModeKeyBindingsNonRecursive;

    assert.strictEqual(normalizedKeybinds.length, testingKeybinds.length);
    assert.strictEqual(normalizedKeybinds.length, normalizedKeybindsMap.size);
    assert.deepStrictEqual(normalizedKeybinds[0].before, [' ', 'o']);
    assert.deepStrictEqual(normalizedKeybinds[0].after, ['o', '<Esc>', 'k']);
  });

  newTest({
    title: 'textwidth can be overridden with the set command',
    config: { textwidth: 80 },
    start: ['|1 12 1 1'],
    keysPressed: ':set tw=2\ngqq',
    end: ['|1', '12', '1', '1'],
  });

  test('textwidth is configurable per-language', async () => {
    const globalVimConfig = vscode.workspace.getConfiguration('vim');
    const jsVimConfig = vscode.workspace.getConfiguration('vim', { languageId: 'javascript' });

    try {
      assert.strictEqual(jsVimConfig.get('textwidth'), 80);
      await jsVimConfig.update('textwidth', 120, vscode.ConfigurationTarget.Global, true);

      const updatedGlobalVimConfig = vscode.workspace.getConfiguration('vim');
      assert.strictEqual(updatedGlobalVimConfig.get('textwidth'), 80);

      const updatedJsVimConfig = vscode.workspace.getConfiguration('vim', {
        languageId: 'javascript',
      });
      assert.strictEqual(updatedJsVimConfig.get('textwidth'), 120);
    } finally {
      await globalVimConfig.update('textwidth', undefined, vscode.ConfigurationTarget.Global);
      await jsVimConfig.update('textwidth', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  newTest({
    title: 'Can handle long key chords',
    start: ['|'],
    // <leader>fes
    keysPressed: ' fes',
    end: ['|'],
    endMode: Mode.Visual,
  });
});
