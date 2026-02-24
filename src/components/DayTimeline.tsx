import React, { useMemo } from 'react';
import clsx from 'clsx';
import type { Activity, Block } from '../lib/types';
import { pad2 } from '../lib/time';

interface Segment {
  row: number;
  startCol: number;
  endCol: number;
  layer: 'execute' | 'overlay';
  activityId: string;
  startMinute: number;
  endMinute: number;
}

interface DayTimelineProps {
  dateISO: string;
  blocks: Block[];
  activities: Activity[];
  startHour?: number;
  onCellClick?: (row: number, col: number) => void;
  onCellPointerDown?: (row: number, col: number, e: React.PointerEvent) => void;
  onCellPointerEnter?: (row: number, col: number, e: React.PointerEvent) => void;
  onCellPointerUp?: (e: React.PointerEvent) => void;
}

function convertBlocksToSegments(blocks: Block[], startHour: number): Segment[] {
  const segments: Segment[] = [];
  
  for (const block of blocks) {
    if (block.layer !== 'execute' && block.layer !== 'overlay') continue;
    
    const startHour24 = Math.floor(block.startMin / 60);
    const endHour24 = Math.floor((block.endMin - 1) / 60);
    
    for (let h = startHour24; h <= endHour24; h++) {
      const row = (h - startHour + 24) % 24;
      const hourStart = h * 60;
      const hourEnd = (h + 1) * 60;
      
      const segStart = Math.max(block.startMin, hourStart);
      const segEnd = Math.min(block.endMin, hourEnd);
      
      const startCol = Math.floor((segStart - hourStart) / 10);
      const endCol = Math.floor((segEnd - hourStart - 1) / 10);
      
      segments.push({
        row,
        startCol,
        endCol,
        layer: block.layer as 'execute' | 'overlay',
        activityId: block.activityId,
        startMinute: segStart - hourStart,
        endMinute: segEnd - hourStart,
      });
    }
  }
  
  return segments;
}

export function DayTimeline({
  dateISO,
  blocks,
  activities,
  startHour = 0,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onCellPointerUp,
}: DayTimelineProps) {
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>();
    activities.forEach(a => map.set(a.id, a));
    return map;
  }, [activities]);
  
  const segments = useMemo(() => {
    return convertBlocksToSegments(blocks, startHour);
  }, [blocks, startHour]);
  
  const executeSegments = segments.filter(s => s.layer === 'execute');
  const overlaySegments = segments.filter(s => s.layer === 'overlay');
  
  const colW = 40;
  const rowH = 80;
  
  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="relative" style={{ width: colW * 6, minHeight: 24 * rowH }}>
        {/* Time labels */}
        <div className="absolute left-0 top-0 w-12 text-xs text-muted-foreground">
          {Array.from({ length: 24 }).map((_, i) => {
            const h = (startHour + i) % 24;
            return (
              <div key={i} style={{ height: rowH }} className="flex items-start pt-1 pr-2 justify-end border-t">
                {pad2(h)}
              </div>
            );
          })}
        </div>
        
        {/* Grid */}
        <div className="absolute left-12 top-0 right-0">
          {Array.from({ length: 24 }).map((_, row) => (
            <div key={row} style={{ height: rowH }} className="flex border-t border-border">
              {Array.from({ length: 6 }).map((_, col) => (
                <div
                  key={col}
                  style={{ width: colW }}
                  className={clsx(
                    'border-l border-border hover:bg-muted/50 cursor-pointer transition-colors',
                    col === 0 && 'border-l-2'
                  )}
                  onClick={() => onCellClick?.(row, col)}
                  onPointerDown={(e) => onCellPointerDown?.(row, col, e)}
                  onPointerEnter={(e) => onCellPointerEnter?.(row, col, e)}
                  onPointerUp={onCellPointerUp}
                />
              ))}
            </div>
          ))}
        </div>
        
        {/* Execute layer */}
        <div className="absolute left-12 top-0 pointer-events-none">
          {executeSegments.map((seg, idx) => {
            const activity = activityMap.get(seg.activityId);
            if (!activity) return null;
            
            const left = seg.startCol * colW;
            const width = (seg.endCol - seg.startCol + 1) * colW;
            const top = seg.row * rowH + 4;
            const height = rowH - 8;
            
            return (
              <div
                key={`exe-${idx}`}
                className="absolute transition-all duration-300 ease-in-out"
                style={{
                  left,
                  top,
                  width,
                  height,
                  backgroundColor: activity.color,
                  borderRadius: '4px',
                }}
              >
                <span className="text-xs font-medium text-white px-2 py-1 block truncate">
                  {activity.name}
                </span>
              </div>
            );
          })}
        </div>
        
        {/* Overlay layer */}
        <div className="absolute left-12 top-0 pointer-events-none">
          {overlaySegments.map((seg, idx) => {
            const activity = activityMap.get(seg.activityId);
            if (!activity) return null;
            
            const left = seg.startCol * colW;
            const width = (seg.endCol - seg.startCol + 1) * colW;
            const top = seg.row * rowH + rowH - 14;
            const height = 8;
            
            return (
              <div
                key={`ovl-${idx}`}
                className="absolute transition-all duration-300 ease-in-out"
                style={{
                  left,
                  top,
                  width,
                  height,
                  backgroundColor: activity.color,
                  borderRadius: '2px',
                  opacity: 0.7,
                }}
              />
            );
          })}
        </div>
        
        {/* Current time indicator */}
        {dateISO === new Date().toISOString().split('T')[0] && (
          <CurrentTimeIndicator startHour={startHour} colW={colW} rowH={rowH} />
        )}
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ startHour, colW, rowH }: { startHour: number; colW: number; rowH: number }) {
  const now = new Date();
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  const nowTotalMin = nowHour * 60 + nowMin;
  
  const totalHeight = 24 * rowH;
  const y = (nowTotalMin / (24 * 60)) * totalHeight;
  
  return (
    <div
      className="absolute left-12 pointer-events-none"
      style={{
        top: y,
        width: colW * 6,
        height: 2,
        backgroundColor: '#ef4444',
        zIndex: 50,
      }}
    >
      <div className="absolute -top-1 -left-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-red-500" />
      <div className="absolute -top-5 left-2 text-xs font-medium text-red-500 bg-white px-1 rounded">
        {pad2(nowHour)}:{pad2(nowMin)}
      </div>
    </div>
  );
}
