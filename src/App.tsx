import { Capacitor } from '@capacitor/core';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { InputBar, useNow } from './components/common';
import { Moa } from './components/Moa';
import { activeIntervals } from './lib/intervals';
import { flushStorage } from './lib/storage';
import { Archive } from './screens/Archive';
import { Clock } from './screens/Clock';
import { Home } from './screens/Home';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Today, type TodayMode } from './screens/Today';
import { useStore } from './store';

type Tab = 'home' | 'today' | 'archive' | 'review';
type Overlay = 'clock' | 'settings' | null;

const TABS: { id: Tab; name: string }[] = [
  { id: 'home', name: '모아' },
  { id: 'today', name: '오늘' },
  { id: 'archive', name: '기록함' },
  { id: 'review', name: '돌아보기' },
];

/** 화면 어딘가에서 오류가 나도 흰 화면 대신 다시 시작할 길을 준다. 기록은 건드리지 않는다. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot" role="alert">
        <Moa size={10} closed />
        <div className="jua" style={{ fontSize: 22 }}>
          앗, 화면을 그리다 넘어졌어
        </div>
        <div className="sub" style={{ fontSize: 14 }}>
          기록은 그대로 있어. 다시 열어볼게.
        </div>
        <button className="big-btn ink" style={{ padding: '0 28px' }} onClick={() => window.location.reload()}>
          다시 열기
        </button>
      </div>
    );
  }
}

function useHydrated(): boolean {
  const [ok, setOk] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setOk(true);
    return useStore.persist.onFinishHydration(() => setOk(true));
  }, []);
  return ok;
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [todayMode, setTodayMode] = useState<TodayMode>('view');
  const running = useStore((s) => activeIntervals(s.intervals).length > 0);
  const now = useNow(running ? 1000 : 20_000);

  // 뒤로가기 버튼: 열린 창 닫기 → 첫 화면 → 앱을 뒤로 보내기. 최신 상태를 ref로 읽는다.
  const nav = useRef({ tab, overlay });
  nav.current = { tab, overlay };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    void import('@capacitor/app').then(async ({ App }) => {
      const back = await App.addListener('backButton', () => {
        if (nav.current.overlay) setOverlay(null);
        else if (nav.current.tab !== 'home') setTab('home');
        else void App.minimizeApp();
      });
      // 앱이 뒤로 갈 때 미뤄둔 저장을 바로 끝낸다.
      const pause = await App.addListener('pause', () => {
        void flushStorage();
      });
      remove = () => {
        void back.remove();
        void pause.remove();
      };
      if (cancelled) remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

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

export default function App() {
  const hydrated = useHydrated();
  if (!hydrated) {
    // 저장된 기록을 읽기 전에는 아무것도 그리지 않는다: 빈 상태로 덮어쓰는 일을 막는다.
    return (
      <div className="boot" aria-busy="true">
        <Moa size={10} />
      </div>
    );
  }
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}
