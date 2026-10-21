"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Ambient "local sky": next sunrise for the visitor, computed in the
   browser with the standard sunrise equation. No geolocation prompt —
   precise coordinates are used only if permission was already granted;
   otherwise longitude is estimated from the UTC offset.
------------------------------------------------------------------- */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const toJulian = (ms: number) => ms / DAY_MS + 2440587.5;
const fromJulian = (j: number) => (j - 2440587.5) * DAY_MS;

/** Sunrise (epoch ms) for the solar day containing `ms`, or null in polar day/night. */
function sunriseFor(ms: number, lat: number, lng: number): number | null {
  const n = Math.ceil(toJulian(ms) - 2451545.0 + 0.0008);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosW < -1 || cosW > 1) return null;
  return fromJulian(jTransit - Math.acos(cosW) / RAD / 360);
}

function nextSunrise(now: number, lat: number, lng: number): number | null {
  for (let d = -1; d <= 2; d++) {
    const t = sunriseFor(now + d * DAY_MS, lat, lng);
    if (t !== null && t > now) return t;
  }
  return null;
}

const pad = (v: number) => String(v).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const span = (ms: number) => {
  const mins = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
};

export type Sky = {
  ready: boolean;
  now: string;
  sunrise: string;
  until: string;
  /** 0..1 — how far through the night we are (drives the sun's dot on the arc). */
  progress: number;
};

const EMPTY: Sky = { ready: false, now: "--:--", sunrise: "--:--", until: "–h –m", progress: 0.5 };

export function useLocalSky(): Sky {
  const [sky, setSky] = useState<Sky>(EMPTY);

  useEffect(() => {
    let lat = 20;
    let lng = (-new Date().getTimezoneOffset() / 60) * 15;
    let cancelled = false;

    const tick = () => {
      const now = Date.now();
      const rise = nextSunrise(now, lat, lng);
      if (cancelled) return;
      if (rise === null) {
        setSky({ ready: true, now: clock(now), sunrise: "—", until: "—", progress: 0.5 });
        return;
      }
      const prev = rise - DAY_MS;
      setSky({
        ready: true,
        now: clock(now),
        sunrise: clock(rise),
        until: span(rise - now),
        progress: Math.min(1, Math.max(0, (now - prev) / DAY_MS)),
      });
    };

    tick();
    const id = window.setInterval(tick, 30_000);

    // Upgrade to precise coordinates only if the visitor already allowed it.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state !== "granted") return;
        navigator.geolocation.getCurrentPosition((pos) => {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          tick();
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return sky;
}

/** Header instrument: horizon arc + next sunrise + local time. */
export function SkyPill({ className }: { className?: string }) {
  const sky = useLocalSky();
  // Dot rides a shallow arc; below the horizon line while it's night.
  const x = 6 + sky.progress * 52;
  const y = 13 + Math.sin(sky.progress * Math.PI) * 4;

  return (
    <div
      className={cn(
        "flex h-9 items-center gap-3 rounded-md border border-border bg-surface/70 pl-2 pr-3 font-mono",
        className
      )}
      title="Next sunrise where you are"
    >
      <svg viewBox="0 0 64 22" className="h-5 w-16 shrink-0" aria-hidden>
        <line x1="2" y1="11" x2="62" y2="11" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 2" />
        <path d="M6 13 Q 32 21 58 13" fill="none" stroke="var(--active)" strokeOpacity="0.55" strokeWidth="1" />
        <circle cx={x} cy={y} r="2.4" fill="var(--active)" />
      </svg>
      <div className="leading-[1.15]" aria-live="off">
        <p className="text-[9.5px] uppercase tracking-[0.14em] text-subtle">
          <span aria-hidden className="text-active">☀</span> Sunrise {sky.sunrise}
        </p>
        <p className="text-[11.5px] tabular-nums text-foreground">
          rises in {sky.until} <span className="text-subtle">·</span> {sky.now}
        </p>
      </div>
    </div>
  );
}

/** Inline ambient line used in the hero meta block. */
export function SkyLine({ className }: { className?: string }) {
  const sky = useLocalSky();
  return (
    <p className={cn("font-mono text-[11.5px] text-active", className)}>
      <span aria-hidden>✦</span> following your local sky · sunrise in {sky.until}
    </p>
  );
}
