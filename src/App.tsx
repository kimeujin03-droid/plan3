import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Sun, Undo2, Redo2, Paintbrush, Plus, Eraser } from 'lucide-react';
import { DayTimeline } from './components/DayTimeline';
import { WeekTimeline } from './components/WeekTimeline';
import { usePlannerStore } from './stores/usePlannerStore';
import { useDragHandler } from './hooks/useDragHandler';
import { toISODate, formatDateKorean } from './lib/time';

const DEFAULT_ACTIVITIES = [
  { id: 'work', name: '업무', color: '#F2A0B3' },
  { id: 'rest', name: '휴식', color: '#7FE5A0' },
  { id: 'hobby', name: '취미', color: '#7FB5E5' },
  { id: 'health', name: '건강', color: '#E5D17F' },
  { id: 'move', name: '이동', color: '#B57FE5' },
  { id: 'sleep', name: '수면', color: '#4ADE80' },
  { id: 'meal', name: '식사', color: '#FBBF24' },
  { id: 'custom', name: '사용자', color: '#6B7280' },
];

const TOOL_CONFIG = [
  { id: 'PAINT' as const, label: '칠하기', icon: Paintbrush },
  { id: 'NEW_EVENT' as const, label: '새 일정', icon: Plus },
  { id: 'ERASE' as const, label: '지우기', icon: Eraser },
];

export default function App() {
  const view = usePlannerStore(state => state.view);
  const date = usePlannerStore(state => state.date);
  const tool = usePlannerStore(state => state.tool);
  const brush = usePlannerStore(state => state.brush);
  const theme = usePlannerStore(state => state.theme);
  const activities = usePlannerStore(state => state.activities);
  const blocks = usePlannerStore(state => state.blocks);

  const setView = usePlannerStore(state => state.setView);
  const setDate = usePlannerStore(state => state.setDate);
  const setTool = usePlannerStore(state => state.setTool);
  const setBrush = usePlannerStore(state => state.setBrush);
  const setTheme = usePlannerStore(state => state.setTheme);
  const undo = usePlannerStore(state => state.undo);
  const redo = usePlannerStore(state => state.redo);
  const canUndo = usePlannerStore(state => state.canUndo());
  const canRedo = usePlannerStore(state => state.canRedo());
  const loadFromStorage = usePlannerStore(state => state.loadFromStorage);
  const addActivity = usePlannerStore(state => state.addActivity);

  const [showBrushPanel, setShowBrushPanel] = useState(false);

  const dateISO = useMemo(() => toISODate(date), [date]);
  const dayBlocks = useMemo(() => blocks[dateISO] || [], [blocks, dateISO]);

  const dragHandler = useDragHandler(dateISO);

  // Initialize
  useEffect(() => {
    loadFromStorage();
    const state = usePlannerStore.getState();
    if (state.activities.length === 0) {
      DEFAULT_ACTIVITIES.forEach(addActivity);
    }
  }, []);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Week dates
  const weekDates = useMemo(() => {
    const sunday = new Date(date);
    sunday.setDate(date.getDate() - date.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return d;
    });
  }, [date]);

  const weekBlocksMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDates.forEach(d => {
      const iso = toISODate(d);
      map[iso] = blocks[iso] || [];
    });
    return map;
  }, [weekDates, blocks]);

  const handlePrevDay = () => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    setDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    setDate(next);
  };

  const handleToday = () => setDate(new Date());

  const handlePrevWeek = () => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 7);
    setDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(date);
    next.setDate(next.getDate() + 7);
    setDate(next);
  };

  const currentBrush = activities.find(a => a.id === brush);

  return (
    <div className="flex flex-col h-full bg-[color:var(--bg)] text-[color:var(--fg)]">
      {/* ===== Header ===== */}
      <header
        className="flex-shrink-0 border-b border-[color:var(--border)] flex items-center justify-between px-3 gap-2"
        style={{ paddingTop: 'var(--sat)', minHeight: 48 }}
      >
        {/* Left: view tabs */}
        <div className="flex items-center gap-1">
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              view === 'DAY'
                ? 'bg-[color:var(--primary)] text-white'
                : 'bg-[color:var(--secondary)] text-[color:var(--fg)]'
            }`}
            onClick={() => setView('DAY')}
          >
            Day
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              view === 'WEEK'
                ? 'bg-[color:var(--primary)] text-white'
                : 'bg-[color:var(--secondary)] text-[color:var(--fg)]'
            }`}
            onClick={() => setView('WEEK')}
          >
            Week
          </button>
        </div>

        {/* Center: date navigation */}
        <div className="flex items-center gap-1">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-md active:bg-[color:var(--secondary)]"
            onClick={view === 'DAY' ? handlePrevDay : handlePrevWeek}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="px-2 py-1 rounded-md text-xs font-medium active:bg-[color:var(--secondary)]"
            onClick={handleToday}
          >
            {formatDateKorean(date)}
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-md active:bg-[color:var(--secondary)]"
            onClick={view === 'DAY' ? handleNextDay : handleNextWeek}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Right: theme toggle */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-md active:bg-[color:var(--secondary)]"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </header>

      {/* ===== Main Timeline ===== */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'DAY' ? (
          <DayTimeline
            dateISO={dateISO}
            blocks={dayBlocks}
            activities={activities}
            startHour={6}
            onCellPointerDown={dragHandler.handlePointerDown}
            onCellPointerEnter={dragHandler.handlePointerEnter}
            onCellPointerUp={dragHandler.handlePointerUp}
          />
        ) : (
          <WeekTimeline
            weekDates={weekDates}
            blocksMap={weekBlocksMap}
            activities={activities}
            onDayClick={(iso) => {
              setView('DAY');
              setDate(new Date(iso));
            }}
          />
        )}
      </div>

      {/* ===== Brush Panel (slide up) ===== */}
      {showBrushPanel && (
        <div
          className="flex-shrink-0 border-t border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2"
        >
          <div className="flex gap-2 overflow-x-auto brush-scroll pb-1">
            {activities.map(act => (
              <button
                key={act.id}
                className="flex-shrink-0 flex flex-col items-center gap-1"
                onClick={() => {
                  setBrush(act.id);
                  setShowBrushPanel(false);
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg border-2 transition-all"
                  style={{
                    backgroundColor: act.color,
                    borderColor: brush === act.id ? 'var(--fg)' : 'transparent',
                  }}
                />
                <span className="text-[10px] text-[color:var(--fg)] opacity-70">{act.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Bottom Toolbar ===== */}
      <nav
        className="flex-shrink-0 border-t border-[color:var(--border)] bg-[color:var(--bg)] flex items-center justify-between px-2 gap-1"
        style={{ paddingBottom: 'var(--sab)', minHeight: 52 }}
      >
        {/* Undo */}
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg active:bg-[color:var(--secondary)] disabled:opacity-30"
          onClick={undo}
          disabled={!canUndo}
        >
          <Undo2 size={18} />
        </button>

        {/* Tool buttons */}
        <div className="flex items-center gap-1">
          {TOOL_CONFIG.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition ${
                tool === id
                  ? 'bg-[color:var(--primary)] text-white'
                  : 'active:bg-[color:var(--secondary)]'
              }`}
              onClick={() => setTool(id)}
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Current brush indicator / brush panel toggle */}
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-all"
          style={{
            backgroundColor: currentBrush?.color || '#6B7280',
            borderColor: showBrushPanel ? 'var(--fg)' : 'transparent',
          }}
          onClick={() => setShowBrushPanel(!showBrushPanel)}
          title={currentBrush?.name || '브러시'}
        />

        {/* Redo */}
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg active:bg-[color:var(--secondary)] disabled:opacity-30"
          onClick={redo}
          disabled={!canRedo}
        >
          <Redo2 size={18} />
        </button>
      </nav>
    </div>
  );
}
