import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { Activity, Block } from '../lib/types';
import { pad2 } from '../lib/time';

interface WeekTimelineProps {
  weekDates: Date[];
  blocksMap: Record<string, Block[]>;
  activities: Activity[];
  onDayClick?: (dateISO: string) => void;
}

const TIME_LABEL_W = 32; // same as DayTimeline for visual consistency
const ROW_H = 32; // shorter rows than DayTimeline (56px) for 7-day overview density

export function WeekTimeline({
  weekDates,
  blocksMap,
  activities,
  onDayClick,
}: WeekTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(360);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const dayW = Math.floor((containerWidth - TIME_LABEL_W) / 7);

  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>();
    activities.forEach(a => map.set(a.id, a));
    return map;
  }, [activities]);

  const todayISO = new Date().toISOString().split('T')[0];

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden bg-[color:var(--bg)]">
      {/* Day headers (sticky) */}
      <div className="sticky top-0 z-10 bg-[color:var(--bg)] border-b border-[color:var(--border)] flex">
        <div style={{ width: TIME_LABEL_W }} className="flex-shrink-0" />
        {weekDates.map((date) => {
          const dateISO = date.toISOString().split('T')[0];
          const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
          const isToday = dateISO === todayISO;
          return (
            <div
              key={dateISO}
              style={{ width: dayW }}
              className={`flex-shrink-0 text-center py-1.5 active:bg-[color:var(--secondary)] transition-colors ${
                isToday ? 'font-bold' : ''
              }`}
              onClick={() => onDayClick?.(dateISO)}
            >
              <div className="text-[10px] font-medium">{dayName}</div>
              <div
                className={`text-[10px] leading-none ${
                  isToday
                    ? 'bg-[color:var(--primary)] text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto'
                    : 'text-[color:var(--fg)] opacity-50'
                }`}
              >
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex">
        {/* Time labels */}
        <div style={{ width: TIME_LABEL_W }} className="flex-shrink-0">
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              style={{ height: ROW_H }}
              className="flex items-center justify-end pr-1 text-[9px] text-[color:var(--fg)] opacity-40 border-t border-[color:var(--border)]"
            >
              {pad2(h)}
            </div>
          ))}
        </div>

        {/* Days */}
        {weekDates.map((date) => {
          const dateISO = date.toISOString().split('T')[0];
          const dayBlocks = blocksMap[dateISO] || [];

          return (
            <div
              key={dateISO}
              className="flex-shrink-0 relative"
              style={{ width: dayW }}
              onClick={() => onDayClick?.(dateISO)}
            >
              {/* Grid rows */}
              {Array.from({ length: 24 }).map((_, h) => (
                <div
                  key={h}
                  style={{ height: ROW_H }}
                  className="border-t border-l border-[color:var(--border)]"
                />
              ))}

              {/* Blocks */}
              {dayBlocks.map((block) => {
                if (block.layer !== 'execute') return null;
                const activity = activityMap.get(block.activityId);
                if (!activity) return null;

                const duration = block.endMin - block.startMin;
                const top = (block.startMin / 60) * ROW_H;
                const height = (duration / 60) * ROW_H;

                return (
                  <div
                    key={block.id}
                    className="absolute rounded-sm overflow-hidden"
                    style={{
                      top,
                      height: Math.max(height, 2),
                      left: 1,
                      right: 1,
                      backgroundColor: activity.color,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
