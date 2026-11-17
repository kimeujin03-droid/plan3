import { describe, expect, it } from 'vitest';
import { pickNext } from './next';
import { planAlerts } from './notify';
import { DEFAULT_ACTIVITIES } from './palette';
import { materializeSeries } from './series';
import { DAY, HOUR, MIN } from './time';
import type { Series, Todo } from './types';

const mon = new Date(2026, 10, 16).getTime();
let n = 0;
const id = () => `t${n++}`;
const lesson: Series = { id: 's1', text: '수업', activityId: 'class', days: [2, 4], startMin: 540, endMin: 720, skip: [], createdAt: mon };

describe('반복 일정 채우기', () => {
  it('2주 동안 화·목에만 만들고 격자에도 계획을 칠한다', () => {
    const out = materializeSeries([lesson], [], [], mon, mon + 8 * HOUR, id);
    expect(out.todos.map((t) => new Date(t.due!).getDate())).toEqual([17, 19, 24, 26]);
    expect(out.todos[0]).toMatchObject({ start: mon + DAY + 9 * HOUR, end: mon + DAY + 12 * HOUR, seriesId: 's1', type: 'range' });
    expect(out.intervals.filter((iv) => iv.kind === 'plan')).toHaveLength(4);
  });
  it('이미 있는 날, 지운 날, 지난 일정은 다시 만들지 않는다', () => {
    const once = materializeSeries([lesson], [], [], mon, mon, id);
    const again = materializeSeries([{ ...lesson, skip: [mon + 3 * DAY] }], once.todos, once.intervals, mon, mon, id);
    expect(again.todos).toBe(once.todos);
    const late = materializeSeries([{ ...lesson, skip: [mon + 3 * DAY] }], [], [], mon, mon + DAY + 13 * HOUR, id);
    expect(late.todos.map((t) => new Date(t.due!).getDate())).toEqual([24, 26]);
  });
});

describe('지금 뭐 하지?', () => {
  const base = { done: false, doneAt: null, createdAt: 0 };
  const todos: Todo[] = [
    { ...base, id: 'old', text: '방 청소', due: null, createdAt: 1 },
    { ...base, id: 'far', text: '보고서', due: mon + 6 * DAY },
    { ...base, id: 'hot', text: '수치해석 과제', due: mon, dueAt: mon + 18 * HOUR },
    { ...base, id: 'meet', text: '약속', due: mon, start: mon + 20 * HOUR },
    { ...base, id: 'goal', text: '논문 매일 2시간', due: null, type: 'hours', minutes: 120, activityId: 'paper' },
  ];
  it('급한 마감 → 오늘 목표 → 다가오는 마감 → 미뤄둔 일, 약속은 빼고', () => {
    const picks = pickNext(todos, [], DEFAULT_ACTIVITIES, mon, mon + 14 * HOUR);
    expect(picks.map((p) => p.todo.id)).toEqual(['hot', 'goal', 'far', 'old']);
    expect(picks[0].activityId).toBe('hw');
    expect(picks[1]).toMatchObject({ activityId: 'paper', minutesLeft: 120 });
  });
});

describe('시작 안 했을 때 한 번 더', () => {
  const t = { id: 'a', text: '알바', done: false, due: mon, start: mon + 9 * HOUR, activityId: 'job' };
  it('5분 지나도 기록이 없으면 묻고, 시작했으면 묻지 않는다', () => {
    const titles = (iv: { activityId: string; kind: string; start: number }[]) => planAlerts([t], mon, { intervals: iv }).map((a) => a.title);
    expect(titles([])).toContain('알바 시작했어?');
    expect(titles([{ activityId: 'job', kind: 'exec', start: mon + 8 * HOUR + 55 * MIN }])).not.toContain('알바 시작했어?');
  });
  it('아침 한 줄은 그날 계획을 시각 순으로', () => {
    const a = planAlerts([t, { id: 'b', text: '레포트', done: false, due: mon, dueAt: mon + 18 * HOUR }], mon, { brief: true }).find((x) => x.title.startsWith('오늘'))!;
    expect(a).toMatchObject({ title: '오늘 2개', body: '09:00 알바, 레포트(18:00까지)' });
  });
});
