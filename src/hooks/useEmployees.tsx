"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { Employee } from "@/types";
import { SEED_EMPLOYEES } from "@/lib/seed-employees";

// Loads the employees in a department's Firestore subcollection
// (departments/{deptId}/employees). Falls back to seed employees when
// Firestore is empty/unreachable, so the UI always has something to show.
//
// Archived records (people who moved on from the department) are hidden
// by default so rosters stay current, but they are never deleted —
// pass includeArchived to read them, which is what the employee detail
// page does so a past assignment and its evaluations stay viewable.
export function useEmployees(
  departmentId: string | undefined,
  opts: { includeArchived?: boolean } = {}
) {
  const includeArchived = opts.includeArchived ?? false;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!departmentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const fallback = () => {
        if (cancelled) return;
        setEmployees(SEED_EMPLOYEES[departmentId] ?? []);
        setIsMock(true);
        setLoading(false);
      };

      if (!firebaseReady) return fallback();

      try {
        const snap = await getDocs(
          collection(db, "departments", departmentId, "employees")
        );
        if (cancelled) return;
        if (!snap.empty) {
          setEmployees(
            snap.docs
              .map((d) => d.data() as Employee)
              .filter((e) => includeArchived || !e.archived)
          );
          setIsMock(false);
          setLoading(false);
        } else {
          fallback();
        }
      } catch {
        fallback();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departmentId, includeArchived]);

  return { employees, isMock, loading };
}
