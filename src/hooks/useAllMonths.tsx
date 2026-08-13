"use client";

import { useEffect, useState } from "react";
import { collectionGroup, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { MonthlyEvaluation } from "@/types";

// Every recorded evaluation, for reporting (trend, coverage, last-scored
// dates). One collection-group read; callers scope the results. Fails
// soft to an empty list so a report still renders from the current
// scores when month history isn't readable.
export function useAllMonths() {
  const [months, setMonths] = useState<MonthlyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        const snap = await getDocs(collectionGroup(db, "months"));
        if (cancelled) return;
        setMonths(snap.docs.map((d) => d.data() as MonthlyEvaluation));
      } catch {
        if (!cancelled) setMonths([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { months, loading };
}
