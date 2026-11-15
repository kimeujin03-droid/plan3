import type { Block, Segment, DayGrid, Layer } from "./types";
import { makeCellId } from "./id";

/**
 * Block v2 기반 세그먼트 빌더
 * Block 배열을 렌더링용 Segment로 변환
 */
export function buildSegmentsFromBlocks(
  blocks: Block[],
  startHour: number
): Segment[] {
  const segments: Segment[] = [];

  // 레이어별 블록 분리
  const planBlocks = blocks.filter((b) => b.layer === "plan");
  const executeBlocks = blocks.filter((b) => b.layer === "execute");
  const overlayBlocks = blocks.filter((b) => b.layer === "overlay");

  // 각 블록을 시간 row별로 분할하여 Segment 생성
  const processBlocks = (blockList: Block[], layer: Layer) => {
    for (const block of blockList) {
      let currentMin = block.startMin;

      while (currentMin < block.endMin) {
        const hour = Math.floor(currentMin / 60);
        const row = (hour - startHour + 24) % 24;
        const hourStart = hour * 60;
        const hourEnd = hourStart + 60;

        const segmentStart = currentMin;
        const segmentEnd = Math.min(block.endMin, hourEnd);

        const startCol = Math.floor((segmentStart - hourStart) / 10);
        const endCol = Math.max(0, Math.ceil((segmentEnd - hourStart) / 10) - 1);

        if (startCol <= 5 && endCol >= 0) {
          segments.push({
            row,
            startCol: Math.max(0, startCol),
            endCol: Math.min(5, endCol),
            activityId: block.activityId,
            layer,
            blockId: block.id,
          });
        }

        currentMin = hourEnd;
      }
    }
  };

  processBlocks(planBlocks, "plan");
  processBlocks(executeBlocks, "execute");
  processBlocks(overlayBlocks, "overlay");

  return segments;
}

/**
 * Legacy DayGrid 기반 세그먼트 빌더 (하위 호환)
 */
export function buildSegmentsForDay(
  grid: DayGrid,
  dateISO: string,
  startHour: number
): Segment[] {
  const segments: Segment[] = [];

  for (let row = 0; row < 24; row++) {
    const hour = (startHour + row) % 24;

    // Execute layer
    let col = 0;
    while (col < 6) {
      const cellId = makeCellId(dateISO, hour, col);
      const actId = grid[cellId]?.execute;
      if (!actId) {
        col++;
        continue;
      }
      let end = col;
      while (end + 1 < 6) {
        const nId = makeCellId(dateISO, hour, end + 1);
        if (grid[nId]?.execute !== actId) break;
        end++;
      }
      segments.push({ row, startCol: col, endCol: end, activityId: actId, layer: "execute" });
      col = end + 1;
    }

    // Overlay layer
    col = 0;
    while (col < 6) {
      const cellId = makeCellId(dateISO, hour, col);
      const actId = grid[cellId]?.overlay;
      if (!actId) {
        col++;
        continue;
      }
      let end = col;
      while (end + 1 < 6) {
        const nId = makeCellId(dateISO, hour, end + 1);
        if (grid[nId]?.overlay !== actId) break;
        end++;
      }
      segments.push({ row, startCol: col, endCol: end, activityId: actId, layer: "overlay" });
      col = end + 1;
    }
  }

  return segments;
}

/**
 * Block을 DayGrid 형식으로 변환 (렌더링용)
 */
export function blocksToGrid(blocks: Block[], dateISO: string): DayGrid {
  const grid: DayGrid = {};

  for (const block of blocks) {
    if (block.dateISO !== dateISO) continue;

    let currentMin = block.startMin;
    while (currentMin < block.endMin) {
      const hour = Math.floor(currentMin / 60);
      const col = Math.floor((currentMin % 60) / 10);
      const cellId = makeCellId(dateISO, hour, col);

      if (!grid[cellId]) {
        grid[cellId] = {};
      }

      if (block.layer === "execute") {
        grid[cellId].execute = block.activityId;
      } else if (block.layer === "overlay") {
        grid[cellId].overlay = block.activityId;
      }

      currentMin += 10;
    }
  }

  return grid;
}
