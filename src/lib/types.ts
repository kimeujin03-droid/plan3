export type Kind = 'plan' | 'exec';
export type Source = 'paint' | 'timer' | 'chat';

export interface Activity {
  id: string;
  name: string;
  color: string;
  /** 있으면 그 대주제 아래의 하위 활동. 한 단계만 둔다. */
  parentId?: string;
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

export interface Todo {
  id: string;
  text: string;
  /** 기한인 날의 0시. 기한이 없으면 null. */
  due: number | null;
  done: boolean;
  doneAt: number | null;
  createdAt: number;
  /**
   * 계획의 종류. 없으면 'due'.
   * due: 마감일까지 / range: 그날 몇 시부터 몇 시까지 / hours: 매일 몇 시간쯤
   */
  type?: 'due' | 'range' | 'hours';
  /** range: 시작·끝 시각(ms) */
  start?: number;
  end?: number;
  /** hours: 하루 목표(분) */
  minutes?: number;
  /** 마감 시각까지 정했으면 그 시각(ms). 없으면 그날 하루 안. */
  dueAt?: number;
  /** 얼마나 했는지 0~10 (10칸) */
  progress?: number;
  /** range·hours: 어느 활동인지 */
  activityId?: string;
}

/** 타이머·뽀모도로 진행 상태. 스톱워치는 이 값 없이 그냥 기록만 돈다. */
export interface TimerState {
  mode: 'timer' | 'pomo';
  activityId: string;
  /** 집중 한 번의 길이(분) */
  minutes: number;
  /** 뽀모도로 쉬는 시간(분) */
  breakMinutes: number;
  /** focus: 세는 중 / over: 시간이 다 됐지만 계속하는 중 / break: 쉬는 중 / ready: 다음 집중을 기다리는 중 */
  phase: 'focus' | 'over' | 'break' | 'ready';
  phaseStart: number;
  round: number;
}

/** 격자 칸에 붙이는 짧은 메모. at은 그 10분 칸의 시작 시각. */
export interface CellNote {
  at: number;
  text: string;
}

export interface Note {
  id: string;
  at: number;
  kind: 'mood' | 'memo';
  text: string;
  /** 기분 1(힘들어)~5(최고). 말로만 남긴 기분은 없다. */
  value?: number;
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
  notes: Note[];
  planVersions: PlanVersion[];
  todos: Todo[];
  cellNotes: CellNote[];
  timer: TimerState | null;
  sleeping: boolean;
  nudge: boolean;
  /** 계획 알림(1시간 전·10분 전·마감 전) */
  planAlerts: boolean;
  /** 못 알아들은 말을 AI 서버에 보내도 된다고 사용자가 켠 경우에만 true */
  ai: boolean;
  /** 직접 운영하는 서버 주소. 비어 있으면 빌드에 들어간 기본 주소를 쓴다. */
  apiOverride: string;
}

export type PaintMode = 'plan' | 'exec' | 'erase';
/** 종류별 지우개: 계획만, 한 일만 */
export type EraseMode = 'erasePlan' | 'eraseExec';
