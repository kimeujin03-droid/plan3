import { describe, expect, it } from 'vitest';
import { planAlerts } from './notify';
import { DAY, HOUR, MIN } from './time';
import { whenOf } from '../screens/Todos';
import type { Todo } from './types';

const tue = new Date(2026, 10, 17).getTime();
const base: Todo = { id: 'a', text: '기상', due: tue + DAY, done: false, doneAt: null, createdAt: 0 };

describe('남은 시간과 급함', () => {
  // 11/18 01:34, 아직 안 잠 → 오늘은 11/17
  const clock = tue + DAY + HOUR + 34 * MIN;
  it('새벽에 본 "내일 9시 기상"은 내일 09:00 (오늘이 아니다)', () => {
    const w = whenOf({ ...base, start: tue + DAY + 9 * HOUR }, tue, clock)!;
    expect(w.text).toBe('내일 09:00 · 7시간 뒤');
    expect(w.level).toBe('normal');
  });
  it('1시간 안에 시작하면 급함, 마감이 하루 안이면 "급해"', () => {
    expect(whenOf({ ...base, start: clock + 40 * MIN }, tue, clock)).toMatchObject({ text: '40분 뒤', level: 'urgent' });
    expect(whenOf({ ...base, text: '레포트', dueAt: clock + 5 * HOUR }, tue, clock)).toMatchObject({ text: '급해 · 5시간 남음', level: 'urgent' });
    expect(whenOf({ ...base, text: '레포트', dueAt: clock - 2 * HOUR }, tue, clock)).toMatchObject({ text: '2시간 지남', level: 'late' });
  });
  it('시각 없는 마감은 자기 전까지가 그날', () => {
    expect(whenOf({ ...base, due: tue }, tue, clock)).toMatchObject({ text: '급해 · 오늘까지', level: 'urgent' });
  });
});

describe('계획 알림', () => {
  const now = tue + 10 * HOUR;
  it('일정은 1시간 전과 10분 전, 마감 시각이 있으면 하루·3시간·1시간 전', () => {
    const at = planAlerts(
      [
        { id: 'a', text: '알바', done: false, due: tue + DAY, start: tue + DAY + 9 * HOUR },
        { id: 'b', text: '레포트', done: false, due: tue + 3 * DAY, dueAt: tue + 3 * DAY + 18 * HOUR },
      ],
      now,
    ).map((a) => [a.at, a.title]);
    expect(at).toEqual([
      [tue + DAY + 8 * HOUR, '1시간 뒤 · 알바'],
      [tue + DAY + 8 * HOUR + 50 * MIN, '10분 뒤 · 알바'],
      [tue + 2 * DAY + 18 * HOUR, '내일 18:00까지 · 레포트'],
      [tue + 3 * DAY + 15 * HOUR, '3시간 남음 · 레포트'],
      [tue + 3 * DAY + 17 * HOUR, '1시간 남음 · 레포트'],
    ]);
  });
  it('끝낸 것, 지난 알림은 빼고 날짜만 정한 마감은 전날 밤·당일 아침', () => {
    expect(planAlerts([{ id: 'c', text: 'x', done: true, due: tue + DAY, start: tue + DAY + 9 * HOUR }], now)).toEqual([]);
    expect(planAlerts([{ id: 'd', text: '서류', done: false, due: tue + DAY }], now).map((a) => a.at)).toEqual([tue + DAY - 3 * HOUR, tue + DAY + 9 * HOUR]);
  });
});
