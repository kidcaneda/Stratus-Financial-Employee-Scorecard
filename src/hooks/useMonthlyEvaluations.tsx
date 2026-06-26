"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { MonthlyEvaluation } from "@/types";

// Loads all monthly evaluation records for one employee, sorted oldest→newest.
// departments/{deptId}/employees/{empId}/months/{monthKey}
export function useMonthlyEvaluations(
  departmentId: string | undefined,
  employeeId: string | undefined
) {
  const [months, setMonths] = useState<MonthlyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!departmentId || !employeeId) {
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
        const snap = await getDocs(
          collection(
            db,
            "departments",
            departmentId,
            "employees",
            employeeId,
            "months"
          )
        );
        if (cancelled) return;
        const data = snap.docs
          .map((d) => d.data() as MonthlyEvaluation)
          .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        setMonths(data);
      } catch {
        if (!cancelled) setMonths([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departmentId, employeeId]);

  return { months, loading };
}
