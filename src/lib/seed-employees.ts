import { Employee } from "@/types";

// ============================================================
// ⚠️  MOCK / PLACEHOLDER EMPLOYEES  ⚠️
// ------------------------------------------------------------
// Demonstrates the "mixed" cardinality: some departments have one
// employee, some have several. Evaluator names are the REAL POCs
// extracted from the workbook's Index sheet; employee names are
// invented placeholders. Real employees arrive via manager input
// (Phase B) or a future seed.
// ============================================================

let _e = 0;
const eid = () => `emp_${++_e}`;

// Helper to build a quick KPI employee from a few (name, score) metrics.
function kpiEmployee(
  deptId: string,
  name: string,
  evaluatorName: string,
  role: string,
  metricScores: { name: string; score: number }[]
): Employee {
  return {
    id: eid(),
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@stratus.finance`,
    departmentId: deptId,
    role,
    evaluatorName,
    type: "kpi",
    metrics: metricScores.map((m, i) => ({
      id: `m_${deptId}_${name.replace(/\s+/g, "")}_${i}`,
      name: m.name,
      target: 100,
      unit: "%",
      weight: 1 / metricScores.length,
      higherIsBetter: true,
      actual: { monthly: m.score, quarterly: m.score, yearly: m.score },
      score: { monthly: m.score, quarterly: m.score, yearly: m.score },
    })),
  };
}

// Keyed by departmentId. Departments not listed here have zero employees
// yet (they show the template only) — that's the valid "0 employees" case.
export const SEED_EMPLOYEES: Record<string, Employee[]> = {
  "loan-origination": [
    kpiEmployee("loan-origination", "Marco Reyes", "Ryan Albino", "Loan Officer", [
      { name: "Attendance Rate", score: 96 },
      { name: "Pull-Through Rate", score: 100 },
      { name: "Revenue per LO", score: 88 },
    ]),
    kpiEmployee("loan-origination", "Bea Santos", "Ryan Albino", "Loan Officer", [
      { name: "Attendance Rate", score: 92 },
      { name: "Pull-Through Rate", score: 78 },
      { name: "Revenue per LO", score: 70 },
    ]),
  ],
  underwriting: [
    kpiEmployee("underwriting", "Carlo Mendoza", "Ryan Albino", "Underwriter", [
      { name: "Attendance Rate", score: 100 },
      { name: "Application Completion", score: 100 },
      { name: "Rework Rate", score: 90 },
    ]),
  ],
  "svc-collections": [
    kpiEmployee("svc-collections", "Dana Cruz", "Mario Carlo Lucero", "Collections Agent", [
      { name: "Recovery Rate", score: 82 },
      { name: "Calls per Agent", score: 95 },
      { name: "Promise-to-Pay Kept", score: 60 },
    ]),
    kpiEmployee("svc-collections", "Leo Tan", "Mario Carlo Lucero", "Collections Agent", [
      { name: "Recovery Rate", score: 74 },
      { name: "Calls per Agent", score: 88 },
      { name: "Promise-to-Pay Kept", score: 55 },
    ]),
    kpiEmployee("svc-collections", "Rina Yu", "Mario Carlo Lucero", "Collections Agent", [
      { name: "Recovery Rate", score: 91 },
      { name: "Calls per Agent", score: 99 },
      { name: "Promise-to-Pay Kept", score: 72 },
    ]),
  ],
  // Single-employee department (the trivial case of "mixed").
  "capital-markets": [
    kpiEmployee("capital-markets", "Patrick Lim", "Lisa Nayre", "Markets Analyst", [
      { name: "Trade Settlement Accuracy", score: 99 },
      { name: "Portfolio Yield vs Benchmark", score: 103 },
    ]),
  ],
};

// Evaluator (manager) name per department, from the workbook Index sheet.
export const DEPT_EVALUATORS: Record<string, string> = {
  "loan-origination": "Ryan Albino",
  underwriting: "Ryan Albino",
  "capital-markets": "Lisa Nayre",
  "svc-collections": "Mario Carlo Lucero",
  "svc-payments": "Lalaine Manilay",
  "svc-quality-control": "Edson Laurel",
  "sales-gustavo": "Gustavo Sanchez-Sorondo",
  "sales-phebe": "Gustavo Sanchez-Sorondo",
  "sales-trish": "Gustavo Sanchez-Sorondo",
  "sales-camille": "Gustavo Sanchez-Sorondo",
  "sales-team-level-executive-kpi": "Gustavo Sanchez-Sorondo",
  "investor-relations": "Jannah Sta Cruz",
  "human-resources": "Cheryl Linato",
  operations: "Cheryl Linato",
  accounting: "Albert Lee / Ida Borinaga",
};
