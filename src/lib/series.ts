import { mergeAdd, subtract } from './intervals';
import { addDays, MIN } from './time';
import type { Interval, Series, Todo } from './types';

/** 반복 일정을 앞으로 며칠 치 만들어 두는지 */
export const SERIES_AHEAD_DAYS = 14;

const DAYS = '일월화수목금토';

/** "매주 화·목 09:00–12:00" */
export function describeSeries(s: Series): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const days =
    s.days.length === 7 ? '매일' : s.days.join() === '1,2,3,4,5' ? '평일' : s.days.join() === '0,6' ? '주말' : `매주 ${[...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS[d]).join('·')}`;
  return `${days} ${hm(s.startMin)}${s.endMin !== null ? `–${hm(s.endMin)}` : ''}`;
}

/**
 * 반복 일정의 빈 날을 채운다: from(그날 0시)부터 days일 동안, 요일이 맞고 아직 없는 날에 계획을 만든다.
 * 이미 만든 날, 사용자가 지운 날은 건드리지 않는다. 활동을 알면 격자에도 계획으로 칠한다.
 */
export function materializeSeries(
  series: Series[],
  todos: Todo[],
  intervals: Interval[],
  from: number,
  now: number,
  newId: () => string,
  days = SERIES_AHEAD_DAYS,
): { todos: Todo[]; intervals: Interval[] } {
  let outTodos = todos;
  let outIv = intervals;
  for (const s of series) {
    for (let i = 0; i < days; i++) {
      const day = addDays(from, i);
      if (!s.days.includes(new Date(day).getDay())) continue;
      if (day < s.createdAt - 24 * 60 * MIN && i > 0) continue;
      if (s.skip.includes(day)) continue;
      if (outTodos.some((t) => t.seriesId === s.id && t.due === day)) continue;
      const start = day + s.startMin * MIN;
      const end = s.endMin !== null ? day + s.endMin * MIN : undefined;
      // 이미 지난 일정은 만들지 않는다.
      if ((end ?? start) <= now) continue;
      const todo: Todo = {
        id: newId(),
        text: s.text,
        due: day,
        done: false,
        doneAt: null,
        createdAt: now,
        start,
        seriesId: s.id,
        ...(end !== undefined ? { end, type: 'range' as const } : {}),
        ...(s.activityId ? { activityId: s.activityId } : {}),
        ...(s.place ? { place: s.place } : {}),
      };
      outTodos = [...outTodos, todo];
      if (s.activityId && end !== undefined) {
        outIv = subtract(outIv, start, end, (iv) => iv.kind === 'plan', now);
        outIv = mergeAdd(outIv, { activityId: s.activityId, kind: 'plan', start, end, source: 'paint' });
      }
    }
  }
  return { todos: outTodos, intervals: outIv };
}
