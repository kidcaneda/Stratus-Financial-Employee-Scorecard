/**
 * Provision a user's role (custom claim) + Firestore profile.
 *
 * Usage:
 *   npx tsx scripts/set-role.ts <email> <admin|manager|employee> [departmentId]
 *
 * Requires the FIREBASE_ADMIN_* env vars to be set (see .env.local.example).
 * The user must already exist in Firebase Auth (create them in the console
 * or via your sign-up flow first).
 */
import { adminAuth, adminDb } from "../src/lib/firebase-admin";

async function main() {
  const [email, role, departmentId] = process.argv.slice(2);
  if (!email || !role) {
    console.error("Usage: tsx scripts/set-role.ts <email> <role> [departmentId]");
    process.exit(1);
  }
  if (!["admin", "manager", "employee"].includes(role)) {
    console.error("Role must be admin, manager, or employee.");
    process.exit(1);
  }

  const user = await adminAuth().getUserByEmail(email);
  await adminAuth().setCustomUserClaims(user.uid, { role });
  await adminDb().collection("users").doc(user.uid).set(
    {
      uid: user.uid,
      email,
      displayName: user.displayName ?? email,
      role,
      departmentId: departmentId ?? null,
    },
    { merge: true }
  );
  console.log(`✓ Set ${email} -> ${role}${departmentId ? ` (dept: ${departmentId})` : ""}`);
  console.log("Note: the user must sign out and back in for the new claim to take effect.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
