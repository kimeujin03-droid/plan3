import { activeIntervals, totalsByActivity } from './intervals';
import { matchActivity } from './parser';
import { DAY } from './time';
import type { Activity, Interval, Todo } from './types';
import { whenOf } from './when';

export interface NextPick {
  todo: Todo;
  /** 왜 이걸 골랐는지 한 줄 */
  why: string;
  /** 시작할 활동(추측). 모르면 null */
  activityId: string | null;
  /** 오늘 목표면 남은 분 */
  minutesLeft?: number;
}

/**
 * "지금 뭐 하지?": 고를 것을 줄여 준다. 순서대로 하나씩 내놓는다.
 * 1) 지금 하고 있어야 하는 일정  2) 급하거나 지난 마감  3) 오늘 목표 중 덜 한 것
 * 4) 다가오는 마감(가까운 순)  5) 기한 없는 일(오래된 순)
 * 약속·기상처럼 시각만 있는 일정은 시작할 일이 아니라서 뺀다.
 */
export function pickNext(todos: Todo[], intervals: Interval[], activities: Activity[], today: number, clock: number): NextPick[] {
  const running = new Set(activeIntervals(intervals).map((iv) => iv.activityId));
  const guess = (t: Todo) => t.activityId ?? matchActivity(t.text, activities)?.id ?? null;
  const open = todos.filter((t) => !t.done && !(t.activityId && running.has(t.activityId)));
  const out: NextPick[] = [];
  const seen = new Set<string>();
  const push = (t: Todo, why: string, extra: Partial<NextPick> = {}) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    out.push({ todo: t, why, activityId: guess(t), ...extra });
  };

  for (const t of open) if (t.start !== undefined && t.end !== undefined && clock >= t.start && clock < t.end) push(t, '지금 하기로 한 시간이야');
  const deadlines = open
    .filter((t) => t.type !== 'hours' && (t.start === undefined || t.dueAt !== undefined) && t.due !== null)
    .map((t) => ({ t, w: whenOf(t, today, clock)! }))
    .sort((a, b) => a.w.target - b.w.target);
  for (const { t, w } of deadlines) if (w.level === 'urgent' || w.level === 'late') push(t, w.text);

  const totals = totalsByActivity(intervals, today, today + DAY, clock);
  for (const t of open.filter((x) => x.type === 'hours' && x.activityId)) {
    const done = activities.filter((a) => a.id === t.activityId || a.parentId === t.activityId).reduce((s, a) => s + (totals[a.id] ?? 0), 0);
    const left = Math.round(((t.minutes ?? 0) * 60_000 - done) / 60_000);
    if (left > 0) push(t, `오늘 목표까지 ${left >= 60 ? `${Math.floor(left / 60)}시간 ${left % 60 ? `${left % 60}분` : ''}`.trim() : `${left}분`} 남았어`, { minutesLeft: left });
  }
  for (const { t, w } of deadlines) push(t, w.text);
  for (const t of open.filter((x) => x.due === null && x.type !== 'hours').sort((a, b) => a.createdAt - b.createdAt)) push(t, '미뤄둔 일');
  return out;
}
