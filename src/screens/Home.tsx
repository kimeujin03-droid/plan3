import { LastReply } from '../components/common';
import { Moa } from '../components/Moa';
import { intentProgress } from '../lib/intents';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { DAY, dayStart, fmtClock, fmtDate } from '../lib/time';
import { useStore } from '../store';

interface Props {
  now: number;
  onOpenToday: (plan?: boolean) => void;
  onOpenClock: () => void;
  onOpenSettings: () => void;
}

export function Home({ now, onOpenToday, onOpenClock, onOpenSettings }: Props) {
  const s = useStore();
  const active = activeIntervals(s.intervals);
  const working = active.filter((iv) => iv.activityId !== SLEEP_ID);
  const nameOf = (id: string) => s.activities.find((a) => a.id === id)?.name ?? '활동';
  const colorOf = (id: string) => s.activities.find((a) => a.id === id)?.color ?? '#ffffff';

  const day = dayStart(now);
  const plannedToday = new Set(
    s.intervals.filter((iv) => iv.kind === 'plan' && iv.start < day + DAY && (iv.end ?? 0) > day).map((iv) => iv.activityId),
  ).size;
  const openIntents = s.intents.filter((it) => intentProgress(it, s.intervals, now).meaningfulAt === null).length;

  let hello = '안녕! 지금 뭐 해?';
  let sub = '말해주면 내가 오늘 칸에 칠해둘게';
  if (s.sleeping) {
    hello = '쿨쿨…';
    sub = '일어나면 "일어났어"라고 말해줘';
  } else if (working.length) {
    hello = `${working.map((iv) => nameOf(iv.activityId)).join(' + ')} 하는 중`;
    sub = '조용히 있을게';
  }

  // 자주 쓰는 말: 기록이 많은 활동 두 개를 시작 버튼으로.
  const usage = new Map<string, number>();
  for (const iv of s.intervals) if (iv.kind === 'exec') usage.set(iv.activityId, (usage.get(iv.activityId) ?? 0) + 1);
  const starters = s.activities
    .filter((a) => a.id !== SLEEP_ID && !working.some((iv) => iv.activityId === a.id))
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
    .slice(0, 2);

  return (
    <div className="screen">
      <div className="row between">
        <div className="jua" style={{ fontSize: 20 }}>
          {fmtDate(now)}
        </div>
        <button className="icon-btn" aria-label="설정" onClick={onOpenSettings}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="2" y1="5" x2="16" y2="5" />
            <line x1="2" y1="13" x2="16" y2="13" />
            <circle cx="6" cy="5" r="2" fill="#fff" />
            <circle cx="12" cy="13" r="2" fill="#fff" />
          </svg>
        </button>
      </div>

      <div style={{ alignSelf: 'center', marginTop: 12 }}>
        <Moa size={16} bob={!s.sleeping && !working.length} closed={s.sleeping || working.length > 0} />
      </div>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <div className="jua" style={{ fontSize: 26 }}>
          {hello}
        </div>
        <div className="sub" style={{ fontSize: 15, marginTop: 6 }}>
          {sub}
        </div>
      </div>

      <LastReply now={now} />

      {working.map((iv) => (
        <button
          key={iv.id}
          className="card"
          style={{ background: colorOf(iv.activityId), flexDirection: 'row', alignItems: 'center', textAlign: 'left' }}
          onClick={onOpenClock}
        >
          <span className="grow">
            <span className="sub" style={{ color: 'var(--ink)' }}>
              시계 보기
            </span>
            <br />
            <span style={{ fontSize: 15 }}>{nameOf(iv.activityId)}</span>
          </span>
          <span className="jua" style={{ fontSize: 26 }}>
            {fmtClock(now - iv.start)}
          </span>
        </button>
      ))}

      <div className="quick">
        {s.sleeping ? (
          <button style={{ background: '#FFE169' }} onClick={() => s.say('나 일어났어')}>
            나 일어났어
          </button>
        ) : (
          <button style={{ background: '#D5D9E8' }} onClick={() => s.say('나 잘게')}>
            나 잘게
          </button>
        )}
        {starters.map((a) => (
          <button key={a.id} style={{ background: a.color }} onClick={() => s.startActivity(a.id)}>
            {a.name} 시작
          </button>
        ))}
        <button style={{ background: '#fff' }} onClick={() => onOpenToday(true)}>
          오늘 계획 칠하기
        </button>
      </div>

      <button
        className="card"
        style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left' }}
        onClick={() => onOpenToday()}
      >
        <span className="grow">
          <span className="sub">오늘</span>
          <br />
          <span style={{ fontSize: 15 }}>
            계획 {plannedToday}가지 · 하려던 일 {openIntents}개
          </span>
        </span>
        <span className="jua" style={{ fontSize: 15 }}>
          칸 보기 ›
        </span>
      </button>
    </div>
  );
}
