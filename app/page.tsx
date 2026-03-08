"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { DashboardCharts } from "./components/DashboardCharts";

type UploadedFile = {
  id: string;
  fileName: string;
  uploadedAt: string;
  isActive: boolean;
  _count: {
    assets: number;
  };
};

type FilesResponse = {
  files: UploadedFile[];
  activeFileId: string | null;
};

export default function Home() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"upload" | "dashboard">("upload");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async () => {
    try {
      setIsLoadingFiles(true);
      setError(null);
      const res = await fetch("/api/files");
      if (!res.ok) {
        throw new Error("Falha ao carregar ficheiros");
      }
      const data: FilesResponse = await res.json();
      setFiles(data.files);
      setActiveFileId(data.activeFileId);
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar a lista de ficheiros.");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      void loadFiles();
    } else {
      setFiles([]);
      setActiveFileId(null);
    }
  }, [session?.user]);

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
    try {
      setError(null);
      const res = await fetch("/api/files/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao selecionar ficheiro");
      }
      setActiveFileId(id);
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          isActive: f.id === id,
        })),
      );
    } catch (e: unknown) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Erro ao selecionar ficheiro."
      );
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {!session ? (
        <div className="flex min-h-screen items-center justify-center">
          <button
            onClick={() => signIn("google")}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Login com Google
          </button>
        </div>
      ) : (
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                Olá, {session.user?.name || "investidor"} 👋
              </h1>
              <p className="text-sm text-gray-500">
                Escolhe o ficheiro da tua corretora e acompanha o teu portfolio.
              </p>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded bg-red-500 px-3 py-1.5 text-sm font-medium text-white"
            >
              Logout
            </button>
          </header>

          <div className="mb-4 flex border-b border-gray-200">
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "upload"
                  ? "border-b-2 border-black text-black"
                  : "text-gray-500 hover:text-gray-800"
              }`}
              onClick={() => setActiveTab("upload")}
            >
              Upload XLSX
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "dashboard"
                  ? "border-b-2 border-black text-black"
                  : "text-gray-500 hover:text-gray-800"
              }`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {activeTab === "upload" && (
            <section className="flex flex-1 flex-col gap-6">
              <form
                onSubmit={handleUpload}
                className="rounded-lg border border-dashed border-gray-300 bg-white p-4"
              >
                <h2 className="mb-2 text-lg font-medium">Carregar relatório XTB (XLSX)</h2>
                <p className="mb-3 text-sm text-gray-500">
                  Faz upload do relatório Excel (.xlsx) do XTB (Open Position). Os dados são
                  guardados em base de dados, não guardamos o ficheiro em si.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {isUploading ? "A carregar..." : "Upload"}
                  </button>
                </div>
              </form>

              <section className="flex-1 rounded-lg border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-medium">Os teus ficheiros</h2>
                  {isLoadingFiles && (
                    <span className="text-xs text-gray-500">A carregar...</span>
                  )}
                </div>
                {files.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Ainda não tens nenhum ficheiro XLSX carregado.
                  </p>
                ) : (
                  <ul className="divide-y text-sm">
                    {files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div>
                          <p className="font-medium">
                            {file.fileName}{" "}
                            {file.isActive && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                ativo
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(file.uploadedAt).toLocaleString()} ·{" "}
                            {file._count.assets} linhas
                          </p>
                        </div>
                        <button
                          onClick={() => handleSelectFile(file.id)}
                          className={`rounded px-3 py-1 text-xs font-medium ${
                            activeFileId === file.id
                              ? "bg-gray-800 text-white"
                              : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                          }`}
                        >
                          Ver na dashboard
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </section>
          )}

          {activeTab === "dashboard" && (
            <section className="flex-1 rounded-lg border bg-white p-4">
              {!activeFileId ? (
                <p className="text-sm text-gray-500">
                  Ainda não selecionaste nenhum ficheiro. Vai à tab &quot;Upload
                  XLSX&quot; para carregar ou escolher um ficheiro.
                </p>
              ) : (
                <div>
                  <h2 className="mb-4 text-lg font-medium">Dashboard</h2>
                  <DashboardCharts fileId={activeFileId} />
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
