import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES = {
  critical: "bg-critical-soft text-critical",
  low: "bg-low-soft text-low",
  ok: "bg-ok-soft text-ok",
  neutral: "bg-background text-muted border border-border",
  accent: "bg-accent-soft text-accent",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function BloodGroup({ group }: { group: string }) {
  return (
    <span className="inline-flex min-w-9 justify-center rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent">
      {group}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`mb-4 rounded-md px-4 py-3 text-sm ${TONES[tone]}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Placeholder for pages Member B has not built yet. */
export function MemberBPlaceholder({ title, what }: { title: string; what: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="text-sm">
          <Badge>Member B</Badge> <span className="ml-2 text-muted">{what}</span>
        </p>
      </Card>
    </>
  );
}

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.replace(" ", "T")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (s: string | Date | null | undefined) =>
  s
    ? new Date(typeof s === "string" ? s.replace(" ", "T") : s).toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";
