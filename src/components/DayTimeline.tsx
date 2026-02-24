import React, { useMemo, useEffect, useState, useRef } from 'react';
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

const TIME_LABEL_W = 32; // px for time labels
const ROW_H = 56; // row height in px

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

  const colW = Math.floor((containerWidth - TIME_LABEL_W) / 6);
  const gridW = colW * 6;

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

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden bg-[color:var(--bg)]">
      <div className="relative" style={{ minHeight: 24 * ROW_H }}>
        {/* Time labels */}
        <div className="absolute left-0 top-0" style={{ width: TIME_LABEL_W }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const h = (startHour + i) % 24;
            return (
              <div
                key={i}
                style={{ height: ROW_H }}
                className="flex items-start justify-end pr-1 pt-0.5 text-[10px] text-[color:var(--fg)] opacity-50 border-t border-[color:var(--border)]"
              >
                {pad2(h)}
              </div>
            );
          })}
        </div>

        {/* Grid cells */}
        <div className="absolute top-0" style={{ left: TIME_LABEL_W, width: gridW }}>
          {Array.from({ length: 24 }).map((_, row) => (
            <div key={row} style={{ height: ROW_H }} className="flex border-t border-[color:var(--border)]">
              {Array.from({ length: 6 }).map((_, col) => (
                <div
                  key={col}
                  style={{ width: colW }}
                  className={clsx(
                    'border-l border-[color:var(--border)] active:bg-[color:var(--secondary)] transition-colors',
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

        {/* Execute segments */}
        <div className="absolute top-0 pointer-events-none" style={{ left: TIME_LABEL_W, width: gridW }}>
          {executeSegments.map((seg, idx) => {
            const activity = activityMap.get(seg.activityId);
            if (!activity) return null;

            const left = seg.startCol * colW;
            const width = (seg.endCol - seg.startCol + 1) * colW;
            const top = seg.row * ROW_H + 3;
            const height = ROW_H - 16;

            return (
              <div
                key={`exe-${idx}`}
                className="absolute rounded"
                style={{
                  left,
                  top,
                  width,
                  height,
                  backgroundColor: activity.color,
                }}
              >
                <span className="text-[10px] font-semibold text-white px-1.5 leading-none block truncate" style={{ marginTop: 2 }}>
                  {activity.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Overlay segments */}
        <div className="absolute top-0 pointer-events-none" style={{ left: TIME_LABEL_W, width: gridW }}>
          {overlaySegments.map((seg, idx) => {
            const activity = activityMap.get(seg.activityId);
            if (!activity) return null;

            const left = seg.startCol * colW;
            const width = (seg.endCol - seg.startCol + 1) * colW;
            const top = seg.row * ROW_H + ROW_H - 12;
            const height = 6;

            return (
              <div
                key={`ovl-${idx}`}
                className="absolute rounded-sm"
                style={{
                  left,
                  top,
                  width,
                  height,
                  backgroundColor: activity.color,
                  opacity: 0.7,
                }}
              />
            );
          })}
        </div>

        {/* Current time indicator */}
        {dateISO === new Date().toISOString().split('T')[0] && (
          <CurrentTimeIndicator startHour={startHour} gridW={gridW} rowH={ROW_H} timeLabelW={TIME_LABEL_W} />
        )}
      </div>
    </div>
  );
}

function CurrentTimeIndicator({
  startHour,
  gridW,
  rowH,
  timeLabelW,
}: {
  startHour: number;
  gridW: number;
  rowH: number;
  timeLabelW: number;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  const row = (nowHour - startHour + 24) % 24;
  const y = row * rowH + (nowMin / 60) * rowH;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: timeLabelW,
        top: y,
        width: gridW,
        height: 2,
        backgroundColor: '#ef4444',
        zIndex: 50,
      }}
    >
      <div
        className="absolute"
        style={{
          left: -5,
          top: -4,
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '6px solid #ef4444',
        }}
      />
      <div className="absolute -top-4 left-3 text-[10px] font-bold text-red-500">
        {pad2(nowHour)}:{pad2(nowMin)}
      </div>
    </div>
  );
}
