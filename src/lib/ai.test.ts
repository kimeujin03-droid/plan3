import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiParse, toCommands } from './ai';
import { DEFAULT_ACTIVITIES } from './palette';
import { dayStart, HOUR, MIN } from './time';
import { applyCommand, emptyData } from '../store';

const day = dayStart(new Date(2026, 10, 16, 12).getTime());
const now = day + 10 * HOUR + 38 * MIN;
const acts = DEFAULT_ACTIVITIES;

afterEach(() => vi.unstubAllGlobals());

describe('AI 응답 받아들이기', () => {
  it('활동 이름을 기존 활동에 잇고, 모르는 종류는 버린다', () => {
    const cmds = toCommands(
      { commands: [{ type: 'start', activity: '과제' }, { type: 'wipe' }, { type: 'intent', activity: '장보기' }] },
      acts,
      now,
    );
    expect(cmds).toEqual([
      { type: 'start', name: '과제', activityId: 'hw' },
      { type: 'todo', text: '장보기', due: null },
    ]);
  });

  it('지난 시간 채우기는 시각이 맞을 때만, 미래는 받지 않는다', () => {
    const ok = toCommands({ commands: [{ type: 'backfill', activity: '알바', start: '08:00', end: '09:30' }] }, acts, now);
    expect(ok).toEqual([{ type: 'backfill', name: '알바', activityId: 'job', start: day + 8 * HOUR, end: day + 9 * HOUR + 30 * MIN }]);
    const future = toCommands({ commands: [{ type: 'backfill', activity: '알바', start: '14:00', end: '15:00' }] }, acts, now);
    expect(future).toEqual([]);
    const broken = toCommands({ commands: [{ type: 'backfill', activity: '알바', start: '8시', end: '9시' }] }, acts, now);
    expect(broken).toEqual([]);
  });

  it('지금까지 이어지는 구간은 지금에서 자른다', () => {
    const [c] = toCommands({ commands: [{ type: 'backfill', activity: '공부', start: '09:00', end: '12:00' }] }, acts, now);
    expect(c).toMatchObject({ type: 'backfill', end: now });
  });

  it('점수는 범위 안으로 맞춘다', () => {
    expect(toCommands({ commands: [{ type: 'focus', value: 9 }, { type: 'fatigue', value: -3 }] }, acts, now)).toEqual([
      { type: 'focus', value: 5 },
      { type: 'fatigue', value: 0 },
    ]);
  });

  it('잡담 대꾸는 그대로 답이 되고 기록은 남기지 않는다', () => {
    const [c] = toCommands({ commands: [{ type: 'chat', text: '안녕! 오늘도 같이 가자' }] }, acts, now);
    const d = emptyData();
    expect(applyCommand(d, c, now)).toBe('안녕! 오늘도 같이 가자');
    expect(d.notes).toHaveLength(0);
    expect(d.intervals).toHaveLength(0);
  });

  it('이상한 응답은 빈 목록', () => {
    expect(toCommands(null, acts, now)).toEqual([]);
    expect(toCommands({ commands: 'x' }, acts, now)).toEqual([]);
    expect(toCommands({ commands: [null, 3, {}] }, acts, now)).toEqual([]);
  });
});

describe('AI 서버 부르기', () => {
  it('문장, 활동 이름, 시각과 오늘 날짜만 보낸다', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ commands: [{ type: 'sleep' }] })));
    vi.stubGlobal('fetch', fetchMock);
    const cmds = await aiParse('https://api.test', '이제 눈 좀 붙일래', acts, ['과제'], now);
    expect(cmds).toEqual([{ type: 'sleep' }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/parse');
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['activities', 'now', 'running', 'text', 'today']);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2} [일월화수목금토]$/);
    expect(body.now).toBe('10:38');
  });

  it('서버가 실패하거나 주소가 없으면 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    expect(await aiParse('https://api.test', '음', acts, [], now)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await aiParse('https://api.test', '음', acts, [], now)).toBeNull();
    expect(await aiParse('', '음', acts, [], now)).toBeNull();
  });
});
