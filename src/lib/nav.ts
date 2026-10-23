import type { Role } from "./session";

export interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  owner: "A" | "B";
}

// Role-specific navigation. Member B adds their pages to this list (owner: "B").
export const NAV: NavItem[] = [
  { href: "/me", label: "My donor profile", roles: ["donor"], owner: "A" },
  { href: "/screening/new", label: "Screening questionnaire", roles: ["donor"], owner: "A" },

  { href: "/stock", label: "Stock", roles: ["admin", "lab", "hospital"], owner: "A" },
  { href: "/donors", label: "Donors", roles: ["admin", "lab"], owner: "A" },
  { href: "/donations/new", label: "Record donation", roles: ["admin", "lab"], owner: "A" },
  { href: "/processing", label: "Component processing", roles: ["admin", "lab"], owner: "A" },
  { href: "/screening", label: "Screening", roles: ["admin", "lab"], owner: "A" },
  { href: "/screening/report", label: "Deferral report", roles: ["admin", "lab"], owner: "A" },
  { href: "/recall", label: "Donor recall", roles: ["admin", "lab"], owner: "A" },

  { href: "/lab", label: "Lab tests", roles: ["admin", "lab"], owner: "B" },
  { href: "/units", label: "Units", roles: ["admin", "lab"], owner: "B" },
  { href: "/requests", label: "Requests", roles: ["admin", "hospital"], owner: "B" },
  { href: "/emergency", label: "Emergency bundle", roles: ["admin", "hospital"], owner: "B" },
  { href: "/safety-recall", label: "Safety recall", roles: ["admin"], owner: "B" },
];

export const HOME: Record<Role, string> = {
  admin: "/stock",
  lab: "/stock",
  hospital: "/stock",
  donor: "/me",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  lab: "Lab technician",
  hospital: "Hospital",
  donor: "Donor",
};
