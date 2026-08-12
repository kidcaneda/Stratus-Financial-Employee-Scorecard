"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, doc, getDoc, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { Department, Employee, MonthlyEvaluation } from "@/types";

// One past (or parallel) assignment: the record in another department
// plus the evaluations recorded against it.
export interface PriorAssignment {
  emp: Employee;
  departmentName: string;
  months: MonthlyEvaluation[];
}

// ============================================================
// Follows a PERSON across departments.
//
// Scorecards live under a department, so moving teams creates a new
// record and leaves the previous one — with all of its evaluations —
// behind. Nothing is deleted, but it stops showing on the person's
// current scorecard. This finds every other record belonging to the
// same human (matched on linkedUid, else their email) and loads its
// evaluation history, so a transfer never loses the trail.
// ============================================================
export function usePersonHistory(person: {
  email?: string;
  linkedUid?: string;
  excludeDepartmentId?: string;
  excludeEmployeeId?: string;
}) {
  const { email, linkedUid, excludeDepartmentId, excludeEmployeeId } = person;
  const [assignments, setAssignments] = useState<PriorAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const key = `${(email ?? "").toLowerCase()}|${linkedUid ?? ""}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const mail = (email ?? "").toLowerCase();
      if (!firebaseReady || (!mail && !linkedUid)) {
        if (!cancelled) {
          setAssignments([]);
          setLoading(false);
        }
        return;
      }

      try {
        const snap = await getDocs(collectionGroup(db, "employees"));
        const mine = snap.docs
          .map((d) => d.data() as Employee)
          .filter(
            (e) =>
              (linkedUid && e.linkedUid === linkedUid) ||
              (!!mail && (e.email || "").toLowerCase() === mail)
          )
          .filter(
            (e) =>
              !(e.departmentId === excludeDepartmentId && e.id === excludeEmployeeId)
          );

        const loaded = await Promise.all(
          mine.map(async (emp) => {
            const [deptSnap, monthsSnap] = await Promise.all([
              getDoc(doc(db, "departments", emp.departmentId)).catch(() => null),
              getDocs(
                collection(
                  db,
                  "departments",
                  emp.departmentId,
                  "employees",
                  emp.id,
                  "months"
                )
              ).catch(() => null),
            ]);
            return {
              emp,
              departmentName:
                (deptSnap?.exists() ? (deptSnap.data() as Department).name : null) ??
                emp.departmentId,
              months: monthsSnap
                ? monthsSnap.docs
                    .map((d) => d.data() as MonthlyEvaluation)
                    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
                : [],
            } as PriorAssignment;
          })
        );

        if (cancelled) return;
        // Only assignments that actually carry history are worth showing.
        setAssignments(
          loaded
            .filter((a) => a.months.length > 0)
            .sort((a, b) =>
              (b.months[b.months.length - 1]?.monthKey ?? "").localeCompare(
                a.months[a.months.length - 1]?.monthKey ?? ""
              )
            )
        );
      } catch {
        if (!cancelled) setAssignments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, excludeDepartmentId, excludeEmployeeId, email, linkedUid]);

  return { assignments, loading };
}
