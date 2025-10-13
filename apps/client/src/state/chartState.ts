import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Timeframe = "1m" | "2m" | "5m" | "10m" | "15m" | "30m" | "1h";
export type Layout = "1x1" | "2x1" | "2x2";
export type ChartStyle = "candles" | "bars" | "line";

export interface VwapSettings {
  mode: "session" | "anchored";
  anchorMs?: number;
}

export interface BollingerSettings {
  period: number;
  stdDev: number;
}

export interface ChartOverlays {
  ema: number[]; // e.g. [20, 50]
  boll: BollingerSettings | null;
  vwap: VwapSettings | null;
  volumeSma: number;
  sharedCrosshair: boolean;
}

export interface ActiveChart {
  symbol: string;
  timeframe: Timeframe;
}

export interface ChartState {
  favorites: string[];
  active: ActiveChart;
  layout: Layout;
  chartStyle: ChartStyle;
  overlays: ChartOverlays;
  focusedPane: number;

  // Actions
  setSymbol: (symbol: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setLayout: (layout: Layout) => void;
  setChartStyle: (style: ChartStyle) => void;
  setOverlays: (overlays: Partial<ChartOverlays>) => void;
  setVwapAnchor: (anchorMs: number) => void;
  clearVwapAnchor: () => void;
  addFavorite: (symbol: string) => void;
  removeFavorite: (symbol: string) => void;
  setFocusedPane: (paneId: number) => void;
  addEma: (period: number) => void;
  removeEma: (period: number) => void;
}

const DEFAULT_FAVORITES = ["SPY", "QQQ", "NVDA"];
const DEFAULT_EMA_PERIODS = [20, 50];
const DEFAULT_BOLLINGER: BollingerSettings = { period: 20, stdDev: 2 };
const DEFAULT_VWAP: VwapSettings = { mode: "session" };
const DEFAULT_VOLUME_SMA = 20;

export const useChartState = create<ChartState>()(
  persist(
    (set) => ({
      favorites: DEFAULT_FAVORITES,
      active: { symbol: "SPY", timeframe: "1m" },
      layout: "1x1",
      chartStyle: "candles",
      overlays: {
        ema: DEFAULT_EMA_PERIODS,
        boll: DEFAULT_BOLLINGER,
        vwap: DEFAULT_VWAP,
        volumeSma: DEFAULT_VOLUME_SMA,
        sharedCrosshair: true,
      },
      focusedPane: 0,

      setSymbol: (symbol: string) =>
        set((state) => ({
          active: { ...state.active, symbol: symbol.toUpperCase() },
        })),

      setTimeframe: async (timeframe: Timeframe) => {
        const symbol = useChartState.getState().active.symbol;

        // Optimistically update UI
        set((state) => ({
          active: { ...state.active, timeframe },
        }));

        try {
          // Call server API for authoritative timeframe switch
          const response = await fetch("/api/chart/timeframe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ symbol, timeframe }),
          });

          if (!response.ok) {
            console.error("[ChartState] Timeframe switch failed:", response.status);
            // Rollback UI on error (keep optimistic value for now)
          } else {
            const data = await response.json();
            console.log(`[ChartState] ✅ Server switched to ${timeframe}, ${data.barsCount} bars`);
          }
        } catch (error) {
          console.error("[ChartState] Timeframe switch error:", error);
          // Keep optimistic update on network errors
        }
      },

      setLayout: (layout: Layout) => set({ layout }),

      setChartStyle: (style: ChartStyle) => set({ chartStyle: style }),

      setOverlays: (newOverlays: Partial<ChartOverlays>) =>
        set((state) => ({
          overlays: { ...state.overlays, ...newOverlays },
        })),

      setVwapAnchor: (anchorMs: number) =>
        set((state) => ({
          overlays: {
            ...state.overlays,
            vwap: { mode: "anchored", anchorMs },
          },
        })),

      clearVwapAnchor: () =>
        set((state) => ({
          overlays: {
            ...state.overlays,
            vwap: { mode: "session" },
          },
        })),

      addFavorite: (symbol: string) =>
        set((state) => {
          const symbolUpper = symbol.toUpperCase();
          if (state.favorites.includes(symbolUpper)) return state;
          return { favorites: [...state.favorites, symbolUpper] };
        }),

      removeFavorite: (symbol: string) =>
        set((state) => ({
          favorites: state.favorites.filter((s) => s !== symbol.toUpperCase()),
        })),

      setFocusedPane: (paneId: number) => set({ focusedPane: paneId }),

      addEma: (period: number) =>
        set((state) => {
          if (state.overlays.ema.includes(period)) return state;
          return {
            overlays: {
              ...state.overlays,
              ema: [...state.overlays.ema, period].sort((a, b) => a - b),
            },
          };
        }),

      removeEma: (period: number) =>
        set((state) => ({
          overlays: {
            ...state.overlays,
            ema: state.overlays.ema.filter((p) => p !== period),
          },
        })),
    }),
    {
      name: "spotlight-chart-state",
      partialize: (state) => ({
        favorites: state.favorites,
        active: state.active,
        layout: state.layout,
        chartStyle: state.chartStyle,
        overlays: state.overlays,
      }),
    },
  ),
);
