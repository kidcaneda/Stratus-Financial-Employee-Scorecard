"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { Employee } from "@/types";
import { SEED_EMPLOYEES } from "@/lib/seed-employees";

// Loads the employees in a department's Firestore subcollection
// (departments/{deptId}/employees). Falls back to seed employees when
// Firestore is empty/unreachable, so the UI always has something to show.
export function useEmployees(departmentId: string | undefined) {
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
          setEmployees(snap.docs.map((d) => d.data() as Employee));
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
  }, [departmentId]);

  return { employees, isMock, loading };
}
