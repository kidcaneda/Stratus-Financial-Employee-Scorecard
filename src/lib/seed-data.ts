import { Department } from "@/types";

// ============================================================
// ⚠️  MOCK / PLACEHOLDER DATA  ⚠️
// ------------------------------------------------------------
// This is illustrative seed data so the app runs end-to-end.
// It mirrors the 10 departments referenced in the original
// "Stratus Financial Employee Scorecard.xlsx" but the metric
// names, targets, weights, and actuals are INVENTED.
//
// Replace this by running the Excel sync (/admin/sync) against
// the real workbook, which writes real values to Firestore.
// Every value below should be treated as a swap-me placeholder.
// ============================================================

let _id = 0;
const mid = () => `m_${++_id}`;

export const SEED_DEPARTMENTS: Department[] = [
  {
    id: "loan-origination",
    name: "Loan Origination",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Applications processed", target: 500, unit: "count", weight: 0.3, higherIsBetter: true, actual: { monthly: 480, quarterly: 470, yearly: 455 } },
      { id: mid(), name: "Avg. cycle time", target: 7, unit: "days", weight: 0.3, higherIsBetter: false, actual: { monthly: 6.5, quarterly: 7.2, yearly: 7.5 } },
      { id: mid(), name: "Approval accuracy", target: 98, unit: "%", weight: 0.4, higherIsBetter: true, actual: { monthly: 96, quarterly: 95, yearly: 94 } },
    ],
  },
  {
    id: "underwriting",
    name: "Underwriting",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Files underwritten", target: 320, unit: "count", weight: 0.35, higherIsBetter: true, actual: { monthly: 310, quarterly: 300, yearly: 295 } },
      { id: mid(), name: "Decision turnaround", target: 48, unit: "hours", weight: 0.35, higherIsBetter: false, actual: { monthly: 44, quarterly: 50, yearly: 52 } },
      { id: mid(), name: "Quality score", target: 95, unit: "%", weight: 0.3, higherIsBetter: true, actual: { monthly: 92, quarterly: 90, yearly: 89 } },
    ],
  },
  {
    id: "svc-collections",
    name: "SVC-Collections",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Recovery rate", target: 85, unit: "%", weight: 0.4, higherIsBetter: true, actual: { monthly: 78, quarterly: 76, yearly: 74 } },
      { id: mid(), name: "Calls per agent", target: 120, unit: "count", weight: 0.3, higherIsBetter: true, actual: { monthly: 115, quarterly: 110, yearly: 108 } },
      { id: mid(), name: "Promise-to-pay kept", target: 70, unit: "%", weight: 0.3, higherIsBetter: true, actual: { monthly: 60, quarterly: 58, yearly: 55 } },
    ],
  },
  {
    id: "svc-payments",
    name: "SVC-Payments",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Payments posted on time", target: 99, unit: "%", weight: 0.5, higherIsBetter: true, actual: { monthly: 98, quarterly: 97.5, yearly: 97 } },
      { id: mid(), name: "Posting error rate", target: 0.5, unit: "%", weight: 0.5, higherIsBetter: false, actual: { monthly: 0.4, quarterly: 0.6, yearly: 0.7 } },
    ],
  },
  {
    id: "svc-qc",
    name: "SVC-QC",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Audits completed", target: 200, unit: "count", weight: 0.4, higherIsBetter: true, actual: { monthly: 195, quarterly: 190, yearly: 185 } },
      { id: mid(), name: "Defects caught", target: 90, unit: "%", weight: 0.6, higherIsBetter: true, actual: { monthly: 88, quarterly: 87, yearly: 85 } },
    ],
  },
  {
    id: "capital-markets",
    name: "Capital Markets",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Trade settlement accuracy", target: 99.5, unit: "%", weight: 0.5, higherIsBetter: true, actual: { monthly: 99.6, quarterly: 99.4, yearly: 99.2 } },
      { id: mid(), name: "Portfolio yield vs benchmark", target: 100, unit: "%", weight: 0.5, higherIsBetter: true, actual: { monthly: 103, quarterly: 101, yearly: 100 } },
    ],
  },
  {
    id: "investor-relations",
    name: "Investor Relations",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Reports delivered on time", target: 100, unit: "%", weight: 0.5, higherIsBetter: true, actual: { monthly: 100, quarterly: 98, yearly: 96 } },
      { id: mid(), name: "Investor satisfaction", target: 90, unit: "%", weight: 0.5, higherIsBetter: true, actual: { monthly: 92, quarterly: 91, yearly: 90 } },
    ],
  },
  {
    id: "hr",
    name: "Human Resources",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Time to fill", target: 30, unit: "days", weight: 0.4, higherIsBetter: false, actual: { monthly: 28, quarterly: 33, yearly: 35 } },
      { id: mid(), name: "Retention rate", target: 90, unit: "%", weight: 0.6, higherIsBetter: true, actual: { monthly: 87, quarterly: 86, yearly: 85 } },
    ],
  },
  {
    id: "operations",
    name: "Operations",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "SLA adherence", target: 95, unit: "%", weight: 0.5, higherIsBetter: true, actual: { monthly: 93, quarterly: 92, yearly: 91 } },
      { id: mid(), name: "Cost per transaction", target: 5, unit: "$", weight: 0.5, higherIsBetter: false, actual: { monthly: 4.8, quarterly: 5.2, yearly: 5.4 } },
    ],
  },
  {
    id: "sales-gustavo",
    name: "Sales — Gustavo",
    managerName: "[Manager name — placeholder]",
    type: "kpi",
    metrics: [
      { id: mid(), name: "Revenue vs quota", target: 100, unit: "%", weight: 0.6, higherIsBetter: true, actual: { monthly: 112, quarterly: 105, yearly: 98 } },
      { id: mid(), name: "New accounts", target: 40, unit: "count", weight: 0.4, higherIsBetter: true, actual: { monthly: 45, quarterly: 42, yearly: 38 } },
    ],
  },
];
