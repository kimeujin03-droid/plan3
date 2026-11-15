import type { Block, Layer, BlockSource, Activity, PlanResistance, ScoreRating } from "./types";
import { generateId } from "./id";

/**
 * 새 Block 생성
 */
export function createBlock(params: {
  dateISO: string;
  startMin: number;
  endMin: number;
  activityId: string;
  layer: Layer;
  source?: BlockSource;
  resistance?: PlanResistance;
  score?: ScoreRating;
  title?: string;
}): Block {
  const now = Date.now();
  return {
    id: generateId(),
    dateISO: params.dateISO,
    startMin: params.startMin,
    endMin: params.endMin,
    activityId: params.activityId,
    layer: params.layer,
    source: params.source || "drag",
    resistance: params.resistance,
    score: params.score,
    title: params.title,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Block 시간 충돌 감지
 */
export function detectOverlap(
  newBlock: { startMin: number; endMin: number; layer: Layer },
  existingBlocks: Block[],
  excludeId?: string
): Block[] {
  return existingBlocks.filter(
    (b) =>
      b.layer === newBlock.layer &&
      b.id !== excludeId &&
      newBlock.startMin < b.endMin &&
      newBlock.endMin > b.startMin
  );
}

/**
 * 충돌하는 Block들을 분할/삭제
 * 새 Block이 들어갈 공간을 확보
 */
export function resolveOverlaps(
  blocks: Block[],
  newBlock: { startMin: number; endMin: number; layer: Layer },
  excludeId?: string
): Block[] {
  const result: Block[] = [];

  for (const block of blocks) {
    // 다른 레이어거나 exclude 대상이면 그대로 유지
    if (block.layer !== newBlock.layer || block.id === excludeId) {
      result.push(block);
      continue;
    }

    // 충돌 없으면 그대로
    if (newBlock.startMin >= block.endMin || newBlock.endMin <= block.startMin) {
      result.push(block);
      continue;
    }

    // 완전히 덮어쓰기
    if (newBlock.startMin <= block.startMin && newBlock.endMin >= block.endMin) {
      continue; // 삭제
    }

    // 앞부분만 남김
    if (newBlock.startMin > block.startMin && newBlock.endMin >= block.endMin) {
      result.push({ ...block, endMin: newBlock.startMin });
      continue;
    }

    // 뒷부분만 남김
    if (newBlock.startMin <= block.startMin && newBlock.endMin < block.endMin) {
      result.push({ ...block, startMin: newBlock.endMin });
      continue;
    }

    // 중간 분할 (기존 블록을 두 개로)
    if (newBlock.startMin > block.startMin && newBlock.endMin < block.endMin) {
      result.push({ ...block, endMin: newBlock.startMin });
      result.push({
        ...block,
        id: generateId(),
        startMin: newBlock.endMin,
      });
      continue;
    }
  }

  return result;
}

/**
 * Block 추가 (충돌 자동 해결)
 */
export function addBlock(blocks: Block[], newBlock: Block): Block[] {
  const resolved = resolveOverlaps(blocks, newBlock);
  return [...resolved, newBlock];
}

/**
 * Block 삭제
 */
export function removeBlock(blocks: Block[], blockId: string): Block[] {
  return blocks.filter((b) => b.id !== blockId);
}

/**
 * Block 업데이트
 */
export function updateBlock(
  blocks: Block[],
  blockId: string,
  updates: Partial<Block>
): Block[] {
  return blocks.map((b) =>
    b.id === blockId ? { ...b, ...updates } : b
  );
}

/**
 * 영역 지우기 (Erase tool)
 */
export function eraseRange(
  blocks: Block[],
  layer: Layer,
  startMin: number,
  endMin: number
): Block[] {
  return resolveOverlaps(blocks, { layer, startMin, endMin });
}

/**
 * Select tool용 - 1분 정밀도로 시간 계산
 */
export function minuteFromPointer(
  hourRow: number,
  startHour: number,
  xRatio: number
): number {
  const hour = (startHour + hourRow) % 24;
  const minute = Math.floor(xRatio * 60);
  return hour * 60 + Math.min(59, Math.max(0, minute));
}

/**
 * Drag tool용 - 10분 셀 기준 시간 계산
 */
export function cellTimeRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  startHour: number
): { startMin: number; endMin: number } {
  const r1 = Math.min(startRow, endRow);
  const r2 = Math.max(startRow, endRow);
  const c1 = Math.min(startCol, endCol);
  const c2 = Math.max(startCol, endCol);

  const startHr = (startHour + r1) % 24;
  const endHr = (startHour + r2) % 24;

  const startMin = startHr * 60 + c1 * 10;
  const endMin = endHr * 60 + (c2 + 1) * 10;

  return { startMin, endMin };
}

/**
 * 특정 날짜의 Block 필터
 */
export function getBlocksForDate(blocks: Block[], dateISO: string): Block[] {
  return blocks.filter((b) => b.dateISO === dateISO);
}

/**
 * 레이어별 Block 필터
 */
export function getBlocksByLayer(blocks: Block[], layer: Layer): Block[] {
  return blocks.filter((b) => b.layer === layer);
}

/**
 * Plan-Execute 매칭
 * Plan 블록에 대응하는 Execute 블록이 있는지 확인
 */
export function findMatchingExecuteBlock(
  planBlock: Block,
  executeBlocks: Block[]
): Block | undefined {
  // 같은 activity가 있고 시간대가 겹치는 execute 블록
  return executeBlocks.find(
    (e) =>
      e.activityId === planBlock.activityId &&
      e.startMin < planBlock.endMin &&
      e.endMin > planBlock.startMin
  );
}

/**
 * 실행 지연 계산 (분 단위)
 */
export function calculateExecutionDelay(
  planBlock: Block,
  executeBlock: Block
): number {
  return executeBlock.startMin - planBlock.startMin;
}

/**
 * Block을 시간 텍스트로 변환
 */
export function blockTimeString(block: Block): string {
  const startH = Math.floor(block.startMin / 60);
  const startM = block.startMin % 60;
  const endH = Math.floor(block.endMin / 60);
  const endM = block.endMin % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return `${pad(startH)}:${pad(startM)} - ${pad(endH)}:${pad(endM)}`;
}

/**
 * 시간(분)을 HH:MM 형식으로
 */
export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Activity 색상 가져오기
 */
export function getActivityColor(
  activityId: string,
  activities: Activity[]
): string {
  return activities.find((a) => a.id === activityId)?.color || "#888888";
}
