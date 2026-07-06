"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Department, Employee } from "@/types";
import { SEED_DEPARTMENTS } from "@/lib/seed-data";
import { SEED_EMPLOYEES } from "@/lib/seed-employees";

// One department the signed-in leader has reports in.
export interface TeamGroup {
  dept: Department;
  employees: Employee[];
}

// Loads the signed-in leader's team: employees directly linked to them
// (evaluatorUid) plus everyone in their assigned departments. Every lookup
// is scoped to the leader — a collection-group query on evaluatorUid and
// per-id department reads — so cost grows with the size of THEIR team,
// not the size of the company.
export function useMyTeam() {
  const { user, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Call after a save to re-pull the roster without a full page reload.
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Local preview without Firebase: show seed rosters, clearly mocked.
      if (!firebaseReady) {
        if (cancelled) return;
        setGroups(
          SEED_DEPARTMENTS.filter((d) => (SEED_EMPLOYEES[d.id] ?? []).length > 0).map(
            (d) => ({ dept: d, employees: SEED_EMPLOYEES[d.id] })
          )
        );
        setIsMock(true);
        setLoading(false);
        return;
      }

      if (!user) {
        if (cancelled) return;
        setGroups([]);
        setIsMock(false);
        setLoading(false);
        return;
      }

      // Admins evaluate everyone: their "team" is the whole company.
      // Two reads total — all employees (collection group) + departments.
      if (user.role === "admin") {
        const [emps, depts] = await Promise.all([
          getDocs(collectionGroup(db, "employees")).then(
            (snap) => snap.docs.map((d) => d.data() as Employee),
            () => [] as Employee[]
          ),
          getDocs(collection(db, "departments")).then(
            (snap) => snap.docs.map((d) => d.data() as Department),
            () => [] as Department[]
          ),
        ]);
        if (cancelled) return;
        const next: TeamGroup[] = depts
          .map((dept) => ({
            dept,
            employees: emps
              .filter((e) => e.departmentId === dept.id)
              .sort((a, b) => a.name.localeCompare(b.name)),
          }))
          .filter((g) => g.employees.length > 0)
          .sort((a, b) => a.dept.name.localeCompare(b.dept.name));
        setGroups(next);
        setIsMock(false);
        setLoading(false);
        return;
      }

      // 1. Direct reports (person-level link, spans departments). If the
      //    collection-group index isn't deployed yet this read rejects —
      //    treat that as "no direct links" rather than failing the page.
      const directPromise = getDocs(
        query(collectionGroup(db, "employees"), where("evaluatorUid", "==", user.uid))
      ).then(
        (snap) => snap.docs.map((d) => d.data() as Employee),
        () => [] as Employee[]
      );

      // 2. Department-level grants (assignments/{uid}, managed by admins).
      const assignedPromise = getDoc(doc(db, "assignments", user.uid)).then(
        (snap) => (snap.exists() ? ((snap.data().departmentIds ?? []) as string[]) : []),
        () => [] as string[]
      );

      const [direct, assignedIds] = await Promise.all([directPromise, assignedPromise]);

      const assignedRosters = await Promise.all(
        assignedIds.map((id) =>
          getDocs(collection(db, "departments", id, "employees")).then(
            (snap) => snap.docs.map((d) => d.data() as Employee),
            () => [] as Employee[]
          )
        )
      );

      // Merge the two paths; an employee can match both.
      const byKey = new Map<string, Employee>();
      for (const e of [...direct, ...assignedRosters.flat()]) {
        byKey.set(`${e.departmentId}/${e.id}`, e);
      }
      const all = [...byKey.values()];

      // Load each involved department once — the score form needs its
      // metric/criteria template.
      const deptIds = [...new Set(all.map((e) => e.departmentId))];
      const deptDocs = await Promise.all(
        deptIds.map((id) =>
          getDoc(doc(db, "departments", id)).then(
            (snap) => (snap.exists() ? (snap.data() as Department) : null),
            () => null
          )
        )
      );

      if (cancelled) return;

      const next: TeamGroup[] = [];
      for (const dept of deptDocs) {
        if (!dept) continue;
        const employees = all
          .filter((e) => e.departmentId === dept.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (employees.length > 0) next.push({ dept, employees });
      }
      next.sort((a, b) => a.dept.name.localeCompare(b.dept.name));

      setGroups(next);
      setIsMock(false);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, reloadKey]);

  return { groups, isMock, loading, refresh };
}
