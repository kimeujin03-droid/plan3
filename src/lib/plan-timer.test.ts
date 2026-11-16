import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyData, useStore } from '../store';
import { focusAverage, focusCells } from './focus';
import { CELL, HOUR, MIN } from './time';
import type { Sample } from './types';

// 테스트 환경에는 저장소가 없다: 기억만 하는 가짜를 둔다.
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

const T0 = new Date(2026, 10, 16, 9, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
});

describe('집중도는 10분 칸으로 쌓이고, 안 고르면 앞의 값이 이어진다', () => {
  const s = (min: number, value: number): Sample => ({ at: T0 + min * MIN, kind: 'focus', value, activityId: 'study' });

  it('첫 선택 전은 비어 있고, 고른 뒤로는 다시 고를 때까지 유지된다', () => {
    const cells = focusCells([s(12, 4), s(41, 2)], 'study', T0, T0 + HOUR);
    expect(cells.map((c) => c.value)).toEqual([null, 4, 4, 4, 2, 2]);
    expect(cells.map((c) => c.picked)).toEqual([false, true, false, false, true, false]);
    expect(focusAverage(cells)).toBeCloseTo(3.2);
  });

  it('다른 활동이나 다른 작업의 값은 섞이지 않는다', () => {
    const other: Sample = { at: T0 + 5 * MIN, kind: 'focus', value: 5, activityId: 'paper' };
    const before = s(-30, 5);
    expect(focusCells([other, before], 'study', T0, T0 + 2 * CELL).map((c) => c.value)).toEqual([null, null]);
  });
});

describe('종류별 지우개', () => {
  it('계획 지우개는 한 일을 건드리지 않고, 한 일 지우개는 계획을 건드리지 않는다', () => {
    const st = useStore.getState();
    const past = T0 - HOUR;
    st.paintRange(past, 3, 'plan', 'study');
    st.paintRange(past, 3, 'exec', 'move');
    st.paintRange(past, 3, 'erasePlan', 'study');
    expect(useStore.getState().intervals.map((iv) => iv.kind)).toEqual(['exec']);
    st.paintRange(past, 3, 'plan', 'study');
    st.paintRange(past, 1, 'eraseExec', 'study');
    const left = useStore.getState().intervals;
    expect(left.find((iv) => iv.kind === 'plan')).toMatchObject({ start: past, end: past + 3 * CELL });
    expect(left.find((iv) => iv.kind === 'exec')).toMatchObject({ start: past + CELL, end: past + 3 * CELL });
  });

  it('메모 지우개는 그 칸의 메모만 지운다', () => {
    const st = useStore.getState();
    st.setCellNote(T0, '이동 중 피곤함');
    st.setCellNote(T0 + CELL, '졸림');
    st.eraseNotes(T0, 1);
    expect(useStore.getState().cellNotes).toEqual([{ at: T0 + CELL, text: '졸림' }]);
  });
});

describe('계획 세 종류', () => {
  it('몇 시~몇 시 계획은 격자에도 계획으로 칠해진다', () => {
    useStore.getState().addTodo('세미나', T0 - 9 * HOUR, { type: 'range', start: T0 + 5 * HOUR, end: T0 + 6 * HOUR, activityId: 'class' });
    const s = useStore.getState();
    expect(s.todos[0]).toMatchObject({ text: '세미나', type: 'range' });
    expect(s.intervals).toHaveLength(1);
    expect(s.intervals[0]).toMatchObject({ kind: 'plan', activityId: 'class', start: T0 + 5 * HOUR, end: T0 + 6 * HOUR });
  });

  it('매일 몇 시간 목표는 기록을 만들지 않는다', () => {
    useStore.getState().addTodo('논문 매일 2시간', null, { type: 'hours', minutes: 120, activityId: 'paper' });
    expect(useStore.getState().intervals).toHaveLength(0);
    expect(useStore.getState().todos[0].minutes).toBe(120);
  });
});

describe('타이머와 뽀모도로', () => {
  it('타이머는 시간이 되어도 기록을 끊지 않고 알리기만 한다', () => {
    const st = useStore.getState();
    st.startTimer('timer', 'study', 25);
    vi.setSystemTime(T0 + 26 * MIN);
    useStore.getState().tickTimer(Date.now());
    const s = useStore.getState();
    expect(s.timer?.phase).toBe('over');
    expect(s.intervals.filter((iv) => iv.end === null)).toHaveLength(1);
  });

  it('뽀모도로는 집중이 끝난 정확한 시각에 기록을 닫고 쉬었다가, 눌러야 다음 집중이 시작된다', () => {
    useStore.getState().startTimer('pomo', 'study', 25);
    // 앱을 한참 뒤에 다시 열었다.
    vi.setSystemTime(T0 + 40 * MIN);
    useStore.getState().tickTimer(Date.now());
    let s = useStore.getState();
    expect(s.timer?.phase).toBe('break');
    expect(s.intervals[0]).toMatchObject({ start: T0, end: T0 + 25 * MIN });
    useStore.getState().tickTimer(Date.now());
    s = useStore.getState();
    expect(s.timer?.phase).toBe('ready');
    expect(s.intervals.filter((iv) => iv.end === null)).toHaveLength(0);
    useStore.getState().nextPomo();
    s = useStore.getState();
    expect(s.timer).toMatchObject({ phase: 'focus', round: 2, phaseStart: T0 + 40 * MIN });
    expect(s.intervals.filter((iv) => iv.end === null)).toHaveLength(1);
  });

  it('직접 끝내면 타이머도 같이 끝난다', () => {
    useStore.getState().startTimer('pomo', 'study', 25);
    vi.setSystemTime(T0 + 5 * MIN);
    useStore.getState().endActivity('study');
    useStore.getState().tickTimer(Date.now());
    expect(useStore.getState().timer).toBeNull();
  });
});
