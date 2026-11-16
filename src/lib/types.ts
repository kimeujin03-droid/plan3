export type Kind = 'plan' | 'exec';
export type Source = 'paint' | 'timer' | 'chat';

export interface Activity {
  id: string;
  name: string;
  color: string;
}

/** 실제 시각(ms)으로 저장하는 구간. end가 null이면 지금도 진행 중. */
export interface Interval {
  id: string;
  activityId: string;
  kind: Kind;
  start: number;
  end: number | null;
  source: Source;
}

export interface Sample {
  at: number;
  kind: 'focus' | 'fatigue';
  value: number;
  activityId: string | null;
}

/** 사용자가 한 말 원문. 지우지 않고 계속 쌓는다. */
export interface RawEntry {
  id: string;
  at: number;
  text: string;
  action: string;
  reply: string;
}

export interface Intent {
  id: string;
  label: string;
  activityId: string | null;
  mentions: number[];
}

export interface Note {
  id: string;
  at: number;
  kind: 'mood' | 'memo';
  text: string;
}

export interface PlanItem {
  activityId: string;
  minutes: number;
}

export interface PlanVersion {
  day: number;
  version: number;
  at: number;
  items: PlanItem[];
}

export interface Data {
  activities: Activity[];
  intervals: Interval[];
  samples: Sample[];
  raw: RawEntry[];
  intents: Intent[];
  notes: Note[];
  planVersions: PlanVersion[];
  sleeping: boolean;
  nudge: boolean;
  /** 못 알아들은 말을 AI 서버에 보내도 된다고 사용자가 켠 경우에만 true */
  ai: boolean;
  /** 직접 운영하는 서버 주소. 비어 있으면 빌드에 들어간 기본 주소를 쓴다. */
  apiOverride: string;
}

export type PaintMode = 'plan' | 'exec' | 'erase';
