import { describe, expect, it } from 'vitest';
import { findGap } from './gaps';
import { cellInfo, mergeAdd, paintCell, subtract, totalsByActivity, unionMs } from './intervals';
import { childColor, DEFAULT_ACTIVITIES, rootOf } from './palette';
import { parse } from './parser';
import { recordPlanEdit } from './plans';
import { CELL, dayStart, HOUR, MIN } from './time';
import type { Interval } from './types';
import { applyCommand, emptyData } from '../store';

const day = dayStart(new Date(2026, 10, 16, 12).getTime());
const at = (h: number, m = 0) => day + h * HOUR + m * MIN;
const now = at(23);
const acts = DEFAULT_ACTIVITIES;

describe('구간과 격자', () => {
  it('이어 칠한 칸은 하나의 구간으로 합친다', () => {
    let list: Interval[] = [];
    list = paintCell(list, at(13), 'hw', 'exec', now);
    list = paintCell(list, at(13, 10), 'hw', 'exec', now);
    expect(list).toHaveLength(1);
    expect(list[0].end! - list[0].start).toBe(2 * CELL);
  });

  it('한 칸에 실행은 2개까지, 세 번째는 두 번째를 바꾼다', () => {
    let list: Interval[] = [];
    list = paintCell(list, at(12), 'study', 'exec', now);
    list = paintCell(list, at(12), 'paper', 'exec', now);
    list = paintCell(list, at(12), 'move', 'exec', now);
    const info = cellInfo(list, at(12), now);
    expect(info.exec).toHaveLength(2);
    expect(info.exec).toContain('study');
    expect(info.exec).toContain('move');
  });

  it('계획은 칸당 하나로 바뀌고 실행과 따로 남는다', () => {
    let list: Interval[] = [];
    list = paintCell(list, at(10), 'class', 'plan', now);
    list = paintCell(list, at(10), 'hw', 'plan', now);
    list = paintCell(list, at(10), 'class', 'exec', now);
    const info = cellInfo(list, at(10), now);
    expect(info.plan).toBe('hw');
    expect(info.exec).toEqual(['class']);
  });

  it('지우개는 구간 가운데를 잘라 둘로 나눈다', () => {
    let list = mergeAdd([], { activityId: 'hw', kind: 'exec', start: at(13), end: at(14), source: 'paint' });
    list = paintCell(list, at(13, 20), 'hw', 'erase', now);
    expect(list).toHaveLength(2);
    expect(cellInfo(list, at(13, 20), now).exec).toEqual([]);
    expect(cellInfo(list, at(13, 10), now).exec).toEqual(['hw']);
  });

  it('진행 중인 구간도 자를 수 있다', () => {
    const open: Interval = { id: 'a', activityId: 'hw', kind: 'exec', start: at(13), end: null, source: 'timer' };
    const list = subtract([open], at(13, 30), at(13, 40), () => true, now);
    expect(list).toHaveLength(2);
    expect(list.filter((iv) => iv.end === null)).toHaveLength(1);
  });

  it('미래 칸을 지워도 진행 중인 타이머는 그대로다', () => {
    const open: Interval = { id: 'a', activityId: 'hw', kind: 'exec', start: at(13), end: null, source: 'timer' };
    const early = at(13, 5);
    const list = paintCell([open], at(18), 'hw', 'erase', early);
    expect(list).toEqual([open]);
    expect(cellInfo(list, at(18), early).exec).toEqual([]);
  });

  it('지금 칸까지 지우면 타이머는 그 앞에서 닫힌다', () => {
    const open: Interval = { id: 'a', activityId: 'hw', kind: 'exec', start: at(13), end: null, source: 'timer' };
    const list = subtract([open], at(13, 20), at(13, 30), () => true, at(13, 25));
    expect(list).toHaveLength(1);
    expect(list[0].end).toBe(at(13, 20));
  });

  it('60분에 4가지를 겹쳐 해도 경과 시간은 60분', () => {
    let list: Interval[] = [];
    const add = (id: string, s: number, e: number) => {
      list = mergeAdd(list, { activityId: id, kind: 'exec', start: s, end: e, source: 'chat' });
    };
    add('study', at(12), at(12, 25));
    add('move', at(12), at(12, 55));
    add('class', at(12, 15), at(12, 45));
    add('paper', at(12, 10), at(13));
    expect(unionMs(list, day, day + 24 * HOUR, now)).toBe(60 * MIN);
    const sum = Object.values(totalsByActivity(list, day, day + 24 * HOUR, now)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(160 * MIN);
  });

  it('타이머로 잰 12:13 종료 시각을 그대로 보존한다', () => {
    const list = mergeAdd([], { activityId: 'class', kind: 'exec', start: at(10), end: at(12, 13), source: 'timer' });
    expect(list[0].end).toBe(at(12, 13));
    expect(cellInfo(list, at(12, 10), now).exec).toEqual(['class']);
    expect(cellInfo(list, at(12, 20), now).exec).toEqual([]);
  });
});

describe('모아 말 해석', () => {
  it('"논문 써야지"는 시작이 아니라 할 일', () => {
    const cmds = parse('논문 써야지', acts, now);
    expect(cmds).toEqual([{ type: 'todo', text: '논문 쓰기', due: null }]);
  });

  it('"하기 싫어"는 기분만 기록', () => {
    expect(parse('오늘 공부하기 싫어', acts, now).map((c) => c.type)).toEqual(['mood']);
  });

  it('"써야 되는데 하기 싫어"는 의도와 기분 둘 다', () => {
    expect(parse('아 논문 써야 되는데 진짜 하기 싫어', acts, now).map((c) => c.type)).toEqual(['todo', 'mood']);
  });

  it('시작과 끝', () => {
    expect(parse('모아야, 나 지금부터 수치해석 과제 시작할게', acts, now)).toEqual([
      { type: 'start', name: '수치해석 과제', activityId: 'hw' },
    ]);
    expect(parse('수업 끝났어', acts, now)).toEqual([{ type: 'end', activityId: 'class' }]);
    expect(parse('끝', acts, now)).toEqual([{ type: 'end', activityId: null }]);
  });

  it('수면, 기상, 점수', () => {
    expect(parse('나 잘게', acts, now)[0].type).toBe('sleep');
    expect(parse('나 일어남', acts, now)[0].type).toBe('wake');
    expect(parse('지금 집중도 2점', acts, now)).toEqual([{ type: 'focus', value: 2 }]);
    expect(parse('피로도 80', acts, now)).toEqual([{ type: 'fatigue', value: 80 }]);
  });

  it('지난 시간 채우기', () => {
    const [c] = parse('아까 14시부터 15시 반까지 알바 했어', acts, now);
    expect(c).toEqual({ type: 'backfill', name: '알바', activityId: 'job', start: at(14), end: at(15, 30) });
  });

  it('모르는 말은 메모', () => {
    expect(parse('오늘 하늘 예쁘다', acts, now)[0].type).toBe('memo');
  });
});

describe('명령 반영', () => {
  it('세 번째 동시 시작은 받지 않는다', () => {
    const d = emptyData();
    applyCommand(d, { type: 'start', name: '과제', activityId: 'hw' }, at(13));
    applyCommand(d, { type: 'start', name: '논문', activityId: 'paper' }, at(13, 10));
    applyCommand(d, { type: 'start', name: '공부', activityId: 'study' }, at(13, 20));
    expect(d.intervals.filter((iv) => iv.end === null)).toHaveLength(2);
  });

  it('잘게 → 일어남으로 수면 구간이 자정을 넘어 하나로 남는다', () => {
    const d = emptyData();
    applyCommand(d, { type: 'sleep' }, at(23));
    expect(d.sleeping).toBe(true);
    applyCommand(d, { type: 'wake' }, at(31));
    expect(d.sleeping).toBe(false);
    expect(d.intervals).toHaveLength(1);
    expect(d.intervals[0].end! - d.intervals[0].start).toBe(8 * HOUR);
  });

  it('모르는 활동 이름은 새 활동으로 만든다', () => {
    const d = emptyData();
    applyCommand(d, { type: 'start', name: '발레', activityId: null }, at(9));
    expect(d.activities.some((a) => a.name === '발레')).toBe(true);
  });
});

describe('대주제와 하위 활동', () => {
  it('"해야지"는 타이머를 켜지 않고 할 일로 들어간다', () => {
    const d = emptyData();
    applyCommand(d, { type: 'todo', text: '논문 쓰기', due: null }, at(9));
    expect(d.intervals).toHaveLength(0);
    expect(d.todos).toHaveLength(1);
    expect(d.todos[0]).toMatchObject({ text: '논문 쓰기', done: false, due: null });
  });

  it('"~까지"는 기한이 있는 할 일이 된다', () => {
    // 2026-11-16은 월요일
    expect(parse('금요일까지 수치해석 과제 제출', acts, now)).toEqual([{ type: 'todo', text: '수치해석 과제', due: day + 4 * 24 * HOUR }]);
    expect(parse('내일까지 장보기 해야지', acts, now)).toEqual([{ type: 'todo', text: '장보기', due: day + 24 * HOUR }]);
    expect(parse('11월 20일까지 보고서 내기', acts, now)).toEqual([{ type: 'todo', text: '보고서', due: day + 4 * 24 * HOUR }]);
    expect(parse('3일까지 서류', acts, now)).toEqual([{ type: 'todo', text: '서류', due: new Date(2026, 11, 3).getTime() }]);
    expect(parse('모아야 오늘까지 장보기', acts, now)).toEqual([{ type: 'todo', text: '장보기', due: day }]);
    expect(parse('월요일까지 메일', acts, now)).toEqual([{ type: 'todo', text: '메일', due: day }]);
  });

  it('하위 활동 이름으로 말하면 그 하위 활동이 시작된다', () => {
    const acts2 = [...acts, { id: 'sl', name: 'Starlink', color: childColor('#A6D2FF', 0), parentId: 'paper' }];
    expect(parse('Starlink 시작', acts2, now)).toEqual([{ type: 'start', name: 'Starlink', activityId: 'sl' }]);
    expect(rootOf(acts2, 'sl')).toBe('paper');
    expect(rootOf(acts2, 'paper')).toBe('paper');
  });

  it('하위 색은 대주제와 다르고 형제끼리도 다르다', () => {
    const a = childColor('#A6D2FF', 0);
    const b = childColor('#A6D2FF', 1);
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(['#a6d2ff', a, b]).size).toBe(3);
  });
});

describe('빈칸 찾기', () => {
  const add = (list: Interval[], id: string, s: number, e: number) =>
    mergeAdd(list, { activityId: id, kind: 'exec', start: s, end: e, source: 'timer' });

  it('기록이 없는 날은 묻지 않는다', () => {
    expect(findGap([], at(15))).toBeNull();
  });

  it('기록 사이의 빈 시간 중 가장 최근 것을 고른다', () => {
    let list: Interval[] = [];
    list = add(list, 'class', at(9), at(10));
    list = add(list, 'hw', at(11), at(12));
    list = add(list, 'job', at(13, 30), at(14));
    expect(findGap(list, at(14, 5))).toEqual({ start: at(12), end: at(13, 30) });
  });

  it('마지막 기록 뒤로 한참 비었으면 방금 10분은 빼고 묻는다', () => {
    const list = add([], 'class', at(9), at(10));
    expect(findGap(list, at(12))).toEqual({ start: at(10), end: at(11, 50) });
  });

  it('20분보다 짧은 틈과 진행 중인 일은 빈칸이 아니다', () => {
    let list = add([], 'class', at(9), at(10));
    list = add(list, 'hw', at(10, 15), at(11));
    list = [...list, { id: 'x', activityId: 'paper', kind: 'exec', start: at(11), end: null, source: 'timer' }];
    expect(findGap(list, at(13))).toBeNull();
  });
});

describe('계획 버전', () => {
  it('아침 원본을 남기고 한참 뒤 수정은 새 버전으로 쌓는다', () => {
    let list: Interval[] = [];
    list = mergeAdd(list, { activityId: 'paper', kind: 'plan', start: at(14), end: at(16), source: 'paint' });
    let v = recordPlanEdit([], list, day, at(8, 30));
    list = mergeAdd(list, { activityId: 'study', kind: 'plan', start: at(16), end: at(17), source: 'paint' });
    v = recordPlanEdit(v, list, day, at(8, 35));
    expect(v).toHaveLength(1);
    expect(v[0].items).toHaveLength(2);
    list = subtract(list, at(14), at(16), (iv) => iv.activityId === 'paper', now);
    v = recordPlanEdit(v, list, day, at(14, 15));
    expect(v).toHaveLength(2);
    expect(v[0].items.find((i) => i.activityId === 'paper')?.minutes).toBe(120);
    expect(v[1].version).toBe(2);
    expect(v[1].items.find((i) => i.activityId === 'paper')).toBeUndefined();
  });
});
