import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { sanitize } from './src/worker.js';

const env = { GEMINI_API_KEY: 'test-key' };

const post = (body, headers = {}) =>
  new Request('https://moa-api.test/v1/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://localhost', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const geminiSays = (obj, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status });

afterEach(() => vi.unstubAllGlobals());

describe('MOA API 워커', () => {
  it('모델 답을 걸러서 명령만 돌려준다', async () => {
    const fetchMock = vi.fn(async () =>
      geminiSays({
        commands: [
          { type: 'start', activity: '  발레  ', extra: 'x' },
          { type: 'delete_everything' },
          { type: 'backfill', activity: '알바', start: '14:00', end: '25:99' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(post({ text: '발레 하러 간다', activities: ['공부'], now: '10:38' }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(await res.json()).toEqual({
      commands: [
        { type: 'start', activity: '발레' },
        { type: 'backfill', activity: '알바', start: '14:00' },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('gemini-3.5-flash-lite:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
  });

  it('스키마가 거절되면 스키마 없이 한 번 더 묻는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(geminiSays({ commands: [{ type: 'chat', text: '안녕!' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(post({ text: '안녕' }), env);
    expect(await res.json()).toEqual({ commands: [{ type: 'chat', text: '안녕!' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const cfg = (i) => JSON.parse(fetchMock.mock.calls[i][1].body).generationConfig;
    expect(cfg(0).thinkingConfig).toBeUndefined();
    expect(cfg(1).responseSchema).toBeUndefined();
  });

  it('잘못된 요청과 너무 큰 요청을 거절한다', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await worker.fetch(post('not json'), env)).status).toBe(400);
    expect((await worker.fetch(post({ text: '' }), env)).status).toBe(400);
    expect((await worker.fetch(post({ text: 'a'.repeat(5000) }), env)).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('긴 문장은 300자로 잘라 보낸다', async () => {
    const fetchMock = vi.fn(async () => geminiSays({ commands: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await worker.fetch(post({ text: '가'.repeat(900) }), env);
    const sent = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text);
    expect(sent.text).toHaveLength(300);
  });

  it('키가 없으면 503, 한도를 넘으면 429, 모델 오류는 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    expect((await worker.fetch(post({ text: '안녕' }), {})).status).toBe(503);
    const limited = { ...env, LIMITER: { limit: async () => ({ success: false }) } };
    expect((await worker.fetch(post({ text: '안녕' }), limited)).status).toBe(429);
    expect((await worker.fetch(post({ text: '안녕' }), env)).status).toBe(502);
  });

  it('모르는 출처에는 CORS 허용을 주지 않는다', async () => {
    const res = await worker.fetch(
      new Request('https://moa-api.test/v1/parse', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sanitize는 명령을 4개까지만, 긴 글은 잘라서 낸다', () => {
    const out = sanitize({ commands: Array.from({ length: 9 }, () => ({ type: 'memo', text: 'ㅋ'.repeat(999) })) });
    expect(out.commands).toHaveLength(4);
    expect(out.commands[0].text).toHaveLength(300);
    expect(sanitize(null)).toEqual({ commands: [] });
  });
});

describe('한 주 짜기 /v1/week', () => {
  const days = ['2026-11-18 수', '2026-11-19 목', '2026-11-20 금', '2026-11-21 토', '2026-11-22 일', '2026-11-23 월', '2026-11-24 화'];
  const req = (body) =>
    new Request('https://moa-api.test/v1/week', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://localhost' },
      body: JSON.stringify(body),
    });

  it('할 일만 걸러서 돌려주고, 이번 주 밖의 날짜는 버린다', async () => {
    const fetchMock = vi.fn(async () =>
      geminiSays({
        tasks: [
          { text: ' 미적분 복습 ', minutes: 0, chunk: 120, on: '', due: '', after: '미적분', hack: 1 },
          { text: '카카오 명의변경', minutes: 0, chunk: 0, on: '2026-11-19', due: '2027-01-01', after: '' },
          { text: '', minutes: 30 },
          { text: '학술제 자료조사', minutes: -5, chunk: 'x', on: '', due: '', after: '' },
        ],
        events: [{ text: '치과', date: '2026-11-20', start: '15:00', end: '99:00' }, { text: '먼 약속', date: '2027-01-01', start: '10:00' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(req({ text: '이번 주 일정 짜줘 …', days, events: [{ date: '2026-11-19', start: '10:00', end: '11:30', text: '기초미적분학' }] }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tasks: [
        { text: '미적분 복습', minutes: 0, chunk: 120, after: '미적분' },
        { text: '카카오 명의변경', minutes: 0, chunk: 0, on: '2026-11-19' },
        { text: '학술제 자료조사', minutes: 0, chunk: 0 },
      ],
      events: [{ text: '치과', date: '2026-11-20', start: '15:00' }, { text: '먼 약속', date: '2027-01-01', start: '10:00' }],
      fixed: [],
      prefs: [],
    });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(sent.contents[0].parts[0].text).events[0].text).toBe('기초미적분학');
  });

  it('사진을 함께 보내고, 시간표·집중 시간을 걸러 받는다', async () => {
    const fetchMock = vi.fn(async () =>
      geminiSays({
        tasks: [],
        events: [],
        fixed: [
          { text: '기초미적분학', days: [4, 1, 1, 9], start: '10:00', end: '11:30', from: '', until: '2026-12-19', place: '공학관' },
          { text: '요일 없음', days: [], start: '10:00' },
          { text: '끝이 앞', days: [2], start: '13:00', end: '12:00', until: '2030-01-01' },
        ],
        prefs: [{ what: '공부', from: 9, to: 12 }, { what: '이상', from: 20, to: 10 }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(req({ text: '', days, image: { mime: 'image/jpeg', data: 'aGVsbG8=' } }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tasks: [],
      events: [],
      fixed: [
        { text: '기초미적분학', days: [1, 4], start: '10:00', end: '11:30', until: '2026-12-19', place: '공학관' },
        { text: '끝이 앞', days: [2], start: '13:00' },
      ],
      prefs: [{ what: '공부', from: 9, to: 12 }],
    });
    const parts = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts;
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } });
  });

  it('이상한 사진 형식은 버리고, 글도 사진도 없으면 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(req({ text: '', days, image: { mime: 'image/gif', data: 'aGVsbG8=' } }), env);
    expect(res.status).toBe(400);
  });

  it('날짜 목록이 없으면 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(req({ text: '짜줘' }), env);
    expect(res.status).toBe(400);
  });
});
