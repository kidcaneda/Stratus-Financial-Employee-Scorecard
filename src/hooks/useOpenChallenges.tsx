"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { Employee, MonthlyEvaluation } from "@/types";

// A challenged evaluation nobody has answered yet.
export interface OpenChallenge {
  departmentId: string;
  employeeId: string;
  employeeName: string;
  monthKey: string;
  comment: string;
}

const keyOf = (deptId: string, empId: string) => `${deptId}/${empId}`;

// ============================================================
// Finds evaluations the employee challenged and no leader has resolved,
// scoped to the employees passed in (a lead's reports, or everyone for
// an admin).
//
// Prefers a single collection-group read of `months`; if that isn't
// permitted (the deployed rules may not expose months as a collection
// group), it falls back to reading each employee's months directly, so
// the indicator works either way with no deployment step.
// ============================================================
export function useOpenChallenges(employees: Employee[]) {
  const [challenges, setChallenges] = useState<OpenChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-run only when the actual set of employees changes.
  const signature = employees
    .map((e) => keyOf(e.departmentId, e.id))
    .sort()
    .join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!firebaseReady || employees.length === 0) {
        if (!cancelled) {
          setChallenges([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);

      const nameByKey = new Map(
        employees.map((e) => [keyOf(e.departmentId, e.id), e.name])
      );
      const isOpen = (m: MonthlyEvaluation) =>
        m.ackStatus === "disputed" && !m.resolution;
      const toChallenge = (m: MonthlyEvaluation): OpenChallenge => ({
        departmentId: m.departmentId,
        employeeId: m.employeeId,
        employeeName: nameByKey.get(keyOf(m.departmentId, m.employeeId)) ?? m.employeeId,
        monthKey: m.monthKey,
        comment: m.employeeComment ?? "",
      });

      let found: OpenChallenge[] | null = null;

      // Fast path: one read for every month in scope.
      try {
        const snap = await getDocs(collectionGroup(db, "months"));
        found = snap.docs
          .map((d) => d.data() as MonthlyEvaluation)
          .filter((m) => nameByKey.has(keyOf(m.departmentId, m.employeeId)) && isOpen(m))
          .map(toChallenge);
      } catch {
        found = null; // collection-group read not available — use the fallback
      }

      // Fallback: per-employee subcollection reads.
      if (found === null) {
        const lists = await Promise.all(
          employees.map((e) =>
            getDocs(
              collection(db, "departments", e.departmentId, "employees", e.id, "months")
            ).then(
              (s) => s.docs.map((d) => d.data() as MonthlyEvaluation).filter(isOpen),
              () => [] as MonthlyEvaluation[]
            )
          )
        );
        found = lists.flat().map(toChallenge);
      }

      if (cancelled) return;
      setChallenges(
        found.sort(
          (a, b) =>
            b.monthKey.localeCompare(a.monthKey) ||
            a.employeeName.localeCompare(b.employeeName)
        )
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { challenges, loading };
}
