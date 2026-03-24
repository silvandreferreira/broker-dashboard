"use client";

import { useEffect, useMemo, useState } from "react";
import { ADMIN_EMAIL } from "@/lib/access";

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  accessApproved: boolean;
  accessRequestedAt: string;
  accessApprovedAt: string | null;
};

export function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<
    "requestedDesc" | "nameAsc" | "emailAsc" | "approvedFirst" | "pendingFirst"
  >("requestedDesc");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    const normalize = (s: string | null) => (s ?? "").trim().toLowerCase();
    const asTime = (iso: string) => new Date(iso).getTime();

    const mapped = users.map((u) => ({
      ...u,
      isAdmin: normalize(u.email) === normalize(ADMIN_EMAIL),
    }));

    const sorted = [...mapped].sort((a, b) => {
      // Keep admin always on top for clarity.
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;

      if (sortBy === "requestedDesc") {
        return asTime(b.accessRequestedAt) - asTime(a.accessRequestedAt);
      }
      if (sortBy === "nameAsc") {
        return normalize(a.name).localeCompare(normalize(b.name));
      }
      if (sortBy === "emailAsc") {
        return normalize(a.email).localeCompare(normalize(b.email));
      }
      if (sortBy === "approvedFirst") {
        const aApproved = a.isAdmin ? true : a.accessApproved;
        const bApproved = b.isAdmin ? true : b.accessApproved;
        if (aApproved !== bApproved) {
          return aApproved ? -1 : 1;
        }
        return asTime(b.accessRequestedAt) - asTime(a.accessRequestedAt);
      }
      // pendingFirst
      const aApproved = a.isAdmin ? true : a.accessApproved;
      const bApproved = b.isAdmin ? true : b.accessApproved;
      if (aApproved !== bApproved) {
        return aApproved ? 1 : -1;
      }
      return asTime(b.accessRequestedAt) - asTime(a.accessRequestedAt);
    });

    return sorted.map((u) => ({
      ...u,
      accessApproved: u.isAdmin ? true : u.accessApproved,
      statusLabel: u.isAdmin ? "Admin" : u.accessApproved ? "Approved" : "Pending",
    }));
  }, [users, sortBy]);

  const toggle = async (userId: string, approved: boolean) => {
    if (savingUserId) return;
    setSavingUserId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, approved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update user");
      }
      const data = (await res.json()) as { user: AdminUser };
      setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (savingUserId) return;
    if (
      !window.confirm(
        "Remove this user from the database? They can sign in again later as a new registration.",
      )
    ) {
      return;
    }
    setSavingUserId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to delete user");
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="card border shadow-sm">
      <div className="card-header bg-white d-flex align-items-center justify-content-between">
        <div>
          <h2 className="h6 mb-0">Admin</h2>
          <div className="small text-muted">Users who tried to sign in</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted d-none d-md-inline">Sort</span>
            <select
              className="form-select form-select-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              style={{ maxWidth: 220 }}
            >
              <option value="requestedDesc">Most recent request</option>
              <option value="nameAsc">Alphabetical (name)</option>
              <option value="emailAsc">Alphabetical (email)</option>
              <option value="approvedFirst">Approved first</option>
              <option value="pendingFirst">Pending first</option>
            </select>
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise me-1" />
            Refresh
          </button>
        </div>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        {loading ? (
          <div className="d-flex align-items-center text-secondary">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading…
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td className="text-truncate" style={{ maxWidth: 220 }} title={u.name ?? ""}>
                      {u.name ?? "—"}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: 260 }} title={u.email ?? ""}>
                      {u.email ?? "—"}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          u.statusLabel === "Admin"
                            ? "bg-primary"
                            : u.accessApproved
                              ? "bg-success"
                              : "bg-warning text-dark"
                        }`}
                      >
                        {u.statusLabel}
                      </span>
                    </td>          <td className="text-end">
            <div className="d-flex justify-content-end align-items-center gap-2">
              <div className="form-check form-switch d-inline-flex align-items-center justify-content-end gap-2 mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={u.accessApproved}
                  disabled={savingUserId !== null || u.statusLabel === "Admin"}
                  onChange={(e) => void toggle(u.id, e.target.checked)}
                />
                {savingUserId === u.id && (
                  <span className="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true" />
                )}
              </div>
              {u.statusLabel !== "Admin" && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={savingUserId !== null}
                  onClick={() => void handleDeleteUser(u.id)}
                  aria-label="Delete user"
                >
                  <i className="bi bi-trash" />
                </button>
              )}
            </div>
          </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

