import { useRef, useState, type PointerEvent } from 'react';
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
} from '../lib/time';
import type { Activity, Interval, Todo } from '../lib/types';
import { useStore } from '../store';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
type PlanType = 'due' | 'range' | 'hours';
const TYPES: { id: PlanType; name: string; hint: string }[] = [
  { id: 'due', name: '마감', hint: '언제까지 끝내야 하는 것' },
  { id: 'range', name: '몇 시~몇 시', hint: '시간이 정해진 일. 격자에도 계획으로 칠해져' },
  { id: 'hours', name: '매일 몇 시간', hint: '하루에 이만큼은 하고 싶은 것' },
];

/* ───── 남은 시간과 급함 ───── */

export type Urgency = 'late' | 'urgent' | 'soon' | 'normal';

/** 이 계획이 언제인지, 얼마나 급한지. today는 자기 전 기준의 오늘 0시, clock은 지금 시각. */
export function whenOf(t: Todo, today: number, clock: number): { text: string; level: Urgency; target: number } | null {
  // 일정(시각이 있는 일)
  if (t.start !== undefined && t.dueAt === undefined) {
    const day = `${fmtDue(dayStart(t.start), today)} ${fmtHM(t.start)}${t.end !== undefined ? `–${fmtHM(t.end)}` : ''}`;
    const left = t.start - clock;
    if (t.end !== undefined && clock >= t.start && clock < t.end) return { text: `하는 중 · ${fmtHM(t.end)}까지`, level: 'urgent', target: t.start };
    if (left < 0) return { text: `${day} · 지남`, level: 'late', target: t.start };
    if (left <= HOUR) return { text: `${fmtLeft(left)} 뒤`, level: 'urgent', target: t.start };
    if (left < 12 * HOUR) return { text: `${day} · ${fmtLeft(left)} 뒤`, level: left < 3 * HOUR ? 'soon' : 'normal', target: t.start };
    return { text: day, level: 'normal', target: t.start };
  }
  // 마감
  if (t.due === null) return null;
  const target = t.dueAt ?? t.due + DAY;
  // 시각 없는 마감은 그날이 끝날 때(자기 전까지)가 기한이다.
  if (t.dueAt === undefined) {
    if (t.due < today) return { text: `${Math.round((today - t.due) / DAY)}일 지남`, level: 'late', target };
    if (t.due === today) return { text: '급해 · 오늘까지', level: 'urgent', target };
  }
  const left = target - clock;
  if (left < 0) return { text: `${fmtLeft(-left)} 지남`, level: 'late', target };
  if (left < DAY) return { text: `급해 · ${fmtLeft(left)} 남음`, level: 'urgent', target };
  const by = `${fmtDue(t.due, today)}${t.dueAt !== undefined ? ` ${fmtHM(t.dueAt)}` : ''}까지`;
  if (left < 3 * DAY) return { text: `${by} · ${fmtLeft(left)} 남음`, level: 'soon', target };
  return { text: by, level: 'normal', target };
}

export const byUrgency = (today: number, clock: number) => (a: Todo, b: Todo) =>
  (whenOf(a, today, clock)?.target ?? Infinity) - (whenOf(b, today, clock)?.target ?? Infinity);

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

/** 체크 옆의 10칸. 눌러서 몇 칸까지 했는지 정하고, 끌어서 한 번에 채운다. 10칸이 되면 끝. */
function Progress({ todo }: { todo: Todo }) {
  const setProgress = useStore((s) => s.setProgress);
  const p = todo.progress ?? 0;
  const drag = useRef(false);
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(9, Math.floor(((e.clientX - r.left) / r.width) * 10)));
  };
  return (
    <div
      className="progress"
      role="slider"
      aria-label={`${todo.text} 진행도`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p * 10}
      aria-valuetext={`${p * 10}%`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setProgress(todo.id, p + 1);
        if (e.key === 'ArrowLeft') setProgress(todo.id, p - 1);
      }}
      onPointerDown={(e) => {
        drag.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 없어도 된다 */
        }
        const i = at(e);
        // 이미 채운 마지막 칸을 다시 누르면 한 칸 되돌린다.
        setProgress(todo.id, i + 1 === p ? i : i + 1);
      }}
      onPointerMove={(e) => {
        if (drag.current) setProgress(todo.id, at(e) + 1);
      }}
      onPointerUp={() => {
        drag.current = false;
      }}
      onPointerCancel={() => {
        drag.current = false;
      }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} data-on={i < p} />
      ))}
      <span>{p * 10}%</span>
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
  const when = todo.done ? null : whenOf(todo, today, clock);
  // 일정(약속·기상)은 진행도가 의미 없다. 마감과 기한 없는 일에만 10칸을 보여준다.
  const showProgress = !todo.done && (todo.start === undefined || todo.dueAt !== undefined);
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
          {open && <RemoveButton onClick={() => remove(todo.id)} />}
        </div>
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

function AddTodo({ today, clock, fixedDue }: { today: number; clock: number; fixedDue?: number }) {
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
  const name = activities.find((a) => a.id === actId)?.name ?? '';
  const badRange = type === 'range' && to <= from;
  const extra = place.trim() ? { place: place.trim() } : {};

  const submit = () => {
    if (type === 'due') {
      if (fixedDue !== undefined) addTodo(text, fixedDue, extra);
      else addTodo(text, dueAt === null ? null : dayStart(dueAt), { ...extra, ...(dueAt === null ? {} : { dueAt }) });
    } else if (type === 'range') {
      if (badRange) return;
      addTodo(text.trim() || name, day, { ...extra, type: 'range', start: toMs(day, from), end: toMs(day, to), activityId: actId });
    } else addTodo(text.trim() || `${name} 매일 ${hours}시간`, null, { type: 'hours', minutes: hours * 60, activityId: actId });
    setText('');
  };

  return (
    <form
      className="card"
      style={{ gap: 12, padding: 16 }}
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
          <PickerButton label="날짜" value={fmtDayLong(day)} type="date" onChange={(v) => setDay(fromDateInput(v) ?? day)} wide />
          <div className="time-pair">
            <PickerButton label="시작" value={fmtAmPm(toMs(day, from))} type="time" onChange={(v) => v && setFrom(v)} />
            <span aria-hidden="true">→</span>
            <PickerButton label="끝" value={fmtAmPm(toMs(day, to))} type="time" onChange={(v) => v && setTo(v)} />
          </div>
          {badRange && <div className="hint" style={{ color: '#8a2444' }}>끝 시각이 시작보다 뒤여야 해.</div>}
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
  const open = todos.filter((t) => !t.done && t.type !== 'hours').sort(byUrgency(today, clock));
  const done = todos.filter((t) => t.done && t.type !== 'hours').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const level = (t: Todo) => whenOf(t, today, clock)?.level;
  return (
    <>
      <AddTodo today={today} clock={clock} />
      {open.length === 0 && done.length === 0 && goals.length === 0 && <div className="empty">계획을 적거나, 모아에게 "금요일까지 과제 제출"처럼 말해줘.</div>}
      <Group title="급한 것" todos={open.filter((t) => level(t) === 'urgent' || level(t) === 'late')} today={today} clock={clock} />
      <Group title="매일 목표 · 오늘 한 만큼 채워져" todos={goals} today={today} clock={clock} />
      <Group title="오늘" todos={open.filter((t) => t.due === today && level(t) !== 'urgent' && level(t) !== 'late')} today={today} clock={clock} />
      <Group title="다가오는" todos={open.filter((t) => t.due !== null && t.due > today && level(t) !== 'urgent' && level(t) !== 'late')} today={today} clock={clock} />
      <Group title="기한 없음" todos={open.filter((t) => t.due === null)} today={today} clock={clock} />
      {done.length > 0 && (
        <button className="pill clear" style={{ alignSelf: 'flex-start' }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          끝낸 것 {done.length}개 {showDone ? '접기' : '보기'}
        </button>
      )}
      {showDone && <Group title="끝낸 것" todos={done.slice(0, 50)} today={today} clock={clock} />}
    </>
  );
}

function CalendarView({ today, clock }: { today: number; clock: number }) {
  const todos = useStore((s) => s.todos);
  const [month, setMonth] = useState(() => monthStart(today));
  const [picked, setPicked] = useState(today);
  const lead = (new Date(month).getDay() + 6) % 7;
  const count = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(month, i))];
  while (cells.length % 7) cells.push(null);
  const dueOn = (d: number) => todos.filter((t) => t.due === d).sort(byUrgency(today, clock));

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
              <button key={i} className="cal-day" data-today={d === today} data-hot={hot} aria-pressed={picked === d} aria-label={`${fmtMD(d)}, 할 일 ${left.length}개`} onClick={() => setPicked(d)}>
                <b>{new Date(d).getDate()}</b>
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
      <AddTodo key={picked} today={today} clock={clock} fixedDue={picked} />
    </>
  );
}

export function Todos({ now: clock }: { now: number }) {
  const intervals = useStore((s) => s.intervals);
  // 자기 전의 새벽은 아직 전날이다. 아래 화면들은 그 하루를 '오늘'로 쓴다.
  const today = logicalToday(clock, intervals);
  const [view, setView] = useState<'list' | 'cal'>('list');
  return (
    <div className="screen">
      <div className="seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
          계획 목록
        </button>
        <button aria-pressed={view === 'cal'} onClick={() => setView('cal')}>
          달력
        </button>
      </div>
      {view === 'list' ? <ListView today={today} clock={clock} /> : <CalendarView today={today} clock={clock} />}
    </div>
  );
}
