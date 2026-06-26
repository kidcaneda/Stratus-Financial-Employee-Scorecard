"use client";

import { Status } from "@/types";
import { statusClasses, fmt } from "@/lib/scoring";

// Time-aware greeting header (Image 2). Personal, lightly playful.
export function GreetingHeader({
  name,
  subtitle,
}: {
  name: string;
  subtitle?: string;
}) {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const icon = hour < 12 ? "☀️" : hour < 18 ? "🌤️" : "🌙";
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
          <span>{icon}</span> {part}, {name}
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {subtitle ?? "Here's how performance is tracking."}
        </p>
      </div>
    </div>
  );
}

// Encouragement chip based on a score (Image 2's "Fantastic job 🔥").
export function EncouragementChip({ score }: { score: number }) {
  const { label, emoji, cls } =
    score >= 90
      ? { label: "Outstanding", emoji: "🔥", cls: "bg-signal-greenbg text-signal-green" }
      : score >= 70
      ? { label: "On track — keep going", emoji: "💪", cls: "bg-signal-amberbg text-signal-amber" }
      : { label: "Needs focus", emoji: "🎯", cls: "bg-signal-redbg text-signal-red" };
  return (
    <span className={`pill ${cls}`}>
      <span>{emoji}</span> {label}
    </span>
  );
}

// Avatar with initials (no external images needed). Deterministic color.
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  // Deterministic hue from the name.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${h} 60% 45%), hsl(${(h + 40) % 360} 60% 38%))`,
      }}
    >
      {initials || "?"}
    </span>
  );
}

// Podium leaderboard (Image 3). Top 3 get medals; rest list below.
export interface RankedItem {
  id: string;
  name: string;
  score: number;
  status: Status;
  sub?: string;
}

export function Podium({ items }: { items: RankedItem[] }) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  // Visual podium order: 2nd, 1st, 3rd.
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const medals = ["silver", "gold", "bronze"] as const;
  const heights = [96, 128, 80];

  return (
    <div className="space-y-5">
      {/* Podium */}
      <div className="flex items-end justify-center gap-4">
        {order.map((it, i) => {
          if (!it) return null;
          const isFirst = it.id === top3[0]?.id;
          const medalColor =
            medals[i] === "gold" ? "#F5C451" : medals[i] === "silver" ? "#C5CEDD" : "#D8965A";
          const rank = it.id === top3[0]?.id ? 1 : it.id === top3[1]?.id ? 2 : 3;
          return (
            <div key={it.id} className="flex flex-col items-center" style={{ width: 100 }}>
              <div className="relative">
                <Avatar name={it.name} size={isFirst ? 64 : 52} />
                <span
                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-canvas"
                  style={{ background: medalColor }}
                >
                  {rank}
                </span>
              </div>
              <div className="mt-2 max-w-[100px] truncate text-center text-sm font-medium text-ink">
                {it.name}
              </div>
              <div className="text-sm font-semibold tabular-nums text-ink">
                {fmt(it.score, 0)}
              </div>
              <div
                className="mt-2 w-full rounded-t-lg"
                style={{
                  height: heights[i],
                  background: `linear-gradient(180deg, ${medalColor}33, ${medalColor}0D)`,
                  borderTop: `2px solid ${medalColor}`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Remaining ranks */}
      {rest.length > 0 && (
        <div className="divide-y divide-hairline">
          {rest.map((it, i) => {
            const c = statusClasses(it.status);
            return (
              <div key={it.id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-center text-sm tabular-nums text-ink-muted">
                  {i + 4}
                </span>
                <Avatar name={it.name} size={28} />
                <span className="flex-1 truncate text-sm text-ink">{it.name}</span>
                {it.sub && <span className="text-xs text-ink-muted">{it.sub}</span>}
                <span className={`text-sm font-semibold tabular-nums ${c.text}`}>
                  {fmt(it.score, 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
