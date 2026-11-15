import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from './lib/id';
import { mentionIntent } from './lib/intents';
import { activeIntervals, mergeAdd, paintCell } from './lib/intervals';
import { rescheduleNudge } from './lib/notify';
import { DEFAULT_ACTIVITIES, EXTRA_COLORS, SLEEP_ID } from './lib/palette';
import { parse, type Command } from './lib/parser';
import { recordPlanEdit } from './lib/plans';
import { dayStart, fmtDur, fmtHM } from './lib/time';
import type { Activity, Data, PaintMode } from './lib/types';

export interface Reply {
  text: string;
  at: number;
}

interface Store extends Data {
  undoData: Data | null;
  lastReply: Reply | null;
  say: (text: string) => void;
  undo: () => void;
  beginStroke: () => void;
  paint: (cellStart: number, mode: PaintMode, activityId: string) => void;
  startActivity: (activityId: string) => void;
  endActivity: (activityId: string) => void;
  rateFocus: (value: number) => void;
  addActivity: (name: string) => void;
  renameActivity: (id: string, name: string) => void;
  setNudge: (on: boolean) => void;
  importData: (json: string) => boolean;
  wipe: () => void;
}

export const emptyData = (): Data => ({
  activities: DEFAULT_ACTIVITIES,
  intervals: [],
  samples: [],
  raw: [],
  intents: [],
  notes: [],
  planVersions: [],
  sleeping: false,
  nudge: false,
});

export function pickData(s: Data): Data {
  return {
    activities: s.activities,
    intervals: s.intervals,
    samples: s.samples,
    raw: s.raw,
    intents: s.intents,
    notes: s.notes,
    planVersions: s.planVersions,
    sleeping: s.sleeping,
    nudge: s.nudge,
  };
}

function ensureActivity(d: Data, name: string, id: string | null): Activity {
  const found = id ? d.activities.find((a) => a.id === id) : d.activities.find((a) => a.name === name);
  if (found) return found;
  const custom = d.activities.length - DEFAULT_ACTIVITIES.length;
  const act: Activity = {
    id: uid('act'),
    name,
    color: EXTRA_COLORS[((custom % EXTRA_COLORS.length) + EXTRA_COLORS.length) % EXTRA_COLORS.length],
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
      return `${fmtHM(now)}부터 ${act.name} 시작으로 적어놨어.`;
    }
    case 'end': {
      const active = activeIntervals(d.intervals);
      const target = cmd.activityId
        ? active.find((iv) => iv.activityId === cmd.activityId)
        : active[active.length - 1];
      if (!target) return '지금 하는 중으로 적힌 게 없어.';
      closeInterval(d, target.id, now);
      if (target.activityId === SLEEP_ID) d.sleeping = false;
      return `${nameOf(d, target.activityId)} 끝으로 적었어. ${fmtDur(now - target.start)} 했네.`;
    }
    case 'intent': {
      d.intents = mentionIntent(d.intents, cmd.label, cmd.activityId, now);
      return `"${cmd.label}"은 하려던 일로 적어둘게. 실제 시작은 아직으로 둘게.`;
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
      return '기분만 적어둘게. 계획은 그대로 뒀어.';
    }
    case 'quiet': {
      d.nudge = false;
      return '알겠어. 먼저 말 걸지 않을게.';
    }
    case 'memo': {
      d.notes = [...d.notes, { id: uid('note'), at: now, kind: 'memo', text: cmd.text }];
      return '메모로 적어뒀어.';
    }
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      undoData: null,
      lastReply: null,

      say: (text) => {
        const now = Date.now();
        const before = pickData(get());
        const d: Data = { ...before };
        const cmds = parse(text, d.activities, now);
        if (!cmds.length) return;
        const reply = cmds.map((c) => applyCommand(d, c, now)).join(' ');
        d.raw = [
          ...d.raw,
          { id: uid('raw'), at: now, text: text.trim(), action: cmds.map((c) => c.type).join('+'), reply },
        ];
        set({ ...d, undoData: before, lastReply: { text: reply, at: now } });
        rescheduleNudge(d.nudge && !d.sleeping);
      },

      undo: () => {
        const u = get().undoData;
        if (!u) return;
        // 원문은 지우지 않는다: 되돌려도 사용자가 한 말은 남긴다.
        set({ ...u, raw: get().raw, undoData: null, lastReply: { text: '방금 건 되돌렸어.', at: Date.now() } });
      },

      beginStroke: () => set({ undoData: pickData(get()) }),

      paint: (cellStart, mode, activityId) => {
        const now = Date.now();
        const s = get();
        const intervals = paintCell(s.intervals, cellStart, activityId, mode, now);
        if (intervals === s.intervals) return;
        const planVersions =
          mode === 'exec' ? s.planVersions : recordPlanEdit(s.planVersions, intervals, dayStart(cellStart), now);
        set({ intervals, planVersions });
      },

      startActivity: (activityId) => {
        const now = Date.now();
        const before = pickData(get());
        const d: Data = { ...before };
        const reply = applyCommand(d, { type: 'start', name: nameOf(d, activityId), activityId }, now);
        set({ ...d, undoData: before, lastReply: { text: reply, at: now } });
        rescheduleNudge(d.nudge && !d.sleeping);
      },

      endActivity: (activityId) => {
        const now = Date.now();
        const before = pickData(get());
        const d: Data = { ...before };
        const reply = applyCommand(d, { type: 'end', activityId }, now);
        set({ ...d, undoData: before, lastReply: { text: reply, at: now } });
      },

      rateFocus: (value) => {
        const now = Date.now();
        const d: Data = { ...pickData(get()) };
        applyCommand(d, { type: 'focus', value }, now);
        set({ samples: d.samples });
      },

      addActivity: (name) => {
        const n = name.trim();
        if (!n) return;
        const d: Data = { ...pickData(get()) };
        ensureActivity(d, n, null);
        set({ activities: d.activities });
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

      importData: (json) => {
        try {
          const p = JSON.parse(json) as Partial<Data>;
          if (!Array.isArray(p.activities) || !Array.isArray(p.intervals)) return false;
          set({ ...emptyData(), ...p, undoData: pickData(get()) });
          return true;
        } catch {
          return false;
        }
      },

      wipe: () => set({ ...emptyData(), undoData: null, lastReply: null }),
    }),
    {
      name: 'moa-v1',
      partialize: (s) => pickData(s),
    },
  ),
);
