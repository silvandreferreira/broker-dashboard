"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

// Preferência "incluir planos de investimento": por defeito ligada; guardada só durante
// a sessão do browser (sessionStorage) e reposta no logout (resetIncludePlans).
const INCLUDE_PLANS_KEY = "broker-dashboard:includePlans";
const INCLUDE_PLANS_EVENT = "broker-dashboard:includePlans-change";

function readIncludePlans(): boolean {
  try {
    return window.sessionStorage.getItem(INCLUDE_PLANS_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeIncludePlans(value: boolean | null) {
  try {
    if (value === null || value) window.sessionStorage.removeItem(INCLUDE_PLANS_KEY);
    else window.sessionStorage.setItem(INCLUDE_PLANS_KEY, "false");
  } catch {
    /* sessionStorage indisponível: fica só em memória até ao próximo evento */
  }
  window.dispatchEvent(new Event(INCLUDE_PLANS_EVENT));
}

function subscribeIncludePlans(callback: () => void) {
  window.addEventListener(INCLUDE_PLANS_EVENT, callback);
  return () => window.removeEventListener(INCLUDE_PLANS_EVENT, callback);
}

/** Repõe a preferência por defeito (planos incluídos). Chamar no logout. */
export function resetIncludePlans() {
  writeIncludePlans(null);
}

export type BrokerFilter = "all" | "XTB" | "T212";
export type KindFilter = "all" | "ETF" | "STOCK";

const cacheKey = (fileId: string, includePlans: boolean, broker: BrokerFilter, kind: KindFilter) =>
  `${fileId}|${includePlans ? "all" : "noplans"}|${broker}|${kind}`;
const filterQuery = (includePlans: boolean, broker: BrokerFilter, kind: KindFilter) =>
  `includePlans=${includePlans}&broker=${broker}&kind=${kind}`;

export type BrokerDocumentInfo = {
  id: string;
  broker: "XTB" | "T212";
  fileName: string;
  uploadedAt: string;
  reportDate: string | null;
  _count: { assets: number };
};

export type UploadedFile = {
  id: string;
  fileName: string;
  uploadedAt: string;
  isActive: boolean;
  reportDate?: string | null;
  _count: { assets: number };
  documents?: BrokerDocumentInfo[];
};

export type FilesResponse = {
  files: UploadedFile[];
  activeFileId: string | null;
};

export type Summary = {
  etfCount: number;
  totalUnits: number;
  totalInvested: number;
  totalAcc: number;
  totalEuros: number;
  profitPercent: number;
};

export type BrokerTotals = {
  broker: string;
  positions: number;
  invested: number;
  current: number;
  profit: number;
  profitPercent: number;
  weight: number;
};

export type DashboardData = {
  needsReupload?: boolean;
  hasInvestmentPlans?: boolean;
  available?: { brokers: string[]; kinds: string[] };
  byBroker?: BrokerTotals[];
  summary: Summary | null;
  byCategory: { name: string; value: number; current: number }[];
  byYear: { year: number; profitPercent: number; invested: number; profit: number }[];
  investedVsProfitByYear: { year: string; investido: number; lucro: number }[];
  byTicker: {
    ticker: string;
    name: string | null;
    category?: string | null;
    units: number;
    invested: number;
    current: number;
    brokers?: { broker: string; units: number; invested: number; current: number }[];
    lots?: { openedAt: string | null; broker: string; product: string | null; units: number; invested: number; current: number }[];
  }[];
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
  includePlans: boolean;
  setIncludePlans: (value: boolean) => void;
  broker: BrokerFilter;
  setBroker: (value: BrokerFilter) => void;
  kind: KindFilter;
  setKind: (value: KindFilter) => void;
  clearCache: () => void;
};

const CacheContext = createContext<CacheContextValue | null>(null);

export function CacheProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CacheState>({
    files: null,
    dashboard: {},
    history: {},
  });
  const includePlans = useSyncExternalStore(subscribeIncludePlans, readIncludePlans, () => true);
  const setIncludePlans = useCallback((value: boolean) => writeIncludePlans(value), []);
  const [broker, setBroker] = useState<BrokerFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");

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
    (fileId: string) => state.dashboard[cacheKey(fileId, includePlans, broker, kind)] ?? null,
    [state.dashboard, includePlans, broker, kind],
  );

  const loadDashboard = useCallback(async (fileId: string) => {
    const key = cacheKey(fileId, includePlans, broker, kind);
    if (state.dashboard[key] != null) return;
    const res = await fetch(
      `/api/dashboard?fileId=${encodeURIComponent(fileId)}&${filterQuery(includePlans, broker, kind)}`,
    );
    if (!res.ok) throw new Error("Falha ao carregar dashboard");
    const data: DashboardData = await res.json();
    setState((s) => ({
      ...s,
      dashboard: { ...s.dashboard, [key]: data },
    }));
  }, [state.dashboard, includePlans, broker, kind]);

  const getHistoryData = useCallback(
    (fileId: string) => state.history[cacheKey(fileId, includePlans, broker, kind)] ?? null,
    [state.history, includePlans, broker, kind],
  );

  const loadHistory = useCallback(async (fileId: string) => {
    const key = cacheKey(fileId, includePlans, broker, kind);
    if (state.history[key] != null) return;
    const res = await fetch(
      `/api/dashboard/history?fileId=${encodeURIComponent(fileId)}&${filterQuery(includePlans, broker, kind)}`,
    );
    if (!res.ok) throw new Error("Falha ao carregar evolução da carteira");
    const data: HistoryData = await res.json();
    setState((s) => ({
      ...s,
      history: { ...s.history, [key]: data },
    }));
  }, [state.history, includePlans, broker, kind]);

  const invalidateDashboard = useCallback((fileId: string) => {
    const drop = <T,>(m: Record<string, T>) =>
      Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${fileId}|`)));
    setState((s) => ({ ...s, dashboard: drop(s.dashboard), history: drop(s.history) }));
  }, []);

  const clearCache = useCallback(() => {
    setState({ files: null, dashboard: {}, history: {} });
    setBroker("all");
    setKind("all");
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
      includePlans,
      setIncludePlans,
      broker,
      setBroker,
      kind,
      setKind,
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
      includePlans,
      setIncludePlans,
      broker,
      kind,
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
