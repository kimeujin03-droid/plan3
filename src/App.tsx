import { useState } from 'react';
import { InputBar, useNow } from './components/common';
import { activeIntervals } from './lib/intervals';
import { Archive } from './screens/Archive';
import { Clock } from './screens/Clock';
import { Home } from './screens/Home';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Today, type TodayMode } from './screens/Today';
import { useStore } from './store';

type Tab = 'home' | 'today' | 'archive' | 'review';

const TABS: { id: Tab; name: string }[] = [
  { id: 'home', name: '모아' },
  { id: 'today', name: '오늘' },
  { id: 'archive', name: '기록함' },
  { id: 'review', name: '돌아보기' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<'clock' | 'settings' | null>(null);
  const [todayMode, setTodayMode] = useState<TodayMode>('view');
  const running = useStore((s) => activeIntervals(s.intervals).length > 0);
  const now = useNow(running ? 1000 : 20_000);

  return (
    <div className="app">
      {tab === 'home' && (
        <Home
          now={now}
          onOpenToday={(plan) => {
            setTodayMode(plan ? 'plan' : 'view');
            setTab('today');
          }}
          onOpenClock={() => setOverlay('clock')}
          onOpenSettings={() => setOverlay('settings')}
        />
      )}
      {tab === 'today' && <Today now={now} mode={todayMode} setMode={setTodayMode} onOpenClock={() => setOverlay('clock')} />}
      {tab === 'archive' && <Archive now={now} />}
      {tab === 'review' && <Review now={now} />}

      <InputBar />
      <nav className="nav" aria-label="화면">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </nav>

      {overlay === 'clock' && <Clock now={now} onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && <Settings onClose={() => setOverlay(null)} />}
    </div>
  );
}
