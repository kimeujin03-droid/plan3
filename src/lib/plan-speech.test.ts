import { describe, expect, it } from 'vitest';
import { toCommands } from './ai';
import { logicalToday } from './day';
import { DEFAULT_ACTIVITIES, SLEEP_ID } from './palette';
import { parse, resolveDayWord } from './parser';
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
    expect(p('이번주 금요일까지인 과제가 있어')).toEqual([{ type: 'todo', text: '과제', due: mon + 4 * DAY, deadline: true }]);
    expect(p('다음 주 화요일까지 보고서 제출')).toEqual([{ type: 'todo', text: '보고서', due: mon + 8 * DAY, deadline: true }]);
  });

  it('내일 저녁 10시에 … → 내일 22:00', () => {
    expect(p('나 내일 저녁 10시에 남친집에감')).toEqual([{ type: 'todo', text: '남친집에 가기', due: mon + DAY, start: mon + DAY + 22 * HOUR, activityId: null, place: '남친집' }]);
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

describe('11/18 새벽에 보낸 문장들', () => {
  // 11/18 01:17, 아직 안 잠 → 오늘은 11/17, 내일은 11/18
  const tue = mon + DAY;
  const at = tue + DAY + HOUR + 17 * MIN;
  const q = (text: string) => parse(text, acts, at, logicalToday(at, []));

  it('내일 알바가 9시부터 5시까지 있어 → 11/18 09:00–17:00 알바 계획', () => {
    expect(q('내일 알바가 9시부터 5시까지 있어')).toEqual([
      { type: 'todo', text: '알바', due: tue + DAY, start: tue + DAY + 9 * HOUR, end: tue + DAY + 17 * HOUR, activityId: 'job' },
    ]);
  });

  it('내일 공부를 2시간 해볼까 → "공부 2시간"', () => {
    expect(q('내일 공부를 2시간 해볼까')).toEqual([{ type: 'todo', text: '공부 2시간', due: tue + DAY, activityId: 'study' }]);
  });

  it('내일 아침 9시에 일어날거여 → 09:00 "일어나기"', () => {
    expect(q('내일 아침 9시에 일어날거여')).toEqual([{ type: 'todo', text: '일어나기', due: tue + DAY, start: tue + DAY + 9 * HOUR, activityId: null }]);
  });

  it('내일 오후 10시에 약속있어 → 22:00 "약속"', () => {
    expect(q('내일 오후 10시에 약속있어')).toEqual([{ type: 'todo', text: '약속', due: tue + DAY, start: tue + DAY + 22 * HOUR, activityId: null }]);
  });

  it('말끝 정리', () => {
    expect(q('내일 도서관 갈거야')[0]).toMatchObject({ text: '도서관 가기' });
    expect(q('내일 밥 먹을 거야')[0]).toMatchObject({ text: '밥 먹기' });
    expect(q('내일 3시부터 5시까지 과제하려고')[0]).toMatchObject({ text: '과제', activityId: 'hw' });
  });

  it('"내일 … 부터 … 까지"는 절대 지난 기록으로 들어가지 않는다', () => {
    expect(q('내일 9시부터 5시까지 그거').every((c) => c.type !== 'backfill')).toBe(true);
  });
});

describe('마감 시각', () => {
  it('"금요일 6시까지 제출" → 금요일 18:00 마감', () => {
    expect(p('금요일 6시까지 수치해석 과제 제출')).toEqual([{ type: 'todo', text: '수치해석 과제', due: mon + 4 * DAY, deadline: true, dueAt: mon + 4 * DAY + 18 * HOUR }]);
    expect(p('금요일까지 오후 11시 59분에 레포트 내기')[0]).toMatchObject({ deadline: true, dueAt: mon + 4 * DAY + 23 * HOUR + 59 * MIN, text: '레포트' });
  });
  it('"3시부터 5시까지"는 마감이 아니라 시간 계획', () => {
    expect(p('수요일 3시부터 5시까지 회의')[0]).toMatchObject({ start: mon + 2 * DAY + 15 * HOUR, end: mon + 2 * DAY + 17 * HOUR });
  });
  it('날짜 말 하나를 그날로', () => {
    expect(resolveDayWord('내일', mon)).toBe(mon + DAY);
    expect(resolveDayWord('다음 주 화요일', mon)).toBe(mon + 8 * DAY);
    expect(resolveDayWord('주말', mon)).toBeNull();
  });
});

describe('장소', () => {
  it('"~에서"와 "~ 가기"에서 장소를 뽑는다', () => {
    expect(p('토요일 2시에 다이소에서 수납함 사기 할거야')[0]).toMatchObject({ text: '수납함 사기', place: '다이소', start: mon + 5 * DAY + 14 * HOUR });
    expect(p('내일 9시에 학교 가야 돼')[0]).toMatchObject({ place: '학교', start: mon + DAY + 9 * HOUR });
    expect(p('내일 도서관에서 공부 3시부터 6시까지')[0]).toMatchObject({ text: '공부', place: '도서관', activityId: 'study' });
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
    expect(parse('오늘까지 과제 제출', acts, tue3am, today)).toEqual([{ type: 'todo', text: '과제', due: mon, deadline: true }]);
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

describe('반복과 매일 목표', () => {
  it('매주 화목 9시부터 12시까지 수업 → 화·목 09:00–12:00 반복', () => {
    expect(p('매주 화목 9시부터 12시까지 수업')).toEqual([{ type: 'series', text: '수업', days: [2, 4], startMin: 540, endMin: 720, activityId: 'class' }]);
  });
  it('평일 9시~6시 알바, 매일 7시에 기상', () => {
    expect(p('평일 9시부터 6시까지 알바')[0]).toMatchObject({ type: 'series', days: [1, 2, 3, 4, 5], startMin: 540, endMin: 1080, activityId: 'job' });
    expect(p('매일 아침 7시에 기상')[0]).toMatchObject({ type: 'series', days: [0, 1, 2, 3, 4, 5, 6], startMin: 420, endMin: null, text: '기상' });
  });
  it('매일 2시간 공부 → 매일 목표', () => {
    expect(p('매일 2시간 공부')).toEqual([{ type: 'todo', text: '공부 매일 2시간', due: null, minutes: 120, activityId: 'study' }]);
  });
});

describe('양을 정한 앞으로의 말은 오늘 계획', () => {
  const acts = [{ id: 'study', name: '공부', color: '#fff' }] as never;
  const now = new Date(2026, 10, 20, 16, 28).getTime();
  const today = new Date(2026, 10, 20).getTime();
  it.each([
    ['오늘 통계수학 공부 3시간 한다고', '통계수학 공부 3시간'],
    ['통계수학 공부 3시간 하자', '통계수학 공부 3시간'],
    ['한 3시간만 공부 하자', '공부 3시간'],
  ])('%s', (text, want) => {
    const cmds = parse(text, acts, now, today);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'todo', text: want, due: today });
  });
  it('그냥 시작은 그대로 시작', () => {
    expect(parse('공부 시작', acts, now, today)[0].type).toBe('start');
  });
});

describe('이어진 두 일은 나눠서', () => {
  const now = new Date(2026, 10, 20, 19, 0).getTime();
  const today = new Date(2026, 10, 20).getTime();
  const tomorrow = new Date(2026, 10, 21).getTime();
  const at = (h: number, m = 0) => tomorrow + (h * 60 + m) * 60_000;
  it('과외는 내일 11~14시(온라인), 이동은 내일 10시 반까지', () => {
    const cmds = parse('내일 11시부터 2시까지 민아과외 온라인으로 하고 그러려고 10시반까지 이동', DEFAULT_ACTIVITIES, now, today);
    expect(cmds).toEqual([
      { type: 'todo', text: '민아과외', due: tomorrow, start: at(11), end: at(14), activityId: null, place: '온라인' },
      expect.objectContaining({ type: 'todo', text: '이동', due: tomorrow, deadline: true, dueAt: at(10, 30) }),
    ]);
  });
});

describe('"오늘 ~하기/사기"는 오늘 할 일', () => {
  it('오늘 납땜 기기 사기', () => {
    const now = new Date(2026, 10, 20, 19, 0).getTime();
    const today = new Date(2026, 10, 20).getTime();
    expect(parse('오늘 납땜 기기 사기', DEFAULT_ACTIVITIES, now, today)[0]).toMatchObject({ type: 'todo', text: '납땜 기기 사기', due: today });
  });
});
