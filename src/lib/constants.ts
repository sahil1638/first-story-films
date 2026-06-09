export const APP_NAME = "First Story Films";

export const LEAD_REFERRAL_OPTIONS = [
  "Our Instagram Page (First Story Films)",
  "Facebook",
  "Referral by our Couples",
] as const;

export const ALBUM_OPTIONS = [
  "Yes",
  "Yes, I want a Physical Album",
  "No, Only Digital Photos Required",
] as const;

export const DRONE_OPTIONS = ["Yes", "No"] as const;

export const SHOOTING_SIDE_OPTIONS = [
  "Groom Side",
  "Bride Side",
  "Both Side (Bride Side & Groom Side)",
] as const;

export const PRE_WEDDING_OPTIONS = [
  "Only Photography",
  "Photography and Cinematography",
  "No",
] as const;

export const BUDGET_RANGES = [
  "Rs. 5,000 - 10,000",
  "Rs. 15,000 - 20,000",
  "Rs. 20,000 - 25,000",
  "Rs. 25,000 - 50,000",
  "Rs. 50,000 - 75,000",
  "Rs. 75,000 - 1,00,000",
  "Rs. 1,00,000 - 1,25,000",
  "Rs. 1,25,000 - 1,50,000",
  "Rs. 1,50,000 - 1,75,000",
  "Rs. 1,75,000 - 2,00,000",
  "Rs. 2,00,000 - 2,50,000",
  "Rs. 3,00,000 - 3,50,000",
  "Rs. 3,50,000 - 4,00,000",
  "Rs. 4,00,000 - 4,50,000",
  "Rs. 4,50,000 - 5,00,000",
  "Rs. 5,00,000 - 5,50,000",
  "Rs. 5,50,000 - 6,00,000",
  "Rs. 6,00,000 - 6,50,000",
] as const;

export const LEAD_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "convert_to_quotation", label: "Convert to Quotation" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const QUOTATION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "convert_to_order", label: "Convert to Order" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const ORDER_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "convert_to_production", label: "Convert to Production" },
  { value: "cancelled", label: "Cancelled" },
  { value: "complete", label: "Complete" },
] as const;

export const JOB_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
] as const;

export type UserRole = "admin" | "manager" | "sales";

export const NAV_ITEMS: {
  href: string;
  label: string;
  roles: UserRole[];
  icon: string;
}[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager", "sales"], icon: "LayoutDashboard" },
  { href: "/masters/services", label: "Masters", roles: ["admin", "manager"], icon: "Database" },
  { href: "/leads", label: "Leads", roles: ["admin", "manager", "sales"], icon: "Users" },
  { href: "/quotations", label: "Quotations", roles: ["admin", "manager", "sales"], icon: "FileText" },
  { href: "/orders", label: "Orders", roles: ["admin", "manager", "sales"], icon: "ShoppingBag" },
  { href: "/accounting", label: "Accounting", roles: ["admin", "manager"], icon: "Calculator" },
  { href: "/customers", label: "Customers", roles: ["admin", "manager"], icon: "Heart" },
  { href: "/settings", label: "Settings", roles: ["admin", "manager"], icon: "Settings" },
  { href: "/users", label: "User Management", roles: ["admin"], icon: "Shield" },
];

export const MASTER_LINKS = [
  { href: "/masters/services", label: "Services" },
  { href: "/masters/events", label: "Events" },
  { href: "/masters/deliverables", label: "Deliverables" },
  { href: "/masters/agencies", label: "Agencies" },
  { href: "/masters/crew", label: "Videographers / Photographers" },
] as const;
