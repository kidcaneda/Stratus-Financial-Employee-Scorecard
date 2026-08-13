import { AuditEntry, Department, Employee, MonthlyEvaluation } from "@/types";
import { scoreMonth, parseMonthKey, MONTH_NAMES } from "@/lib/rollup";

// ============================================================
// Monthly compliance model — the audit artifact, distinct from the
// performance report. It answers control questions rather than "how did
// we do": was every employee evaluated for the period, by whom, on
// time, was the employee informed, and were disputes resolved.
//
// "On time" means recorded on or before the cut-off day of the month
// FOLLOWING the period (default the 10th). Change ON_TIME_DAY_OF_MONTH
// if the close deadline moves.
// ============================================================

export const ON_TIME_DAY_OF_MONTH = 10;

export type AckState = "acknowledged" | "disputed" | "pending" | "not recorded";

export interface ComplianceRow {
  name: string;
  role: string;
  email: string;
  departmentId: string;
  departmentName: string;
  evaluatorName: string;
  recorded: boolean;
  recordedByName: string;
  recordedOn: string; // "12 Aug 2026" or ""
  onTime: boolean | null; // null when nothing was recorded
  daysLate: number;
  ack: AckState;
  challengeOpen: boolean;
  resolution: "upheld" | "revised" | null;
  score: number | null;
}

export interface ComplianceGroup {
  key: string;
  name: string;
  expected: number;
  recorded: number;
  completionPct: number;
  missing: string[];
}

export interface ComplianceModel {
  monthKey: string;
  monthLabel: string;
  generatedAt: string;
  scopeLabel: string;
  onTimeCutoff: string;
  totals: {
    expected: number;
    recorded: number;
    missing: number;
    completionPct: number;
    onTime: number;
    late: number;
    acknowledged: number;
    pending: number;
    challenged: number;
    challengesOpen: number;
    challengesResolved: number;
    acknowledgementPct: number;
  };
  byDepartment: ComplianceGroup[];
  byEvaluator: ComplianceGroup[];
  rows: ComplianceRow[];
  missingRows: ComplianceRow[];
  exceptions: ComplianceRow[]; // late, unacknowledged or disputed
  auditTrail: { when: string; actor: string; action: string; summary: string }[];
}

const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function monthOptions(months: MonthlyEvaluation[], count = 18): string[] {
  const now = new Date();
  const keys = new Set<string>(months.map((m) => m.monthKey));
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function monthKeyLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function buildCompliance(opts: {
  departments: Department[];
  employees: Employee[];
  months: MonthlyEvaluation[];
  audit: AuditEntry[];
  monthKey: string;
  scopeLabel: string;
}): ComplianceModel {
  const { departments, employees, months, audit, monthKey, scopeLabel } = opts;
  const { year, month } = parseMonthKey(monthKey);

  // Deadline: the cut-off day of the following month, end of day.
  const cutoff = new Date(year, month, ON_TIME_DAY_OF_MONTH, 23, 59, 59).getTime();
  // Audit-trail window: the period month plus its close month.
  const windowStart = new Date(year, month - 1, 1).getTime();
  const windowEnd = new Date(year, month + 1, 1).getTime();

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const forMonth = new Map<string, MonthlyEvaluation>();
  for (const m of months) {
    if (m.monthKey === monthKey) forMonth.set(`${m.departmentId}/${m.employeeId}`, m);
  }

  const rows: ComplianceRow[] = employees.map((e) => {
    const rec = forMonth.get(`${e.departmentId}/${e.id}`);
    const recordedAt = rec?.recordedAt ?? 0;
    const late = rec ? recordedAt > cutoff : false;
    const ack: AckState = !rec
      ? "not recorded"
      : rec.ackStatus === "acknowledged"
      ? "acknowledged"
      : rec.ackStatus === "disputed"
      ? "disputed"
      : "pending";
    return {
      name: e.name,
      role: e.role,
      email: e.email,
      departmentId: e.departmentId,
      departmentName: deptName(e.departmentId),
      evaluatorName: e.evaluatorName || "—",
      recorded: !!rec,
      recordedByName: rec?.recordedByName ?? "",
      recordedOn: recordedAt ? dateLabel(recordedAt) : "",
      onTime: rec ? !late : null,
      daysLate:
        rec && late ? Math.ceil((recordedAt - cutoff) / (1000 * 60 * 60 * 24)) : 0,
      ack,
      challengeOpen: !!rec && rec.ackStatus === "disputed" && !rec.resolution,
      resolution: rec?.resolution?.outcome ?? null,
      score: rec ? scoreMonth(rec) : null,
    };
  });

  const group = (
    keyOf: (r: ComplianceRow) => string,
    nameOf: (r: ComplianceRow) => string
  ): ComplianceGroup[] => {
    const map = new Map<string, ComplianceGroup>();
    for (const r of rows) {
      const key = keyOf(r);
      const g =
        map.get(key) ??
        ({ key, name: nameOf(r), expected: 0, recorded: 0, completionPct: 0, missing: [] } as ComplianceGroup);
      g.expected++;
      if (r.recorded) g.recorded++;
      else g.missing.push(r.name);
      map.set(key, g);
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        completionPct: g.expected ? (g.recorded / g.expected) * 100 : 0,
      }))
      .sort((a, b) => a.completionPct - b.completionPct || a.name.localeCompare(b.name));
  };

  const recorded = rows.filter((r) => r.recorded);
  const acknowledged = rows.filter((r) => r.ack === "acknowledged").length;
  const challenged = rows.filter((r) => r.ack === "disputed").length;

  const auditTrail = audit
    .filter((a) => a.timestamp >= windowStart && a.timestamp < windowEnd)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 200)
    .map((a) => ({
      when: dateLabel(a.timestamp),
      actor: a.actorName,
      action: a.action,
      summary: a.summary,
    }));

  return {
    monthKey,
    monthLabel: monthKeyLabel(monthKey),
    generatedAt: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    scopeLabel,
    onTimeCutoff: `${ON_TIME_DAY_OF_MONTH} ${
      MONTH_NAMES[month % 12]
    } ${month === 12 ? year + 1 : year}`,
    totals: {
      expected: rows.length,
      recorded: recorded.length,
      missing: rows.length - recorded.length,
      completionPct: rows.length ? (recorded.length / rows.length) * 100 : 0,
      onTime: recorded.filter((r) => r.onTime).length,
      late: recorded.filter((r) => r.onTime === false).length,
      acknowledged,
      pending: rows.filter((r) => r.ack === "pending").length,
      challenged,
      challengesOpen: rows.filter((r) => r.challengeOpen).length,
      challengesResolved: rows.filter((r) => r.ack === "disputed" && r.resolution).length,
      acknowledgementPct: recorded.length
        ? ((acknowledged + challenged) / recorded.length) * 100
        : 0,
    },
    byDepartment: group((r) => r.departmentId, (r) => r.departmentName),
    byEvaluator: group((r) => r.evaluatorName, (r) => r.evaluatorName),
    rows: [...rows].sort(
      (a, b) =>
        Number(a.recorded) - Number(b.recorded) ||
        a.departmentName.localeCompare(b.departmentName) ||
        a.name.localeCompare(b.name)
    ),
    missingRows: rows.filter((r) => !r.recorded),
    exceptions: rows.filter(
      (r) => r.onTime === false || r.challengeOpen || (r.recorded && r.ack === "pending")
    ),
    auditTrail,
  };
}
