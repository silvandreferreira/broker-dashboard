"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UploadedFile = {
  id: string;
  fileName: string;
  uploadedAt: string;
  isActive: boolean;
  _count: { assets: number };
};

export type FilesResponse = {
  files: UploadedFile[];
  activeFileId: string | null;
};

export type Summary = {
  totalUnits: number;
  totalInvested: number;
  totalAcc: number;
  totalEuros: number;
  profitPercent: number;
};

export type DashboardData = {
  summary: Summary | null;
  byCategory: { name: string; value: number; current: number }[];
  byYear: { year: number; profitPercent: number; invested: number; profit: number }[];
  byType: { type: string; value: number; percentage: number }[];
  investedVsProfitByYear: { year: string; investido: number; lucro: number }[];
  investedAndAccByYear: { year: string; investidoAcumulado: number; acc: number }[];
  byTicker: { ticker: string; units: number; invested: number; current: number }[];
  byIndexGroup: { name: string; value: number; current: number }[];
};

export type HistoryPoint = {
  period: string;
  date: string;
  value: number;
  invested: number;
  contribution: number;
  gain: number;
  returnPct: number | null;
  totalProfit: number;
};

export type HistoryData = {
  needsReupload?: boolean;
  error?: string;
  year?: number;
  asOf?: string;
  monthly?: HistoryPoint[];
  yearly?: HistoryPoint[];
  failedTickers?: string[];
  xtbValue?: number;
};

type CacheState = {
  files: FilesResponse | null;
  dashboard: Record<string, DashboardData>;
  history: Record<string, HistoryData>;
};

type CacheContextValue = {
  files: FilesResponse | null;
  loadFiles: () => Promise<void>;
  invalidateFiles: () => void;
  updateFilesInCache: (data: FilesResponse) => void;
  getDashboardData: (fileId: string) => DashboardData | null;
  loadDashboard: (fileId: string) => Promise<void>;
  invalidateDashboard: (fileId: string) => void;
  getHistoryData: (fileId: string) => HistoryData | null;
  loadHistory: (fileId: string) => Promise<void>;
  clearCache: () => void;
};

const CacheContext = createContext<CacheContextValue | null>(null);

export function CacheProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CacheState>({
    files: null,
    dashboard: {},
    history: {},
  });

  const loadFiles = useCallback(async () => {
    if (state.files !== null) return;
    const res = await fetch("/api/files");
    if (!res.ok) throw new Error("Falha ao carregar ficheiros");
    const data: FilesResponse = await res.json();
    setState((s) => ({ ...s, files: data }));
  }, [state.files]);

  const invalidateFiles = useCallback(() => {
    setState((s) => ({ ...s, files: null }));
  }, []);

  const updateFilesInCache = useCallback((data: FilesResponse) => {
    setState((s) => ({ ...s, files: data }));
  }, []);

  const getDashboardData = useCallback(
    (fileId: string) => state.dashboard[fileId] ?? null,
    [state.dashboard],
  );

  const loadDashboard = useCallback(async (fileId: string) => {
    if (state.dashboard[fileId] != null) return;
    const res = await fetch(`/api/dashboard?fileId=${encodeURIComponent(fileId)}`);
    if (!res.ok) throw new Error("Falha ao carregar dashboard");
    const data: DashboardData = await res.json();
    setState((s) => ({
      ...s,
      dashboard: { ...s.dashboard, [fileId]: data },
    }));
  }, [state.dashboard]);

  const getHistoryData = useCallback(
    (fileId: string) => state.history[fileId] ?? null,
    [state.history],
  );

  const loadHistory = useCallback(async (fileId: string) => {
    if (state.history[fileId] != null) return;
    const res = await fetch(`/api/dashboard/history?fileId=${encodeURIComponent(fileId)}`);
    if (!res.ok) throw new Error("Falha ao carregar evolução da carteira");
    const data: HistoryData = await res.json();
    setState((s) => ({
      ...s,
      history: { ...s.history, [fileId]: data },
    }));
  }, [state.history]);

  const invalidateDashboard = useCallback((fileId: string) => {
    setState((s) => {
      if (s.dashboard[fileId] == null && s.history[fileId] == null) return s;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [fileId]: _, ...rest } = s.dashboard;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [fileId]: __, ...restHistory } = s.history;
      return { ...s, dashboard: rest, history: restHistory };
    });
  }, []);

  const clearCache = useCallback(() => {
    setState({ files: null, dashboard: {}, history: {} });
  }, []);

  const value = useMemo<CacheContextValue>(
    () => ({
      files: state.files,
      loadFiles,
      invalidateFiles,
      updateFilesInCache,
      getDashboardData,
      loadDashboard,
      invalidateDashboard,
      getHistoryData,
      loadHistory,
      clearCache,
    }),
    [
      state.files,
      loadFiles,
      invalidateFiles,
      updateFilesInCache,
      getDashboardData,
      loadDashboard,
      invalidateDashboard,
      getHistoryData,
      loadHistory,
      clearCache,
    ],
  );

  return (
    <CacheContext.Provider value={value}>{children}</CacheContext.Provider>
  );
}

export function useCache() {
  const ctx = useContext(CacheContext);
  if (!ctx) throw new Error("useCache must be used within CacheProvider");
  return ctx;
}
