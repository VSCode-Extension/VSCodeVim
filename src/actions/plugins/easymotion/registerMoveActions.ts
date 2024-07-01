import { RegisterAction } from './../../base';
import {
  buildTriggerKeys,
  EasyMotionCharMoveCommandBase,
  EasyMotionLineMoveCommandBase,
  EasyMotionWordMoveCommandBase,
  SearchByCharCommand,
  SearchByNCharCommand,
  SearchAroundCommand,
} from './easymotion.cmd';

// EasyMotion n-char-move command

@RegisterAction
class EasyMotionNCharSearchCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: '/' });

  constructor() {
    super(new SearchByNCharCommand(), true);
  }
}

@RegisterAction
class EasyMotionSearchAroundCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 's', leaderCount: 3 });

  constructor() {
    super(new SearchAroundCommand(), true);
  }
}

@RegisterAction
class EasyMotionRemoteYankCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 'yr', leaderCount: 3 });

  constructor() {
    super(new SearchAroundCommand(), true, true);
  }
}
// EasyMotion char-move commands

@RegisterAction
class EasyMotionTwoCharSearchCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: '2s' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 2 }));
  }
}

@RegisterAction
class EasyMotionTwoCharFindForwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: '2f' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 2, searchOptions: 'min' }));
  }
}

@RegisterAction
class EasyMotionTwoCharFindBackwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: '2F' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 2, searchOptions: 'max' }));
  }
}

@RegisterAction
class EasyMotionTwoCharTilCharacterForwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: '2t' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 2, searchOptions: 'min', labelPosition: 'before' }));
  }
}

// easymotion-bd-t2

@RegisterAction
class EasyMotionTwoCharTilCharacterBidirectionalCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 'bd2t', leaderCount: 3 });

  constructor() {
    super(new SearchByCharCommand({ charCount: 2, labelPosition: 'before' }));
  }
}

@RegisterAction
class EasyMotionTwoCharTilBackwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: '2T' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 2, searchOptions: 'max', labelPosition: 'after' }));
  }
}

@RegisterAction
class EasyMotionSearchCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 's' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 1 }));
  }
}

@RegisterAction
class EasyMotionFindForwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 'f' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 1, searchOptions: 'min' }));
  }
}

@RegisterAction
class EasyMotionFindBackwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 'F' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 1, searchOptions: 'max' }));
  }
}

@RegisterAction
class EasyMotionTilCharacterForwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 't' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 1, searchOptions: 'min', labelPosition: 'before' }));
  }
}

// easymotion-bd-t

@RegisterAction
class EasyMotionTilCharacterBidirectionalCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 'bdt', leaderCount: 3 });

  constructor() {
    super(new SearchByCharCommand({ charCount: 1, labelPosition: 'before' }));
  }
}

@RegisterAction
class EasyMotionTilBackwardCommand extends EasyMotionCharMoveCommandBase {
  keys = buildTriggerKeys({ key: 'T' });

  constructor() {
    super(new SearchByCharCommand({ charCount: 1, searchOptions: 'max', labelPosition: 'after' }));
  }
}

// EasyMotion word-move commands

@RegisterAction
class EasyMotionStartOfWordForwardsCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'w' });

  constructor() {
    super({ searchOptions: 'min' });
  }
}

// easymotion-bd-w

@RegisterAction
class EasyMotionStartOfWordBidirectionalCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'bdw', leaderCount: 3 });
}

@RegisterAction
class EasyMotionLineForward extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'l' });

  constructor() {
    super({ jumpToAnywhere: true, searchOptions: 'min', labelPosition: 'after' });
  }
}

@RegisterAction
class EasyMotionLineBackward extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'h' });

  constructor() {
    super({ jumpToAnywhere: true, searchOptions: 'max', labelPosition: 'after' });
  }
}

// easymotion "JumpToAnywhere" motion

@RegisterAction
class EasyMotionJumpToAnywhereCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'j', leaderCount: 3 });

  constructor() {
    super({ jumpToAnywhere: true, labelPosition: 'after' });
  }
}

@RegisterAction
class EasyMotionEndOfWordForwardsCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'e' });

  constructor() {
    super({ searchOptions: 'min', labelPosition: 'after' });
  }
}

// easymotion-bd-e

@RegisterAction
class EasyMotionEndOfWordBidirectionalCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'bde', leaderCount: 3 });

  constructor() {
    super({ labelPosition: 'after' });
  }
}

@RegisterAction
class EasyMotionBeginningWordCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'b' });

  constructor() {
    super({ searchOptions: 'max' });
  }
}

@RegisterAction
class EasyMotionEndBackwardCommand extends EasyMotionWordMoveCommandBase {
  keys = buildTriggerKeys({ key: 'ge' });

  constructor() {
    super({ searchOptions: 'max', labelPosition: 'after' });
  }
}

// EasyMotion line-move commands

@RegisterAction
class EasyMotionStartOfLineForwardsCommand extends EasyMotionLineMoveCommandBase {
  keys = buildTriggerKeys({ key: 'j' });

  constructor() {
    super({ searchOptions: 'min' });
  }
}

@RegisterAction
class EasyMotionStartOfLineBackwordsCommand extends EasyMotionLineMoveCommandBase {
  keys = buildTriggerKeys({ key: 'k' });

  constructor() {
    super({ searchOptions: 'max' });
  }
}

// easymotion-bd-jk

@RegisterAction
class EasyMotionStartOfLineBidirectionalCommand extends EasyMotionLineMoveCommandBase {
  keys = buildTriggerKeys({ key: 'bdjk', leaderCount: 3 });
}
