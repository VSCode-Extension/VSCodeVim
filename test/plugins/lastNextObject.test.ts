import { newTest } from '../testSimplifier';
import { cleanUpWorkspace, setupWorkspace } from '../testUtils';
import { Mode } from '../../src/mode/mode';

suite('lastNextObject plugin', () => {
  suite('lastNextObject plugin disabled', () => {
    suiteSetup(async () => {
      await setupWorkspace({
        fileExtension: '.js',
      });
    });
    suiteTeardown(cleanUpWorkspace);
    // test next
    newTest({
      title: "next object - should not work as it's disabled",
      start: [
        '|a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        '|a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
  });
  suite('lastNextObject plugin', () => {
    suiteSetup(async () => {
      await setupWorkspace({
        config: {
          targets: {
            enable: true,
            bracketObjects: { enable: true },
            smartQuotes: {
              enable: false,
              breakThroughLines: false,
              aIncludesSurroundingSpaces: true,
            },
          },
        },
        fileExtension: '.js',
      });
    });
    suiteTeardown(cleanUpWorkspace);
    // test next
    newTest({
      title: 'next object - 1',
      start: [
        '|a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 2',
      start: [
        'a|(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 3',
      start: [
        'a(|b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 4',
      start: [
        'a(b|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 5',
      start: [
        'a(b)c|(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a (|) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 6',
      start: [
        'a(b)c(d)e', //
        'a |( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b (|) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 7',
      start: [
        'a(b)c(d)e', //
        'a ( b |( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d (|) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'next object - 8',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g|', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(|)b', //
      ],
    });
    newTest({
      title: 'next object - 9',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d |( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(|)b', //
      ],
    });
    newTest({
      title: 'next object - 10',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '|(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '|(a)b', //
      ],
    });
    newTest({
      title: 'next object - 11',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        '|a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(|)b', //
      ],
    });
    newTest({
      title: 'next object - 12',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '|', //
        '(a)b', //
      ],
      keysPressed: 'din(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(|)b', //
      ],
    });
    // test last
    newTest({
      title: 'last object - 1',
      start: [
        '|a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        '|a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 2',
      start: [
        'a|(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a|(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 3',
      start: [
        'a(|b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(|b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 4',
      start: [
        'a(b|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 5',
      start: [
        'a(b)|c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 6',
      start: [
        'a(b)c|(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 7',
      start: [
        'a(b)c(d|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(|)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 8',
      start: [
        'a(b)c(d)|e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 9',
      start: [
        'a(b)c(d)e', //
        '|a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 10',
      start: [
        'a(b)c(d)e', //
        'a |( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 11',
      start: [
        'a(b)c(d)e', //
        'a ( b |( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(|)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 12',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) |d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a ( b (|) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 13',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d |( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a ( b (|) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 14',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e )| f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d (|) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 15',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f |) g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d (|) f ) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 16',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) |g', //
        'a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a (|) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 17',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        '|a', //
        '', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a (|) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 18',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '|', //
        '(a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a (|) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 19',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(|a)b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a (|) g', //
        'a', //
        '', //
        '(a)b', //
      ],
    });
    newTest({
      title: 'last object - 20',
      start: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(a)|b', //
      ],
      keysPressed: 'dil(',
      end: [
        'a(b)c(d)e', //
        'a ( b ( c ) d ( e ) f ) g', //
        'a', //
        '', //
        '(|)b', //
      ],
    });
    // Test next/last argument
    newTest({
      title: 'Can select the first argument before opening bracket',
      start: ['fu|nction(foo, bar, baz)'],
      keysPressed: 'dina',
      end: ['function(|, bar, baz)'],
    });
    newTest({
      title: 'Can select the second argument with cursor at opening bracket',
      start: ['function|(foo, bar, baz)'],
      keysPressed: 'dina',
      end: ['function(foo, |, baz)'],
    });
    newTest({
      title:
        'Can search backwards for an argument if there is no last argument in current bracket pair',
      start: ['(foo, bar) function(f|oo, bar, baz)'],
      keysPressed: 'dila',
      end: ['(foo, |) function(foo, bar, baz)'],
    });
    newTest({
      title:
        'Can search forward for an argument if there is no next argument in current bracket pair',
      start: ['function(foo, bar, b|az)(foo, bar)'],
      keysPressed: 'dina',
      end: ['function(foo, bar, baz)(|, bar)'],
    });
    newTest({
      title: 'Can select inside next argument',
      start: ['function(foo, b|ar, baz)'],
      keysPressed: 'dina',
      end: ['function(foo, bar, |)'],
    });
    newTest({
      title: 'Can select around next argument',
      start: ['function(foo, b|ar, baz)'],
      keysPressed: 'dana',
      end: ['function(foo, bar|)'],
    });
    newTest({
      title: 'Can select inside last argument',
      start: ['function(foo, b|ar, baz)'],
      keysPressed: 'dila',
      end: ['function(|, bar, baz)'],
    });
    newTest({
      title: 'Can select around last argument',
      start: ['function(foo, b|ar, baz)'],
      keysPressed: 'dala',
      end: ['function(|bar, baz)'],
    });
    newTest({
      title: 'Can do cina before (,,,)',
      start: ['fu|nction(,,,)'],
      keysPressed: 'cina',
      end: ['function(|,,,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do clia after (,,,)',
      start: ['function(,,,)(f|oo, bar)'],
      keysPressed: 'cila',
      end: ['function(,,,|)(foo, bar)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cina in (,,,) with cursor at opening bracket',
      start: ['function|(,,,)'],
      keysPressed: 'cina',
      end: ['function(,|,,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cila in (,,,) with cursor at closing bracket',
      start: ['function(,,,|)'],
      keysPressed: 'cila',
      end: ['function(,,|,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cina in (,,,) with cursor at regular delimiter',
      start: ['function(,|,,)'],
      keysPressed: 'cina',
      end: ['function(,,,|)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cina in (,,,) with cursor at the first delimiter',
      start: ['function(|,,,)'],
      keysPressed: 'cina',
      end: ['function(,,|,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cila in (,,,) with cursor at regular delimiter',
      start: ['function(,|,,)'],
      keysPressed: 'cila',
      end: ['function(|,,,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cila in (,,,) with cursor at last delimiter',
      start: ['function(,,|,)'],
      keysPressed: 'cila',
      end: ['function(,|,,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cina before ()',
      start: ['fu|nction()'],
      keysPressed: 'cina',
      end: ['function(|)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cila after ()',
      start: ['function()ba|r'],
      keysPressed: 'cila',
      end: ['function(|)bar'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cina before (,)',
      start: ['fu|nction(,)'],
      keysPressed: 'cina',
      end: ['function(|,)'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'Can do cila after (,)',
      start: ['function(,)ba|r'],
      keysPressed: 'cila',
      end: ['function(,|)bar'],
      endMode: Mode.Insert,
    });
    newTest({
      title: 'cina will look for the next argument across lines',
      start: ['fu|nction (', '  foo', ') {}'],
      keysPressed: 'cina',
      end: ['function (', '  |', ') {}'],
    });
    newTest({
      title: 'cila will look for the last argument across lines',
      start: ['function (', '  foo', ') {|}'],
      keysPressed: 'cila',
      end: ['function (', '  |', ') {}'],
    });
  });
});
