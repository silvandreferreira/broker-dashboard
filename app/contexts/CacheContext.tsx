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

type CacheState = {
  files: FilesResponse | null;
  dashboard: Record<string, DashboardData>;
};

type CacheContextValue = {
  files: FilesResponse | null;
  loadFiles: () => Promise<void>;
  invalidateFiles: () => void;
  updateFilesInCache: (data: FilesResponse) => void;
  getDashboardData: (fileId: string) => DashboardData | null;
  loadDashboard: (fileId: string) => Promise<void>;
  invalidateDashboard: (fileId: string) => void;
  clearCache: () => void;
};

const CacheContext = createContext<CacheContextValue | null>(null);

export function CacheProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CacheState>({
    files: null,
    dashboard: {},
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

  const invalidateDashboard = useCallback((fileId: string) => {
    setState((s) => {
      if (s.dashboard[fileId] == null) return s;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [fileId]: _, ...rest } = s.dashboard;
      return { ...s, dashboard: rest };
    });
  }, []);

  const clearCache = useCallback(() => {
    setState({ files: null, dashboard: {} });
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
