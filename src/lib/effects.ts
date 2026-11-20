import type { Data, Interval } from './types';
import { subtract } from './intervals';

/**
 * 한 마디(채팅 한 번)가 기록에 남긴 것. 나중에 그 말을 고치면 이것만 정확히 걷어 낸다.
 * 칠한 시간은 id가 아니라 범위로 적는다: 이어 칠하면 옆 기록과 합쳐져 id가 바뀌기 때문.
 */
export interface Effects {
  todos?: string[];
  memories?: string[];
  series?: string[];
  notes?: string[];
  /** 새로 칠해진 범위(end가 null이면 지금도 하는 중) */
  iv?: { kind: 'plan' | 'exec'; activityId: string; start: number; end: number | null }[];
}

type Span = [number, number];

function spansOf(list: Interval[], kind: 'plan' | 'exec', act: string, now: number): Span[] {
  return list
    .filter((iv) => iv.kind === kind && iv.activityId === act)
    .map((iv) => [iv.start, iv.end ?? now] as Span)
    .sort((a, b) => a[0] - b[0]);
}

/** a에서 b를 뺀 범위들 */
export function minus(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [s0, e0] of a) {
    let pieces: Span[] = [[s0, e0]];
    for (const [s, e] of b) {
      pieces = pieces.flatMap(([ps, pe]) => {
        if (e <= ps || s >= pe) return [[ps, pe] as Span];
        const r: Span[] = [];
        if (s > ps) r.push([ps, s]);
        if (e < pe) r.push([e, pe]);
        return r;
      });
    }
    out.push(...pieces.filter(([s, e]) => e - s >= 1000));
  }
  return out;
}

/** before → after 사이에 새로 생긴 것 */
export function diffEffects(before: Data, after: Data, now: number): Effects {
  const added = <T extends { id: string }>(b: T[], a: T[]) => {
    const ids = new Set(b.map((x) => x.id));
    return a.filter((x) => !ids.has(x.id)).map((x) => x.id);
  };
  const fx: Effects = {};
  const todos = added(before.todos, after.todos);
  if (todos.length) fx.todos = todos;
  const memories = added(before.memories, after.memories);
  if (memories.length) fx.memories = memories;
  const series = added(before.series, after.series);
  if (series.length) fx.series = series;
  const notes = added(before.notes, after.notes);
  if (notes.length) fx.notes = notes;
  const iv: NonNullable<Effects['iv']> = [];
  // 새로 시작한 '하는 중' 기록: 아직 길이가 0일 수 있어서 따로 적는다
  const opened = after.intervals.filter((x) => x.end === null && !before.intervals.some((y) => y.id === x.id && y.end === null));
  for (const o of opened) iv.push({ kind: o.kind, activityId: o.activityId, start: o.start, end: null });
  const keys = new Set(after.intervals.map((x) => `${x.kind}|${x.activityId}`));
  for (const k of keys) {
    const [kind, act] = k.split('|') as ['plan' | 'exec', string];
    const closedAfter = after.intervals.filter((x) => !opened.includes(x));
    for (const [s, e] of minus(spansOf(closedAfter, kind, act, now), spansOf(before.intervals, kind, act, now))) iv.push({ kind, activityId: act, start: s, end: e });
  }
  if (iv.length) fx.iv = iv;
  return fx;
}

/** 그 말이 남긴 것을 걷어 낸다(그사이 사용자가 지운 것은 이미 없으니 그냥 넘어간다). */
export function revertEffects(d: Data, fx: Effects | undefined, now: number): Data {
  if (!fx) return d;
  const has = (list: string[] | undefined) => new Set(list ?? []);
  const todos = has(fx.todos);
  const memories = has(fx.memories);
  const series = has(fx.series);
  const notes = has(fx.notes);
  let intervals = d.intervals;
  for (const r of fx.iv ?? []) {
    const end = r.end ?? now;
    intervals = subtract(intervals, r.start, end, (iv) => iv.kind === r.kind && iv.activityId === r.activityId, now);
    // 아직 하는 중으로 시작한 것이면 열린 기록도 닫지 말고 없앤다
    if (r.end === null) intervals = intervals.filter((iv) => !(iv.end === null && iv.kind === r.kind && iv.activityId === r.activityId && iv.start >= r.start - 1000));
  }
  return {
    ...d,
    intervals,
    todos: d.todos.filter((t) => !todos.has(t.id) && !(t.seriesId && series.has(t.seriesId))),
    memories: d.memories.filter((m) => !memories.has(m.id)),
    series: d.series.filter((s) => !series.has(s.id)),
    notes: d.notes.filter((n) => !notes.has(n.id)),
  };
}
