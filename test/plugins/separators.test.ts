import { newTest } from '../testSimplifier';
import { cleanUpWorkspace, setupWorkspace } from '../testUtils';

suite('separators plugin', () => {
  suiteSetup(async () => {
    await setupWorkspace({
      fileExtension: '.js',
    });
  });
  suiteTeardown(cleanUpWorkspace);
  // test quotes types

  newTest({
    title: 'inside commas',
    start: ['a, |b, c, d'],
    keysPressed: 'di,',
    end: ['a,|, c, d'],
  });
  newTest({
    title: 'around commas',
    start: ['a, |b, c, d'],
    keysPressed: 'da,',
    end: ['a|, c, d'],
  });
  newTest({
    title: 'inside commas from before',
    start: ['|a, b, c, d'],
    keysPressed: 'di,',
    end: ['a,|, c, d'],
  });
  newTest({
    title: 'around commas from before',
    start: ['|a, b, c, d'],
    keysPressed: 'da,',
    end: ['a|, c, d'],
  });
  newTest({
    title: 'inside commas from after',
    start: ['a, b, c, |d'],
    keysPressed: 'di,',
    end: ['a, b,|, d'],
  });
  newTest({
    title: 'around commas from after',
    start: ['a, b, c, |d'],
    keysPressed: 'da,',
    end: ['a, b|, d'],
  });
  newTest({
    title: 'inside commas across lines',
    start: [
      'hi there,', //
      '|how is it going,', //
      'what are you up to',
    ],
    keysPressed: 'di,',
    end: [
      'hi there,', //
      '|,', //
      'what are you up to',
    ],
  });
  newTest({
    title: 'around commas across lines',
    start: [
      'hi there,', //
      '|how is it going,', //
      'what are you up to',
    ],
    keysPressed: 'da,',
    end: [
      'hi there|,', //
      'what are you up to',
    ],
  });
  newTest({
    title: 'inside commas across lines from before',
    start: [
      '|hi there,', //
      'how is it going,', //
      'what are you up to',
    ],
    keysPressed: 'di,',
    end: [
      'hi there,', //
      '|,', //
      'what are you up to',
    ],
  });
  newTest({
    title: 'inside commas across lines from after',
    start: [
      'hi there,', //
      'how is it going,', //
      'what are you up to|',
    ],
    keysPressed: 'di,',
    end: [
      'hi there,', //
      '|,', //
      'what are you up to',
    ],
  });
  newTest({
    title: 'around commas across lines from before',
    start: [
      '|hi there,', //
      'how is it going,', //
      'what are you up to',
    ],
    keysPressed: 'da,',
    end: [
      'hi there|,', //
      'what are you up to',
    ],
  });
  newTest({
    title: 'around commas across lines from after',
    start: [
      'hi there,', //
      'how is it going,', //
      'what are you up to|',
    ],
    keysPressed: 'da,',
    end: [
      'hi there|,', //
      'what are you up to',
    ],
  });
  newTest({
    title: 'no separators',
    start: ['|aaabcd'],
    keysPressed: 'di,',
    end: ['|aaabcd'],
  });

  newTest({
    title: 'inside periods',
    start: ['a. |b. c. d'],
    keysPressed: 'di.',
    end: ['a.|. c. d'],
  });
  newTest({
    title: 'around periods',
    start: ['a. |b. c. d'],
    keysPressed: 'da.',
    end: ['a|. c. d'],
  });
  newTest({
    title: 'inside semicolons',
    start: ['a; |b; c; d'],
    keysPressed: 'di;',
    end: ['a;|; c; d'],
  });
  newTest({
    title: 'around semicolons',
    start: ['a; |b; c; d'],
    keysPressed: 'da;',
    end: ['a|; c; d'],
  });
  newTest({
    title: 'inside colons',
    start: ['a: |b: c: d'],
    keysPressed: 'di:',
    end: ['a:|: c: d'],
  });
  newTest({
    title: 'around colons',
    start: ['a: |b: c: d'],
    keysPressed: 'da:',
    end: ['a|: c: d'],
  });
  newTest({
    title: 'inside pluses',
    start: ['a+ |b+ c+ d'],
    keysPressed: 'di+',
    end: ['a+|+ c+ d'],
  });
  newTest({
    title: 'around pluses',
    start: ['a+ |b+ c+ d'],
    keysPressed: 'da+',
    end: ['a|+ c+ d'],
  });
  newTest({
    title: 'inside minuses',
    start: ['a- |b- c- d'],
    keysPressed: 'di-',
    end: ['a-|- c- d'],
  });
  newTest({
    title: 'around minuses',
    start: ['a- |b- c- d'],
    keysPressed: 'da-',
    end: ['a|- c- d'],
  });
  newTest({
    title: 'inside equals',
    start: ['a= |b= c= d'],
    keysPressed: 'di=',
    end: ['a=|= c= d'],
  });
  newTest({
    title: 'around equals',
    start: ['a= |b= c= d'],
    keysPressed: 'da=',
    end: ['a|= c= d'],
  });
  newTest({
    title: 'inside tildes',
    start: ['a~ |b~ c~ d'],
    keysPressed: 'di~',
    end: ['a~|~ c~ d'],
  });
  newTest({
    title: 'around tildes',
    start: ['a~ |b~ c~ d'],
    keysPressed: 'da~',
    end: ['a|~ c~ d'],
  });
  newTest({
    title: 'inside underscores',
    start: ['a_ |b_ c_ d'],
    keysPressed: 'di_',
    end: ['a_|_ c_ d'],
  });
  newTest({
    title: 'around underscores',
    start: ['a_ |b_ c_ d'],
    keysPressed: 'da_',
    end: ['a|_ c_ d'],
  });
  newTest({
    title: 'inside asterisks',
    start: ['a* |b* c* d'],
    keysPressed: 'di*',
    end: ['a*|* c* d'],
  });
  newTest({
    title: 'around asterisks',
    start: ['a* |b* c* d'],
    keysPressed: 'da*',
    end: ['a|* c* d'],
  });
  newTest({
    title: 'inside hashes',
    start: ['a# |b# c# d'],
    keysPressed: 'di#',
    end: ['a#|# c# d'],
  });
  newTest({
    title: 'around hashes',
    start: ['a# |b# c# d'],
    keysPressed: 'da#',
    end: ['a|# c# d'],
  });
  newTest({
    title: 'inside slashes',
    start: ['a/ |b/ c/ d'],
    keysPressed: 'di/',
    end: ['a/|/ c/ d'],
  });
  newTest({
    title: 'around slashes',
    start: ['a/ |b/ c/ d'],
    keysPressed: 'da/',
    end: ['a|/ c/ d'],
  });
  newTest({
    title: 'inside backslashes',
    start: ['a\\ |b\\ c\\ d'],
    keysPressed: 'di\\',
    end: ['a\\|\\ c\\ d'],
  });
  newTest({
    title: 'around backslashes',
    start: ['a\\ |b\\ c\\ d'],
    keysPressed: 'da\\',
    end: ['a|\\ c\\ d'],
  });
  newTest({
    title: 'inside ampersands',
    start: ['a& |b& c& d'],
    keysPressed: 'di&',
    end: ['a&|& c& d'],
  });
  newTest({
    title: 'around ampersands',
    start: ['a& |b& c& d'],
    keysPressed: 'da&',
    end: ['a|& c& d'],
  });
  newTest({
    title: 'inside dollars',
    start: ['a$ |b$ c$ d'],
    keysPressed: 'di$',
    end: ['a$|$ c$ d'],
  });
  newTest({
    title: 'around dollars',
    start: ['a$ |b$ c$ d'],
    keysPressed: 'da$',
    end: ['a|$ c$ d'],
  });
});
