import type { AdminAccountResponse, AdminAccountsResponse, AdminOverviewResponse, FollowsResponse, FunnelResponse, ReportResponseOk, ScanResponseError, ScanResponseOk, ScansResponse, ShareResponse } from "gateseeker/dist/web/handler.js";

export type { AdminAccountResponse, AdminAccountsResponse, AdminOverviewResponse, FollowView, FollowsResponse, FunnelResponse, PublicReport, ReportResponseOk, SavedScan, ScanHistoryEntry, ScanResponseError, ScanResponseOk, ScansResponse, ShareResponse } from "gateseeker/dist/web/handler.js";
export type { Finding } from "gateseeker/dist/types.js";

export type ScanOutcome = ScanResponseOk | ScanResponseError;
export type ReportOutcome = ReportResponseOk | ScanResponseError;

async function call<T>(input: string, init: RequestInit, token: string | null): Promise<T | ScanResponseError> {
  try {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(input, { ...init, headers });
    const text = await res.text();
    try {
      return JSON.parse(text) as T | ScanResponseError;
    } catch {
      return { ok: false, error: { code: "upstream-error", message: `The service answered HTTP ${String(res.status)} without a readable body.` } };
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: { code: "timeout", message: "The request was cancelled." } };
    return { ok: false, error: { code: "upstream-error", message: "The service could not be reached. Check your connection and try again." } };
  }
}

/** Calls the service. Network failures and non-JSON answers become a client-side error object, never an exception. */
export function scanRepository(url: string, token: string | null, signal?: AbortSignal): Promise<ScanOutcome> {
  return call<ScanResponseOk>("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }), ...(signal ? { signal } : {}) }, token);
}

/** The signed-in account's analysis history, newest first. */
export function fetchScans(token: string): Promise<ScansResponse | ScanResponseError> {
  return call<ScansResponse>("/api/scans", { method: "GET" }, token);
}

/** Followed repositories of the signed-in account; POST follows and DELETE unfollows {owner, repo}. */
export function callFollows(method: "GET" | "POST" | "DELETE", token: string, target?: { owner: string; repo: string }): Promise<FollowsResponse | ScanResponseError> {
  return call<FollowsResponse>("/api/follows", { method, ...(target ? { headers: { "content-type": "application/json" }, body: JSON.stringify(target) } : {}) }, token);
}

/** A saved report of the signed-in account. */
export function fetchReport(id: string, token: string): Promise<ReportOutcome> {
  return call<ReportResponseOk>(`/api/reports/${encodeURIComponent(id)}`, { method: "GET" }, token);
}

/** The example repository's report, for visitors who have not signed in. */
export function fetchExample(signal?: AbortSignal): Promise<ScanOutcome> {
  return call<ScanResponseOk>("/api/example", { method: "GET", ...(signal ? { signal } : {}) }, null);
}

/** A report its owner shared; no session. */
export function fetchPublicReport(id: string): Promise<ReportOutcome> {
  return call<ReportResponseOk>(`/api/public/${encodeURIComponent(id)}`, { method: "GET" }, null);
}

/** Shares (POST) or unshares (DELETE) one of the signed-in account's reports. */
export function shareReport(id: string, token: string, share: boolean): Promise<ShareResponse | ScanResponseError> {
  return call<ShareResponse>(`/api/reports/${encodeURIComponent(id)}/share`, { method: share ? "POST" : "DELETE" }, token);
}

/** Product counters; 404 for everyone but the configured admin logins. */
export function fetchFunnel(token: string): Promise<FunnelResponse | ScanResponseError> {
  return call<FunnelResponse>("/api/funnel", { method: "GET" }, token);
}

/** Admin master (docs/SPRINT_7.md): 404 for everyone but the configured admin logins. */
export function fetchAdminOverview(token: string): Promise<AdminOverviewResponse | ScanResponseError> {
  return call<AdminOverviewResponse>("/api/admin/overview", { method: "GET" }, token);
}

export function fetchAdminAccounts(token: string, before: string | null): Promise<AdminAccountsResponse | ScanResponseError> {
  return call<AdminAccountsResponse>(`/api/admin/accounts${before ? `?before=${encodeURIComponent(before)}` : ""}`, { method: "GET" }, token);
}

export function fetchAdminAccount(token: string, id: string): Promise<AdminAccountResponse | ScanResponseError> {
  return call<AdminAccountResponse>(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: "GET" }, token);
}

/** Deletes the signed-in account and everything the service keeps for it; `confirm` is the GitHub login as typed. */
export function deleteAccount(token: string, confirm: string): Promise<{ ok: true } | ScanResponseError> {
  return call<{ ok: true }>("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) }, token);
}
