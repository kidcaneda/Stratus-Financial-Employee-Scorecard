import { Department, Employee, MonthlyEvaluation, Period, Status } from "@/types";
import { scoreEmployee, scoreDepartment, statusFor, fmt } from "@/lib/scoring";
import { scoreMonth, parseMonthKey, MONTH_NAMES } from "@/lib/rollup";

// ============================================================
// One report model, four renderers. Excel, PowerPoint, Word and the
// print/PDF view all read this — so the numbers can't disagree between
// the deck an executive sees and the workbook they check it against.
// ============================================================

export interface ReportEmployee {
  name: string;
  role: string;
  email: string;
  departmentId: string;
  departmentName: string;
  evaluatorName: string;
  score: number;
  status: Status;
  coverage: "Scored this month" | "Stale" | "Never scored";
  lastScored: string; // "Jul 2026" or ""
  monthsRecorded: number;
  challenged: boolean;
}

export interface ReportDepartment {
  id: string;
  name: string;
  managerName: string;
  type: "kpi" | "competency";
  score: number;
  status: Status;
  headcount: number;
  scoredThisMonth: number;
  employees: ReportEmployee[];
}

export interface ReportModel {
  title: string;
  periodLabel: string;
  generatedAt: string;
  scopeLabel: string;
  org: {
    score: number;
    status: Status;
    departments: number;
    headcount: number;
    green: number;
    amber: number;
    red: number;
    scoredThisMonth: number;
    stale: number;
    neverScored: number;
    coveragePct: number;
    openChallenges: number;
  };
  departments: ReportDepartment[];
  topPerformers: ReportEmployee[];
  needsAttention: ReportEmployee[];
  trend: { label: string; score: number }[];
}

const monthLabel = (key: string) => {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

export function buildReport(opts: {
  departments: Department[];
  employees: Employee[];
  months: MonthlyEvaluation[];
  period: Period;
  scopeLabel: string;
}): ReportModel {
  const { departments, employees, months, period, scopeLabel } = opts;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  const monthsByEmployee = new Map<string, MonthlyEvaluation[]>();
  for (const m of months) {
    const key = `${m.departmentId}/${m.employeeId}`;
    monthsByEmployee.set(key, [...(monthsByEmployee.get(key) ?? []), m]);
  }

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const reportEmployees: ReportEmployee[] = employees.map((e) => {
    const res = scoreEmployee(e, period);
    const own = (monthsByEmployee.get(`${e.departmentId}/${e.id}`) ?? []).sort(
      (a, b) => a.monthKey.localeCompare(b.monthKey)
    );
    const last = own[own.length - 1];
    const coverage: ReportEmployee["coverage"] = !e.updatedAt
      ? "Never scored"
      : e.updatedAt >= monthStartMs
      ? "Scored this month"
      : "Stale";
    return {
      name: e.name,
      role: e.role,
      email: e.email,
      departmentId: e.departmentId,
      departmentName: deptName(e.departmentId),
      evaluatorName: e.evaluatorName ?? "",
      score: res.raw,
      status: res.status,
      coverage,
      lastScored: last ? monthLabel(last.monthKey) : "",
      monthsRecorded: own.length,
      challenged: own.some((m) => m.ackStatus === "disputed" && !m.resolution),
    };
  });

  const reportDepartments: ReportDepartment[] = departments
    .map((d) => {
      const staff = reportEmployees.filter((e) => e.departmentId === d.id);
      // A department's figure is the average of its people when it has
      // any; otherwise the department template's own score.
      const score = staff.length
        ? staff.reduce((s, e) => s + e.score, 0) / staff.length
        : scoreDepartment(d, period).raw;
      return {
        id: d.id,
        name: d.name,
        managerName: d.managerName || d.evaluatorName || "—",
        type: (d.type ?? "kpi") as "kpi" | "competency",
        score,
        status: statusFor(score),
        headcount: staff.length,
        scoredThisMonth: staff.filter((e) => e.coverage === "Scored this month").length,
        employees: [...staff].sort((a, b) => b.score - a.score),
      };
    })
    .sort((a, b) => b.score - a.score);

  const withPeople = reportDepartments.filter((d) => d.headcount > 0);
  const orgScore = withPeople.length
    ? withPeople.reduce((s, d) => s + d.score, 0) / withPeople.length
    : 0;

  // Organisation trend: average of every month recorded, by month.
  const byMonth = new Map<string, number[]>();
  for (const m of months) {
    byMonth.set(m.monthKey, [...(byMonth.get(m.monthKey) ?? []), scoreMonth(m)]);
  }
  const trend = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([key, scores]) => ({
      label: monthLabel(key),
      score: scores.reduce((s, v) => s + v, 0) / scores.length,
    }));

  const scored = reportEmployees.filter((e) => e.coverage === "Scored this month").length;

  return {
    title: "Employee Performance Report",
    periodLabel: period.charAt(0).toUpperCase() + period.slice(1),
    generatedAt: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    scopeLabel,
    org: {
      score: orgScore,
      status: statusFor(orgScore),
      departments: withPeople.length,
      headcount: reportEmployees.length,
      green: withPeople.filter((d) => d.status === "green").length,
      amber: withPeople.filter((d) => d.status === "amber").length,
      red: withPeople.filter((d) => d.status === "red").length,
      scoredThisMonth: scored,
      stale: reportEmployees.filter((e) => e.coverage === "Stale").length,
      neverScored: reportEmployees.filter((e) => e.coverage === "Never scored").length,
      coveragePct: reportEmployees.length
        ? (scored / reportEmployees.length) * 100
        : 0,
      openChallenges: reportEmployees.filter((e) => e.challenged).length,
    },
    departments: reportDepartments,
    topPerformers: reportEmployees
      .filter((e) => e.monthsRecorded > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    needsAttention: reportEmployees
      .filter((e) => e.monthsRecorded > 0 && e.status !== "green")
      .sort((a, b) => a.score - b.score)
      .slice(0, 10),
    trend,
  };
}

// Shared formatting helpers for the renderers.
export const STATUS_LABEL: Record<Status, string> = {
  green: "On track",
  amber: "At risk",
  red: "Off track",
};

export const STATUS_HEX: Record<Status, string> = {
  green: "22C55E",
  amber: "F59E0B",
  red: "EF4444",
};

export const score1 = (n: number) => fmt(n, 1);
