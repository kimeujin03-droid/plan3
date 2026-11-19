import { useState } from 'react';
import { CELL, DAY, dayStart, fmtDur, fmtHM } from '../lib/time';
import type { Interval, Memory } from '../lib/types';
import { useStore } from '../store';
import { CategoryChips } from './Pickers';

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
const MIN = 60_000;

/** 분 단위 시각 고르기: [−] 10:03 [+] — 가운데를 누르면 시계가 열린다 */
function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (ms: number) => void }) {
  return (
    <div className="tf">
      <span className="tf-label">{label}</span>
      <div className="tf-row">
        <button type="button" aria-label={`${label} 1분 앞으로`} onClick={() => onChange(value - MIN)}>
          −
        </button>
        <label className="tf-time">
          <span className="jua">{hm(value)}</span>
          <input
            type="time"
            step={60}
            aria-label={label}
            value={hm(value)}
            onChange={(e) => {
              const m = /^(\d{2}):(\d{2})/.exec(e.target.value);
              if (m) onChange(dayStart(value) + (Number(m[1]) * 60 + Number(m[2])) * MIN);
            }}
          />
        </label>
        <button type="button" aria-label={`${label} 1분 뒤로`} onClick={() => onChange(value + MIN)}>
          +
        </button>
      </div>
    </div>
  );
}

/** 이 일정에 붙은 한마디: 연결된 것, 없으면 시각이 꼭 같은 것 */
export function memoOf(memories: Memory[], iv: Interval, now: number): Memory | undefined {
  return memories.find((m) => m.intervalId === iv.id) ?? memories.find((m) => !m.intervalId && m.start === iv.start && m.end === (iv.end ?? now));
}

/**
 * 칸을 꾸욱: 그 칸의 일정(한 일·계획)을 고친다. 활동, 시작·끝(1분 단위), 그 일정에 대한 한마디.
 * 칸에 일정이 여럿이면 위에서 고른다. 다른 한마디나 새 한마디는 아래에서.
 */
export function SlotSheet({
  at,
  ivs,
  now,
  onMemo,
  onClose,
}: {
  at: number;
  ivs: Interval[];
  now: number;
  /** 한마디 창 열기(사진·장소·기분까지). null이면 이 칸에 새로 */
  onMemo: (m: Memory | null) => void;
  onClose: () => void;
}) {
  const activities = useStore((s) => s.activities);
  const memories = useStore((s) => s.memories);
  const edit = useStore((s) => s.editInterval);
  const remove = useStore((s) => s.removeInterval);
  const [pick, setPick] = useState(ivs[0].id);
  const iv = ivs.find((x) => x.id === pick) ?? ivs[0];
  const linked = memoOf(memories, iv, now);
  const [act, setAct] = useState(iv.activityId);
  const [start, setStart] = useState(iv.start);
  const [end, setEnd] = useState<number | null>(iv.end);
  const [memo, setMemo] = useState(linked?.text ?? '');
  const name = (id: string) => activities.find((a) => a.id === id)?.name ?? '';
  const color = (id: string) => activities.find((a) => a.id === id)?.color;
  const running = end === null;
  const endMs = end ?? now;
  const bad = !running && endMs <= start;
  const others = memories.filter((m) => m.start < at + CELL && m.end > at && m.id !== linked?.id);

  const choose = (x: Interval) => {
    setPick(x.id);
    setAct(x.activityId);
    setStart(x.start);
    setEnd(x.end);
    setMemo(memoOf(memories, x, now)?.text ?? '');
  };
  // 끝을 시작보다 앞으로 고르면 다음 날로 본다(밤샘·수면)
  const setEndFixed = (ms: number) => setEnd(ms <= start && ms + DAY - start < DAY ? ms + DAY : ms);

  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet range-sheet" role="dialog" aria-modal="true" aria-label="이 일정 고치기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            {fmtHM(at)} 일정
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>

        {ivs.length > 1 && (
          <div className="chips wrap" role="group" aria-label="고칠 일정">
            {ivs.map((x) => (
              <button key={x.id} className="chip" style={{ background: color(x.activityId) }} aria-pressed={x.id === iv.id} onClick={() => choose(x)}>
                {name(x.activityId)} · {x.kind === 'plan' ? '계획' : '한 일'}
              </button>
            ))}
          </div>
        )}

        <div className="sub" style={{ fontSize: 13 }}>
          {iv.kind === 'plan' ? '계획' : '한 일'} · {running ? `${fmtHM(start)}부터 하는 중` : `${fmtHM(start)}–${fmtHM(endMs)} · ${fmtDur(endMs - start)}`}
        </div>

        <div className="tf-pair">
          <TimeField label="시작" value={start} onChange={setStart} />
          {running ? (
            <div className="tf">
              <span className="tf-label">끝</span>
              <button className="pill ink" style={{ minHeight: 44 }} onClick={() => setEnd(Math.floor(now / MIN) * MIN)}>
                지금 끝내기
              </button>
            </div>
          ) : (
            <TimeField label="끝" value={endMs} onChange={setEndFixed} />
          )}
        </div>
        {bad && <div className="hint" style={{ color: '#8a2444' }}>끝이 시작보다 뒤여야 해.</div>}

        <CategoryChips value={act} onChange={setAct} />

        <textarea
          className="field memo-text"
          aria-label="이 일정 한마디"
          rows={3}
          maxLength={1000}
          placeholder="이 일정에 대한 한마디 (선택)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        {linked && (linked.photos.length > 0 || linked.place || linked.people || linked.mood) && (
          <div className="hint">사진·장소·기분이 붙어 있어. 아래 '자세히'에서 볼 수 있어.</div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button
            className="pill"
            style={{ background: 'var(--bg)', minHeight: 52, padding: '0 16px' }}
            onClick={() => {
              remove(iv.id);
              onClose();
            }}
          >
            지우기
          </button>
          <button
            className="big-btn ink grow"
            disabled={bad}
            onClick={() => {
              edit(iv.id, { activityId: act, start, end, memo });
              onClose();
            }}
          >
            고치기
          </button>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {linked && (
            <button className="pill clear" style={{ minHeight: 36 }} onClick={() => onMemo(linked)}>
              한마디 자세히 (사진·장소·기분)
            </button>
          )}
          {others.map((m) => (
            <button key={m.id} className="pill clear" style={{ minHeight: 36 }} onClick={() => onMemo(m)}>
              💬 {m.text.slice(0, 12) || '한마디'} 고치기
            </button>
          ))}
          <button className="pill clear" style={{ minHeight: 36 }} onClick={() => onMemo(null)}>
            + 이 칸에 새 한마디
          </button>
        </div>
      </div>
    </div>
  );
}
