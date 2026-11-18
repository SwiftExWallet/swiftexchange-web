import { create } from 'zustand';

interface QuoteTimerState {
  timeLeft: number;
  setTimeLeft: (updater: number | ((prev: number) => number)) => void;
  resetTimer: (duration?: number) => void;
}

export const useQuoteTimerStore = create<QuoteTimerState>(set => ({
  timeLeft: 30,
  setTimeLeft: updater =>
    set(state => ({
      timeLeft: typeof updater === 'function' ? updater(state.timeLeft) : updater,
    })),
  resetTimer: (duration = 30) => set({ timeLeft: duration }),
}));
