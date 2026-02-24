import { pad2 } from "./time";

export function makeCellId(dateISO: string, hour: number, col: number): string {
  return `${dateISO}|${pad2(hour)}|${col}`;
}

let idCounter = 0;

/**
 * 고유 ID 생성
 * timestamp + counter로 충돌 방지
 */
export function generateId(): string {
  idCounter = (idCounter + 1) % 1000;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
