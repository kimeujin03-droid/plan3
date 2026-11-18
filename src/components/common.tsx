import { useEffect, useRef, useState } from 'react';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { fmtClock, HOUR } from '../lib/time';
import { useStore } from '../store';
import { Moa } from './Moa';
import { looksLikeWeekRequest } from '../lib/weekplan';
import { WeekPlanSheet } from './WeekPlanSheet';

/** 화면을 주기적으로 다시 그리기 위한 현재 시각. */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const STUDYISH = /(과제|숙제|시험|레포트|리포트|복습|예습|퀴즈|발표|중간|기말|공부)/;

/**
 * 입력하는 동안 아래에 뜨는 추천 칩.
 * "과제"처럼 공부에 딸린 말을 치면 과목(공부의 하위 활동)이 줄줄이 뜨고, 누르면 "수치해석 과제"가 된다.
 * 그 밖에는 치던 단어로 시작하는 활동 이름을 보여준다.
 */
function Suggestions({ text, onPick }: { text: string; onPick: (next: string) => void }) {
  const activities = useStore((s) => s.activities);
  const addActivity = useStore((s) => s.addActivity);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const t = text.trim();
  if (!t) return null;
  const study = activities.find((a) => a.id === 'study') ?? activities.find((a) => a.name === '공부');
  const subjects = study ? activities.filter((a) => a.parentId === study.id) : [];
  const hasSubject = subjects.some((a) => t.includes(a.name));

  let chips: { label: string; next: string; color?: string }[] = [];
  let subjectMode = false;
  if (STUDYISH.test(t) && !hasSubject && study) {
    subjectMode = true;
    chips = subjects.map((a) => ({ label: a.name, next: `${a.name} ${t}`, color: a.color }));
  } else {
    const last = t.split(/\s+/).pop() ?? '';
    if (last.length >= 1)
      chips = activities
        .filter((a) => a.name.startsWith(last) && a.name !== last)
        .slice(0, 6)
        .map((a) => ({ label: a.name, next: `${t.slice(0, t.length - last.length)}${a.name} `, color: a.color }));
  }
  if (!chips.length && !subjectMode) return null;

  return (
    <div className="suggest" role="group" aria-label="추천">
      {subjectMode && <span className="suggest-hint">어느 과목?</span>}
      {chips.map((c) => (
        <button key={c.label} type="button" className="chip" style={{ background: c.color }} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c.next)}>
          {c.label}
        </button>
      ))}
      {subjectMode &&
        study &&
        (adding ? (
          <span className="suggest-add">
            <input
              aria-label="새 과목 이름"
              placeholder="과목 이름"
              maxLength={20}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const n = name.trim();
                if (!n) return;
                addActivity(n, study.id);
                setAdding(false);
                setName('');
                onPick(`${n} ${t}`);
              }}
            />
          </span>
        ) : (
          <button type="button" className="chip" style={{ background: 'var(--bg)' }} onMouseDown={(e) => e.preventDefault()} onClick={() => setAdding(true)}>
            + 과목
          </button>
        ))}
    </div>
  );
}

export function InputBar({ placeholder = '모아야, 나 지금…' }: { placeholder?: string }) {
  const say = useStore((s) => s.say);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const [week, setWeek] = useState<string | null>(null);
  const send = () => {
    if (!text.trim()) return;
    // 한 주 일정을 길게 부탁하면 한 주 짜기 창으로 넘긴다.
    if (looksLikeWeekRequest(text)) {
      setWeek(text);
      setText('');
      return;
    }
    say(text);
    setText('');
  };
  return (
    <div className="inputwrap">
      {week !== null && <WeekPlanSheet initialText={week} onClose={() => setWeek(null)} />}
      <Suggestions
        text={text}
        onPick={(next) => {
          setText(next);
          field.current?.focus();
        }}
      />
      <form
        className="inputbar"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={field}
          aria-label="모아에게 말하기"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="send"
          autoComplete="off"
        />
        <button className="send" type="submit" aria-label="보내기">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 16V4" />
            <path d="M5 9l5-5 5 5" />
          </svg>
        </button>
      </form>
    </div>
  );
}

const TOAST_MS = 3500;
const TOAST_UNDO_MS = 6000;

/**
 * 모아의 한마디. 화면을 밀어내지 않고 입력창 위에 잠깐 떴다가 스스로 사라진다.
 * 되돌릴 수 있는 일이면 그동안 되돌리기 버튼을 같이 보여준다.
 */
export function Toast() {
  const reply = useStore((s) => s.lastReply);
  const thinking = useStore((s) => s.thinking);
  const canUndo = useStore((s) => s.undoData !== null);
  const undo = useStore((s) => s.undo);
  const dismiss = useStore((s) => s.dismissReply);
  const showUndo = !!reply?.undo && canUndo && !thinking;

  useEffect(() => {
    if (!reply || thinking) return;
    const t = setTimeout(dismiss, showUndo ? TOAST_UNDO_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [reply, thinking, showUndo, dismiss]);

  if (!reply) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <button className="toast-text" onClick={dismiss} aria-label={`${reply.text} 닫기`}>
        {reply.text}
      </button>
      {showUndo && (
        <button className="toast-undo" onClick={undo}>
          되돌리기
        </button>
      )}
    </div>
  );
}

const LONG_RUN_MS = 3 * HOUR;
const SNOOZE_MS = 2 * HOUR;

/**
 * 지금 돌고 있는 타이머를 어느 화면에서나 보여준다.
 * 3시간 넘게 켜져 있으면 끄는 걸 잊었는지 한 번 묻는다.
 */
export function RunningBar({ now, onOpen, pills = true }: { now: number; onOpen: () => void; pills?: boolean }) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const end = useStore((s) => s.endActivity);
  const endAt = useStore((s) => s.endActivityAt);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const running = activeIntervals(intervals).filter((iv) => iv.activityId !== SLEEP_ID);
  if (!running.length) return null;
  const act = (id: string) => activities.find((a) => a.id === id);
  const stale = running.find((iv) => now - iv.start >= LONG_RUN_MS && (snoozed[iv.id] ?? 0) < now);
  if (!stale && !pills) return null;

  return (
    <div className="running">
      {stale && (
        <div className="stale">
          <div style={{ fontSize: 14 }}>아직 {act(stale.activityId)?.name} 하는 중이야?</div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="pill" onClick={() => setSnoozed({ ...snoozed, [stale.id]: now + SNOOZE_MS })}>
              응
            </button>
            <button className="pill" onClick={() => endAt(stale.activityId, now - HOUR)}>
              1시간 전에 끝남
            </button>
            <button className="pill ink" onClick={() => end(stale.activityId)}>
              지금 끝
            </button>
          </div>
        </div>
      )}
      {pills && (
      <div className="row" style={{ gap: 6 }}>
        {running.map((iv) => (
          <button key={iv.id} className="run-pill" style={{ background: act(iv.activityId)?.color }} onClick={onOpen}>
            <span className="peek" aria-hidden="true">
              <Moa size={34} mood="focus" decorative />
            </span>
            <span className="grow" style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {act(iv.activityId)?.name}
            </span>
            <span className="jua">{fmtClock(now - iv.start)}</span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

export function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={dir === 'left' ? '8,2 2,8 8,14' : '2,2 8,8 2,14'} />
    </svg>
  );
}
