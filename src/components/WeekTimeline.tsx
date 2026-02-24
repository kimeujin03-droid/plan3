import React, { useMemo } from 'react';
import clsx from 'clsx';
import type { Activity, Block } from '../lib/types';
import { pad2 } from '../lib/time';

interface WeekTimelineProps {
  weekDates: Date[];
  blocksMap: Record<string, Block[]>;
  activities: Activity[];
  onDayClick?: (dateISO: string) => void;
}

export function WeekTimeline({
  weekDates,
  blocksMap,
  activities,
  onDayClick,
}: WeekTimelineProps) {
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>();
    activities.forEach(a => map.set(a.id, a));
    return map;
  }, [activities]);
  
  const colW = 120;
  const rowH = 40;
  
  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="relative">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b flex">
          <div className="w-12 flex-shrink-0" />
          {weekDates.map((date) => {
            const dateISO = date.toISOString().split('T')[0];
            const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
            return (
              <div
                key={dateISO}
                className="flex-1 text-center py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                style={{ minWidth: colW }}
                onClick={() => onDayClick?.(dateISO)}
              >
                <div className="font-medium">{dayName}</div>
                <div className="text-sm text-muted-foreground">
                  {date.getMonth() + 1}/{date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Grid */}
        <div className="flex">
          {/* Time labels */}
          <div className="w-12 flex-shrink-0 text-xs text-muted-foreground">
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} style={{ height: rowH }} className="flex items-center justify-end pr-2 border-t">
                {pad2(h)}
              </div>
            ))}
          </div>
          
          {/* Days */}
          {weekDates.map((date) => {
            const dateISO = date.toISOString().split('T')[0];
            const blocks = blocksMap[dateISO] || [];
            
            return (
              <div key={dateISO} className="flex-1 relative" style={{ minWidth: colW }}>
                {/* Grid cells */}
                {Array.from({ length: 24 }).map((_, h) => (
                  <div
                    key={h}
                    style={{ height: rowH }}
                    className="border-t border-l border-border hover:bg-muted/30"
                  />
                ))}
                
                {/* Blocks */}
                {blocks.map((block) => {
                  if (block.layer !== 'execute') return null;
                  
                  const activity = activityMap.get(block.activityId);
                  if (!activity) return null;
                  
                  const startH = Math.floor(block.startMin / 60);
                  const endH = Math.floor(block.endMin / 60);
                  const duration = block.endMin - block.startMin;
                  
                  const top = (block.startMin / 60) * rowH;
                  const height = (duration / 60) * rowH;
                  
                  return (
                    <div
                      key={block.id}
                      className="absolute inset-x-1 transition-all duration-300 ease-in-out rounded overflow-hidden"
                      style={{
                        top,
                        height,
                        backgroundColor: activity.color,
                        minHeight: 2,
                      }}
                    >
                      {height > 20 && (
                        <span className="text-xs font-medium text-white px-1 block truncate">
                          {activity.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
