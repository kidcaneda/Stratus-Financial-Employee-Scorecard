/**
 * Bulk-import the company employee directory workbook into Firestore
 * from the terminal. Same engine as the in-app admin page
 * (Sidebar → Directory Import); the ORG mapping lives in
 * src/lib/directory-import.ts.
 *
 * Usage:
 *   npx tsx scripts/import-directory.ts <path-to-directory.xlsx>          (dry run)
 *   npx tsx scripts/import-directory.ts <path-to-directory.xlsx> --write  (commit)
 *
 * Requires FIREBASE_ADMIN_* env vars (see .env.local.example).
 */
import { readFileSync } from "fs";
import { importDirectory } from "../src/lib/directory-import";

async function main() {
  const [path, flag] = process.argv.slice(2);
  const write = flag === "--write";
  if (!path) {
    console.error("Usage: tsx scripts/import-directory.ts <path-to-xlsx> [--write]");
    process.exit(1);
  }

  console.log(write ? "MODE: WRITE — changes will be committed.\n" : "MODE: DRY RUN — nothing will be written.\n");
  const report = await importDirectory(readFileSync(path), { write });

  for (const e of report.entries) {
    const prefix = { add: "  +", merge: "  ~", warn: "  ⚠", info: "\n■" }[e.level];
    console.log(`${prefix} ${e.text}`);
  }

  if (report.unmapped.length) {
    console.log(`\nNot imported (${report.unmapped.length}) — no scorecard department mapped:`);
    for (const r of report.unmapped) console.log(`    ${r.name} — ${r.position} <${r.email}>`);
  }

  console.log(
    `\n${write ? "Done" : "Plan"}: ${report.peopleInFile} people in file, ` +
      `${report.created} new employee record(s), ${report.merged} existing merged.` +
      (write ? "" : "\nRe-run with --write to commit.")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
