import { describe, expect, it } from 'vitest';
import { HOUR, MIN, addDays } from './time';
import { busyOf, fixedBusy, focusFor, pack, looksLikeWeekRequest, weekDays, ymd, type Busy } from './weekplan';
import type { Todo } from './types';

const today = new Date(2026, 10, 18).getTime(); // 수
const now = today + 9 * HOUR;
const d = (i: number, h: number, m = 0) => addDays(today, i) + h * HOUR + m * MIN;

const busy: Busy[] = [
  { start: d(1, 10), end: d(1, 11, 30), text: '기초미적분학' }, // 목
  { start: d(1, 13), end: d(1, 15), text: '글쓰기' },
  { start: d(1, 18), end: d(1, 20), text: '초잉 과외' },
  { start: d(5, 10), end: d(5, 11, 30), text: '기초미적분학' }, // 월
  { start: d(5, 13), end: d(5, 15), text: '데과인' },
  { start: d(5, 14), end: d(5, 16), text: '민아 과외' },
];

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

describe('한 주 짜기 배치', () => {
  const draft = pack(
    [
      { text: '화정이 과외 자료 마무리', minutes: 0, chunk: 0, on: ymd(addDays(today, 1)) },
      { text: '카카오 명의변경', minutes: 0, chunk: 0, on: ymd(addDays(today, 1)) },
      { text: '미적분 복습', minutes: 0, chunk: 120, after: '미적분' },
      { text: '학술제 자료조사', minutes: 240, chunk: 0 },
    ],
    [],
    busy,
    { today, now },
  );

  it('수업마다 그 뒤 빈 시간에 복습을 붙인다', () => {
    const rev = draft.blocks.filter((b) => b.text === '미적분 복습');
    expect(rev).toHaveLength(2);
    // 목: 수업 뒤 11:40~12:50은 70분뿐이라 글쓰기가 끝난 15:10부터
    expect(rev[0].start).toBe(d(1, 15, 10));
    expect(rev[0].end - rev[0].start).toBe(120 * MIN);
    // 월요일은 11:40~13:00 사이가 80분뿐이라 데과인·과외가 끝난 뒤로 간다
    expect(rev[1].start).toBe(d(5, 16, 10));
  });

  it('시간 없는 자잘한 일은 그날 할 일로 둔다', () => {
    expect(draft.loose.map((l) => l.text)).toEqual(['화정이 과외 자료 마무리', '카카오 명의변경']);
    expect(draft.loose.every((l) => l.day === addDays(today, 1))).toBe(true);
  });

  it('긴 일은 90분 이하로 나눠 여러 날에 고르게 넣는다', () => {
    const r = draft.blocks.filter((b) => b.text === '학술제 자료조사');
    const total = r.reduce((s, b) => s + b.end - b.start, 0);
    expect(total).toBe(240 * MIN);
    expect(r.every((b) => b.end - b.start <= 90 * MIN)).toBe(true);
    expect(new Set(r.map((b) => new Date(b.start).getDate())).size).toBe(r.length);
  });

  it('기존 일정이나 서로와 겹치지 않고, 지금보다 뒤에 넣는다', () => {
    for (const b of draft.blocks) {
      expect(b.start).toBeGreaterThan(now);
      expect(busy.some((x) => overlaps(x, b))).toBe(false);
      expect(draft.blocks.some((o) => o !== b && overlaps(o, b))).toBe(false);
    }
    expect(draft.left).toEqual([]);
  });

  it('이미 잡힌 일정끼리 겹치면 알려 준다', () => {
    expect(draft.clashes).toEqual([{ a: '데과인', b: '민아 과외', start: d(5, 14), end: d(5, 15) }]);
  });

  it('새로 말한 약속은 그 시각 그대로, 할 일은 그 약속을 피한다', () => {
    const out = pack([{ text: '빨래', minutes: 60, chunk: 0, on: ymd(today) }], [{ text: '치과', date: ymd(today), start: '09:20', end: '11:00' }], [], { today, now });
    expect(out.blocks[0]).toMatchObject({ text: '치과', start: d(0, 9, 20), end: d(0, 11), fixed: true });
    expect(out.blocks[1]).toMatchObject({ text: '빨래', start: d(0, 11, 10), end: d(0, 12, 10) });
  });

  it('수업마다 붙이고 남는 시간은 첫 수업 뒤부터 채운다', () => {
    const out = pack([{ text: '미적분 복습', minutes: 360, chunk: 120, after: '미적분' }], [], busy, { today, now });
    const rev = out.blocks.filter((b) => b.text === '미적분 복습');
    expect(rev.reduce((s, b) => s + b.end - b.start, 0)).toBe(360 * MIN);
    expect(rev.every((b) => b.start >= d(1, 11, 30))).toBe(true);
  });

  it('자리가 없으면 못 넣은 것으로 남긴다', () => {
    const full: Busy[] = Array.from({ length: 7 }, (_, i) => ({ start: d(i, 0), end: d(i, 24), text: '꽉' }));
    const out = pack([{ text: '공부', minutes: 120, chunk: 0 }], [], full, { today, now });
    expect(out.blocks).toEqual([]);
    expect(out.left).toEqual([{ text: '공부', minutes: 120 }]);
  });
});

describe('집중 시간과 고정 일정', () => {
  it('집중 잘 되는 시간대에 먼저 넣고, 자리가 없으면 다른 시간에', () => {
    const focus = [{ word: '공부', from: 20, to: 23 }];
    const out = pack([{ text: '미적분 공부', minutes: 180, chunk: 90 }], [], busy, { today, now, focus });
    const b = out.blocks;
    expect(b).toHaveLength(2);
    // 수(오늘) 20:00~21:30, 다음은 목 20:10~21:40 (초잉 과외 18~20시 뒤 쉬는 틈)
    expect(b.map((x) => x.start)).toEqual([d(0, 20), d(1, 20, 10)]);
    expect(focusFor({ text: '빨래' }, focus)).toBeUndefined();
    expect(focusFor({ text: '복습', activity: '공부' }, focus)?.from).toBe(20);
  });

  it('새 시간표를 이번 주 시간으로 펼치고, 기간을 지킨다', () => {
    const fb = fixedBusy(
      [
        { text: '기초미적분학', days: [1, 4], start: '10:00', end: '11:30' },
        { text: '글쓰기', days: [5], start: '13:00', until: ymd(addDays(today, 1)) },
        { text: '영어', days: [3], start: '9:00', end: '10:00', from: ymd(addDays(today, 3)) },
      ],
      today,
    );
    expect(fb.map((b) => [b.text, b.start, b.end])).toEqual([
      ['기초미적분학', d(1, 10), d(1, 11, 30)],
      ['기초미적분학', d(5, 10), d(5, 11, 30)],
    ]);
    expect(fb.every((b) => b.fresh)).toBe(true);
  });
});

describe('한 주 짜기 보조', () => {
  it('오늘부터 7일 라벨', () => {
    expect(weekDays(today)[0]).toBe('2026-11-18 수');
    expect(weekDays(today)[6]).toBe('2026-11-24 화');
  });

  it('시간 정한 계획과 칠한 계획을 이미 잡힌 시간으로 본다', () => {
    const todos = [{ id: 't', text: '면담', due: today, done: false, doneAt: null, createdAt: 0, type: 'range', start: d(0, 15), end: d(0, 16) }] as Todo[];
    const intervals = [
      { id: 'a', activityId: 'study', kind: 'plan' as const, start: d(1, 9), end: d(1, 9, 10), source: 'paint' as const },
      { id: 'b', activityId: 'study', kind: 'plan' as const, start: d(1, 9, 10), end: d(1, 10), source: 'paint' as const },
    ];
    const out = busyOf(todos, intervals, [{ id: 'study', name: '공부' } as never], today);
    expect(out).toEqual([
      { start: d(0, 15), end: d(0, 16), text: '면담' },
      { start: d(1, 9), end: d(1, 10), text: '공부' },
    ]);
  });

  it('긴 일정 부탁을 알아본다', () => {
    const msg =
      '이게 내 이번주 일정이거든?? 우선 내일은 글쓰기와 초잉 사이 빈 시간에는 화정이 과외 자료 제작 마무리와 카카오 명의변경 신청 등 자잘한 업무들을 처리할거고, 강의계획서나 자료들 폴더를 정리할거야. 이것들 포함해서 일정 한번 짜줄래??';
    expect(looksLikeWeekRequest(msg)).toBe(true);
    expect(looksLikeWeekRequest('내일 3시에 치과')).toBe(false);
  });
});
