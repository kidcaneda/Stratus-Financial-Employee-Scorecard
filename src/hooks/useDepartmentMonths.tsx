"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { MonthlyEvaluation } from "@/types";

// Loads every monthly evaluation across all employees in a department,
// for department-level analytics. Returns a flat list of all months.
export function useDepartmentMonths(departmentId: string | undefined) {
  const [months, setMonths] = useState<MonthlyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!departmentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      if (!firebaseReady) {
        if (!cancelled) {
          setMonths([]);
          setLoading(false);
        }
        return;
      }
      try {
        // List employees, then fetch each one's months subcollection.
        const empSnap = await getDocs(
          collection(db, "departments", departmentId, "employees")
        );
        const all: MonthlyEvaluation[] = [];
        for (const emp of empSnap.docs) {
          const monthSnap = await getDocs(
            collection(
              db,
              "departments",
              departmentId,
              "employees",
              emp.id,
              "months"
            )
          );
          monthSnap.docs.forEach((d) => all.push(d.data() as MonthlyEvaluation));
        }
        if (!cancelled) setMonths(all);
      } catch {
        if (!cancelled) setMonths([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  return { months, loading };
}
