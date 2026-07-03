"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { Department, Employee } from "@/types";
import { SEED_DEPARTMENTS } from "@/lib/seed-data";
import { SEED_EMPLOYEES } from "@/lib/seed-employees";

// Loads every employee across every department (admin audit view).
// One collection-group query + one departments read — two round trips
// regardless of department count. Falls back to seed data when
// Firestore is empty/unconfigured, mirroring the other hooks.
export function useAllEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fallback = () => {
        if (cancelled) return;
        setDepartments(SEED_DEPARTMENTS);
        setEmployees(Object.values(SEED_EMPLOYEES).flat());
        setIsMock(true);
        setLoading(false);
      };

      if (!firebaseReady) return fallback();

      try {
        const [empSnap, deptSnap] = await Promise.all([
          getDocs(collectionGroup(db, "employees")),
          getDocs(collection(db, "departments")),
        ]);
        if (cancelled) return;
        if (empSnap.empty) return fallback();
        setEmployees(empSnap.docs.map((d) => d.data() as Employee));
        setDepartments(deptSnap.docs.map((d) => d.data() as Department));
        setIsMock(false);
        setLoading(false);
      } catch {
        fallback();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { employees, departments, isMock, loading };
}
