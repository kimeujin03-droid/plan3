import { DAY, dayStart, fmtDue, fmtHM, fmtLeft, HOUR } from './time';
import type { Todo } from './types';

/* ───── 남은 시간과 급함 ───── */

export type Urgency = 'late' | 'urgent' | 'soon' | 'normal';

/** 이 계획이 언제인지, 얼마나 급한지. today는 자기 전 기준의 오늘 0시, clock은 지금 시각. */
export function whenOf(t: Todo, today: number, clock: number): { text: string; level: Urgency; target: number } | null {
  // 일정(시각이 있는 일)
  if (t.start !== undefined && t.dueAt === undefined) {
    const day = `${fmtDue(dayStart(t.start), today)} ${fmtHM(t.start)}${t.end !== undefined ? `–${fmtHM(t.end)}` : ''}`;
    const left = t.start - clock;
    if (t.end !== undefined && clock >= t.start && clock < t.end) return { text: `하는 중 · ${fmtHM(t.end)}까지`, level: 'urgent', target: t.start };
    if (left < 0) return { text: `${day} · 지남`, level: 'late', target: t.start };
    if (left <= HOUR) return { text: `${fmtLeft(left)} 뒤`, level: 'urgent', target: t.start };
    if (left < 12 * HOUR) return { text: `${day} · ${fmtLeft(left)} 뒤`, level: left < 3 * HOUR ? 'soon' : 'normal', target: t.start };
    return { text: day, level: 'normal', target: t.start };
  }
  // 마감
  if (t.due === null) return null;
  const target = t.dueAt ?? t.due + DAY;
  // 시각 없는 마감은 그날이 끝날 때(자기 전까지)가 기한이다.
  if (t.dueAt === undefined) {
    if (t.due < today) return { text: `${Math.round((today - t.due) / DAY)}일 지남`, level: 'late', target };
    if (t.due === today) return { text: '급해 · 오늘까지', level: 'urgent', target };
  }
  const left = target - clock;
  if (left < 0) return { text: `${fmtLeft(-left)} 지남`, level: 'late', target };
  if (left < DAY) return { text: `급해 · ${fmtLeft(left)} 남음`, level: 'urgent', target };
  const by = `${fmtDue(t.due, today)}${t.dueAt !== undefined ? ` ${fmtHM(t.dueAt)}` : ''}까지`;
  if (left < 3 * DAY) return { text: `${by} · ${fmtLeft(left)} 남음`, level: 'soon', target };
  return { text: by, level: 'normal', target };
}

export const byUrgency = (today: number, clock: number) => (a: Todo, b: Todo) =>
  (whenOf(a, today, clock)?.target ?? Infinity) - (whenOf(b, today, clock)?.target ?? Infinity);

