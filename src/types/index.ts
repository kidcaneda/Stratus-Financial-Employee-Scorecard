// ============================================================
// Core domain types for the Stratus Employee Scorecard system.
// These mirror the Firestore collection structure.
// ============================================================

export type Role = "admin" | "manager" | "employee";

export type Period = "monthly" | "quarterly" | "yearly";

export type Status = "green" | "amber" | "red";

// A single user record (mirrors Firebase Auth + Firestore `users` doc)
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  // departmentId the user belongs to (managers/employees). Admins: null.
  departmentId: string | null;
}

// One measurable line item on a scorecard.
export interface Metric {
  id: string;
  name: string;
  target: number; // numeric target the actual is compared against
  unit: string; // "%", "$", "count", "days", etc.
  weight: number; // 0–1, weights across a department sum to 1
  // actuals keyed by period
  actual: Record<Period, number>;
  // higher-is-better (true) vs lower-is-better (false, e.g. error rate)
  higherIsBetter: boolean;
  // Pre-calculated 0–100 score per period, taken directly from the
  // source workbook when present. The scoring engine prefers this over
  // recomputing, because the sheet handles complex multi-period targets.
  score?: Record<Period, number>;
}

// A department's full scorecard.
export interface Department {
  id: string;
  name: string;
  managerName: string;
  metrics: Metric[];
}

// Computed score result for a metric or department in one period.
export interface ScoreResult {
  raw: number; // 0–100 attainment vs target
  weighted: number; // raw * weight (metric-level) or sum (dept-level)
  status: Status;
}

// Threshold config (editable in Settings, stored in Firestore `config` doc).
export interface Thresholds {
  green: number; // >= this => green   (default 90)
  amber: number; // >= this => amber   (default 70)
  // below amber => red
}

export const DEFAULT_THRESHOLDS: Thresholds = { green: 90, amber: 70 };

// Sync log entry produced by the /api/sync route.
export interface SyncLogEntry {
  sheet: string;
  metricsFound: number;
  status: "ok" | "skipped" | "error";
  message?: string;
}
