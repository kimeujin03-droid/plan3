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

describe('한 주 짜기 확정(applyWeek)', () => {
  it('고정 일정·계획·집중 시간을 한 번에 넣고, 같은 고정 일정은 다시 만들지 않으며 정한 기간은 그대로 둔다', async () => {
    const { useStore } = await import('../store');
    const { emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
    const now = Date.now();
    const day0 = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
    const until1 = day0 + 30 * 24 * 3600_000;
    const st = useStore.getState();
    st.applyWeek(
      {
        plans: [{ text: '자료조사', due: day0 + 86400_000, extra: { type: 'range', start: day0 + 86400_000 + 20 * 3600_000, end: day0 + 86400_000 + 21 * 3600_000 } }],
        series: [{ text: '미적분', activityId: null, days: [4, 1], startMin: 600, endMin: 690, until: until1 }],
        focus: [{ word: '공부', from: 20, to: 23 }],
      },
      '{n}개 넣었어',
    );
    let s = useStore.getState();
    expect(s.series).toHaveLength(1);
    expect(s.series[0].days).toEqual([1, 4]);
    expect(s.focus.map((f) => f.word)).toEqual(['공부']);
    expect(s.todos.some((t) => t.text === '자료조사')).toBe(true);
    expect(s.lastReply?.text).toBe('2개 넣었어');
    s.applyWeek({ plans: [], series: [{ text: '미적분', activityId: null, days: [1, 4], startMin: 600, endMin: 690, until: until1 + 90 * 86400_000 }] }, '{n}개');
    s = useStore.getState();
    expect(s.series).toHaveLength(1);
    expect(s.series[0].until).toBe(until1);
    s.undo();
    expect(useStore.getState().series).toHaveLength(1);
  });
});

describe('짠 계획 고치기', () => {
  it('시각을 옮기면 격자의 계획 칠도 옮기고, 되돌릴 수 있다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
    const base = Date.now() + 3 * 86400_000;
    const d0 = new Date(base);
    const day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
    const at = (h: number) => day + h * 3600_000;
    const st = useStore.getState();
    st.addTodo('면담', day, { type: 'range', start: at(14), end: at(15), activityId: 'study' });
    const id = useStore.getState().todos[0].id;
    st.updateTodo(id, { start: at(16), end: at(17), text: '교수님 면담', place: '연구실' });
    const s = useStore.getState();
    expect(s.todos[0]).toMatchObject({ text: '교수님 면담', start: at(16), end: at(17), place: '연구실' });
    const plans = s.intervals.filter((iv) => iv.kind === 'plan');
    expect(plans.map((iv) => [iv.start, iv.end])).toEqual([[at(16), at(17)]]);
    s.undo();
    expect(useStore.getState().todos[0].start).toBe(at(14));
  });

  it('매주 반복을 고치면 앞으로의 날들이 새 시각으로 바뀐다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
    const st = useStore.getState();
    st.addSeries({ text: '수업', activityId: null, days: [0, 1, 2, 3, 4, 5, 6], startMin: 23 * 60 + 50, endMin: 24 * 60 - 1 });
    const id = useStore.getState().series[0].id;
    st.updateSeries(id, { startMin: 23 * 60 + 55, days: [0, 1, 2, 3, 4, 5, 6] });
    const s = useStore.getState();
    const future = s.todos.filter((t) => t.seriesId === id);
    expect(future.length).toBeGreaterThan(10);
    expect(future.every((t) => new Date(t.start!).getMinutes() === 55)).toBe(true);
  });
});

describe('시험 기간', () => {
  it('수업 쉬기를 켜면 그 기간의 반복 일정이 빠지고, 지우면 다시 생긴다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
    const st = useStore.getState();
    st.addSeries({ text: '수업', activityId: null, days: [0, 1, 2, 3, 4, 5, 6], startMin: 23 * 60 + 50, endMin: 24 * 60 - 1 });
    const n0 = useStore.getState().todos.length;
    const d0 = new Date();
    const today = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
    const start = today + 3 * 86400_000;
    const end = today + 5 * 86400_000;
    st.savePeriod({ name: '기말고사', start, end, pause: true });
    let s = useStore.getState();
    expect(s.periods).toHaveLength(1);
    expect(s.todos.filter((t) => t.due! >= start && t.due! <= end)).toHaveLength(0);
    expect(s.todos.length).toBe(n0 - 3);
    s.removePeriod(s.periods[0].id);
    s = useStore.getState();
    expect(s.todos.length).toBe(n0);
  });
});

describe('분류 안 되는 말은 한마디로', () => {
  it('활동으로 못 나누는 말은 지금 칸의 한마디가 되고, 빈 시간은 나눠 채울 수 있다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), ai: false, undoData: null, lastReply: null });
    const st = useStore.getState();
    st.say('오늘 하늘이 진짜 예쁘다');
    const s = useStore.getState();
    expect(s.memories).toHaveLength(1);
    expect(s.memories[0].text).toBe('오늘 하늘이 진짜 예쁘다');
    expect(s.memories[0].end - s.memories[0].start).toBe(10 * 60_000);
    const t0 = Date.now() - 5 * 3600_000;
    s.fillGaps([
      { activityId: 'move', start: t0, end: t0 + 3600_000 },
      { activityId: 'study', start: t0 + 3600_000, end: t0 + 2 * 3600_000 },
    ]);
    const ex = useStore.getState().intervals.filter((iv) => iv.kind === 'exec');
    expect(ex.map((iv) => iv.activityId)).toEqual(['move', 'study']);
    useStore.getState().undo();
    expect(useStore.getState().intervals.filter((iv) => iv.kind === 'exec')).toHaveLength(0);
  });
});

describe('일정 고치기(분 단위)', () => {
  it('칠한 한 일의 시각·활동을 분 단위로 고치고, 그 일정의 한마디를 붙였다 떼었다 한다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), undoData: null, lastReply: null });
    const base = Math.floor((Date.now() - 5 * 3600_000) / 600_000) * 600_000;
    const st = useStore.getState();
    st.paintRange(base, 3, 'exec', 'study');
    const id = useStore.getState().intervals[0].id;
    st.editInterval(id, { start: base + 3 * 60_000, end: base + 27 * 60_000, activityId: 'hw', memo: '미적분 3단원' });
    let s = useStore.getState();
    expect(s.intervals[0]).toMatchObject({ start: base + 3 * 60_000, end: base + 27 * 60_000, activityId: 'hw' });
    expect(s.memories).toHaveLength(1);
    expect(s.memories[0]).toMatchObject({ intervalId: id, text: '미적분 3단원', start: base + 3 * 60_000 });
    // 시각을 또 옮기면 한마디도 따라온다
    st.editInterval(id, { end: base + 30 * 60_000 });
    s = useStore.getState();
    expect(s.memories[0].end).toBe(base + 30 * 60_000);
    // 한마디를 비우면 떨어진다
    st.editInterval(id, { memo: '' });
    expect(useStore.getState().memories).toHaveLength(0);
    // 한 일은 지금보다 뒤로 끝날 수 없다
    st.editInterval(id, { end: Date.now() + 3600_000 });
    expect(useStore.getState().intervals[0].end!).toBeLessThanOrEqual(Date.now());
  });

  it('칸의 일부만 차지하면 그만큼만 칠한다', async () => {
    const { frac } = await import('../components/Grid');
    const cs = 1_000_000_000_000 - (1_000_000_000_000 % 600_000);
    const iv = (s: number, e: number) => ({ id: 'x', activityId: 'study', kind: 'exec' as const, start: cs + s * 60_000, end: cs + e * 60_000, source: 'paint' as const });
    expect(frac([iv(3, 7)], 'exec', 'study', cs, cs)).toEqual([0.3, 0.7]);
    expect(frac([iv(-5, 20)], 'exec', 'study', cs, cs)).toEqual([0, 1]);
  });
});

describe('말 고치기(답장·"아니")', () => {
  it('"아니 ~"는 바로 앞의 말이 남긴 것을 걷어 내고 다시 적는다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), ai: false, undoData: null, lastReply: null, raw: [] });
    const st = useStore.getState();
    st.say('공부 시작');
    expect(useStore.getState().intervals.filter((iv) => iv.end === null).map((iv) => iv.activityId)).toEqual(['study']);
    st.say('아니 과제 시작');
    const s = useStore.getState();
    expect(s.intervals.filter((iv) => iv.end === null).map((iv) => iv.activityId)).toEqual(['hw']);
    expect(s.intervals.some((iv) => iv.activityId === 'study')).toBe(false);
    expect(s.raw[0].fixedBy).toBe(s.raw[1].id);
    expect(s.raw[1].fixOf).toBe(s.raw[0].id);
    expect(s.lastReply?.text.startsWith('고쳤어')).toBe(true);
    // 되돌리면 고치기 전으로
    s.undo();
    expect(useStore.getState().intervals.filter((iv) => iv.end === null).map((iv) => iv.activityId)).toEqual(['study']);
  });

  it('답장으로 고른 말을 고친다: 지난 기록의 시간을 옮긴다', async () => {
    const { useStore, emptyData } = await import('../store');
    useStore.setState({ ...emptyData(), ai: false, undoData: null, lastReply: null, raw: [] });
    const st = useStore.getState();
    const d = new Date();
    if (d.getHours() < 15) return; // 오후에만 확인(지난 시간이어야 해서)
    st.say('오늘 8시부터 9시까지 공부했어');
    st.say('오늘 하늘이 예쁘다');
    const first = useStore.getState().raw[0];
    st.say('오늘 13시부터 14시까지 공부했어', { fixOf: first.id });
    const ex = useStore.getState().intervals.filter((iv) => iv.kind === 'exec' && iv.activityId === 'study');
    expect(ex.map((iv) => new Date(iv.start).getHours())).toEqual([13]);
    // 다른 말(한마디)은 그대로
    expect(useStore.getState().memories).toHaveLength(1);
  });
});
