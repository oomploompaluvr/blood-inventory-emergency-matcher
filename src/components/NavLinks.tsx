"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string; owner: "A" | "B" }[] }) {
  const pathname = usePathname();
  // Longest matching prefix wins, so /screening/report does not also highlight /screening.
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={`rounded-md px-3 py-2 text-sm whitespace-nowrap ${
        item.href === active ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"
      }`}
    >
      {item.label}
    </Link>
  ));
}
