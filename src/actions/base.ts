import { configuration } from './../configuration/configuration';
import { ModeName } from './../mode/mode';
import { VimState } from './../state/vimState';

const is2DArray = function<T>(x: any): x is T[][] {
  return Array.isArray(x[0]);
};

export let compareKeypressSequence = function(one: string[] | string[][], two: string[]): boolean {
  if (is2DArray(one)) {
    for (const sequence of one) {
      if (compareKeypressSequence(sequence, two)) {
        return true;
      }
    }

    return false;
  }

  if (one.length !== two.length) {
    return false;
  }

  const containsControlKey = (s: string): boolean => {
    // We count anything starting with < (e.g. <c-u>) as a control key, but we
    // exclude the first 3 because it's more convenient to do so.
    s = s.toUpperCase();
    return s !== '<BS>' && s !== '<SHIFT+BS>' && s !== '<TAB>' && s.startsWith('<') && s.length > 1;
  };

  const isSingleNumber: RegExp = /^[0-9]$/;
  const isSingleAlpha: RegExp = /^[a-zA-Z]$/;

  for (let i = 0, j = 0; i < one.length; i++, j++) {
    const left = one[i],
      right = two[j];

    if (left === '<any>') {
      continue;
    }
    if (right === '<any>') {
      continue;
    }

    if (left === '<number>' && isSingleNumber.test(right)) {
      continue;
    }
    if (right === '<number>' && isSingleNumber.test(left)) {
      continue;
    }

    if (left === '<alpha>' && isSingleAlpha.test(right)) {
      continue;
    }
    if (right === '<alpha>' && isSingleAlpha.test(left)) {
      continue;
    }

    if (left === '<character>' && !containsControlKey(right)) {
      continue;
    }
    if (right === '<character>' && !containsControlKey(left)) {
      continue;
    }

    if (left === '<leader>' && right === configuration.leader) {
      continue;
    }
    if (right === '<leader>' && left === configuration.leader) {
      continue;
    }

    if (left === configuration.leader) {
      return false;
    }
    if (right === configuration.leader) {
      return false;
    }

    if (left !== right) {
      return false;
    }
  }

  return true;
};

export class BaseAction {
  /**
   * Can this action be paired with an operator (is it like w in dw)? All
   * BaseMovements can be, and some more sophisticated commands also can be.
   */
  public isMotion = false;

  public canBeRepeatedWithDot = false;

  /**
   * Modes that this action can be run in.
   */
  public modes: ModeName[];

  /**
   * The sequence of keys you use to trigger the action, or a list of such sequences.
   */
  public keys: string[] | string[][];

  public mustBeFirstKey = false;

  public isOperator = false;

  /**
   * The keys pressed at the time that this action was triggered.
   */
  public keysPressed: string[] = [];

  /**
   * Is this action valid in the current Vim state?
   */
  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (this.modes.indexOf(vimState.currentMode) === -1) {
      return false;
    }

    if (!compareKeypressSequence(this.keys, keysPressed)) {
      return false;
    }

    if (
      this.mustBeFirstKey &&
      vimState.recordedState.commandWithoutCountPrefix.length - keysPressed.length > 0
    ) {
      return false;
    }

    return true;
  }

  /**
   * Could the user be in the process of doing this action.
   */
  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (this.modes.indexOf(vimState.currentMode) === -1) {
      return false;
    }

    const keys2D = is2DArray(this.keys) ? this.keys : [this.keys];
    const keysSlice = keys2D.map(x => x.slice(0, keysPressed.length));
    if (!compareKeypressSequence(keysSlice, keysPressed)) {
      return false;
    }

    if (
      this.mustBeFirstKey &&
      vimState.recordedState.commandWithoutCountPrefix.length - keysPressed.length > 0
    ) {
      return false;
    }

    return true;
  }

  public toString(): string {
    return this.keys.join('');
  }
}

export enum KeypressState {
  WaitingOnKeys,
  NoPossibleMatch,
}

export class Actions {
  /**
   * Every Vim action will be added here with the @RegisterAction decorator.
   */
  public static allActions: { type: typeof BaseAction; action: BaseAction }[] = [];

  public static actionMap = new Map<ModeName, { type: typeof BaseAction; action: BaseAction }[]>();
  /**
   * Gets the action that should be triggered given a key
   * sequence.
   *
   * If there is a definitive action that matched, returns that action.
   *
   * If an action could potentially match if more keys were to be pressed, returns true. (e.g.
   * you pressed "g" and are about to press "g" action to make the full action "gg".)
   *
   * If no action could ever match, returns false.
   */
  public static getRelevantAction(
    keysPressed: string[],
    vimState: VimState
  ): BaseAction | KeypressState {
    let isPotentialMatch = false;

    var possibleActionsForMode = Actions.actionMap.get(vimState.currentMode) || [];
    for (const possibleAction of possibleActionsForMode) {
      const { type, action } = possibleAction!;

      if (action.doesActionApply(vimState, keysPressed)) {
        const result = new type();
        result.keysPressed = vimState.recordedState.actionKeys.slice(0);
        return result;
      }

      if (action.couldActionApply(vimState, keysPressed)) {
        isPotentialMatch = true;
      }
    }

    return isPotentialMatch ? KeypressState.WaitingOnKeys : KeypressState.NoPossibleMatch;
  }
}

export function RegisterAction(action: typeof BaseAction): void {
  const actionInstance = new action();
  for (const modeName of actionInstance.modes) {
    var actions = Actions.actionMap.get(modeName);
    if (!actions) {
      actions = [];
      Actions.actionMap.set(modeName, actions);
    }

    if (actionInstance.keys === undefined) {
      // action that can't be called directly
      continue;
    }

    actions.push({ type: action, action: actionInstance });
  }
}
