import { z } from "zod";

// Shared primitive schemas
export const uuidSchema = z.string().uuid();
export const optionalUuidSchema = uuidSchema.optional().or(z.literal("")).transform(v => v || undefined);

export const trimmedTextSchema = (max: number) =>
  z.string().trim().min(1, "Required").max(max, `Must be ${max} characters or less`);

export const optionalTextSchema = (max: number) =>
  z.string().trim().max(max, `Must be ${max} characters or less`).optional().or(z.literal("")).transform(v => v || undefined);

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), "Invalid calendar date");

export const positiveNumberSchema = z.number().positive("Must be a positive number");
export const nonNegativeNumberSchema = z.number().nonnegative("Must be zero or greater");

export const userRoleSchema = z.enum(["admin", "manager", "sales", "crew", "finance"]);

export const masterTableSchema = z.enum(["services", "events", "deliverables", "agencies", "crew_members"]);

export const accountingTypeSchema = z.enum(["income", "expense"]);
export const accountingStatusSchema = z.enum(["active", "inactive"]);

export const invoiceTypeSchema = z.enum(["gst", "non_gst"]);

// User Management schemas
export const createUserSchema = z.object({
  name: trimmedTextSchema(100),
  email: z.string().trim().email("Invalid email address").max(254),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: userRoleSchema,
});

export const updateUserDetailsSchema = z.object({
  name: trimmedTextSchema(100),
  role: userRoleSchema,
});

// Master data schemas
export const upsertMasterSchema = z.object({
  table: masterTableSchema,
  data: z.record(z.string(), z.any()),
  id: uuidSchema.optional(),
});

export const deleteMasterSchema = z.object({
  table: masterTableSchema,
  id: uuidSchema,
});

// Settings schema
export const updateSettingsSchema = z.object({
  key: trimmedTextSchema(100),
  value: z.string(),
});

// Invoice schemas
export const createInvoiceSchema = z.object({
  orderId: uuidSchema,
  invoiceType: invoiceTypeSchema,
  amount: positiveNumberSchema,
});

// Accounting schemas
export const addCategorySchema = z.object({
  name: trimmedTextSchema(100),
  type: accountingTypeSchema,
  status: accountingStatusSchema.optional().default("active"),
});

export const updateCategorySchema = z.object({
  id: uuidSchema,
  updates: z.object({
    name: trimmedTextSchema(100).optional(),
    status: accountingStatusSchema.optional(),
  }).partial(),
});

export const addAccountSchema = z.object({
  name: trimmedTextSchema(100),
  openingBalance: nonNegativeNumberSchema,
});

export const updateAccountSchema = z.object({
  id: uuidSchema,
  updates: z.object({
    name: trimmedTextSchema(100).optional(),
    status: accountingStatusSchema.optional(),
  }).partial(),
});

export const addEntrySchema = z.object({
  type: accountingTypeSchema,
  accountId: uuidSchema,
  categoryId: uuidSchema,
  amount: positiveNumberSchema,
  entryDate: dateStringSchema,
  remarks: optionalTextSchema(2000),
});

export const updateEntrySchema = z.object({
  id: uuidSchema,
  updates: z.object({
    amount: positiveNumberSchema.optional(),
    entry_date: dateStringSchema.optional(),
    remarks: optionalTextSchema(2000).optional(),
  }).partial(),
});

// Orders schemas
export const updateOrderTotalSchema = z.object({
  orderId: uuidSchema,
  totalAmount: nonNegativeNumberSchema,
});

export const updateOrderStatusSchema = z.object({
  id: uuidSchema,
  status: z.string().trim().min(1),
});

export const updateOrderAgreementContentSchema = z.object({
  orderId: uuidSchema,
  agreementContent: z.string(),
});

export const allocateCrewSchema = z.object({
  orderId: uuidSchema,
  orderServiceId: uuidSchema,
  crewMemberIds: z.array(uuidSchema),
});

export const addPaymentSchema = z.object({
  orderId: uuidSchema,
  amount: positiveNumberSchema,
  paymentDate: dateStringSchema,
  notes: optionalTextSchema(1000),
});

export const deletePaymentSchema = z.object({
  paymentId: uuidSchema,
  orderId: uuidSchema,
});

export const updatePaymentSchema = z.object({
  paymentId: uuidSchema,
  orderId: uuidSchema,
  amount: positiveNumberSchema,
  paymentDate: dateStringSchema,
  notes: optionalTextSchema(1000),
});

export const addProductionJobSchema = z.object({
  orderId: uuidSchema,
  agencyId: uuidSchema,
  serviceId: uuidSchema,
  payableAmount: positiveNumberSchema,
});

export const updateProductionJobStatusSchema = z.object({
  jobId: uuidSchema,
  status: z.string().trim().min(1),
  orderId: uuidSchema,
});

export const updateProductionJobSchema = z.object({
  jobId: uuidSchema,
  orderId: uuidSchema,
  agencyId: uuidSchema,
  serviceId: uuidSchema,
  payableAmount: positiveNumberSchema,
  status: z.string().trim().min(1),
});

export const deleteProductionJobSchema = z.object({
  jobId: uuidSchema,
  orderId: uuidSchema,
});

export const updateOrderBasicSchema = z.object({
  id: uuidSchema,
  data: z.object({
    couple_name: trimmedTextSchema(120),
    your_name: trimmedTextSchema(80),
    contact_number: z.string().trim().regex(/^\+?\d{10}$/, "Invalid contact number"),
    email: z.string().trim().email().optional().or(z.literal("")).transform(v => v || undefined),
    event_location: trimmedTextSchema(160),
    wedding_date: dateStringSchema,
    wedding_venue: optionalTextSchema(160),
    budget_range: z.string().trim().min(1),
    total_amount: nonNegativeNumberSchema,
    invoice_type: invoiceTypeSchema.optional(),
    status: z.string().trim().optional(),
  }),
});

// Quotations schemas
export const servicePersonSchema = z.object({
  service_id: uuidSchema,
  person_count: z.number().int().positive(),
});

export const updateQuotationDeliverablesSchema = z.object({
  quotationId: uuidSchema,
  deliverableIds: z.array(uuidSchema),
  servicePersons: z.array(servicePersonSchema),
});

export const updateQuotationServicePersonsSchema = z.object({
  quotationId: uuidSchema,
  servicePersons: z.array(servicePersonSchema),
});

export const updateQuotationDeliverableSelectionSchema = z.object({
  quotationId: uuidSchema,
  deliverableIds: z.array(uuidSchema),
});

export const updateQuotationTermsSchema = z.object({
  quotationId: uuidSchema,
  terms: z.string(),
});

export const updateQuotationStatusSchema = z.object({
  id: uuidSchema,
  status: z.string().trim().min(1),
});

export const convertQuotationToOrderSchema = z.object({
  quotationId: uuidSchema,
  subtotalAmount: nonNegativeNumberSchema,
  invoiceType: invoiceTypeSchema,
  servicePersons: z.array(servicePersonSchema).optional(),
  deliverableIds: z.array(uuidSchema).optional(),
});

export const updateQuotationBasicSchema = z.object({
  id: uuidSchema,
  data: z.object({
    couple_name: trimmedTextSchema(120),
    your_name: trimmedTextSchema(80),
    contact_number: z.string().trim().regex(/^\+?\d{10}$/, "Invalid contact number"),
    email: z.string().trim().email().optional().or(z.literal("")).transform(v => v || undefined),
    event_location: trimmedTextSchema(160),
    wedding_date: dateStringSchema,
    wedding_venue: optionalTextSchema(160),
    budget_range: z.string().trim().min(1),
    status: z.string().trim().optional(),
    amount: nonNegativeNumberSchema.optional(),
  }),
});
