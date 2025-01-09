import { Mode } from '../../src/mode/mode';
import { newTest } from '../testSimplifier';
import { setupWorkspace, cleanUpWorkspace } from '../testUtils';

suite('Search Current Word Exact (* and #)', () => {
  suiteSetup(setupWorkspace);
  suiteTeardown(cleanUpWorkspace);

  newTest({
    title: '* search exact current word',
    start: [
      'fo|o is not neither a fool nor foo_a nor fo_foo nor f_foo-o but foo instead, and the later foo is irrelevant',
    ],
    keysPressed: '*',
    end: [
      'foo is not neither a fool nor foo_a nor fo_foo nor f_foo-o but |foo instead, and the later foo is irrelevant',
    ],
    endMode: Mode.Normal,
  });

  newTest({
    title: '# search exact current word',
    start: [
      'foo is not neither a fool nor foo_a nor fo_foo nor f_foo-o but f|oo instead, and the later foo is irrelevant',
    ],
    keysPressed: '#',
    end: [
      '|foo is not neither a fool nor foo_a nor fo_foo nor f_foo-o but foo instead, and the later foo is irrelevant',
    ],
    endMode: Mode.Normal,
  });

  newTest({
    title: '* search exact current word on many lines',
    start: [
      'while',
      'I was',
      'a fo|o',
      'I found out',
      'I was a fool',
      'and that my friend was a foo',
      "so I'm trying not being",
      'a foo',
    ],
    keysPressed: '*',
    end: [
      'while',
      'I was',
      'a foo',
      'I found out',
      'I was a fool',
      'and that my friend was a |foo',
      "so I'm trying not being",
      'a foo',
    ],
    endMode: Mode.Normal,
  });

  newTest({
    title: '# search exact current word on many lines',
    start: [
      'while',
      'I was',
      'a foo',
      'I found out',
      'I was a fool',
      'and that my friend was a foo',
      "so I'm trying not being",
      'a f|oo',
    ],
    keysPressed: '#',
    end: [
      'while',
      'I was',
      'a foo',
      'I found out',
      'I was a fool',
      'and that my friend was a |foo',
      "so I'm trying not being",
      'a foo',
    ],
    endMode: Mode.Normal,
  });
});

suite('Search Current Word (g* and g#)', () => {
  suiteSetup(setupWorkspace);
  suiteTeardown(cleanUpWorkspace);

  newTest({
    title: 'g* search current word 1',
    start: [
      'while foo is not a foo_a nor a fo_foo, fo|o is a fool, and the later foo is irrelevant',
    ],
    keysPressed: 'g*',
    end: ['while foo is not a foo_a nor a fo_foo, foo is a |fool, and the later foo is irrelevant'],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g# search current word 1',
    start: [
      'while foo is not a foo_a nor a fo_foo, fool is a f|oo, and the later foo is irrelevant',
    ],
    keysPressed: 'g#',
    end: ['while foo is not a foo_a nor a fo_foo, |fool is a foo, and the later foo is irrelevant'],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g* search current word 2',
    start: [
      'while foo is not a foo_a nor a fool, fo|o is somewhat a fo_fool, and the later foo is irrelevant',
    ],
    keysPressed: 'g*',
    end: [
      'while foo is not a foo_a nor a fool, foo is somewhat a fo_|fool, and the later foo is irrelevant',
    ],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g# search current word 2',
    start: [
      'while foo is not a foo_a nor a fool, fo_fool is somewhat a fo|o, and the later foo is irrelevant',
    ],
    keysPressed: 'g#',
    end: [
      'while foo is not a foo_a nor a fool, fo_|fool is somewhat a foo, and the later foo is irrelevant',
    ],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g* search current word on not repeat',
    start: [
      'while foo is not a foo_a nor a fo_foo, foo is a foo|l, and the later foo is irrelevant',
    ],
    keysPressed: 'g*',
    end: ['while foo is not a foo_a nor a fo_foo, foo is a |fool, and the later foo is irrelevant'],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g# search current word on not repeat',
    start: [
      'while foo is not a foo_a nor a fo_foo, foo is a foo|l, and the later foo is irrelevant',
    ],
    keysPressed: 'g#',
    end: ['while foo is not a foo_a nor a fo_foo, foo is a |fool, and the later foo is irrelevant'],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g* search current word on many lines',
    start: [
      'while',
      'I was',
      'a fo|o',
      'I found out',
      'I was a fool',
      'and that my friend was a foo',
      "so I'm trying not being",
      'a foo',
    ],
    keysPressed: 'g*',
    end: [
      'while',
      'I was',
      'a foo',
      'I found out',
      'I was a |fool',
      'and that my friend was a foo',
      "so I'm trying not being",
      'a foo',
    ],
    endMode: Mode.Normal,
  });

  newTest({
    title: 'g# search current word on many lines',
    start: [
      'I found out',
      'I was a fool',
      'while',
      'I was',
      'a fo|o',
      'and that my friend was a foo',
      "so I'm trying not being",
      'a foo',
    ],
    keysPressed: 'g#',
    end: [
      'I found out',
      'I was a |fool',
      'while',
      'I was',
      'a foo',
      'and that my friend was a foo',
      "so I'm trying not being",
      'a foo',
    ],
    endMode: Mode.Normal,
  });
});
