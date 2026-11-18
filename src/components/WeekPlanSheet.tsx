import { useMemo, useRef, useState } from 'react';
import { DEFAULT_API } from '../lib/ai';
import { logicalToday } from '../lib/day';
import { readCalendarFile, parseIcs } from '../lib/ics';
import { shrink } from '../lib/photos';
import { describeSeries } from '../lib/series';
import { DAY, addDays, dayStart, fmtHM } from '../lib/time';
import type { Series } from '../lib/types';
import { aiWeek, busyOf, dayOf, fixedBusy, minOf, pack, ymd, type Draft, type WeekFixed, type WeekPref } from '../lib/weekplan';
import { useStore, type PlanItem } from '../store';

const DOW = '일월화수목금토';
const dayLabel = (d: number) => `${new Date(d).getMonth() + 1}/${new Date(d).getDate()} ${DOW[new Date(d).getDay()]}`;
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
const hourLabel = (h: number) => (h >= 24 ? `새벽 ${h - 24}시` : `${h}시`);
/** 받침이 있으면 '은', 없으면 '는' */
const eunNeun = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? '은' : '는';
};

function load<T>(key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장소를 못 쓰면 이번만 */
  }
}

const HOURS_KEY = 'moa-week-hours';
const PERIOD_KEY = 'moa-fixed-until';

/** 고정 일정 기간의 끝(그날 0시). 저장한 값이 지났으면 16주 뒤 */
function loadPeriod(today: number): number {
  const v = load<string | null>(PERIOD_KEY, null, (x) => typeof x === 'string');
  const d = v ? dayOf(v) : null;
  return d !== null && d >= today ? d : addDays(today, 16 * 7 - 1);
}

/** 기간 끝 고르기: 4·8·16주 또는 날짜 */
function PeriodPicker({ today, value, onChange }: { today: number; value: number; onChange: (d: number) => void }) {
  return (
    <div className="row wk-period" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="sub" style={{ fontSize: 13 }}>
        반복 기간 오늘 ~
      </span>
      <input
        className="field wk-sel"
        type="date"
        aria-label="반복 끝나는 날"
        value={ymd(value)}
        min={ymd(today)}
        onChange={(e) => {
          const d = dayOf(e.target.value);
          if (d !== null && d >= today) onChange(d);
        }}
      />
      {[4, 8, 16].map((w) => (
        <button key={w} type="button" className={`pill wk-chip${value === addDays(today, w * 7 - 1) ? ' on' : ''}`} onClick={() => onChange(addDays(today, w * 7 - 1))}>
          {w}주
        </button>
      ))}
    </div>
  );
}

/** 캘린더 파일 불러오기 버튼. 매주 반복은 기간 있는 고정 일정으로, 나머지는 앞으로 8주 치 계획으로 넣는다. */
export function CalendarImport({ today, until, onDone }: { today: number; until: number; onDone?: (msg: string) => void }) {
  const applyWeek = useStore((s) => s.applyWeek);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className="pill wk-in" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? '읽는 중…' : '📅 캘린더 파일'}
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
            const plans: PlanItem[] = [];
            const series: Omit<Series, 'id' | 'skip' | 'createdAt'>[] = [];
            for (const t of texts) {
              const r = parseIcs(t, today, addDays(today, 56), true);
              allDay += r.allDay;
              for (const ev of r.events) plans.push({ text: ev.text, due: dayStart(ev.start), extra: { type: 'range', start: ev.start, end: ev.end, place: ev.place, ext: ev.ext } });
              for (const w of r.weekly)
                series.push({
                  text: w.text,
                  activityId: null,
                  days: w.days,
                  startMin: w.startMin,
                  endMin: w.endMin,
                  place: w.place,
                  from: w.from,
                  until: Math.min(w.until ?? until, until),
                  ext: w.ext,
                });
            }
            if (!plans.length && !series.length) {
              onDone?.('불러올 시간 일정이 없었어. (.ics 파일인지 확인해 줘)');
            } else {
              applyWeek({ plans, series }, '캘린더에서 {n}개 불러왔어');
              onDone?.(
                `매주 반복 ${series.length}개는 ${dayLabel(until)}까지 고정, 한 번짜리 ${plans.length}개는 앞으로 8주 치를 넣었어.${allDay ? ` 종일 일정 ${allDay}개는 뺐어.` : ''}`,
              );
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

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];
function fixedLabel(f: WeekFixed, periodEnd: number): string {
  const s = minOf(f.start) ?? 0;
  const e = f.end ? minOf(f.end) : null;
  const until = (f.until && dayOf(f.until)) || periodEnd;
  return describeSeries({
    id: '',
    text: f.text,
    activityId: null,
    days: [...f.days].sort((a, b) => DAYS_ORDER.indexOf(a) - DAYS_ORDER.indexOf(b)),
    startMin: s,
    endMin: e,
    skip: [],
    createdAt: 0,
    from: f.from ? dayOf(f.from) ?? undefined : undefined,
    until,
  });
}

/**
 * 한 주 짜기: 글·다른 캘린더에서 복사한 글·시간표 사진을 주면 AI가 할 일, 약속, 매주 고정 일정, 집중 잘 되는 시간을 뽑고,
 * 앱이 빈 시간에 나눠 넣은 초안을 보여 준다. 초안에서 빼거나 시각을 고친 뒤 '넣기'를 눌러야 실제 계획이 된다.
 */
export function WeekPlanSheet({ initialText = '', onClose }: { initialText?: string; onClose: () => void }) {
  const intervals = useStore((s) => s.intervals);
  const todos = useStore((s) => s.todos);
  const activities = useStore((s) => s.activities);
  const focus = useStore((s) => s.focus);
  const removeFocus = useStore((s) => s.removeFocus);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const apiOverride = useStore((s) => s.apiOverride);
  const applyWeek = useStore((s) => s.applyWeek);
  const [clock] = useState(() => Date.now());
  const today = logicalToday(clock, intervals);
  const busy = useMemo(() => busyOf(todos, intervals, activities, today), [todos, intervals, activities, today]);

  const [text, setText] = useState(initialText);
  const [image, setImage] = useState<{ mime: string; data: string; url: string } | null>(null);
  const [hours, setHours] = useState<[number, number]>(() => load(HOURS_KEY, [9, 23] as [number, number], (v) => Array.isArray(v) && v.length === 2));
  const [period, setPeriod] = useState(() => loadPeriod(today));
  const [phase, setPhase] = useState<'write' | 'thinking' | 'draft'>('write');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fixed, setFixed] = useState<WeekFixed[]>([]);
  const [prefs, setPrefs] = useState<WeekPref[]>([]);
  const [fresh, setFresh] = useState<ReturnType<typeof fixedBusy>>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);

  const setHoursSaved = (h: [number, number]) => {
    setHours(h);
    save(HOURS_KEY, h);
  };
  const setPeriodSaved = (d: number) => {
    setPeriod(d);
    save(PERIOD_KEY, ymd(d));
  };

  const run = async () => {
    setError('');
    if (!ai) {
      setError('AI 해석이 꺼져 있어. 켜야 긴 글이나 사진을 나눌 수 있어.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('인터넷이 안 돼서 지금은 못 짜. 연결되면 다시 눌러 줘.');
      return;
    }
    setPhase('thinking');
    const got = await aiWeek(apiOverride || DEFAULT_API, text, today, busy, activities, image ? { mime: image.mime, data: image.data } : undefined);
    if (!got || (!got.tasks.length && !got.events.length && !got.fixed.length && !got.prefs.length)) {
      setPhase('write');
      setError(got ? '아무것도 못 찾았어. "무엇을, 얼마나, 언제"를 넣어 다시 적거나, 사진을 더 크게 찍어 줘.' : '서버가 답을 안 줘. 잠시 뒤에 다시 눌러 줘.');
      return;
    }
    const fb = fixedBusy(got.fixed, today, period);
    const allFocus = [...focus.filter((f) => !got.prefs.some((p) => p.what === f.word)), ...got.prefs.map((p) => ({ word: p.what, from: p.from, to: p.to }))];
    setDraft(pack(got.tasks, got.events, [...busy, ...fb], { today, now: Date.now(), open: hours[0], close: hours[1], activities, focus: allFocus }));
    setFixed(got.fixed);
    setPrefs(got.prefs);
    setFresh(fb);
    setOff(new Set());
    setEditing(null);
    setPhase('draft');
  };

  const toggle = (key: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

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

  const keptFixed = fixed.filter((_, i) => !off.has(`f${i}`));
  const keptPrefs = prefs.filter((_, i) => !off.has(`p${i}`));
  const kept = draft
    ? draft.blocks.filter((b) => !off.has(b.key)).length + draft.loose.filter((l) => !off.has(l.key)).length + keptFixed.length + keptPrefs.length
    : 0;

  const commit = () => {
    if (!draft) return;
    const plans: PlanItem[] = [
      ...draft.blocks
        .filter((b) => !off.has(b.key))
        .map((b) => ({ text: b.text, due: dayStart(b.start), extra: { type: 'range' as const, start: b.start, end: b.end, activityId: b.activityId, place: b.place } })),
      ...draft.loose.filter((l) => !off.has(l.key)).map((l) => ({ text: l.text, due: l.day, extra: { type: 'due' as const, place: l.place } })),
    ];
    const series = keptFixed.map((f) => {
      const s = minOf(f.start) ?? 0;
      return {
        text: f.text,
        activityId: null,
        days: f.days,
        startMin: s,
        endMin: (f.end && minOf(f.end)) || s + 60,
        place: f.place,
        from: f.from ? dayOf(f.from) ?? undefined : undefined,
        until: (f.until && dayOf(f.until)) || period,
      };
    });
    applyWeek({ plans, series, focus: keptPrefs.map((p) => ({ word: p.what, from: p.from, to: p.to })) }, '{n}개 넣었어');
    onClose();
  };

  const pickPhoto = async (file: File) => {
    try {
      const url = await shrink(file, 1600);
      setImage({ mime: 'image/jpeg', data: url.split(',')[1], url });
    } catch {
      setError('사진을 못 열었어. 다른 사진으로 해 볼래?');
    }
  };

  const weekDaysList = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const lastDay = addDays(today, 6);
  const laterBlocks = draft ? draft.blocks.filter((b) => dayStart(b.start) > lastDay) : [];

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
          {dayLabel(today)} ~ {dayLabel(lastDay)} · 이미 잡힌 일정 {busy.length}개를 피해서 넣어
        </div>

        {phase !== 'draft' && (
          <>
            <textarea
              className="field memo-text"
              aria-label="이번 주 할 일"
              rows={7}
              maxLength={3000}
              placeholder={
                '그냥 다 적어 줘. 다른 캘린더에서 복사해 붙여도 돼.\n예: 매주 월목 10시~11시반 미적분 수업, 12월 19일까지. 미적분은 수업마다 복습 2시간. 학술제 자료조사 3-4시간. 공부는 오전에 집중 잘 돼.'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase === 'thinking'}
            />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="pill wk-in" onClick={() => photo.current?.click()} disabled={phase === 'thinking'}>
                📷 시간표 사진
              </button>
              <input
                ref={photo}
                type="file"
                accept="image/*"
                aria-label="시간표 사진"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void pickPhoto(f);
                }}
              />
              <CalendarImport today={today} until={period} onDone={setNote} />
            </div>
            {image && (
              <div className="wk-photo">
                <img src={image.url} alt="고른 사진" />
                <button type="button" className="pill" aria-label="사진 빼기" onClick={() => setImage(null)}>
                  ✕
                </button>
              </div>
            )}
            {note && <div className="hint" style={{ color: 'var(--ink)' }}>{note}</div>}
            <PeriodPicker today={today} value={period} onChange={setPeriodSaved} />
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="sub" style={{ fontSize: 13 }}>
                하루 쓸 시간
              </span>
              <select className="field wk-sel" aria-label="시작 시각" value={hours[0]} onChange={(e) => setHoursSaved([Number(e.target.value), hours[1]])}>
                {[6, 7, 8, 9, 10, 11, 12, 13].map((h) => (
                  <option key={h} value={h}>
                    {h}시부터
                  </option>
                ))}
              </select>
              <select className="field wk-sel" aria-label="끝 시각" value={hours[1]} onChange={(e) => setHoursSaved([hours[0], Number(e.target.value)])}>
                {[18, 19, 20, 21, 22, 23, 24, 25, 26].map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}까지
                  </option>
                ))}
              </select>
            </div>
            {focus.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="sub" style={{ fontSize: 13 }}>
                  집중 잘 되는 시간
                </span>
                {focus.map((f) => (
                  <span key={f.id} className="wk-focus">
                    {f.word} {hourLabel(f.from)}–{hourLabel(f.to)}
                    <button type="button" aria-label={`${f.word} 집중 시간 지우기`} onClick={() => removeFocus(f.id)}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {error && (
              <div className="wk-warn">
                {error}
                {!ai && (
                  <button
                    className="pill ink"
                    style={{ marginLeft: 8, minHeight: 30 }}
                    onClick={() => {
                      setAi(true);
                      setError('');
                    }}
                  >
                    AI 켜기
                  </button>
                )}
              </div>
            )}
            <button className="big-btn ink" disabled={(!text.trim() && !image) || phase === 'thinking'} onClick={() => void run()}>
              {phase === 'thinking' ? (image ? '사진 읽는 중… (조금 걸려)' : '모아가 나눠 보는 중…') : '짜 보기'}
            </button>
            <div className="hint">적은 글·사진과 이번 주 일정의 이름·시각만 AI로 보내. 시간 배치는 폰에서 해.</div>
          </>
        )}

        {phase === 'draft' && draft && (
          <>
            {fixed.length > 0 && (
              <div className="wk-box">
                <div className="wk-head">매주 고정</div>
                {fixed.map((f, i) => (
                  <label key={i} className={`wk-row new${off.has(`f${i}`) ? ' off' : ''}`}>
                    <input type="checkbox" aria-label={`${f.text} 고정`} checked={!off.has(`f${i}`)} onChange={() => toggle(`f${i}`)} />
                    <span className="grow wk-text">
                      <b>{f.text}</b> <span className="sub">{fixedLabel(f, period)}</span>
                      {f.place && <span className="wk-tag">{f.place}</span>}
                    </span>
                  </label>
                ))}
                {fixed.some((f) => !f.until) && <PeriodPicker today={today} value={period} onChange={setPeriodSaved} />}
              </div>
            )}
            {prefs.length > 0 && (
              <div className="wk-box">
                <div className="wk-head">기억할게</div>
                {prefs.map((p, i) => (
                  <label key={i} className={`wk-row new${off.has(`p${i}`) ? ' off' : ''}`}>
                    <input type="checkbox" aria-label={`${p.what} 집중 시간 기억`} checked={!off.has(`p${i}`)} onChange={() => toggle(`p${i}`)} />
                    <span className="grow wk-text">
                      <b>{p.what}</b>
                      {eunNeun(p.what)} {hourLabel(p.from)}–{hourLabel(p.to)}에 먼저 넣을게
                    </span>
                  </label>
                ))}
              </div>
            )}
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
              {weekDaysList.map((d) => {
                const rows = [
                  ...[...busy, ...fresh]
                    .filter((b) => dayStart(b.start) === d)
                    .map((b) => ({ kind: b.fresh ? ('fresh' as const) : ('busy' as const), start: b.start, end: b.end, text: b.text, key: `b${b.start}${b.text}` })),
                  ...draft.blocks
                    .filter((b) => dayStart(b.start) === d)
                    .map((b) => ({ kind: b.fixed ? ('fixed' as const) : ('new' as const), start: b.start, end: b.end, text: b.text, key: b.key })),
                ].sort((a, b) => a.start - b.start);
                const loose = draft.loose.filter((l) => l.day === d);
                if (!rows.length && !loose.length) return null;
                return (
                  <div key={d} className="wk-day">
                    <div className="wk-head">{dayLabel(d)}</div>
                    {rows.map((r) =>
                      r.kind === 'busy' || r.kind === 'fresh' ? (
                        <div key={r.key} className="wk-row busy">
                          <span className="wk-time">
                            {fmtHM(r.start)}–{fmtHM(r.end)}
                          </span>
                          <span className="grow">{r.text}</span>
                          {r.kind === 'fresh' && <span className="wk-tag">고정</span>}
                        </div>
                      ) : (
                        <BlockRow key={r.key} r={r} off={off.has(r.key)} editing={editing === r.key} onToggle={() => toggle(r.key)} onEdit={() => setEditing(editing === r.key ? null : r.key)} nudge={nudge} />
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
              {laterBlocks.length > 0 && (
                <div className="wk-day">
                  <div className="wk-head">그 뒤 약속</div>
                  {laterBlocks.map((b) => (
                    <div key={b.key} className={`wk-row new${off.has(b.key) ? ' off' : ''}`}>
                      <input type="checkbox" aria-label={`${b.text} 넣기`} checked={!off.has(b.key)} onChange={() => toggle(b.key)} />
                      <span className="wk-time">
                        {dayLabel(dayStart(b.start))} {hm(b.start)}
                      </span>
                      <span className="grow wk-text">{b.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="row wk-foot" style={{ gap: 8 }}>
              <button className="pill" style={{ background: 'var(--bg)', minHeight: 52, padding: '0 18px' }} onClick={() => setPhase('write')}>
                다시 쓰기
              </button>
              <button className="big-btn ink grow" disabled={!kept} onClick={commit}>
                넣기 ({kept})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BlockRow({
  r,
  off,
  editing,
  onToggle,
  onEdit,
  nudge,
}: {
  r: { key: string; text: string; start: number; end: number; kind: string };
  off: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  nudge: (key: string, what: 'shift' | 'stretch', min: number) => void;
}) {
  return (
    <div className={`wk-row new${off ? ' off' : ''}`}>
      <input type="checkbox" aria-label={`${r.text} 넣기`} checked={!off} onChange={onToggle} />
      <button type="button" className="wk-time wk-tbtn" aria-label={`${r.text} 시간 고치기`} aria-expanded={editing} onClick={onEdit}>
        {hm(r.start)}–{hm(r.end)}
      </button>
      <span className="grow wk-text">
        {r.text}
        {r.kind === 'fixed' && <span className="wk-tag">약속</span>}
      </span>
      {editing && (
        <div className="wk-edit">
          <button type="button" onClick={() => nudge(r.key, 'shift', -30)}>
            ◀ 30분 일찍
          </button>
          <button type="button" onClick={() => nudge(r.key, 'shift', 30)}>
            30분 늦게 ▶
          </button>
          <button type="button" onClick={() => nudge(r.key, 'stretch', -30)}>
            짧게
          </button>
          <button type="button" onClick={() => nudge(r.key, 'stretch', 30)}>
            길게
          </button>
        </div>
      )}
    </div>
  );
}
