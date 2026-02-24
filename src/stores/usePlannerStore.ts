import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Activity, Block, ChecklistItem, Tool, ViewMode } from '../lib/types';
import { loadState, saveState } from '../lib/storage';
import { createBlock } from '../lib/blocks';

interface PlannerState {
  // View
  view: ViewMode;
  date: Date;
  
  // Tools
  tool: Tool;
  brush: string;
  
  // Data
  activities: Activity[];
  blocks: Record<string, Block[]>; // dateISO -> Block[]
  checklists: Record<string, ChecklistItem[]>; // dateISO -> ChecklistItem[]
  
  // UI State
  theme: 'light' | 'dark';
  showChecklist: boolean;
  
  // Undo/Redo
  history: {
    past: Array<{ blocks: Record<string, Block[]> }>;
    future: Array<{ blocks: Record<string, Block[]> }>;
  };
  
  // Actions
  setView: (view: ViewMode) => void;
  setDate: (date: Date) => void;
  setTool: (tool: Tool) => void;
  setBrush: (activityId: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleChecklist: () => void;
  
  // Block operations
  addBlock: (block: Block) => void;
  updateBlock: (blockId: string, updates: Partial<Block>) => void;
  removeBlock: (dateISO: string, blockId: string) => void;
  getBlocksForDate: (dateISO: string) => Block[];
  
  // Activity operations
  addActivity: (activity: Activity) => void;
  updateActivity: (activityId: string, updates: Partial<Activity>) => void;
  
  // Checklist operations
  addChecklistItem: (dateISO: string, item: ChecklistItem) => void;
  toggleChecklistItem: (dateISO: string, itemId: string) => void;
  removeChecklistItem: (dateISO: string, itemId: string) => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;
  
  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

export const usePlannerStore = create<PlannerState>()(
  immer((set, get) => ({
    // Initial state
    view: 'DAY',
    date: new Date(),
    tool: 'PAINT',
    brush: 'work',
    activities: [],
    blocks: {},
    checklists: {},
    theme: 'light',
    showChecklist: false,
    history: {
      past: [],
      future: [],
    },
    
    // View actions
    setView: (view) => set({ view }),
    setDate: (date) => set({ date }),
    setTool: (tool) => set({ tool }),
    setBrush: (activityId) => set({ brush: activityId }),
    setTheme: (theme) => {
      set({ theme });
      document.documentElement.setAttribute('data-theme', theme);
    },
    toggleChecklist: () => set((state) => {
      state.showChecklist = !state.showChecklist;
    }),
    
    // Block operations
    addBlock: (block) => set((state) => {
      const { dateISO } = block;
      if (!state.blocks[dateISO]) {
        state.blocks[dateISO] = [];
      }
      state.blocks[dateISO].push(block);
    }),
    
    updateBlock: (blockId, updates) => set((state) => {
      for (const dateISO in state.blocks) {
        const blockIndex = state.blocks[dateISO].findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          state.blocks[dateISO][blockIndex] = {
            ...state.blocks[dateISO][blockIndex],
            ...updates,
            updatedAt: Date.now(),
          };
          break;
        }
      }
    }),
    
    removeBlock: (dateISO, blockId) => set((state) => {
      if (state.blocks[dateISO]) {
        state.blocks[dateISO] = state.blocks[dateISO].filter(b => b.id !== blockId);
      }
    }),
    
    getBlocksForDate: (dateISO) => {
      return get().blocks[dateISO] || [];
    },
    
    // Activity operations
    addActivity: (activity) => set((state) => {
      state.activities.push(activity);
    }),
    
    updateActivity: (activityId, updates) => set((state) => {
      const index = state.activities.findIndex(a => a.id === activityId);
      if (index !== -1) {
        state.activities[index] = { ...state.activities[index], ...updates };
      }
    }),
    
    // Checklist operations
    addChecklistItem: (dateISO, item) => set((state) => {
      if (!state.checklists[dateISO]) {
        state.checklists[dateISO] = [];
      }
      state.checklists[dateISO].push(item);
    }),
    
    toggleChecklistItem: (dateISO, itemId) => set((state) => {
      if (state.checklists[dateISO]) {
        const item = state.checklists[dateISO].find(i => i.id === itemId);
        if (item) {
          item.done = !item.done;
          item.updatedAt = Date.now();
        }
      }
    }),
    
    removeChecklistItem: (dateISO, itemId) => set((state) => {
      if (state.checklists[dateISO]) {
        state.checklists[dateISO] = state.checklists[dateISO].filter(i => i.id !== itemId);
      }
    }),
    
    // Undo/Redo
    pushHistory: () => set((state) => {
      const snapshot = JSON.parse(JSON.stringify(state.blocks));
      state.history.past.push({ blocks: snapshot });
      state.history.future = [];
      
      // Limit history size
      if (state.history.past.length > 50) {
        state.history.past.shift();
      }
    }),
    
    undo: () => set((state) => {
      if (state.history.past.length === 0) return;
      
      const current = JSON.parse(JSON.stringify(state.blocks));
      state.history.future.unshift({ blocks: current });
      
      const previous = state.history.past.pop();
      if (previous) {
        state.blocks = previous.blocks;
      }
    }),
    
    redo: () => set((state) => {
      if (state.history.future.length === 0) return;
      
      const current = JSON.parse(JSON.stringify(state.blocks));
      state.history.past.push({ blocks: current });
      
      const next = state.history.future.shift();
      if (next) {
        state.blocks = next.blocks;
      }
    }),
    
    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,
    
    // Persistence
    loadFromStorage: () => {
      const state = loadState();
      if (state) {
        set({
          activities: state.activities || [],
          blocks: (state as any).blocks || state.blocksByDate || {},
          checklists: (state as any).checklists || state.checklistByDate || {},
          theme: state.theme || 'light',
        });
      }
    },
    
    saveToStorage: () => {
      const state = get();
      saveState({
        activities: state.activities,
        blocksByDate: state.blocks,
        checklistByDate: state.checklists,
        theme: state.theme,
      } as any);
    },
  }))
);

// Debounced save (1초 후 저장)
let saveTimeout: ReturnType<typeof setTimeout>;
usePlannerStore.subscribe((state) => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    state.saveToStorage();
  }, 1000);
});
