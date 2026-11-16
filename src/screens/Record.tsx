import { useState } from 'react';
import { Chevron } from '../components/common';
import { Grid } from '../components/Grid';
import { CategoryChips } from '../components/Pickers';
import { WeekGrid } from '../components/WeekGrid';
import { addDays, dayStart, fmtDate, fmtHM, fmtMD, weekStart } from '../lib/time';
import type { PaintMode } from '../lib/types';
import { useStore } from '../store';
import { Review } from './Review';

type View = 'day' | 'week' | 'stats';
type Mode = PaintMode | 'note';

const VIEWS: { id: View; name: string }[] = [
  { id: 'day', name: '하루' },
  { id: 'week', name: '주간' },
  { id: 'stats', name: '돌아보기' },
];

const MODES: { id: Mode; name: string }[] = [
  { id: 'exec', name: '한 일' },
  { id: 'plan', name: '계획' },
  { id: 'note', name: '메모' },
  { id: 'erase', name: '지우개' },
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
        {fmtMD(at)} {fmtHM(at)}
      </div>
      <input className="field grow" style={{ background: 'var(--card)' }} aria-label="칸 메모" placeholder="예: 이동 중 피곤함" maxLength={40} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      <button className="pill ink" type="submit">
        {text.trim() || !existing ? '저장' : '지우기'}
      </button>
    </form>
  );
}

export function Record({ now }: { now: number }) {
  const activities = useStore((s) => s.activities);
  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(() => dayStart(now));
  const [mode, setMode] = useState<Mode>('exec');
  const [actId, setActId] = useState(activities[0].id);
  const [noteAt, setNoteAt] = useState<number | null>(null);
  const selected = activities.some((a) => a.id === actId) ? actId : activities[0].id;
  const week = weekStart(day);
  const step = view === 'week' ? 7 : 1;
  const isNow = view === 'week' ? weekStart(now) === week : dayStart(now) === day;

  return (
    <>
      <div className="today-top">
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {VIEWS.map((v) => (
            <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.name}
            </button>
          ))}
        </div>

        {view !== 'stats' && (
          <>
            <div className="row between">
              <button className="icon-btn" aria-label={view === 'week' ? '지난주' : '전날'} onClick={() => setDay(addDays(day, -step))}>
                <Chevron dir="left" />
              </button>
              <button className="pill jua" style={{ fontSize: 16 }} onClick={() => setDay(dayStart(now))}>
                {view === 'week' ? `${fmtMD(week)} – ${fmtMD(addDays(week, 6))}` : fmtDate(day)}
                {isNow ? '' : view === 'week' ? ' · 이번 주로' : ' · 오늘로'}
              </button>
              <button className="icon-btn" aria-label={view === 'week' ? '다음 주' : '다음 날'} onClick={() => setDay(addDays(day, step))}>
                <Chevron dir="right" />
              </button>
            </div>

            <div className="seg" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  aria-pressed={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setNoteAt(null);
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>

            {(mode === 'exec' || mode === 'plan') && <CategoryChips value={selected} onChange={setActId} />}
            {mode === 'note' &&
              (noteAt === null ? (
                <div className="sub">메모할 칸을 눌러줘.</div>
              ) : (
                <NoteEditor key={noteAt} at={noteAt} onDone={() => setNoteAt(null)} />
              ))}
          </>
        )}
      </div>

      {view === 'day' && (
        <div className="screen" style={{ paddingTop: 4 }}>
          <Grid day={day} mode={mode} activityId={selected} now={now} onPickCell={setNoteAt} />
        </div>
      )}
      {view === 'week' && (
        <div className="screen" style={{ paddingTop: 4 }}>
          <WeekGrid
            week={week}
            mode={mode}
            activityId={selected}
            now={now}
            onPickCell={setNoteAt}
            onOpenDay={(d) => {
              setDay(d);
              setView('day');
            }}
          />
        </div>
      )}
      {view === 'stats' && <Review now={now} />}
    </>
  );
}
