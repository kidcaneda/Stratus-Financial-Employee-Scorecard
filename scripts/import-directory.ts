/**
 * Bulk-import the company employee directory workbook into Firestore.
 *
 * Usage:
 *   npx tsx scripts/import-directory.ts <path-to-directory.xlsx>          (dry run)
 *   npx tsx scripts/import-directory.ts <path-to-directory.xlsx> --write  (commit)
 *
 * Reads the directory sheet (Name / Position / Stratus Email Address) and,
 * per the ORG mapping below:
 *   1. Creates employee records under the right scorecard department
 *      (existing records are NOT overwritten — only identity/evaluator
 *      fields are merged, scores are never touched).
 *   2. Links each employee to their leader via evaluatorUid, so they show
 *      up on the leader's "My Team" page.
 *   3. Writes each leader's assignments/{uid} department grant (unioned
 *      with whatever they already have).
 *   4. Ensures each leader's auth role claim allows scoring (upgrades
 *      "employee"/missing to "supervisor"; never touches admin/manager).
 *   5. Sets linkedUid on employees whose email has a Firebase Auth account
 *      so they can see and acknowledge their own evaluations.
 *
 * Dry run prints the full plan and changes nothing. Review it (especially
 * the leader choices in ORG), then re-run with --write.
 *
 * Requires FIREBASE_ADMIN_* env vars (see .env.local.example).
 */
import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "../src/lib/firebase-admin";

// ============================================================
// ORG MAPPING — edit this to change who reports to whom.
// Keys are scorecard department NAMES as they appear in the app
// (resolved case/punctuation-insensitively against Firestore).
// `leader` is the evaluator who scores that department's members
// (null = keep the department's existing evaluator, no uid link).
// Emails are the directory's Stratus addresses.
// ============================================================
const ORG: Record<string, { leader: string | null; members: string[] }> = {
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const empId = (email: string) => `emp_${email.split("@")[0].replace(/[^a-z0-9]+/gi, "-")}`;

interface DirRow {
  name: string;
  position: string;
  email: string;
}

function readDirectory(path: string): Map<string, DirRow> {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
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

async function uidByEmail(email: string): Promise<{ uid: string; claims: Record<string, unknown> } | null> {
  try {
    const u = await adminAuth().getUserByEmail(email);
    return { uid: u.uid, claims: (u.customClaims as Record<string, unknown>) ?? {} };
  } catch {
    return null;
  }
}

async function main() {
  const [path, flag] = process.argv.slice(2);
  const write = flag === "--write";
  if (!path) {
    console.error("Usage: tsx scripts/import-directory.ts <path-to-xlsx> [--write]");
    process.exit(1);
  }

  const directory = readDirectory(path);
  console.log(`Directory: ${directory.size} people with email addresses.`);
  console.log(write ? "MODE: WRITE — changes will be committed.\n" : "MODE: DRY RUN — nothing will be written.\n");

  // Resolve scorecard departments by normalized name.
  const deptSnap = await adminDb().collection("departments").get();
  const deptByNorm = new Map(deptSnap.docs.map((d) => [norm(d.data().name ?? d.id), d]));

  const mapped = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const [deptName, { leader, members }] of Object.entries(ORG)) {
    const deptDoc = deptByNorm.get(norm(deptName));
    if (!deptDoc) {
      console.log(`✗ No scorecard department matches "${deptName}" — skipped (${members.length} people).`);
      continue;
    }
    const dept = deptDoc.data();
    console.log(`\n■ ${dept.name} (${deptDoc.id})`);

    // Resolve the leader: auth uid, role claim, assignment grant.
    let leaderUid: string | null = null;
    let leaderName = "";
    if (leader) {
      const dir = directory.get(leader);
      leaderName = dir?.name ?? leader;
      const acct = await uidByEmail(leader);
      if (!acct) {
        console.log(`  ⚠ Leader ${leaderName} <${leader}> has no Firebase Auth account — members get evaluatorName only. Create the account and re-run to link uids.`);
      } else {
        leaderUid = acct.uid;
        const role = acct.claims.role as string | undefined;
        if (!role || role === "employee") {
          console.log(`  ↑ Leader ${leaderName}: role claim "${role ?? "none"}" → "supervisor"${write ? "" : " (dry run)"}`);
          if (write) {
            await adminAuth().setCustomUserClaims(leaderUid, { ...acct.claims, role: "supervisor" });
            await adminDb().collection("users").doc(leaderUid).set(
              { uid: leaderUid, email: leader, displayName: leaderName, role: "supervisor" },
              { merge: true }
            );
          }
        }
        // Union this department into their assignment grant.
        const assignRef = adminDb().collection("assignments").doc(leaderUid);
        const existing = await assignRef.get();
        const have: string[] = existing.exists ? existing.data()?.departmentIds ?? [] : [];
        if (!have.includes(deptDoc.id)) {
          console.log(`  + Assignment: ${leaderName} covers ${deptDoc.id}${write ? "" : " (dry run)"}`);
          if (write) {
            await assignRef.set(
              { uid: leaderUid, managerName: leaderName, departmentIds: [...have, deptDoc.id] },
              { merge: true }
            );
          }
        }
        if (leader) mapped.add(leader);
      }
    }

    // Import members.
    for (const email of members) {
      const dir = directory.get(email);
      if (!dir) {
        console.log(`  ⚠ ${email} not found in the directory sheet — skipped.`);
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
        created++;
      } else {
        updated++;
      }
      console.log(
        `  ${existing.exists ? "~" : "+"} ${dir.name} — ${dir.position}` +
          `${leaderUid ? ` → reports to ${leaderName}` : ""}${linked ? " (login linked)" : ""}`
      );
      if (write) await ref.set(base, { merge: true });
    }
  }

  // Everyone in the directory not covered by the mapping.
  const unmapped = [...directory.values()].filter((r) => !mapped.has(r.email));
  if (unmapped.length) {
    console.log(`\nNot imported (${unmapped.length}) — no scorecard department mapped:`);
    for (const r of unmapped) console.log(`    ${r.name} — ${r.position} <${r.email}>`);
    console.log("  Add them to ORG above (or create their scorecard department first) and re-run.");
  }

  console.log(
    `\n${write ? "Done" : "Plan"}: ${created} new employee record(s), ${updated} existing merged.` +
      (write ? "" : "\nRe-run with --write to commit.")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
