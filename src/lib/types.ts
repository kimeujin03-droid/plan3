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
  /** 이 말이 기록에 남긴 것(고칠 때 정확히 걷어 내려고) */
  fx?: import('./effects').Effects;
  /** 이 말은 앞의 어떤 말을 고친 것인지 */
  fixOf?: string;
  /** 이 말을 나중에 고친 말 */
  fixedBy?: string;
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
  /** (예전 10칸 값 0~10. 읽을 때만 쓴다) */
  progress?: number;
  /** 진행률 0~100. 없으면 이 할 일은 진행률을 쓰지 않는다(체크만). */
  percent?: number;
  /** 진행률을 바꾼 기록 */
  progressLog?: { at: number; from: number; to: number }[];
  /** 장소: 학교, 마트, 다이소… */
  place?: string;
  /** range·hours: 어느 활동인지 */
  activityId?: string;
  /** 반복 일정에서 생긴 것이면 그 반복의 id */
  seriesId?: string;
  /** 잘게 쪼갠 단계. 있으면 진행도는 단계에서 계산한다. */
  steps?: Step[];
  /** 바깥에서 들어온 일정의 표지(캘린더 UID+시각). 같은 것을 두 번 넣지 않는 데 쓴다. */
  ext?: string;
}

/**
 * 구간에 붙인 기억: 시간 구간과 내용을 따로 둔다.
 * 사진·감정을 나중에 바꿔도 시각은 그대로고, 그 사이 다른 활동이 생겨도 이 기록은 지워지지 않는다.
 */
export interface Memory {
  id: string;
  start: number;
  end: number;
  /** 어떤 활동이었는지(없어도 된다) */
  activityId: string | null;
  text: string;
  place?: string;
  people?: string;
  /** 기분 1~5 */
  mood?: number;
  /** 사진: 앱 안 파일 경로(photos/…) 또는 웹에서는 작은 data URL */
  photos: string[];
  /** 이 기억이 이룬 계획 */
  todoId?: string;
  /** 이 한마디가 붙은 기록(계획·한 일 칠). 기록 시각을 고치면 같이 옮겨진다 */
  intervalId?: string;
  createdAt: number;
}

export interface Step {
  text: string;
  done: boolean;
}

/** 반복 일정: "매주 화 9~12시 수업". 앞으로 2주치를 계획으로 만들어 둔다. */
export interface Series {
  id: string;
  text: string;
  activityId: string | null;
  /** 요일 0(일)~6(토) */
  days: number[];
  /** 하루 안의 분 */
  startMin: number;
  endMin: number | null;
  place?: string;
  /** 사용자가 지운 날(그날 0시): 다시 만들지 않는다 */
  skip: number[];
  createdAt: number;
  /** 이 기간에만 반복한다(그날 0시, 양 끝 포함). 학기 시간표처럼 */
  from?: number;
  until?: number;
  /** 바깥 캘린더에서 들어온 반복의 표지(UID). 같은 것을 두 번 넣지 않는다 */
  ext?: string;
}

/** 시험 기간 같은 날짜 구간. 달력에 띠로 보이고, 고르면 그동안 매주 고정 일정을 쉰다 */
export interface Period {
  id: string;
  name: string;
  /** 첫날·마지막 날(그날 0시, 양 끝 포함) */
  start: number;
  end: number;
  /** 이 기간엔 매주 고정 일정(수업 등)을 만들지 않는다 */
  pause: boolean;
}

/** 이 일은 이 시간대에 집중이 잘 된다(한 주 짜기가 먼저 이 시간대를 쓴다) */
export interface Focus {
  id: string;
  /** 할 일·활동 이름에 들어 있으면 해당(예: "공부", "미적분") */
  word: string;
  /** 시(0~26). 26은 새벽 2시 */
  from: number;
  to: number;
}

/** 모아 꾸미기: 앱과 위젯이 같이 쓴다 */
export interface Look {
  accessory: 'none' | 'ribbon' | 'hat' | 'headphones' | 'glasses' | 'flower';
  board: 'none' | 'sign' | 'skate';
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
  series: Series[];
  focus: Focus[];
  periods: Period[];
  memories: Memory[];
  look: Look;
  timer: TimerState | null;
  sleeping: boolean;
  nudge: boolean;
  /** 계획 알림(1시간 전·10분 전·마감 전) */
  planAlerts: boolean;
  /** 아침 한 줄(오늘 계획), 밤 한 줄(빈 시간 채우기) */
  dailyBrief: boolean;
  /** 진행률 +/− 한 번에 몇 %p */
  progressStep: 1 | 5 | 10;
  /** 100%가 되면 바로 끝낼지(false면 체크를 기다린다) */
  autoComplete: boolean;
  /** 못 알아들은 말을 AI 서버에 보내도 된다고 사용자가 켠 경우에만 true */
  ai: boolean;
  /** 직접 운영하는 서버 주소. 비어 있으면 빌드에 들어간 기본 주소를 쓴다. */
  apiOverride: string;
}

export type PaintMode = 'plan' | 'exec' | 'erase';
/** 종류별 지우개: 계획만, 한 일만 */
export type EraseMode = 'erasePlan' | 'eraseExec';
