export type UserRole = "admin" | "manager" | "sales";
export type RecordStatus = "active" | "inactive";
export type LeadSource = "public_form" | "admin_manual" | "user_management";
export type LeadStatus = "pending" | "convert_to_quotation" | "cancelled";
export type QuotationStatus = "pending" | "convert_to_order" | "cancelled";
export type OrderStatus = "pending" | "convert_to_production" | "cancelled" | "complete";
export type ProductionJobStatus = "pending" | "in_progress" | "done";
export type PaymentStatus = "paid" | "partial_paid" | "unpaid";
export type InvoiceType = "gst" | "non_gst";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  status: RecordStatus;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  name: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface Deliverable {
  id: string;
  title: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface Agency {
  id: string;
  company_name: string;
  person_name: string;
  contact_number: string;
  address: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  agency_services?: { service_id: string }[];
}

export interface CrewMember {
  id: string;
  name: string;
  contact_number: string;
  address: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  crew_member_services?: { service_id: string }[];
}

export interface Lead {
  id: string;
  source: LeadSource;
  status: LeadStatus;
  your_name: string;
  couple_name: string;
  referral_source: string | null;
  contact_number: string;
  email: string | null;
  event_location: string;
  wedding_date: string;
  wedding_venue: string | null;
  album_requirement: string;
  drone_requirement: string;
  shooting_side: string;
  pre_wedding_shoot: string;
  functions_count: number;
  has_additional_info: boolean;
  additional_details: string | null;
  admin_notes: string | null;
  agreement_accepted: boolean;
  budget_range: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lead_function_days?: LeadFunctionDay[];
}

export interface LeadFunctionDay {
  id: string;
  lead_id: string;
  day_index: number;
  day_date: string;
  first_event_id: string | null;
  second_event_id: string | null;
  lead_function_day_services?: { service_id: string }[];
}

export interface Quotation {
  id: string;
  status: QuotationStatus;
  your_name: string;
  couple_name: string;
  referral_source: string | null;
  contact_number: string;
  email: string | null;
  event_location: string;
  wedding_date: string;
  wedding_venue: string | null;
  album_requirement: string;
  drone_requirement: string;
  shooting_side: string;
  pre_wedding_shoot: string;
  functions_count: number;
  has_additional_info: boolean;
  additional_details?: string | null;
  admin_notes?: string | null;
  terms_and_conditions?: string | null;
  budget_range: string;
  original_lead_id: string | null;
  created_by: string | null;
  amount?: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  quotation_id: string;
  status: OrderStatus;
  couple_name: string;
  your_name: string;
  contact_number: string;
  email: string | null;
  event_location: string;
  wedding_date: string;
  budget_range: string | null;
  admin_notes?: string | null;
  agreement_content?: string | null;
  invoice_type: InvoiceType;
  subtotal_amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  order_deliverables?: { deliverable_id: string }[];
}

export interface Customer {
  id: string;
  couple_name: string;
  contact_number: string;
  email: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionJob {
  id: string;
  order_id: string;
  agency_id: string;
  service_id: string;
  payable_amount: number;
  status: ProductionJobStatus;
  created_at: string;
}

export interface Expense {
  id: string;
  source: "production_job" | "manual";
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
}

export interface AccountingCategory {
  id: string;
  name: string;
  type: "income" | "expense";
  status: RecordStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountingAccount {
  id: string;
  name: string;
  opening_balance: number;
  status: RecordStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  total_in?: number;
  total_out?: number;
  current_balance?: number;
  entry_count?: number;
}

export interface AccountingEntry {
  id: string;
  type: "income" | "expense";
  account_id: string;
  category_id: string;
  amount: number;
  entry_date: string;
  remarks: string | null;
  source: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  account_name?: string;
  category_name?: string;
  category_type?: "income" | "expense";
}
