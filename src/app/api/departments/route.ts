import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Criterion, Metric } from "@/types";
import { competencyBand } from "@/lib/scoring";

export const runtime = "nodejs";

// ============================================================
// POST /api/departments  (admin only)
// Updates a department's scorecard template, then propagates the new
// definitions to every employee record in the department — preserving
// each person's recorded values by id, zeroing new items, dropping
// removed ones. Dated month history is untouched (each month entry
// stores the weights it was recorded with).
//
// Body (one of):
//   { departmentId, metrics: Metric[] }        KPI template
//   { departmentId, criteria: Criterion[] }    competency template
// ============================================================

const zeroPeriods = { monthly: 0, quarterly: 0, yearly: 0 };

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let actorUid: string;
  let actorName: string;
  try {
    const d = await adminAuth().verifyIdToken(token);
    if (d.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can edit department metrics." },
        { status: 403 }
      );
    }
    actorUid = d.uid;
    actorName = (d.name as string) || d.email || "Admin";
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { departmentId, metrics, criteria } = body as {
    departmentId: string;
    metrics?: Metric[];
    criteria?: Criterion[];
  };
  if (!departmentId) {
    return NextResponse.json({ error: "Need departmentId." }, { status: 400 });
  }

  // ---- Competency template branch ----
  if (Array.isArray(criteria)) {
    return updateCompetencyTemplate(departmentId, criteria, actorUid, actorName);
  }

  if (!Array.isArray(metrics) || metrics.length === 0) {
    return NextResponse.json(
      { error: "Need a non-empty metrics (or criteria) array." },
      { status: 400 }
    );
  }
  for (const m of metrics) {
    if (!m.id || typeof m.id !== "string" || !m.name || typeof m.name !== "string") {
      return NextResponse.json({ error: "Every metric needs an id and a name." }, { status: 400 });
    }
    if (typeof m.target !== "number" || typeof m.weight !== "number" || m.weight < 0) {
      return NextResponse.json(
        { error: `Metric "${m.name}": target and weight must be numbers (weight ≥ 0).` },
        { status: 400 }
      );
    }
  }
  const ids = metrics.map((m) => m.id);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Metric ids must be unique." }, { status: 400 });
  }

  const deptRef = adminDb().collection("departments").doc(departmentId);
  const deptSnap = await deptRef.get();
  if (!deptSnap.exists) {
    return NextResponse.json({ error: `Department "${departmentId}" not found.` }, { status: 404 });
  }

  // Normalize the template: keep the department-level actual/score series
  // that already exist for a metric id, zero brand-new metrics.
  const priorTemplate: Metric[] = deptSnap.data()?.metrics ?? [];
  const template = metrics.map((m) => {
    const prior = priorTemplate.find((p) => p.id === m.id);
    return {
      id: m.id,
      name: m.name,
      target: m.target,
      unit: m.unit ?? "",
      weight: m.weight,
      higherIsBetter: m.higherIsBetter !== false,
      actual: prior?.actual ?? { ...zeroPeriods },
      score: prior?.score ?? { ...zeroPeriods },
    };
  });

  try {
    await deptRef.set({ metrics: template }, { merge: true });

    // Propagate the new definitions to the department's employees,
    // preserving each person's recorded values by metric id.
    const empSnap = await deptRef.collection("employees").get();
    const batch = adminDb().batch();
    let touched = 0;
    for (const doc of empSnap.docs) {
      const emp = doc.data();
      if (emp.type === "competency") continue;
      const empMetrics = (emp.metrics ?? []) as Metric[];
      const rebuilt = template.map((t) => {
        const prior = empMetrics.find((p) => p.id === t.id);
        return {
          ...t,
          actual: prior?.actual ?? { ...zeroPeriods },
          score: prior?.score ?? { ...zeroPeriods },
        };
      });
      batch.set(doc.ref, { metrics: rebuilt }, { merge: true });
      touched++;
    }
    await batch.commit();

    const auditRef = adminDb().collection("audit").doc();
    await auditRef.set({
      id: auditRef.id,
      action: "update_employee",
      actorUid,
      actorName,
      departmentId,
      employeeId: departmentId,
      employeeName: `${touched} employee record(s)`,
      timestamp: Date.now(),
      summary: `${actorName} edited the ${departmentId} metric template (${template.length} metrics), propagated to ${touched} employee(s)`,
    });

    return NextResponse.json({ ok: true, metrics: template.length, employeesUpdated: touched });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }
}

// Update a competency department's criteria template and rebuild every
// employee's competency card against it — each person's recorded ratings
// and comments are preserved by criterion id; new criteria start unrated.
async function updateCompetencyTemplate(
  departmentId: string,
  criteria: Criterion[],
  actorUid: string,
  actorName: string
) {
  if (criteria.length === 0) {
    return NextResponse.json(
      { error: "A competency department needs at least one criterion." },
      { status: 400 }
    );
  }
  for (const c of criteria) {
    if (!c.id || typeof c.id !== "string" || !c.name || typeof c.name !== "string") {
      return NextResponse.json(
        { error: "Every criterion needs an id and a name." },
        { status: 400 }
      );
    }
    if (typeof c.weight !== "number" || c.weight < 0) {
      return NextResponse.json(
        { error: `Criterion "${c.name}": weight must be a number ≥ 0.` },
        { status: 400 }
      );
    }
  }
  const ids = criteria.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Criterion ids must be unique." }, { status: 400 });
  }

  const deptRef = adminDb().collection("departments").doc(departmentId);
  const deptSnap = await deptRef.get();
  if (!deptSnap.exists) {
    return NextResponse.json({ error: `Department "${departmentId}" not found.` }, { status: 404 });
  }

  // The template itself is unrated: numbers renumbered in order, scores 0.
  const template: Criterion[] = criteria.map((c, i) => ({
    id: c.id,
    number: String(i + 1),
    name: c.name,
    descriptor: c.descriptor ?? "",
    section: c.section ?? "",
    weight: c.weight,
    score: 0,
    weighted: 0,
    comments: "",
  }));

  try {
    await deptRef.set(
      { type: "competency", competency: { criteria: template, overall: 0, band: "" } },
      { merge: true }
    );

    const empSnap = await deptRef.collection("employees").get();
    const batch = adminDb().batch();
    let touched = 0;
    for (const doc of empSnap.docs) {
      const emp = doc.data();
      if (emp.type !== "competency") continue;
      const prior: Criterion[] = emp.competency?.criteria ?? [];
      const rebuilt = template.map((t) => {
        const p = prior.find((x) => x.id === t.id);
        const score = p?.score ?? 0;
        return { ...t, score, weighted: t.weight * score, comments: p?.comments ?? "" };
      });
      const overall = rebuilt.reduce((s, c) => s + c.weighted, 0);
      batch.set(
        doc.ref,
        {
          competency: {
            criteria: rebuilt,
            overall,
            band: overall > 0 ? competencyBand(overall) : "",
          },
        },
        { merge: true }
      );
      touched++;
    }
    await batch.commit();

    const auditRef = adminDb().collection("audit").doc();
    await auditRef.set({
      id: auditRef.id,
      action: "update_employee",
      actorUid,
      actorName,
      departmentId,
      employeeId: departmentId,
      employeeName: `${touched} employee record(s)`,
      timestamp: Date.now(),
      summary: `${actorName} edited the ${departmentId} competency criteria (${template.length} criteria), propagated to ${touched} employee(s)`,
    });

    return NextResponse.json({ ok: true, criteria: template.length, employeesUpdated: touched });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }
}
