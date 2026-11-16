import { Capacitor } from '@capacitor/core';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { InputBar, RunningBar, Toast, useNow } from './components/common';
import { Icon } from './components/Icons';
import { Moa } from './components/Moa';
import { activeIntervals } from './lib/intervals';
import { flushStorage } from './lib/storage';
import { Clock } from './screens/Clock';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { Record } from './screens/Record';
import { Todos } from './screens/Todos';
import { useStore } from './store';

type Tab = 'home' | 'record' | 'todos' | 'clock';
type Overlay = 'settings' | null;

const TABS: { id: Tab; name: string }[] = [
  { id: 'home', name: '모아' },
  { id: 'record', name: '기록' },
  { id: 'todos', name: '할 일' },
  { id: 'clock', name: '시계' },
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
        <Moa size={120} mood="tired" />
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
  const running = useStore((s) => activeIntervals(s.intervals).length > 0);
  const now = useNow(running ? 1000 : 20_000);

  // 글자를 치는 동안은 하단 탭을 숨겨 입력창이 키보드 바로 위에 오게 한다.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const isText = (el: EventTarget | null) =>
      el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['date', 'checkbox', 'button'].includes(el.type));
    const on = (e: FocusEvent) => {
      if (!isText(e.target)) return;
      clearTimeout(t);
      setTyping(true);
    };
    // 바로 되살리면 보내기 버튼을 누르는 순간 화면이 밀린다.
    const off = () => {
      clearTimeout(t);
      t = setTimeout(() => setTyping(false), 200);
    };
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => {
      clearTimeout(t);
      document.removeEventListener('focusin', on);
      document.removeEventListener('focusout', off);
    };
  }, []);

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
      {tab === 'home' && <Home now={now} onOpenSettings={() => setOverlay('settings')} onOpenTodos={() => setTab('todos')} />}
      {tab === 'record' && <Record now={now} />}
      {tab === 'todos' && <Todos now={now} />}
      {tab === 'clock' && <Clock now={now} />}

      <div className="dock">
        <Toast />
        {/* 첫 화면과 시계는 돌고 있는 타이머를 이미 크게 보여주므로 알약은 숨긴다. */}
        {tab !== 'clock' && <RunningBar now={now} onOpen={() => setTab('clock')} pills={tab !== 'home'} />}
        <InputBar />
        <nav className="nav" aria-label="화면" hidden={typing}>
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.id} />
              {t.name}
            </button>
          ))}
        </nav>
      </div>

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
        <Moa size={120} />
      </div>
    );
  }
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}
