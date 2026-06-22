"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { Department } from "@/types";
import { SEED_DEPARTMENTS } from "@/lib/seed-data";

// Loads departments from Firestore. If the collection is empty or the
// read fails (e.g. local dev without Firebase configured), it falls back
// to clearly-labeled mock seed data so the UI is always populated.
export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // No Firebase configured → straight to mock data.
      if (!firebaseReady) {
        setDepartments(SEED_DEPARTMENTS);
        setIsMock(true);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDocs(collection(db, "departments"));
        if (!snap.empty) {
          const data = snap.docs.map((d) => d.data() as Department);
          if (!cancelled) {
            setDepartments(data);
            setIsMock(false);
          }
        } else {
          if (!cancelled) {
            setDepartments(SEED_DEPARTMENTS);
            setIsMock(true);
          }
        }
      } catch {
        if (!cancelled) {
          setDepartments(SEED_DEPARTMENTS);
          setIsMock(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { departments, isMock, loading };
}
