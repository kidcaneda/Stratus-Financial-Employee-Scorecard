import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// ============================================================
// Shared engine for importing the company employee-directory workbook
// into Firestore. Used by the admin Directory Import page
// (/api/import-directory) and by scripts/import-directory.ts.
//
// For every department in the ORG mapping below it:
//   1. Creates employee records under the matching scorecard department
//      (existing records only merge identity/evaluator fields — recorded
//      scores are never touched).
//   2. Links members to their leader via evaluatorUid (drives My Team).
//   3. Unions the department into the leader's assignments/{uid} grant.
//   4. Upgrades a leader's missing/"employee" role claim to "supervisor"
//      (admin/manager claims are never altered).
//   5. Sets linkedUid on members whose email has an auth account.
//
// Dry run (write=false) reports the full plan and changes nothing.
// ============================================================

// ORG MAPPING — edit to change who reports to whom. Keys are scorecard
// department NAMES (matched case/punctuation-insensitively). `leader`
// is the evaluator who scores that department's members (null = keep
// the department's existing evaluator, no uid link).
export const ORG: Record<string, { leader: string | null; members: string[] }> = {
  "Loan Origination": {
    leader: "ryan@stratus.finance", // Head - Loans Origination
    members: [
      "paula@stratus.finance",
      "ellaine@stratus.finance",
      "jass@stratus.finance",
      "lois@stratus.finance",
      "rofela@stratus.finance",
    ],
  },
  Underwriting: {
    leader: "charm@stratus.finance", // Team Leader - Underwriting
    members: ["red@stratus.finance", "eliza@stratus.finance"],
  },
  Accounting: {
    leader: "ida@stratus.finance", // Accounting Manager
    members: [
      "lea@stratus.finance",
      "rose@stratus.finance",
      "marygrace@stratus.finance",
      "bobette@stratus.finance",
      "chinny@stratus.finance",
      "marie@stratus.finance",
    ],
  },
  "Capital Markets": {
    leader: "parker@stratus.finance", // Managing Director for Capital Markets
    members: ["lisa@stratus.finance", "jairo@stratus.finance"],
  },
  "Human Resources": {
    leader: "cheryl@stratus.finance", // HR & Operations Manager
    members: [
      "andrea@stratus.finance",
      "jett@stratus.finance",
      "gerald@stratus.finance",
      "sam@stratus.finance",
      "ian@stratus.finance",
    ],
  },
  "Investor Relations": {
    leader: "jannah@stratus.finance", // Investor Relations Lead
    members: ["analyn@stratus.finance", "rheena@stratus.finance"],
  },
  Operations: {
    leader: "carson@stratus.finance", // Chief of Staff
    members: [
      "coo_assistant@stratus.finance",
      "noel@stratus.finance",
      "kid@stratus.finance",
    ],
  },
  "SVC-Payments": {
    leader: "lalaine@stratus.finance", // Payments Lead - Servicing
    members: ["jhon@stratus.finance"],
  },
  "SVC-Collections": {
    leader: "mario@stratus.finance", // Collections Lead - Servicing
    members: ["miraluna@stratus.finance", "freya@stratus.finance"],
  },
  "SVC-Quality Control": {
    leader: "edson@stratus.finance", // Quality Control Lead - Servicing
    members: ["ira@stratus.finance"],
  },
  // Per-person sales scorecards: the person IS the department. No uid
  // evaluator link — their existing evaluator (from the dept doc) stays.
  "Sales-Camille": { leader: null, members: ["camille@stratus.finance"] },
  "Sales-Gustavo": { leader: null, members: ["gustavo@stratus.finance"] },
  "Sales-Phebe": { leader: null, members: ["phebe@stratus.finance"] },
  "Sales-Trish": { leader: null, members: ["trisha@stratus.finance"] },
  // Team-Level Executive KPI intentionally unmapped: executives
  // (CEO/Co-CEO/Principals/CFO/GC/MDs/EAs) aren't imported as reports.
};

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
}

interface DirRow {
  name: string;
  position: string;
  email: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const empId = (email: string) =>
  `emp_${email.split("@")[0].replace(/[^a-z0-9]+/gi, "-")}`;

function readDirectory(buf: Buffer): Map<string, DirRow> {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  const byEmail = new Map<string, DirRow>();
  for (const r of rows) {
    const email = String(r["Stratus Email Address"] ?? "").trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, {
      name: String(r["Name"] ?? "").trim(),
      position: String(r["Position"] ?? "").trim(),
      email,
    });
  }
  return byEmail;
}

async function uidByEmail(
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
  const directory = readDirectory(buf);
  const report: ImportReport = {
    write,
    peopleInFile: directory.size,
    created: 0,
    merged: 0,
    entries: [],
    unmapped: [],
  };
  const log = (level: ImportEntry["level"], text: string) =>
    report.entries.push({ level, text });

  if (directory.size === 0) {
    log(
      "warn",
      'No rows with a "Stratus Email Address" column were found — is this the directory workbook?'
    );
    return report;
  }

  const deptSnap = await adminDb().collection("departments").get();
  const deptByNorm = new Map(
    deptSnap.docs.map((d) => [norm(d.data().name ?? d.id), d])
  );

  const mapped = new Set<string>();

  for (const [deptName, { leader, members }] of Object.entries(ORG)) {
    const deptDoc = deptByNorm.get(norm(deptName));
    if (!deptDoc) {
      log(
        "warn",
        `No scorecard department matches "${deptName}" — skipped (${members.length} people).`
      );
      continue;
    }
    const dept = deptDoc.data();
    log("info", `■ ${dept.name}`);

    let leaderUid: string | null = null;
    let leaderName = "";
    if (leader) {
      const dir = directory.get(leader);
      leaderName = dir?.name ?? leader;
      const acct = await uidByEmail(leader);
      if (!acct) {
        log(
          "warn",
          `Leader ${leaderName} <${leader}> has no Firebase Auth account — members get evaluatorName only. Create the account, then re-import to link.`
        );
      } else {
        leaderUid = acct.uid;
        const role = acct.claims.role as string | undefined;
        if (!role || role === "employee") {
          log("info", `Leader ${leaderName}: role claim "${role ?? "none"}" → "supervisor"`);
          if (write) {
            await adminAuth().setCustomUserClaims(leaderUid, {
              ...acct.claims,
              role: "supervisor",
            });
            await adminDb().collection("users").doc(leaderUid).set(
              { uid: leaderUid, email: leader, displayName: leaderName, role: "supervisor" },
              { merge: true }
            );
          }
        }
        const assignRef = adminDb().collection("assignments").doc(leaderUid);
        const existing = await assignRef.get();
        const have: string[] = existing.exists
          ? existing.data()?.departmentIds ?? []
          : [];
        if (!have.includes(deptDoc.id)) {
          log("info", `Assignment: ${leaderName} covers ${dept.name}`);
          if (write) {
            await assignRef.set(
              {
                uid: leaderUid,
                managerName: leaderName,
                departmentIds: [...have, deptDoc.id],
              },
              { merge: true }
            );
          }
        }
        mapped.add(leader);
      }
    }

    for (const email of members) {
      const dir = directory.get(email);
      if (!dir) {
        log("warn", `${email} not found in the directory sheet — skipped.`);
        continue;
      }
      mapped.add(email);
      const id = empId(email);
      const ref = deptDoc.ref.collection("employees").doc(id);
      const existing = await ref.get();
      const linked = await uidByEmail(email);

      // Never clobber scores: new records get a zeroed metric template;
      // existing records only merge identity + evaluator fields.
      const base: Record<string, unknown> = {
        id,
        name: dir.name,
        email,
        departmentId: deptDoc.id,
        role: dir.position,
        evaluatorName: leaderName || dept.evaluatorName || dept.managerName || "",
        ...(leaderUid ? { evaluatorUid: leaderUid } : {}),
        ...(linked ? { linkedUid: linked.uid } : {}),
      };
      if (!existing.exists) {
        base.type = dept.type ?? "kpi";
        base.metrics = (dept.metrics ?? []).map((m: Record<string, unknown>) => ({
          ...m,
          actual: { monthly: 0, quarterly: 0, yearly: 0 },
          score: { monthly: 0, quarterly: 0, yearly: 0 },
        }));
        report.created++;
      } else {
        report.merged++;
      }
      log(
        existing.exists ? "merge" : "add",
        `${dir.name} — ${dir.position}` +
          `${leaderUid ? ` → reports to ${leaderName}` : ""}` +
          `${linked ? " (login linked)" : ""}`
      );
      if (write) await ref.set(base, { merge: true });
    }
  }

  report.unmapped = [...directory.values()].filter((r) => !mapped.has(r.email));
  return report;
}
