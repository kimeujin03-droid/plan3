import { useEffect, useState } from 'react';
import { useStore } from '../store';

/** 화면을 주기적으로 다시 그리기 위한 현재 시각. */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function InputBar({ placeholder = '모아야, 나 지금…' }: { placeholder?: string }) {
  const say = useStore((s) => s.say);
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    say(text);
    setText('');
  };
  return (
    <form
      className="inputbar"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
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
  );
}

/** 모아의 마지막 대답과 되돌리기. ttlMs가 지나면 숨긴다. */
export function LastReply({ now, ttlMs = 5 * 60_000 }: { now: number; ttlMs?: number }) {
  const reply = useStore((s) => s.lastReply);
  const thinking = useStore((s) => s.thinking);
  const canUndo = useStore((s) => s.undoData !== null);
  const undo = useStore((s) => s.undo);
  if (!reply || (!thinking && now - reply.at > ttlMs)) return null;
  return (
    <div className="row" aria-live="polite">
      <div className="reply grow">{reply.text}</div>
      {canUndo && !thinking && (
        <button className="pill clear" onClick={undo}>
          되돌리기
        </button>
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
