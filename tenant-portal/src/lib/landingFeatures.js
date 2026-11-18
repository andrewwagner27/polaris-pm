// Every capability is labelled with its real status in production. "Available" means a user can do it today;
// "Coming soon" means it is built but not switched on; "Planned" means it is not built or not reachable yet.
// Keep this list honest: tests/landing-claims.test.mjs checks the statuses of the features that are not live.
export const FEATURES_LANDLORD = [
  { title: "Maintenance coordination", sub: "Tickets with photos, contractor assignment, quotes you approve, completion review", status: "Available" },
  { title: "Action-first dashboard",   sub: "Urgent issues, approvals and lease deadlines, by property", status: "Available" },
  { title: "Tenant & lease records",   sub: "Leases, contact details, invitations and portal access", status: "Available" },
  { title: "Tenant messaging",         sub: "AI assistant for common questions, with urgent issues escalated to you", status: "Available" },
  { title: "Expense & payment records", sub: "Record payments received and expenses paid", status: "Available" },
  { title: "Online rent collection",   sub: "ACH payments through Stripe", status: "Coming soon" },
  { title: "Financial report exports", sub: "Downloadable P&L, rent roll and delinquency reports", status: "Planned" },
  { title: "Debt & DSCR analysis",     sub: "Amortization and lender metrics", status: "Planned" },
];

export const FEATURES_TENANT = [
  { title: "Maintenance requests", sub: "Photos, status updates, and safety guidance for emergencies", status: "Available" },
  { title: "Messages",             sub: "Ask questions any time; tap “Talk to a person” for management", status: "Available" },
  { title: "Lease & documents",    sub: "Your lease dates and documents in one place", status: "Available" },
  { title: "Community bulletin",   sub: "Building notices and neighbor posts", status: "Available" },
  { title: "Pay rent online",      sub: "Bank (ACH) payments", status: "Coming soon" },
  { title: "Autopay",              sub: "Automatic monthly rent payments", status: "Planned" },
  { title: "Downloadable ledger",  sub: "Payment history PDF", status: "Planned" },
];
