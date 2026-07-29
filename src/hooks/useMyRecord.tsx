"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, doc, getDoc, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Department, Employee, MonthlyEvaluation } from "@/types";

// One scorecard belonging to the signed-in person: their employee
// record, its department (for the template/type), and their recorded
// months.
export interface MyRecord {
  emp: Employee;
  dept: Department | null;
  months: MonthlyEvaluation[];
}

// ============================================================
// Resolves the employee record(s) that belong to the signed-in account
// and loads each one's dated month history.
//
// Identity is matched on `linkedUid` (set at provisioning/import) and
// falls back to the account's email — so a scorecard shows up even
// before an admin links the record. Only the caller's own records are
// read; nothing here exposes anyone else's evaluations.
// ============================================================
export function useMyRecord() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      if (!firebaseReady || !user) {
        if (!cancelled) {
          setRecords([]);
          setLoading(false);
        }
        return;
      }

      try {
        const snap = await getDocs(collectionGroup(db, "employees"));
        const email = (user.email || "").toLowerCase();
        const mine = snap.docs
          .map((d) => d.data() as Employee)
          .filter(
            (e) =>
              (e.linkedUid && e.linkedUid === user.uid) ||
              (!!email && (e.email || "").toLowerCase() === email)
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
              dept: deptSnap?.exists() ? (deptSnap.data() as Department) : null,
              months: monthsSnap
                ? monthsSnap.docs
                    .map((d) => d.data() as MonthlyEvaluation)
                    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
                : [],
            } as MyRecord;
          })
        );

        if (cancelled) return;
        setRecords(loaded);
      } catch {
        if (!cancelled) setRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { records, loading };
}
