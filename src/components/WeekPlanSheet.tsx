import { useMemo, useRef, useState } from 'react';
import { DEFAULT_API } from '../lib/ai';
import { logicalToday } from '../lib/day';
import { readCalendarFile, parseIcs } from '../lib/ics';
import { DAY, addDays, dayStart, fmtHM } from '../lib/time';
import { aiWeek, busyOf, pack, type Draft } from '../lib/weekplan';
import { useStore } from '../store';

const DOW = '일월화수목금토';
const dayLabel = (d: number) => `${new Date(d).getMonth() + 1}/${new Date(d).getDate()} ${DOW[new Date(d).getDay()]}`;
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

const HOURS_KEY = 'moa-week-hours';
function loadHours(): [number, number] {
  try {
    const v = JSON.parse(localStorage.getItem(HOURS_KEY) ?? 'null');
    if (Array.isArray(v) && v.length === 2) return [Number(v[0]) || 9, Number(v[1]) || 23];
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return [9, 23];
}

/** 캘린더 파일 불러오기 버튼. 오늘부터 8주 치를 계획으로 넣는다. */
export function CalendarImport({ today, onDone }: { today: number; onDone?: (msg: string) => void }) {
  const addPlans = useStore((s) => s.addPlans);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className="pill" style={{ background: 'var(--bg)' }} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? '읽는 중…' : '📅 캘린더 불러오기'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".ics,.zip,text/calendar,application/zip"
        aria-label="캘린더 파일"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const texts = await readCalendarFile(file);
            let allDay = 0;
            const items = texts.flatMap((t) => {
              const r = parseIcs(t, today, addDays(today, 56));
              allDay += r.allDay;
              return r.events.map((ev) => ({
                text: ev.text,
                due: dayStart(ev.start),
                extra: { type: 'range' as const, start: ev.start, end: ev.end, place: ev.place, ext: ev.ext },
              }));
            });
            if (!items.length) {
              onDone?.('불러올 시간 일정이 없었어. (.ics 파일인지 확인해 줘)');
            } else {
              addPlans(items, '캘린더 일정 {n}개 불러왔어');
              onDone?.(`앞으로 8주 일정을 넣었어.${allDay ? ` 종일 일정 ${allDay}개는 뺐어.` : ''} 같은 파일을 다시 골라도 겹쳐 들어가지 않아.`);
            }
          } catch {
            onDone?.('파일을 못 읽었어. .ics나 구글 캘린더 내보내기 .zip을 골라 줘.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/**
 * 한 주 짜기: 이번 주 할 일을 길게 적으면 AI가 할 일만 뽑고, 앱이 빈 시간에 나눠 넣은 초안을 보여 준다.
 * 초안에서 빼거나 시각을 고친 뒤 '계획에 넣기'를 눌러야 실제 계획이 된다.
 */
export function WeekPlanSheet({ initialText = '', onClose }: { initialText?: string; onClose: () => void }) {
  const intervals = useStore((s) => s.intervals);
  const todos = useStore((s) => s.todos);
  const activities = useStore((s) => s.activities);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const apiOverride = useStore((s) => s.apiOverride);
  const addPlans = useStore((s) => s.addPlans);
  const [clock] = useState(() => Date.now());
  const today = logicalToday(clock, intervals);
  const busy = useMemo(() => busyOf(todos, intervals, activities, today), [todos, intervals, activities, today]);

  const [text, setText] = useState(initialText);
  const [hours, setHours] = useState<[number, number]>(loadHours);
  const [phase, setPhase] = useState<'write' | 'thinking' | 'draft'>('write');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());

  const saveHours = (h: [number, number]) => {
    setHours(h);
    try {
      localStorage.setItem(HOURS_KEY, JSON.stringify(h));
    } catch {
      /* 무시 */
    }
  };

  const run = async () => {
    setError('');
    const api = apiOverride || DEFAULT_API;
    if (!ai) {
      setError('AI 해석이 꺼져 있어. 켜야 긴 글을 나눌 수 있어.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('인터넷이 안 돼서 지금은 못 짜. 연결되면 다시 눌러 줘.');
      return;
    }
    setPhase('thinking');
    const got = await aiWeek(api, text, today, busy, activities);
    if (!got || (!got.tasks.length && !got.events.length)) {
      setPhase('write');
      setError(got ? '할 일을 못 찾았어. "무엇을, 얼마나, 언제까지"를 넣어 다시 적어 줄래?' : '서버가 답을 안 줘. 잠시 뒤에 다시 눌러 줘.');
      return;
    }
    setDraft(pack(got.tasks, got.events, busy, { today, now: Date.now(), open: hours[0], close: hours[1], activities }));
    setOff(new Set());
    setPhase('draft');
  };

  const toggle = (key: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const [editing, setEditing] = useState<string | null>(null);
  /** 블록을 30분씩 옮기거나(shift) 끝을 늘리고 줄인다(stretch). 날을 넘기지 않고, 30분보다 짧아지지 않는다. */
  const nudge = (key: string, what: 'shift' | 'stretch', min: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b) => {
        if (b.key !== key) return b;
        const day = dayStart(b.start);
        const d = min * 60_000;
        if (what === 'shift') {
          const s = Math.min(Math.max(b.start + d, day), day + DAY - (b.end - b.start));
          return { ...b, start: s, end: s + (b.end - b.start) };
        }
        return { ...b, end: Math.min(Math.max(b.end + d, b.start + 30 * 60_000), day + DAY + 2 * 3600_000) };
      }),
    });
  };

  const kept = draft ? draft.blocks.filter((b) => !off.has(b.key)).length + draft.loose.filter((l) => !off.has(l.key)).length : 0;

  const commit = () => {
    if (!draft) return;
    const items = [
      ...draft.blocks
        .filter((b) => !off.has(b.key))
        .map((b) => ({ text: b.text, due: dayStart(b.start), extra: { type: 'range' as const, start: b.start, end: b.end, activityId: b.activityId, place: b.place } })),
      ...draft.loose.filter((l) => !off.has(l.key)).map((l) => ({ text: l.text, due: l.day, extra: { type: 'due' as const, place: l.place } })),
    ];
    addPlans(items, '이번 주 계획 {n}개 넣었어');
    onClose();
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet range-sheet week-sheet" role="dialog" aria-modal="true" aria-label="한 주 짜기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            한 주 짜기
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="hint">
          {dayLabel(today)} ~ {dayLabel(addDays(today, 6))} · 이미 잡힌 일정 {busy.length}개를 피해서 넣어
        </div>

        {phase !== 'draft' && (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <CalendarImport today={today} onDone={setNote} />
              <span className="hint">구글 캘린더 웹 › 설정 › 내보내기로 받은 파일</span>
            </div>
            {note && <div className="hint" style={{ color: 'var(--ink)' }}>{note}</div>}
            <textarea
              className="field memo-text"
              aria-label="이번 주 할 일"
              rows={7}
              maxLength={1500}
              placeholder={'이번 주에 할 일을 편하게 길게 적어 줘.\n예: 내일은 글쓰기 끝나고 과외 자료 마무리랑 카카오 명의변경. 미적분 수업마다 복습 2시간. 학술제 자료조사 3-4시간.'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase === 'thinking'}
            />
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="sub" style={{ fontSize: 13 }}>
                하루 쓸 시간
              </span>
              <select className="field wk-sel" aria-label="시작 시각" value={hours[0]} onChange={(e) => saveHours([Number(e.target.value), hours[1]])}>
                {[6, 7, 8, 9, 10, 11, 12, 13].map((h) => (
                  <option key={h} value={h}>
                    {h}시부터
                  </option>
                ))}
              </select>
              <select className="field wk-sel" aria-label="끝 시각" value={hours[1]} onChange={(e) => saveHours([hours[0], Number(e.target.value)])}>
                {[18, 19, 20, 21, 22, 23, 24, 25, 26].map((h) => (
                  <option key={h} value={h}>
                    {h > 24 ? `새벽 ${h - 24}시` : `${h}시`}까지
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <div className="wk-warn">
                {error}
                {!ai && (
                  <button className="pill ink" style={{ marginLeft: 8, minHeight: 30 }} onClick={() => { setAi(true); setError(''); }}>
                    AI 켜기
                  </button>
                )}
              </div>
            )}
            <button className="big-btn ink" disabled={!text.trim() || phase === 'thinking'} onClick={() => void run()}>
              {phase === 'thinking' ? '모아가 나눠 보는 중…' : '짜 보기'}
            </button>
            <div className="hint">적은 글과 이번 주 일정의 이름·시각만 AI로 보내. 시간 배치는 폰에서 해.</div>
          </>
        )}

        {phase === 'draft' && draft && (
          <>
            {draft.clashes.map((c, i) => (
              <div key={i} className="wk-warn">
                ⚠ {dayLabel(dayStart(c.start))} {fmtHM(c.start)}–{fmtHM(c.end)} <b>{c.a}</b>랑 <b>{c.b}</b>가 겹쳐
              </div>
            ))}
            {draft.left.length > 0 && (
              <div className="wk-warn">
                자리가 없어서 못 넣었어: {draft.left.map((l) => `${l.text} ${l.minutes}분`).join(', ')}
                <div className="hint">하루 쓸 시간을 늘리거나, 아래에서 몇 개를 빼고 다시 짜 봐.</div>
              </div>
            )}
            <div className="wk-days">
              {days.map((d) => {
                const rows = [
                  ...busy.filter((b) => dayStart(b.start) === d).map((b) => ({ kind: 'busy' as const, start: b.start, end: b.end, text: b.text, key: `b${b.start}${b.text}` })),
                  ...draft.blocks.filter((b) => dayStart(b.start) === d).map((b) => ({ kind: b.fixed ? ('fixed' as const) : ('new' as const), start: b.start, end: b.end, text: b.text, key: b.key })),
                ].sort((a, b) => a.start - b.start);
                const loose = draft.loose.filter((l) => l.day === d);
                if (!rows.length && !loose.length) return null;
                return (
                  <div key={d} className="wk-day">
                    <div className="wk-head">{dayLabel(d)}</div>
                    {rows.map((r) =>
                      r.kind === 'busy' ? (
                        <div key={r.key} className="wk-row busy">
                          <span className="wk-time">
                            {fmtHM(r.start)}–{fmtHM(r.end)}
                          </span>
                          <span className="grow">{r.text}</span>
                        </div>
                      ) : (
                        <div key={r.key} className={`wk-row new${off.has(r.key) ? ' off' : ''}`}>
                          <input type="checkbox" aria-label={`${r.text} 넣기`} checked={!off.has(r.key)} onChange={() => toggle(r.key)} />
                          <button
                            type="button"
                            className="wk-time wk-tbtn"
                            aria-label={`${r.text} 시간 고치기`}
                            aria-expanded={editing === r.key}
                            onClick={() => setEditing(editing === r.key ? null : r.key)}
                          >
                            {hm(r.start)}–{hm(r.end)}
                          </button>
                          <span className="grow wk-text">
                            {r.text}
                            {r.kind === 'fixed' && <span className="wk-tag">약속</span>}
                          </span>
                          {editing === r.key && (
                            <div className="wk-edit">
                              <button type="button" onClick={() => nudge(r.key, 'shift', -30)}>◀ 30분 일찍</button>
                              <button type="button" onClick={() => nudge(r.key, 'shift', 30)}>30분 늦게 ▶</button>
                              <button type="button" onClick={() => nudge(r.key, 'stretch', -30)}>짧게</button>
                              <button type="button" onClick={() => nudge(r.key, 'stretch', 30)}>길게</button>
                            </div>
                          )}
                        </div>
                      ),
                    )}
                    {loose.map((l) => (
                      <div key={l.key} className={`wk-row new${off.has(l.key) ? ' off' : ''}`}>
                        <input type="checkbox" aria-label={`${l.text} 넣기`} checked={!off.has(l.key)} onChange={() => toggle(l.key)} />
                        <span className="wk-time">시간 없이</span>
                        <span className="grow wk-text">{l.text}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="row wk-foot" style={{ gap: 8 }}>
              <button className="pill" style={{ background: 'var(--bg)', minHeight: 52, padding: '0 18px' }} onClick={() => setPhase('write')}>
                다시 쓰기
              </button>
              <button className="big-btn ink grow" disabled={!kept} onClick={commit}>
                계획에 넣기 ({kept})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
