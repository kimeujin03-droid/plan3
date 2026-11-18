import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { aiParse, DEFAULT_API } from './lib/ai';
import { uid } from './lib/id';
import { activeIntervals, mergeAdd, paintCell, subtract } from './lib/intervals';
import { rescheduleNudge, scheduleTimerAlert } from './lib/notify';
import { moaStorage } from './lib/storage';
import { childColor, DEFAULT_ACTIVITIES, EXTRA_COLORS, SLEEP_ID } from './lib/palette';
import { mentionsTime, parse, type Command } from './lib/parser';

/** 진행률(0~100). 예전 10칸 값도 읽는다. 진행률을 쓰지 않는 할 일이면 undefined. */
export function percentOf(t: Todo): number | undefined {
  if (t.percent !== undefined) return t.percent;
  if (t.progress !== undefined) return t.progress * 10;
  return undefined;
}

export interface RangeRecord {
  start: number;
  end: number;
  activityId: string | null;
  /** 이 구간을 '한 일'로 칠할지 */
  asActivity: boolean;
  text: string;
  place?: string;
  people?: string;
  mood?: number;
  photos: string[];
  todoId?: string;
  completeTodo?: boolean;
}

/** 단계를 바꾸면 진행률과 끝남도 단계에서 다시 계산한다. */
function withSteps(t: Todo, steps: Todo['steps'] & object): Todo {
  if (!steps.length) {
    const { steps: _drop, ...rest } = t;
    return rest;
  }
  const done = steps.filter((s) => s.done).length;
  return { ...t, steps, percent: Math.round((done / steps.length) * 100), done: done === steps.length };
}

/** 두 해석이 사실상 같은지(이름 끝의 띄어쓰기 같은 사소한 차이는 무시) */
function sameCommands(a: Command[], b: Command[]): boolean {
  const key = (cs: Command[]) => JSON.stringify(cs.map((c) => ({ ...c, ...('text' in c ? { text: c.text.replace(/\s+/g, '') } : {}) })));
  return key(a) === key(b);
}

/**
 * 규칙이 알아들은 결과가 미심쩍은지. 미심쩍을 때만 AI에 묻는다(빠르게 하려고).
 * 이름에 말끝이 남았거나("해볼까"), 모르는 활동 이름이 나왔을 때.
 */
function needsAi(cmds: Command[], text: string): boolean {
  return cmds.some((c) => {
    if (c.type === 'memo') return true;
    if (c.type === 'todo') return /(어|야|여|지|까|네|요|음|다|게|래|고|데|나|자|듯)$/.test(c.text) || c.text.length > 16;
    if (c.type === 'backfill') return c.activityId === null;
    if (c.type === 'start') return c.activityId === null && (mentionsTime(text) || c.name.length > 8);
    return false;
  });
}
import { recordPlanEdit } from './lib/plans';
import { CELL, dayStart, fmtDue, fmtDur, fmtHM } from './lib/time';
import { logicalToday } from './lib/day';
import { describeSeries, materializeSeries } from './lib/series';
import type { Activity, Data, EraseMode, Focus, Look, Memory, PaintMode, Series, TimerState, Todo } from './lib/types';
import { LIFE_ACTIVITIES, LIFE_ID } from './lib/palette';

/** 한 번에 넣을 계획 하나 */
export interface PlanItem {
  text: string;
  due: number | null;
  extra?: Pick<Todo, 'type' | 'start' | 'end' | 'activityId' | 'place' | 'ext'>;
}

export interface Reply {
  text: string;
  at: number;
  /** 되돌리기 버튼을 같이 보여줄지 */
  undo?: boolean;
}

interface Store extends Data {
  undoData: Data | null;
  lastReply: Reply | null;
  /** AI 대답을 기다리는 중 */
  thinking: boolean;
  say: (text: string) => void;
  undo: () => void;
  beginStroke: () => void;
  paint: (cellStart: number, mode: PaintMode, activityId: string) => void;
  startActivity: (activityId: string) => void;
  endActivity: (activityId: string) => void;
  /** 끄는 걸 잊은 타이머를 지난 시각으로 끝낸다. */
  endActivityAt: (activityId: string, at: number) => void;
  /** 비어 있던 시간을 한 번에 채운다. */
  fillGap: (activityId: string, start: number, end: number) => void;
  dismissReply: () => void;
  /** 방금 무언가를 끝낸 시각. 모아가 잠깐 신나 한다. 저장하지 않는다. */
  cheerAt: number;
  addTodo: (text: string, due: number | null, extra?: Pick<Todo, 'type' | 'start' | 'end' | 'minutes' | 'activityId' | 'dueAt' | 'place'>) => void;
  /** 여러 계획을 한 번에 넣는다(한 주 짜기, 캘린더 불러오기). 한 번에 되돌릴 수 있다. */
  addPlans: (items: PlanItem[], reply: string) => void;
  /** 한 주 짜기 확정: 계획 + 고정 일정(기간 있는 반복) + 집중 시간을 한 번에. 한 번에 되돌린다. {n}은 넣은 개수 */
  applyWeek: (input: { plans: PlanItem[]; series?: Omit<Series, 'id' | 'skip' | 'createdAt'>[]; focus?: Omit<Focus, 'id'>[] }, reply: string) => void;
  removeFocus: (id: string) => void;
  /** 타이머(mode 'timer')나 뽀모도로를 시작한다. 활동도 같이 시작된다. */
  startTimer: (mode: TimerState['mode'], activityId: string, minutes: number) => void;
  /** 타이머 표시만 끈다. 돌고 있는 기록은 건드리지 않는다. */
  stopTimer: () => void;
  /** 뽀모도로의 다음 집중을 시작한다. */
  nextPomo: () => void;
  /** 매초 불린다. 시간이 다 되면 단계를 넘긴다. */
  tickTimer: (now: number) => void;
  /** 그 칸들의 메모를 지운다. */
  eraseNotes: (cellStart: number, cells: number) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  /** 기록 하나를 통째로 지운다. 되돌릴 수 있다. */
  removeInterval: (id: string) => void;
  /** 칸 메모를 쓰거나(빈 글이면) 지운다. */
  setCellNote: (at: number, text: string) => void;
  /** 이어진 10분 칸 여러 개를 한 번에 칠한다. 주간 보기에서 한 시간씩 칠할 때 쓴다. */
  paintRange: (cellStart: number, cells: number, mode: PaintMode | EraseMode, activityId: string) => void;
  rateFocus: (value: number) => void;
  addActivity: (name: string, parentId?: string) => void;
  /** 기록에 쓰인 적 없고 하위 활동도 없을 때만 지운다. 지웠으면 true. */
  removeActivity: (id: string) => boolean;
  renameActivity: (id: string, name: string) => void;
  setNudge: (on: boolean) => void;
  setPlanAlerts: (on: boolean) => void;
  setDailyBrief: (on: boolean) => void;
  setLook: (look: Partial<Look>) => void;
  /** 위젯에서 누른 시작·끝을 누른 시각 그대로 옮긴다. */
  applyWidgetActions: (actions: { op: 'start' | 'end'; id: string; at: number }[]) => void;
  /** 반복 일정을 만들고 앞으로 2주치를 바로 채운다. */
  addSeries: (s: Omit<Series, 'id' | 'skip' | 'createdAt'>) => void;
  /** 반복을 지운다: 앞으로의 안 한 일정과 그 계획 칠도 같이 지운다. */
  removeSeries: (id: string) => void;
  /** 하루가 바뀌면 반복 일정의 새 날을 채운다. */
  ensureSeries: () => void;
  /** 할 일에 활동을 이어 둔다(다음에 바로 시작할 수 있게). */
  linkTodo: (id: string, activityId: string) => void;
  setSteps: (id: string, steps: string[]) => void;
  toggleStep: (id: string, index: number) => void;
  addStep: (id: string, text: string) => void;
  removeStep: (id: string, index: number) => void;
  /** 진행률을 +/− 한 칸(설정의 %p) 바꾼다. 바꾼 시각과 전후 값을 남긴다. */
  stepProgress: (id: string, dir: 1 | -1) => void;
  /** 이 할 일에 진행률을 쓸지 */
  trackProgress: (id: string, on: boolean) => void;
  setProgressStep: (step: 1 | 5 | 10) => void;
  setAutoComplete: (on: boolean) => void;
  /**
   * 고른 구간을 기록한다. 활동으로 칠할지와 기억(글·장소·사람·감정·사진)을 같이 받는다.
   * 그 구간에 이미 있는 다른 활동은 지우지 않고 겹쳐 둔다.
   */
  recordRange: (r: RangeRecord) => void;
  updateMemory: (id: string, patch: Partial<Omit<Memory, 'id'>>) => void;
  removeMemory: (id: string) => void;
  /** '일상'(데이트·친구·휴식·카페·기타)이 없으면 넣는다 */
  ensureLife: () => void;
  /** 기분을 1~5로 남긴다. */
  addMood: (value: number) => void;
  setAi: (on: boolean) => void;
  setApiOverride: (url: string) => void;
  importData: (json: string) => boolean;
  wipe: () => void;
}

/** 기분 1~5의 이름 */
export const MOOD_WORDS = ['', '힘들어', '그저 그래', '보통', '좋아', '최고'];

export const emptyData = (): Data => ({
  activities: DEFAULT_ACTIVITIES,
  intervals: [],
  samples: [],
  raw: [],
  notes: [],
  planVersions: [],
  todos: [],
  cellNotes: [],
  series: [],
  focus: [],
  memories: [],
  look: { accessory: 'none', board: 'sign' },
  timer: null,
  sleeping: false,
  nudge: false,
  planAlerts: true,
  dailyBrief: true,
  progressStep: 10,
  autoComplete: true,
  ai: false,
  apiOverride: '',
});

export function pickData(s: Data): Data {
  return {
    activities: s.activities,
    intervals: s.intervals,
    samples: s.samples,
    raw: s.raw,
    notes: s.notes,
    planVersions: s.planVersions,
    todos: s.todos,
    cellNotes: s.cellNotes,
    series: s.series,
    focus: s.focus,
    memories: s.memories,
    look: s.look,
    timer: s.timer,
    sleeping: s.sleeping,
    nudge: s.nudge,
    planAlerts: s.planAlerts,
    dailyBrief: s.dailyBrief,
    progressStep: s.progressStep,
    autoComplete: s.autoComplete,
    ai: s.ai,
    apiOverride: s.apiOverride,
  };
}

function ensureActivity(d: Data, name: string, id: string | null, parentId?: string): Activity {
  const found = id ? d.activities.find((a) => a.id === id) : d.activities.find((a) => a.name === name);
  if (found) return found;
  const parent = parentId ? d.activities.find((a) => a.id === parentId && !a.parentId) : undefined;
  const siblings = parent ? d.activities.filter((a) => a.parentId === parent.id).length : 0;
  const custom = d.activities.filter((a) => !a.parentId).length - DEFAULT_ACTIVITIES.length;
  const act: Activity = {
    id: uid('act'),
    name,
    // 하위 활동은 대주제 색의 진하고 연한 변주를 받는다.
    color: parent
      ? childColor(parent.color, siblings)
      : EXTRA_COLORS[((custom % EXTRA_COLORS.length) + EXTRA_COLORS.length) % EXTRA_COLORS.length],
    ...(parent ? { parentId: parent.id } : {}),
  };
  d.activities = [...d.activities, act];
  return act;
}

const nameOf = (d: Data, id: string) => d.activities.find((a) => a.id === id)?.name ?? '활동';

function closeInterval(d: Data, ivId: string, now: number) {
  d.intervals = d.intervals.map((iv) => (iv.id === ivId ? { ...iv, end: Math.max(now, iv.start) } : iv));
}

/** 명령 하나를 데이터에 반영하고 모아의 대답을 돌려준다. d는 복사본이라 직접 고쳐도 된다. */
export function applyCommand(d: Data, cmd: Command, now: number): string {
  switch (cmd.type) {
    case 'start': {
      const act = ensureActivity(d, cmd.name, cmd.activityId);
      let active = activeIntervals(d.intervals);
      const sleep = active.find((iv) => iv.activityId === SLEEP_ID);
      if (sleep && act.id !== SLEEP_ID) {
        closeInterval(d, sleep.id, now);
        d.sleeping = false;
        active = active.filter((iv) => iv !== sleep);
      }
      if (active.some((iv) => iv.activityId === act.id)) return `이미 ${act.name} 하는 중이야.`;
      if (active.length >= 2) return '지금 두 가지를 같이 하는 중이야. 하나가 끝나면 말해줘.';
      d.intervals = [
        ...d.intervals,
        { id: uid('iv'), activityId: act.id, kind: 'exec', start: now, end: null, source: 'timer' },
      ];
      return `${act.name} 시작! ${fmtHM(now)}부터 적을게.`;
    }
    case 'end': {
      const active = activeIntervals(d.intervals);
      const target = cmd.activityId
        ? active.find((iv) => iv.activityId === cmd.activityId)
        : active[active.length - 1];
      if (!target) return '지금 하는 중으로 적힌 게 없어.';
      closeInterval(d, target.id, now);
      if (target.activityId === SLEEP_ID) d.sleeping = false;
      return `${nameOf(d, target.activityId)} 끝 · ${fmtDur(now - target.start)}`;
    }
    case 'series': {
      const s: Series = {
        id: uid('series'),
        text: cmd.text.slice(0, 40),
        activityId: cmd.activityId,
        days: cmd.days,
        startMin: cmd.startMin,
        endMin: cmd.endMin,
        skip: [],
        createdAt: now,
        ...(cmd.place ? { place: cmd.place.slice(0, 20) } : {}),
      };
      d.series = [...d.series, s];
      const out = materializeSeries([s], d.todos, d.intervals, logicalToday(now, d.intervals), now, () => uid('todo'));
      d.todos = out.todos;
      d.intervals = out.intervals;
      return `${describeSeries(s)} "${s.text}" 반복으로 넣었어. 2주치 계획에 칠해뒀어.`;
    }
    case 'todo': {
      if (cmd.minutes !== undefined) {
        d.todos = [...d.todos, { id: uid('todo'), text: cmd.text.slice(0, 80), due: null, done: false, doneAt: null, createdAt: now, type: 'hours', minutes: cmd.minutes, ...(cmd.activityId ? { activityId: cmd.activityId } : {}) }];
        return `"${cmd.text}" 매일 목표로 넣었어. 한 만큼 막대가 차.`;
      }
      const todo: Todo = { id: uid('todo'), text: cmd.text.slice(0, 80), due: cmd.due, done: false, doneAt: null, createdAt: now, ...(cmd.place ? { place: cmd.place.slice(0, 20) } : {}) };
      if (cmd.due === null) {
        d.todos = [...d.todos, todo];
        return `"${cmd.text}" 계획에 넣어뒀어.`;
      }
      // 자기 전의 새벽은 아직 전날이므로, "오늘·내일"은 그 하루를 기준으로 말한다.
      const when = fmtDue(cmd.due, logicalToday(now, d.intervals));
      if (cmd.dueAt !== undefined) {
        d.todos = [...d.todos, { ...todo, dueAt: cmd.dueAt }];
        return `"${cmd.text}" ${when} ${fmtHM(cmd.dueAt)}까지로 넣어뒀어.`;
      }
      if (cmd.start === undefined) {
        d.todos = [...d.todos, todo];
        return cmd.deadline ? `"${cmd.text}" ${when}까지로 넣어뒀어.` : `${when} 할 일에 "${cmd.text}" 넣어뒀어.`;
      }
      if (cmd.end === undefined) {
        d.todos = [...d.todos, { ...todo, start: cmd.start }];
        return `${when} ${fmtHM(cmd.start)}에 "${cmd.text}"${cmd.place ? ` @${cmd.place}` : ''} 넣어뒀어.`;
      }
      d.todos = [...d.todos, { ...todo, type: 'range', start: cmd.start, end: cmd.end, ...(cmd.activityId ? { activityId: cmd.activityId } : {}) }];
      if (cmd.activityId) {
        // 활동을 알면 격자에도 계획으로 칠해 둔다.
        d.intervals = subtract(d.intervals, cmd.start, cmd.end, (iv) => iv.kind === 'plan', now);
        d.intervals = mergeAdd(d.intervals, { activityId: cmd.activityId, kind: 'plan', start: cmd.start, end: cmd.end, source: 'chat' });
      }
      return `${when} ${fmtHM(cmd.start)}–${fmtHM(cmd.end)} "${cmd.text}"${cmd.place ? ` @${cmd.place}` : ''} 계획으로 넣었어.`;
    }
    case 'backfill': {
      const act = ensureActivity(d, cmd.name, cmd.activityId);
      d.intervals = mergeAdd(d.intervals, {
        activityId: act.id,
        kind: 'exec',
        start: cmd.start,
        end: cmd.end,
        source: 'chat',
      });
      return `${fmtHM(cmd.start)}–${fmtHM(cmd.end)} ${act.name}(으)로 채워놨어.`;
    }
    case 'sleep': {
      for (const iv of activeIntervals(d.intervals)) closeInterval(d, iv.id, now);
      d.intervals = [
        ...d.intervals,
        { id: uid('iv'), activityId: SLEEP_ID, kind: 'exec', start: now, end: null, source: 'timer' },
      ];
      d.sleeping = true;
      return '잘 자. 일어날 때까지 먼저 말 걸지 않을게.';
    }
    case 'wake': {
      const sleep = activeIntervals(d.intervals).find((iv) => iv.activityId === SLEEP_ID);
      d.sleeping = false;
      if (!sleep) return `${fmtHM(now)}에 일어난 걸로 적어둘게.`;
      closeInterval(d, sleep.id, now);
      return `좋은 아침! ${fmtDur(now - sleep.start)} 잔 걸로 적었어. 시간이 다르면 오늘 칸에서 고쳐줘.`;
    }
    case 'focus':
    case 'fatigue': {
      const active = activeIntervals(d.intervals).filter((iv) => iv.activityId !== SLEEP_ID);
      d.samples = [
        ...d.samples,
        { at: now, kind: cmd.type, value: cmd.value, activityId: active[0]?.activityId ?? null },
      ];
      return cmd.type === 'focus' ? `집중도 ${cmd.value}로 적었어.` : `피로도 ${cmd.value}으로 적었어.`;
    }
    case 'mood': {
      d.notes = [...d.notes, { id: uid('note'), at: now, kind: 'mood', text: cmd.text }];
      return '기분은 돌아보기 › 기분에 모아둘게.';
    }
    case 'quiet': {
      d.nudge = false;
      return '알겠어. 먼저 말 걸지 않을게.';
    }
    case 'memo': {
      d.notes = [...d.notes, { id: uid('note'), at: now, kind: 'memo', text: cmd.text }];
      return '메모로 적어뒀어.';
    }
    case 'chat':
      return cmd.text;
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      undoData: null,
      lastReply: null,
      thinking: false,
      cheerAt: 0,

      say: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const now = Date.now();
        const s0 = get();
        const before = pickData(s0);
        const rawId = uid('raw');
        const today = logicalToday(now, s0.intervals);
        const ruleCmds = parse(trimmed, s0.activities, now, today);
        if (!ruleCmds.length) return;

        // 명령을 반영하고 원문 기록의 결과 칸을 채운다. 시각은 말한 순간(now)을 쓴다.
        const finish = (cmds: Command[], via: 'rule' | 'ai') => {
          const cur = pickData(get());
          const d: Data = { ...cur };
          const reply = cmds.map((c) => applyCommand(d, c, now)).join(' ');
          const action = `${via}:${cmds.map((c) => c.type).join('+')}`;
          d.raw = d.raw.some((r) => r.id === rawId)
            ? d.raw.map((r) => (r.id === rawId ? { ...r, action, reply } : r))
            : [...d.raw, { id: rawId, at: now, text: trimmed, action, reply }];
          set({ ...d, undoData: before, lastReply: { text: reply, at: Date.now(), undo: true }, thinking: false });
          void rescheduleNudge(d.nudge && !d.sleeping);
        };

        const api = s0.apiOverride || DEFAULT_API;
        // 규칙이 깔끔하게 알아들었으면 바로 반영한다. 미심쩍을 때만 AI를 기다린다.
        const notUnderstood = needsAi(ruleCmds, trimmed);
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        const onlyMemo = ruleCmds.every((c) => c.type === 'memo');
        if (notUnderstood && s0.ai && api && online && !onlyMemo) {
          // 규칙이 뭔가 알아들었으면 기다리게 하지 않는다: 먼저 바로 적고, AI가 다르게 읽으면 조용히 고친다.
          finish(ruleCmds, 'rule');
          const applied = get();
          const running = activeIntervals(s0.intervals).map((iv) => nameOf(s0, iv.activityId));
          void aiParse(api, trimmed, s0.activities, running, now, today).then((aiCmds) => {
            if (!aiCmds || sameCommands(aiCmds, ruleCmds)) return;
            const cur = get();
            // 그사이 다른 것을 기록했으면 건드리지 않는다.
            if (cur.intervals !== applied.intervals || cur.todos !== applied.todos || cur.notes !== applied.notes || cur.raw !== applied.raw) return;
            set({ ...before, raw: cur.raw });
            finish(aiCmds, 'ai');
            const fixed = get().lastReply;
            if (fixed) set({ lastReply: { ...fixed, text: `다시 보니 이게 맞겠다: ${fixed.text}` } });
          });
          return;
        }
        if (notUnderstood && s0.ai && api && online) {
          // 원문은 바로 저장하고, 해석만 서버를 기다린다. 서버가 실패하면 메모로 남는다.
          set({
            raw: [...s0.raw, { id: rawId, at: now, text: trimmed, action: 'pending', reply: '' }],
            lastReply: { text: '잠깐만, 알아듣는 중…', at: now },
            undoData: null,
            thinking: true,
          });
          const running = activeIntervals(s0.intervals).map((iv) => nameOf(s0, iv.activityId));
          void aiParse(api, trimmed, s0.activities, running, now, today).then((aiCmds) =>
            aiCmds ? finish(aiCmds, 'ai') : finish(ruleCmds, 'rule'),
          );
          return;
        }
        finish(ruleCmds, 'rule');
      },

      undo: () => {
        const u = get().undoData;
        if (!u) return;
        // 원문은 지우지 않는다: 되돌려도 사용자가 한 말은 남긴다.
        set({ ...u, raw: get().raw, undoData: null, lastReply: { text: '방금 건 되돌렸어.', at: Date.now() } });
      },

      dismissReply: () => set({ lastReply: null }),

      beginStroke: () => set({ undoData: pickData(get()) }),

      paint: (cellStart, mode, activityId) => get().paintRange(cellStart, 1, mode, activityId),

      paintRange: (cellStart, cells, mode, activityId) => {
        const now = Date.now();
        const s = get();
        let intervals = s.intervals;
        let blocked = false;
        for (let i = 0; i < cells; i++) {
          const at = cellStart + i * CELL;
          if (mode === 'exec' && at > now) {
            // 아직 오지 않은 시간에 '했다'를 적으면 통계가 틀어진다. 계획으로만 칠하게 한다.
            blocked = true;
            continue;
          }
          if (mode === 'erasePlan' || mode === 'eraseExec') {
            const kind = mode === 'erasePlan' ? 'plan' : 'exec';
            intervals = subtract(intervals, at, at + CELL, (iv) => iv.kind === kind, now);
          } else intervals = paintCell(intervals, at, activityId, mode, now);
        }
        if (blocked && intervals === s.intervals) {
          const text = '아직 안 온 시간은 계획으로만 칠할 수 있어.';
          if (s.lastReply?.text !== text || now - s.lastReply.at > 4000) set({ lastReply: { text, at: now } });
          return;
        }
        if (intervals === s.intervals) return;
        const planVersions =
          mode === 'exec' || mode === 'eraseExec' ? s.planVersions : recordPlanEdit(s.planVersions, intervals, dayStart(cellStart), now);
        set({ intervals, planVersions });
      },

      addTodo: (text, due, extra) => {
        const t = text.trim().slice(0, 80);
        if (!t) return;
        const now = Date.now();
        const s = get();
        const todo: Todo = { id: uid('todo'), text: t, due, done: false, doneAt: null, createdAt: now, ...extra };
        let intervals = s.intervals;
        // 시간을 정한 계획은 격자에도 계획으로 칠해 둔다.
        if (todo.type === 'range' && todo.activityId && todo.start !== undefined && todo.end !== undefined && todo.end > todo.start) {
          intervals = subtract(intervals, todo.start, todo.end, (iv) => iv.kind === 'plan', now);
          intervals = mergeAdd(intervals, { activityId: todo.activityId, kind: 'plan', start: todo.start, end: todo.end, source: 'paint' });
        }
        set({ todos: [...s.todos, todo], intervals });
      },

      addPlans: (items, reply) => get().applyWeek({ plans: items }, reply),

      removeFocus: (id) => set({ focus: get().focus.filter((f) => f.id !== id) }),

      applyWeek: ({ plans: items, series: newSeries = [], focus: newFocus = [] }, reply) => {
        const now = Date.now();
        const s = get();
        const before = pickData(s);
        let intervals = s.intervals;
        let todos = s.todos;
        const added: Todo[] = [];
        // 고정 일정: 같은 표지(ext)나 같은 이름·요일·시각이 이미 있으면 새로 만들지 않는다. 비어 있는 기간만 채운다(이미 정한 기간은 그대로).
        let series = s.series;
        const made: Series[] = [];
        for (const x of newSeries) {
          const same = series.find((o) => (x.ext && o.ext === x.ext) || (o.text === x.text && o.startMin === x.startMin && o.days.join() === [...x.days].sort().join()));
          if (same) {
            series = series.map((o) => (o === same ? { ...o, from: o.from ?? x.from, until: o.until ?? x.until } : o));
            continue;
          }
          const one: Series = { ...x, days: [...x.days].sort(), id: uid('series'), skip: [], createdAt: now };
          series = [...series, one];
          made.push(one);
        }
        if (made.length) {
          const out = materializeSeries(made, todos, intervals, logicalToday(now, intervals), now, () => uid('todo'));
          todos = out.todos;
          intervals = out.intervals;
        }
        const focus = [...s.focus];
        for (const f of newFocus) {
          const i = focus.findIndex((o) => o.word === f.word);
          if (i >= 0) focus[i] = { ...focus[i], from: f.from, to: f.to };
          else focus.push({ ...f, id: uid('focus') });
        }
        const seen = new Set(todos.map((t) => t.ext).filter(Boolean));
        for (const it of items) {
          const t = it.text.trim().slice(0, 80);
          if (!t) continue;
          if (it.extra?.ext && seen.has(it.extra.ext)) continue;
          const todo: Todo = { id: uid('todo'), text: t, due: it.due, done: false, doneAt: null, createdAt: now, ...it.extra };
          if (todo.ext) seen.add(todo.ext);
          if (todo.type === 'range' && todo.activityId && todo.start !== undefined && todo.end !== undefined && todo.end > todo.start) {
            intervals = subtract(intervals, todo.start, todo.end, (iv) => iv.kind === 'plan', now);
            intervals = mergeAdd(intervals, { activityId: todo.activityId, kind: 'plan', start: todo.start, end: todo.end, source: 'paint' });
          }
          added.push(todo);
        }
        const n = added.length + newSeries.length;
        if (!n && !newFocus.length) {
          set({ lastReply: { text: '새로 넣을 게 없었어.', at: now } });
          return;
        }
        set({ todos: [...todos, ...added], intervals, series, focus, undoData: before, lastReply: { text: reply.replace('{n}', String(n)), at: now, undo: true } });
      },

      startTimer: (mode, activityId, minutes) => {
        const now = Date.now();
        if (!activeIntervals(get().intervals).some((iv) => iv.activityId === activityId)) get().startActivity(activityId);
        const min = Math.max(1, Math.min(180, Math.round(minutes)));
        set({ timer: { mode, activityId, minutes: min, breakMinutes: 5, phase: 'focus', phaseStart: now, round: 1 } });
        void scheduleTimerAlert(now + min * 60_000, mode === 'pomo' ? `${min}분 집중 끝! 5분 쉬자.` : `${min}분 됐어!`);
      },

      stopTimer: () => {
        set({ timer: null });
        void scheduleTimerAlert(null);
      },

      nextPomo: () => {
        const t = get().timer;
        if (!t) return;
        const now = Date.now();
        get().startActivity(t.activityId);
        set({ timer: { ...t, phase: 'focus', phaseStart: now, round: t.round + 1 } });
        void scheduleTimerAlert(now + t.minutes * 60_000, `${t.minutes}분 집중 끝! 5분 쉬자.`);
      },

      tickTimer: (now) => {
        const s = get();
        const t = s.timer;
        if (!t) return;
        const running = activeIntervals(s.intervals).some((iv) => iv.activityId === t.activityId);
        if (t.phase === 'focus' || t.phase === 'over') {
          // 직접 끝냈으면 타이머도 같이 끝난다.
          if (!running) {
            set({ timer: null });
            void scheduleTimerAlert(null);
            return;
          }
          if (t.phase === 'over') return;
          const end = t.phaseStart + t.minutes * 60_000;
          if (now < end) return;
          if (t.mode === 'timer') {
            set({ timer: { ...t, phase: 'over' }, lastReply: { text: `${t.minutes}분 됐어! 계속하면 이어서 적을게.`, at: now }, cheerAt: now });
            return;
          }
          // 뽀모도로: 집중이 끝난 정확한 시각으로 기록을 닫고 쉬는 시간으로 넘어간다.
          s.endActivityAt(t.activityId, end);
          set({ timer: { ...t, phase: 'break', phaseStart: end }, lastReply: { text: `뽀모도로 ${t.round}번 끝! ${t.breakMinutes}분 쉬자.`, at: now }, cheerAt: now });
          void scheduleTimerAlert(end + t.breakMinutes * 60_000, '쉬는 시간 끝. 준비되면 이어서 하자.');
          return;
        }
        if (t.phase === 'break' && now >= t.phaseStart + t.breakMinutes * 60_000) {
          // 자리를 비웠을 수 있으니 저절로 시작하지 않고 기다린다.
          set({ timer: { ...t, phase: 'ready' }, lastReply: { text: '쉬는 시간 끝. 준비되면 눌러줘.', at: now } });
        }
      },

      eraseNotes: (cellStart, cells) => {
        const end = cellStart + cells * CELL;
        const rest = get().cellNotes.filter((n) => n.at < cellStart || n.at >= end);
        if (rest.length !== get().cellNotes.length) set({ cellNotes: rest });
      },

      toggleTodo: (id) => {
        const now = Date.now();
        let finished = false;
        const todos = get().todos.map((t) => {
          if (t.id !== id) return t;
          finished = !t.done;
          // 끝냈으면 진행률을 쓰는 일은 100%로 맞춘다. 되돌릴 때는 진행률을 그대로 둔다.
          const pct = percentOf(t);
          return { ...t, done: !t.done, doneAt: t.done ? null : now, ...(pct !== undefined && !t.done ? { percent: 100 } : {}) };
        });
        set(finished ? { todos, cheerAt: now } : { todos });
      },

      removeTodo: (id) => {
        const before = pickData(get());
        const t = before.todos.find((x) => x.id === id);
        // 반복 일정의 하루를 지웠으면 그날은 다시 만들지 않는다.
        const series = t?.seriesId && t.due !== null ? before.series.map((s) => (s.id === t.seriesId ? { ...s, skip: [...s.skip, t.due!] } : s)) : before.series;
        set({ todos: before.todos.filter((x) => x.id !== id), series, undoData: before, lastReply: { text: '할 일을 지웠어.', at: Date.now(), undo: true } });
      },

      removeInterval: (id) => {
        const before = pickData(get());
        if (!before.intervals.some((iv) => iv.id === id)) return;
        set({ intervals: before.intervals.filter((iv) => iv.id !== id), undoData: before, lastReply: { text: '기록을 지웠어.', at: Date.now(), undo: true } });
      },

      setCellNote: (at, text) => {
        const t = text.trim().slice(0, 40);
        const rest = get().cellNotes.filter((n) => n.at !== at);
        set({ cellNotes: t ? [...rest, { at, text: t }] : rest });
      },

      startActivity: (activityId) => {
        const now = Date.now();
        const before = pickData(get());
        const d: Data = { ...before };
        const reply = applyCommand(d, { type: 'start', name: nameOf(d, activityId), activityId }, now);
        set({ ...d, undoData: before, lastReply: { text: reply, at: now, undo: true } });
        void rescheduleNudge(d.nudge && !d.sleeping);
      },

      endActivity: (activityId) => {
        const now = Date.now();
        const before = pickData(get());
        const d: Data = { ...before };
        const reply = applyCommand(d, { type: 'end', activityId }, now);
        set({ ...d, undoData: before, lastReply: { text: reply, at: now, undo: true }, cheerAt: now });
      },

      endActivityAt: (activityId, at) => {
        const before = pickData(get());
        const target = activeIntervals(before.intervals).find((iv) => iv.activityId === activityId);
        if (!target) return;
        const end = Math.min(Date.now(), Math.max(at, target.start + 60_000));
        const d: Data = { ...before };
        closeInterval(d, target.id, end);
        if (activityId === SLEEP_ID) d.sleeping = false;
        set({
          ...d,
          undoData: before,
          lastReply: { text: `${nameOf(d, activityId)} ${fmtHM(end)}에 끝난 걸로 고쳤어.`, at: Date.now(), undo: true },
        });
      },

      fillGap: (activityId, start, end) => {
        if (end <= start) return;
        const before = pickData(get());
        const intervals = mergeAdd(before.intervals, { activityId, kind: 'exec', start, end, source: 'chat' });
        set({
          intervals,
          undoData: before,
          lastReply: { text: `${fmtHM(start)}–${fmtHM(end)} ${nameOf(before, activityId)}(으)로 채웠어.`, at: Date.now(), undo: true },
        });
      },

      rateFocus: (value) => {
        const now = Date.now();
        const d: Data = { ...pickData(get()) };
        applyCommand(d, { type: 'focus', value }, now);
        set({ samples: d.samples });
      },

      addActivity: (name, parentId) => {
        const n = name.trim().slice(0, 20);
        if (!n) return;
        const d: Data = { ...pickData(get()) };
        ensureActivity(d, n, null, parentId);
        set({ activities: d.activities });
      },

      removeActivity: (id) => {
        const s = get();
        const used = s.intervals.some((iv) => iv.activityId === id) || s.samples.some((m) => m.activityId === id);
        const hasChildren = s.activities.some((a) => a.parentId === id);
        if (used || hasChildren || id === SLEEP_ID) return false;
        set({ activities: s.activities.filter((a) => a.id !== id) });
        return true;
      },

      renameActivity: (id, name) => {
        const n = name.trim();
        if (!n) return;
        set({ activities: get().activities.map((a) => (a.id === id ? { ...a, name: n } : a)) });
      },

      setNudge: (on) => {
        set({ nudge: on });
        rescheduleNudge(on && !get().sleeping);
      },

      setAi: (on) => set({ ai: on }),

      setPlanAlerts: (on) => set({ planAlerts: on }),

      setDailyBrief: (on) => set({ dailyBrief: on }),

      setLook: (look) => set({ look: { ...get().look, ...look } }),

      applyWidgetActions: (actions) => {
        if (!actions.length) return;
        const before = pickData(get());
        const d: Data = { ...before };
        const replies: string[] = [];
        for (const a of [...actions].sort((x, y) => x.at - y.at)) {
          if (!d.activities.some((x) => x.id === a.id)) continue;
          replies.push(applyCommand(d, a.op === 'start' ? { type: 'start', name: nameOf(d, a.id), activityId: a.id } : { type: 'end', activityId: a.id }, a.at));
        }
        if (!replies.length) return;
        set({ ...d, undoData: before, lastReply: { text: `위젯에서 누른 것 적었어: ${replies[replies.length - 1]}`, at: Date.now(), undo: true } });
      },

      addSeries: (input) => {
        const now = Date.now();
        const s: Series = { ...input, id: uid('series'), skip: [], createdAt: now };
        const cur = get();
        const series = [...cur.series, s];
        const out = materializeSeries([s], cur.todos, cur.intervals, logicalToday(now, cur.intervals), now, () => uid('todo'));
        set({ series, todos: out.todos, intervals: out.intervals });
      },

      removeSeries: (id) => {
        const now = Date.now();
        const before = pickData(get());
        const gone = before.todos.filter((t) => t.seriesId === id && !t.done && (t.end ?? t.start ?? 0) > now);
        let intervals = before.intervals;
        for (const t of gone) if (t.start !== undefined && t.end !== undefined) intervals = subtract(intervals, t.start, t.end, (iv) => iv.kind === 'plan' && iv.activityId === t.activityId, now);
        set({
          series: before.series.filter((s) => s.id !== id),
          todos: before.todos.filter((t) => !gone.includes(t)),
          intervals,
          undoData: before,
          lastReply: { text: '반복 일정을 지웠어.', at: now, undo: true },
        });
      },

      ensureSeries: () => {
        const cur = get();
        if (!cur.series.length) return;
        const now = Date.now();
        const out = materializeSeries(cur.series, cur.todos, cur.intervals, logicalToday(now, cur.intervals), now, () => uid('todo'));
        if (out.todos !== cur.todos) set({ todos: out.todos, intervals: out.intervals });
      },

      linkTodo: (id, activityId) => set({ todos: get().todos.map((t) => (t.id === id ? { ...t, activityId } : t)) }),

      setSteps: (id, steps) =>
        set({ todos: get().todos.map((t) => (t.id === id ? withSteps(t, steps.map((text) => ({ text: text.slice(0, 40), done: false }))) : t)) }),

      toggleStep: (id, index) => {
        const now = Date.now();
        let finished = false;
        const todos = get().todos.map((t) => {
          if (t.id !== id || !t.steps?.[index]) return t;
          const next = withSteps(t, t.steps.map((st, i) => (i === index ? { ...st, done: !st.done } : st)));
          finished = next.done && !t.done;
          return { ...next, doneAt: next.done ? t.doneAt ?? now : null };
        });
        set(finished ? { todos, cheerAt: now, lastReply: { text: '단계 다 끝! 수고했어.', at: now } } : { todos });
      },

      addStep: (id, text) => {
        const s = text.trim().slice(0, 40);
        if (!s) return;
        set({ todos: get().todos.map((t) => (t.id === id ? withSteps(t, [...(t.steps ?? []), { text: s, done: false }]) : t)) });
      },

      removeStep: (id, index) =>
        set({ todos: get().todos.map((t) => (t.id === id && t.steps ? withSteps(t, t.steps.filter((_, i) => i !== index)) : t)) }),

      stepProgress: (id, dir) => {
        const now = Date.now();
        const s = get();
        let reply: string | null = null;
        let finished = false;
        const todos = s.todos.map((t) => {
          if (t.id !== id) return t;
          const from = percentOf(t) ?? 0;
          const to = Math.max(0, Math.min(100, from + dir * s.progressStep));
          if (to === from) return t;
          const log = [...(t.progressLog ?? []), { at: now, from, to }].slice(-100);
          const next: Todo = { ...t, percent: to, progressLog: log };
          if (to === 100 && !t.done) {
            if (s.autoComplete) {
              finished = true;
              return { ...next, done: true, doneAt: now };
            }
            reply = '100%! 다 끝났으면 체크해줘.';
          }
          if (to < 100 && t.done) return { ...next, done: false, doneAt: null };
          return next;
        });
        if (finished) set({ todos, cheerAt: now, lastReply: { text: '다 했다! 수고했어.', at: now } });
        else set(reply ? { todos, lastReply: { text: reply, at: now } } : { todos });
      },

      trackProgress: (id, on) =>
        set({
          todos: get().todos.map((t) => {
            if (t.id !== id) return t;
            if (on) return { ...t, percent: percentOf(t) ?? 0 };
            const { percent: _p, progress: _q, ...rest } = t;
            return rest;
          }),
        }),

      setProgressStep: (step) => set({ progressStep: step }),

      setAutoComplete: (on) => set({ autoComplete: on }),

      recordRange: (r) => {
        const now = Date.now();
        const before = pickData(get());
        if (!(r.end > r.start)) return;
        let intervals = before.intervals;
        const parts: string[] = [];
        if (r.asActivity && r.activityId && before.activities.some((a) => a.id === r.activityId)) {
          // 같은 활동끼리만 이어 붙이고, 다른 활동은 그대로 둔다(겹쳐도 된다).
          intervals = mergeAdd(intervals, { activityId: r.activityId, kind: 'exec', start: r.start, end: Math.min(r.end, now), source: 'paint' });
          parts.push(`${fmtHM(r.start)}–${fmtHM(r.end)} ${nameOf(before, r.activityId)}`);
        }
        const hasMemory = !!(r.text.trim() || r.place?.trim() || r.people?.trim() || r.mood || r.photos.length);
        const memories = hasMemory
          ? [
              ...before.memories,
              {
                id: uid('mem'),
                start: r.start,
                end: r.end,
                activityId: r.activityId,
                text: r.text.trim().slice(0, 1000),
                photos: r.photos.slice(0, 12),
                createdAt: now,
                ...(r.place?.trim() ? { place: r.place.trim().slice(0, 30) } : {}),
                ...(r.people?.trim() ? { people: r.people.trim().slice(0, 40) } : {}),
                ...(r.mood ? { mood: r.mood } : {}),
                ...(r.todoId ? { todoId: r.todoId } : {}),
              },
            ]
          : before.memories;
        if (hasMemory) parts.push('기억');
        const todos = r.todoId && r.completeTodo ? before.todos.map((t) => (t.id === r.todoId ? { ...t, done: true, doneAt: t.doneAt ?? now } : t)) : before.todos;
        if (!parts.length && todos === before.todos) return;
        set({ intervals, memories, todos, undoData: before, lastReply: { text: `${parts.join(' + ')} 남겼어.`, at: now, undo: true } });
      },

      updateMemory: (id, patch) => set({ memories: get().memories.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),

      removeMemory: (id) => {
        const before = pickData(get());
        set({ memories: before.memories.filter((m) => m.id !== id), undoData: before, lastReply: { text: '기억을 지웠어.', at: Date.now(), undo: true } });
      },

      ensureLife: () => {
        const s = get();
        const patch: Partial<Data> = {};
        if (!s.activities.some((a) => a.id === LIFE_ID)) patch.activities = [...s.activities, ...LIFE_ACTIVITIES];
        // 예전 '칸 메모'(10분 한 칸)는 한마디로 옮긴다: 같은 상자 모양으로 보이게.
        if (s.cellNotes.length) {
          patch.memories = [...s.memories, ...s.cellNotes.map((n) => ({ id: uid('mem'), start: n.at, end: n.at + CELL, activityId: null, text: n.text, photos: [], createdAt: n.at }))];
          patch.cellNotes = [];
        }
        if (Object.keys(patch).length) set(patch);
      },

      addMood: (value) => {
        const now = Date.now();
        const v = Math.max(1, Math.min(5, Math.round(value)));
        set({ notes: [...get().notes, { id: uid('note'), at: now, kind: 'mood', text: MOOD_WORDS[v], value: v }] });
      },

      setApiOverride: (url) => set({ apiOverride: url.trim().replace(/\/+$/, '') }),

      importData: (json) => {
        try {
          const p = JSON.parse(json) as Partial<Data>;
          const arr = (v: unknown) => (Array.isArray(v) ? v : []);
          const activities = arr(p.activities).filter(
            (a) => a && typeof a.id === 'string' && typeof a.name === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.color),
          );
          if (!activities.length) return false;
          const known = new Set(activities.map((a) => a.id));
          // 대주제가 없는 하위 활동은 대주제로 올린다.
          for (const a of activities) {
            if (a.parentId && (!known.has(a.parentId) || a.parentId === a.id)) delete a.parentId;
          }
          const intervals = arr(p.intervals).filter(
            (iv) =>
              iv &&
              known.has(iv.activityId) &&
              (iv.kind === 'plan' || iv.kind === 'exec') &&
              Number.isFinite(iv.start) &&
              (iv.end === null || (Number.isFinite(iv.end) && iv.end > iv.start)),
          );
          // 가져온 파일의 서버 주소와 AI 동의는 믿지 않는다: 이 기기에서 정한 값을 유지한다.
          const cur = get();
          set({
            ...emptyData(),
            activities,
            intervals,
            samples: arr(p.samples).filter((m) => m && Number.isFinite(m.at) && Number.isFinite(m.value)),
            raw: arr(p.raw).filter((r) => r && typeof r.text === 'string' && Number.isFinite(r.at)),
            notes: arr(p.notes).filter((n) => n && typeof n.text === 'string' && Number.isFinite(n.at)),
            planVersions: arr(p.planVersions).filter((v) => v && Number.isFinite(v.day) && Array.isArray(v.items)),
            todos: arr(p.todos).filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string' && (t.due === null || Number.isFinite(t.due))),
            cellNotes: arr(p.cellNotes).filter((n) => n && Number.isFinite(n.at) && typeof n.text === 'string'),
            timer: null,
            sleeping: intervals.some((iv) => iv.activityId === SLEEP_ID && iv.end === null),
            nudge: cur.nudge,
            planAlerts: cur.planAlerts,
            dailyBrief: cur.dailyBrief,
            progressStep: cur.progressStep,
            autoComplete: cur.autoComplete,
            memories: arr(p.memories).filter((m) => m && typeof m.id === 'string' && Number.isFinite(m.start) && Number.isFinite(m.end)).map((m) => ({ ...m, photos: Array.isArray(m.photos) ? m.photos : [] })),
            look: cur.look,
            series: arr(p.series).filter((x) => x && typeof x.id === 'string' && Array.isArray(x.days) && Number.isFinite(x.startMin)),
            focus: arr(p.focus).filter((f) => f && typeof f.word === 'string' && Number.isFinite(f.from) && Number.isFinite(f.to)),
            ai: cur.ai,
            apiOverride: cur.apiOverride,
            undoData: pickData(cur),
          });
          return true;
        } catch {
          return false;
        }
      },

      wipe: () => set({ ...emptyData(), undoData: null, lastReply: null, thinking: false }),
    }),
    {
      name: 'moa-v1',
      storage: createJSONStorage(() => moaStorage),
      partialize: (s) => pickData(s),
    },
  ),
);
