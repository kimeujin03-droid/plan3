import { useState } from 'react';
import { CELL, fmtDur, fmtHM, fmtMD } from '../lib/time';
import type { Interval } from '../lib/types';
import { useStore } from '../store';
import { MemoryCard } from './Memories';

const SOURCE: Record<Interval['source'], string> = { paint: '칠해서', timer: '타이머로', chat: '말로' };

/**
 * 격자의 한 칸을 길게 눌렀을 때 뜨는 상세 시트.
 * 그 10분에 걸친 기록을 분 단위 실제 시각으로 보여주고, 메모와 삭제는 여기서만 한다.
 */
export function BlockSheet({ at, now, onClose }: { at: number; now: number; onClose: () => void }) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const samples = useStore((s) => s.samples);
  const note = useStore((s) => s.cellNotes.find((n) => n.at === at)?.text ?? '');
  const setCellNote = useStore((s) => s.setCellNote);
  const removeInterval = useStore((s) => s.removeInterval);
  const memories = useStore((s) => s.memories).filter((m) => m.start < at + CELL && m.end > at);
  const removeMemory = useStore((s) => s.removeMemory);
  const [text, setText] = useState(note);
  const here = intervals
    .filter((iv) => iv.start < at + CELL && (iv.end ?? now) > at)
    .sort((a, b) => (a.kind === b.kind ? a.start - b.start : a.kind === 'exec' ? -1 : 1));
  const act = (id: string) => activities.find((a) => a.id === id);
  const save = () => {
    if (text.trim() !== note) setCellNote(at, text);
  };

  return (
    <div
      className="sheet-back"
      // 길게 누르던 손가락을 떼는 순간의 click으로 바로 닫히지 않게, 새로 누를 때만 닫는다.
      onPointerDown={() => {
        save();
        onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="이 시간의 기록" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 18 }}>
            {fmtMD(at)} {fmtHM(at)}–{fmtHM(at + CELL)}
          </div>
          <button
            className="pill"
            style={{ background: 'var(--bg)' }}
            onClick={() => {
              save();
              onClose();
            }}
          >
            닫기
          </button>
        </div>

        {here.length === 0 && <div className="sub">이 시간의 기록은 아직 없어.</div>}
        {here.map((iv) => {
          const end = iv.end ?? now;
          const focus = samples.filter((m) => m.kind === 'focus' && m.activityId === iv.activityId && m.at >= iv.start && m.at <= end).map((m) => m.value);
          return (
            <div key={iv.id} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <div className={iv.kind === 'plan' ? 'swatch planned' : 'swatch'} style={{ background: iv.kind === 'plan' ? 'transparent' : act(iv.activityId)?.color, borderColor: act(iv.activityId)?.color, marginTop: 4 }} />
              <div className="grow">
                <div style={{ fontSize: 15 }}>
                  {act(iv.activityId)?.name ?? '활동'} <span className="tag">{iv.kind === 'plan' ? '계획' : '한 일'}</span>
                </div>
                <div className="sub" style={{ fontSize: 13 }}>
                  {fmtHM(iv.start)}–{iv.end === null ? '지금' : fmtHM(iv.end)} · {fmtDur(end - iv.start)} · {SOURCE[iv.source]} 적음
                  {focus.length > 0 && ` · 집중 ${(focus.reduce((a, b) => a + b, 0) / focus.length).toFixed(1)} (${focus.length}번)`}
                </div>
              </div>
              <button className="pill clear" aria-label={`${act(iv.activityId)?.name ?? '활동'} ${iv.kind === 'plan' ? '계획' : '기록'} 지우기`} onClick={() => removeInterval(iv.id)}>
                지우기
              </button>
            </div>
          );
        })}

        {memories.map((m) => (
          <MemoryCard key={m.id} m={m} onRemove={() => removeMemory(m.id)} />
        ))}

        <input className="field" aria-label="이 칸의 메모" placeholder="메모 (예: 이동 중 피곤함)" maxLength={40} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} />
      </div>
    </div>
  );
}
