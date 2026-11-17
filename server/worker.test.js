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

  it('설정이 거절되면 생각 설정을 빼고, 그래도 안 되면 스키마까지 빼고 묻는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(geminiSays({ commands: [{ type: 'chat', text: '안녕!' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(post({ text: '안녕' }), env);
    expect(await res.json()).toEqual({ commands: [{ type: 'chat', text: '안녕!' }] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const cfg = (i) => JSON.parse(fetchMock.mock.calls[i][1].body).generationConfig;
    expect(cfg(0).thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(cfg(1).thinkingConfig).toBeUndefined();
    expect(cfg(1).responseSchema).toBeDefined();
    expect(cfg(2).responseSchema).toBeUndefined();
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
