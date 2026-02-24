import { useCallback, useRef, useState } from 'react';
import type { Tool } from '../lib/types';
import { createBlock } from '../lib/blocks';
import { usePlannerStore } from '../stores/usePlannerStore';
import { toISODate } from '../lib/time';

interface DragState {
  isDown: boolean;
  startRow: number | null;
  startCol: number | null;
  lastRow: number | null;
  lastCol: number | null;
  activeCells: Set<string>;
}

export function useDragHandler(dateISO: string) {
  const tool = usePlannerStore(state => state.tool);
  const brush = usePlannerStore(state => state.brush);
  const addBlock = usePlannerStore(state => state.addBlock);
  const pushHistory = usePlannerStore(state => state.pushHistory);
  
  const [dragState, setDragState] = useState<DragState>({
    isDown: false,
    startRow: null,
    startCol: null,
    lastRow: null,
    lastCol: null,
    activeCells: new Set(),
  });
  
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  
  const handlePointerDown = useCallback((row: number, col: number, e: React.PointerEvent) => {
    e.preventDefault();
    
    // Push history snapshot before starting drag
    pushHistory();
    
    setDragState({
      isDown: true,
      startRow: row,
      startCol: col,
      lastRow: row,
      lastCol: col,
      activeCells: new Set([`${row}:${col}`]),
    });
    
    // Long press for checklist (TODO: implement)
    longPressTimer.current = setTimeout(() => {
      // Open checklist dialog
    }, 450);
  }, [pushHistory]);
  
  const handlePointerEnter = useCallback((row: number, col: number, e: React.PointerEvent) => {
    if (!dragState.isDown) return;
    if (!(e.buttons & 1)) {
      // Button released outside
      setDragState(prev => ({ ...prev, isDown: false }));
      return;
    }
    
    clearTimeout(longPressTimer.current);
    
    const cellKey = `${row}:${col}`;
    if (dragState.activeCells.has(cellKey)) return;
    
    setDragState(prev => ({
      ...prev,
      lastRow: row,
      lastCol: col,
      activeCells: new Set([...prev.activeCells, cellKey]),
    }));
    
    // Paint logic
    if (tool === 'PAINT' || tool === 'execute') {
      const startMin = row * 60 + col * 10;
      const endMin = startMin + 10;
      
      const block = createBlock({
        dateISO,
        startMin,
        endMin,
        activityId: brush,
        layer: 'execute',
        source: 'drag',
      });
      
      addBlock(block);
    }
  }, [dragState, tool, brush, dateISO, addBlock]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    clearTimeout(longPressTimer.current);
    
    if (dragState.isDown && dragState.startRow !== null && dragState.startCol !== null) {
      // Handle drag completion
      if (tool === 'NEW_EVENT' || tool === 'new') {
        // Open new event dialog
        const startMin = dragState.startRow * 60 + dragState.startCol * 10;
        const endRow = dragState.lastRow ?? dragState.startRow;
        const endCol = dragState.lastCol ?? dragState.startCol;
        const endMin = endRow * 60 + endCol * 10 + 10;
        
        // TODO: Open dialog with these bounds
      }
    }
    
    setDragState({
      isDown: false,
      startRow: null,
      startCol: null,
      lastRow: null,
      lastCol: null,
      activeCells: new Set(),
    });
  }, [dragState, tool]);
  
  return {
    handlePointerDown,
    handlePointerEnter,
    handlePointerUp,
  };
}
