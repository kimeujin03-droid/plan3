import { describe, expect, it } from 'vitest';
import { toCommands } from './ai';
import { logicalToday } from './day';
import { DEFAULT_ACTIVITIES, SLEEP_ID } from './palette';
import { parse } from './parser';
import { DAY, HOUR, MIN } from './time';
import type { Interval } from './types';

const acts = DEFAULT_ACTIVITIES;
// 2026-11-16은 월요일
const mon = new Date(2026, 10, 16).getTime();
const now = mon + 23 * HOUR + 50 * MIN;
const p = (text: string, at = now, today = mon) => parse(text, acts, at, today);

describe('앞날의 일은 계획으로 알아듣는다', () => {
  it('내일 오후 8시부터 10시까지 → 내일 20:00–22:00 계획 (오늘 아침 기록이 아니다)', () => {
    expect(p('나 내일오후 8시부터 10시까지 공부할거야')).toEqual([
      { type: 'todo', text: '공부', due: mon + DAY, start: mon + DAY + 20 * HOUR, end: mon + DAY + 22 * HOUR, activityId: 'study' },
    ]);
  });

  it('"~까지인 …가 있어"는 마감일', () => {
    expect(p('이번주 금요일까지인 과제가 있어')).toEqual([{ type: 'todo', text: '과제', due: mon + 4 * DAY }]);
    expect(p('다음 주 화요일까지 보고서 제출')).toEqual([{ type: 'todo', text: '보고서', due: mon + 8 * DAY }]);
  });

  it('내일 저녁 10시에 … → 내일 22:00', () => {
    expect(p('나 내일 저녁 10시에 남친집에감')).toEqual([{ type: 'todo', text: '남친집에 가기', due: mon + DAY, start: mon + DAY + 22 * HOUR, activityId: null }]);
  });

  it('내일은 2시간 공부 → 내일 날짜의 계획 (2시를 시각으로 읽지 않는다)', () => {
    expect(p('내일은 2시간 공부')).toEqual([{ type: 'todo', text: '공부 2시간', due: mon + DAY, activityId: 'study' }]);
  });

  it('때를 말하지 않은 1~6시는 오후, 끝 시각은 시작을 따라간다', () => {
    expect(p('모레 3시에 면담 있어')[0]).toMatchObject({ start: mon + 2 * DAY + 15 * HOUR });
    expect(p('내일 아침 9시부터 11시 반까지 수업')[0]).toMatchObject({ start: mon + DAY + 9 * HOUR, end: mon + DAY + 11.5 * HOUR, activityId: 'class' });
  });

  it('지난 일은 여전히 기록이다', () => {
    const noon = mon + 12 * HOUR;
    expect(p('오늘 9시부터 10시 반까지 공부했어', noon)).toEqual([{ type: 'backfill', name: '공부', activityId: 'study', start: mon + 9 * HOUR, end: mon + 10.5 * HOUR }]);
    expect(p('오후 2시부터 4시까지 알바했어', mon + 18 * HOUR)[0]).toMatchObject({ type: 'backfill', start: mon + 14 * HOUR, end: mon + 16 * HOUR });
  });

  it('날짜만 있고 하겠다는 말이 없으면 지어내지 않는다', () => {
    expect(p('내일 발표라 긴장돼')[0].type).toBe('memo');
    expect(p('내일 장보기 해야지')).toEqual([{ type: 'todo', text: '장보기', due: mon + DAY }]);
  });
});

describe('자기 전까지는 전날이다', () => {
  const tue3am = mon + DAY + 3 * HOUR;
  const sleep = (start: number, end: number | null): Interval => ({ id: 's', activityId: SLEEP_ID, kind: 'exec', start, end, source: 'chat' });

  it('새벽 3시, 아직 안 잤으면 오늘은 어제 날짜', () => {
    expect(logicalToday(tue3am, [])).toBe(mon);
    expect(logicalToday(mon + 10 * HOUR, [])).toBe(mon);
  });

  it('그때 말하는 "내일"은 몇 시간 뒤의 아침', () => {
    const today = logicalToday(tue3am, []);
    expect(parse('내일 9시에 수업 있어', acts, tue3am, today)[0]).toMatchObject({ due: mon + DAY, start: mon + DAY + 9 * HOUR });
    expect(parse('오늘까지 과제 제출', acts, tue3am, today)).toEqual([{ type: 'todo', text: '과제', due: mon }]);
  });

  it('새벽이라도 이미 자고 일어났으면 새 하루', () => {
    expect(logicalToday(tue3am, [sleep(mon + 21 * HOUR, mon + DAY + 2.5 * HOUR)])).toBe(mon + DAY);
    // 20분 졸은 것은 잔 것으로 치지 않는다.
    expect(logicalToday(tue3am, [sleep(mon + DAY + HOUR, mon + DAY + HOUR + 20 * MIN)])).toBe(mon);
  });
});

describe('AI가 돌려준 계획', () => {
  it('날짜와 시각이 맞을 때만 받는다', () => {
    expect(toCommands({ commands: [{ type: 'plan', text: '교수님 면담', date: '2026-11-24', start: '15:00' }] }, acts, now, mon)).toEqual([
      { type: 'todo', text: '교수님 면담', due: mon + 8 * DAY, start: mon + 8 * DAY + 15 * HOUR, activityId: null },
    ]);
    expect(toCommands({ commands: [{ type: 'plan', text: '빨래', date: '2026-11-22' }] }, acts, now, mon)).toEqual([{ type: 'todo', text: '빨래', due: mon + 6 * DAY }]);
    // 지난 날짜는 버린다.
    expect(toCommands({ commands: [{ type: 'plan', text: 'x', date: '2026-11-10' }] }, acts, now, mon)).toEqual([]);
    // 날짜가 빠졌으면 기한 없는 계획으로.
    expect(toCommands({ commands: [{ type: 'plan', text: 'y', date: '내일' }] }, acts, now, mon)).toEqual([{ type: 'todo', text: 'y', due: null }]);
  });
});
