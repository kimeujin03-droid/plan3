import { useEffect, useRef, useState } from 'react';
import { soft } from '../lib/palette';
import { Chevron } from '../components/common';
import { CategoryChips } from '../components/Pickers';
import { logicalDayEnd, logicalToday } from '../lib/day';
import { totalsByActivity } from '../lib/intervals';
import {
  addDays,
  addMonths,
  DAY,
  dayStart,
  fmtAmPm,
  fmtDayLong,
  fmtDue,
  fmtDur,
  fmtHM,
  fmtLeft,
  fmtMD,
  fmtYM,
  fromDateInput,
  fromDateTimeInput,
  HOUR,
  monthStart,
  weekStart,
} from '../lib/time';
import { aiSteps, DEFAULT_API } from '../lib/ai';
import { describeSeries } from '../lib/series';
import type { Activity, Interval, Series, Todo } from '../lib/types';
import { percentOf, useStore } from '../store';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
type PlanType = 'due' | 'range' | 'hours';
const TYPES: { id: PlanType; name: string; hint: string }[] = [
  { id: 'due', name: '마감', hint: '언제까지 끝내야 하는 것' },
  { id: 'range', name: '몇 시~몇 시', hint: '시간이 정해진 일. 격자에도 계획으로 칠해져' },
  { id: 'hours', name: '매일 몇 시간', hint: '하루에 이만큼은 하고 싶은 것' },
];

export { byUrgency, whenOf, type Urgency } from '../lib/when';
import { byUrgency, whenOf } from '../lib/when';
import { WeekPlanSheet } from '../components/WeekPlanSheet';
import { PeriodBar, periodsOn } from '../components/Periods';

/** 오늘 그 활동(하위 활동 포함)을 실제로 한 시간(ms) */
export function doneToday(todo: Todo, intervals: Interval[], activities: Activity[], today: number): number {
  const now = Date.now();
  const totals = totalsByActivity(intervals, today, logicalDayEnd(today, now), now);
  return activities.filter((a) => a.id === todo.activityId || a.parentId === todo.activityId).reduce((sum, a) => sum + (totals[a.id] ?? 0), 0);
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="pill" style={{ background: 'var(--bg)', minHeight: 36 }} onClick={onClick}>
      지우기
    </button>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 11s3.5-3.3 3.5-6A3.5 3.5 0 0 0 2.5 5c0 2.7 3.5 6 3.5 6z" />
      <circle cx="6" cy="5" r="1.2" />
    </svg>
  );
}

/**
 * 진행률: − [40%] + . 한 번 누르면 설정한 만큼(기본 10%p). 시간이 지났다고 저절로 오르지 않는다.
 * 단계로 쪼갠 일은 단계에서 계산되므로 버튼이 없다.
 */
function Progress({ todo }: { todo: Todo }) {
  const stepProgress = useStore((s) => s.stepProgress);
  const step = useStore((s) => s.progressStep);
  const p = percentOf(todo) ?? 0;
  const fromSteps = !!todo.steps?.length;
  return (
    <div className="progress2">
      {!fromSteps && (
        <button className="pg-btn" aria-label={`${todo.text} 진행률 ${step}% 내리기`} disabled={p <= 0} onClick={() => stepProgress(todo.id, -1)}>
          −
        </button>
      )}
      <div className="pg-bar" role="progressbar" aria-label={`${todo.text} 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
        <i style={{ width: `${p}%` }} />
      </div>
      <span className="pg-num">{p}%</span>
      {!fromSteps && (
        <button className="pg-btn" aria-label={`${todo.text} 진행률 ${step}% 올리기`} disabled={p >= 100} onClick={() => stepProgress(todo.id, 1)}>
          +
        </button>
      )}
    </div>
  );
}

/** "쪼개기": AI가 켜져 있으면 단계를 받아 오고, 아니면 직접 첫 단계를 적게 한다. */
function SplitButton({ todo }: { todo: Todo }) {
  const ai = useStore((s) => s.ai);
  const api = useStore((s) => s.apiOverride) || DEFAULT_API;
  const setSteps = useStore((s) => s.setSteps);
  const addStep = useStore((s) => s.addStep);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  if (manual)
    return (
      <form
        className="row grow"
        style={{ gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          addStep(todo.id, text);
          setText('');
        }}
      >
        <input className="field grow" style={{ minHeight: 36, height: 36 }} aria-label="첫 단계" placeholder="첫 단계 (예: 파일 열기)" maxLength={40} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </form>
    );
  return (
    <button
      className="pill"
      style={{ background: 'var(--moa)', minHeight: 36 }}
      disabled={busy}
      onClick={async () => {
        if (!(ai && api)) {
          setManual(true);
          return;
        }
        setBusy(true);
        const steps = await aiSteps(api, todo.text);
        setBusy(false);
        if (steps) setSteps(todo.id, steps);
        else setManual(true);
      }}
    >
      {busy ? '나누는 중…' : '잘게 쪼개기'}
    </button>
  );
}

/** 쪼갠 단계: 평소엔 다음 단계 하나만, 글자를 눌러 펼치면 전부 */
function Steps({ todo, open }: { todo: Todo; open: boolean }) {
  const toggle = useStore((s) => s.toggleStep);
  const remove = useStore((s) => s.removeStep);
  const add = useStore((s) => s.addStep);
  const [text, setText] = useState('');
  const steps = todo.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  const shown = open ? steps.map((s, i) => ({ s, i })) : next >= 0 ? [{ s: steps[next], i: next }] : [];
  return (
    <div className="steps">
      {shown.map(({ s, i }) => (
        <div key={i} className="step">
          <button className="check small" role="checkbox" aria-checked={s.done} aria-label={`${s.text} ${s.done ? '취소' : '끝냄'}`} onClick={() => toggle(todo.id, i)}>
            {s.done && (
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,7 6,11 12,3" />
              </svg>
            )}
          </button>
          <span className="grow" style={{ textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--sub)' : undefined }}>
            {!open && <em>다음 · </em>}
            {s.text}
          </span>
          {open ? (
            <button className="step-x" aria-label={`${s.text} 지우기`} onClick={() => remove(todo.id, i)}>
              ×
            </button>
          ) : (
            <span className="sub" style={{ fontSize: 11 }}>
              {done}/{steps.length}
            </span>
          )}
        </div>
      ))}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(todo.id, text);
            setText('');
          }}
        >
          <input className="field" style={{ minHeight: 34, height: 34, fontSize: 13 }} aria-label="단계 더하기" placeholder="+ 단계 더하기" maxLength={40} value={text} onChange={(e) => setText(e.target.value)} />
        </form>
      )}
    </div>
  );
}

/** 매일 몇 시간: 체크 대신 오늘 한 만큼 채워지는 막대 */
export function GoalRow({ todo, today }: { todo: Todo; today: number }) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const remove = useStore((s) => s.removeTodo);
  const [open, setOpen] = useState(false);
  const target = (todo.minutes ?? 0) * 60_000;
  const done = doneToday(todo, intervals, activities, today);
  const color = activities.find((a) => a.id === todo.activityId)?.color ?? 'var(--moa)';
  return (
    <div className="goal">
      <div className="row" style={{ gap: 8 }}>
        <button className="grow todo-text" aria-expanded={open} onClick={() => setOpen(!open)}>
          {todo.text}
        </button>
        <div className="tag">
          {fmtDur(done)} / {fmtDur(target)}
        </div>
        {open && <RemoveButton onClick={() => remove(todo.id)} />}
      </div>
      <div className="bar" role="img" aria-label={`오늘 ${fmtDur(done)}, 목표 ${fmtDur(target)}`}>
        <i style={{ width: `${Math.min(100, target ? (done / target) * 100 : 0)}%`, background: color }} />
      </div>
    </div>
  );
}

export function TodoRow({ todo, today, clock }: { todo: Todo; today: number; clock: number }) {
  const toggle = useStore((s) => s.toggleTodo);
  const remove = useStore((s) => s.removeTodo);
  // 지우기는 완료와 헷갈리지 않게, 글자를 눌러 펼쳤을 때만 보인다.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const when = todo.done ? null : whenOf(todo, today, clock);
  // 일정(약속·기상)은 진행도가 의미 없다. 마감과 기한 없는 일에만 10칸을 보여준다.
  // 진행률은 켠 일(또는 단계로 쪼갠 일)에만. 약속·장보기는 체크만으로 충분하다.
  const showProgress = !todo.done && (percentOf(todo) !== undefined || !!todo.steps?.length);
  const canTrack = !todo.done && percentOf(todo) === undefined && !todo.steps?.length && (todo.start === undefined || todo.dueAt !== undefined);
  const trackProgress = useStore((s) => s.trackProgress);
  return (
    <div className={`todo${when ? ` lv-${when.level}` : ''}`}>
      <button className="check" role="checkbox" aria-checked={todo.done} aria-label={`${todo.text} ${todo.done ? '끝냄 취소' : '끝냄'}`} onClick={() => toggle(todo.id)}>
        {todo.done && (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,7 6,11 12,3" />
          </svg>
        )}
      </button>
      <div className="grow todo-body">
        <div className="row" style={{ gap: 6 }}>
          <button className="grow todo-text" aria-expanded={open} style={{ textDecoration: todo.done ? 'line-through' : undefined, color: todo.done ? 'var(--sub)' : undefined }} onClick={() => setOpen(!open)}>
            {todo.text}
          </button>
        </div>
        {open && (
          <div className="row" style={{ gap: 6 }}>
            {!todo.done && !todo.steps?.length && (todo.start === undefined || todo.dueAt !== undefined) && <SplitButton todo={todo} />}
            {canTrack && (
              <button className="pill" style={{ background: 'var(--bg)', minHeight: 36 }} onClick={() => trackProgress(todo.id, true)}>
                진행률
              </button>
            )}
            {!todo.done && (
              <button className="pill" style={{ background: 'var(--bg)', minHeight: 36 }} onClick={() => setEditing(true)}>
                고치기
              </button>
            )}
            <RemoveButton onClick={() => remove(todo.id)} />
          </div>
        )}
        {editing && <EditSheet todo={todo} onClose={() => setEditing(false)} />}
        {(when || todo.place) && (
          <div className="todo-meta">
            {when && <span className={`when ${when.level}`}>{when.text}</span>}
            {todo.place && (
              <span className="place">
                <PinIcon />
                {todo.place}
              </span>
            )}
          </div>
        )}
        {!!todo.steps?.length && <Steps todo={todo} open={open} />}
        {showProgress && <Progress todo={todo} />}
      </div>
    </div>
  );
}

/* ───── 입력 ───── */

/** 글자는 우리가 그리고, 그 위에 투명한 날짜·시간 입력을 덮는다. 좁은 화면에서도 글자가 잘리지 않는다. */
function PickerButton({ label, value, type, onChange, wide }: { label: string; value: string; type: 'date' | 'time' | 'datetime-local'; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={`picker${wide ? ' wide' : ''}`}>
      <span className="picker-label">{label}</span>
      <span className="picker-value">{value}</span>
      <input type={type} aria-label={label} step={type === 'date' ? undefined : 600} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function PlaceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const todos = useStore((s) => s.todos);
  const recent = [...new Set(todos.map((t) => t.place).filter((p): p is string => !!p).reverse())].slice(0, 5);
  return (
    <div className="chips place-row">
      <label className="place-field">
        <PinIcon />
        <input aria-label="장소" placeholder="장소 (선택)" maxLength={20} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {recent.map((p) => (
        <button key={p} type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={value === p} onClick={() => onChange(value === p ? '' : p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

const toMs = (day: number, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return day + (h * 60 + m) * 60_000;
};

function AddTodo({ clock, fixedDue, onDone }: { today: number; clock: number; fixedDue?: number; onDone?: () => void }) {
  const addTodo = useStore((s) => s.addTodo);
  const activities = useStore((s) => s.activities);
  const [type, setType] = useState<PlanType>('due');
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  // 마감: 날짜와 시각. null이면 기한 없음.
  const [dueAt, setDueAt] = useState<number | null>(null);
  // 몇 시~몇 시: 기본은 달력의 오늘(새벽에 적는 계획은 대개 그날 아침 이후의 일이다).
  const [day, setDay] = useState(() => fixedDue ?? dayStart(clock));
  const [from, setFrom] = useState('14:00');
  const [to, setTo] = useState('15:00');
  const [hours, setHours] = useState(2);
  const [actId, setActId] = useState(activities[0].id);
  const [repeat, setRepeat] = useState<number[]>([]);
  const addSeries = useStore((s) => s.addSeries);
  const name = activities.find((a) => a.id === actId)?.name ?? '';
  const badRange = type === 'range' && to <= from;
  const extra = place.trim() ? { place: place.trim() } : {};

  const submit = () => {
    if (type === 'due') {
      if (fixedDue !== undefined) addTodo(text, fixedDue, extra);
      else addTodo(text, dueAt === null ? null : dayStart(dueAt), { ...extra, ...(dueAt === null ? {} : { dueAt }) });
    } else if (type === 'range') {
      if (badRange) return;
      if (repeat.length) {
        const min = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
        addSeries({ text: text.trim() || name, activityId: actId, days: repeat, startMin: min(from), endMin: min(to), ...(place.trim() ? { place: place.trim() } : {}) });
        setText('');
        onDone?.();
        return;
      }
      addTodo(text.trim() || name, day, { ...extra, type: 'range', start: toMs(day, from), end: toMs(day, to), activityId: actId });
    } else addTodo(text.trim() || `${name} 매일 ${hours}시간`, null, { type: 'hours', minutes: hours * 60, activityId: actId });
    setText('');
    onDone?.();
  };

  return (
    <form
      className="add-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fixedDue === undefined && (
        <div className="seg thin" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', background: 'var(--bg)' }}>
          {TYPES.map((t) => (
            <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <input
          className="field grow"
          aria-label="할 일"
          autoFocus
          placeholder={fixedDue !== undefined ? `${fmtMD(fixedDue)}까지 할 일` : type === 'due' ? '할 일 적기' : `이름 (비우면 "${name}")`}
          maxLength={80}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="pill ink" type="submit" disabled={badRange}>
          추가
        </button>
      </div>

      {fixedDue === undefined && type === 'due' && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={dueAt === null} onClick={() => setDueAt(null)}>
            기한 없음
          </button>
          <PickerButton
            label="마감"
            value={dueAt === null ? '날짜·시간 고르기' : `${fmtMD(dueAt)} (${'일월화수목금토'[new Date(dueAt).getDay()]}) ${fmtAmPm(dueAt)}`}
            type="datetime-local"
            onChange={(v) => setDueAt(fromDateTimeInput(v))}
            wide
          />
        </div>
      )}

      {type === 'range' && (
        <>
          {repeat.length === 0 && <PickerButton label="날짜" value={fmtDayLong(day)} type="date" onChange={(v) => setDay(fromDateInput(v) ?? day)} wide />}
          <div className="time-pair">
            <PickerButton label="시작" value={fmtAmPm(toMs(day, from))} type="time" onChange={(v) => v && setFrom(v)} />
            <span aria-hidden="true">→</span>
            <PickerButton label="끝" value={fmtAmPm(toMs(day, to))} type="time" onChange={(v) => v && setTo(v)} />
          </div>
          {badRange && <div className="hint" style={{ color: '#8a2444' }}>끝 시각이 시작보다 뒤여야 해.</div>}
          <div className="repeat-row" role="group" aria-label="반복할 요일">
            <span className="sub" style={{ fontSize: 12 }}>
              반복
            </span>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} type="button" aria-pressed={repeat.includes(d)} onClick={() => setRepeat(repeat.includes(d) ? repeat.filter((x) => x !== d) : [...repeat, d].sort())}>
                {'일월화수목금토'[d]}
              </button>
            ))}
          </div>
        </>
      )}

      {type === 'hours' && (
        <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
          <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="30분 줄이기" onClick={() => setHours(Math.max(0.5, hours - 0.5))}>
            −
          </button>
          <div className="jua" style={{ fontSize: 20, minWidth: 110, textAlign: 'center' }}>
            하루 {hours}시간
          </div>
          <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="30분 늘리기" onClick={() => setHours(Math.min(12, hours + 0.5))}>
            +
          </button>
        </div>
      )}

      {type !== 'hours' && <PlaceInput value={place} onChange={setPlace} />}
      {type !== 'due' && <CategoryChips value={actId} onChange={setActId} />}
      <div className="hint">{TYPES.find((t) => t.id === type)!.hint}</div>
    </form>
  );
}

/** + 추가를 누르면 아래에서 올라오는 만들기 창 */
function AddSheet({ today, clock, fixedDue, onClose }: { today: number; clock: number; fixedDue?: number; onClose: () => void }) {
  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="계획 만들기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            {fixedDue !== undefined ? `${fmtDayLong(fixedDue)}에 추가` : '계획 만들기'}
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>
        <AddTodo today={today} clock={clock} fixedDue={fixedDue} onDone={onClose} />
      </div>
    </div>
  );
}

const hmOf = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`;
const minOfHM = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hmOfMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 짠 계획 고치기: 이름·장소, 시각을 정한 계획은 날짜·시각·활동, 마감은 마감 시각, 하루 몇 시간은 시간 */
function EditSheet({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const update = useStore((s) => s.updateTodo);
  const [text, setText] = useState(todo.text);
  const [place, setPlace] = useState(todo.place ?? '');
  const isRange = todo.start !== undefined;
  const [day, setDay] = useState(todo.due ?? dayStart(todo.start ?? Date.now()));
  const [from, setFrom] = useState(todo.start !== undefined ? hmOf(todo.start) : '14:00');
  const [to, setTo] = useState(todo.end !== undefined ? hmOf(todo.end) : '');
  const [dueAt, setDueAt] = useState<number | null>(todo.dueAt ?? null);
  const [noDue, setNoDue] = useState(todo.due === null);
  const [dueDay, setDueDay] = useState(todo.due ?? dayStart(Date.now()));
  const [hours, setHours] = useState((todo.minutes ?? 120) / 60);
  const [actId, setActId] = useState(todo.activityId ?? '');
  const bad = isRange && to !== '' && to <= from;

  const save = () => {
    if (bad) return;
    const base = { text, place };
    if (todo.type === 'hours') update(todo.id, { ...base, minutes: hours * 60 });
    else if (isRange) {
      const start = toMs(day, from);
      update(todo.id, { ...base, due: day, start, ...(to ? { end: toMs(day, to) } : {}), ...(actId ? { activityId: actId } : {}) });
    } else if (noDue) update(todo.id, { ...base, due: null, dueAt: undefined });
    else if (dueAt !== null) update(todo.id, { ...base, due: dayStart(dueAt), dueAt });
    else update(todo.id, { ...base, due: dueDay });
    onClose();
  };

  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="계획 고치기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            계획 고치기
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>
        <input className="field" aria-label="이름" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        {isRange && (
          <>
            <PickerButton label="날짜" value={fmtDayLong(day)} type="date" onChange={(v) => setDay(fromDateInput(v) ?? day)} wide />
            <div className="time-pair">
              <PickerButton label="시작" value={fmtAmPm(toMs(day, from))} type="time" onChange={(v) => v && setFrom(v)} />
              <span aria-hidden="true">→</span>
              <PickerButton label="끝" value={to ? fmtAmPm(toMs(day, to)) : '없음'} type="time" onChange={(v) => v && setTo(v)} />
            </div>
            {bad && <div className="hint" style={{ color: '#8a2444' }}>끝 시각이 시작보다 뒤여야 해.</div>}
            {todo.seriesId && <div className="hint">매주 반복 중 이날만 바뀌어. 매주 다 바꾸려면 아래 '반복' 목록에서 고쳐 줘.</div>}
          </>
        )}
        {!isRange && todo.type !== 'hours' && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={noDue} onClick={() => setNoDue(true)}>
              기한 없음
            </button>
            <PickerButton
              label="마감"
              value={
                noDue ? '날짜·시간 고르기' : dueAt !== null ? `${fmtMD(dueAt)} (${'일월화수목금토'[new Date(dueAt).getDay()]}) ${fmtAmPm(dueAt)}` : `${fmtDayLong(dueDay)} 안에`
              }
              type="datetime-local"
              onChange={(v) => {
                const at = fromDateTimeInput(v);
                if (at === null) return;
                setDueAt(at);
                setDueDay(dayStart(at));
                setNoDue(false);
              }}
              wide
            />
          </div>
        )}
        {todo.type === 'hours' && (
          <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
            <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="30분 줄이기" onClick={() => setHours(Math.max(0.5, hours - 0.5))}>
              −
            </button>
            <div className="jua" style={{ fontSize: 20, minWidth: 110, textAlign: 'center' }}>
              하루 {hours}시간
            </div>
            <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="30분 늘리기" onClick={() => setHours(Math.min(12, hours + 0.5))}>
              +
            </button>
          </div>
        )}
        {todo.type !== 'hours' && <PlaceInput value={place} onChange={setPlace} />}
        {isRange && <CategoryChips value={actId} onChange={setActId} />}
        <button className="big-btn ink" disabled={bad || !text.trim()} onClick={save}>
          고치기
        </button>
      </div>
    </div>
  );
}

/** 매주 고정 일정 고치기: 이름·요일·시각·끝나는 날·장소. 앞으로의 날들이 새 모양으로 바뀐다. */
function SeriesSheet({ series, onClose }: { series: Series; onClose: () => void }) {
  const update = useStore((s) => s.updateSeries);
  const [text, setText] = useState(series.text);
  const [days, setDays] = useState(series.days);
  const [from, setFrom] = useState(hmOfMin(series.startMin));
  const [to, setTo] = useState(series.endMin !== null ? hmOfMin(series.endMin) : '');
  const [until, setUntil] = useState<number | null>(series.until ?? null);
  const [place, setPlace] = useState(series.place ?? '');
  const today = dayStart(Date.now());
  const bad = (to !== '' && to <= from) || !days.length;
  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="반복 고치기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            매주 반복 고치기
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>
        <input className="field" aria-label="이름" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="repeat-row" role="group" aria-label="반복할 요일">
          <span className="sub" style={{ fontSize: 12 }}>
            요일
          </span>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}>
              {'일월화수목금토'[d]}
            </button>
          ))}
        </div>
        <div className="time-pair">
          <PickerButton label="시작" value={fmtAmPm(toMs(today, from))} type="time" onChange={(v) => v && setFrom(v)} />
          <span aria-hidden="true">→</span>
          <PickerButton label="끝" value={to ? fmtAmPm(toMs(today, to)) : '없음'} type="time" onChange={(v) => v && setTo(v)} />
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={until === null} onClick={() => setUntil(null)}>
            끝없이
          </button>
          <PickerButton label="끝나는 날" value={until === null ? '날짜 고르기' : fmtDayLong(until)} type="date" onChange={(v) => setUntil(fromDateInput(v) ?? until)} wide />
        </div>
        <PlaceInput value={place} onChange={setPlace} />
        {bad && <div className="hint" style={{ color: '#8a2444' }}>{days.length ? '끝 시각이 시작보다 뒤여야 해.' : '요일을 하나는 골라 줘.'}</div>}
        <button
          className="big-btn ink"
          disabled={bad || !text.trim()}
          onClick={() => {
            update(series.id, { text, days, startMin: minOfHM(from), endMin: to ? minOfHM(to) : null, place: place.trim() || undefined, until: until ?? undefined });
            onClose();
          }}
        >
          고치기
        </button>
      </div>
    </div>
  );
}

function Group({ title, todos, today, clock }: { title: string; todos: Todo[]; today: number; clock: number }) {
  if (!todos.length) return null;
  return (
    <div className="card" style={{ gap: 4, padding: '14px 12px 10px 16px' }}>
      <div className="sub" style={{ fontSize: 13 }}>
        {title}
      </div>
      {todos.map((t) => (t.type === 'hours' ? <GoalRow key={t.id} todo={t} today={today} /> : <TodoRow key={t.id} todo={t} today={today} clock={clock} />))}
    </div>
  );
}

function ListView({ today, clock }: { today: number; clock: number }) {
  const todos = useStore((s) => s.todos);
  const [showDone, setShowDone] = useState(false);
  const goals = todos.filter((t) => t.type === 'hours');
  const series = useStore((s) => s.series);
  const removeSeries = useStore((s) => s.removeSeries);
  const [editSeries, setEditSeries] = useState<Series | null>(null);
  // 반복 일정은 오늘·내일 것만 목록에 둔다(나머지는 달력에서).
  const open = todos.filter((t) => !t.done && t.type !== 'hours' && !(t.seriesId && t.due !== null && t.due > today + DAY)).sort(byUrgency(today, clock));
  const done = todos.filter((t) => t.done && t.type !== 'hours').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const level = (t: Todo) => whenOf(t, today, clock)?.level;
  return (
    <>
      {open.length === 0 && done.length === 0 && goals.length === 0 && <div className="empty">위의 + 추가를 누르거나, 모아에게 "금요일까지 과제 제출"처럼 말해줘.</div>}
      <Group title="급한 것" todos={open.filter((t) => level(t) === 'urgent' || level(t) === 'late')} today={today} clock={clock} />
      <Group title="매일 목표 · 오늘 한 만큼 채워져" todos={goals} today={today} clock={clock} />
      <Group title="오늘" todos={open.filter((t) => t.due === today && level(t) !== 'urgent' && level(t) !== 'late')} today={today} clock={clock} />
      <Group title="다가오는" todos={open.filter((t) => t.due !== null && t.due > today && level(t) !== 'urgent' && level(t) !== 'late')} today={today} clock={clock} />
      <Group title="기한 없음" todos={open.filter((t) => t.due === null)} today={today} clock={clock} />
      {series.length > 0 && (
        <div className="card" style={{ gap: 6, padding: '14px 12px 10px 16px' }}>
          <div className="sub" style={{ fontSize: 13 }}>
            반복 · 2주치가 달력과 격자에 미리 들어가 있어
          </div>
          {series.map((x) => (
            <div key={x.id} className="row" style={{ gap: 8, minHeight: 44 }}>
              <div className="grow">
                <div style={{ fontSize: 15 }}>{x.text}</div>
                <div className="todo-meta">
                  <span>{describeSeries(x)}</span>
                  {x.place && <span className="place">{x.place}</span>}
                </div>
              </div>
              <button className="pill" style={{ background: 'var(--bg)', minHeight: 36 }} aria-label={`${x.text} 반복 고치기`} onClick={() => setEditSeries(x)}>
                고치기
              </button>
              <RemoveButton onClick={() => removeSeries(x.id)} />
            </div>
          ))}
          {editSeries && <SeriesSheet series={editSeries} onClose={() => setEditSeries(null)} />}
        </div>
      )}
      {done.length > 0 && (
        <button className="pill clear" style={{ alignSelf: 'flex-start' }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          끝낸 것 {done.length}개 {showDone ? '접기' : '보기'}
        </button>
      )}
      {showDone && <Group title="끝낸 것" todos={done.slice(0, 50)} today={today} clock={clock} />}
    </>
  );
}

function MonthView({ today, clock }: { today: number; clock: number }) {
  const [adding, setAdding] = useState(false);
  const todos = useStore((s) => s.todos);
  const [month, setMonth] = useState(() => monthStart(today));
  const [picked, setPicked] = useState(today);
  const lead = (new Date(month).getDay() + 6) % 7;
  const count = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(month, i))];
  while (cells.length % 7) cells.push(null);
  const dueOn = (d: number) => todos.filter((t) => t.due === d).sort(byUrgency(today, clock));
  const periods = useStore((s) => s.periods);

  return (
    <>
      <div className="datebar">
        <button aria-label="이전 달" onClick={() => setMonth(addMonths(month, -1))}>
          <Chevron dir="left" />
        </button>
        <button
          className="jua grow"
          onClick={() => {
            setMonth(monthStart(today));
            setPicked(today);
          }}
        >
          {fmtYM(month)}
        </button>
        <button aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))}>
          <Chevron dir="right" />
        </button>
      </div>

      <div className="card" style={{ padding: 8, gap: 4 }}>
        <div className="cal dow" aria-hidden="true">
          {DOW.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="cal">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const list = dueOn(d);
            const left = list.filter((t) => !t.done);
            const hot = left.some((t) => ['urgent', 'late'].includes(whenOf(t, today, clock)?.level ?? ''));
            return (
              <button
                key={i}
                className="cal-day"
                data-today={d === today}
                data-hot={hot}
                data-period={periodsOn(periods, d).length > 0}
                aria-pressed={picked === d}
                aria-label={`${fmtMD(d)}, 할 일 ${left.length}개${periodsOn(periods, d).map((p) => `, ${p.name}`).join('')}`}
                onClick={() => setPicked(d)}
              >
                <b>{new Date(d).getDate()}</b>
                {periodsOn(periods, d).some((p) => p.start === d) && <u>{periodsOn(periods, d).find((p) => p.start === d)!.name}</u>}
                {list.slice(0, 2).map((t) => (
                  <span key={t.id} data-done={t.done}>
                    {t.text}
                  </span>
                ))}
                {list.length > 2 && <em>+{list.length - 2}</em>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h2">{fmtDayLong(picked)} 할 일</div>
      {dueOn(picked).length > 0 && (
        <div className="card" style={{ gap: 4, padding: '10px 12px 10px 16px' }}>
          {dueOn(picked).map((t) => (
            <TodoRow key={t.id} todo={t} today={today} clock={clock} />
          ))}
        </div>
      )}
      <button className="pill" style={{ alignSelf: 'flex-start', background: 'var(--card)' }} onClick={() => setAdding(true)}>
        + 이 날에 추가
      </button>
      {adding && <AddSheet today={today} clock={clock} fixedDue={picked} onClose={() => setAdding(false)} />}
    </>
  );
}

/** 주간: 월~일 일곱 줄, 줄마다 그날 계획을 시간 순으로 */
function WeekView({ today, clock, grid = false }: { today: number; clock: number; grid?: boolean }) {
  const todos = useStore((s) => s.todos);
  const activities = useStore((s) => s.activities);
  const [week, setWeek] = useState(() => weekStart(today));
  const [addFor, setAddFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<Todo | null>(null);
  const periods = useStore((s) => s.periods);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const color = (t: Todo) => activities.find((a) => a.id === t.activityId)?.color;
  const timeOf = (t: Todo) => (t.start !== undefined ? fmtHM(t.start) + (t.end !== undefined ? `–${fmtHM(t.end)}` : '') : t.dueAt !== undefined ? `${fmtHM(t.dueAt)}까지` : '마감');
  return (
    <>
      <div className="datebar">
        <button aria-label="지난주" onClick={() => setWeek(addDays(week, -7))}>
          <Chevron dir="left" />
        </button>
        <button className="jua grow" onClick={() => setWeek(weekStart(today))}>
          {fmtMD(week)} – {fmtMD(addDays(week, 6))}
          {weekStart(today) !== week && <span className="back">이번 주로</span>}
        </button>
        <button aria-label="다음 주" onClick={() => setWeek(addDays(week, 7))}>
          <Chevron dir="right" />
        </button>
      </div>
      {grid && <WeekGrid days={days} today={today} now={clock} onEdit={setEditing} />}
      <div className="card week-agenda" hidden={grid}>
        {days.map((d, i) => {
          const list = todos.filter((t) => t.due === d && t.type !== 'hours').sort((x, y) => (x.start ?? x.dueAt ?? Infinity) - (y.start ?? y.dueAt ?? Infinity));
          return (
            <div key={d} className="wa-row" data-today={d === today} data-period={periodsOn(periods, d).length > 0}>
              <div className="wa-day">
                <span>{DOW[i]}</span>
                <b>{new Date(d).getDate()}</b>
              </div>
              <div className="wa-items">
                {list.length === 0 && <span className="wa-empty">–</span>}
                {list.map((t) => {
                  const lv = whenOf(t, today, clock)?.level;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-label={`${t.text} 고치기`}
                      className={`wa-item${t.done ? ' done' : ''}${lv === 'urgent' || lv === 'late' ? ' hot' : ''}`}
                      onClick={() => setEditing(t)}
                    >
                      <i style={{ background: color(t) ?? 'var(--moa)' }} />
                      <span className="wa-time">{timeOf(t)}</span>
                      <span className="wa-text">{t.text}</span>
                      {t.place && <span className="wa-place">{t.place}</span>}
                    </button>
                  );
                })}
              </div>
              <button className="wa-add" aria-label={`${fmtMD(d)}에 계획 추가`} onClick={() => setAddFor(d)}>
                +
              </button>
            </div>
          );
        })}
      </div>
      {addFor !== null && <AddSheet today={today} clock={clock} fixedDue={addFor} onClose={() => setAddFor(null)} />}
      {editing && <EditSheet todo={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const CAL_KEY = 'moa-cal-mode';
type CalMode = 'week' | 'grid' | 'month';

function CalendarView({ today, clock }: { today: number; clock: number }) {
  const [mode, setModeRaw] = useState<CalMode>(() => {
    try {
      const v = localStorage.getItem(CAL_KEY);
      return v === 'grid' || v === 'month' ? v : 'week';
    } catch {
      return 'week';
    }
  });
  const setMode = (m: CalMode) => {
    setModeRaw(m);
    try {
      localStorage.setItem(CAL_KEY, m);
    } catch {
      /* 무시 */
    }
  };
  return (
    <>
      <div className="seg thin" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <button aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
          주간 목록
        </button>
        <button aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}>
          주간 격자
        </button>
        <button aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
          월간
        </button>
      </div>
      {mode === 'month' ? <MonthView today={today} clock={clock} /> : <WeekView today={today} clock={clock} grid={mode === 'grid'} />}
    </>
  );
}

const GRID_HOUR = 30;

/**
 * 한 주를 격자로: 세로는 시각, 가로는 7일. 기록 화면처럼 계획은 연하게(왼쪽), 한 일은 진하게(오른쪽) 칠한다.
 * 활동을 안 정한 시간 계획은 점선 테두리로. 계획을 누르면 고치기.
 */
function WeekGrid({ days, today, now, onEdit }: { days: number[]; today: number; now: number; onEdit: (t: Todo) => void }) {
  const intervals = useStore((s) => s.intervals);
  const todos = useStore((s) => s.todos);
  const activities = useStore((s) => s.activities);
  const periods = useStore((s) => s.periods);
  const color = (id?: string | null) => activities.find((a) => a.id === id)?.color ?? '#CFC6F3';
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 처음엔 아침 7시쯤부터 보이게
    if (scroller.current) scroller.current.scrollTop = 7 * GRID_HOUR;
  }, []);
  const top = (ms: number, d: number) => ((ms - d) / HOUR) * GRID_HOUR;
  return (
    <div className="card wg">
      <div className="wg-head">
        <span />
        {days.map((d) => (
          <span key={d} data-today={d === today} data-period={periodsOn(periods, d).length > 0}>
            {'일월화수목금토'[new Date(d).getDay()]}
            <b>{new Date(d).getDate()}</b>
          </span>
        ))}
      </div>
      <div className="wg-body" ref={scroller}>
        <div className="wg-hours">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ top: h * GRID_HOUR }}>
              {h}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const end = addDays(d, 1);
          const ivs = intervals.filter((iv) => iv.start < end && (iv.end ?? now) > d);
          const loose = todos.filter((t) => t.due === d && t.type === 'range' && t.start !== undefined && !t.activityId);
          return (
            <div key={d} className="wg-col" data-today={d === today} style={{ height: 24 * GRID_HOUR }}>
              {ivs.map((iv) => {
                const s = Math.max(iv.start, d);
                const e = Math.min(iv.end ?? now, end);
                return (
                  <i
                    key={iv.id}
                    className={iv.kind === 'plan' ? 'wg-plan' : 'wg-exec'}
                    style={{ top: top(s, d), height: Math.max(2, top(e, d) - top(s, d)), background: iv.kind === 'plan' ? soft(color(iv.activityId), 0.55) : color(iv.activityId), borderColor: color(iv.activityId) }}
                  />
                );
              })}
              {loose.map((t) => (
                <button
                  key={t.id}
                  className="wg-todo"
                  aria-label={`${t.text} 고치기`}
                  style={{ top: top(t.start!, d), height: Math.max(14, top(t.end ?? t.start! + HOUR, d) - top(t.start!, d)) }}
                  onClick={() => onEdit(t)}
                >
                  {t.text}
                </button>
              ))}
              {todos
                .filter((t) => t.due === d && t.type === 'range' && t.start !== undefined && t.activityId)
                .map((t) => (
                  <button
                    key={t.id}
                    className="wg-hit"
                    aria-label={`${t.text} 고치기`}
                    style={{ top: top(t.start!, d), height: Math.max(14, top(t.end ?? t.start! + HOUR, d) - top(t.start!, d)) }}
                    onClick={() => onEdit(t)}
                  >
                    {t.text}
                  </button>
                ))}
              {d === today && <div className="wg-now" style={{ top: top(now, d) }} />}
            </div>
          );
        })}
      </div>
      <div className="wg-legend">
        <span>
          <i className="wg-plan" style={{ background: '#E5DFFB', borderColor: '#C9B8FF' }} />
          계획
        </span>
        <span>
          <i className="wg-exec" style={{ background: '#C9B8FF' }} />한 일
        </span>
        <span>
          <i className="wg-dash" />
          활동 없는 계획
        </span>
      </div>
    </div>
  );
}

export function Todos({ now: clock }: { now: number }) {
  const intervals = useStore((s) => s.intervals);
  // 자기 전의 새벽은 아직 전날이다. 아래 화면들은 그 하루를 '오늘'로 쓴다.
  const today = logicalToday(clock, intervals);
  const [view, setView] = useState<'list' | 'cal'>('list');
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);
  return (
    <div className="screen">
      <div className="row" style={{ gap: 8 }}>
        <div className="seg grow" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            계획
          </button>
          <button aria-pressed={view === 'cal'} onClick={() => setView('cal')}>
            달력
          </button>
        </div>
        <button className="add-btn" onClick={() => setAdding(true)}>
          + 추가
        </button>
      </div>
      <div className="plan-tools">
        <button className="wk-open" onClick={() => setPlanning(true)}>
          <b>✨ 한 주 짜기</b>
          <span>길게 적으면 나눠 줄게</span>
        </button>
        <PeriodBar today={today} />
      </div>
      {view === 'list' ? <ListView today={today} clock={clock} /> : <CalendarView today={today} clock={clock} />}
      {adding && <AddSheet today={today} clock={clock} onClose={() => setAdding(false)} />}
      {planning && <WeekPlanSheet onClose={() => setPlanning(false)} />}
    </div>
  );
}
