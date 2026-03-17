"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCache } from "./contexts/CacheContext";
import { AdminPanel } from "./components/AdminPanel";
import { ADMIN_EMAIL } from "@/lib/access";

const DashboardCharts = dynamic(
  () =>
    import("./components/DashboardCharts").then((m) => ({ default: m.DashboardCharts })),
  {
    loading: () => (
      <div className="d-flex align-items-center justify-content-center py-5 text-secondary">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        A carregar dashboard...
      </div>
    ),
    ssr: false,
  },
);

export default function Home() {
  const { data: session } = useSession();
  const {
    files: cachedFiles,
    loadFiles,
    invalidateFiles,
    updateFilesInCache,
    invalidateDashboard,
    clearCache,
  } = useCache();
  const [activeTab, setActiveTab] = useState<"upload" | "dashboard" | "admin">("upload");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingFileId, setSelectingFileId] = useState<string | null>(null);
  const [selectProgress, setSelectProgress] = useState(0);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const files = cachedFiles?.files ?? [];
  const activeFileId = cachedFiles?.activeFileId ?? null;
  const isAdmin = (session?.user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const isApproved = isAdmin || session?.user?.accessApproved === true;

  useEffect(() => {
    if (!session?.user) {
      clearCache();
      return;
    }
    if (cachedFiles !== null) return;
    let cancelled = false;
    setIsLoadingFiles(true);
    setError(null);
    loadFiles()
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar a lista de ficheiros.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user, cachedFiles, loadFiles, clearCache]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as
      | HTMLInputElement
      | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Escolhe um ficheiro XLSX primeiro.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsUploading(true);
      setError(null);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha no upload do ficheiro");
      }
      invalidateFiles();
      await loadFiles();
      setActiveTab("dashboard");
      form.reset();
    } catch (e: unknown) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Erro ao fazer upload do ficheiro."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectFile = async (id: string) => {
    if (selectingFileId) return;
    setSelectingFileId(id);
    setSelectProgress(0);
    setError(null);

    const progressInterval = setInterval(() => {
      setSelectProgress((p) => {
        if (p >= 90) return 90;
        return p + 8;
      });
    }, 80);

    try {
      const res = await fetch("/api/files/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      });
      clearInterval(progressInterval);
      setSelectProgress(100);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao selecionar ficheiro");
      }
      updateFilesInCache({
        files: files.map((f) => ({
          ...f,
          isActive: f.id === id,
        })),
        activeFileId: id,
      });
      setTimeout(() => {
        setActiveTab("dashboard");
        setSelectingFileId(null);
        setSelectProgress(0);
      }, 220);
    } catch (e: unknown) {
      clearInterval(progressInterval);
      console.error(e);
      setSelectingFileId(null);
      setSelectProgress(0);
      setError(
        e instanceof Error ? e.message : "Erro ao selecionar ficheiro."
      );
    }
  };

  const handleDeleteFile = async (id: string) => {
    if (selectingFileId || deletingFileId) return;
    const file = files.find((f) => f.id === id);
    const ok = window.confirm(
      `Delete file “${file?.fileName ?? "this file"}”?\n\nThis will remove all associated data from the database.`,
    );
    if (!ok) return;

    setDeletingFileId(id);
    setError(null);
    try {
      const res = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete file");
      }
      invalidateDashboard(id);
      invalidateFiles();
      await loadFiles();
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Error deleting file.");
    } finally {
      setDeletingFileId(null);
    }
  };

  if (!session) {
    return (
      <div className="container py-5">
        <div className="row justify-content-center min-vh-50">
          <div className="col-12 col-md-8 col-lg-5 text-center py-5">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-5">
                <i className="bi bi-graph-up-arrow display-4 text-primary mb-3" />
                <h1 className="h4 mb-2">Broker Dashboard</h1>
                <p className="text-muted mb-4">
                  Faz login para carregar o teu relatório XTB e acompanhar o portfolio.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-lg w-100"
                  onClick={() => signIn("google")}
                >
                  <i className="bi bi-google me-2" />
                  Entrar com Google
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-9 col-lg-7">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4 p-md-5 text-center">
                <i className="bi bi-hourglass-split display-5 text-primary mb-3" />
                <h1 className="h4 mb-2">
                  Hello {session.user?.name ?? "there"}
                </h1>
                <p className="text-muted mb-0">
                  Your access request has been submitted. You will be able to use the app soon.
                </p>
              </div>
              <div className="card-footer bg-white text-center">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => signOut()}
                >
                  <i className="bi bi-box-arrow-right me-1" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="mb-4">
        <h1 className="h4 mb-1">
          Olá, {session.user?.name || "investidor"} <i className="bi bi-hand-wave text-warning" />
        </h1>
        <p className="text-muted small mb-0">
          Escolhe o ficheiro da tua corretora e acompanha o teu portfolio.
        </p>
      </div>

      <ul className="nav nav-tabs mb-4" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            <i className="bi bi-upload me-1" />
            Upload XLSX
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <i className="bi bi-bar-chart me-1" />
            Dashboard
          </button>
        </li>
        {isAdmin && (
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={`nav-link ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              <i className="bi bi-shield-lock me-1" />
              Admin
            </button>
          </li>
        )}
      </ul>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button
            type="button"
            className="btn-close"
            onClick={() => setError(null)}
            aria-label="Fechar"
          />
        </div>
      )}

      {activeTab === "upload" && (
        <div className="row g-4">
          <div className="col-12">
            <div className="card border shadow-sm">
              <div className="card-body">
                <h2 className="h5 card-title mb-2">
                  <i className="bi bi-file-earmark-spreadsheet text-primary me-2" />
                  Carregar relatório XTB (XLSX)
                </h2>
                <p className="text-muted small mb-3">
                  Faz upload do relatório Excel (.xlsx) do XTB (Open Position). Os dados são
                  guardados em base de dados, não guardamos o ficheiro em si.
                </p>
                <form onSubmit={handleUpload} className="row g-2 align-items-end">
                  <div className="col-auto">
                    <input
                      type="file"
                      name="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="form-control form-control-sm"
                    />
                  </div>
                  <div className="col-auto">
                    <button
                      type="submit"
                      disabled={isUploading}
                      className="btn btn-primary btn-sm"
                    >
                      {isUploading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                          A carregar...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-upload me-1" />
                          Upload
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card border shadow-sm">
              <div className="card-header bg-white d-flex justify-content-between align-items-center">
                <h2 className="h6 mb-0">Os teus ficheiros</h2>
                {isLoadingFiles && (
                  <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />
                )}
              </div>
              <div className="card-body">
                {files.length === 0 ? (
                  <p className="text-muted small mb-0">
                    Ainda não tens nenhum ficheiro XLSX carregado.
                  </p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {files.map((file) => (
                      <li
                        key={file.id}
                        className="list-group-item d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 gap-md-0 px-3 py-3"
                      >
                        <div className="min-w-0 flex-grow-1">
                          <div
                            className="fw-medium text-truncate w-100"
                            title={file.fileName}
                          >
                            {file.fileName}
                          </div>
                          <div className="small text-muted mt-1">
                            {new Date(file.uploadedAt).toLocaleString()} · {file._count.assets} linhas
                          </div>
                        </div>
                        <div className="mt-2 mt-md-0 flex-shrink-0 d-flex flex-column flex-md-row gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectFile(file.id)}
                            disabled={selectingFileId !== null || deletingFileId !== null}
                            className={`btn btn-sm position-relative overflow-hidden w-100 w-md-auto ${
                              file.id === selectingFileId
                                ? "text-white border border-dark"
                                : activeFileId === file.id
                                  ? "btn-primary"
                                  : "btn-outline-secondary"
                            } text-nowrap`}
                            style={
                              file.id === selectingFileId
                                ? { backgroundColor: "#212529", minWidth: 160 }
                                : { minWidth: 140 }
                            }
                          >
                            {file.id === selectingFileId ? (
                              <>
                                <span
                                  className="position-absolute top-0 start-0 bottom-0 bg-dark"
                                  style={{
                                    width: `${selectProgress}%`,
                                    transition: "width 0.12s ease-out",
                                  }}
                                />
                                <span className="position-relative z-1">
                                  {selectProgress < 100 ? "A carregar…" : "Abrir dashboard"}
                                </span>
                              </>
                            ) : (
                              <>
                                <i className="bi bi-bar-chart me-1" />
                                Dashboard
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteFile(file.id)}
                            disabled={selectingFileId !== null || deletingFileId !== null}
                            className="btn btn-sm btn-outline-danger w-100 w-md-auto"
                            title="Delete file data from database"
                          >
                            {deletingFileId === file.id ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                                Deleting…
                              </>
                            ) : (
                              <>
                                <i className="bi bi-trash me-1" />
                                Delete
                              </>
                            )}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "dashboard" && (
        <div className="card border shadow-sm">
          <div className="card-body">
            {!activeFileId ? (
              <p className="text-muted small mb-0">
                Ainda não selecionaste nenhum ficheiro. Vai à tab &quot;Upload XLSX&quot; para
                carregar ou escolher um ficheiro.
              </p>
            ) : (
              <>
                <h2 className="h5 card-title mb-4">
                  <i className="bi bi-bar-chart me-2" />
                  Dashboard
                </h2>
                <DashboardCharts fileId={activeFileId} />
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "admin" && isAdmin && (
        <AdminPanel />
      )}
    </div>
  );
}
