// ============================================================
// Core domain types for the Stratus Employee Scorecard system.
// These mirror the Firestore collection structure.
// ============================================================

export type Role = "admin" | "manager" | "supervisor" | "employee";

// "supervisor" and "manager" are the same privilege tier — some user
// profiles use one word, some the other. Typed as string so the server
// routes can pass raw token claims through it.
export function isDeptLead(role: string | null | undefined): boolean {
  return role === "manager" || role === "supervisor";
}

export type Period = "monthly" | "quarterly" | "yearly";

export type Status = "green" | "amber" | "red";

// Two scorecard formats exist in the source workbook:
//  - "kpi":        the standard 0–100, multi-period (monthly/quarterly/yearly) model
//  - "competency": a 1–5 rating review with weighted criteria and a band label
export type ScorecardType = "kpi" | "competency";

// A single user record (mirrors Firebase Auth + Firestore `users` doc)
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  // departmentId the user belongs to (managers/employees). Admins: null.
  departmentId: string | null;
}

// One criterion on a 1–5 competency scorecard.
export interface Criterion {
  id: string;
  number: string; // "1", "2", ... as shown in the sheet
  name: string; // the criterion label
  descriptor: string; // "What 'Good' Looks Like" text
  section: string; // "Operational Performance", "Behavioral", "Goals"
  weight: number; // 0–1
  score: number; // 1–5 raw rating
  weighted: number; // weight * score, as pre-calculated in the sheet
  comments: string;
}

// A 1–5 competency scorecard (e.g. Accounting). Single-period review.
export interface CompetencyCard {
  criteria: Criterion[];
  overall: number; // overall weighted score, out of 5.00
  band: string; // "Outstanding", "Exceeds", "Meets", etc.
}

// ============================================================
// Phase A: Employee entity. A department holds zero, one, or many
// employees; each employee carries their own scorecard data in the
// same shape as the department template (KPI metrics or competency).
// ============================================================
export interface Employee {
  id: string;
  name: string;
  email: string; // used later for evaluation notifications
  departmentId: string;
  role: string; // job title / role within the department
  evaluatorName: string; // the manager who evaluates this person
  // Auth uid of the supervisor/manager this person reports to. Drives the
  // "My Team" view (collection-group query) and per-report write access.
  // Stamped server-side when a lead creates the employee.
  evaluatorUid?: string;
  type: ScorecardType; // "kpi" or "competency", mirrors the department
  metrics: Metric[]; // populated when type === "kpi"
  competency?: CompetencyCard; // populated when type === "competency"
  // Phase D/E: links this employee record to a Firebase Auth account so
  // the person can log in and see/acknowledge only their own evaluations.
  linkedUid?: string;
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

// A department's full scorecard. Either a KPI card (metrics) or a
// competency card (criteria), distinguished by `type`. May also hold
// individual employees (Phase A) loaded from a subcollection.
export interface Department {
  id: string;
  name: string;
  managerName: string;
  evaluatorName?: string; // the designated evaluator (from the workbook POC)
  employeeCount?: number; // number of employees in the subcollection
  type: ScorecardType; // "kpi" (default) or "competency"
  metrics: Metric[]; // populated when type === "kpi"
  competency?: CompetencyCard; // populated when type === "competency"
  employees?: Employee[]; // hydrated client-side when needed
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

// ============================================================
// Phase B: write-path types (manager input, audit, assignments)
// ============================================================

// An audit record written on every evaluation create/update. Immutable
// once written; provides the "who changed what, when" trail required for
// a system that holds HR evaluation data.
export interface AuditEntry {
  id: string;
  action: "create_employee" | "update_employee" | "save_evaluation";
  actorUid: string; // who performed the write
  actorName: string;
  departmentId: string;
  employeeId: string;
  employeeName: string;
  period?: Period; // for evaluation saves
  timestamp: number; // epoch millis
  summary: string; // human-readable description
}

// Maps a manager (by uid) to the departments they may write to. Stored in
// Firestore `assignments/{uid}`. Editable in-app by an admin.
export interface ManagerAssignment {
  uid: string;
  managerName: string;
  departmentIds: string[];
}

// ============================================================
// Phase C: dated monthly time-series.
// Instead of one overwritten "monthly" number, each month's evaluation
// is its own record. Quarterly/yearly are COMPUTED by averaging the
// relevant months, never typed.
// ============================================================

// A year-month key, e.g. "2026-01". Sortable as a string.
export type MonthKey = string;

// One metric's recorded value for a single month.
export interface MonthlyMetricEntry {
  metricId: string;
  metricName: string;
  target: number;
  unit: string;
  weight: number;
  actual: number; // the actual recorded that month
  score: number; // 0–100 score recorded that month
}

// Employee response to an evaluation (Phase D).
export type AckStatus = "pending" | "acknowledged" | "disputed";

// A full monthly evaluation snapshot for one employee.
// Stored at departments/{deptId}/employees/{empId}/months/{monthKey}.
export interface MonthlyEvaluation {
  monthKey: MonthKey; // "2026-01"
  employeeId: string;
  departmentId: string;
  entries: MonthlyMetricEntry[];
  recordedBy: string; // actor uid
  recordedByName: string;
  recordedAt: number; // epoch millis
  // Phase D: employee acknowledgement / dispute flow.
  ackStatus?: AckStatus; // defaults to "pending" on creation
  employeeComment?: string;
  ackAt?: number; // when the employee responded
}

// Quarter identifier: 1–4.
export type Quarter = 1 | 2 | 3 | 4;

// The three months that compose each quarter (1-indexed month numbers).
export const QUARTER_MONTHS: Record<Quarter, number[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
};
