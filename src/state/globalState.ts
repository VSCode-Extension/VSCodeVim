import { JumpTracker } from '../jumps/jumpTracker';
import { RecordedState } from './../state/recordedState';
import { SearchState } from './searchState';
import { SubstituteState } from './substituteState';

/**
 * State which stores global state (across editors)
 */
class GlobalState {
  /**
   * Track jumps, and traverse jump history
   */
  public readonly jumpTracker: JumpTracker = new JumpTracker();

  /**
   * The keystroke sequence that made up our last complete action (that can be
   * repeated with '.').
   */
  public previousFullAction: RecordedState | undefined = undefined;

  public lastInvokedMacro: RecordedState | undefined = undefined;

  /**
   * Last substitute state for running :s by itself
   */
  public substituteState: SubstituteState | undefined = undefined;

  /**
   * The most recently active SearchState
   * This is used for things like `n` and `hlsearch`
   */
  public searchState: SearchState | undefined = undefined;

  /**
   * Used internally for nohl.
   */
  public hl = true;

  /**
   * List of killed text sequences.
   */
  public killRing: string[] = [];
}

export const globalState = new GlobalState();
