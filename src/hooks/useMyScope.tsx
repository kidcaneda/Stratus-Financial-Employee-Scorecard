"use client";

import { useEffect, useState } from "react";
import { collectionGroup, doc, getDoc, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Employee, isDeptLead } from "@/types";

// ============================================================
// Which departments may this account see?
//
//   admin              → everything (departmentIds === null)
//   manager/supervisor → the departments they lead, resolved from
//                        (a) directory/{email}.departmentIds — set by the
//                            directory import, keyed by EMAIL so it works
//                            before the leader ever has an account,
//                        (b) assignments/{uid}.departmentIds — admin grants,
//                        (c) any employee record naming them evaluator
//                            (evaluatorEmail or evaluatorUid).
//   employee           → the department(s) of their own record.
//
// Returns `departmentIds: null` for "no restriction" so callers can tell
// "sees everything" apart from "sees nothing yet".
// ============================================================
export function useMyScope() {
  const { user, loading: authLoading } = useAuth();
  const [departmentIds, setDepartmentIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  const uid = user?.uid;
  const email = (user?.email || "").toLowerCase();
  const role = user?.role;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Admins (and un-configured local previews) see everything.
      if (!firebaseReady || !user || role === "admin") {
        if (!cancelled) {
          setDepartmentIds(null);
          setLoading(false);
        }
        return;
      }

      const ids = new Set<string>();

      // (a) Leadership tagged in the directory, by email.
      if (email) {
        try {
          const snap = await getDoc(doc(db, "directory", email));
          if (snap.exists()) {
            const d = snap.data();
            for (const id of (d.departmentIds ?? []) as string[]) ids.add(id);
            // Records written before multi-department leads used a single id.
            if (d.departmentId) ids.add(d.departmentId as string);
          }
        } catch {
          /* directory not readable — fall through to the other sources */
        }
      }

      // (b) Explicit admin grants, by uid.
      if (uid && isDeptLead(role)) {
        try {
          const snap = await getDoc(doc(db, "assignments", uid));
          if (snap.exists()) {
            for (const id of (snap.data().departmentIds ?? []) as string[]) ids.add(id);
          }
        } catch {
          /* no assignment doc */
        }
      }

      // (c) Records that name this person — as evaluator (a lead) or as
      //     the employee themselves.
      try {
        const snap = await getDocs(collectionGroup(db, "employees"));
        for (const d of snap.docs) {
          const e = d.data() as Employee & { evaluatorEmail?: string };
          const evaluatorMatch =
            (e.evaluatorUid && e.evaluatorUid === uid) ||
            (!!email && (e.evaluatorEmail || "").toLowerCase() === email);
          const selfMatch =
            (e.linkedUid && e.linkedUid === uid) ||
            (!!email && (e.email || "").toLowerCase() === email);
          if ((isDeptLead(role) && evaluatorMatch) || selfMatch) {
            ids.add(e.departmentId);
          }
        }
      } catch {
        /* employees not readable — keep whatever we resolved above */
      }

      if (cancelled) return;
      setDepartmentIds([...ids]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, email, role, authLoading, user]);

  return { departmentIds, loading, isAdmin: role === "admin" };
}

// Convenience: filter a department list down to the caller's scope.
export function scopeDepartments<T extends { id: string }>(
  departments: T[],
  departmentIds: string[] | null
): T[] {
  if (departmentIds === null) return departments;
  const allow = new Set(departmentIds);
  return departments.filter((d) => allow.has(d.id));
}
