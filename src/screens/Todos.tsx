import { useState } from 'react';
import { Chevron } from '../components/common';
import { CategoryChips } from '../components/Pickers';
import { totalsByActivity } from '../lib/intervals';
import { addDays, addMonths, DAY, dayStart, fmtDue, fmtDur, fmtHM, fmtMD, fmtYM, fromDateInput, monthStart, toDateInput } from '../lib/time';
import type { Activity, Interval, Todo } from '../lib/types';
import { useStore } from '../store';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
type PlanType = 'due' | 'range' | 'hours';
const TYPES: { id: PlanType; name: string; hint: string }[] = [
  { id: 'due', name: '마감일', hint: '언제까지 끝내야 하는 것' },
  { id: 'range', name: '몇 시~몇 시', hint: '시간이 정해진 것. 격자에도 계획으로 칠해져' },
  { id: 'hours', name: '매일 몇 시간', hint: '하루에 이만큼은 하고 싶은 것' },
];

/** 오늘 그 활동(하위 활동 포함)을 실제로 한 시간(ms) */
export function doneToday(todo: Todo, intervals: Interval[], activities: Activity[], now: number): number {
  const today = dayStart(now);
  const totals = totalsByActivity(intervals, today, today + DAY, now);
  return activities.filter((a) => a.id === todo.activityId || a.parentId === todo.activityId).reduce((sum, a) => sum + (totals[a.id] ?? 0), 0);
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="pill" style={{ background: 'var(--bg)', marginRight: 6 }} onClick={onClick}>
      지우기
    </button>
  );
}

/** 매일 몇 시간: 체크 대신 오늘 한 만큼 채워지는 막대 */
export function GoalRow({ todo, now }: { todo: Todo; now: number }) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const remove = useStore((s) => s.removeTodo);
  const [open, setOpen] = useState(false);
  const target = (todo.minutes ?? 0) * 60_000;
  const done = doneToday(todo, intervals, activities, now);
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

export function TodoRow({ todo, now }: { todo: Todo; now: number }) {
  const toggle = useStore((s) => s.toggleTodo);
  const remove = useStore((s) => s.removeTodo);
  const late = !todo.done && todo.due !== null && todo.due < dayStart(now);
  // 지우기는 완료와 헷갈리지 않게, 글자를 눌러 펼쳤을 때만 보인다.
  const [open, setOpen] = useState(false);
  const range = todo.type === 'range' && todo.start !== undefined && todo.end !== undefined ? `${fmtHM(todo.start)}–${fmtHM(todo.end)}` : '';
  return (
    <div className="todo">
      <button className="check" role="checkbox" aria-checked={todo.done} aria-label={`${todo.text} ${todo.done ? '끝냄 취소' : '끝냄'}`} onClick={() => toggle(todo.id)}>
        {todo.done && (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,7 6,11 12,3" />
          </svg>
        )}
      </button>
      <button className="grow todo-text" aria-expanded={open} style={{ textDecoration: todo.done ? 'line-through' : undefined, color: todo.done ? 'var(--sub)' : undefined }} onClick={() => setOpen(!open)}>
        {todo.text}
      </button>
      {todo.due !== null && !todo.done && (
        <div className={late ? 'tag late' : 'tag'}>
          {late ? '기한 지남 · ' : ''}
          {fmtDue(todo.due, now)}
          {range && ` ${range}`}
        </div>
      )}
      {open && <RemoveButton onClick={() => remove(todo.id)} />}
    </div>
  );
}

function DayChips({ value, onChange, now, allowNone }: { value: number | null; onChange: (v: number | null) => void; now: number; allowNone: boolean }) {
  const today = dayStart(now);
  const quick: { label: string; value: number | null }[] = [...(allowNone ? [{ label: '기한 없음', value: null }] : []), { label: '오늘', value: today }, { label: '내일', value: addDays(today, 1) }];
  const custom = value !== null && value !== today && value !== addDays(today, 1);
  return (
    <div className="chips">
      {quick.map((q) => (
        <button key={q.label} type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={value === q.value} onClick={() => onChange(q.value)}>
          {q.label}
        </button>
      ))}
      <label className="chip datechip" style={{ background: 'var(--bg)' }} data-on={custom}>
        {custom && value !== null ? fmtMD(value) : '날짜'}
        <input type="date" aria-label="날짜" value={value !== null ? toDateInput(value) : ''} onChange={(e) => onChange(fromDateInput(e.target.value) ?? (allowNone ? null : today))} />
      </label>
    </div>
  );
}

const toMs = (day: number, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return day + (h * 60 + m) * 60_000;
};

function AddTodo({ now, fixedDue }: { now: number; fixedDue?: number }) {
  const addTodo = useStore((s) => s.addTodo);
  const activities = useStore((s) => s.activities);
  const [type, setType] = useState<PlanType>('due');
  const [text, setText] = useState('');
  const [due, setDue] = useState<number | null>(null);
  const [day, setDay] = useState(() => fixedDue ?? dayStart(now));
  const [from, setFrom] = useState('14:00');
  const [to, setTo] = useState('15:00');
  const [hours, setHours] = useState(2);
  const [actId, setActId] = useState(activities[0].id);
  const name = activities.find((a) => a.id === actId)?.name ?? '';
  const badRange = type === 'range' && to <= from;

  const submit = () => {
    if (type === 'due') addTodo(text, fixedDue ?? due);
    else if (type === 'range') {
      if (badRange) return;
      addTodo(text.trim() || name, day, { type: 'range', start: toMs(day, from), end: toMs(day, to), activityId: actId });
    } else addTodo(text.trim() || `${name} 매일 ${hours}시간`, null, { type: 'hours', minutes: hours * 60, activityId: actId });
    setText('');
  };

  return (
    <form
      className="card"
      style={{ gap: 10, padding: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fixedDue === undefined && (
        <>
          <div className="seg thin" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', background: 'var(--bg)' }}>
            {TYPES.map((t) => (
              <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="hint">{TYPES.find((t) => t.id === type)!.hint}</div>
        </>
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
      {fixedDue === undefined && type === 'due' && <DayChips value={due} onChange={setDue} now={now} allowNone />}
      {type === 'range' && (
        <>
          <DayChips value={day} onChange={(v) => setDay(v ?? dayStart(now))} now={now} allowNone={false} />
          <div className="row" style={{ gap: 8 }}>
            <input className="field time" type="time" step={600} aria-label="시작 시각" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="sub">부터</span>
            <input className="field time" type="time" step={600} aria-label="끝 시각" value={to} onChange={(e) => setTo(e.target.value)} />
            <span className="sub">까지</span>
          </div>
          {badRange && <div className="hint" style={{ color: '#8a2444' }}>끝 시각이 시작보다 뒤여야 해.</div>}
        </>
      )}
      {type === 'hours' && (
        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="30분 줄이기" onClick={() => setHours(Math.max(0.5, hours - 0.5))}>
            −
          </button>
          <div className="jua" style={{ fontSize: 20, minWidth: 96, textAlign: 'center' }}>
            하루 {hours}시간
          </div>
          <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="30분 늘리기" onClick={() => setHours(Math.min(12, hours + 0.5))}>
            +
          </button>
        </div>
      )}
      {type !== 'due' && <CategoryChips value={actId} onChange={setActId} />}
    </form>
  );
}

function Group({ title, todos, now }: { title: string; todos: Todo[]; now: number }) {
  if (!todos.length) return null;
  return (
    <div className="card" style={{ gap: 2, padding: '12px 8px 8px 16px' }}>
      <div className="sub" style={{ fontSize: 13 }}>
        {title}
      </div>
      {todos.map((t) => (t.type === 'hours' ? <GoalRow key={t.id} todo={t} now={now} /> : <TodoRow key={t.id} todo={t} now={now} />))}
    </div>
  );
}

function ListView({ now }: { now: number }) {
  const todos = useStore((s) => s.todos);
  const [showDone, setShowDone] = useState(false);
  const today = dayStart(now);
  const goals = todos.filter((t) => t.type === 'hours');
  const open = todos.filter((t) => !t.done && t.type !== 'hours');
  const byDue = (a: Todo, b: Todo) => (a.start ?? a.due ?? Infinity) - (b.start ?? b.due ?? Infinity);
  const done = todos.filter((t) => t.done && t.type !== 'hours').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return (
    <>
      <AddTodo now={now} />
      {open.length === 0 && done.length === 0 && goals.length === 0 && <div className="empty">계획을 적거나, 모아에게 "금요일까지 과제 제출"처럼 말해줘.</div>}
      <Group title="매일 목표 · 오늘 한 만큼 채워져" todos={goals} now={now} />
      <Group title="오늘까지" todos={open.filter((t) => t.due !== null && t.due <= today).sort(byDue)} now={now} />
      <Group title="다가오는" todos={open.filter((t) => t.due !== null && t.due > today).sort(byDue)} now={now} />
      <Group title="기한 없음" todos={open.filter((t) => t.due === null)} now={now} />
      {done.length > 0 && (
        <button className="pill clear" style={{ alignSelf: 'flex-start' }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          끝낸 것 {done.length}개 {showDone ? '접기' : '보기'}
        </button>
      )}
      {showDone && <Group title="끝낸 것" todos={done.slice(0, 50)} now={now} />}
    </>
  );
}

function CalendarView({ now }: { now: number }) {
  const todos = useStore((s) => s.todos);
  const [month, setMonth] = useState(() => monthStart(now));
  const [picked, setPicked] = useState(() => dayStart(now));
  const today = dayStart(now);
  const lead = (new Date(month).getDay() + 6) % 7;
  const count = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(month, i))];
  while (cells.length % 7) cells.push(null);
  const dueOn = (d: number) => todos.filter((t) => t.due === d);

  return (
    <>
      <div className="row" style={{ background: 'var(--card)', borderRadius: 22, justifyContent: 'space-between' }}>
        <button className="icon-btn" aria-label="이전 달" onClick={() => setMonth(addMonths(month, -1))}>
          <Chevron dir="left" />
        </button>
        <button className="jua" style={{ background: 'transparent', fontSize: 16, minHeight: 44 }} onClick={() => { setMonth(monthStart(now)); setPicked(today); }}>
          {fmtYM(month)}
        </button>
        <button className="icon-btn" aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))}>
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
            return (
              <button key={i} className="cal-day" data-today={d === today} aria-pressed={picked === d} aria-label={`${fmtMD(d)}, 기한인 할 일 ${left.length}개`} onClick={() => setPicked(d)}>
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

      <div className="h2">{fmtMD(picked)} 할 일</div>
      {dueOn(picked).length > 0 && (
        <div className="card" style={{ gap: 2, padding: '6px 6px 6px 12px' }}>
          {dueOn(picked).map((t) => (
            <TodoRow key={t.id} todo={t} now={now} />
          ))}
        </div>
      )}
      <AddTodo key={picked} now={now} fixedDue={picked} />
    </>
  );
}

export function Todos({ now }: { now: number }) {
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
      {view === 'list' ? <ListView now={now} /> : <CalendarView now={now} />}
    </div>
  );
}
