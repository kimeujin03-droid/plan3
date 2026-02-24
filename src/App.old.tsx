import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Eraser, Flag, ListChecks, Menu, Mic, Moon, Play, Redo2, Settings, Sparkles, Sun, Undo2 } from "lucide-react";
import clsx from "clsx";
import { Button, Card, Divider, IconButton, Input, Label } from "./components/ui";
import { Dialog } from "./components/Dialog";
import type { Activity, ActivityId, ChecklistItem, ChecklistBlock, MemoBlock, DayGrid, Tool, ViewMode, WeekGrid } from "./lib/types";
import { buildSegmentsForDay } from "./lib/segments";
import { cellTimeText, formatDateKorean, pad2, toISODate } from "./lib/time";
import { makeCellId } from "./lib/id";
import { loadState, saveState } from "./lib/storage";

/**
 * Digital Life Log Planner — Vite + React (TS)
 * Implements: Day/Week UI core, tools, execute/overlay, indicator, erase, new plan (armed drag), undo/redo, checklist panel.
 */

const DEFAULT_ACTIVITIES: Activity[] = [
  { id: "work", name: "업무", color: "#F2A0B3" },
  { id: "rest", name: "휴식", color: "#7FE5A0" },
  { id: "hobby", name: "취미", color: "#7FB5E5" },
  { id: "health", name: "건강", color: "#E5D17F" },
  { id: "move", name: "이동", color: "#B57FE5" },
  { id: "sleep", name: "수면", color: "#4ADE80" },
  { id: "meal", name: "식사", color: "#FBBF24" },
  { id: "custom", name: "사용자", color: "#6B7280" }
];

const USER_COLOR_OPTIONS = [
  "#F43F5E",
  "#FB7185",
  "#F97316",
  "#FBBF24",
  "#22C55E",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
  "#6B7280"
];

type DragMode = "paint" | "erase" | "new" | "plan" | null;
type SelectedSeg = { row: number; startCol: number; endCol: number; layer: "execute" | "overlay"; activityId: ActivityId };
type FineBounds = { startMinute: number; endMinute: number };
type PlanSegment = { row: number; startCol: number; endCol: number; activityId: ActivityId; layer: "plan" | "planOverlay" };
type DragState = {
  mode: DragMode;
  dateISO: string;
  startHour: number;
  brush: ActivityId | null;
  tool: Tool;
  activeCells: Set<string>;
  startCellId: string | null;
  lastCellId: string | null;
  pointerId: number;
  isDown: boolean;
};

function segmentKey(dateISO: string, startHour: number, seg: SelectedSeg): string {
  const hour = (startHour + seg.row) % 24;
  return `${dateISO}|${hour}|${seg.layer}|${seg.activityId}|${seg.startCol}-${seg.endCol}`;
}

function defaultFineBounds(seg: SelectedSeg): FineBounds {
  return { startMinute: seg.startCol * 10, endMinute: (seg.endCol + 1) * 10 };
}

function deepCloneGrid(grid: DayGrid): DayGrid {
  const out: DayGrid = {};
  for (const [k, v] of Object.entries(grid)) out[k] = { ...v, indicator: v.indicator ? { ...v.indicator } : undefined, memos: v.memos ? [...v.memos] : undefined };
  return out;
}

function buildPlanSegmentsForDay(weekGrid: WeekGrid, dateISO: string, startHour: number): PlanSegment[] {
  const out: PlanSegment[] = [];

  // Single-layer plan segments.
  // If overlayActivityId exists, prefer it; otherwise use activityId.
  // This prevents rendering the same region twice (plan + planOverlay) which makes it look darker.
  for (let row = 0; row < 24; row++) {
    const hour = (startHour + row) % 24;
    let col = 0;
    while (col < 6) {
      const cellId = makeCellId(dateISO, hour, col);
      const cell = weekGrid[cellId] as any;
      const actId = (cell?.overlayActivityId ?? cell?.activityId) as ActivityId | undefined;
      if (!actId) {
        col++;
        continue;
      }
      let end = col;
      while (end + 1 < 6) {
        const nextId = makeCellId(dateISO, hour, end + 1);
        const nextCell = weekGrid[nextId] as any;
        const nextAct = (nextCell?.overlayActivityId ?? nextCell?.activityId) as ActivityId | undefined;
        if (nextAct !== actId) break;
        end++;
      }
      out.push({ row, startCol: col, endCol: end, activityId: actId, layer: "plan" });
      col = end + 1;
    }
  }
  return out;
}

function snap10(min: number): number {
  return Math.round(min / 10) * 10;
}

function timeToMin(text: string): number {
  const [hh, mm] = text.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function minToTime(min: number): string {
  const m = Math.max(0, Math.min(24 * 60, min));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function timeFromMinutes(min: number): string {
  return minToTime(min);
}

function formatDurationHM(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

function weekKeyFor(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  return toISODate(sunday);
}

function daysOfWeekFrom(weekKey: string): string[] {
  const base = new Date(weekKey);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(toISODate(d));
  }
  return out;
}
 
export default function App() {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<ViewMode>("DAY");
  const [dayMode, setDayMode] = useState<"execute" | "plan">("execute");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showPlanOverlay, setShowPlanOverlay] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [date, setDate] = useState<Date>(today);
  const dateISO = useMemo(() => toISODate(date), [date]);
  const todayISO = useMemo(() => toISODate(today), [today]);

  const [startHour, setStartHour] = useState<number>(6);
  const [activeTool, setActiveTool] = useState<Tool>("execute");
  const [activeBrush, setActiveBrush] = useState<ActivityId>(DEFAULT_ACTIVITIES[0].id);

  const [activities, setActivities] = useState<Activity[]>(DEFAULT_ACTIVITIES);
  const [activityEmojiStore, setActivityEmojiStore] = useState<Record<string, string>>({});
  const [segmentEmojiStore, setSegmentEmojiStore] = useState<Record<string, string>>({});
  const [emojiBrush, setEmojiBrush] = useState<string | null>(null);
  const dragActivityId = useRef<ActivityId | null>(null);
  // NEW tool creates *temporary* presets (not added to the category list).
  // These are intentionally not persisted and are not shown in the left sidebar.
  const [tempPresets, setTempPresets] = useState<Record<string, Activity>>({});
  // Temp brush (NEW tool) one-shot behavior:
  // After the next *completed paint gesture* (pointer up), revert to the previous brush.
  const tempBrushArmed = useRef(false);
  const prevBrushRef = useRef<ActivityId | null>(null);
  const tempBrushIdRef = useRef<ActivityId | null>(null);

  const [selectedSegment, setSelectedSegment] = useState<SelectedSeg | null>(null);
  const [resizeArmed, setResizeArmed] = useState(false);
  const resizeState = useRef<{ pointerId: number; side: "start" | "end"; base: SelectedSeg } | null>(null);
  const [dragTick, setDragTick] = useState(0);

  const [dayStore, setDayStore] = useState<Record<string, DayGrid>>({});
  const dayGrid = dayStore[dateISO] ?? {};

  const [weekStore, setWeekStore] = useState<Record<string, WeekGrid>>({});
  const wkKey = useMemo(() => weekKeyFor(date), [date]);
  const weekGrid = weekStore[wkKey] ?? {};

  const [nowMin, setNowMin] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const [checklistStore, setChecklistStore] = useState<Record<string, ChecklistItem[]>>({});
  const checklist = checklistStore[dateISO] ?? [];

  // Timeline checklist blocks (created by long-press on a 10-min cell)
  const [checklistBlocksStore, setChecklistBlocksStore] = useState<Record<string, ChecklistBlock[]>>({});
  const checklistBlocks = checklistBlocksStore[dateISO] ?? [];

  // Timeline memo blocks (opened by tap on memo glyph)
  const [memoBlocksStore, setMemoBlocksStore] = useState<Record<string, MemoBlock[]>>({});
  const memoBlocks = memoBlocksStore[dateISO] ?? [];

  // Sleep + Mood (daily)
  const [sleepStore, setSleepStore] = useState<Record<string, { sleepStartMin: number; wakeMin: number; updatedAt: number }>>({});
  const [dayMoodStore, setDayMoodStore] = useState<Record<string, { mood: 1 | 2 | 3 | 4 | 5; updatedAt: number }>>({});

  const sleepForDay = sleepStore[dateISO] ?? null;
  const sleepDurationMin = useMemo(() => {
    if (!sleepForDay) return null;
    const start = sleepForDay.sleepStartMin;
    const wake = sleepForDay.wakeMin;
    // Cross-midnight safe: allow wake < start
    const dur = wake >= start ? wake - start : wake + 24 * 60 - start;
    return dur;
  }, [sleepForDay]);

  const dayMood = dayMoodStore[dateISO]?.mood ?? null;

  // Segment mood: one per contiguous segment (signature)
  const [segmentMoodStore, setSegmentMoodStore] = useState<Record<string, { mood: 1 | 2 | 3 | 4 | 5; updatedAt: number }>>({});

  const selectedSegmentKey = useMemo(() => {
    if (!selectedSegment) return null;
    return segmentKey(dateISO, startHour, selectedSegment);
  }, [dateISO, selectedSegment, startHour]);

  const selectedSegmentMood = selectedSegmentKey ? segmentMoodStore[selectedSegmentKey]?.mood ?? null : null;
  const selectedSegmentEmoji = selectedSegmentKey ? segmentEmojiStore[selectedSegmentKey] ?? null : null;

  const selectedSegmentName = useMemo(() => {
    if (!selectedSegment) return null;
    return activities.find((a) => a.id === selectedSegment.activityId)?.name ?? null;
  }, [activities, selectedSegment]);

  function setDayMood(mood: 1 | 2 | 3 | 4 | 5) {
    setDayMoodStore((prev) => ({
      ...prev,
      [dateISO]: { mood, updatedAt: Date.now() }
    }));
  }

  function setSelectedSegmentMood(mood: 1 | 2 | 3 | 4 | 5) {
    if (!selectedSegmentKey) return;
    setSegmentMoodStore((prev) => ({
      ...prev,
      [selectedSegmentKey]: { mood, updatedAt: Date.now() }
    }));
  }

  // Minute-level fine bounds for selected segments (persisted per segment signature)
  const [fineBoundsStore, setFineBoundsStore] = useState<Record<string, FineBounds>>({});

  const undoStack = useRef<{ grid: DayGrid; week: WeekGrid; activeTool: Tool; activeBrush: ActivityId }[]>([]);
  const redoStack = useRef<{ grid: DayGrid; week: WeekGrid; activeTool: Tool; activeBrush: ActivityId }[]>([]);
  const [historyTick, setHistoryTick] = useState(0); // forces updates for disabled state

  const dragRef = useRef<DragState>({
    mode: null,
    dateISO,
    startHour,
    brush: activeBrush,
    tool: activeTool,
    activeCells: new Set(),
    startCellId: null,
    lastCellId: null,
    pointerId: -1,
    isDown: false
  });

  // "armed drag" for NEW plan: store last pointerdown cell so we can continue after modal close.
  const armedDrag = useRef<{ pointerId: number; startCellId: string } | null>(null);
  const pendingStartCell = useRef<string | null>(null);

  // dialogs
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(USER_COLOR_OPTIONS[0]);

  // Edit category (long-press on a category button in the left sidebar)
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<ActivityId | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState(USER_COLOR_OPTIONS[0]);

  const [isIndicatorOpen, setIsIndicatorOpen] = useState(false);
  const [indicatorLabel, setIndicatorLabel] = useState("");
  const [indicatorTimeText, setIndicatorTimeText] = useState("");
  const [indicatorTargetCell, setIndicatorTargetCell] = useState<string | null>(null);

  // Timeline checklist block (long-press on a 10-min cell)
  const [isChecklistBlockOpen, setIsChecklistBlockOpen] = useState(false);
  const [checklistBlockEditingId, setChecklistBlockEditingId] = useState<string | null>(null);
  const [checklistBlockTargetCell, setChecklistBlockTargetCell] = useState<string | null>(null);
  const [checklistBlockStart, setChecklistBlockStart] = useState("00:00");
  const [checklistBlockEnd, setChecklistBlockEnd] = useState("00:10");
  const [checklistBlockLayer, setChecklistBlockLayer] = useState<"execute" | "overlay">("execute");
  const [checklistBlockActivityId, setChecklistBlockActivityId] = useState<ActivityId | null>(null);
  const [checklistBlockItemText, setChecklistBlockItemText] = useState("");
  const [checklistBlockItems, setChecklistBlockItems] = useState<{ id: string; text: string; done: boolean }[]>([]);

  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isMemoOpen, setIsMemoOpen] = useState(false);

  // Sleep input (wake-day based)
  const [isSleepOpen, setIsSleepOpen] = useState(false);
  const [sleepStartText, setSleepStartText] = useState("00:00");
  const [sleepWakeText, setSleepWakeText] = useState("00:00");

  // Timeline memo block (one memo per hour per layer)
  const [isMemoBlockOpen, setIsMemoBlockOpen] = useState(false);
  const [memoBlockEditingId, setMemoBlockEditingId] = useState<string | null>(null);
  const [memoBlockTargetCell, setMemoBlockTargetCell] = useState<string | null>(null);

  // Voice Planning
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceParsedStart, setVoiceParsedStart] = useState("");
  const [voiceParsedEnd, setVoiceParsedEnd] = useState("");
  const [voiceParsedActivity, setVoiceParsedActivity] = useState("");
  const [voiceParsedDate, setVoiceParsedDate] = useState("");
  const recognitionRef = useRef<any>(null);
  const [memoBlockLayer, setMemoBlockLayer] = useState<"execute" | "overlay">("execute");
  const [memoBlockHour, setMemoBlockHour] = useState<number | null>(null);
  const [memoBlockIndex, setMemoBlockIndex] = useState<0 | 1 | null>(null);
  const [memoBlockText, setMemoBlockText] = useState("");

  // Long-press detection (for checklist blocks)
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number; pointerId: number; cellId: string; intentLayer?: "execute" | "overlay" } | null>(null);

  // Long-press detection for category edit
  const catLongPressTimer = useRef<number | null>(null);
  const catLongPressStart = useRef<{ x: number; y: number; pointerId: number; catId: ActivityId } | null>(null);
  const catLongPressFired = useRef(false);

  useEffect(() => {
    if (activeTool !== "select") {
      setSelectedSegment(null);
      setResizeArmed(false);
      resizeState.current = null;
    }
    if (activeTool !== "new") {
      setNewPlanBannerName(null);
      tempBrushIdRef.current = null;
    }
  }, [activeTool]);

  useEffect(() => {
    if (!selectedSegment) {
      setResizeArmed(false);
      resizeState.current = null;
    }
  }, [selectedSegment]);

  // theme apply
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // persistence
  useEffect(() => {
    const loaded: any = loadState();
    if (!loaded) return;
    setActivities(loaded.activities || DEFAULT_ACTIVITIES);
    setActivityEmojiStore(loaded.activityEmoji || {});
    setSegmentEmojiStore(loaded.segmentEmoji || {});
    setDayStore(loaded.day || {});
    setWeekStore(loaded.week || {});
    setChecklistStore(loaded.checklist || {});
    setChecklistBlocksStore(loaded.checklistBlocks || {});
  setMemoBlocksStore(loaded.memoBlocks || {});
    setFineBoundsStore(loaded.fineBounds || {});
    setSleepStore(loaded.sleep || {});
    setDayMoodStore(loaded.dayMood || {});
    setSegmentMoodStore(loaded.segmentMood || {});
    setStartHour(typeof loaded.startHour === "number" ? loaded.startHour : 6);
    setTheme(loaded.theme || "light");
  }, []);

  // 현재 시각 1분 주기 업데이트
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Long-press movement threshold: cancel long-press if the pointer moves too far
  // (prevents accidental checklist creation while the user intends to drag).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = longPressStart.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (dx * dx + dy * dy > 36) {
        if (longPressTimer.current) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        longPressStart.current = null;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const onUp = () => {
      resizeState.current = null;
    };
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    const state: any = {
      activities,
      activityEmoji: activityEmojiStore,
      segmentEmoji: segmentEmojiStore,
      day: dayStore,
      week: weekStore,
      checklist: checklistStore,
      checklistBlocks: checklistBlocksStore,
      memoBlocks: memoBlocksStore,
      fineBounds: fineBoundsStore,
      sleep: sleepStore,
      dayMood: dayMoodStore,
      segmentMood: segmentMoodStore,
      startHour,
      theme
    };
    saveState(state as any);
  }, [activities, activityEmojiStore, segmentEmojiStore, dayStore, weekStore, checklistStore, checklistBlocksStore, memoBlocksStore, fineBoundsStore, sleepStore, dayMoodStore, segmentMoodStore, startHour, theme]);

  // compute segments for DAY
  const segments = useMemo(() => buildSegmentsForDay(dayGrid, dateISO, startHour), [dayGrid, dateISO, startHour]);
  const planSegments = useMemo(() => buildPlanSegmentsForDay(weekGrid, dateISO, startHour), [weekGrid, dateISO, startHour]);

  const activityById = useMemo(() => {
    const base = Object.fromEntries(activities.map((a) => [a.id, a]));
    for (const [k, v] of Object.entries(tempPresets)) base[k] = v;
    return base as Record<string, Activity>;
  }, [activities, tempPresets]);

  const newGhost = useMemo(() => {
    const st = dragRef.current;
    if (!st.isDown || st.mode !== "new" || !st.startCellId) return null;
    const endCellId = st.lastCellId ?? st.startCellId;
    const { hour: sh, col: sc } = parseCellId(st.startCellId);
    const { hour: eh, col: ec } = parseCellId(endCellId);
    const startMin = sh * 60 + sc * 10;
    const endMin = eh * 60 + ec * 10 + 10;
    const min = Math.min(startMin, endMin);
    const max = Math.max(startMin, endMin);
  if (!st.brush) return null;
  const brushAct = activityById[st.brush];
    if (!brushAct) return null;
    const slices: { row: number; startCol: number; endCol: number }[] = [];
    let t = min;
    while (t < max) {
      const hour = Math.floor(t / 60);
      const row = (hour - startHour + 24) % 24;
      const hourStart = hour * 60;
      const hourEnd = hourStart + 60;
      const sliceStart = t;
      const sliceEnd = Math.min(max, hourEnd);
      const startCol = Math.floor((sliceStart - hourStart) / 10);
      const endCol = Math.max(startCol, Math.ceil((sliceEnd - hourStart) / 10) - 1);
      slices.push({ row, startCol, endCol });
      t = sliceEnd;
    }
    return { slices, color: brushAct.color, name: brushAct.name };
  }, [activityById, startHour, dragTick, historyTick]);


  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  function pushSnapshot() {
    undoStack.current.push({
      grid: deepCloneGrid(dayGrid),
      week: { ...weekGrid },
      activeTool,
      activeBrush
    });
    redoStack.current = [];
    setHistoryTick((x) => x + 1);
  }

  function applyGrid(next: DayGrid) {
    setDayStore((prev) => ({ ...prev, [dateISO]: next }));
  }

  function updateCell(cellId: string, updater: (cell: DayGrid[string] | undefined) => DayGrid[string] | undefined) {
    setDayStore((prev) => {
      const existing = prev[dateISO] ?? {};
      const next = { ...existing };
      const current = next[cellId];
      const updated = updater(current);
      if (!updated || (Object.keys(updated).length === 0)) {
        delete next[cellId];
      } else {
        next[cellId] = updated;
      }
      return { ...prev, [dateISO]: next };
    });
  }

  function paintCell(cellId: string, brush: ActivityId) {
    updateCell(cellId, (cell) => {
      const next = { ...(cell ?? {}) };
      // Execute / Overlay rule
      if (!next.execute) {
        next.execute = brush;
      } else if (next.execute !== brush) {
        next.overlay = brush; // overwrite if exists
      }
      return next;
    });
  }

  function paintRange(dateISO: string, startMin: number, endMin: number, brush: ActivityId | null) {
    if (!brush) return;
    const start = Math.max(0, snap10(startMin));
    const end = Math.min(24 * 60, snap10(endMin));
    for (let m = start; m < end; m += 10) {
      const h = Math.floor(m / 60);
      const col = Math.floor((m % 60) / 10);
      const cellId = makeCellId(dateISO, h, col);
      paintCell(cellId, brush);
    }
  }

  function paintPlanCell(cellId: string, brush: ActivityId | null) {
    setWeekStore((prev) => {
      const nextWeek = { ...(prev[wkKey] ?? {}) };
      const existing = nextWeek[cellId] ?? {};
      if (!brush) {
        delete nextWeek[cellId];
      } else {
        // Primary plan first; if occupied with a different activity, store as overlapped plan.
        const primary = existing.activityId;
        const overlay = (existing as any).overlayActivityId as ActivityId | undefined;
        if (!primary) {
          nextWeek[cellId] = { activityId: brush, overlayActivityId: overlay };
        } else if (primary !== brush && overlay !== brush) {
          nextWeek[cellId] = { activityId: primary, overlayActivityId: brush };
        } else {
          nextWeek[cellId] = { activityId: primary, overlayActivityId: overlay };
        }
      }
      return { ...prev, [wkKey]: nextWeek };
    });
  }

  function paintPlanRange(dateISO: string, startMin: number, endMin: number, brush: ActivityId | null) {
    if (!brush) return;
    const start = Math.max(0, snap10(startMin));
    const end = Math.min(24 * 60, snap10(endMin));
    for (let m = start; m < end; m += 10) {
      const h = Math.floor(m / 60);
      const col = Math.floor((m % 60) / 10);
      const cellId = makeCellId(dateISO, h, col);
      paintPlanCell(cellId, brush);
    }
  }

  function eraseCell(cellId: string) {
    updateCell(cellId, (cell) => {
      if (!cell) return undefined;
      const next = { ...cell };
      delete next.execute;
      delete next.overlay;
      return next;
    });
  }

  function setIndicator(cellId: string, label: string, timeText: string) {
    updateCell(cellId, (cell) => {
      const next = { ...(cell ?? {}) };
      next.indicator = { label, timeText };
      return next;
    });
  }

  function deleteIndicator(cellId: string) {
    updateCell(cellId, (cell) => {
      if (!cell) return undefined;
      const next = { ...cell };
      delete next.indicator;
      return next;
    });
  }

  function beginDrag(pointerId: number, startCellId: string, tool: Tool, applyInitial = true, brushOverride: ActivityId | null = activeBrush) {
    const mode: DragMode = tool === "erase" ? "erase" : tool === "new" ? "new" : tool === "plan" ? "plan" : "paint";
    dragRef.current = {
      mode,
      dateISO,
      startHour,
      brush: brushOverride,
      tool,
      activeCells: applyInitial ? new Set([startCellId]) : new Set(),
      startCellId,
      lastCellId: startCellId,
      pointerId,
      isDown: true
    };

    pendingStartCell.current = applyInitial ? null : startCellId;

    if (applyInitial) {
      if (mode === "erase") eraseCell(startCellId);
      else if (mode === "paint") paintCell(startCellId, brushOverride as ActivityId);
      else if (mode === "plan") paintPlanCell(startCellId, brushOverride);
      // mode "new" does not paint immediately
    }
  }

  function continueDrag(cellId: string) {
    const st = dragRef.current;
    if (!st.isDown || st.mode === null) return;

    // If we deferred the first paint (to allow long-press), apply it now when the
    // user actually drags into a different cell. For NEW, we just start the range.
    if (pendingStartCell.current) {
      const first = pendingStartCell.current;
      pendingStartCell.current = null;
      if (!st.activeCells.has(first)) {
        st.activeCells.add(first);
        if (st.mode === "erase") eraseCell(first);
        else if (st.mode === "paint") paintCell(first, st.brush as ActivityId);
        else if (st.mode === "plan") paintPlanCell(first, st.brush);
      }
    }
    if (st.activeCells.has(cellId)) return;
    st.activeCells.add(cellId);
    if (st.mode === "erase") eraseCell(cellId);
    else if (st.mode === "paint") paintCell(cellId, st.brush as ActivityId);
    else if (st.mode === "plan") paintPlanCell(cellId, st.brush);
    else if (st.mode === "new") {
      st.lastCellId = cellId; // track range end
      setDragTick((t) => t + 1);
    }
  }

  function endDrag(pointerId: number) {
    const st = dragRef.current;
    if (!st.isDown || st.pointerId !== pointerId) return null;

    const usedBrush = st.brush;
    const snapshot = {
      mode: st.mode,
      activeCells: new Set(st.activeCells),
      startCellId: st.startCellId,
      lastCellId: st.lastCellId,
      usedBrush
    } as const;

    dragRef.current.isDown = false;
    dragRef.current.mode = null;
    dragRef.current.activeCells = new Set();
    dragRef.current.startCellId = null;
    dragRef.current.lastCellId = null;

    // NEW tool brush stays active until user switches tools; no auto-revert.
    return snapshot;
  }

  function onUndo() {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push({ grid: deepCloneGrid(dayGrid), week: { ...weekGrid }, activeTool, activeBrush });
    applyGrid(snap.grid);
    setWeekStore((prev) => ({ ...prev, [wkKey]: snap.week }));
    setActiveTool(snap.activeTool);
    setActiveBrush(snap.activeBrush);
    setHistoryTick((x) => x + 1);
  }

  function onRedo() {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push({ grid: deepCloneGrid(dayGrid), week: { ...weekGrid }, activeTool, activeBrush });
    applyGrid(snap.grid);
    setWeekStore((prev) => ({ ...prev, [wkKey]: snap.week }));
    setActiveTool(snap.activeTool);
    setActiveBrush(snap.activeBrush);
    setHistoryTick((x) => x + 1);
  }

  // global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dayGrid, activeBrush, activeTool]);

  // Ensure drag always terminates even if pointer is released outside the cell DOM.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (!dragRef.current.isDown) return;
      endDrag(e.pointerId);
      armedDrag.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Clear category long-press state on pointer end.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const lp = catLongPressStart.current;
      if (!lp) return;
      if (e.pointerId !== lp.pointerId) return;
      if (catLongPressTimer.current) {
        window.clearTimeout(catLongPressTimer.current);
        catLongPressTimer.current = null;
      }
      catLongPressStart.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Long-press movement threshold cancellation (prevents modal opening while dragging)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const lp = longPressStart.current;
      if (!lp) return;
      if (e.pointerId !== lp.pointerId) return;
      const dx = e.clientX - lp.x;
      const dy = e.clientY - lp.y;
      if (dx * dx + dy * dy > 36) {
        if (longPressTimer.current) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        longPressStart.current = null;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Category long-press movement threshold cancellation
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const lp = catLongPressStart.current;
      if (!lp) return;
      if (e.pointerId !== lp.pointerId) return;
      const dx = e.clientX - lp.x;
      const dy = e.clientY - lp.y;
      if (dx * dx + dy * dy > 36) {
        if (catLongPressTimer.current) {
          window.clearTimeout(catLongPressTimer.current);
          catLongPressTimer.current = null;
        }
        catLongPressStart.current = null;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // header start time drop-down
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const startOptions = [0, 4, 5, 6, 7, 8];

  // Add category
  function confirmAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const id = `user_${Date.now()}`;
    const act: Activity = { id, name, color: newCatColor };
    setActivities((prev) => [...prev, act]);
    setActiveBrush(id);
    setActiveTool("execute");
    setIsAddCategoryOpen(false);
    setNewCatName("");
  }

  function openEditCategoryDialog(act: Activity) {
    setEditCatId(act.id);
    setEditCatName(act.name);
    setEditCatColor(act.color);
    setIsEditCategoryOpen(true);
  }

  function startCategoryLongPress(e: React.PointerEvent, catId: ActivityId) {
    // Only primary button / touch.
    if ((e as any).button != null && (e as any).button !== 0) return;

    // Don’t prevent default; we only suppress the click later if long-press actually fires.
    catLongPressStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, catId };
    if (catLongPressTimer.current) {
      window.clearTimeout(catLongPressTimer.current);
      catLongPressTimer.current = null;
    }
    catLongPressTimer.current = window.setTimeout(() => {
      const lp = catLongPressStart.current;
      if (!lp) return;
      if (lp.pointerId !== e.pointerId) return;
      const act = activities.find((a) => a.id === lp.catId);
      if (!act) return;
      catLongPressFired.current = true;
      openEditCategoryDialog(act);
    }, 450);
  }

  function confirmEditCategory() {
    if (!editCatId) return;
    const name = editCatName.trim();
    if (!name) return;
    setActivities((prev) => prev.map((a) => (a.id === editCatId ? { ...a, name, color: editCatColor } : a)));
    setIsEditCategoryOpen(false);
    setEditCatId(null);
  }

  function deleteCategory(catId: ActivityId) {
    setActivities((prev) => prev.filter((a) => a.id !== catId));
    // If the deleted category was active, fall back to the first default.
    setActiveBrush((prev) => (prev === catId ? (DEFAULT_ACTIVITIES[0]?.id ?? prev) : prev));
    setIsEditCategoryOpen(false);
    setEditCatId(null);
  }

  function moveActivity(dragId: ActivityId, overId: ActivityId) {
    if (dragId === overId) return;
    setActivities((prev) => {
      const from = prev.findIndex((a) => a.id === dragId);
      const to = prev.findIndex((a) => a.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  // Indicator dialog confirm
  function confirmAddIndicator() {
    if (!indicatorTargetCell) return;
    const label = indicatorLabel.trim();
    if (!label) return;
    setIndicator(indicatorTargetCell, label, indicatorTimeText || indicatorTimeTextFromCell(indicatorTargetCell));
    setIsIndicatorOpen(false);
    setIndicatorLabel("");
    setIndicatorTimeText("");
    setIndicatorTargetCell(null);
  }

  function indicatorTimeTextFromCell(cellId: string): string {
    const [, hh, colStr] = cellId.split("|");
    return `${hh}:${pad2(Number(colStr) * 10)}`;
  }

  function openWakeIndicatorDialog(timeText: string) {
    // Place the flag on the current date at the chosen time (10-min cell).
    const min = Math.max(0, Math.min(24 * 60 - 1, timeToMin(timeText)));
    const h = Math.floor(min / 60);
    const col = Math.floor((min % 60) / 10);
    const cellId = makeCellId(dateISO, h, col);

    setIndicatorTargetCell(cellId);
    setIndicatorLabel("기상");
    setIndicatorTimeText(timeText);
    setIsIndicatorOpen(true);
  }

  function openSleepDialog() {
    // Default: if we already have a sleep entry for this wake-day, prefill it.
    const existing = sleepStore[dateISO];
    if (existing) {
      setSleepStartText(minToTime(existing.sleepStartMin));
      setSleepWakeText(minToTime(existing.wakeMin));
    } else {
      // Otherwise pick a reasonable default: yesterday 23:00 -> now (snapped)
      const nowSnap = `${pad2(Math.floor(nowMin / 60))}:${pad2(Math.floor((nowMin % 60) / 10) * 10)}`;
      setSleepStartText("23:00");
      setSleepWakeText(nowSnap);
    }
    setIsSleepOpen(true);
  }

  function confirmSleepDialog() {
    const startMin = Math.max(0, Math.min(24 * 60 - 1, timeToMin(sleepStartText)));
    const wakeMin = Math.max(0, Math.min(24 * 60 - 1, timeToMin(sleepWakeText)));
    const updatedAt = Date.now();

    setSleepStore((prev) => ({
      ...prev,
      [dateISO]: { sleepStartMin: startMin, wakeMin, updatedAt }
    }));

    // Also drop a wake indicator flag automatically.
    // (Keeps it on the same wake-day grid, at wake time.)
    const h = Math.floor(wakeMin / 60);
    const col = Math.floor((wakeMin % 60) / 10);
    const cellId = makeCellId(dateISO, h, col);
    setIndicator(cellId, "기상", minToTime(wakeMin));

    setIsSleepOpen(false);
  }

  function parseCellId(cellId: string): { dateISO: string; hour: number; col: number } {
    const [d, hh, cc] = cellId.split("|");
    return { dateISO: d, hour: Number(hh), col: Number(cc) };
  }

  // NEW plan dialog uses same dialog as category add; but spec says long press/new tool click opens "신규 계획 추가" with name+color.
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanColor, setNewPlanColor] = useState(USER_COLOR_OPTIONS[0]);
  const [newPlanBannerName, setNewPlanBannerName] = useState<string | null>(null);

  // Voice Planning functions
  function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('음성 인식이 지원되지 않는 브라우저입니다.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript('');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceTranscript(transcript);
      parseVoiceCommand(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('음성 인식 오류:', event.error);
      setIsListening(false);
      alert('음성 인식에 실패했습니다.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsVoiceOpen(true);
  }

  function parseVoiceCommand(transcript: string) {
    // 간단한 파싱 로직: "오늘 15시부터 16시까지 업무" 형태 감지
    const text = transcript.replace(/\s+/g, ' ').trim();
    
    // 날짜 파싱 (오늘/내일)
    let targetDate = dateISO;
    if (text.includes('내일')) {
      const tomorrow = new Date(date);
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = toISODate(tomorrow);
    }
    setVoiceParsedDate(targetDate);

    // 시간 파싱: "15시", "15시 30분", "3시반" 등
    const timePattern = /(\d{1,2})시\s*(\d{1,2}분)?/g;
    const times: number[] = [];
    let match;
    while ((match = timePattern.exec(text)) !== null) {
      const hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      times.push(hour * 60 + minute);
    }

    if (times.length >= 2) {
      setVoiceParsedStart(minToTime(times[0]));
      setVoiceParsedEnd(minToTime(times[1]));
    } else if (times.length === 1) {
      setVoiceParsedStart(minToTime(times[0]));
      setVoiceParsedEnd(minToTime(times[0] + 60)); // 기본 1시간
    }

    // 활동 파싱: 마지막 단어를 활동으로 가정
    const words = text.split(' ');
    const lastWord = words[words.length - 1];
    
    // activities에서 이름이 포함된 것 찾기
    const matchedActivity = activities.find(act => 
      lastWord.includes(act.name) || act.name.includes(lastWord)
    );
    
    if (matchedActivity) {
      setVoiceParsedActivity(matchedActivity.name);
    } else {
      setVoiceParsedActivity(lastWord);
    }
  }

  function confirmVoicePlan() {
    if (!voiceParsedStart || !voiceParsedEnd || !voiceParsedActivity) {
      alert('시간 또는 활동 정보가 부족합니다.');
      return;
    }

    const startMin = timeToMin(voiceParsedStart);
    const endMin = timeToMin(voiceParsedEnd);
    
    // 활동 찾기 또는 생성
    let activityId = activities.find(a => a.name === voiceParsedActivity)?.id;
    if (!activityId) {
      // 새 활동 생성
      activityId = `voice_${Date.now()}`;
      const newActivity: Activity = {
        id: activityId,
        name: voiceParsedActivity,
        color: USER_COLOR_OPTIONS[Math.floor(Math.random() * USER_COLOR_OPTIONS.length)]
      };
      setActivities(prev => [...prev, newActivity]);
    }

    // Week grid에 계획 추가
    const targetWkKey = weekKeyFor(new Date(voiceParsedDate));
    setWeekStore(prev => {
      const grid = { ...(prev[targetWkKey] ?? {}) };
      for (let min = startMin; min < endMin; min += 10) {
        const hour = Math.floor(min / 60);
        const col = Math.floor((min % 60) / 10);
        const cellId = makeCellId(voiceParsedDate, hour, col);
        grid[cellId] = { ...(grid[cellId] ?? {}), activityId };
      }
      return { ...prev, [targetWkKey]: grid };
    });

    // 성공 메시지
    alert(`${voiceParsedActivity} 계획이 등록되었습니다.`);
    closeVoiceDialog();
  }

  function closeVoiceDialog() {
    setIsVoiceOpen(false);
    setVoiceTranscript('');
    setVoiceParsedStart('');
    setVoiceParsedEnd('');
    setVoiceParsedActivity('');
    setVoiceParsedDate('');
  }

  function confirmNewPlan() {
    const name = newPlanName.trim();
    if (!name) return;
    // NEW tool creates a temp preset (name+color) that acts as a one-shot brush.
    const id = `temp_${Date.now()}`;
    const act: Activity = { id, name, color: newPlanColor };
    setTempPresets((prev) => ({ ...prev, [id]: act }));

    tempBrushIdRef.current = id;

    // stay in NEW tool; user will drag on the grid to set time (10m snap)
    setActiveBrush(id);
    setActiveTool("new");
    setNewPlanBannerName(name);

    setIsNewPlanOpen(false);
    setNewPlanName("");
    setNewPlanColor(USER_COLOR_OPTIONS[0]);
  }

  // Timeline Checklist Block confirm (created by long-press)
  function confirmChecklistBlock() {
    if (!checklistBlockTargetCell) return;
    let startMin = snap10(timeToMin(checklistBlockStart));
    let endMin = snap10(timeToMin(checklistBlockEnd));
    if (endMin <= startMin) endMin = startMin + 10;
    const id = checklistBlockEditingId ?? `cb_${Date.now()}`;
    const now = Date.now();
    const activityId = checklistBlockActivityId || (dayGrid[checklistBlockTargetCell]?.execute as ActivityId | undefined) || activeBrush;
    const block: ChecklistBlock = {
      id,
      dateISO,
      startMin,
      endMin,
      layer: checklistBlockLayer,
      activityId: activityId as ActivityId,
      items: checklistBlockItems.map((it) => ({ ...it, createdAt: now, updatedAt: now })),
      createdAt: now,
      updatedAt: now,
    } as any;
    setChecklistBlocksStore((prev) => {
      const list = prev[dateISO] ?? [];
      const nextList = checklistBlockEditingId ? list.map((b) => (b.id === id ? block : b)) : [...list, block];
      return { ...prev, [dateISO]: nextList };
    });
    setIsChecklistBlockOpen(false);
    setChecklistBlockEditingId(null);
    setChecklistBlockItems([]);
    setChecklistBlockTargetCell(null);
    setChecklistBlockActivityId(null);
  }

  function toggleChecklistBlockItem(blockId: string, itemId: string) {
    setChecklistBlocksStore(prev => {
        const list = prev[dateISO] ?? [];
        const nextList = list.map(block => {
            if (block.id !== blockId) return block;
            const nextItems = block.items.map(item => {
                if (item.id !== itemId) return item;
                return { ...item, done: !item.done };
            });
            return { ...block, items: nextItems };
        });
        return { ...prev, [dateISO]: nextList };
    });
  }

  function deleteChecklistBlock(blockId: string) {
    setChecklistBlocksStore(prev => {
        const list = prev[dateISO] ?? [];
        const nextList = list.filter(b => b.id !== blockId);
        return { ...prev, [dateISO]: nextList };
    });
  }

  // Week view painting (minimal)
  function paintWeekCell(cellId: string, activityId: ActivityId | null) {
    setWeekStore((prev) => {
      const existing = prev[wkKey] ?? {};
      const next = { ...existing } as any;
      if (!activityId) {
        delete next[cellId];
      } else {
        const cur = next[cellId] ?? {};
        const primary = cur.activityId as ActivityId | undefined;
        const overlay = cur.overlayActivityId as ActivityId | undefined;
        if (!primary) {
          next[cellId] = { activityId, overlayActivityId: overlay };
        } else if (primary !== activityId && overlay !== activityId) {
          next[cellId] = { activityId: primary, overlayActivityId: activityId };
        } else {
          next[cellId] = { activityId: primary, overlayActivityId: overlay };
        }
      }
      return { ...prev, [wkKey]: next };
    });
  }

  // checklist helpers
  function addChecklistItem(text: string, time?: string) {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    const item: ChecklistItem = { id: String(Date.now()), text: t, time, done: false, createdAt: now, updatedAt: now } as any;
    setChecklistStore((prev) => ({ ...prev, [dateISO]: [...(prev[dateISO] ?? []), item] }));
  }
  function toggleChecklistDone(id: string) {
    setChecklistStore((prev) => {
      const items = prev[dateISO] ?? [];
      return { ...prev, [dateISO]: items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) };
    });
  }
  function deleteChecklistItem(id: string) {
    setChecklistStore((prev) => {
      const items = prev[dateISO] ?? [];
      return { ...prev, [dateISO]: items.filter((it) => it.id !== id) };
    });
  }

  function pruneCell(cell: DayGrid[string] | undefined) {
    if (!cell) return undefined;
    const next = { ...cell } as any;
    if (!next.execute && !next.overlay && !next.indicator && !(next.memos?.length)) return undefined;
    return next;
  }

  const doneCount = checklist.filter((c) => c.done).length;

  const planMinutesByAct = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const [cellId, val] of Object.entries(weekGrid)) {
      if (!cellId.startsWith(dateISO)) continue;
      if (val?.activityId) acc[val.activityId] = (acc[val.activityId] ?? 0) + 10;
      const overlay = (val as any)?.overlayActivityId as ActivityId | undefined;
      if (overlay) acc[overlay] = (acc[overlay] ?? 0) + 10;
    }
    return acc;
  }, [weekGrid, dateISO]);

  const executeMinutesByAct = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const val of Object.values(dayGrid)) {
      if (!val?.execute) continue;
      acc[val.execute] = (acc[val.execute] ?? 0) + 10;
    }
    return acc;
  }, [dayGrid]);

  const dailySummary = useMemo(() => {
    const ids = new Set<string>([...Object.keys(planMinutesByAct), ...Object.keys(executeMinutesByAct)]);
    return Array.from(ids).map((id) => {
      const planMin = planMinutesByAct[id] ?? 0;
      const execMin = executeMinutesByAct[id] ?? 0;
      const pct = planMin > 0 ? Math.round((execMin / planMin) * 100) : null;
      return { id, planMin, execMin, pct, activity: activityById[id] };
    });
  }, [planMinutesByAct, executeMinutesByAct, activityById]);

  function findSegmentAtCell(cellId: string): SelectedSeg | null {
    const { hour, col } = parseCellId(cellId);
    const row = (hour - startHour + 24) % 24;
    for (const layer of ["execute", "overlay"] as const) {
      const actId = (dayGrid[cellId] as any)?.[layer];
      if (!actId) continue;
      // Expand to contiguous range within the hour
      let startCol = col;
      while (startCol > 0) {
        const cId = makeCellId(dateISO, hour, startCol - 1);
        const cidAct = (dayGrid[cId] as any)?.[layer];
        if (cidAct !== actId) break;
        startCol--;
      }
      let endCol = col;
      while (endCol < 5) {
        const cId = makeCellId(dateISO, hour, endCol + 1);
        const cidAct = (dayGrid[cId] as any)?.[layer];
        if (cidAct !== actId) break;
        endCol++;
      }
      return { row, startCol, endCol, layer, activityId: actId };
    }
    return null;
  }

  const handleArmResize = useCallback(() => {
    if (!selectedSegment) return;
    setResizeArmed(true);
  }, [selectedSegment]);

  const handleResize = useCallback(
    (side: "start" | "end", col: number) => {
      if (!selectedSegment || !resizeArmed) return;
      if (!resizeState.current) {
        resizeState.current = { pointerId: -1, side, base: selectedSegment };
        pushSnapshot();
      }
      const base = resizeState.current.base;
      const nextStart = side === "start" ? Math.min(col, base.endCol) : base.startCol;
      const nextEnd = side === "end" ? Math.max(col, base.startCol) : base.endCol;
      const clampedStart = Math.max(0, Math.min(5, nextStart));
      const clampedEnd = Math.max(clampedStart, Math.min(5, nextEnd));
      const hour = (startHour + base.row) % 24;
      const layerKey = base.layer;
  const nextSeg: SelectedSeg = { ...base, startCol: clampedStart, endCol: clampedEnd };
      setDayStore((prev) => {
        const existing = prev[dateISO] ?? {};
        const next = { ...existing };
        for (let c = 0; c < 6; c++) {
          const cid = makeCellId(dateISO, hour, c);
          const cell = next[cid];
          if (!cell) continue;
          if ((cell as any)[layerKey] === base.activityId) {
            const within = c >= clampedStart && c <= clampedEnd;
            const updated: any = { ...cell };
            if (!within) {
              delete updated[layerKey];
              const pruned = pruneCell(updated);
              if (pruned) next[cid] = pruned;
              else delete next[cid];
            } else {
              next[cid] = updated;
            }
          }
        }
        for (let c = clampedStart; c <= clampedEnd; c++) {
          const cid = makeCellId(dateISO, hour, c);
          const cell: any = { ...(next[cid] ?? {}) };
          cell[layerKey] = base.activityId;
          next[cid] = cell;
        }
        return { ...prev, [dateISO]: next };
      });
      setFineBoundsStore((prev) => {
        const next = { ...prev };
        delete next[segmentKey(dateISO, startHour, base)];
        next[segmentKey(dateISO, startHour, nextSeg)] = { startMinute: clampedStart * 10, endMinute: (clampedEnd + 1) * 10 };
        return next;
      });
      setSelectedSegment(nextSeg);
    },
    [dateISO, resizeArmed, selectedSegment, startHour]
  );

  const handleFineResizeApply = useCallback(
    (side: "start" | "end", minute: number, mode: "minute" | "snap") => {
      if (!selectedSegment) return;
      const key = segmentKey(dateISO, startHour, selectedSegment);
      const base = selectedSegment;
      const bounds = fineBoundsStore[key] ?? defaultFineBounds(base);
      const snapped = mode === "snap" ? snap10(minute) : minute;
      const minStart = base.startCol * 10;
      const maxEnd = (base.endCol + 1) * 10;
      let nextStart = bounds.startMinute;
      let nextEnd = bounds.endMinute;
      if (side === "start") {
        nextStart = Math.min(Math.max(minStart, snapped), maxEnd - 1);
      } else {
        nextEnd = Math.max(Math.min(maxEnd, snapped), minStart + 1);
      }
      if (nextEnd <= nextStart) {
        nextEnd = Math.min(maxEnd, nextStart + 1);
      }
      setFineBoundsStore((prev) => ({ ...prev, [key]: { startMinute: nextStart, endMinute: nextEnd } }));
    },
    [dateISO, fineBoundsStore, selectedSegment, startHour]
  );

  // Map tools to plan context when dayMode is "plan" so the same tools work on weekGrid.
  const mapToolForDayMode = (tool: Tool): Tool => {
    if (dayMode !== "plan") return tool;
    if (tool === "erase") return "plan" as Tool; // plan erase via plan mode with null brush
    if (tool === "execute") return "plan" as Tool;
    if (tool === "new") return "plan" as Tool; // new in plan paints plan range
    return tool; // plan, indicator, select, etc.
  };

  function onCellPointerDown(cellId: string, e: React.PointerEvent, opts?: { intentLayer?: "execute" | "overlay" }) {
    // Prevent browser scrolling on touch and keep pointer events within grid.
    e.preventDefault();
    e.stopPropagation();

    if (resizeState.current && resizeState.current.pointerId !== e.pointerId) return;

    // Emoji brush: paint onto an existing contiguous segment under the tap.
    // This is independent of the current tool (works like a lightweight overlay action).
    if (emojiBrush && dayMode === "execute") {
      const seg = findSegmentAtCell(cellId);
      if (seg) {
        const key = segmentKey(dateISO, startHour, seg);
        setSegmentEmojiStore((prev) => ({ ...prev, [key]: emojiBrush }));
        return;
      }
    }

    const effectiveTool = mapToolForDayMode(activeTool);

    if (effectiveTool === "select") {
      const seg = findSegmentAtCell(cellId);
      // Emoji paint brush mode (B): when armed, tapping paints emoji onto the segment
      // WITHOUT changing selection. (Similar to checklist tool behavior.)
      if (seg && emojiBrush) {
        const key = segmentKey(dateISO, startHour, seg);
        setSegmentEmojiStore((prev) => ({ ...prev, [key]: emojiBrush }));
        return;
      }

      setSelectedSegment(seg);
      setResizeArmed(false);
      resizeState.current = null;
      return;
    }

    // Tool priority
    // Always require pointer pressed for drag: pointerdown starts, pointermove continues.
    // Do NOT setPointerCapture on individual cells.
    pushSnapshot();

    if (effectiveTool === "indicator") {
      armedDrag.current = null;
      setIndicatorTargetCell(cellId);
      setIndicatorLabel("");
      setIndicatorTimeText(indicatorTimeTextFromCell(cellId));
      setIsIndicatorOpen(true);
      return;
    }

    if (effectiveTool === "new") {
      // Require a temp preset; if none, open dialog first.
      if (!tempBrushIdRef.current) {
        setIsNewPlanOpen(true);
        return;
      }
      armedDrag.current = null;
      pendingStartCell.current = null;
      beginDrag(e.pointerId, cellId, dayMode === "plan" ? "plan" : "new", true);
    } else if (effectiveTool === "plan") {
      armedDrag.current = null;
      pendingStartCell.current = cellId;
      const brushOverride = dayMode === "plan" && activeTool === "erase" ? null : activeBrush;
      beginDrag(e.pointerId, cellId, "plan", false, brushOverride);
    } else if (effectiveTool === "erase") {
      armedDrag.current = null;
      // Defer erase to support long-press, same as execute tool.
      pendingStartCell.current = cellId;
      beginDrag(e.pointerId, cellId, "erase", false);
    } else {
      // default: execute paint/overlay paint
      // To support long-press checklist without accidental paint, we defer the first paint until
      // the user actually drags into another cell.
      armedDrag.current = null;
      pendingStartCell.current = cellId;
      beginDrag(e.pointerId, cellId, "execute", false);
    }

  // Memo tool behavior:
  // - Create/edit entry point: memo tool ON + tap a cell that has a segment.
  // - Existing memos are opened via the memo-column squares (available without memo tool).
    if (activeTool === "memo") {
      // Don't start paint/erase/drag in memo mode; just open memo when there's an activity under the pointer.
      const { hour, col } = parseCellId(cellId);
      const rowIdx = (hour - startHour + 24) % 24;
      const executeUnder = segments.find((s) => s.layer === "execute" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
      const overlayUnder = segments.find((s) => s.layer === "overlay" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);

      let layer: "execute" | "overlay";
      if (overlayUnder && executeUnder) {
        if (opts?.intentLayer) {
          layer = opts.intentLayer;
        } else {
          const cellEl = document.querySelector(`[data-cellid="${cellId}"]`) as HTMLElement | null;
          const rect = cellEl?.getBoundingClientRect?.();
          const clientY = e.clientY;
          const y = rect ? clientY - rect.top : 0;
          const h = rect ? rect.height : 80;
          const overlayStrip = Math.max(18, Math.min(32, h * 0.4));
          layer = y >= h - overlayStrip ? "overlay" : "execute";
        }
      } else if (overlayUnder) {
        layer = "overlay";
      } else {
        layer = "execute";
      }

      const pickedAct = layer === "overlay" ? overlayUnder?.activityId : executeUnder?.activityId;
      if (pickedAct) {
        openMemoForActivity(pickedAct as ActivityId, layer, { cellId });
      }

      // Swallow the event in memo mode.
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Long-press (450ms) on a 10-min cell -> Timeline checklist creation/edit.
    // Long-press is canceled as soon as the user drags across cells or moves > threshold.
    longPressStart.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, cellId, intentLayer: opts?.intentLayer };
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressTimer.current = window.setTimeout(() => {
      const st = dragRef.current;
      const lp = longPressStart.current;
      if (!st.isDown) return;
      if (!lp || lp.pointerId !== e.pointerId) return;

      // Still pending (no drag yet) -> open checklist block modal
      // This check is key: it ensures we haven't started a real drag by moving to another cell.
      if (!pendingStartCell.current || pendingStartCell.current !== cellId) return;

      // End drag without painting or erasing
      st.isDown = false;
      st.mode = null;
      st.pointerId = -1; // Use -1 or another invalid value
      pendingStartCell.current = null;
      armedDrag.current = null;
      
      const { hour, col } = parseCellId(cellId);
      const pressTimeMin = hour * 60 + col * 10;
      const rowIdx = (hour - startHour + 24) % 24;
      const executeUnder = segments.find((s) => s.layer === "execute" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
      const overlayUnder = segments.find((s) => s.layer === "overlay" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
      // Layer selection rule:
      // - If only one layer exists under this cell, use it.
      // - If both exist, use the press Y position inside the cell:
      //   top area -> execute (본), bottom strip -> overlay (중복)
      let layer: "execute" | "overlay";
      if (overlayUnder && executeUnder) {
        // 1) If user pressed the explicit overlay hit area, respect it.
        // 2) Otherwise, fall back to a Y-based heuristic.
        const lp0 = longPressStart.current;
        if (lp0?.pointerId === e.pointerId && lp0.intentLayer) {
          layer = lp0.intentLayer;
        } else {
          // Use pointer start position captured on pointerdown; long-press callback runs later and e.clientY can be misleading.
          const clientY = lp0 && lp0.pointerId === e.pointerId ? lp0.y : e.clientY;
          const cellEl = document.querySelector(`[data-cellid="${cellId}"]`) as HTMLElement | null;
          const rect = cellEl?.getBoundingClientRect?.();
          const y = rect ? clientY - rect.top : 0;
          const h = rect ? rect.height : 80;
          const overlayStrip = Math.max(18, Math.min(32, h * 0.4));
          layer = y >= h - overlayStrip ? "overlay" : "execute";
        }
      } else if (overlayUnder) {
        layer = "overlay";
      } else {
        layer = "execute";
      }

      const existingBlock = checklistBlocks.find((b) => b.layer === layer && pressTimeMin >= b.startMin && pressTimeMin < b.endMin);
      if (existingBlock) {
        // Edit existing checklist block for the chosen layer only
        setChecklistBlockEditingId(existingBlock.id);
        setChecklistBlockLayer(existingBlock.layer === "overlay" ? "overlay" : "execute");
        setChecklistBlockStart(minToTime(existingBlock.startMin));
        setChecklistBlockEnd(minToTime(existingBlock.endMin));
        setChecklistBlockItems(existingBlock.items.map((it) => ({ id: it.id, text: it.text, done: it.done })));
        setChecklistBlockActivityId(existingBlock.activityId as ActivityId);
        setChecklistBlockTargetCell(cellId);
        setIsChecklistBlockOpen(true);
      } else {
        // Create new checklist block
        const startMin = hour * 60 + col * 10;
        const endMin = Math.min(startMin + 10, 24 * 60);
        setChecklistBlockTargetCell(cellId);
        setChecklistBlockEditingId(null);
        setChecklistBlockLayer(layer);
        const pickedAct = layer === "overlay" ? overlayUnder?.activityId : executeUnder?.activityId;
        setChecklistBlockActivityId((pickedAct as ActivityId | undefined) ?? null);
        setChecklistBlockStart(timeFromMinutes(startMin));
        setChecklistBlockEnd(timeFromMinutes(endMin));
        setChecklistBlockItems([{ id: `cbi_${Date.now()}`, text: "", done: false }]);
        setIsChecklistBlockOpen(true);
      }
    }, 450);
  }

  function onCellPointerEnter(cellId: string, e: React.PointerEvent) {
    // Paint/erase MUST only occur while the primary button is held.
    // If we ever miss a pointerup (e.g., released outside), hard-reset when buttons==0.
    const st = dragRef.current;
    if (!st.isDown) return;
    if (st.pointerId !== e.pointerId) return;

    if ((e.buttons & 1) === 0) {
      endDrag(st.pointerId);
      return;
    }

    // Any movement across cells cancels pending long-press (prevents modal/drag conflict).
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    continueDrag(cellId);
  }

  const openMemoForHour = useCallback(
    (hour: number, layer: "execute" | "overlay", opts?: { cellId?: string; index?: 0 | 1; activityId?: ActivityId }) => {
      // Capacity rule:
      // - execute: up to 2 memos per hour, tied to (hour, activityId, index)
      // - overlay: 1 memo per hour (index=0)
      let idx: 0 | 1 = opts?.index ?? 0;
      if (layer === "overlay") idx = 0;

      const actKey = layer === "execute" ? (opts?.activityId ?? ("__NA__" as ActivityId)) : ("__HOUR__" as ActivityId);
      const fixedId = `memo_${dateISO}_${layer}_h${hour}_${actKey}_${idx}`;
      const existing = memoBlocks.find(
        (m) =>
          m.layer === layer &&
          (m as any).hour === hour &&
          (layer === "overlay" ? true : m.activityId === actKey) &&
          new RegExp(`_${idx}$`).test(m.id)
      );

      setMemoBlockEditingId(existing?.id ?? fixedId);
      setMemoBlockTargetCell(opts?.cellId ?? null);
      setMemoBlockLayer(layer);
      setMemoBlockHour(hour);
      setMemoBlockIndex(idx);
      setMemoBlockText(existing?.text ?? "");
      setIsMemoBlockOpen(true);
    },
    [dateISO, memoBlocks]
  );

  // Back-compat name: callsites still pass (activityId, layer). We ignore activityId for uniqueness.
  const openMemoForActivity = useCallback(
    (activityId: ActivityId, layer: "execute" | "overlay", opts?: { cellId?: string; index?: 0 | 1 }) => {
      const hour = opts?.cellId ? parseCellId(opts.cellId).hour : startHour;
      openMemoForHour(hour, layer, { cellId: opts?.cellId, activityId, index: opts?.index });
    },
    [openMemoForHour, startHour]
  );

  // Kept because some UI bits still call this name.
  const openMemoForCell = useCallback(
    (cellId: string, layer: "execute" | "overlay") => {
      const { hour, col } = parseCellId(cellId);
      const rowIdx = (hour - startHour + 24) % 24;
      const executeUnder = segments.find((s) => s.layer === "execute" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
      const overlayUnder = segments.find((s) => s.layer === "overlay" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
      const pickedAct = (layer === "overlay" ? overlayUnder?.activityId : executeUnder?.activityId) as ActivityId | undefined;

      // "Create" intent: if memo tool is active, auto-pick the next available slot.
      if (activeTool === "memo") {
        if (layer === "overlay") {
          openMemoForHour(hour, layer, { cellId, activityId: pickedAct, index: 0 });
          return;
        }
        if (!pickedAct) {
          openMemoForHour(hour, layer, { cellId, activityId: pickedAct, index: 0 });
          return;
        }
        const has0 = memoBlocks.some((m) => m.layer === "execute" && (m as any).hour === hour && m.activityId === pickedAct && /_0$/.test(m.id) && m.text.trim().length > 0);
        const has1 = memoBlocks.some((m) => m.layer === "execute" && (m as any).hour === hour && m.activityId === pickedAct && /_1$/.test(m.id) && m.text.trim().length > 0);
        const nextIdx: 0 | 1 = !has0 ? 0 : !has1 ? 1 : 0;
        openMemoForHour(hour, layer, { cellId, activityId: pickedAct, index: nextIdx });
        return;
      }

      // Default open behavior (non-memo tool)
      openMemoForHour(hour, layer, { cellId, activityId: pickedAct, index: 0 });
    },
    [activeTool, memoBlocks, openMemoForHour, segments, startHour]
  );

  const saveMemoBlock = useCallback(() => {
    if (memoBlockHour === null) return;
    const now = Date.now();
    const idx: 0 | 1 = memoBlockIndex ?? 0;
    const actKey = memoBlockLayer === "execute" ? ((memoBlockTargetCell ? (() => {
      const { hour, col } = parseCellId(memoBlockTargetCell);
      const rowIdx = (hour - startHour + 24) % 24;
      const under = segments.find((s) => s.layer === "execute" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
      return (under?.activityId as ActivityId | undefined) ?? ("__NA__" as ActivityId);
    })() : ("__NA__" as ActivityId)) as ActivityId) : ("__HOUR__" as ActivityId);
    const id = memoBlockEditingId ?? `memo_${dateISO}_${memoBlockLayer}_h${memoBlockHour}_${actKey}_${idx}`;

    setMemoBlocksStore((prev) => {
      const list = prev[dateISO] ?? [];
      const nextBlock: MemoBlock = {
        id,
        dateISO,
        layer: memoBlockLayer,
        hour: memoBlockHour,
        ...(memoBlockLayer === "execute" ? { activityId: actKey } : {}),
        text: memoBlockText,
        updatedAt: now,
        ...(memoBlockTargetCell ? { cellId: memoBlockTargetCell } : {})
      };

      const nextList = list
        // remove existing memo for this same (layer, hour, index)
        .filter((m) => {
          if (!(m.layer === memoBlockLayer && (m as any).hour === memoBlockHour && new RegExp(`_${idx}$`).test(m.id))) return true;
          if (memoBlockLayer === "overlay") return false;
          return m.activityId !== actKey;
        })
        .concat(nextBlock);

      return { ...prev, [dateISO]: nextList };
    });

    setIsMemoBlockOpen(false);
  }, [dateISO, memoBlockEditingId, memoBlockHour, memoBlockIndex, memoBlockLayer, memoBlockTargetCell, memoBlockText, segments, startHour]);

  function onCellPointerUp(cellId: string, e: React.PointerEvent) {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const st = dragRef.current;
    if (pendingStartCell.current && st.isDown && st.pointerId === e.pointerId) {
      const first = pendingStartCell.current;
      pendingStartCell.current = null;
      if (st.mode === "erase") eraseCell(first);
      else if (st.mode === "plan") paintPlanCell(first, st.brush);
      else if (st.brush) paintCell(first, st.brush);
    }
    const snap = endDrag(e.pointerId);
    const isPlanContext = dayMode === "plan";
    if (snap && snap.mode === "new" && snap.startCellId) {
      const endCell = snap.lastCellId ?? snap.startCellId;
      const { hour: sh, col: sc } = parseCellId(snap.startCellId);
      const { hour: eh, col: ec } = parseCellId(endCell);
      const startMin = sh * 60 + sc * 10;
      const endMin = eh * 60 + ec * 10 + 10;
      if (isPlanContext) paintPlanRange(dateISO, Math.min(startMin, endMin), Math.max(startMin, endMin), snap.usedBrush);
      else paintRange(dateISO, Math.min(startMin, endMin), Math.max(startMin, endMin), snap.usedBrush);
    } else if (snap && snap.mode === "plan" && snap.startCellId) {
      const endCell = snap.lastCellId ?? snap.startCellId;
      const { hour: sh, col: sc } = parseCellId(snap.startCellId);
      const { hour: eh, col: ec } = parseCellId(endCell);
      const startMin = sh * 60 + sc * 10;
      const endMin = eh * 60 + ec * 10 + 10;
      paintPlanRange(dateISO, Math.min(startMin, endMin), Math.max(startMin, endMin), snap.usedBrush);
    }
    armedDrag.current = null;

    pendingStartCell.current = null;
    setDragTick((t) => t + 1);
  }

  function onCellPointerCancel(e: React.PointerEvent) {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    endDrag(e.pointerId);
    armedDrag.current = null;
  }

  // Week view pointer handling (simple)
  const weekDrag = useRef<{ isDown: boolean; mode: "paint" | "erase"; pointerId: number } | null>(null);
  // Ensure WEEK drag always terminates even if pointer is released outside the week grid DOM.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (weekDrag.current?.isDown) weekDrag.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function onWeekCellPointerDown(cellId: string, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Do NOT setPointerCapture on cells for the same reason as Day view.
    weekDrag.current = { isDown: true, mode: activeTool === "erase" ? "erase" : "paint", pointerId: e.pointerId };
    if (activeTool === "erase") paintWeekCell(cellId, null);
    else paintWeekCell(cellId, activeBrush);
  }
  function onWeekCellPointerEnter(cellId: string, e: React.PointerEvent) {
    if (!weekDrag.current?.isDown) return;
    if (weekDrag.current.pointerId !== e.pointerId) return;

    // Never paint on hover; require primary button held.
    if ((e.buttons & 1) === 0) {
      weekDrag.current = null;
      return;
    }

    if (weekDrag.current.mode === "erase") paintWeekCell(cellId, null);
    else paintWeekCell(cellId, activeBrush);
  }
  function onWeekCellPointerMove(cellId: string, e: React.PointerEvent) {
    onWeekCellPointerEnter(cellId, e);
  }
  function onWeekCellPointerUp(e: React.PointerEvent) {
    weekDrag.current = null;
  }

  // Day view: ghost block from week plan (only if execute empty)
  function applyWeekPlanToDayCell(cellId: string) {
    const wk = weekGrid[cellId];
    if (!wk) return;
    const planAct = wk.activityId ?? (wk as any).overlayActivityId;
    if (!planAct) return;
    updateCell(cellId, (cell) => {
      const next = { ...(cell ?? {}) };
      if (!next.execute) next.execute = planAct;
      return next;
    });
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <style>{`
        @keyframes paletteIn {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div className="flex h-full w-full">
        {/* Left Sidebar */}
        <aside className={clsx("border-r border-[color:var(--border)] bg-[color:var(--bg)] transition-all duration-200", isSidebarOpen ? "w-20" : "w-12")}
          aria-label="Left sidebar"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-2 py-1">
              {isSidebarOpen && <span className="text-[11px] font-semibold opacity-70">도구</span>}
              <IconButton size="sm" onClick={() => setIsSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
                {isSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </IconButton>
            </div>

            <Divider />

            <div className="p-2">
              <div className="grid grid-cols-1 gap-2">
                <ToolButton label="실행" collapsed={!isSidebarOpen} icon={<Play className="h-4 w-4" />} active={activeTool === "execute"} onClick={() => setActiveTool("execute")} />
                <ToolButton label="지표" collapsed={!isSidebarOpen} icon={<Flag className="h-4 w-4" />} active={activeTool === "indicator"} onClick={() => setActiveTool("indicator")} />
                <ToolButton label="메모" collapsed={!isSidebarOpen} icon={<span className="text-base leading-none">📝</span>} active={activeTool === "memo"} onClick={() => setActiveTool("memo")} />
                <ToolButton label="삭제" collapsed={!isSidebarOpen} icon={<Eraser className="h-4 w-4" />} active={activeTool === "erase"} onClick={() => setActiveTool("erase")} />
                <ToolButton label="신규" collapsed={!isSidebarOpen} icon={<Sparkles className="h-4 w-4" />} active={activeTool === "new"} onClick={() => setActiveTool("new")} />
              </div>
            </div>

            <Divider />

            <div className="flex items-center justify-center gap-2 p-2">
              <IconButton size="sm" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
                <Undo2 className="h-4 w-4" />
              </IconButton>
              <IconButton size="sm" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
                <Redo2 className="h-4 w-4" />
              </IconButton>
            </div>

            <Divider />

            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-1 gap-2">
                {activities.map((a) => (
                  <CategoryButton
                    key={a.id}
                    name={a.name}
                    color={a.color}
                    active={activeBrush === a.id}
                    collapsed={!isSidebarOpen}
                    onClick={() => {
                      // If a long-press just fired, ignore the click that follows.
                      if (catLongPressFired.current) {
                        catLongPressFired.current = false;
                        return;
                      }
                      setActiveBrush(a.id);
                    }}
                    onEdit={() => openEditCategoryDialog(a)}
                    onLongPressStart={(e) => startCategoryLongPress(e, a.id)}
                    onDragStartHandle={(e) => {
                      dragActivityId.current = a.id;
                      try {
                        e.dataTransfer.setData("text/plain", a.id);
                      } catch {
                        // ignore
                      }
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOverTile={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDropOnTile={(e) => {
                      e.preventDefault();
                      const dragId = dragActivityId.current ?? (e.dataTransfer.getData("text/plain") as ActivityId);
                      if (!dragId) return;
                      moveActivity(dragId, a.id);
                      dragActivityId.current = null;
                    }}
                  />
                ))}
                <button
                  className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[color:var(--border)] py-3 text-xs text-[color:var(--fg)] hover:bg-[color:var(--secondary)]"
                  onClick={() => setIsAddCategoryOpen(true)}
                  aria-label="Add category"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[color:var(--border)]">+</div>
                  {!isSidebarOpen ? null : "추가"}
                </button>
              </div>
            </div>

            <Divider />

            <div className="p-2">
              <IconButton
                size="md"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label="Toggle theme"
                className="w-full"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="border-b border-[color:var(--border)] bg-[color:var(--bg)] px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">{formatDateKorean(date)}</div>
                <div className="mt-1 text-xs tracking-widest text-[color:var(--primary)]">LIFE LOG PLANNER</div>
              </div>

              <div className="flex items-center gap-2">
                {/* Voice Planning Button */}
                <IconButton
                  onClick={startVoiceRecognition}
                  disabled={isListening}
                  className={clsx(isListening && "animate-pulse")}
                  title="음성으로 계획 추가"
                >
                  <Mic className={clsx("h-4 w-4", isListening && "text-[color:var(--destructive)]")} />
                </IconButton>

                {/* Start time dropdown */}
                <div className="relative">
                  <Button
                    variant="secondary"
                    onClick={() => setStartMenuOpen((v) => !v)}
                    className="h-10"
                    aria-haspopup="menu"
                    aria-expanded={startMenuOpen}
                  >
                    <Settings className="h-4 w-4" />
                    {pad2(startHour)}:00 시작
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {startMenuOpen && (
                    <div
                      className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] shadow-[var(--shadow)]"
                      role="menu"
                    >
                      {startOptions.map((h) => (
                        <button
                          key={h}
                          className={clsx(
                            "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-[color:var(--secondary)]",
                            h === startHour && "bg-[color:var(--secondary)]"
                          )}
                          onClick={() => {
                            setStartHour(h);
                            setStartMenuOpen(false);
                          }}
                        >
                          {pad2(h)}:00
                          {h === startHour ? <span className="text-[color:var(--primary)]">●</span> : <span className="opacity-30">○</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* View mode toggle */}
                <div className="flex h-10 overflow-hidden rounded-md border border-[color:var(--border)]">
                  <button
                    className={clsx("px-4 text-sm", view === "DAY" ? "bg-[color:var(--secondary)]" : "bg-transparent")}
                    onClick={() => setView("DAY")}
                  >
                    DAY
                  </button>
                  <button
                    className={clsx("px-4 text-sm", view === "WEEK" ? "bg-[color:var(--secondary)]" : "bg-transparent")}
                    onClick={() => setView("WEEK")}
                  >
                    WEEK
                  </button>
                </div>

                {view === "DAY" && (
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-[color:var(--border)] text-xs">
                      <button
                        className={clsx("px-3 py-1 font-semibold", dayMode === "execute" ? "bg-[color:var(--secondary)]" : "bg-transparent")}
                        onClick={() => {
                          setDayMode("execute");
                        }}
                      >
                        실행 뷰
                      </button>
                      <button
                        className={clsx("px-3 py-1 font-semibold", dayMode === "plan" ? "bg-[color:var(--secondary)]" : "bg-transparent")}
                        onClick={() => {
                          setDayMode("plan");
                        }}
                      >
                        계획 뷰
                      </button>
                    </div>
                  </div>
                )}

                {/* Date nav */}
                <IconButton size="md" onClick={() => setDate((d) => new Date(d.getTime() - 86400000))} aria-label="Prev day">
                  <ChevronLeft className="h-4 w-4" />
                </IconButton>
                <IconButton size="md" onClick={() => setDate((d) => new Date(d.getTime() + 86400000))} aria-label="Next day">
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="relative flex min-h-0 flex-1">
            {/* Timeline area */}
            <div className="min-w-0 flex-1 overflow-auto">
              {activeTool === "new" && (
                <div className="sticky top-0 z-40 bg-secondary/50 py-1 text-center text-sm text-foreground/50 backdrop-blur-sm">
                  {newPlanBannerName ? `(${newPlanBannerName} 일정 생성 중)` : "(신규 일정 생성 중)"}
                </div>
              )}
              {view === "DAY" ? (
                <div className="h-full min-w-0 px-4 py-4">
                  <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] shadow-sm">
                    <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-2 text-sm font-semibold">
                      <div className="flex items-center gap-3">
                        <span>{dayMode === "execute" ? "실행" : "계획"}</span>

                        {/* Sleep + Mood summary (wake-day basis) */}
                        <div className="flex items-center gap-2 text-[11px] font-medium">
                          <button
                            type="button"
                            className="rounded-full border border-[color:var(--border)] bg-[color:var(--secondary)] px-2 py-0.5 opacity-80 hover:opacity-100"
                            onClick={() => {
                              openSleepDialog();
                            }}
                            aria-label="기상 시간 설정"
                          >
                            수면: {sleepDurationMin == null ? "-" : formatDurationHM(sleepDurationMin)}
                          </button>

                          <div className="flex items-center gap-1">
                            <span className="opacity-60">컨디션</span>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={clsx(
                                  "h-6 w-6 rounded-full border text-[12px]",
                                  dayMood === n
                                    ? "border-[color:var(--border)] bg-[color:var(--secondary)]"
                                    : "border-transparent bg-transparent hover:border-[color:var(--border)]"
                                )}
                                aria-label={`컨디션 ${n}`}
                                onClick={() => setDayMood(n as 1 | 2 | 3 | 4 | 5)}
                              >
                                {n}
                              </button>
                            ))}
                          </div>

                          {dayMode === "execute" && (
                            <div className="flex items-center gap-1 pl-2">
                              {selectedSegmentKey ? (
                                <>
                                  <span className="opacity-60">
                                    {selectedSegmentName ?? "과업"}
                                    {selectedSegmentEmoji ? <span className="pl-1">{selectedSegmentEmoji}</span> : null}
                                  </span>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      className={clsx(
                                        "h-6 w-6 rounded-full border text-[12px]",
                                        selectedSegmentMood === n
                                          ? "border-[color:var(--border)] bg-[color:var(--secondary)]"
                                          : "border-transparent bg-transparent hover:border-[color:var(--border)]"
                                      )}
                                      aria-label={`과업 점수 ${n}`}
                                      onClick={() => setSelectedSegmentMood(n as 1 | 2 | 3 | 4 | 5)}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </>
                              ) : (
                                <span className="text-[11px] opacity-50">(과업 선택 후 점수)</span>
                              )}

                              {/* Emoji brush panel (always visible in execute DAY) */}
                              <div className="ml-2 flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-1 py-0.5">
                                <span className={clsx("px-1 text-[10px]", emojiBrush ? "opacity-80" : "opacity-60")}>이모지</span>
                                {(["😀", "🙂", "😐", "😕", "😫", "🔥", "💪", "🧠", "📚", "🧘", "🍽️", "🚶", "💤"] as const).map((em) => (
                                  <button
                                    key={em}
                                    type="button"
                                    className={clsx(
                                      "h-6 w-6 rounded-md border text-[14px]",
                                      emojiBrush === em
                                        ? "border-[color:var(--primary)] bg-[color:var(--secondary)]"
                                        : "border-transparent bg-transparent hover:border-[color:var(--border)]"
                                    )}
                                    aria-label={`emoji brush ${em}`}
                                    onClick={() => setEmojiBrush(em)}
                                  >
                                    {em}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className={clsx(
                                    "ml-1 h-6 rounded-md border px-2 text-[11px]",
                                    emojiBrush ? "border-[color:var(--border)] hover:bg-[color:var(--secondary)]" : "border-transparent opacity-40"
                                  )}
                                  onClick={() => setEmojiBrush(null)}
                                  aria-label="clear emoji brush"
                                >
                                  해제
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <span className="text-[11px] opacity-60">{dayMode === "execute" ? "실제 실행 기록" : "계획/중첩 계획 전용"}</span>
                    </div>
                    <div className="overflow-auto">
                      <DayTimeline
                        mode={dayMode}
                        dateISO={dateISO}
                        todayISO={todayISO}
                        nowMin={nowMin}
                        startHour={startHour}
                        grid={dayGrid}
                        weekGrid={weekGrid}
                        checklistBlocks={checklistBlocksStore[dateISO] ?? []}
                        memoBlocks={memoBlocksStore[dateISO] ?? []}
                        segments={segments}
                        planSegments={planSegments}
                        showPlanOverlay={dayMode === "plan" ? true : showPlanOverlay}
                        activityById={activityById}
                        activeTool={activeTool}
                        onChangeTool={setActiveTool}
                        newGhost={newGhost}
                        fineBounds={fineBoundsStore}
                        selectedSegment={selectedSegment}
                        resizeArmed={resizeArmed}
                        onArmResize={handleArmResize}
                        onResize={handleResize}
                        onFineResizeApply={handleFineResizeApply}
                        onSelectSegment={(seg) => {
                          setSelectedSegment(seg);
                          setResizeArmed(false);
                          resizeState.current = null;
                        }}
                        onCellPointerDown={onCellPointerDown}
                        onCellPointerEnter={onCellPointerEnter}
                        onCellPointerUp={onCellPointerUp}
                        onCellPointerCancel={onCellPointerCancel}
                        onApplyWeekPlan={applyWeekPlanToDayCell}
                        onDeleteIndicator={deleteIndicator}
                        onToggleChecklistBlockItem={toggleChecklistBlockItem}
                        onOpenMemo={openMemoForActivity}
                        showMiniPlanControls={false}
                        segmentEmojiStore={segmentEmojiStore}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <WeekTimeline
                  weekKey={wkKey}
                  startHour={startHour}
                  weekGrid={weekGrid}
                  activityById={activityById}
                  days={daysOfWeekFrom(wkKey)}
                  activeTool={activeTool}
                  onChangeTool={setActiveTool}
                  onWeekCellPointerDown={onWeekCellPointerDown}
                  onWeekCellPointerEnter={onWeekCellPointerEnter}
                  onWeekCellPointerMove={onWeekCellPointerMove}
                  onWeekCellPointerUp={onWeekCellPointerUp}
                />
              )}
            </div>

            {/* Checklist panel (right, toggle) */}
            <div className={clsx("relative h-full", isChecklistOpen ? "w-72" : "w-0")}>
              <button
                className={clsx(
                  "absolute left-0 top-1/2 z-30 -translate-x-full -translate-y-1/2 rounded-l-md border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-2"
                )}
                onClick={() => setIsChecklistOpen((v) => !v)}
                aria-label="Toggle checklist"
              >
                {isChecklistOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>

              {isChecklistOpen && (
                <div className="h-full w-72 border-l border-[color:var(--border)] bg-[color:var(--bg)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4" />
                      <div className="text-sm font-semibold">체크리스트</div>
                    </div>
                    <div className="text-xs opacity-70">{doneCount}/{checklist.length}</div>
                  </div>

                  <div className="mt-3 space-y-2 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] p-3">
                    <div className="text-[11px] font-semibold text-[color:var(--primary)]">오늘 요약 (계획 vs 실행)</div>
                    {dailySummary.length === 0 ? (
                      <div className="text-xs opacity-70">계획/실행 데이터가 없습니다</div>
                    ) : (
                      <div className="space-y-2">
                        {dailySummary.map((row) => (
                          <div key={row.id} className="space-y-1 rounded-md bg-white/30 p-2 text-[11px] shadow-sm dark:bg-black/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full" style={{ background: row.activity?.color ?? "#999" }} />
                                <span className="font-semibold">{row.activity?.name ?? row.id}</span>
                              </div>
                              <span className="text-[10px] opacity-70">{row.planMin / 60 >= 1 ? `${(row.planMin / 60).toFixed(1)}h` : `${row.planMin}m`} 계획</span>
                            </div>
                            <div className="relative h-2.5 overflow-hidden rounded-full bg-[color:var(--border)]">
                              <div
                                className="absolute left-0 top-0 h-full"
                                style={{ width: `${Math.min(100, (row.execMin / Math.max(1, row.planMin || row.execMin || 1)) * 100)}%`, background: row.activity?.color ?? "var(--primary)", opacity: 0.8 }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] opacity-80">
                              <span>실행 {row.execMin}m</span>
                              <span>
                                {row.pct !== null ? `${row.pct}%` : "계획 없음"}
                                {row.planMin > 0 && ` / ${row.planMin}m`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Divider />
                  <ChecklistEditor onAdd={addChecklistItem} />



                  <div className="mt-4 space-y-2 overflow-auto">
                    {checklist.length === 0 ? (
                      <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] p-3 text-sm opacity-70">
                        체크리스트가 비어있습니다
                      </div>
                    ) : (
                      checklist.map((it) => (
                        <div
                          key={it.id}
                          className="group flex items-start justify-between gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] p-2"
                        >
                          <label className="flex flex-1 cursor-pointer items-start gap-2">
                            <input type="checkbox" checked={it.done} onChange={() => toggleChecklistDone(it.id)} className="mt-1" />
                            <div className="min-w-0">
                              <div className={clsx("text-sm", it.done && "line-through opacity-60")}>{it.text}</div>
                              {it.time && (
                                <div className="mt-1 text-xs opacity-70">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="opacity-70">🕒</span> {it.time}
                                  </span>
                                </div>
                              )}
                            </div>
                          </label>
                          <button
                            className="invisible rounded-md px-2 py-1 text-xs opacity-70 hover:opacity-100 group-hover:visible"
                            onClick={() => deleteChecklistItem(it.id)}
                            aria-label="Delete item"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Dialogs */}
      <Dialog open={isAddCategoryOpen} title="새 카테고리 추가" onClose={() => setIsAddCategoryOpen(false)}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>이름</Label>
            <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="예: 공부" />
          </div>

          <div className="space-y-2">
            <Label>색상</Label>
            <div className="grid grid-cols-10 gap-2 transition-transform duration-200 ease-out motion-safe:translate-y-0 motion-safe:animate-[paletteIn_160ms_ease-out]">
              {USER_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  className={clsx("h-8 w-8 rounded-full border", c === newCatColor ? "border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]" : "border-[color:var(--border)]")}
                  style={{ background: c }}
                  onClick={() => setNewCatColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>


          <div className="flex justify-end">
            <Button onClick={confirmAddCategory}>추가하기</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isEditCategoryOpen}
        title="카테고리 수정"
        onClose={() => {
          setIsEditCategoryOpen(false);
          setEditCatId(null);
        }}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>이름</Label>
            <Input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} placeholder="예: 공부" />
          </div>

          <div className="space-y-2">
            <Label>색상</Label>
            <div className="grid grid-cols-10 gap-2">
              {USER_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  className={clsx(
                    "h-8 w-8 rounded-full border",
                    c === editCatColor ? "border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]" : "border-[color:var(--border)]"
                  )}
                  style={{ background: c }}
                  onClick={() => setEditCatColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (!editCatId) return;
                deleteCategory(editCatId);
              }}
            >
              삭제
            </Button>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsEditCategoryOpen(false);
                  setEditCatId(null);
                }}
              >
                취소
              </Button>
              <Button onClick={confirmEditCategory}>저장</Button>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog open={isIndicatorOpen} title="지표 추가" onClose={() => setIsIndicatorOpen(false)}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>이름</Label>
            <Input value={indicatorLabel} onChange={(e) => setIndicatorLabel(e.target.value)} placeholder="예: 약 복용" />
          </div>
          <div className="space-y-2">
            <Label>시간</Label>
            <Input value={indicatorTimeText} onChange={(e) => setIndicatorTimeText(e.target.value)} placeholder="08:30" />
          </div>
          <div className="flex justify-end">
            <Button onClick={confirmAddIndicator}>추가하기</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={isSleepOpen} title="수면 입력" onClose={() => setIsSleepOpen(false)}>
        <div className="space-y-4">
          <div className="text-xs opacity-70">기준: 기상한 날짜({dateISO})</div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>어제/오늘 몇 시부터</Label>
              <Input value={sleepStartText} onChange={(e) => setSleepStartText(e.target.value)} placeholder="23:30" />
            </div>
            <div className="space-y-2">
              <Label>오늘 몇 시까지(기상)</Label>
              <Input value={sleepWakeText} onChange={(e) => setSleepWakeText(e.target.value)} placeholder="07:10" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setIsSleepOpen(false)}>
              취소
            </Button>
            <Button onClick={confirmSleepDialog}>저장</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={isNewPlanOpen} title="신규 계획 추가" onClose={() => setIsNewPlanOpen(false)}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>이름</Label>
            <Input value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} placeholder="예: 논문" />
          </div>

          <div className="space-y-2">
            <Label>색상</Label>
            <div className="grid grid-cols-10 gap-2 transition-transform duration-200 ease-out motion-safe:translate-y-0 motion-safe:animate-[paletteIn_160ms_ease-out]">
              {USER_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  className={clsx("h-8 w-8 rounded-full border", c === newPlanColor ? "border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]" : "border-[color:var(--border)]")}
                  style={{ background: c }}
                  onClick={() => setNewPlanColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsNewPlanOpen(false)}>취소</Button>
            <Button onClick={confirmNewPlan}>저장</Button>
          </div>
        </div>
      </Dialog>

      {/* Voice Planning Dialog */}
      <Dialog open={isVoiceOpen} title="음성으로 계획 추가" onClose={closeVoiceDialog}>
        <div className="space-y-4">
          {isListening && (
            <div className="flex items-center justify-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] p-4">
              <Mic className="h-5 w-5 animate-pulse text-[color:var(--destructive)]" />
              <span className="text-sm">음성을 듣고 있습니다...</span>
            </div>
          )}

          {voiceTranscript && (
            <div className="space-y-2">
              <Label>인식된 음성</Label>
              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] p-3 text-sm">
                "{voiceTranscript}"
              </div>
            </div>
          )}

          {voiceParsedActivity && (
            <div className="space-y-3 rounded-md border border-[color:var(--primary)] bg-[color:var(--secondary)] p-4">
              <div className="text-center font-semibold text-[color:var(--primary)]">
                "{voiceParsedDate === todayISO ? '오늘' : voiceParsedDate} {voiceParsedStart}–{voiceParsedEnd} {voiceParsedActivity}로 등록?"
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">시작</Label>
                  <Input value={voiceParsedStart} onChange={(e) => setVoiceParsedStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">종료</Label>
                  <Input value={voiceParsedEnd} onChange={(e) => setVoiceParsedEnd(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">활동</Label>
                <Input value={voiceParsedActivity} onChange={(e) => setVoiceParsedActivity(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeVoiceDialog}>취소</Button>
            {voiceParsedActivity && (
              <>
                <Button variant="secondary" onClick={() => {
                  setVoiceTranscript('');
                  setVoiceParsedStart('');
                  setVoiceParsedEnd('');
                  setVoiceParsedActivity('');
                }}>
                  수정
                </Button>
                <Button onClick={confirmVoicePlan}>확인</Button>
              </>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isChecklistBlockOpen}
        title={(() => {
          if (checklistBlockEditingId) return "체크리스트 수정";
          const actName = checklistBlockActivityId ? activityById[checklistBlockActivityId]?.name : undefined;
          if (actName) return `체크리스트 추가 - ${actName}`;
          return "체크리스트 추가";
        })()}
        onClose={() => {
          setIsChecklistBlockOpen(false);
          setChecklistBlockEditingId(null);
          setChecklistBlockTargetCell(null);
          setChecklistBlockActivityId(null);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>시작</Label>
              <Input value={checklistBlockStart} onChange={(e) => setChecklistBlockStart(e.target.value)} placeholder="06:10" />
            </div>
            <div className="space-y-2">
              <Label>종료</Label>
              <Input value={checklistBlockEnd} onChange={(e) => setChecklistBlockEnd(e.target.value)} placeholder="06:20" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>항목</Label>
            <div className="space-y-2">
              {checklistBlockItems.map((it) => (
                <div key={it.id} className="flex items-center gap-2">
                  <button
                    className={clsx(
                      "h-5 w-5 rounded border",
                      it.done ? "bg-[color:var(--primary)] border-[color:var(--primary)]" : "border-[color:var(--border)]"
                    )}
                    onClick={() =>
                      setChecklistBlockItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, done: !p.done } : p)))
                    }
                    aria-label="toggle"
                  />
                  <Input
                    value={it.text}
                    onChange={(e) =>
                      setChecklistBlockItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, text: e.target.value } : p)))
                    }
                  />
                  <Button
                    variant="ghost"
                    onClick={() => setChecklistBlockItems((prev) => prev.filter((p) => p.id !== it.id))}
                  >
                    삭제
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setChecklistBlockItems((prev) => [...prev, { id: `cbi_${Date.now()}`, text: "", done: false }])
                }
              >
                항목 추가
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={confirmChecklistBlock}>저장</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isMemoBlockOpen}
        title={(() => {
          const layerName = memoBlockLayer === "overlay" ? "중복" : "본";
          const h = memoBlockHour;
          const hh = typeof h === "number" ? String(h).padStart(2, "0") : "??";
          let actName: string | undefined;
          if (memoBlockLayer === "execute" && memoBlockTargetCell) {
            const { hour, col } = parseCellId(memoBlockTargetCell);
            const rowIdx = (hour - startHour + 24) % 24;
            const under = segments.find((s) => s.layer === "execute" && s.row === rowIdx && col >= s.startCol && col <= s.endCol);
            const actId = under?.activityId as string | undefined;
            actName = actId ? activityById[actId]?.name : undefined;
          }
          const base = `${hh}시${actName ? ` ${actName}` : ""} 메모`;
          return `${base} (${layerName})`;
        })()}
        onClose={() => {
          setIsMemoBlockOpen(false);
          setMemoBlockEditingId(null);
          setMemoBlockTargetCell(null);
          setMemoBlockHour(null);
          setMemoBlockIndex(null);
          setMemoBlockText("");
        }}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>내용</Label>
            <textarea
              className="min-h-[140px] w-full resize-none rounded-md border border-[color:var(--border)] bg-transparent p-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              value={memoBlockText}
              onChange={(e) => setMemoBlockText(e.target.value)}
              placeholder="여기에 메모를 적어줘"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsMemoBlockOpen(false)}>
              닫기
            </Button>
            <Button onClick={saveMemoBlock}>저장</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ToolButton({
  label,
  icon,
  active,
  badge,
  collapsed,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: string;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "flex flex-col items-center justify-center gap-1 rounded-md border border-[color:var(--border)] py-2 text-xs transition",
        active ? "bg-[color:var(--primary)] text-white" : "bg-transparent hover:bg-[color:var(--secondary)]"
      )}
      onClick={onClick}
      aria-label={label}
    >
      <div className="relative flex items-center justify-center">
        {badge && <span className="absolute -left-5 top-1 text-[10px] opacity-80">{badge}</span>}
        {icon}
      </div>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function MiniToolButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      className={clsx(
        "flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-[11px] shadow-sm",
        active ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--secondary)] hover:bg-[color:var(--secondary)]/80"
      )}
      onClick={onClick}
      aria-label={label}
    >
      {icon}
      <span className="font-semibold">{label}</span>
    </button>
  );
}

function CategoryButton({
  name,
  color,
  active,
  collapsed,
  onClick,
  onLongPressStart,
  onEdit,
  onDragStartHandle,
  onDragOverTile,
  onDropOnTile
}: {
  name: string;
  color: string;
  active: boolean;
  collapsed?: boolean;
  onClick: () => void;
  onLongPressStart?: (e: React.PointerEvent) => void;
  onEdit?: () => void;
  onDragStartHandle?: (e: React.DragEvent) => void;
  onDragOverTile?: (e: React.DragEvent) => void;
  onDropOnTile?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={clsx(
        "group relative rounded-md border border-[color:var(--border)] text-xs transition hover:bg-[color:var(--secondary)]",
        active && "ring-2 ring-[color:var(--primary)]"
      )}
      title={name}
      onDragOver={onDragOverTile}
      onDrop={onDropOnTile}
    >
      {/* Drag handle (drag to reorder) */}
      {onDragStartHandle && (
        <button
          type="button"
          draggable
          className={clsx(
            "absolute left-1 top-1 z-10 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-1.5 py-0.5 text-[10px] opacity-0 shadow-sm transition",
            "group-hover:opacity-100",
            collapsed && "opacity-100"
          )}
          onDragStart={onDragStartHandle}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={`Reorder ${name}`}
          title="드래그로 순서 변경"
        >
          ≡
        </button>
      )}

      {/* Explicit edit affordance (more reliable than long-press across devices) */}
      {onEdit && (
        <button
          type="button"
          className={clsx(
            "absolute right-1 top-1 z-10 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-1.5 py-0.5 text-[10px] opacity-0 shadow-sm transition",
            "group-hover:opacity-100",
            collapsed && "opacity-100"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${name}`}
          title="카테고리 수정"
        >
          ✎
        </button>
      )}

      <button
        type="button"
        className={clsx(
          "flex w-full flex-col items-center justify-center gap-1 rounded-md",
          collapsed ? "py-2" : "py-3"
        )}
        onClick={onClick}
        onDoubleClick={() => onEdit?.()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onEdit?.();
        }}
        onPointerDown={(e) => onLongPressStart?.(e)}
      >

        {/* Fill inside the card border (avoid a circular swatch overlapping the border when collapsed). */}
        <div
          className={clsx(
            "border border-[color:var(--border)]",
            collapsed ? "h-10 w-full rounded-md" : "h-10 w-10 rounded-full"
          )}
          style={{ background: color }}
        />
        {collapsed ? null : <div className="max-w-[64px] truncate">{name}</div>}
      </button>
    </div>
  );
}

function DayTimeline(props: {
  dateISO: string;
  todayISO: string;
  nowMin: number;
  startHour: number;
  grid: DayGrid;
  weekGrid: WeekGrid;
  checklistBlocks: ChecklistBlock[];
  memoBlocks: MemoBlock[];
  segments: ReturnType<typeof buildSegmentsForDay>;
  planSegments: PlanSegment[];
  showPlanOverlay: boolean;
  activityById: Record<string, Activity>;
  activeTool: Tool;
  onChangeTool: (tool: Tool) => void;
  newGhost: { slices: { row: number; startCol: number; endCol: number }[]; color: string; name: string } | null;
  fineBounds: Record<string, FineBounds>;
  selectedSegment: SelectedSeg | null;
  resizeArmed: boolean;
  onArmResize: () => void;
  onResize: (side: "start" | "end", col: number) => void;
  onFineResizeApply: (side: "start" | "end", minute: number, mode: "minute" | "snap") => void;
  onSelectSegment: (seg: SelectedSeg | null) => void;
  onCellPointerDown: (cellId: string, e: React.PointerEvent, opts?: { intentLayer?: "execute" | "overlay" }) => void;
  onCellPointerEnter: (cellId: string, e: React.PointerEvent) => void;
  onCellPointerUp: (cellId: string, e: React.PointerEvent) => void;
  onCellPointerCancel: (e: React.PointerEvent) => void;
  onApplyWeekPlan: (cellId: string) => void;
  onDeleteIndicator: (cellId: string) => void;
  onToggleChecklistBlockItem: (blockId: string, itemId: string) => void;
  onOpenMemo: (activityId: ActivityId, layer: "execute" | "overlay", opts?: { cellId?: string; index?: 0 | 1 }) => void;
  mode: "execute" | "plan";
  showMiniPlanControls?: boolean;
  segmentEmojiStore: Record<string, string>;
}) {
  const {
    dateISO,
    todayISO,
    nowMin,
    startHour,
    grid,
    weekGrid,
    checklistBlocks,
  memoBlocks,
    segments,
    planSegments,
    showPlanOverlay,
    activityById,
    activeTool,
    onChangeTool,
    newGhost,
    fineBounds,
    selectedSegment,
    resizeArmed,
    onArmResize,
    onResize,
    onFineResizeApply,
    onSelectSegment,
    onCellPointerDown,
    onCellPointerEnter,
    onCellPointerUp,
    onCellPointerCancel,
    onApplyWeekPlan,
    onDeleteIndicator,
    onToggleChecklistBlockItem,
    onOpenMemo,
    mode,
    showMiniPlanControls = false,
    segmentEmojiStore
  } = props;

  const isPlanMode = mode === "plan";

  // If user declines applying ghost plan once, stop intercepting taps for this day.
  const [disableGhostApply, setDisableGhostApply] = useState(false);


  const baseRowH = 80;
  const checklistMargin = 6;
  const colW = 90;
  const memoW = 64;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ side: "start" | "end" } | null>(null);
  const fineTimerRef = useRef<number | null>(null);
  const fineActiveRef = useRef(false);
  const fineSideRef = useRef<"start" | "end" | null>(null);
  const [fineOverlay, setFineOverlay] = useState<{ side: "start" | "end"; minute: number; locked: boolean } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ row: number; startMinute: number; endMinute: number } | null>(null);
  const [armingHint, setArmingHint] = useState(false);

  // Explicit overlay-hit tracking: lets the user reliably target overlay checklists in overlapping cells.

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const getFineBounds = useCallback(
    (seg: SelectedSeg): FineBounds => {
      const key = segmentKey(dateISO, startHour, seg);
      const fb = fineBounds[key] ?? defaultFineBounds(seg);
      const minStart = seg.startCol * 10;
      const maxEnd = (seg.endCol + 1) * 10;
      const start = clamp(fb.startMinute ?? minStart, minStart, maxEnd - 1);
      const end = clamp(fb.endMinute ?? maxEnd, start + 1, maxEnd);
      return { startMinute: start, endMinute: end };
    },
    [dateISO, fineBounds, startHour]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizeRef.current || !selectedSegment) return;
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      if (fineActiveRef.current && fineSideRef.current) {
        const hourWidth = colW * 6;
        const rawMinute = Math.round((x / hourWidth) * 60);
        const bounds = getFineBounds(selectedSegment);
        const minBound = fineSideRef.current === "start" ? selectedSegment.startCol * 10 : bounds.startMinute + 1;
        const maxBound = fineSideRef.current === "start" ? bounds.endMinute - 1 : (selectedSegment.endCol + 1) * 10;
        const m = clamp(rawMinute, minBound, maxBound);
        setFineOverlay({ side: fineSideRef.current, minute: m, locked: false });
        return;
      }
      const col = Math.max(0, Math.min(5, Math.round(x / colW)));
      onResize(resizeRef.current.side, col);
      // coarse (10-min) preview capsule
      const minuteStart = Math.min(col, selectedSegment.endCol) * 10;
      const minuteEnd = (Math.max(col, selectedSegment.startCol) + 1) * 10;
      setResizePreview({ row: selectedSegment.row, startMinute: minuteStart, endMinute: minuteEnd });
    };
    const onUp = () => {
      resizeRef.current = null;
      if (fineActiveRef.current) {
        setFineOverlay((prev) => (prev ? { ...prev, locked: true } : prev));
      } else {
        setFineOverlay(null);
      }
      setResizePreview(null);
      fineActiveRef.current = false;
      fineSideRef.current = null;
      if (fineTimerRef.current) {
        window.clearTimeout(fineTimerRef.current);
        fineTimerRef.current = null;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [colW, getFineBounds, onResize, selectedSegment]);

  useEffect(() => {
    setFineOverlay(null);
    setResizePreview(null);
    setArmingHint(false);
    fineActiveRef.current = false;
    fineSideRef.current = null;
    if (fineTimerRef.current) {
      window.clearTimeout(fineTimerRef.current);
      fineTimerRef.current = null;
    }
  }, [selectedSegment, activeTool, resizeArmed]);

  type ChecklistSlice = {
    id: string;
    row: number;
    startCol: number;
    endCol: number;
    items: ChecklistItem[];
    startMin: number;
    height: number;
    topOffset: number;
    layer: "execute" | "overlay";
  };

  const checklistSlices: ChecklistSlice[] = useMemo(() => {
    const raw: Omit<ChecklistSlice, "topOffset">[] = [];

    for (const b of checklistBlocks) {
      const normalizedItems: ChecklistItem[] = b.items.map((it) => ({
        id: it.id,
        text: it.text,
        done: it.done,
        createdAt: (it as any).createdAt ?? 0,
        updatedAt: (it as any).updatedAt ?? 0,
      }));
      const start = Math.max(0, Math.min(24 * 60, Math.floor(b.startMin / 10) * 10));
      const end = Math.max(0, Math.min(24 * 60, Math.ceil(b.endMin / 10) * 10));
      if (end <= start) continue;

      let t = start;
  while (t < end) {
        const hour = Math.floor(t / 60);
        const row = (hour - startHour + 24) % 24;
        const hourStart = hour * 60;
        const hourEnd = hourStart + 60;
        const sliceStart = t;
        const sliceEnd = Math.min(end, hourEnd);
        const startCol = Math.floor((sliceStart - hourStart) / 10);
        const endCol = Math.max(startCol, Math.ceil((sliceEnd - hourStart) / 10) - 1);

  const itemsHeight = normalizedItems.length * 14;
  const padding = 4;
  const maxHeight = baseRowH - checklistMargin * 2;
  const rawHeight = Math.max(14, itemsHeight + padding);
  const layer = b.layer === "overlay" ? "overlay" : "execute";
  const height = layer === "overlay" ? Math.min(maxHeight, 18) : Math.min(maxHeight, rawHeight);

        raw.push({
          id: b.id,
          row,
          startCol,
          endCol,
          items: normalizedItems,
          startMin: b.startMin,
          height,
          layer
        });
        t = sliceEnd;
      }
    }

    const out: ChecklistSlice[] = [];

    const byRow = new Map<number, { exec: Omit<ChecklistSlice, "topOffset">[]; over: Omit<ChecklistSlice, "topOffset">[] }>();
    for (const s of raw) {
      const entry = byRow.get(s.row) ?? { exec: [], over: [] };
      if (s.layer === "overlay") entry.over.push(s);
      else entry.exec.push(s);
      byRow.set(s.row, entry);
    }

    for (const [row, { exec, over }] of byRow.entries()) {
      // stack execute layer from top
      exec.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
      const lines: { endCol: number; segments: typeof exec }[] = [];
      for (const seg of exec) {
        let placed = false;
        for (let i = 0; i < lines.length; i++) {
          if (seg.startCol > lines[i].endCol) {
            lines[i].endCol = seg.endCol;
            lines[i].segments.push(seg);
            placed = true;
            break;
          }
        }
        if (!placed) lines.push({ endCol: seg.endCol, segments: [seg] });
      }
  let currentTop = checklistMargin;
      for (const line of lines) {
        const lineHeight = Math.max(0, ...line.segments.map((s) => s.height));
        for (const seg of line.segments) out.push({ ...seg, topOffset: currentTop });
        currentTop += lineHeight + 4;
      }

      // stack overlay layer from bottom, giving extra headroom so checklists stay inside
      over.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
      const maxOverHeight = over.length ? Math.max(...over.map((o) => o.height)) : 0;
  const anchorBase = Math.max(baseRowH, currentTop + maxOverHeight + 16);
  let bottomCursor = anchorBase - checklistMargin;
      for (const seg of over) {
        const top = bottomCursor - seg.height;
        out.push({ ...seg, topOffset: Math.max(4, top) });
        bottomCursor = top - 4;
      }
    }

    return out;
  }, [checklistBlocks, startHour]);

  const {rowHeights, rowTops, totalHeight} = useMemo(() => {
    const rowHeights = new Array(24).fill(baseRowH);
    const slicesByRow = new Map<number, ChecklistSlice[]>();
    for (const s of checklistSlices) {
      const arr = slicesByRow.get(s.row) ?? [];
      arr.push(s);
      slicesByRow.set(s.row, arr);
    }

    for (const [row, slices] of slicesByRow.entries()) {
      const requiredHeight = Math.max(0, ...slices.map((s) => s.topOffset + s.height));
      if (requiredHeight > rowHeights[row]) rowHeights[row] = requiredHeight + 8;
    }

    const rowTops = new Array(24).fill(0);
    for (let i = 1; i < 24; i++) rowTops[i] = rowTops[i - 1] + rowHeights[i - 1];
    const totalHeight = rowTops[23] + rowHeights[23];

    return { rowHeights, rowTops, totalHeight };
  }, [checklistSlices]);

  const indicators: { cellId: string; top: number; left: number; label: string; timeText: string }[] = [];
  for (let row = 0; row < 24; row++) {
    const hour = (startHour + row) % 24;
    for (let col = 0; col < 6; col++) {
      const cellId = makeCellId(dateISO, hour, col);
      const ind = grid[cellId]?.indicator;
      if (ind) {
        indicators.push({
          cellId,
          top: rowTops[row] + 6,
          left: col * colW + 6,
          label: ind.label,
          timeText: ind.timeText
        });
      }
    }
  }

  const nowHour = Math.floor(nowMin / 60);
  const nowMinOfHour = nowMin % 60;
  const executedMinutesFor = useCallback(
    (row: number, startCol: number, endCol: number, activityId: ActivityId) => {
      const hour = (startHour + row) % 24;
      let done = 0;
      for (let c = startCol; c <= endCol; c++) {
        const cid = makeCellId(dateISO, hour, c);
        if (grid[cid]?.execute === activityId) done += 10;
      }
      return done;
    },
    [dateISO, grid, startHour]
  );

  const hasAdjacentSame = (row: number, col: number, layer: "execute" | "overlay", dir: "prev" | "next") => {
    const hour = (startHour + row) % 24;
    if (dir === "prev") {
      const prevCol = col === 0 ? 5 : col - 1;
      const prevHour = col === 0 ? (hour + 23) % 24 : hour;
      const cid = makeCellId(dateISO, prevHour, prevCol);
      return (grid[cid] as any)?.[layer] != null ? (grid[cid] as any)[layer] : null;
    } else {
      const nextCol = col === 5 ? 0 : col + 1;
      const nextHour = col === 5 ? (hour + 1) % 24 : hour;
      const cid = makeCellId(dateISO, nextHour, nextCol);
      return (grid[cid] as any)?.[layer] != null ? (grid[cid] as any)[layer] : null;
    }
  };
  
return (
    <div
      className={clsx("relative min-w-[650px] transition-opacity", isPlanMode && "opacity-60")}
      style={{ paddingLeft: 60, touchAction: "none" }}
    >

      {/* Memo column header (7th column) */}
      <div
        className="pointer-events-none absolute top-0"
        style={{ left: colW * 6 + 60, width: memoW, height: 0 }}
        aria-hidden
      />

      {/* time labels column */}
      <div className="absolute left-0 top-0 w-[60px]">
        {Array.from({ length: 24 }).map((_, row) => {
          const hour = (startHour + row) % 24;
          return (
            <div
              key={row}
              className="flex items-start justify-end pr-2 pt-2 text-xs opacity-70"
              style={{ height: rowHeights[row], borderBottom: "1px solid var(--border)" }}
            >
              {pad2(hour)}
            </div>
          );
        })}
      </div>

      {/* grid cells */}
      <div ref={gridRef} className="relative" style={{ width: colW * 6 + memoW, height: totalHeight, touchAction: "none" }}>
        {Array.from({ length: 24 }).map((_, row) => {
          const hour = (startHour + row) % 24;
          return (
            <div key={row} className="absolute left-0" style={{ top: rowTops[row], height: rowHeights[row], width: colW * 6 + memoW }}>
              {Array.from({ length: 6 }).map((__, col) => {
                const cellId = makeCellId(dateISO, hour, col);
                const hourCellId = makeCellId(dateISO, hour, 0);
                return (
      <div
        key={col}
        data-cellid={cellId}
        className="absolute top-0 h-full border-l border-[color:var(--border)]"
        style={{ left: col * colW, width: colW, borderBottom: "1px solid var(--border)" }}
                    onPointerDown={(e) => {
                      onCellPointerDown(cellId, e);
                    }}
                    onPointerEnter={(e) => onCellPointerEnter(cellId, e)}
                    onPointerMove={(e) => onCellPointerEnter(cellId, e)}
                    onPointerUp={(e) => onCellPointerUp(cellId, e)}
                    onPointerCancel={onCellPointerCancel}
                  >
                    <div className="h-full w-full hover:bg-[color:color-mix(in_oklch,var(--fg)_6%,transparent)]" />

                    {/* Memo glyphs */}
                    {/* When both layers overlap in this cell, provide an explicit bottom hit area for the overlay layer. */}
                    {(() => {
                      const rowIdx = (hour - startHour + 24) % 24;
                      const hasExecute = segments.some(
                        (s) => s.layer === "execute" && s.row === rowIdx && col >= s.startCol && col <= s.endCol
                      );
                      const hasOverlay = segments.some(
                        (s) => s.layer === "overlay" && s.row === rowIdx && col >= s.startCol && col <= s.endCol
                      );
                      if (!(hasExecute && hasOverlay)) return null;
                      return (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-[28px]"
                          style={{ pointerEvents: "auto" }}
                          onPointerDown={(e) => {
                            onCellPointerDown(cellId, e, { intentLayer: "overlay" });
                          }}
                          onPointerEnter={(e) => onCellPointerEnter(cellId, e)}
                          onPointerMove={(e) => onCellPointerEnter(cellId, e)}
                          onPointerUp={(e) => onCellPointerUp(cellId, e)}
                          onPointerCancel={onCellPointerCancel}
                        />
                      );
                    })()}
                  </div>
                );
              })}

              {/* Memo column (per-row) */}
              {(() => {
                const rowIdx = (hour - startHour + 24) % 24;
                const hourCellId = makeCellId(dateISO, hour, 0);
                const execSegs = segments.filter((s) => s.layer === "execute" && s.row === rowIdx);
                const ovSeg = segments.find((s) => s.layer === "overlay" && s.row === rowIdx);

                const execActIds = Array.from(new Set(execSegs.map((s) => s.activityId).filter(Boolean))) as string[];
                const execActId0 = execActIds[0];
                const execActId1 = execActIds[1];
                const ovActId = ovSeg?.activityId as string | undefined;

                const execColor0 = execActId0 ? activityById[execActId0]?.color : undefined;
                const execColor1 = execActId1 ? activityById[execActId1]?.color : undefined;
                const ovColor = ovActId ? activityById[ovActId]?.color : undefined;

                // If colors match, nudge overlay further right to visually distinguish.
                const sameColorAsExec = !!(
                  ovColor &&
                  ((execColor0 && ovColor === execColor0) || (execColor1 && ovColor === execColor1))
                );

                // Up to 2 memos per hour per layer
                const execMemo0_0 = execActId0
                  ? memoBlocks.find((m) => m.layer === "execute" && (m as any).hour === hour && m.activityId === execActId0 && /_0$/.test(m.id))
                  : undefined;
                const execMemo0_1 = execActId0
                  ? memoBlocks.find((m) => m.layer === "execute" && (m as any).hour === hour && m.activityId === execActId0 && /_1$/.test(m.id))
                  : undefined;
                const execMemo1_0 = execActId1
                  ? memoBlocks.find((m) => m.layer === "execute" && (m as any).hour === hour && m.activityId === execActId1 && /_0$/.test(m.id))
                  : undefined;
                const execMemo1_1 = execActId1
                  ? memoBlocks.find((m) => m.layer === "execute" && (m as any).hour === hour && m.activityId === execActId1 && /_1$/.test(m.id))
                  : undefined;
                const ovMemoIdx0 = memoBlocks.find((m) => m.layer === "overlay" && (m as any).hour === hour && /_0$/.test(m.id));

                const execHas0_0 = !!(execMemo0_0 && execMemo0_0.text.trim().length > 0);
                const execHas0_1 = !!(execMemo0_1 && execMemo0_1.text.trim().length > 0);
                const execHas1_0 = !!(execMemo1_0 && execMemo1_0.text.trim().length > 0);
                const execHas1_1 = !!(execMemo1_1 && execMemo1_1.text.trim().length > 0);
                const ovHasMemo0 = !!(ovMemoIdx0 && ovMemoIdx0.text.trim().length > 0);

                const Capsule = ({
                  color,
                  title,
                  onPointerDown,
                  className,
                  nudgeX,
                  label
                }: {
                  color: string;
                  title: string;
                  onPointerDown: (e: React.PointerEvent) => void;
                  className: string;
                  nudgeX?: number;
                  label: string;
                }) => (
                  <button
                    type="button"
                    className={clsx(
                      // Thin capsule for memo markers.
                      "absolute left-1/2 -translate-x-1/2 rounded-md border border-[color:var(--border)] px-1 py-[1px] text-[9px] font-semibold leading-[11px] tracking-tight text-white shadow-sm text-center whitespace-pre-line overflow-hidden",
                      className
                    )}
                    style={{
                      background: color,
                      pointerEvents: "auto",
                      transform: `translateX(calc(-50% + ${nudgeX ?? 0}px))`,
                      width: `calc(100% - 6px)`,
                      maxWidth: `calc(100% - 6px)`
                    }}
                    onPointerDown={onPointerDown}
                    title={title}
                  >
                    {label}
                  </button>
                );

                return (
                  <div
                    className="absolute top-0 border-l border-[color:var(--border)]"
                    style={{ left: colW * 6, width: memoW, height: rowHeights[row], borderBottom: "1px solid var(--border)" }}
                  >
                    {/* Execute memo capsules (top): up to 2 activities, each can have memo(0/1) */}
                    {/* Simple 3-slot layout: execute#1 top, execute#2 middle, overlay bottom. */}
                    {execColor0 && execActId0 && execHas0_0 && (
                      <Capsule
                        color={execColor0}
                        className="top-[6px]"
                        title={`${String(hour).padStart(2, "0")}시 ${activityById[execActId0]?.name ?? execActId0} 메모`}
                        nudgeX={0}
                        label={`${activityById[execActId0]?.name ?? execActId0}\nMEMO`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenMemo(execActId0 as ActivityId, "execute", { cellId: hourCellId, index: 0 });
                        }}
                      />
                    )}
                    {execColor1 && execActId1 && execHas1_0 && (
                      <Capsule
                        color={execColor1}
                        className="top-[32px]"
                        title={`${String(hour).padStart(2, "0")}시 ${activityById[execActId1]?.name ?? execActId1} 메모`}
                        nudgeX={0}
                        label={`${activityById[execActId1]?.name ?? execActId1}\nMEMO`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenMemo(execActId1 as ActivityId, "execute", { cellId: hourCellId, index: 0 });
                        }}
                      />
                    )}

                    {/* Overlay memo capsules (bottom) */}
                    {ovColor && ovHasMemo0 && (
                      <Capsule
                        color={ovColor}
                        className="bottom-[6px]"
                        title={`${String(hour).padStart(2, "0")}시 ${ovActId && activityById[ovActId]?.name ? activityById[ovActId].name : "중복"} 메모`}
                        nudgeX={0}
                        label="MEMO"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenMemo((ovActId as ActivityId) ?? ("__HOUR__" as ActivityId), "overlay", { cellId: hourCellId, index: 0 });
                        }}
                      />
                    )}
                    
                  </div>
                );
              })()}
            </div>
          );
        })}

        {/* NEW drag ghost preview (within the same hour) */}
        {newGhost &&
          newGhost.slices.map((slc, idx) => (
            <div
              key={`ng-${idx}-${slc.row}-${slc.startCol}-${slc.endCol}`}
              className="pointer-events-none absolute overflow-hidden border-2 border-dashed border-[color:var(--primary)]/80 bg-[color:color-mix(in_oklch,var(--primary)_15%,transparent)]"
              style={{
                top: rowTops[slc.row] + 4,
                left: slc.startCol * colW + 4,
                width: (slc.endCol - slc.startCol + 1) * colW - 8,
                height: rowHeights[slc.row] - 8,
                borderRadius: "8px"
              }}
            >
              {idx === 0 && <div className="px-2 py-1 text-sm font-semibold text-black/80">{newGhost.name}</div>}
            </div>
          ))}

        {/* Plan overlay (semi-transparent) with execution fill; both layers fill the grid cell */}
        {showPlanOverlay && planSegments
          // Avoid double-painting (plan + planOverlay) on the same region which looks like two colors.
          // If a plan segment exists over the same (row, col range), skip the planOverlay one.
          .filter((p) => {
            if (p.layer !== "planOverlay") return true;
            return !planSegments.some(
              (q) =>
                q.layer === "plan" &&
                q.row === p.row &&
                !(q.endCol < p.startCol || q.startCol > p.endCol)
            );
          })
          .map((p, idx) => {
          const a = activityById[p.activityId];
          if (!a) return null;
          const left = p.startCol * colW;
          const width = (p.endCol - p.startCol + 1) * colW;
          const totalMin = (p.endCol - p.startCol + 1) * 10;
          const doneMin = executedMinutesFor(p.row, p.startCol, p.endCol, p.activityId);
          const pct = totalMin > 0 ? Math.round((doneMin / totalMin) * 100) : 0;

          if (p.layer === "plan") {
            const top = rowTops[p.row];
            const height = rowHeights[p.row];
            return (
              <div
                key={`plan-${idx}-${p.row}-${p.startCol}-${p.endCol}-${p.layer}`}
                className="pointer-events-none absolute overflow-hidden"
                style={{ top, left, width, height, background: `${a.color}3a` }}
              >
                {/* Titles should be visible even when viewing execute mode */}
                {(mode === "plan" || mode === "execute") && (
                  <div className="relative z-10 flex h-full items-center px-2 text-[11px] font-semibold text-black/80">
                    <span className="truncate">{a.name}</span>
                  </div>
                )}
              </div>
            );
          }

          // planOverlay layer: full cell fill (lighter), so it's easier to edit/see
          const top = rowTops[p.row];
          const height = rowHeights[p.row];
          return (
            <div
              key={`plan-${idx}-${p.row}-${p.startCol}-${p.endCol}-${p.layer}`}
              className="pointer-events-none absolute overflow-hidden rounded-sm border border-[color:var(--border)] bg-white/55 backdrop-blur-[2px] shadow-sm"
              style={{ top, left, width, height, background: `${a.color}${isPlanMode ? "2b" : "24"}` }}
            >
              {/* Show titles in both plan/execute so copied-in blocks still have labels */}
              {(mode === "plan" || mode === "execute") && (
                <div className="relative z-10 flex h-full items-center px-2 text-[10px] font-semibold text-black/80">
                  <span className="truncate">{a.name}</span>
                </div>
              )}
            </div>
          );
  })}

        {/* 현재 시간 세로선 (today only, 전체 그리드 가로지름) */}
        {dateISO === todayISO && (() => {
          const x = ((nowMinOfHour / 60) * colW * 6);
          return (
            <div className="pointer-events-none absolute z-30" style={{ top: 0, left: x, height: totalHeight }}>
              <div className="absolute -top-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 text-[10px] font-semibold text-[color:var(--primary)]">
                <span
                  className="h-0 w-0 border-x-[6px] border-b-[8px] border-t-0 border-x-transparent"
                  style={{ borderBottomColor: "var(--primary)" }}
                />
                <span>{pad2(nowHour)}:{pad2(nowMinOfHour)}</span>
              </div>
              <div className="h-full w-[2px] bg-[color:var(--primary)]/85" />
            </div>
          );
        })()}

    {/* merged ghost preview (week plan -> day)
      Keep tap hit-area even when plan overlay is ON, but make it visually transparent
      so the background doesn't get double-tinted. */}
    {!isPlanMode && Array.from({ length: 24 }).map((_, row) => {
          const hour = (startHour + row) % 24;
          const segs: { startCol: number; endCol: number; activityId: string }[] = [];
          let col = 0;
          while (col < 6) {
            const cellId = makeCellId(dateISO, hour, col);
            const hasExecute = Boolean(grid[cellId]?.execute);
            const wk = weekGrid[cellId];
            const planAct = wk?.activityId ?? (wk as any)?.overlayActivityId;
            const actId = !hasExecute && planAct ? planAct : null;
            if (!actId) {
              col++;
              continue;
            }
            let end = col;
            while (end + 1 < 6) {
              const nId = makeCellId(dateISO, hour, end + 1);
              const nHasExecute = Boolean(grid[nId]?.execute);
              const nWk = weekGrid[nId];
              const nPlanAct = nWk?.activityId ?? (nWk as any)?.overlayActivityId;
              const nAct = !nHasExecute && nPlanAct ? nPlanAct : null;
              if (nAct !== actId) break;
              end++;
            }
            segs.push({ startCol: col, endCol: end, activityId: actId });
            col = end + 1;
          }
          return segs.map((s) => {
            const a = activityById[s.activityId];
            if (!a) return null;
            const top = rowTops[row] + 8;
            const left = s.startCol * colW + 8;
            const width = (s.endCol - s.startCol + 1) * colW - 16;
            const height = rowHeights[row] - 16;
            const radius = `${s.startCol === 0 ? 4 : 0}px ${s.endCol === 5 ? 4 : 0}px ${s.endCol === 5 ? 4 : 0}px ${s.startCol === 0 ? 4 : 0}px`;
            return (
              <button
                key={`g-${row}-${s.startCol}-${s.endCol}`}
                className="absolute flex items-center justify-center rounded-sm text-xs font-medium text-black/80"
                style={{
                  top,
                  left,
                  width,
                  height,
                  borderRadius: radius,
                  // When plan overlay is visible, don't add another tinted rectangle.
                  background: showPlanOverlay ? "transparent" : `${a.color}55`
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  // If user already declined for this date, don't intercept the tap anymore.
                  if (disableGhostApply) return;

                  const ok = window.confirm("계획대로 적용할까요?\n(취소하면 이 영역은 더 이상 안 눌림)");
                  if (!ok) {
                    setDisableGhostApply(true);
                    return;
                  }

                  // Apply to all cells in the ghost segment
                  for (let c = s.startCol; c <= s.endCol; c++) {
                    onApplyWeekPlan(makeCellId(dateISO, hour, c));
                  }
                }}
                title="주간 계획 적용"
              >
              </button>
            );
          });
        })}

        {mode === "execute" && (
          <>
            <div className="absolute inset-0 z-30 pointer-events-none">
              {checklistSlices.filter(s => s.layer === "execute").map((s) => {
                const top = rowTops[s.row] + s.topOffset;
                const left = s.startCol * colW + checklistMargin;
                const width = (s.endCol - s.startCol + 1) * colW - checklistMargin * 2;
                const bgMix = 85;
                const borderStyle = "border-solid";
                return (
                  <div
                    key={`cb-${s.id}-${s.row}-${s.startCol}-${s.endCol}`}
                    className={clsx(
                      "pointer-events-auto absolute rounded-md border px-1 py-0.5 text-[9.5px] shadow-sm",
                      borderStyle
                    )}
                    style={{ top, left, width, height: s.height, background: `color-mix(in_oklch,var(--bg)_${bgMix}%,transparent)` }}
                    title="타임라인 체크리스트"
                  >
                    <div className="flex flex-col gap-0.5 leading-tight">
                      {s.items.map((it) => (
                        <label key={it.id} className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            className="h-2.5 w-2.5"
                            checked={it.done}
                            onChange={() => onToggleChecklistBlockItem(s.id, it.id)}
                          />
                          <span className={clsx("min-w-0 truncate", it.done && "line-through opacity-60")}>{it.text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="absolute inset-0 z-20 pointer-events-none">
              {checklistSlices.filter(s => s.layer === "overlay").map((s) => {
              const top = rowTops[s.row] + s.topOffset;
                const left = s.startCol * colW + checklistMargin;
                const width = (s.endCol - s.startCol + 1) * colW - checklistMargin * 2;
                const bgMix = 70;
                const borderStyle = "border-dashed";
                const firstItem = s.items[0];
                const extraCount = Math.max(0, s.items.length - 1);
                return (
                  <div
                    key={`cb-${s.id}-${s.row}-${s.startCol}-${s.endCol}`}
                    className={clsx(
                      "pointer-events-auto absolute rounded-md border px-1 py-0.5 text-[9.5px] shadow-sm",
                      borderStyle
                    )}
                    style={{ top, left, width, height: s.height, background: `color-mix(in_oklch,var(--bg)_${bgMix}%,transparent)` }}
                    title="타임라인 체크리스트 (중복)"
                  >
                    <div className="flex items-center gap-1 leading-tight">
                      {firstItem && (
                        <label className="flex cursor-pointer items-center gap-1.5 min-w-0">
                          <input
                            type="checkbox"
                            className="h-2.5 w-2.5"
                            checked={firstItem.done}
                            onChange={() => onToggleChecklistBlockItem(s.id, firstItem.id)}
                          />
                          <span className={clsx("truncate", firstItem.done && "line-through opacity-60")}>{firstItem.text}</span>
                        </label>
                      )}
                      {extraCount > 0 && (
                        <span className="shrink-0 rounded-sm bg-black/5 px-1 text-[9px] text-black/70">+{extraCount}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* segments (execute) */}
        {mode === "execute" && segments
          .filter((s) => s.layer === "execute")
          .map((s, i) => {
            const a = activityById[s.activityId];
            if (!a) return null;
            const top = rowTops[s.row] + 6;
            const bounds = getFineBounds({ ...s, layer: "execute" });
            const left = 6 + (bounds.startMinute / 60) * (colW * 6);
            const width = ((bounds.endMinute - bounds.startMinute) / 60) * (colW * 6) - 12;
            const height = rowHeights[s.row] - 12;
            const prevSame = hasAdjacentSame(s.row, s.startCol, "execute", "prev") === s.activityId;
            const nextSame = hasAdjacentSame(s.row, s.endCol, "execute", "next") === s.activityId;
            const radius = `${prevSame ? 0 : 8}px ${nextSame ? 0 : 8}px ${nextSame ? 0 : 8}px ${prevSame ? 0 : 8}px`;
            const isSelected =
              !!selectedSegment &&
              selectedSegment.layer === "execute" &&
              selectedSegment.row === s.row &&
              selectedSegment.startCol === s.startCol &&
              selectedSegment.endCol === s.endCol &&
              selectedSegment.activityId === s.activityId;
            return (
              <div
                key={`e-${i}`}
                className={clsx("absolute overflow-hidden transition-all duration-300 ease-in-out", activeTool === "select" ? "pointer-events-auto" : "pointer-events-none")}
                style={{
                  top,
                  left,
                  width,
                  height,
                  borderRadius: radius,
                  background: a.color,
                  cursor: activeTool === "select" ? "pointer" : "default",
                  boxShadow: isSelected ? "0 0 0 2px var(--primary) inset" : undefined,
                  zIndex: isSelected ? 50 : 10
                }}
                onPointerDown={(e) => {
                  if (activeTool !== "select") return;
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectSegment({ ...s, layer: "execute" });
                }}
              >
                <div className="absolute left-1 top-1 text-xs font-semibold text-black/80">
                  {a.name}
                  {(() => {
                    const key = segmentKey(dateISO, startHour, { ...s, layer: "execute" });
                    const emoji = segmentEmojiStore[key];
                    return emoji ? <span className="ml-1">{emoji}</span> : null;
                  })()}
                </div>
                {isSelected && (
                  <>
                    <button
                      className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-white/70 bg-black/60 text-[10px] font-bold text-white shadow-sm"
                      title="왼쪽 상단 앵커를 눌러 리사이즈 잠금 해제"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onArmResize();
                        setArmingHint(false);
                      }}
                    >
                      ●
                    </button>
                    <div className="pointer-events-none absolute inset-0 border-2 border-[color:var(--primary)]" />
                    <div
                      className={clsx(
                        "absolute top-1/2 h-5 w-2.5 -translate-y-1/2 rounded-sm bg-white shadow",
                        resizeArmed ? "cursor-ew-resize" : "cursor-not-allowed opacity-60"
                      )}
                      style={{ left: -5 }}
                      onPointerDown={(e) => {
                        if (!resizeArmed) {
                          setArmingHint(true);
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        fineActiveRef.current = false;
                        fineSideRef.current = "start";
                        if (fineTimerRef.current) {
                          window.clearTimeout(fineTimerRef.current);
                          fineTimerRef.current = null;
                        }
                        fineTimerRef.current = window.setTimeout(() => {
                          fineActiveRef.current = true;
                          setFineOverlay({ side: "start", minute: getFineBounds({ ...s, layer: "execute" }).startMinute, locked: false });
                        }, 450);
                        resizeRef.current = { side: "start" };
                        onResize("start", s.startCol);
                      }}
                    />
                    <div
                      className={clsx(
                        "absolute top-1/2 h-5 w-2.5 -translate-y-1/2 rounded-sm bg-white shadow",
                        resizeArmed ? "cursor-ew-resize" : "cursor-not-allowed opacity-60"
                      )}
                      style={{ right: -5 }}
                      onPointerDown={(e) => {
                        if (!resizeArmed) {
                          setArmingHint(true);
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        fineActiveRef.current = false;
                        fineSideRef.current = "end";
                        if (fineTimerRef.current) {
                          window.clearTimeout(fineTimerRef.current);
                          fineTimerRef.current = null;
                        }
                        fineTimerRef.current = window.setTimeout(() => {
                          fineActiveRef.current = true;
                          setFineOverlay({ side: "end", minute: getFineBounds({ ...s, layer: "execute" }).endMinute, locked: false });
                        }, 450);
                        resizeRef.current = { side: "end" };
                        onResize("end", s.endCol);
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}

        {/* segments (overlay) */}
        {mode === "execute" && segments
          .filter((s) => s.layer === "overlay")
          .map((s, i) => {
            const a = activityById[s.activityId];
            if (!a) return null;
            const height = 18;
            const bottomGap = 6;
            const top = rowTops[s.row] + (rowHeights[s.row] - bottomGap - height);
            const bounds = getFineBounds({ ...s, layer: "overlay" });
            const left = 6 + (bounds.startMinute / 60) * (colW * 6);
            const width = ((bounds.endMinute - bounds.startMinute) / 60) * (colW * 6) - 12;
            const prevSame = hasAdjacentSame(s.row, s.startCol, "overlay", "prev") === s.activityId;
            const nextSame = hasAdjacentSame(s.row, s.endCol, "overlay", "next") === s.activityId;
            const radius = `${prevSame ? 0 : 8}px ${nextSame ? 0 : 8}px ${nextSame ? 0 : 8}px ${prevSame ? 0 : 8}px`;
            const isSelected =
              !!selectedSegment &&
              selectedSegment.layer === "overlay" &&
              selectedSegment.row === s.row &&
              selectedSegment.startCol === s.startCol &&
              selectedSegment.endCol === s.endCol &&
              selectedSegment.activityId === s.activityId;
            return (
              <div
                key={`o-${i}`}
                className={clsx("absolute overflow-hidden transition-all duration-300 ease-in-out", activeTool === "select" ? "pointer-events-auto" : "pointer-events-none")}
                style={{
                  top,
                  left,
                  width,
                  height,
                  borderRadius: radius,
                  background: a.color,
                  boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
                  cursor: activeTool === "select" ? "pointer" : "default",
                  opacity: 0.95
                }}
                onPointerDown={(e) => {
                  if (activeTool !== "select") return;
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectSegment({ ...s, layer: "overlay" });
                }}
              >
                <div className="absolute left-1 top-0.5 text-[11px] font-semibold text-black/80">
                  {a.name}
                  {(() => {
                    const key = segmentKey(dateISO, startHour, { ...s, layer: "overlay" });
                    const emoji = segmentEmojiStore[key];
                    return emoji ? <span className="ml-1">{emoji}</span> : null;
                  })()}
                </div>
                {isSelected && (
                  <>
                    <div
                      className="absolute left-1 top-0.5 h-4 w-4 rounded-sm border border-white bg-black/50 shadow-sm"
                      title="왼쪽 상단 앵커를 눌러 리사이즈 잠금 해제"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onArmResize();
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 border-2 border-[color:var(--primary)]" />
                    <div
                      className={clsx(
                        "absolute top-1/2 h-5 w-2.5 -translate-y-1/2 rounded-sm bg-white shadow",
                        resizeArmed ? "cursor-ew-resize" : "cursor-not-allowed opacity-60"
                      )}
                      style={{ left: -5 }}
                      onPointerDown={(e) => {
                        if (!resizeArmed) {
                          setArmingHint(true);
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        fineActiveRef.current = false;
                        fineSideRef.current = "start";
                        if (fineTimerRef.current) {
                          window.clearTimeout(fineTimerRef.current);
                          fineTimerRef.current = null;
                        }
                        fineTimerRef.current = window.setTimeout(() => {
                          fineActiveRef.current = true;
                          setFineOverlay({ side: "start", minute: getFineBounds({ ...s, layer: "overlay" }).startMinute, locked: false });
                        }, 450);
                        resizeRef.current = { side: "start" };
                        onResize("start", s.startCol);
                      }}
                    />
                    <div
                      className={clsx(
                        "absolute top-1/2 h-5 w-2.5 -translate-y-1/2 rounded-sm bg-white shadow",
                        resizeArmed ? "cursor-ew-resize" : "cursor-not-allowed opacity-60"
                      )}
                      style={{ right: -5 }}
                      onPointerDown={(e) => {
                        if (!resizeArmed) {
                          setArmingHint(true);
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        fineActiveRef.current = false;
                        fineSideRef.current = "end";
                        if (fineTimerRef.current) {
                          window.clearTimeout(fineTimerRef.current);
                          fineTimerRef.current = null;
                        }
                        fineTimerRef.current = window.setTimeout(() => {
                          fineActiveRef.current = true;
                          setFineOverlay({ side: "end", minute: getFineBounds({ ...s, layer: "overlay" }).endMinute, locked: false });
                        }, 450);
                        resizeRef.current = { side: "end" };
                        onResize("end", s.endCol);
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}

  {mode === "execute" && fineOverlay && selectedSegment && (
          (() => {
            const rowTop = rowTops[selectedSegment.row];
            const minuteX = 6 + (fineOverlay.minute / 60) * (colW * 6);
            const top = Math.max(4, rowTop - 36);
            const hour = (startHour + selectedSegment.row) % 24;
            const baseBounds = getFineBounds(selectedSegment);
            const previewStart = fineOverlay.side === "start" ? fineOverlay.minute : baseBounds.startMinute;
            const previewEnd = fineOverlay.side === "end" ? fineOverlay.minute : baseBounds.endMinute;
            const startTime = minToTime(hour * 60 + previewStart);
            const endTime = minToTime(hour * 60 + previewEnd);
            return (
              <div
                className="pointer-events-auto absolute z-50 flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-black/90 px-3 py-1.5 text-xs text-white shadow-lg"
                style={{ left: minuteX, top, transform: "translateX(-50%)" }}
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold">{startTime} – {endTime}</span>
                  <span className="text-[11px] opacity-80">{fineOverlay.side === "start" ? "시작" : "끝"} {fineOverlay.minute}분</span>
                  {!fineOverlay.locked && <span className="text-[10px] opacity-60">길게 누른 채 드래그 중</span>}
                </div>
                {fineOverlay.locked && (
                  <div className="flex items-center gap-1.5">
                    <button
                      className="rounded-md bg-[color:var(--primary)] px-2 py-1 text-[11px] font-semibold text-black hover:bg-[color:var(--primary)]/90"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onFineResizeApply(fineOverlay.side, fineOverlay.minute, "minute");
                        setFineOverlay(null);
                      }}
                    >
                      이 시간 확정
                    </button>
                    <button
                      className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/20"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onFineResizeApply(fineOverlay.side, fineOverlay.minute, "snap");
                        setFineOverlay(null);
                      }}
                    >
                      10분 스냅
                    </button>
                  </div>
                )}
              </div>
            );
          })()
        )}

  {mode === "execute" && resizePreview && selectedSegment && !fineOverlay && (
          (() => {
            const hour = (startHour + resizePreview.row) % 24;
            const startTime = minToTime(hour * 60 + resizePreview.startMinute);
            const endTime = minToTime(hour * 60 + resizePreview.endMinute);
            const rowTop = rowTops[resizePreview.row];
            const midX = 6 + ((resizePreview.startMinute + resizePreview.endMinute) / 120) * (colW * 6);
            const top = Math.max(4, rowTop - 32);
            return (
              <div
                className="pointer-events-none absolute z-40 flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-black/80 px-3 py-1.5 text-xs text-white shadow"
                style={{ left: midX, top, transform: "translateX(-50%)" }}
              >
                <span className="text-[11px] font-semibold">{startTime} – {endTime}</span>
                <span className="text-[10px] opacity-70">10분 스냅 중</span>
              </div>
            );
          })()
        )}

  {mode === "execute" && armingHint && selectedSegment && !resizeArmed && !fineOverlay && (
          (() => {
            const rowTop = rowTops[selectedSegment.row];
            const left = selectedSegment.startCol * colW + 10;
            const top = rowTop + 8;
            return (
              <div
                className="pointer-events-none absolute z-40 rounded-md border border-[color:var(--border)] bg-black/80 px-3 py-2 text-[11px] text-white shadow"
                style={{ left, top }}
              >
                리사이즈하려면 상단 ● 앵커를 먼저 클릭하세요
              </div>
            );
          })()
        )}

  {/* indicators */}
  {mode === "execute" && indicators.map((ind) => (
          <div
            key={ind.cellId}
            className="absolute flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold text-black"
            style={{ top: ind.top, left: ind.left, background: "rgba(245, 158, 11, 0.9)" }}
          >
            <span>{ind.timeText}</span>
            <span className="max-w-[120px] truncate">{ind.label}</span>
            <button
              className="ml-1 rounded-md bg-black/10 px-1 hover:bg-black/20"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteIndicator(ind.cellId);
              }}
              aria-label="Delete indicator"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simplified plan-only panel (rebuilt fresh)
function PlanPanel(props: {
  dateISO: string;
  startHour: number;
  planSegments: PlanSegment[];
  activityById: Record<string, Activity>;
  newGhost: { slices: { row: number; startCol: number; endCol: number }[]; color: string; name: string } | null;
  planDragOverlay: { slices: { row: number; startCol: number; endCol: number }[]; color: string | null };
  onCellPointerDown: (cellId: string, e: React.PointerEvent) => void;
  onCellPointerEnter: (cellId: string, e: React.PointerEvent) => void;
  onCellPointerUp: (cellId: string, e: React.PointerEvent) => void;
  onCellPointerCancel: (e: React.PointerEvent) => void;
}) {
  const { dateISO, startHour, planSegments, activityById, newGhost, planDragOverlay, onCellPointerDown, onCellPointerEnter, onCellPointerUp, onCellPointerCancel } = props;

  const baseRowH = 80;
  const colW = 90;

  return (
    <div className="relative min-w-[650px]" style={{ paddingLeft: 60, touchAction: "none" }}>
      {/* time labels */}
      <div className="absolute left-0 top-0 w-[60px]">
        {Array.from({ length: 24 }).map((_, row) => {
          const hour = (startHour + row) % 24;
          return (
            <div
              key={row}
              className="flex items-start justify-end pr-2 pt-2 text-xs opacity-70"
              style={{ height: baseRowH, borderBottom: "1px solid var(--border)" }}
            >
              {pad2(hour)}
            </div>
          );
        })}
      </div>

      {/* grid */}
      <div className="relative" style={{ width: colW * 6, height: baseRowH * 24 }}>
        {Array.from({ length: 24 }).map((_, row) => {
          const hour = (startHour + row) % 24;
          return (
            <div key={row} className="absolute left-0" style={{ top: row * baseRowH, height: baseRowH, width: colW * 6 }}>
              {Array.from({ length: 6 }).map((__, col) => {
                const cellId = makeCellId(dateISO, hour, col);
                return (
                  <div
                    key={col}
                    data-cellid={cellId}
                    className="absolute top-0 h-full border-l border-[color:var(--border)]"
                    style={{ left: col * colW, width: colW, borderBottom: "1px solid var(--border)" }}
                    onPointerDown={(e) => onCellPointerDown(cellId, e)}
                    onPointerEnter={(e) => onCellPointerEnter(cellId, e)}
                    onPointerMove={(e) => onCellPointerEnter(cellId, e)}
                    onPointerUp={(e) => onCellPointerUp(cellId, e)}
                    onPointerCancel={onCellPointerCancel}
                  >
                    <div className="h-full w-full hover:bg-[color:color-mix(in_oklch,var(--fg)_6%,transparent)]" />
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* NEW ghost preview (plan/new) */}
        {newGhost &&
          newGhost.slices.map((slc, idx) => (
            <div
              key={`plan-ng-${idx}-${slc.row}-${slc.startCol}-${slc.endCol}`}
              className="pointer-events-none absolute overflow-hidden border-2 border-dashed border-[color:var(--primary)]/80 bg-[color:color-mix(in_oklch,var(--primary)_15%,transparent)]"
              style={{
                top: slc.row * baseRowH + 4,
                left: slc.startCol * colW + 4,
                width: (slc.endCol - slc.startCol + 1) * colW - 8,
                height: baseRowH - 8,
                borderRadius: "8px"
              }}
            >
              {idx === 0 && <div className="px-2 py-1 text-sm font-semibold text-black/80">{newGhost.name}</div>}
            </div>
          ))}

        {/* Live drag overlay for plan brush */}
        {planDragOverlay.slices.map((slc, idx) => (
          <div
            key={`plan-drag-${idx}-${slc.row}-${slc.startCol}-${slc.endCol}`}
            className="pointer-events-none absolute rounded-sm border border-[color:var(--primary)]/40 bg-[color:var(--primary)]/12"
            style={{
              top: slc.row * baseRowH + 2,
              left: slc.startCol * colW + 2,
              width: (slc.endCol - slc.startCol + 1) * colW - 4,
              height: baseRowH - 4,
              background: planDragOverlay.color ? `${planDragOverlay.color}33` : undefined,
              borderColor: planDragOverlay.color ? `${planDragOverlay.color}66` : undefined
            }}
          />
        ))}

        {/* Plan bars (primary + overlay) */}
        {planSegments.map((p, idx) => {
          const a = activityById[p.activityId];
          if (!a) return null;
          const barH = 20;
          const gap = 6;
          const layerIdx = p.layer === "plan" ? 0 : 1;
          const top = p.row * baseRowH + 6 + layerIdx * (barH + gap);
          const left = p.startCol * colW + 6;
          const width = (p.endCol - p.startCol + 1) * colW - 12;
          const radius = `${p.startCol === 0 ? 6 : 2}px ${p.endCol === 5 ? 6 : 2}px ${p.endCol === 5 ? 6 : 2}px ${p.startCol === 0 ? 6 : 2}px`;
          return (
            <div
              key={`plan-bar-${idx}-${p.row}-${p.startCol}-${p.endCol}-${p.layer}`}
              className="pointer-events-none absolute flex items-center overflow-hidden border border-[color:var(--border)] shadow-sm"
              style={{ top, left, width, height: barH, borderRadius: radius, background: `${a.color}cc` }}
            >
              <div className="px-2 text-[11px] font-semibold text-black/80">{a.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekTimeline(props: {
  weekKey: string;
  startHour: number;
  weekGrid: WeekGrid;
  activityById: Record<string, Activity>;
  days: string[];
  activeTool: Tool;
  onChangeTool: (tool: Tool) => void;
  onWeekCellPointerDown: (cellId: string, e: React.PointerEvent) => void;
  onWeekCellPointerEnter: (cellId: string, e: React.PointerEvent) => void;
  onWeekCellPointerMove: (cellId: string, e: React.PointerEvent) => void;
  onWeekCellPointerUp: (e: React.PointerEvent) => void;
}) {
  const { startHour, weekGrid, activityById, days, activeTool, onChangeTool, onWeekCellPointerDown, onWeekCellPointerEnter, onWeekCellPointerMove, onWeekCellPointerUp } = props;
  const rowH = 64;
  const colW = 150;
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  // Build per-(day,hour) segments across 10-min columns, including overlapped plans.
  function buildRowSegments(dayISO: string, hour: number) {
    type RowSeg = { startCol: number; endCol: number; activityId: string; layer: "plan" | "planOverlay" };
    const segs: RowSeg[] = [];

    const collect = (layerKey: "activityId" | "overlayActivityId", layer: RowSeg["layer"]) => {
      let col = 0;
      while (col < 6) {
        const cellId = makeCellId(dayISO, hour, col);
        const wk = weekGrid[cellId];
        const actId = (wk as any)?.[layerKey] as string | undefined;
        if (!actId) {
          col++;
          continue;
        }
        let end = col;
        while (end + 1 < 6) {
          const nId = makeCellId(dayISO, hour, end + 1);
          const nextAct = (weekGrid[nId] as any)?.[layerKey];
          if (nextAct !== actId) break;
          end++;
        }
        segs.push({ startCol: col, endCol: end, activityId: actId, layer });
        col = end + 1;
      }
    };

    collect("activityId", "plan");
    collect("overlayActivityId", "planOverlay");
    return segs;
  }

  return (
    <div className="relative min-w-[1100px] p-6" style={{ touchAction: "none" }}>
      <div className="pointer-events-auto absolute left-2 top-2 z-40 flex flex-col gap-2">
        <MiniToolButton
          label="계획"
          icon={<ClipboardList className="h-4 w-4" />}
          active={activeTool === "plan"}
          onClick={() => onChangeTool("plan")}
        />
      </div>
      <div className="grid" style={{ gridTemplateColumns: `80px repeat(7, ${colW}px)` }}>
        <div className="h-10" />
        {days.map((d, i) => (
          <div key={d} className="flex h-10 items-center justify-center border-b border-[color:var(--border)] text-sm font-semibold">
            {weekdays[i]}
          </div>
        ))}
        {Array.from({ length: 24 }).map((_, row) => {
          const hour = (startHour + row) % 24;
          return (
            <React.Fragment key={row}>
              <div className="flex h-[64px] items-start justify-end pr-2 pt-2 text-xs opacity-70" style={{ borderBottom: "1px solid var(--border)" }}>
                {pad2(hour)}
              </div>
              {days.map((dayISO) => (
                <div
                  key={`${dayISO}-${row}`}
                  className="relative border-b border-l border-[color:var(--border)] bg-[color:color-mix(in_oklch,var(--secondary)_90%,transparent)]"
                  style={{ height: rowH }}
                >
                  {Array.from({ length: 6 }).map((__, col) => {
                    const cellId = makeCellId(dayISO, hour, col);
                    return (
                      <div
                        key={cellId}
                        className="absolute top-0 h-full border-l border-[color:color-mix(in_oklch,var(--border)_60%,transparent)]"
                        style={{ left: (colW / 6) * col, width: colW / 6 }}
                        onPointerDown={(e) => onWeekCellPointerDown(cellId, e)}
                        onPointerEnter={(e) => onWeekCellPointerEnter(cellId, e)}
                        onPointerMove={(e) => onWeekCellPointerMove(cellId, e)}
                        onPointerUp={onWeekCellPointerUp}
                      >
                        <div className="h-full w-full hover:bg-[color:color-mix(in_oklch,var(--fg)_6%,transparent)]" />
                      </div>
                    );
                  })}

                  {/* merged week-plan segments */}
                  {buildRowSegments(dayISO, hour).map((s) => {
                    const a = activityById[s.activityId];
                    if (!a) return null;
                    const left = (colW / 6) * s.startCol + 2;
                    const width = (colW / 6) * (s.endCol - s.startCol + 1) - 4;
                    const radius = `${s.startCol === 0 ? 6 : 2}px ${s.endCol === 5 ? 6 : 2}px ${s.endCol === 5 ? 6 : 2}px ${s.startCol === 0 ? 6 : 2}px`;

                    if (s.layer === "plan") {
                      const top = 2;
                      const height = rowH - 4;
                      return (
                        <div
                          key={`seg-${dayISO}-${hour}-${s.layer}-${s.startCol}-${s.endCol}`}
                          className="pointer-events-none absolute flex items-center"
                          style={{ top, left, width, height, borderRadius: radius, background: `${a.color}e0` }}
                        >
                          <div className="px-2 text-[11px] font-semibold leading-tight text-black/85 truncate">{a.name}</div>
                        </div>
                      );
                    }

                    // planOverlay: fill the grid cell (lighter)
                    const top = 2;
                    const barH = rowH - 4;
                    return (
                      <div
                        key={`seg-${dayISO}-${hour}-${s.layer}-${s.startCol}-${s.endCol}`}
                        className="pointer-events-none absolute flex items-center"
                        style={{ top, left, width, height: barH, borderRadius: radius, background: `${a.color}55` }}
                      >
                        <div className="px-2 text-[10px] font-semibold leading-tight text-black/80 truncate">{a.name}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistEditor({ onAdd }: { onAdd: (text: string, time?: string) => void }) {
  const [text, setText] = useState("");
  const [time, setTime] = useState<string>("");
  return (
    <div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] p-3">
      <div className="space-y-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="할 일" />
        <div className="flex items-center gap-2">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-[140px]" />
          <Button
            onClick={() => {
              onAdd(text, time || undefined);
              setText("");
              setTime("");
            }}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  );
}
