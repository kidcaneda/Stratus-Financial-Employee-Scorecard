import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// ============================================================
// Imports the company employee roster into Firestore. The workbook is
// the single source of truth — there is no mapping in this file to keep
// in sync. It reads, per row:
//
//   Name / Stratus Email Address / Position   → the person
//   Department                                → which scorecard they're on
//   Scorecard Evaluator                       → who scores them (by name)
//   ROLE                                      → Admin | Manager | Supervisor | Employee
//
// From that it derives everything: employee records, the reporting line
// (evaluatorEmail/evaluatorUid), which departments each leader covers
// (the departments of the people they evaluate), role claims, and the
// department's own manager metadata.
//
// Used by the admin Directory Import page (/api/import-directory) and by
// scripts/import-directory.ts. Dry run (write=false) changes nothing.
// ============================================================

// Evaluator cells that mean "nobody scores this person here".
const NO_EVALUATOR = new Set(["", "not applicable", "n/a", "na", "none"]);
// An evaluator cell of ADMIN means "scored by an administrator".
const ADMIN_EVALUATOR = "admin";

export interface ImportEntry {
  level: "add" | "merge" | "warn" | "info";
  text: string;
}

export interface ImportReport {
  write: boolean;
  peopleInFile: number;
  created: number;
  merged: number;
  entries: ImportEntry[];
  unmapped: { name: string; position: string; email: string }[];
  extras: {
    departmentId: string;
    departmentName: string;
    employeeId: string;
    name: string;
    email: string;
  }[];
}

interface RosterRow {
  name: string;
  email: string;
  position: string;
  department: string;
  evaluatorName: string;
  role: string; // lowercased ROLE column
}

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const empId = (email: string) =>
  `emp_${email.split("@")[0].replace(/[^a-z0-9]+/gi, "-")}`;

function readRoster(buf: Buffer): RosterRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  const out: RosterRow[] = [];
  for (const r of rows) {
    const email = String(r["Stratus Email Address"] ?? "").trim().toLowerCase();
    if (!email) continue;
    out.push({
      name: String(r["Name"] ?? "").trim(),
      email,
      position: String(r["Position"] ?? "").trim(),
      // "Department" is the current column; older files used "Dept".
      department: String(r["Department"] ?? r["Dept"] ?? "").trim(),
      evaluatorName: String(r["Scorecard Evaluator"] ?? "").trim(),
      role: String(r["ROLE"] ?? "").trim().toLowerCase(),
    });
  }
  return out;
}

async function authByEmail(
  email: string
): Promise<{ uid: string; claims: Record<string, unknown> } | null> {
  try {
    const u = await adminAuth().getUserByEmail(email);
    return { uid: u.uid, claims: (u.customClaims as Record<string, unknown>) ?? {} };
  } catch {
    return null;
  }
}

export async function importDirectory(
  buf: Buffer,
  opts: { write: boolean }
): Promise<ImportReport> {
  const { write } = opts;
  const roster = readRoster(buf);
  const report: ImportReport = {
    write,
    peopleInFile: roster.length,
    created: 0,
    merged: 0,
    entries: [],
    unmapped: [],
    extras: [],
  };
  const log = (level: ImportEntry["level"], text: string) =>
    report.entries.push({ level, text });

  if (roster.length === 0) {
    log("warn", 'No rows with a "Stratus Email Address" column were found — is this the roster workbook?');
    return report;
  }
  if (!roster.some((r) => r.evaluatorName)) {
    log(
      "warn",
      'No "Scorecard Evaluator" column found — add it to the roster so reporting lines can be imported.'
    );
  }

  // Resolve an evaluator name to their roster row (and therefore email).
  const byName = new Map(roster.map((r) => [norm(r.name), r]));
  // Resolve a Department cell to a scorecard department document.
  const deptSnap = await adminDb().collection("departments").get();
  const deptByNorm = new Map(deptSnap.docs.map((d) => [norm(d.data().name ?? d.id), d]));

  const resolveDept = (row: RosterRow) => {
    const direct = deptByNorm.get(norm(row.department));
    if (direct) return direct;
    // Per-person sales scorecards are named "Sales-<first name>", though
    // the department may use a short form (Trisha → Sales-Trish).
    if (norm(row.department) === "sales") {
      const first = norm(row.name.split(/\s+/)[0] ?? "");
      if (first) {
        for (const [key, doc] of deptByNorm) {
          if (!key.startsWith("sales")) continue;
          const who = key.slice("sales".length);
          if (who && (first.startsWith(who) || who.startsWith(first))) return doc;
        }
      }
    }
    return null;
  };

  // ---- Pass 1: work out each person's placement ----
  interface Placement {
    row: RosterRow;
    deptDoc: FirebaseFirestore.QueryDocumentSnapshot;
    evaluatorEmail: string | null; // null = scored by an admin / nobody named
    evaluatorName: string;
  }
  const placements: Placement[] = [];
  const missingDepartments = new Map<string, number>();

  for (const row of roster) {
    const evalKey = row.evaluatorName.toLowerCase();
    // Executives and other unscored people carry no evaluator.
    if (NO_EVALUATOR.has(evalKey)) continue;

    const deptDoc = resolveDept(row);
    if (!deptDoc) {
      missingDepartments.set(
        row.department || "(no department)",
        (missingDepartments.get(row.department || "(no department)") ?? 0) + 1
      );
      report.unmapped.push({ name: row.name, position: row.position, email: row.email });
      continue;
    }

    let evaluatorEmail: string | null = null;
    let evaluatorName = row.evaluatorName;
    if (evalKey !== ADMIN_EVALUATOR) {
      const match = byName.get(norm(row.evaluatorName));
      if (match) {
        evaluatorEmail = match.email;
        evaluatorName = match.name;
      } else {
        log(
          "warn",
          `${row.name}: evaluator "${row.evaluatorName}" isn't a name in this roster — the reporting link was skipped.`
        );
      }
    }

    placements.push({ row, deptDoc, evaluatorEmail, evaluatorName });
  }

  for (const [dept, count] of missingDepartments) {
    log(
      "warn",
      `No scorecard department named "${dept}" exists yet — its ${count} member(s) were skipped. Create the department, then re-import.`
    );
  }

  // ---- Leaders: the departments of the people they evaluate ----
  const leaders = new Map<string, { name: string; departmentIds: Set<string> }>();
  for (const p of placements) {
    if (!p.evaluatorEmail) continue;
    const entry =
      leaders.get(p.evaluatorEmail) ?? { name: p.evaluatorName, departmentIds: new Set<string>() };
    entry.name = p.evaluatorName;
    entry.departmentIds.add(p.deptDoc.id);
    leaders.set(p.evaluatorEmail, entry);
  }

  // Resolve each leader's auth account once.
  const leaderUids = new Map<string, string>();
  for (const [email, info] of leaders) {
    const acct = await authByEmail(email);
    const rosterRow = byName.get(norm(info.name));
    // Roles come from the ROLE column; "manager" and "supervisor" are the
    // same privilege tier in the app. Admin is never granted automatically.
    const wanted = rosterRow?.role === "manager" ? "manager" : "supervisor";

    log(
      "info",
      `${info.name} evaluates people in ${info.departmentIds.size} department(s): ${[
        ...info.departmentIds,
      ].join(", ")}`
    );

    if (!acct) {
      log(
        "warn",
        `${info.name} <${email}> has no Firebase Auth account yet — their departments are recorded by email and link automatically when they sign in.`
      );
    } else {
      leaderUids.set(email, acct.uid);
      const current = acct.claims.role as string | undefined;
      if (current !== "admin" && current !== wanted) {
        log("info", `${info.name}: role "${current ?? "none"}" → "${wanted}"`);
        if (write) {
          await adminAuth().setCustomUserClaims(acct.uid, { ...acct.claims, role: wanted });
        }
      }
      if (write) {
        await adminDb()
          .collection("users")
          .doc(acct.uid)
          .set(
            {
              uid: acct.uid,
              email,
              displayName: info.name,
              role: current === "admin" ? "admin" : wanted,
            },
            { merge: true }
          );
        await adminDb()
          .collection("assignments")
          .doc(acct.uid)
          .set(
            { uid: acct.uid, managerName: info.name, departmentIds: [...info.departmentIds] },
            { merge: true }
          );
      }
    }

    if (write) {
      await adminDb()
        .collection("directory")
        .doc(email)
        .set(
          {
            email,
            name: info.name,
            role: wanted,
            departmentIds: [...info.departmentIds],
            departmentId: null, // clear the legacy single-department field
          },
          { merge: true }
        );
    }
  }

  // ---- Pass 2: write the employee records ----
  const expectedByDept = new Map<string, Set<string>>();

  for (const p of placements) {
    const { row, deptDoc } = p;
    const dept = deptDoc.data();
    const id = empId(row.email);
    expectedByDept.set(
      deptDoc.id,
      (expectedByDept.get(deptDoc.id) ?? new Set<string>()).add(id)
    );

    const ref = deptDoc.ref.collection("employees").doc(id);
    const existing = await ref.get();
    const linked = await authByEmail(row.email);
    const evaluatorUid = p.evaluatorEmail ? leaderUids.get(p.evaluatorEmail) : undefined;

    // Never clobber scores: new records get a zeroed metric template;
    // existing records only merge identity + evaluator fields.
    const base: Record<string, unknown> = {
      id,
      name: row.name,
      email: row.email,
      departmentId: deptDoc.id,
      role: row.position,
      evaluatorName: p.evaluatorName,
      // Email is the durable evaluator link; uid only exists once the
      // leader has an account. Both are matched when scoping views.
      evaluatorEmail: p.evaluatorEmail ?? null,
      ...(evaluatorUid ? { evaluatorUid } : {}),
      ...(linked ? { linkedUid: linked.uid } : {}),
      // Re-importing someone restores them to the roster.
      archived: false,
    };
    if (!existing.exists) {
      base.type = dept.type ?? "kpi";
      base.metrics = (dept.metrics ?? []).map((m: Record<string, unknown>) => ({
        ...m,
        actual: { monthly: 0, quarterly: 0, yearly: 0 },
        score: { monthly: 0, quarterly: 0, yearly: 0 },
      }));
      // Competency people start from the department's criteria, unrated —
      // the template carries the sheet's sample scores, which aren't theirs.
      if (dept.type === "competency" && dept.competency?.criteria) {
        base.competency = {
          criteria: dept.competency.criteria.map((c: Record<string, unknown>) => ({
            ...c,
            score: 0,
            weighted: 0,
            comments: "",
          })),
          overall: 0,
          band: "",
        };
      }
      report.created++;
    } else {
      report.merged++;
    }

    log(
      existing.exists ? "merge" : "add",
      `${dept.name}: ${row.name} — ${row.position}` +
        `${p.evaluatorEmail ? ` → evaluated by ${p.evaluatorName}` : " → evaluated by an admin"}` +
        `${linked ? " (login linked)" : ""}`
    );

    if (write) {
      await ref.set(base, { merge: true });
      // Directory lookup for self-provisioning on first sign-in. Leaders
      // get their own richer record written above; don't overwrite it.
      if (!leaders.has(row.email)) {
        await adminDb()
          .collection("directory")
          .doc(row.email)
          .set(
            {
              email: row.email,
              name: row.name,
              role: row.role === "admin" ? "employee" : row.role || "employee",
              departmentId: deptDoc.id,
            },
            { merge: true }
          );
      }
    }
  }

  // ---- Department metadata + roster reconciliation ----
  for (const doc of deptSnap.docs) {
    const dept = doc.data();
    const expected = expectedByDept.get(doc.id);

    // The department's manager should be whoever evaluates its people.
    const evaluators = new Set(
      placements.filter((p) => p.deptDoc.id === doc.id).map((p) => p.evaluatorName)
    );
    if (evaluators.size === 1) {
      const leaderName = [...evaluators][0];
      if ((dept.managerName ?? "") !== leaderName || (dept.evaluatorName ?? "") !== leaderName) {
        log("info", `${dept.name}: manager ${dept.managerName || "(unset)"} → ${leaderName}`);
        if (write) {
          await doc.ref.set(
            { managerName: leaderName, evaluatorName: leaderName },
            { merge: true }
          );
        }
      }
    }

    // Anyone on the roster that the workbook no longer places here.
    if (!expected) continue;
    const current = await doc.ref.collection("employees").get();
    for (const d of current.docs) {
      const e = d.data();
      if (e.archived) continue;
      if (expected.has(d.id)) continue;
      report.extras.push({
        departmentId: doc.id,
        departmentName: dept.name ?? doc.id,
        employeeId: d.id,
        name: (e.name as string) || d.id,
        email: (e.email as string) || "",
      });
    }
  }

  return report;
}
