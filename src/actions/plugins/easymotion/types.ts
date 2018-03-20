export type LabelPosition = 'after' | 'before';
export type jumptoanywhere = true | false;

export interface EasyMotionMoveOptionsBase {
  searchOptions?: 'min' | 'max';
}

export interface EasyMotionCharMoveOpions extends EasyMotionMoveOptionsBase {
  charCount: number;
  labelPosition?: LabelPosition;
}

export interface EasyMotionWordMoveOpions extends EasyMotionMoveOptionsBase {
  labelPosition?: LabelPosition;
  jumptoanywhere?: jumptoanywhere;
}
