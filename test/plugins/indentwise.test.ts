import { Globals } from '../../src/globals';
import { newTest } from '../testSimplifier';
import { cleanUpWorkspace, setupWorkspace, reloadConfiguration } from './../testUtils';

suite('indentwise', () => {
  setup(async () => {
    await setupWorkspace();
    Globals.mockConfiguration.indentwise = true;
    await reloadConfiguration();
  });

  teardown(cleanUpWorkspace);

  newTest({
    title: 'indentwise next greater',
    start: ['|apple', '    banana', '    carrot'],
    keysPressed: ']+',
    end: ['apple', '    |banana', '    carrot'],
  });

  newTest({
    title: 'indentwise next greater repeat',
    start: ['|apple', '    banana', '        carrot'],
    keysPressed: ']+;',
    end: ['apple', '    banana', '        |carrot'],
  });


  newTest({
    title: 'indentwise next greater count 2',
    start: ['|apple', '    banana', '        carrot'],
    keysPressed: '2]+',
    end: ['apple', '    banana', '        |carrot'],
  });

  newTest({
    title: 'indentwise next equal',
    start: ['|apple', '    banana', 'carrot'],
    keysPressed: ']=',
    end: ['apple', '    banana', '|carrot'],
  });

  newTest({
    title: 'indentwise next equal repeat',
    start: ['apple', '    |banana', '    carrot', '    date'],
    keysPressed: ']=;',
    end: ['apple', '    banana', '    carrot', '    |date'],
  });

  // newTest({
  //   title: 'indentwise next equal repeat reverse',
  //   start: ['apple', '    |banana', '    carrot', '    date'],
  //   keysPressed: ']=;,',
  //   end: ['apple', '    |banana', '    carrot', '    date'],
  // });

  newTest({
    title: 'indentwise next equal count 2',
    start: ['apple', '    |banana', '    carrot', '    date'],
    keysPressed: '2]=',
    end: ['apple', '    banana', '    carrot', '    |date'],
  });

  newTest({
    title: 'indentwise next less',
    start: ['        |apple', '    banana', '    carrot'],
    keysPressed: ']-',
    end: ['        apple', '    |banana', '    carrot'],
  });

  newTest({
    title: 'indentwise next less repeat',
    start: ['        |apple', '    banana', 'carrot'],
    keysPressed: ']-;',
    end: ['        apple', '    banana', '|carrot'],
  });

  newTest({
    title: 'indentwise next less count 2',
    start: ['        |apple', '    banana', 'carrot'],
    keysPressed: '2]-',
    end: ['        apple', '    banana', '|carrot'],
  });


  // relative previous
  newTest({
    title: 'indentwise previous greater',
    start: ['apple', ' banana', '|carrot'],
    keysPressed: '[+',
    end: ['apple', ' |banana', 'carrot'],
  });

  newTest({
    title: 'indentwise previous greater repeat',
    start: ['  apple', ' banana', '|carrot'],
    keysPressed: '[+;',
    end: ['  |apple', ' banana', 'carrot'],
  });


  newTest({
    title: 'indentwise previous greater count 2',
    start: ['  apple', ' banana', '|carrot'],
    keysPressed: '2[+',
    end: ['  |apple', ' banana', 'carrot'],
  });

  newTest({
    title: 'indentwise previous equal',
    start: ['apple', ' banana', '|carrot'],
    keysPressed: '[=',
    end: ['|apple', ' banana', 'carrot'],
  });

  newTest({
    title: 'indentwise previous equal repeat',
    start: ['apple', '    banana', '    carrot', '    |date'],
    keysPressed: '[=;',
    end: ['apple', '    |banana', '    carrot', '    date'],
  });

  // newTest({
  //   title: 'indentwise previous equal repeat reverse',
  //   start: ['apple', '    |banana', '    carrot', '    date'],
  //   keysPressed: ']=;,',
  //   end: ['apple', '    |banana', '    carrot', '    date'],
  // });

  newTest({
    title: 'indentwise previous equal count 2',
    start: ['apple', '    banana', '    carrot', '    |date'],
    keysPressed: '2[=',
    end: ['apple', '    |banana', '    carrot', '    date'],
  });

  newTest({
    title: 'indentwise previous less',
    start: ['apple', ' banana', ' |carrot'],
    keysPressed: '[-',
    end: ['|apple', ' banana', ' carrot'],
  });

  newTest({
    title: 'indentwise previous less repeat',
    start: ['apple', ' banana', '  |carrot'],
    keysPressed: '[-;',
    end: ['|apple', ' banana', '  carrot'],
  });

  newTest({
    title: 'indentwise previous less count 2',
    start: ['apple', ' banana', '  |carrot'],
    keysPressed: '2[-',
    end: ['|apple', ' banana', '  carrot'],
  });

  newTest({
    title: 'indentwise next absolute 0',
    start: ['    |apple', '        banana', 'carrot'],
    keysPressed: ']_0',
    end: ['    apple', '        banana', '|carrot'],
  });
  newTest({
    title: 'indentwise next absolute 0 repeat',
    start: ['    |apple', '        banana', 'carrot', 'date'],
    keysPressed: ']_0;',
    end: ['    apple', '        banana', 'carrot', '|date'],
  });
  // newTest({
  //   title: 'indentwise next absolute 1 repeat tabs',
  //   start: ['\t|apple', '        banana', '\tcarrot', '\tdate'],
  //   keysPressed: ']_1;',
  //   end: ['\tapple', '        banana', '\tcarrot', '\t|date'],
  // });
  newTest({
    title: 'indentwise next absolute 1 repeat',
    start: ['    |apple', '        banana', '  carrot', '  date'],
    keysPressed: ']_1;',
    end: ['    apple', '        banana', '  carrot', '  |date'],
  });
  // newTest({
  //   title: 'indentwise next absolute 2 repeat tabs',
  //   start: ['    |apple', '    banana', '\t\tcarrot', '\t\tdate'],
  //   keysPressed: ']_2;',
  //   end: ['    apple', '    banana', '\t\tcarrot', '\t\t|date'],
  // });
  newTest({
    title: 'indentwise next absolute 2 repeat',
    start: ['    |apple', '    banana', '    carrot', '    date'],
    keysPressed: ']_2;',
    end: ['    apple', '    banana', '    |carrot', '    date'],
  });

  newTest({
    title: 'indentwise previous absolute 0',
    start: ['apple', '        banana', '|carrot'],
    keysPressed: '[_0',
    end: ['|apple', '        banana', 'carrot'],
  });
  newTest({
    title: 'indentwise previous absolute 0 repeat',
    start: ['apple', '        banana', 'carrot', '|date'],
    keysPressed: '[_0;',
    end: ['|apple', '        banana', 'carrot', 'date'],
  });
  // newTest({
  //   title: 'indentwise previous absolute 1 repeat tabs',
  //   start: ['\tapple', '        banana', '\tcarrot', '|\tdate'],
  //   keysPressed: '[_1;',
  //   end: ['\t|apple', '        banana', '\tcarrot', '\tdate'],
  // });
  newTest({
    title: 'indentwise previous absolute 1 repeat',
    start: ['  apple', '        banana', '  carrot', '    |date'],
    keysPressed: '[_1;',
    end: ['  |apple', '        banana', '  carrot', '    date'],
  });
  // newTest({
  //   title: 'indentwise previous absolute 2 repeat tabs',
  //   start: ['\t\tapple', '    banana', '\t\tcarrot', '\t\tdate|'],
  //   keysPressed: '[_2;',
  //   end: ['\t\t|apple', '    banana', '\t\tcarrot', '\t\tdate'],
  // });
  newTest({
    title: 'indentwise previous absolute 2 repeat',
    start: ['    apple', '    banana', '        carrot', '        |date'],
    keysPressed: '[_2;',
    end: ['    |apple', '    banana', '        carrot', '        date'],
  });

  newTest({
    title: 'indentwise beginning of block',
    start: ['apple', '    banana', '    |carrot', '    date'],
    keysPressed: '[%',
    end: ['apple', '    |banana', '    carrot', '    date'],
  });
  newTest({
    title: 'indentwise end of block',
    start: ['apple', '    banana', '    |carrot', '    date', 'edamame'],
    keysPressed: ']%',
    end: ['apple', '    banana', '    carrot', '    |date', 'edamame'],
  });
});
