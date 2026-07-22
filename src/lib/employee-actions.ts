"use client";

import { auth } from "@/lib/firebase";
import { Employee } from "@/types";

// Saves an employee (create or update) through the server write route.
// Attaches the caller's ID token so the server can authorize. Returns
// { ok, error? } so the UI can show the specific failure reason.
export async function saveEmployee(
  employee: Employee
): Promise<{ ok: boolean; error?: string; created?: boolean }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: "You're not signed in." };

    const res = await fetch("/api/employees", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ employee }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Save failed." };
    return { ok: true, created: data.created };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error." };
  }
}

// Syncs the signed-in account's access from the company directory:
// resolves role + department by email and links their employee record.
// Call right after sign-in / sign-up, then refresh the ID token so the
// (possibly new) role claim takes effect.
export async function provisionMe(): Promise<{
  ok: boolean;
  role?: string;
  claimChanged?: boolean;
  error?: string;
}> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: "You're not signed in." };
    const res = await fetch("/api/provision-me", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Access sync failed." };
    // A changed role claim only lands in the token after a forced refresh.
    if (data.claimChanged) await auth.currentUser?.getIdToken(true);
    return { ok: true, role: data.role, claimChanged: data.claimChanged };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error." };
  }
}

// Generates a stable-ish id for a new employee from name + timestamp.
export function newEmployeeId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `emp_${slug}_${Date.now().toString(36)}`;
}

// ---- Phase C: save a dated monthly evaluation ----
import { MonthlyEvaluation } from "@/types";

export async function saveMonthlyEvaluation(
  evaluation: MonthlyEvaluation
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: "You're not signed in." };
    const res = await fetch("/api/evaluations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ evaluation }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Save failed." };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error." };
  }
}

// ---- Phase D: employee acknowledge / dispute ----
export async function respondToEvaluation(opts: {
  departmentId: string;
  employeeId: string;
  monthKey: string;
  status: "acknowledged" | "disputed";
  comment?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: "You're not signed in." };
    const res = await fetch("/api/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Failed." };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error." };
  }
}
