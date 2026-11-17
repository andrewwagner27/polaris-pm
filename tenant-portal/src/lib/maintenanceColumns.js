// src/lib/maintenanceColumns.js
// The maintenance_requests columns signed-in clients (tenants AND landlords) may read. Migration
// 20261117000000_vendor_credentials_private grants SELECT on exactly these to "authenticated": vendor_token, vendor_pin,
// vendor_phone, vendor_email and work_order_accepted_ip are server-only, so select("*") is refused. The landlord app
// gets a ticket's vendor link + PIN from the landlord-only RPC landlord_vendor_access(). Keep in sync with the grant
// (tests/vendor-credentials.test.mjs checks both).
export const TICKET_COLUMNS = "id, tenant_id, unit_id, category, title, description, status, priority, photos, resolved_at, created_at, notes, vendor_name, scheduled_date, cost, property_name, updated_at, vendor_token_expires_at, availability, scheduled_time, entry_instructions, invoice_url, invoice_notes, nte_amount, quote_amount, quote_notes, quote_submitted_at, quote_approved_at, quote_approved_by, work_order_accepted_at, work_order_accepted_by, invoice_amount, receipts, owner_approval_required, owner_approved_at, billable_to_tenant, is_emergency, ai_generated, ai_intent_summary";
