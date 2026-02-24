/**
 * Digital Life Log Planner — Data Schema v2 (Final)
 * ADHD 실행 지연 분석을 위한 정식 스키마
 */

// ===== 기본 타입 =====
export type ActivityId = string;
export type BlockId = string;
export type WeekKey = string;

export type Layer = "plan" | "execute" | "overlay";

export type BlockSource =
  | "drag"
  | "select"
  | "manual"
  | "week_plan"
  | "fixed_schedule"
  | "template_apply"
  | "import"
  | "voice";

export type PaintStyle =
  | "solid"
  | "diagonal"
  | "cross"
  | "line"
  | "extension";

export type ResistanceLevel = "low" | "medium" | "high" | "uncertain";
export type EnergyLevel = "low" | "medium" | "high";
export type ScoreRating = 1 | 2 | 3 | 4 | 5;

// ===== Sleep / Mood (Daily) =====
export type MoodRating = 1 | 2 | 3 | 4 | 5;

export interface SleepLog {
  dateISO: string; // wake-up day
  sleepStartMin: number; // minutes since 00:00 of dateISO (may be < wakeMin; same-day simplified)
  wakeMin: number;
  updatedAt: number;
}

export interface DayMoodLog {
  dateISO: string;
  mood: MoodRating;
  updatedAt: number;
}

// 1~5 rating for a contiguous executed segment (same activity + contiguity)
export interface SegmentMoodLog {
  dateISO: string;
  layer: "execute" | "overlay";
  activityId: ActivityId;
  startMin: number;
  endMin: number;
  mood: MoodRating;
  updatedAt: number;
}

// ===== Tool 타입 =====
// UI Interaction Modes (Definitive spec)
// Tool (Mode) — Definitive spec + legacy aliases kept for compatibility during transition
export type Tool =
  | "PAINT"
  | "NEW_EVENT"
  | "SELECT"
  | "INDICATOR"
  | "ERASE"
  // legacy aliases (will be removed):
  | "execute"
  | "plan"
  | "new"
  | "select"
  | "indicator"
  | "erase"
  | "memo";

export type ViewMode = "DAY" | "WEEK";

// ===== Activity =====
export interface Activity {
  id: ActivityId;
  name: string;
  color: string;
  isSystem?: boolean;
}

// ===== Block v2 (Source of Truth) =====
export type PlanResistance = "low" | "medium" | "high" | "uncertain";

export interface BlockPlanRef {
  planBlockId: BlockId;
  matchRule: "timeOverlap" | "autoNearest" | "userPinned";
  matchScore?: number;
}

export interface BlockExtension {
  baseEndMin?: number;
  extendedByMin: number;
}

export interface Block {
  id: BlockId;
  dateISO: string;
  startMin: number;
  endMin: number;
  activityId: ActivityId;

  // Optional title/label for NEW_EVENT drafts (UI only)
  title?: string;

  layer: Layer;
  source: BlockSource;
  paintStyle?: PaintStyle;

  planRef?: BlockPlanRef;
  resistance?: PlanResistance;
  extension?: BlockExtension;
  score?: ScoreRating; // 1~5점 만족도/품질 점수

  createdAt: number;
  updatedAt: number;
}

// ===== Week Plan =====
export interface WeekPlan {
  weekKey: WeekKey;
  blocks: Block[];
}

// ===== Fixed Schedule =====
export interface FixedScheduleBlock {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMin: number;
  endMin: number;
  activityId: ActivityId;
  paintStyle?: PaintStyle;
  resistance?: PlanResistance;
}

export interface FixedSchedule {
  id: string;
  name: string;
  blocks: FixedScheduleBlock[];
  createdAt: number;
  updatedAt: number;
}

// ===== Template Apply =====
export interface TemplateApply {
  id: string;
  dateISO: string;
  templateId: string;
  appliedAt: number;
  mode: "previewGhost" | "commitPlan";
}

// ===== Daily State =====
export interface DailyState {
  dateISO: string;
  energyLevel?: EnergyLevel;
  note?: string;
  recordedAt: number;
}

// ===== Completion Event =====
export interface CompletionEvent {
  id: string;
  dateISO: string;
  blockId: BlockId;
  atMin: number;

  perceivedDone: boolean;
  extraMinRequested?: number;

  energyLevel?: EnergyLevel;
  shortNote?: string;

  createdAt: number;
}

// ===== Indicator =====
export interface IndicatorEvent {
  id: string;
  dateISO: string;
  atMin: number;
  label: string;
  timeText?: string;
  createdAt: number;
}

// ===== Checklist =====
export interface ChecklistItem {
  id: string;
  text: string;
  time?: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChecklistBlock {
  id: string;
  dateISO: string;
  startMin: number;
  endMin: number;
  layer: Layer;
  activityId?: ActivityId;
  items: { id: string; text: string; done: boolean }[];
  createdAt: number;
  updatedAt: number;
}

export type MemoBlock = {
  id: string;
  /** Legacy: older builds stored per-cell memos. New builds ignore this. */
  cellId?: string;
  dateISO: string;
  layer: "execute" | "overlay";
  /** Hour anchor for the memo column. One memo per (dateISO, layer, hour). */
  hour: number;
  /** Optional: which activity this memo is for (hour may contain multiple activities). */
  activityId?: ActivityId;
  /** Legacy: older builds stored per-activity memos. New builds ignore this. */
  text: string;
  updatedAt: number;
};

// ===== Memo =====
export interface MemoItem {
  id: string;
  dateISO: string;
  content: string;
  pinnedToBlockId?: BlockId;
  pinnedToMin?: number;
  createdAt: number;
  updatedAt?: number;
}

export type MemosByCell = Record<string, MemoItem[]>;

// ===== Voice Planning =====
export type VoiceParseField = "start" | "end" | "activity" | "date";

export interface VoiceParseCandidate {
  startMin?: number;
  endMin?: number;
  activityName?: string;
  dateISO?: string;
  confidence?: number;
}

export interface VoiceCommandLog {
  id: string;
  createdAt: number;

  transcript: string;
  asrConfidence?: number;

  parse: {
    candidate: VoiceParseCandidate;
    missingFields: VoiceParseField[];
    warnings?: string[];
  };

  confirmation: {
    status: "confirmed" | "edited" | "canceled";
    final: {
      dateISO: string;
      startMin: number;
      endMin: number;
      activityName: string;
    };
  };

  createdPlanBlockId?: BlockId;
}

// ===== Plan-Execute Pair (분석용 파생 데이터) =====
export interface PlanExecutionPair {
  id: string;
  dateISO: string;

  planBlockId: BlockId;
  execBlockId?: BlockId;

  planStartMin: number;
  execStartMin?: number;

  startDelayMin?: number;

  plannedMin: number;
  executedMin: number;
  completionRatio: number;

  planResistanceLevel?: ResistanceLevel;
  dailyEnergyLevel?: EnergyLevel;
  energyAtCompletion?: EnergyLevel;

  extensionMin?: number;

  displacedByActivityId?: ActivityId;
  displacedMin?: number;

  match: {
    rule: "autoNearest" | "timeOverlap" | "userPinned";
    score: number;
  };
}

// ===== Persisted State v2 =====
export interface PersistedStateV2 {
  version: 2;
  activities: Activity[];
  blocksByDate: Record<string, Block[]>;
  weekPlans: Record<string, WeekPlan>;
  fixedSchedule: FixedScheduleBlock[];
  fixedSchedules?: FixedScheduleBlock[]; // alternate key used by storage

  // Extended stores
  templateAppliesByDate?: Record<string, TemplateApply[]>;
  dailyStateByDate?: Record<string, DailyState>;
  completionEventsByDate?: Record<string, CompletionEvent[]>;
  indicatorsByDate?: Record<string, IndicatorEvent[]>;
  checklistByDate?: Record<string, ChecklistItem[]>;
  checklistBlocksByDate?: Record<string, ChecklistBlock[]>;
  memosByDate?: Record<string, MemoItem[]>;
  voiceCommandLogsByDate?: Record<string, VoiceCommandLog[]>;

  memos?: MemoItem[];
  completionEvents?: CompletionEvent[];

  startHour?: number;
  theme?: "light" | "dark";
  schemaVersion?: number;
}

// ===== Segment (렌더링용) =====
export interface Segment {
  row: number;
  startCol: number;
  endCol: number;
  activityId: ActivityId;
  layer: Layer;
  blockId?: BlockId;
}

// ===== Legacy Cell (입력/렌더 위치용, 하위 호환) =====
export interface CellData {
  execute?: ActivityId;
  overlay?: ActivityId;
  indicator?: { label: string; timeText: string };
  memos?: MemoItem[];
}

export type DayGrid = Record<string, CellData>;

export interface WeekCellData {
  // Primary planned activity (legacy: activityId)
  activityId?: ActivityId;
  // Secondary overlapped plan (중첩 계획)
  overlayActivityId?: ActivityId;
}

export type WeekGrid = Record<string, WeekCellData>;
