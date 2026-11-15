import { DAY, MIN } from './time';
import type { Interval, PlanItem, PlanVersion } from './types';

/** 이 시간 안에 이어진 수정은 같은 버전으로 본다. */
export const SESSION_MS = 30 * MIN;

export function summarizePlan(intervals: Interval[], day: number): PlanItem[] {
  const acc: Record<string, number> = {};
  for (const iv of intervals) {
    if (iv.kind !== 'plan' || iv.end === null) continue;
    const s = Math.max(iv.start, day);
    const e = Math.min(iv.end, day + DAY);
    if (e > s) acc[iv.activityId] = (acc[iv.activityId] ?? 0) + (e - s) / MIN;
  }
  return Object.entries(acc)
    .map(([activityId, minutes]) => ({ activityId, minutes: Math.round(minutes) }))
    .sort((a, b) => b.minutes - a.minutes);
}

const same = (a: PlanItem[], b: PlanItem[]) => JSON.stringify(a) === JSON.stringify(b);

/** 계획이 바뀔 때마다 부른다. 첫 계획은 v1로 남기고, 한참 뒤에 바꾸면 새 버전을 쌓는다. 옛 버전은 고치지 않는다. */
export function recordPlanEdit(versions: PlanVersion[], intervals: Interval[], day: number, at: number): PlanVersion[] {
  const items = summarizePlan(intervals, day);
  const mine = versions.filter((v) => v.day === day);
  const last = mine[mine.length - 1];
  if (!last) return items.length ? [...versions, { day, version: 1, at, items }] : versions;
  if (same(last.items, items)) return versions;
  if (at - last.at < SESSION_MS) {
    return versions.map((v) => (v === last ? { ...v, items } : v));
  }
  return [...versions, { day, version: last.version + 1, at, items }];
}
