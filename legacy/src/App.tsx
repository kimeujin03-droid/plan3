import React, { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Moon, Sun, Undo2, Redo2, Settings, Mic } from 'lucide-react';
import { Button, IconButton } from './components/ui';
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
  
  const dateISO = useMemo(() => toISODate(date), [date]);
  const dayBlocks = useMemo(() => blocks[dateISO] || [], [blocks, dateISO]);
  
  const dragHandler = useDragHandler(dateISO);
  
  // Initialize
  useEffect(() => {
    loadFromStorage();
    
    // Initialize default activities if empty
    const state = usePlannerStore.getState();
    if (state.activities.length === 0) {
      DEFAULT_ACTIVITIES.forEach(addActivity);
    }
  }, []);
  
  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
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
  
  const handleToday = () => {
    setDate(new Date());
  };
  
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
  
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left Sidebar */}
      <aside className="w-20 border-r border-border flex flex-col items-center py-4 gap-3">
        <IconButton onClick={() => setView(view === 'DAY' ? 'WEEK' : 'DAY')} title="View">
          <Settings size={20} />
        </IconButton>
        
        <div className="h-px w-12 bg-border my-2" />
        
        {/* Tool buttons */}
        {(['PAINT', 'NEW_EVENT', 'ERASE'] as const).map(t => (
          <Button
            key={t}
            variant={tool === t ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTool(t)}
            className="w-12 h-12"
          >
            {t[0]}
          </Button>
        ))}
        
        <div className="h-px w-12 bg-border my-2" />
        
        {/* Activity brushes */}
        <div className="flex flex-col gap-2 overflow-y-auto">
          {activities.map(act => (
            <button
              key={act.id}
              className="w-12 h-12 rounded border-2 transition-all"
              style={{
                backgroundColor: act.color,
                borderColor: brush === act.id ? '#000' : 'transparent',
              }}
              onClick={() => setBrush(act.id)}
              title={act.name}
            />
          ))}
        </div>
        
        <div className="mt-auto space-y-2">
          <IconButton onClick={undo} disabled={!canUndo} title="Undo">
            <Undo2 size={18} />
          </IconButton>
          <IconButton onClick={redo} disabled={!canRedo} title="Redo">
            <Redo2 size={18} />
          </IconButton>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-4 gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant={view === 'DAY' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('DAY')}
            >
              Day
            </Button>
            <Button
              variant={view === 'WEEK' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('WEEK')}
            >
              Week
            </Button>
          </div>
          
          <div className="h-6 w-px bg-border" />
          
          <div className="flex items-center gap-2">
            <IconButton onClick={view === 'DAY' ? handlePrevDay : handlePrevWeek}>
              <ChevronLeft size={18} />
            </IconButton>
            <Button variant="secondary" size="sm" onClick={handleToday}>
              Today
            </Button>
            <IconButton onClick={view === 'DAY' ? handleNextDay : handleNextWeek}>
              <ChevronRight size={18} />
            </IconButton>
          </div>
          
          <div className="flex-1 text-center font-medium">
            {view === 'DAY' ? formatDateKorean(date) : `Week of ${formatDateKorean(weekDates[0])}`}
          </div>
          
          <div className="flex items-center gap-2">
            <IconButton onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Theme">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </IconButton>
            <IconButton title="Voice Planning">
              <Mic size={18} />
            </IconButton>
          </div>
        </header>
        
        {/* Timeline */}
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
      </main>
    </div>
  );
}
