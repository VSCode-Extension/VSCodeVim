import { setupWorkspace } from './../../testUtils';
import { Mode } from '../../../src/mode/mode';
import { newTest, newTestSkip } from '../../testSimplifier';

suite('Motions in Normal Mode', () => {
  suiteSetup(setupWorkspace);

  suite('cjk', () => {
    newTest({
      title: 'j moves to right char downwards',
      start: ['ああ|あああ123456', 'aaaaaaaaaa123456'],
      keysPressed: 'j',
      end: ['あああああ123456', 'aaaa|aaaaaa123456'],
    });

    newTest({
      title: 'k moves to right char upwards',
      start: ['あああああ123456', 'aaaa|aaaaaa123456'],
      keysPressed: 'k',
      end: ['ああ|あああ123456', 'aaaaaaaaaa123456'],
    });
  });

  suite('w', () => {
    newTest({
      title: 'w moves to next word',
      start: ['one |two three four'],
      keysPressed: 'w',
      end: ['one two |three four'],
    });

    newTest({
      title: 'w goes over all whitespace',
      start: ['one |two \t  \t three four'],
      keysPressed: 'w',
      end: ['one two \t  \t |three four'],
    });

    newTest({
      title: 'w stops at punctuation',
      start: ['one |two,.;/three four'],
      keysPressed: 'w',
      end: ['one two|,.;/three four'],
    });

    newTest({
      title: 'w on punctuation jumps over punctuation',
      start: ['one two|,.;/three four'],
      keysPressed: 'w',
      end: ['one two,.;/|three four'],
    });

    newTest({
      title: 'w goes over EOL',
      start: ['o|ne  ', '  two three'],
      keysPressed: 'w',
      end: ['one  ', '  |two three'],
    });

    newTest({
      title: '[count]w',
      start: ['|one two three four'],
      keysPressed: '2w',
      end: ['one two |three four'],
    });
  });

  newTest({
    title: 'Can handle [(',
    start: ['({|})'],
    keysPressed: '[(',
    end: ['|({})'],
  });

  newTest({
    title: 'Can handle nested [(',
    start: ['(({|})'],
    keysPressed: '[(',
    end: ['(|({})'],
  });

  newTest({
    title: 'Can handle <number>[(',
    start: ['(({|})'],
    keysPressed: '2[(',
    end: ['|(({})'],
  });

  newTest({
    title: 'Can handle [( and character under cursor exclusive',
    start: ['(|({})'],
    keysPressed: '[(',
    end: ['|(({})'],
  });

  newTest({
    title: 'Can handle ])',
    start: ['({|})'],
    keysPressed: '])',
    end: ['({}|)'],
  });

  newTest({
    title: 'Can handle nested ])',
    start: ['(({|}))'],
    keysPressed: '])',
    end: ['(({}|))'],
  });

  newTest({
    title: 'Can handle <number>])',
    start: ['(({|}))'],
    keysPressed: '2])',
    end: ['(({})|)'],
  });

  newTest({
    title: 'Can handle ]) and character under cursor exclusive',
    start: ['(({}|))'],
    keysPressed: '])',
    end: ['(({})|)'],
  });

  newTest({
    title: 'Can handle [{',
    start: ['{(|)}'],
    keysPressed: '[{',
    end: ['|{()}'],
  });

  newTest({
    title: 'Can handle nested [{',
    start: ['{{(|)}'],
    keysPressed: '[{',
    end: ['{|{()}'],
  });

  newTest({
    title: 'Can handle <number>[{',
    start: ['{{(|)}'],
    keysPressed: '2[{',
    end: ['|{{()}'],
  });

  newTest({
    title: 'Can handle [{ and character under cursor exclusive',
    start: ['{|{()}'],
    keysPressed: '[{',
    end: ['|{{()}'],
  });

  newTest({
    title: 'Can handle ]}',
    start: ['{(|)}'],
    keysPressed: ']}',
    end: ['{()|}'],
  });

  newTest({
    title: 'Can handle nested ]}',
    start: ['{{(|)}}'],
    keysPressed: ']}',
    end: ['{{()|}}'],
  });

  newTest({
    title: 'Can handle <number>]}',
    start: ['{{(|)}}'],
    keysPressed: '2]}',
    end: ['{{()}|}'],
  });

  newTest({
    title: 'Can handle ]} and character under cursor exclusive',
    start: ['{{()|}}'],
    keysPressed: ']}',
    end: ['{{()}|}'],
  });

  newTest({
    title: "Can handle 'ge'",
    start: ['text tex|t'],
    keysPressed: '$ge',
    end: ['tex|t text'],
  });

  suite('gg', () => {
    newTest({
      title: 'gg (startofline=true)',
      config: { startofline: true },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: 'gg',
      end: [' |123456', ' 123456', ' 123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]gg (startofline=true)',
      config: { startofline: true },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '3gg',
      end: [' 123456', ' 123456', ' |123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]gg (startofline=true), count greater than last line',
      config: { startofline: true },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '9gg',
      end: [' 123456', ' 123456', ' |123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: 'gg (startofline=false)',
      config: { startofline: false },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: 'gg',
      end: [' 123|456', ' 123456', ' 123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]gg (startofline=false)',
      config: { startofline: false },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '3gg',
      end: [' 123456', ' 123456', ' 123|456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]gg (startofline=false), count greater than last line',
      config: { startofline: false },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '9gg',
      end: [' 123456', ' 123456', ' 123|456'],
      endMode: Mode.Normal,
    });
  });

  suite('G', () => {
    newTest({
      title: 'G (startofline=true)',
      config: { startofline: true },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: 'G',
      end: [' 123456', ' 123456', ' |123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]G (startofline=true)',
      config: { startofline: true },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '1G',
      end: [' |123456', ' 123456', ' 123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]G (startofline=true), count greater than last line',
      config: { startofline: true },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '9G',
      end: [' 123456', ' 123456', ' |123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: 'G (startofline=false)',
      config: { startofline: false },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: 'G',
      end: [' 123456', ' 123456', ' 123|456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]G (startofline=false)',
      config: { startofline: false },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '1G',
      end: [' 123|456', ' 123456', ' 123456'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '[count]G (startofline=false), count greater than last line',
      config: { startofline: false },
      start: [' 123456', ' 123|456', ' 123456'],
      keysPressed: '9G',
      end: [' 123456', ' 123456', ' 123|456'],
      endMode: Mode.Normal,
    });
  });

  newTest({
    title: 'Retain same column when moving up/down',
    start: ['text text', 'text', 'text tex|t'],
    keysPressed: 'kk',
    end: ['text tex|t', 'text', 'text text'],
  });

  newTest({
    title: 'Can handle <enter>',
    start: ['text te|xt', 'text'],
    keysPressed: '\n',
    end: ['text text', '|text'],
  });

  newTest({
    title: '$ always keeps cursor on EOL',
    start: ['text text', 'text', 'text tex|t'],
    keysPressed: 'gg$jj',
    end: ['text text', 'text', 'text tex|t'],
  });

  newTest({
    title: 'Can handle $ with a count',
    start: ['te|xt text', 'text', 'text text text'],
    keysPressed: '3$',
    end: ['text text', 'text', 'text text tex|t'],
  });

  newTest({
    title: 'Can handle $ with a count at end of file',
    start: ['te|xt text text'],
    keysPressed: '3$',
    end: ['text text tex|t'],
  });

  newTest({
    title: 'Can handle <End> with a count',
    start: ['te|xt text', 'text', 'text text text'],
    keysPressed: '3<End>',
    end: ['text text', 'text', 'text text tex|t'],
  });

  newTest({
    title: 'Can handle <D-right> with a count',
    start: ['te|xt text', 'text', 'text text text'],
    keysPressed: '3<D-right>',
    end: ['text text', 'text', 'text text tex|t'],
  });

  newTest({
    title: "Can handle 'f'",
    start: ['text tex|t'],
    keysPressed: '^ft',
    end: ['tex|t text'],
  });

  newTest({
    title: "Can handle 'f' twice",
    start: ['text tex|t'],
    keysPressed: '^ftft',
    end: ['text |text'],
  });

  newTest({
    title: "Can handle 'f' with <tab>",
    start: ['|text\tttext'],
    keysPressed: 'f<tab>',
    end: ['text|\tttext'],
  });

  newTest({
    title: "Can handle 'f' and find back search",
    start: ['text tex|t'],
    keysPressed: 'fe,',
    end: ['text t|ext'],
  });

  newTest({
    title: "Can handle 'F'",
    start: ['text tex|t'],
    keysPressed: '$Ft',
    end: ['text |text'],
  });

  newTest({
    title: "Can handle 'F' twice",
    start: ['text tex|t'],
    keysPressed: '$FtFt',
    end: ['tex|t text'],
  });

  newTest({
    title: "Can handle 'F' and find back search",
    start: ['|text text'],
    keysPressed: 'Fx,',
    end: ['te|xt text'],
  });

  // See #4313
  newTest({
    title: "Can handle 'f' and multiple back searches",
    start: ['|a a a a a'],
    keysPressed: 'fa;;;,,,',
    end: ['a |a a a a'],
  });

  newTest({
    title: "Can handle 't'",
    start: ['text tex|t'],
    keysPressed: '^tt',
    end: ['te|xt text'],
  });

  newTest({
    title: "Can handle 't' twice",
    start: ['text tex|t'],
    keysPressed: '^tttt',
    end: ['te|xt text'],
  });

  newTest({
    title: "Can handle 't' and find back search",
    start: ['text tex|t'],
    keysPressed: 'te,',
    end: ['text te|xt'],
  });

  newTest({
    title: "Can handle 'T'",
    start: ['text tex|t'],
    keysPressed: '$Tt',
    end: ['text t|ext'],
  });

  newTest({
    title: "Can handle 'T' twice",
    start: ['text tex|t'],
    keysPressed: '$TtTt',
    end: ['text t|ext'],
  });

  newTest({
    title: "Can handle 'T' and find back search",
    start: ['|text text'],
    keysPressed: 'Tx,',
    end: ['t|ext text'],
  });

  newTest({
    title: 'Can run a forward search',
    start: ['|one two three'],
    keysPressed: '/thr\n',
    end: ['one two |three'],
  });

  newTest({
    title: 'Can run a forward and find next search',
    start: ['|one two two two'],
    keysPressed: '/two\nn',
    end: ['one two |two two'],
  });

  newTest({
    title: 'Can run a forward and find previous search from end of word',
    start: ['|one two one two'],
    keysPressed: '/two/e\nN',
    end: ['one two one tw|o'],
  });

  newTest({
    title: 'Can run a forward search with count 1',
    start: ['|one two two two'],
    keysPressed: '1/tw\n',
    end: ['one |two two two'],
  });

  newTest({
    title: 'Can run a forward search with count 3',
    start: ['|one two two two'],
    keysPressed: '3/tw\n',
    end: ['one two two |two'],
  });

  newTest({
    title: 'Can run a forward search with count exceeding max number of matches and wrapscan',
    start: ['|one two two two'],
    keysPressed: '5/tw\n',
    end: ['one two |two two'],
  });

  newTest({
    title: 'Can run a forward search with count exceeding max number of matches and nowrapscan',
    config: { wrapscan: false },
    start: ['|one two two two'],
    keysPressed: '5/tw\n',
    end: ['|one two two two'],
    statusBar: 'E385: Search hit BOTTOM without match for: tw',
  });

  // These "remembering history between editor" tests have started
  // breaking. Since I don't remember these tests ever breaking for real, and
  // because they're the cause of a lot of flaky tests, I'm disabling these for
  // now.

  // test('Remembers a forward search from another editor', async function() {
  //   // adding another editor
  //   await setupWorkspace();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['|one two two two'],
  //     keysPressed: '/two\n',
  //     end: ['one |two two two'],
  //   });

  //   await modeHandler.handleMultipleKeyEvents(['g', 'T', '<Esc>']);

  //   await waitForTabChange();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['|three four two one'],
  //     keysPressed: '<Esc>n',
  //     end: ['three four |two one'],
  //   });
  // });

  // test('Shares forward search history from another editor', async () => {
  //   // adding another editor
  //   await setupWorkspace();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['|one two two two'],
  //     keysPressed: '/two\n',
  //     end: ['one |two two two'],
  //   });

  //   await modeHandler.handleMultipleKeyEvents(['g', 'T', '<Esc>']);

  //   await waitForTabChange();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['|three four two one'],
  //     keysPressed: '/\n',
  //     end: ['three four |two one'],
  //   });
  // });

  newTest({
    title: 'Can run a reverse search',
    start: ['one two thre|e'],
    keysPressed: '?two\n',
    end: ['one |two three'],
  });

  newTest({
    title: 'Can run a reverse and find next search',
    start: ['one two two thre|e'],
    keysPressed: '?two\nn',
    end: ['one |two two three'],
  });

  newTest({
    title: 'Can run a reverse search with count 1',
    start: ['one one one |two'],
    keysPressed: '1?on\n',
    end: ['one one |one two'],
  });

  newTest({
    title: 'Can run a reverse search with count 3',
    start: ['one one one |two'],
    keysPressed: '3?on\n',
    end: ['|one one one two'],
  });

  newTest({
    title: 'Can run a reverse search with count exceeding max number of matches',
    start: ['one one one |two'],
    keysPressed: '5?on\n',
    end: ['one |one one two'],
  });

  // test('Remembers a reverse search from another editor', async () => {
  //   // adding another editor
  //   await setupWorkspace();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['one two two two|'],
  //     keysPressed: '?two\n',
  //     end: ['one two two |two'],
  //   });

  //   await modeHandler.handleMultipleKeyEvents(['g', 'T', '<Esc>']);

  //   await waitForTabChange();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['three four two one|'],
  //     keysPressed: '<Esc>n',
  //     end: ['three four |two one'],
  //   });
  // });

  // test('Shares reverse search history from another editor', async () => {
  //   // adding another editor
  //   await setupWorkspace();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['one two two two|'],
  //     keysPressed: '?two\n',
  //     end: ['one two two |two'],
  //   });

  //   await modeHandler.handleMultipleKeyEvents(['g', 'T', '<Esc>']);

  //   await waitForTabChange();

  //   await testIt(modeHandler, {
  //     title: '',
  //     start: ['three four two one|'],
  //     keysPressed: '?\n',
  //     end: ['three four |two one'],
  //   });
  // });

  newTest({
    title: 'cancelled search reverts to previous search state',
    start: ['|one', 'two two', 'three three three'],
    keysPressed: '/two\n/three<Esc>n',
    end: ['one', 'two |two', 'three three three'],
  });

  newTest({
    title: 'Backspace on empty search cancels',
    start: ['|one two three'],
    keysPressed: '/tw<BS><BS><BS>',
    end: ['|one two three'],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'Search offsets: b does nothing',
    start: ['|hayneedlehay'],
    keysPressed: '/needle/b\n',
    end: ['hay|needlehay'],
  });

  newTest({
    title: 'Search offsets: b2 goes 2 to the right',
    start: ['|hayneedlehay'],
    keysPressed: '/needle/b2\n',
    end: ['hayne|edlehay'],
  });

  newTest({
    title: 'Search offsets: b+3 goes 3 to the right',
    start: ['|hayneedlehay'],
    keysPressed: '/needle/b+3\n',
    end: ['haynee|dlehay'],
  });

  newTest({
    title: 'Search offsets: e goes to the end',
    start: ['|hayneedlehay'],
    keysPressed: '/needle/e\n',
    end: ['hayneedl|ehay'],
  });

  newTest({
    title: 'Search offsets: character offset goes across line boundaries',
    start: ['|hayneedlehay', '123'],
    keysPressed: '/needle/e+5\n',
    end: ['hayneedlehay', '1|23'],
  });

  newTest({
    title: 'Search offsets: 2 goes 2 down',
    start: ['|hayneedlehay', 'abc', 'def'],
    keysPressed: '/needle/2\n',
    end: ['hayneedlehay', 'abc', '|def'],
  });

  newTest({
    title: 'Search offsets: -2 goes 2 up',
    start: ['abc', '|def', 'hayneedlehay', 'abc', 'def'],
    keysPressed: '/needle/-2\n',
    end: ['|abc', 'def', 'hayneedlehay', 'abc', 'def'],
  });

  newTest({
    title: 'maintains column position correctly',
    start: ['|one one one', 'two', 'three'],
    keysPressed: 'lllljj',
    end: ['one one one', 'two', 'thre|e'],
  });

  newTest({
    title: 'maintains column position correctly with $',
    start: ['|one one one', 'two', 'three'],
    keysPressed: '$jj',
    end: ['one one one', 'two', 'thre|e'],
  });

  // This is still currently not possible.
  // newTest({
  //   title: "Can handle dot with I with tab",
  //   start: ['on|e', 'two', 'three'],
  //   keysPressed: 'I<tab><Esc>j.j.',
  //   end: ['  one', '  two', ' | three']
  // });

  newTest({
    title: 'Can handle 0',
    start: ['blah blah bla|h'],
    keysPressed: '0',
    end: ['|blah blah blah'],
  });

  newTest({
    title: 'Can handle 0 as part of a repeat',
    start: ['|blah blah blah'],
    keysPressed: '10l',
    end: ['blah blah |blah'],
  });

  for (const config of [{ visualstar: true }, { visualstar: false }]) {
    newTest({
      title: 'Can handle g*',
      config,
      start: ['|blah duh blahblah duh blah'],
      keysPressed: 'g*',
      end: ['blah duh |blahblah duh blah'],
    });

    newTest({
      title: 'Can handle g*n',
      config,
      start: ['|blah duh blahblah duh blah'],
      keysPressed: 'g*n',
      end: ['blah duh blah|blah duh blah'],
    });

    newTest({
      title: 'Can handle *',
      config,
      start: ['|blah blahblah duh blah blah'],
      keysPressed: '*',
      end: ['blah blahblah duh |blah blah'],
    });

    newTest({
      title: 'Can handle **',
      config,
      start: ['|blah duh blah duh blah'],
      keysPressed: '**',
      end: ['blah duh blah duh |blah'],
    });

    newTest({
      title: '* ignores smartcase (ignorecase=true)',
      config: { ignorecase: true, smartcase: true, ...config },
      start: ['|test TEST test'],
      keysPressed: '*',
      end: ['test |TEST test'],
    });

    newTest({
      title: '* ignores smartcase (ignorecase=false)',
      config: { ignorecase: false, smartcase: true, ...config },
      start: ['|test TEST test'],
      keysPressed: '*',
      end: ['test TEST |test'],
    });

    newTest({
      title: '* skips over word separators',
      config,
      start: ['const x| = 2 + 2;'],
      // TODO: this should only require a single *
      keysPressed: '**',
      end: ['const x = 2 + |2;'],
    });

    newTest({
      title: '* uses word separator if no word characters found before EOL',
      config,
      start: ['if (x === 2)| {', '  if (y === 3) {'],
      // TODO: this should only require a single *
      keysPressed: '**',
      end: ['if (x === 2) {', '  if (y === 3) |{'],
    });

    newTest({
      title: '* does not go over line boundaries',
      config,
      start: ['one  |   ', 'one two one two'],
      keysPressed: '*',
      end: ['one  |   ', 'one two one two'],
      statusBar: 'E348: No string under cursor',
    });

    newTest({
      title: 'Can handle # on whitespace',
      config,
      start: ['abc abcdef| abc'],
      keysPressed: '#',
      end: ['|abc abcdef abc'],
    });

    newTest({
      title: 'Can handle # on EOL',
      config,
      start: ['abc abcdef abc| '],
      keysPressed: '#',
      end: ['abc abcdef abc| '],
    });

    newTest({
      title: 'Can handle g#',
      config,
      start: ['blah duh blahblah duh |blah'],
      keysPressed: 'g#',
      end: ['blah duh blah|blah duh blah'],
    });

    newTest({
      title: 'Can handle g#n',
      config,
      start: ['blah duh blahblah duh |blah'],
      keysPressed: 'g#n',
      end: ['blah duh |blahblah duh blah'],
    });

    newTest({
      title: 'Can handle #',
      config,
      start: ['blah blah blahblah duh |blah'],
      keysPressed: '#',
      end: ['blah |blah blahblah duh blah'],
    });

    newTest({
      title: 'Can handle # already on the word',
      config,
      start: ['one o|ne'],
      keysPressed: '#',
      end: ['|one one'],
    });

    newTest({
      title: 'Can handle ##',
      config,
      start: ['blah duh blah duh |blah'],
      keysPressed: '##',
      end: ['|blah duh blah duh blah'],
    });

    // These tests take advantage of the fact that an empty search repeats the last search
    newTest({
      title: '* adds to search history',
      config,
      start: ['|ONE two three ONE two three four ONE'],
      keysPressed: '*/\n',
      end: ['ONE two three ONE two three four |ONE'],
    });
    newTest({
      title: '# adds to search history',
      config,
      start: ['ONE two three ONE two three four |ONE'],
      keysPressed: '#?\n',
      end: ['|ONE two three ONE two three four ONE'],
    });
  }

  newTest({
    title: 'Can handle |',
    start: ['blah duh blah duh |blah'],
    keysPressed: '|',
    end: ['|blah duh blah duh blah'],
  });

  newTest({
    title: 'Can handle <number> |',
    start: ['blah duh blah duh |blah'],
    keysPressed: '3|',
    end: ['bl|ah duh blah duh blah'],
  });

  newTest({
    title: 'Can handle +',
    start: ['|blah', 'duh'],
    keysPressed: '+',
    end: ['blah', '|duh'],
  });

  newTest({
    title: 'Can handle + indent',
    start: ['|blah', '   duh'],
    keysPressed: '+',
    end: ['blah', '   |duh'],
  });

  newTest({
    title: 'Can handle + with count prefix',
    start: ['|blah', 'duh', 'dur', 'hur'],
    keysPressed: '2+',
    end: ['blah', 'duh', '|dur', 'hur'],
  });

  newTest({
    title: 'Can handle -',
    start: ['blah', '|duh'],
    keysPressed: '-',
    end: ['|blah', 'duh'],
  });

  newTest({
    title: 'Can handle - indent',
    start: ['   blah', '|duh'],
    keysPressed: '-',
    end: ['   |blah', 'duh'],
  });

  newTest({
    title: 'Can handle - with count prefix',
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: '2-',
    end: ['|blah', 'duh', 'dur', 'hur'],
  });

  newTest({
    title: 'Can handle _',
    start: ['blah', '|duh'],
    keysPressed: '_',
    end: ['blah', '|duh'],
  });

  newTest({
    title: 'Can handle _ with count prefix',
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: '2_',
    end: ['blah', 'duh', 'dur', '|hur'],
  });

  newTest({
    title: 'Can handle g_',
    start: ['blah', '|duh'],
    keysPressed: 'g_',
    end: ['blah', 'du|h'],
  });

  newTest({
    title: 'Can handle g_ with count prefix',
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: '2g_',
    end: ['blah', 'duh', 'dur', 'hu|r'],
  });

  suite('`go` motion', () => {
    newTest({
      title: '`go` without count goes to start of document',
      start: ['abc', 'de|f', 'ghi'],
      keysPressed: 'go',
      end: ['|abc', 'def', 'ghi'],
    });

    newTest({
      title: '`[count]go` goes to offset <count>',
      start: ['abc', 'de|f', 'ghi'],
      keysPressed: '3go',
      end: ['ab|c', 'def', 'ghi'],
    });

    // TODO(#4844): this fails on Windows due to \r\n
    newTestSkip(
      {
        title: '`[count]go` goes to offset <count>, newlines disregarded',
        start: ['abc', 'de|f', 'ghi'],
        keysPressed: '10go',
        end: ['abc', 'def', 'g|hi'],
      },
      process.platform === 'win32',
    );
  });

  newTest({
    title: 'Can handle <up> key',
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: '<up>',
    end: ['blah', '|duh', 'dur', 'hur'],
  });

  newTest({
    title: 'Can handle <down> key',
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: '<down>',
    end: ['blah', 'duh', 'dur', '|hur'],
  });

  newTest({
    title: 'Can handle <left> key',
    start: ['blah', 'duh', 'd|ur', 'hur'],
    keysPressed: '<left>',
    end: ['blah', 'duh', '|dur', 'hur'],
  });

  newTest({
    title: 'Can handle <right> key',
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: '<right>',
    end: ['blah', 'duh', 'd|ur', 'hur'],
  });

  newTest({
    title: "Can handle 'gk'",
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: 'gk',
    end: ['blah', '|duh', 'dur', 'hur'],
  });

  newTest({
    title: "Can handle 'gj'",
    start: ['blah', 'duh', '|dur', 'hur'],
    keysPressed: 'gj',
    end: ['blah', 'duh', 'dur', '|hur'],
  });

  newTestSkip({
    title: "Preserves cursor position when handling 'gk'",
    start: ['blah', 'duh', 'a', 'hu|r '],
    keysPressed: 'gkgk',
    end: ['blah', 'du|h', 'a', 'hur '],
  });

  newTestSkip({
    title: "Preserves cursor position when handling 'gj'",
    start: ['blah', 'du|h', 'a', 'hur '],
    keysPressed: 'gjgj',
    end: ['blah', 'duh', 'a', 'hu|r '],
  });

  newTest({
    title: 'special treatment of curly braces',
    start: ['{', '|    {  {  }   }   ', '}'],
    keysPressed: 'di{',
    end: ['{', '    {|}   ', '}'],
  });

  newTest({
    title: 'no special treatment of curly braces if any other character is present',
    start: ['{', 'a  |  {  {  }   }   ', '}'],
    keysPressed: 'di{',
    end: ['{', '|}'],
  });

  suite("doesn't update desiredColumn when it shouldn't", () => {
    newTest({
      title: 'Preserves desired cursor position when pressing zz',
      start: ['very long line of text....|.', 'short line'],
      keysPressed: 'jzzk',
      end: ['very long line of text....|.', 'short line'],
    });

    newTest({
      title: 'Preserves desired cursor position when pressing zt',
      start: ['very long line of text....|.', 'short line'],
      keysPressed: 'jztk',
      end: ['very long line of text....|.', 'short line'],
    });

    newTest({
      title: 'Preserves desired cursor position when pressing zb',
      start: ['very long line of text....|.', 'short line'],
      keysPressed: 'jzbk',
      end: ['very long line of text....|.', 'short line'],
    });

    newTest({
      title: 'Preserves desired cursor position when pressing <C-e>',
      start: ['very long line of text....|.', 'short line'],
      keysPressed: 'j<C-e>k',
      end: ['very long line of text....|.', 'short line'],
    });

    newTest({
      title: 'Preserves desired cursor position when pressing <C-y>',
      start: ['short line', 'very long line of text....|.'],
      keysPressed: 'k<C-y>j',
      end: ['short line', 'very long line of text....|.'],
    });

    newTest({
      title: 'Preserves desired cursor position when starting, but not completing, operator',
      start: ['short line', 'very long line of text....|.'],
      keysPressed: 'k' + 'd<Esc>' + 'j',
      end: ['short line', 'very long line of text....|.'],
    });
  });

  suite('Special marks', () => {
    newTest({
      title: 'Jump to visual start `<',
      start: ['one |Xx two three'],
      keysPressed: 'v2ev`<',
      end: ['one |Xx two three'],
    });

    newTest({
      title: 'Jump to visual end `>',
      start: ['|one two Xx three'],
      keysPressed: 'v2wv1G`>',
      end: ['one two |Xx three'],
    });

    newTest({
      title: "Jump (line) to visual start '<",
      start: ['one', 'Xx|x', 'two', '  three'],
      keysPressed: "vjjv'<",
      end: ['one', '|Xxx', 'two', '  three'],
    });

    newTest({
      title: "Jump (line) to visual end '>",
      start: ['|one', '  Xxx', 'two', '  three'],
      keysPressed: "vjv1G'>",
      end: ['one', '  |Xxx', 'two', '  three'],
    });

    newTest({
      title: 'Jump to visual line start `<',
      start: ['one', 't|wo', 'three', 'four'],
      keysPressed: 'Vj<Esc>' + 'gg' + '`<',
      end: ['one', '|two', 'three', 'four'],
    });

    newTest({
      title: 'Jump to visual line end `>',
      start: ['one', 't|wo', 'three', 'four'],
      keysPressed: 'Vj<Esc>' + 'gg' + '`>',
      end: ['one', 'two', 'thre|e', 'four'],
    });

    newTest({
      title: '`] go to the end of the previously operated or put text',
      start: ['hello|'],
      keysPressed: 'a world<Esc>`]',
      end: ['hello worl|d'],
    });

    newTest({
      title: "'] go to the end of the previously operated or put text",
      start: ['hello|'],
      keysPressed: "a world<Esc>']",
      end: ['|hello world'],
    });

    newTest({
      title: '`[ go to the start of the previously operated or put text',
      start: ['hello|'],
      keysPressed: 'a world<Esc>`[',
      end: ['hello| world'],
    });

    newTest({
      title: "'[ go to the start of the previously operated or put text",
      start: ['hello|'],
      keysPressed: "a world<Esc>'[",
      end: ['|hello world'],
    });

    newTest({
      title: '`. works correctly',
      start: ['on|e'],
      keysPressed: 'atwo<Esc>`.',
      end: ['one|two'],
    });

    newTest({
      title: "'. works correctly",
      start: ['on|e'],
      keysPressed: "atwo<Esc>'.",
      end: ['|onetwo'],
    });
  });
});
