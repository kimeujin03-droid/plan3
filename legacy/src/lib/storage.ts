import type {
  Activity,
  Block,
  WeekPlan,
  FixedSchedule,
  TemplateApply,
  DailyState,
  CompletionEvent,
  IndicatorEvent,
  ChecklistItem,
  ChecklistBlock,
  MemosByCell,
  VoiceCommandLog,
  PersistedStateV2,
  // Legacy types for migration
  DayGrid,
  WeekGrid,
} from "./types";

const STORAGE_KEY = "life-log-planner-state-v2";
const LEGACY_STORAGE_KEY = "life-log-planner-state";

// Legacy v1 state for migration
export interface LegacyPersistedState {
  activities: Activity[];
  day: Record<string, DayGrid>;
  week: Record<string, WeekGrid>;
  checklist: Record<string, ChecklistItem[]>;
  checklistBlocks: Record<string, ChecklistBlock[]>;
  startHour: number;
  theme: "light" | "dark";
}

// Alias for backward compatibility
export type PersistedState = PersistedStateV2;

// Simplified state for new architecture
export interface SimplifiedPersistedState {
  activities: Activity[];
  blocks: Record<string, Block[]>; // dateISO -> Block[]
  checklists: Record<string, ChecklistItem[]>; // dateISO -> ChecklistItem[]
  theme: 'light' | 'dark';
}

function createEmptyStateV2(): PersistedStateV2 {
  return {
    version: 2,
    schemaVersion: 2,
    activities: [],
    blocksByDate: {},
    weekPlans: {},
    fixedSchedule: [],
    fixedSchedules: [],
    templateAppliesByDate: {},
    dailyStateByDate: {},
    completionEventsByDate: {},
    indicatorsByDate: {},
    checklistByDate: {},
    checklistBlocksByDate: {},
    memosByDate: {},
    voiceCommandLogsByDate: {},
    startHour: 6,
    theme: "light",
  };
}

// Migrate v1 DayGrid cells to v2 Blocks
function migrateDayGridToBlocks(
  dayGrids: Record<string, DayGrid>
): Record<string, Block[]> {
  const blocksByDate: Record<string, Block[]> = {};
  const now = Date.now();

  for (const [dateISO, grid] of Object.entries(dayGrids)) {
    const blocks: Block[] = [];
    const cellIds = Object.keys(grid).sort();

    // Group consecutive cells with same activity
    type CellInfo = { hour: number; col: number; execute?: string; overlay?: string };
    const cells: CellInfo[] = cellIds.map((cellId) => {
      const [, hh, cc] = cellId.split("|");
      return {
        hour: Number(hh),
        col: Number(cc),
        execute: grid[cellId].execute,
        overlay: grid[cellId].overlay,
      };
    });

    // Build execute blocks
    const executeSegments: { startMin: number; endMin: number; activityId: string }[] = [];
    let currentExec: { startMin: number; activityId: string } | null = null;

    for (const cell of cells) {
      const min = cell.hour * 60 + cell.col * 10;
      if (cell.execute) {
        if (currentExec && currentExec.activityId === cell.execute) {
          // Continue segment
        } else {
          if (currentExec) {
            executeSegments.push({
              startMin: currentExec.startMin,
              endMin: min,
              activityId: currentExec.activityId,
            });
          }
          currentExec = { startMin: min, activityId: cell.execute };
        }
      } else if (currentExec) {
        executeSegments.push({
          startMin: currentExec.startMin,
          endMin: min,
          activityId: currentExec.activityId,
        });
        currentExec = null;
      }
    }
    if (currentExec) {
      const lastCell = cells[cells.length - 1];
      executeSegments.push({
        startMin: currentExec.startMin,
        endMin: lastCell.hour * 60 + (lastCell.col + 1) * 10,
        activityId: currentExec.activityId,
      });
    }

    for (const seg of executeSegments) {
      blocks.push({
        id: `migrated_exec_${dateISO}_${seg.startMin}`,
        dateISO,
        startMin: seg.startMin,
        endMin: seg.endMin,
        activityId: seg.activityId,
        layer: "execute",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Build overlay blocks (similar logic)
    const overlaySegments: { startMin: number; endMin: number; activityId: string }[] = [];
    let currentOverlay: { startMin: number; activityId: string } | null = null;

    for (const cell of cells) {
      const min = cell.hour * 60 + cell.col * 10;
      if (cell.overlay) {
        if (currentOverlay && currentOverlay.activityId === cell.overlay) {
          // Continue
        } else {
          if (currentOverlay) {
            overlaySegments.push({
              startMin: currentOverlay.startMin,
              endMin: min,
              activityId: currentOverlay.activityId,
            });
          }
          currentOverlay = { startMin: min, activityId: cell.overlay };
        }
      } else if (currentOverlay) {
        overlaySegments.push({
          startMin: currentOverlay.startMin,
          endMin: min,
          activityId: currentOverlay.activityId,
        });
        currentOverlay = null;
      }
    }
    if (currentOverlay) {
      const lastCell = cells[cells.length - 1];
      overlaySegments.push({
        startMin: currentOverlay.startMin,
        endMin: lastCell.hour * 60 + (lastCell.col + 1) * 10,
        activityId: currentOverlay.activityId,
      });
    }

    for (const seg of overlaySegments) {
      blocks.push({
        id: `migrated_overlay_${dateISO}_${seg.startMin}`,
        dateISO,
        startMin: seg.startMin,
        endMin: seg.endMin,
        activityId: seg.activityId,
        layer: "overlay",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (blocks.length > 0) {
      blocksByDate[dateISO] = blocks;
    }
  }

  return blocksByDate;
}

// Migrate v1 indicators to v2 IndicatorEvents
function migrateIndicators(
  dayGrids: Record<string, DayGrid>
): Record<string, IndicatorEvent[]> {
  const indicatorsByDate: Record<string, IndicatorEvent[]> = {};
  const now = Date.now();

  for (const [dateISO, grid] of Object.entries(dayGrids)) {
    const indicators: IndicatorEvent[] = [];

    for (const [cellId, cell] of Object.entries(grid)) {
      if (cell.indicator) {
        const [, hh, cc] = cellId.split("|");
        const atMin = Number(hh) * 60 + Number(cc) * 10;
        indicators.push({
          id: `migrated_ind_${cellId}`,
          dateISO,
          atMin,
          label: cell.indicator.label,
          timeText: cell.indicator.timeText,
          createdAt: now,
        });
      }
    }

    if (indicators.length > 0) {
      indicatorsByDate[dateISO] = indicators;
    }
  }

  return indicatorsByDate;
}

// Migrate v1 checklist blocks
function migrateChecklistBlocks(
  blocks: Record<string, ChecklistBlock[]>
): Record<string, ChecklistBlock[]> {
  const result: Record<string, ChecklistBlock[]> = {};
  const now = Date.now();

  for (const [dateISO, list] of Object.entries(blocks)) {
    result[dateISO] = list.map((b) => ({
      ...b,
      dateISO,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return result;
}

// Migrate v1 checklists
function migrateChecklists(
  checklists: Record<string, ChecklistItem[]>
): Record<string, ChecklistItem[]> {
  const result: Record<string, ChecklistItem[]> = {};
  const now = Date.now();

  for (const [dateISO, items] of Object.entries(checklists)) {
    result[dateISO] = items.map((item) => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return result;
}

function migrateV1toV2(legacy: LegacyPersistedState): PersistedStateV2 {
  const state = createEmptyStateV2();

  state.activities = legacy.activities || [];
  state.startHour = legacy.startHour ?? 6;
  state.theme = legacy.theme || "light";

  if (legacy.day) {
    state.blocksByDate = migrateDayGridToBlocks(legacy.day);
    state.indicatorsByDate = migrateIndicators(legacy.day);
  }

  if (legacy.checklist) {
    state.checklistByDate = migrateChecklists(legacy.checklist);
  }

  if (legacy.checklistBlocks) {
    state.checklistBlocksByDate = migrateChecklistBlocks(legacy.checklistBlocks);
  }

  return state;
}

export function loadState(): PersistedStateV2 | null {
  try {
    // Try v2 first
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as PersistedStateV2;
      if (parsed.schemaVersion === 2) {
        return parsed;
      }
    }

    // Try legacy v1 and migrate
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const legacy = JSON.parse(rawV1) as LegacyPersistedState;
      const migrated = migrateV1toV2(legacy);
      // Save migrated state
      saveState(migrated);
      return migrated;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedStateV2): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}
