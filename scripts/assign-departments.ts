/**
 * Grant a lead (manager/supervisor) score-entry access to departments.
 * Writes assignments/{uid}, which also populates their "My Team" page
 * with those departments' employees.
 *
 * Usage:
 *   npx tsx scripts/assign-departments.ts <email> <departmentId> [departmentId...]
 *
 * Replaces the lead's assigned-department list with the ids given.
 * Requires the FIREBASE_ADMIN_* env vars (see .env.local.example).
 */
import { adminAuth, adminDb } from "../src/lib/firebase-admin";

async function main() {
  const [email, ...departmentIds] = process.argv.slice(2);
  if (!email || departmentIds.length === 0) {
    console.error(
      "Usage: tsx scripts/assign-departments.ts <email> <departmentId> [departmentId...]"
    );
    process.exit(1);
  }

  const user = await adminAuth().getUserByEmail(email);

  // Validate against real departments so a typo doesn't silently grant nothing.
  const snap = await adminDb().collection("departments").get();
  const known = new Set(snap.docs.map((d) => d.id));
  const unknown = departmentIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.error(`Unknown department id(s): ${unknown.join(", ")}`);
    console.error(`Valid ids: ${[...known].sort().join(", ")}`);
    process.exit(1);
  }

  await adminDb().collection("assignments").doc(user.uid).set(
    {
      uid: user.uid,
      managerName: user.displayName ?? email,
      departmentIds,
    },
    { merge: true }
  );

  console.log(`✓ ${email} now covers: ${departmentIds.join(", ")}`);
  console.log("Their My Team page shows these departments' employees immediately.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
