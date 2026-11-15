import { useState } from 'react';
import { intentProgress } from '../lib/intents';
import { DAY, dayStart, fmtDur, fmtHM, fmtMD, MIN, startedAfter } from '../lib/time';
import { useStore } from '../store';

type Tab = 'intents' | 'plans' | 'raw';

export function Archive({ now }: { now: number }) {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('intents');
  const byId = new Map(s.activities.map((a) => [a.id, a]));

  return (
    <div className="screen">
      <div className="title">기록함</div>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <button aria-pressed={tab === 'intents'} onClick={() => setTab('intents')}>
          하려던 일
        </button>
        <button aria-pressed={tab === 'plans'} onClick={() => setTab('plans')}>
          계획 변화
        </button>
        <button aria-pressed={tab === 'raw'} onClick={() => setTab('raw')}>
          내가 한 말
        </button>
      </div>

      {tab === 'intents' && (
        <>
          {s.intents.length === 0 && (
            <div className="empty">"논문 써야지"처럼 말하면 여기에 쌓여. 시작한 것과는 따로 적어둘게.</div>
          )}
          {[...s.intents].reverse().map((it) => {
            const p = intentProgress(it, s.intervals, now);
            const color = it.activityId ? byId.get(it.activityId)?.color ?? '#D5D9E8' : '#D5D9E8';
            const status = p.meaningfulAt
              ? startedAfter(p.meaningfulAt - p.firstMention)
              : `${Math.floor((now - p.firstMention) / DAY) + 1}일째`;
            return (
              <div className="card" key={it.id}>
                <div className="row between">
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <div className="swatch" style={{ background: color }} />
                    <div className="h2">{it.label}</div>
                  </div>
                  <div className="tag">{status}</div>
                </div>
                <div className="dots">
                  {it.mentions.slice(-4).map((m, i) => (
                    <span key={m} style={{ display: 'contents' }}>
                      {i > 0 && <u />}
                      <b style={{ background: color }}>{fmtMD(m)} 말함</b>
                    </span>
                  ))}
                  {p.firstAttemptAt !== null && (
                    <>
                      <u />
                      <b style={{ background: '#26233A', color: '#fff' }}>
                        {fmtMD(p.firstAttemptAt)} {p.meaningfulAt ? '시작' : '잠깐 해봄'}
                      </b>
                    </>
                  )}
                </div>
                <div className="sub">
                  {it.mentions.length}번 말함
                  {!it.activityId && ' · 활동과 이어지지 않아 시작 여부는 알 수 없어'}
                  {it.activityId && !p.meaningfulAt && ' · 본격적으로 시작한 기록은 아직 없어'}
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'plans' && <Plans now={now} />}

      {tab === 'raw' && (
        <>
          {s.raw.length === 0 && <div className="empty">모아에게 한 말이 원문 그대로 여기에 남아.</div>}
          {[...s.raw]
            .reverse()
            .slice(0, 200)
            .map((r) => (
              <div className="card" key={r.id} style={{ gap: 6 }}>
                <div className="sub">
                  {fmtMD(r.at)} {fmtHM(r.at)}
                </div>
                <div style={{ fontSize: 15 }}>{r.text}</div>
                <div className="sub">모아: {r.reply}</div>
              </div>
            ))}
        </>
      )}
    </div>
  );

  function Plans({ now }: { now: number }) {
    const days = [...new Set(s.planVersions.map((v) => v.day))].sort((a, b) => b - a).slice(0, 14);
    if (!days.length) {
      return <div className="empty">오늘 칸에 계획을 칠하면 아침 원본과 바뀐 흐름이 여기에 남아.</div>;
    }
    return (
      <>
        {days.map((day) => {
          const vs = s.planVersions.filter((v) => v.day === day);
          const done: Record<string, number> = {};
          for (const iv of s.intervals) {
            if (iv.kind !== 'exec') continue;
            const a = Math.max(iv.start, day);
            const b = Math.min(iv.end ?? now, day + DAY);
            if (b > a) done[iv.activityId] = (done[iv.activityId] ?? 0) + (b - a);
          }
          const planned = new Set(vs.flatMap((v) => v.items.map((i) => i.activityId)));
          return (
            <div className="card" key={day} style={{ gap: 12 }}>
              <div className="h2">{day === dayStart(now) ? '오늘' : fmtMD(day)} 계획이 바뀐 흐름</div>
              {vs.map((v, i) => {
                const prevAt = i > 0 ? vs[i - 1].at : day;
                const moods = s.notes.filter((n) => n.kind === 'mood' && n.at > prevAt && n.at <= v.at + 5 * MIN);
                return (
                  <div className="kv" key={v.version}>
                    <div>
                      {i === 0 ? '처음' : '바꿈'} {fmtHM(v.at)}
                    </div>
                    <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        {v.items.length
                          ? v.items.map((it) => `${byId.get(it.activityId)?.name ?? '활동'} ${fmtDur(it.minutes * MIN)}`).join(' · ')
                          : '계획 비움'}
                      </div>
                      {i > 0 &&
                        moods.map((m) => (
                          <div key={m.id} className="reply" style={{ background: 'var(--bg)', alignSelf: 'flex-start', fontSize: 13, padding: '6px 10px' }}>
                            {m.text}
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
              <div className="kv">
                <div>적힌 실행</div>
                <div className="grow">
                  {[...planned]
                    .map((id) => `${byId.get(id)?.name ?? '활동'} ${done[id] ? fmtDur(done[id]) : '기록 없음'}`)
                    .join(' · ') || '기록 없음'}
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }
}
