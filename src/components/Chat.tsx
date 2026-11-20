import { useEffect, useRef, useState } from 'react';
import { fmtHM } from '../lib/time';
import type { RawEntry } from '../lib/types';
import { useStore } from '../store';
import { Moa } from './Moa';

const DOW = '일월화수목금토';
const dayKey = (ms: number) => new Date(ms).toDateString();
const dayTitle = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
};

/** 내 말 한 줄: 왼쪽으로 밀면(카톡 답장처럼) 이 말을 고친다. 눌러도 '고치기'가 나온다. */
function Mine({ r, quote, onFix }: { r: RawEntry; quote?: string; onFix: () => void }) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const from = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  return (
    <div className="ch-mine-wrap">
      <span className="ch-hint" style={{ opacity: Math.min(1, -dx / 60) }} aria-hidden="true">
        ↩
      </span>
      <div
        className={`ch-bubble mine${r.fixedBy ? ' old' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : undefined }}
        onPointerDown={(e) => {
          from.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const f = from.current;
          if (!f || f.id !== e.pointerId) return;
          const x = e.clientX - f.x;
          const y = e.clientY - f.y;
          if (Math.abs(y) > Math.abs(x) && !moved.current) return;
          if (Math.abs(x) > 8) moved.current = true;
          setDx(Math.max(-90, Math.min(0, x)));
        }}
        onPointerUp={() => {
          if (dx < -55) onFix();
          else if (!moved.current) setOpen(!open);
          from.current = null;
          setDx(0);
        }}
        onPointerCancel={() => {
          from.current = null;
          setDx(0);
        }}
      >
        {quote && <div className="ch-quote">↩ {quote}</div>}
        {r.text}
      </div>
      <div className="ch-meta">
        {r.fixedBy ? '고침 · ' : ''}
        {fmtHM(r.at)}
        {open && !r.fixedBy && (
          <button className="ch-fix" onClick={onFix}>
            ↩ 이 말 고치기
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 모아와 나눈 말을 채팅처럼(아래가 최신). 내 말을 왼쪽으로 밀면 그 말을 고칠 수 있다:
 * "이거 8시 기록인데 13시로" → 그 말이 남긴 기록만 걷어 내고 다시 적는다.
 */
export function Chat() {
  const raw = useStore((s) => s.raw);
  const setReplyTo = useStore((s) => s.setReplyTo);
  const end = useRef<HTMLDivElement>(null);
  const list = raw.slice(-300);
  const byId = new Map(list.map((r) => [r.id, r]));
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [list.length]);
  if (!list.length) return <div className="empty">모아에게 한 말이 여기 채팅처럼 남아. 잘못 알아들었으면 그 말을 왼쪽으로 밀어서 고쳐 줘.</div>;
  return (
    <div className="chat">
      <div className="hint" style={{ textAlign: 'center' }}>
        잘못 알아들은 말은 왼쪽으로 밀어서 고쳐 줘
      </div>
      {list.map((r, i) => (
        <div key={r.id} className="ch-pair">
          {(i === 0 || dayKey(list[i - 1].at) !== dayKey(r.at)) && <div className="ch-day">{dayTitle(r.at)}</div>}
          <Mine r={r} quote={r.fixOf ? byId.get(r.fixOf)?.text : undefined} onFix={() => setReplyTo(r.id)} />
          {(r.reply || r.action === 'pending') && (
            <div className="ch-theirs">
              <Moa size={28} mood="smile" decorative />
              <div className={`ch-bubble theirs${r.fixedBy ? ' old' : ''}`}>{r.action === 'pending' ? '알아듣는 중…' : r.reply}</div>
            </div>
          )}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
