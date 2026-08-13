"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { AuditEntry } from "@/types";

// The immutable who-changed-what trail. Firestore rules restrict reads
// to admins, so this returns an empty list (and `permitted: false`) for
// anyone else rather than failing the page — the compliance report then
// renders without the trail section.
export function useAuditTrail() {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [permitted, setPermitted] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      if (!firebaseReady || !isAdmin) {
        if (!cancelled) {
          setEntries([]);
          setPermitted(false);
          setLoading(false);
        }
        return;
      }
      try {
        const snap = await getDocs(collection(db, "audit"));
        if (cancelled) return;
        setEntries(snap.docs.map((d) => d.data() as AuditEntry));
        setPermitted(true);
      } catch {
        if (!cancelled) {
          setEntries([]);
          setPermitted(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, authLoading]);

  return { entries, permitted, loading };
}
