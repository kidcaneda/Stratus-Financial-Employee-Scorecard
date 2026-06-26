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

// Generates a stable-ish id for a new employee from name + timestamp.
export function newEmployeeId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `emp_${slug}_${Date.now().toString(36)}`;
}
