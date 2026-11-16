import { useState } from 'react';
import { Chevron } from '../components/common';
import { addDays, addMonths, dayStart, fmtDue, fmtMD, fmtYM, fromDateInput, monthStart, toDateInput } from '../lib/time';
import type { Todo } from '../lib/types';
import { useStore } from '../store';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export function TodoRow({ todo, now }: { todo: Todo; now: number }) {
  const toggle = useStore((s) => s.toggleTodo);
  const remove = useStore((s) => s.removeTodo);
  const late = !todo.done && todo.due !== null && todo.due < dayStart(now);
  // 지우기는 완료와 헷갈리지 않게, 글자를 눌러 펼쳤을 때만 보인다.
  const [open, setOpen] = useState(false);
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
      {todo.due !== null && !todo.done && <div className={late ? 'tag late' : 'tag'}>{late ? '기한 지남 · ' : ''}{fmtDue(todo.due, now)}</div>}
      {open && (
        <button className="pill" style={{ background: 'var(--bg)', marginRight: 6 }} onClick={() => remove(todo.id)}>
          지우기
        </button>
      )}
    </div>
  );
}

function AddTodo({ now, fixedDue }: { now: number; fixedDue?: number }) {
  const addTodo = useStore((s) => s.addTodo);
  const [text, setText] = useState('');
  const [due, setDue] = useState<number | null>(null);
  const today = dayStart(now);
  const quick: { label: string; value: number | null }[] = [
    { label: '기한 없음', value: null },
    { label: '오늘', value: today },
    { label: '내일', value: addDays(today, 1) },
  ];
  const custom = due !== null && due !== today && due !== addDays(today, 1);
  return (
    <form
      className="card"
      style={{ gap: 8, padding: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        addTodo(text, fixedDue ?? due);
        setText('');
      }}
    >
      <div className="row">
        <input className="field grow" aria-label="할 일" placeholder={fixedDue !== undefined ? `${fmtMD(fixedDue)}까지 할 일` : '할 일 적기'} maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="pill ink" type="submit">
          추가
        </button>
      </div>
      {fixedDue === undefined && (
        <div className="chips">
          {quick.map((q) => (
            <button key={q.label} type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={due === q.value} onClick={() => setDue(q.value)}>
              {q.label}
            </button>
          ))}
          <label className="chip datechip" style={{ background: 'var(--bg)' }} data-on={custom}>
            {custom && due !== null ? fmtMD(due) : '날짜'}
            <input type="date" aria-label="기한 날짜" value={due !== null ? toDateInput(due) : ''} onChange={(e) => setDue(fromDateInput(e.target.value))} />
          </label>
        </div>
      )}
    </form>
  );
}

function Group({ title, todos, now }: { title: string; todos: Todo[]; now: number }) {
  if (!todos.length) return null;
  return (
    <div className="card" style={{ gap: 2, padding: '10px 6px 6px 12px' }}>
      <div className="sub" style={{ fontSize: 13 }}>
        {title}
      </div>
      {todos.map((t) => (
        <TodoRow key={t.id} todo={t} now={now} />
      ))}
    </div>
  );
}

function ListView({ now }: { now: number }) {
  const todos = useStore((s) => s.todos);
  const [showDone, setShowDone] = useState(false);
  const today = dayStart(now);
  const open = todos.filter((t) => !t.done);
  const byDue = (a: Todo, b: Todo) => (a.due ?? Infinity) - (b.due ?? Infinity);
  const done = todos.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return (
    <>
      <AddTodo now={now} />
      {open.length === 0 && done.length === 0 && <div className="empty">할 일을 적거나, 모아에게 "금요일까지 과제 제출"처럼 말해줘.</div>}
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
          목록
        </button>
        <button aria-pressed={view === 'cal'} onClick={() => setView('cal')}>
          달력
        </button>
      </div>
      {view === 'list' ? <ListView now={now} /> : <CalendarView now={now} />}
    </div>
  );
}
