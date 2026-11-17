// 무엇이 느린지 잰다: 지시문 길이 × 응답 형식 강제. 키는 환경 변수에서만 읽는다.
import { RESPONSE_SCHEMA, SYSTEM } from '../src/worker.js';

const KEY = process.env.KEY;
const MODEL = process.env.MODEL || 'gemini-3.5-flash-lite';
const input = JSON.stringify({ text: '금요일 6시까지 레포트 내야 돼', activities: ['공부', '과제'], running: [], now: '14:05', today: '2026-11-16 월' });
const short = SYSTEM.split('\n예시')[0];

async function once(system, schema) {
  const generationConfig = { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' };
  if (schema) generationConfig.responseSchema = RESPONSE_SCHEMA;
  const t = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig }),
  });
  const data = await res.json();
  const u = data.usageMetadata ?? {};
  return `${res.status} ${Date.now() - t}ms in=${u.promptTokenCount} out=${u.candidatesTokenCount} think=${u.thoughtsTokenCount ?? 0} ${(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/\s+/g, '').slice(0, 120)}`;
}

for (const [name, sys, schema] of [
  ['full+schema', SYSTEM, true],
  ['full', SYSTEM, false],
  ['short+schema', short, true],
  ['short', short, false],
]) {
  for (let i = 0; i < 2; i++) console.log(`probe ${name} #${i}: ${await once(sys, schema)}`);
}
