import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { aiParse, DEFAULT_API } from './lib/ai';
import { uid } from './lib/id';
import { activeIntervals, mergeAdd, paintCell } from './lib/intervals';
import { rescheduleNudge } from './lib/notify';
import { moaStorage } from './lib/storage';
import { childColor, DEFAULT_ACTIVITIES, EXTRA_COLORS, SLEEP_ID } from './lib/palette';
import { parse, type Command } from './lib/parser';
import { recordPlanEdit } from './lib/plans';
import { dayStart, fmtDur, fmtHM } from './lib/time';
import type { Activity, Data, PaintMode } from './lib/types';

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
  rateFocus: (value: number) => void;
  addActivity: (name: string, parentId?: string) => void;
  /** 기록에 쓰인 적 없고 하위 활동도 없을 때만 지운다. 지웠으면 true. */
  removeActivity: (id: string) => boolean;
  renameActivity: (id: string, name: string) => void;
  setNudge: (on: boolean) => void;
  setAi: (on: boolean) => void;
  setApiOverride: (url: string) => void;
  importData: (json: string) => boolean;
  wipe: () => void;
}

export const emptyData = (): Data => ({
  activities: DEFAULT_ACTIVITIES,
  intervals: [],
  samples: [],
  raw: [],
  notes: [],
  planVersions: [],
  sleeping: false,
  nudge: false,
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
    sleeping: s.sleeping,
    nudge: s.nudge,
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
    case 'intent': {
      // "해야지"는 시작이 아니다. 타이머를 켜지 않고 메모로만 남긴다.
      d.notes = [...d.notes, { id: uid('note'), at: now, kind: 'memo', text: `${cmd.label} 해야지` }];
      return '메모로 적어뒀어. 시작할 땐 버튼만 눌러줘.';
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

      say: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const now = Date.now();
        const s0 = get();
        const before = pickData(s0);
        const rawId = uid('raw');
        const ruleCmds = parse(trimmed, s0.activities, now);
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
        const notUnderstood = ruleCmds.length === 1 && ruleCmds[0].type === 'memo';
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        if (notUnderstood && s0.ai && api && online) {
          // 원문은 바로 저장하고, 해석만 서버를 기다린다. 서버가 실패하면 메모로 남는다.
          set({
            raw: [...s0.raw, { id: rawId, at: now, text: trimmed, action: 'pending', reply: '' }],
            lastReply: { text: '잠깐만, 알아듣는 중…', at: now },
            undoData: null,
            thinking: true,
          });
          const running = activeIntervals(s0.intervals).map((iv) => nameOf(s0, iv.activityId));
          void aiParse(api, trimmed, s0.activities, running, now).then((aiCmds) =>
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

      paint: (cellStart, mode, activityId) => {
        const now = Date.now();
        const s = get();
        if (mode === 'exec' && cellStart > now) {
          // 아직 오지 않은 시간에 '했다'를 적으면 통계가 틀어진다. 계획으로만 칠하게 한다.
          const text = '아직 안 온 시간은 계획으로만 칠할 수 있어.';
          if (s.lastReply?.text !== text || now - s.lastReply.at > 4000) set({ lastReply: { text, at: now } });
          return;
        }
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
        set({ ...d, undoData: before, lastReply: { text: reply, at: now, undo: true } });
        void rescheduleNudge(d.nudge && !d.sleeping);
      },

      endActivity: (activityId) => {
        const now = Date.now();
        const before = pickData(get());
        const d: Data = { ...before };
        const reply = applyCommand(d, { type: 'end', activityId }, now);
        set({ ...d, undoData: before, lastReply: { text: reply, at: now, undo: true } });
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
            sleeping: intervals.some((iv) => iv.activityId === SLEEP_ID && iv.end === null),
            nudge: cur.nudge,
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
