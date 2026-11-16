import { useState } from 'react';
import { BlockSheet } from '../components/BlockSheet';
import { Chevron } from '../components/common';
import { Grid } from '../components/Grid';
import { CategoryChips } from '../components/Pickers';
import { WeekGrid } from '../components/WeekGrid';
import { addDays, dayStart, fmtDate, fmtHM, fmtMD, weekStart } from '../lib/time';
import { useStore } from '../store';
import { Review } from './Review';

type View = 'day' | 'week' | 'stats';
type Kind = 'exec' | 'plan' | 'note';

const VIEWS: { id: View; name: string }[] = [
  { id: 'day', name: '하루' },
  { id: 'week', name: '주간 계획' },
  { id: 'stats', name: '돌아보기' },
];

const KINDS: { id: Kind; name: string }[] = [
  { id: 'exec', name: '한 일' },
  { id: 'plan', name: '계획' },
  { id: 'note', name: '메모' },
];

/** 누른 칸의 메모를 쓰는 한 줄 편집기 */
function NoteEditor({ at, onDone }: { at: number; onDone: () => void }) {
  const existing = useStore((s) => s.cellNotes.find((n) => n.at === at)?.text ?? '');
  const setCellNote = useStore((s) => s.setCellNote);
  const [text, setText] = useState(existing);
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        setCellNote(at, text);
        onDone();
      }}
    >
      <div className="tag" style={{ background: 'var(--card)' }}>
        {fmtHM(at)}
      </div>
      <input className="field grow" style={{ background: 'var(--card)' }} aria-label="칸 메모" placeholder="예: 이동 중 피곤함" maxLength={40} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      <button className="pill ink" type="submit">
        {text.trim() || !existing ? '저장' : '지우기'}
      </button>
    </form>
  );
}

function Eraser({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button className="icon-btn eraser" aria-label={`${label} 지우개`} aria-pressed={on} onClick={onToggle}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 16.5l-4.6-4.6a1.4 1.4 0 0 1 0-2L10 3.3a1.4 1.4 0 0 1 2 0l4.7 4.7a1.4 1.4 0 0 1 0 2L10.2 16.5z" />
        <path d="M7 6.5l6.5 6.5" />
        <path d="M6 16.5h11" />
      </svg>
    </button>
  );
}

export function Record({ now }: { now: number }) {
  const activities = useStore((s) => s.activities);
  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(() => dayStart(now));
  const [kind, setKind] = useState<Kind>('exec');
  // 지우개는 지금 고른 종류만 지운다: 한 일이면 한 일만, 계획이면 계획만, 메모면 메모만.
  const [erasing, setErasing] = useState(false);
  const [actId, setActId] = useState(activities[0].id);
  const [noteAt, setNoteAt] = useState<number | null>(null);
  const [detailAt, setDetailAt] = useState<number | null>(null);
  const selected = activities.some((a) => a.id === actId) ? actId : activities[0].id;
  const week = weekStart(day);
  const step = view === 'week' ? 7 : 1;
  const isNow = view === 'week' ? weekStart(now) === week : dayStart(now) === day;
  const kindName = view === 'week' ? '계획' : KINDS.find((k) => k.id === kind)!.name;
  const showChips = !erasing && (view === 'week' || kind !== 'note');

  return (
    <>
      <div className="today-top">
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              aria-pressed={view === v.id}
              onClick={() => {
                setView(v.id);
                setErasing(false);
                setNoteAt(null);
              }}
            >
              {v.name}
            </button>
          ))}
        </div>

        {view !== 'stats' && (
          <>
            <div className="datebar">
              <button aria-label={view === 'week' ? '지난주' : '전날'} onClick={() => setDay(addDays(day, -step))}>
                <Chevron dir="left" />
              </button>
              <button className="jua grow" onClick={() => setDay(dayStart(now))}>
                {view === 'week' ? `${fmtMD(week)} – ${fmtMD(addDays(week, 6))}` : fmtDate(day)}
                {!isNow && <span className="back">{view === 'week' ? '이번 주로' : '오늘로'}</span>}
              </button>
              <button aria-label={view === 'week' ? '다음 주' : '다음 날'} onClick={() => setDay(addDays(day, step))}>
                <Chevron dir="right" />
              </button>
            </div>

            <div className="row" style={{ gap: 8 }}>
              {view === 'day' ? (
                <div className="seg thin grow" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      aria-pressed={kind === k.id}
                      onClick={() => {
                        setKind(k.id);
                        setNoteAt(null);
                      }}
                    >
                      {k.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grow hint">문지르면 한 시간씩 계획이 칠해져. 요일을 누르면 그날로 가.</div>
              )}
              <Eraser
                on={erasing}
                label={kindName}
                onToggle={() => {
                  setErasing(!erasing);
                  setNoteAt(null);
                }}
              />
            </div>

            {erasing && <div className="erase-note">{kindName}만 지우는 중 · 지우개를 다시 누르면 꺼져</div>}
            {showChips && <CategoryChips value={selected} onChange={setActId} />}
            {view === 'day' && kind === 'note' && !erasing && (noteAt === null ? <div className="hint">메모할 칸을 눌러줘.</div> : <NoteEditor key={noteAt} at={noteAt} onDone={() => setNoteAt(null)} />)}
          </>
        )}
      </div>

      {view === 'day' && (
        <div className="screen" style={{ paddingTop: 0 }}>
          <Grid day={day} kind={kind} erasing={erasing} activityId={selected} now={now} onPickCell={setNoteAt} onOpenCell={setDetailAt} />
        </div>
      )}
      {view === 'week' && (
        <div className="screen" style={{ paddingTop: 0 }}>
          <WeekGrid
            week={week}
            erasing={erasing}
            activityId={selected}
            now={now}
            onOpenDay={(d) => {
              setDay(d);
              setView('day');
              setKind('plan');
              setErasing(false);
            }}
          />
        </div>
      )}
      {view === 'stats' && <Review now={now} />}
      {detailAt !== null && <BlockSheet key={detailAt} at={detailAt} now={now} onClose={() => setDetailAt(null)} />}
    </>
  );
}
