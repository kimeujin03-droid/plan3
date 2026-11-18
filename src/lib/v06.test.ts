import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyData, percentOf, useStore } from '../store';
import { HOUR, MIN } from './time';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

const T0 = new Date(2026, 10, 18, 20, 0).getTime();
const day = new Date(2026, 10, 18).getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
});

describe('MOA-061/062 진행률 +/−', () => {
  it('한 번에 설정한 만큼, 0~100 안에서만, 바꿀 때마다 이력을 남긴다', () => {
    const st = useStore.getState();
    st.addTodo('논문 초안', null);
    const id = useStore.getState().todos[0].id;
    expect(percentOf(useStore.getState().todos[0])).toBeUndefined();
    st.trackProgress(id, true);
    st.stepProgress(id, 1);
    st.stepProgress(id, 1);
    st.stepProgress(id, 1);
    st.stepProgress(id, -1);
    let t = useStore.getState().todos[0];
    expect(t.percent).toBe(20);
    expect(t.progressLog?.map((l) => [l.from, l.to])).toEqual([[0, 10], [10, 20], [20, 30], [30, 20]]);
    st.setProgressStep(5);
    st.stepProgress(id, -1);
    st.stepProgress(id, -1);
    st.stepProgress(id, -1);
    st.stepProgress(id, -1);
    st.stepProgress(id, -1);
    t = useStore.getState().todos[0];
    expect(t.percent).toBe(0);
  });

  it('100%에서 바로 끝낼지는 설정을 따른다', () => {
    const st = useStore.getState();
    st.addTodo('a', null);
    const id = useStore.getState().todos[0].id;
    st.trackProgress(id, true);
    st.setAutoComplete(false);
    for (let i = 0; i < 10; i++) st.stepProgress(id, 1);
    expect(useStore.getState().todos[0]).toMatchObject({ percent: 100, done: false });
    expect(useStore.getState().lastReply?.text).toMatch(/체크/);
    st.setAutoComplete(true);
    st.stepProgress(id, -1);
    st.stepProgress(id, 1);
    expect(useStore.getState().todos[0]).toMatchObject({ percent: 100, done: true });
  });

  it('예전 10칸 값도 읽는다', () => {
    expect(percentOf({ id: 'x', text: 'x', due: null, done: false, doneAt: null, createdAt: 0, progress: 4 })).toBe(40);
  });
});

describe('MOA-063~070 구간 기록', () => {
  it('구간을 한 일로 칠하고 기억을 따로 붙이며, 그 시간의 다른 활동은 지우지 않는다', () => {
    const st = useStore.getState();
    st.paintRange(day + 16 * HOUR, 3, 'exec', 'study');
    st.ensureLife();
    st.recordRange({ start: day + 16 * HOUR + 7 * MIN, end: day + 17 * HOUR + 43 * MIN, activityId: 'date', asActivity: true, text: '카페에서 케이크', place: '카페', people: '남자친구', mood: 5, photos: [] });
    const s = useStore.getState();
    const exec = s.intervals.filter((iv) => iv.kind === 'exec');
    expect(exec.find((iv) => iv.activityId === 'study')).toMatchObject({ start: day + 16 * HOUR, end: day + 16 * HOUR + 30 * MIN });
    expect(exec.find((iv) => iv.activityId === 'date')).toMatchObject({ start: day + 16 * HOUR + 7 * MIN, end: day + 17 * HOUR + 43 * MIN });
    expect(s.memories).toHaveLength(1);
    expect(s.memories[0]).toMatchObject({ activityId: 'date', text: '카페에서 케이크', place: '카페', people: '남자친구', mood: 5 });
    // 되돌리기 한 번에 둘 다 사라진다
    useStore.getState().undo();
    expect(useStore.getState().memories).toHaveLength(0);
    expect(useStore.getState().intervals.filter((iv) => iv.activityId === 'date')).toHaveLength(0);
  });

  it('글 한 줄만 적어도 기억이 된다(활동을 지어내지 않는다)', () => {
    useStore.getState().recordRange({ start: day + 18 * HOUR, end: day + 19 * HOUR, activityId: null, asActivity: true, text: '친구랑 카페 갔어', photos: [] });
    const s = useStore.getState();
    expect(s.intervals).toHaveLength(0);
    expect(s.memories[0]).toMatchObject({ text: '친구랑 카페 갔어', activityId: null });
    expect(s.memories[0].place).toBeUndefined();
  });

  it('겹치는 계획은 했다고 표시할 수 있고, 계획은 지우지 않는다', () => {
    const st = useStore.getState();
    st.addTodo('데이트', day, { type: 'range', start: day + 15 * HOUR, end: day + 19 * HOUR });
    const id = useStore.getState().todos[0].id;
    st.recordRange({ start: day + 15 * HOUR, end: day + 18 * HOUR, activityId: null, asActivity: false, text: '', photos: [], todoId: id, completeTodo: true });
    expect(useStore.getState().todos[0]).toMatchObject({ text: '데이트', done: true });
  });
});

describe('MOA-067 일상 활동', () => {
  it('한 번만 넣고, 하위 활동으로 데이트·친구·휴식·카페·기타가 생긴다', () => {
    const st = useStore.getState();
    st.ensureLife();
    st.ensureLife();
    const acts = useStore.getState().activities;
    expect(acts.filter((a) => a.id === 'life')).toHaveLength(1);
    expect(acts.filter((a) => a.parentId === 'life').map((a) => a.name)).toEqual(['데이트', '친구', '휴식', '카페', '기타']);
  });
});
