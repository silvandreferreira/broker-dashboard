"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useCache } from "../contexts/CacheContext";

export function FinanzaNavbar() {
  const { data: session, status } = useSession();
  const { clearCache } = useCache();
  const [navOpen, setNavOpen] = useState(false);

  const handleClearCache = () => {
    clearCache();
    setNavOpen(false);
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary sticky-top shadow-sm">
      <div className="container">
        <Link className="navbar-brand fw-bold d-flex align-items-center" href="/">
          <i className="bi bi-graph-up-arrow me-2" />
          Finanza
        </Link>
        <button
          className="navbar-toggler border-0"
          type="button"
          onClick={() => setNavOpen(!navOpen)}
          aria-expanded={navOpen}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div className={`collapse navbar-collapse ${navOpen ? "show" : ""}`}>
          <ul className="navbar-nav ms-auto align-items-lg-center gap-2">
            {status === "loading" ? (
              <li className="nav-item">
                <span className="nav-link">A carregar...</span>
              </li>
            ) : session ? (
              <>
                <li className="nav-item">
                  <span className="nav-link text-white-50 small">
                    Olá, <strong className="text-white">{session.user?.name ?? "Utilizador"}</strong>
                  </span>
                </li>
                <li className="nav-item">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={handleClearCache}
                    title="Limpar cache e voltar a carregar dados do servidor"
                  >
                    <i className="bi bi-arrow-clockwise me-1" />
                    Limpar cache
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => signOut()}
                  >
                    <i className="bi bi-box-arrow-right me-1" />
                    Sair
                  </button>
                </li>
              </>
            ) : (
              <li className="nav-item">
                <button
                  type="button"
                  className="btn btn-warning text-dark fw-semibold"
                  onClick={() => signIn("google")}
                >
                  <i className="bi bi-google me-1" />
                  Entrar com Google
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
