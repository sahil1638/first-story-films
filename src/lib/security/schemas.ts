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

export const userRoleSchema = z.enum(["admin", "manager", "sales"]);

export const masterTableSchema = z.enum(["services", "events", "deliverables", "agencies", "crew_members"]);

export const accountingTypeSchema = z.enum(["income", "expense"]);
export const accountingStatusSchema = z.enum(["active", "inactive"]);

export const invoiceTypeSchema = z.enum(["gst", "non_gst"]);
export const sortOrderSchema = z.enum(["asc", "desc"]);

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
const masterStatusSchema = accountingStatusSchema;

export const serviceMasterDataSchema = z.object({
  name: trimmedTextSchema(100).optional(),
  description: optionalTextSchema(2000).nullable(),
  status: masterStatusSchema.optional(),
}).strict();

export const eventMasterDataSchema = z.object({
  name: trimmedTextSchema(100).optional(),
  status: masterStatusSchema.optional(),
}).strict();

export const deliverableMasterDataSchema = z.object({
  title: trimmedTextSchema(120).optional(),
  status: masterStatusSchema.optional(),
}).strict();

export const agencyMasterDataSchema = z.object({
  company_name: trimmedTextSchema(120).optional(),
  person_name: trimmedTextSchema(100).optional(),
  contact_number: z.string().trim().regex(/^\+?\d{10}$/, "Invalid contact number").optional(),
  address: optionalTextSchema(500).nullable(),
  status: masterStatusSchema.optional(),
}).strict();

export const crewMemberMasterDataSchema = z.object({
  name: trimmedTextSchema(100).optional(),
  contact_number: z.string().trim().regex(/^\+?\d{10}$/, "Invalid contact number").optional(),
  address: optionalTextSchema(500).nullable(),
  status: masterStatusSchema.optional(),
}).strict();

export const upsertServiceMasterSchema = z.object({
  table: z.literal("services"),
  data: serviceMasterDataSchema.refine((data) => data.name || data.status, "Service name or status is required"),
  id: uuidSchema.optional(),
}).strict().superRefine((payload, ctx) => {
  if (!payload.id && !payload.data.name) {
    ctx.addIssue({ code: "custom", path: ["data", "name"], message: "Service name is required" });
  }
});

export const upsertEventMasterSchema = z.object({
  table: z.literal("events"),
  data: eventMasterDataSchema.refine((data) => data.name || data.status, "Event name or status is required"),
  id: uuidSchema.optional(),
}).strict().superRefine((payload, ctx) => {
  if (!payload.id && !payload.data.name) {
    ctx.addIssue({ code: "custom", path: ["data", "name"], message: "Event name is required" });
  }
});

export const upsertDeliverableMasterSchema = z.object({
  table: z.literal("deliverables"),
  data: deliverableMasterDataSchema.refine((data) => data.title || data.status, "Deliverable title or status is required"),
  id: uuidSchema.optional(),
}).strict().superRefine((payload, ctx) => {
  if (!payload.id && !payload.data.title) {
    ctx.addIssue({ code: "custom", path: ["data", "title"], message: "Deliverable title is required" });
  }
});

export const upsertAgencyMasterSchema = z.object({
  table: z.literal("agencies"),
  data: agencyMasterDataSchema.refine(
    (data) => data.company_name || data.person_name || data.contact_number || data.status,
    "Agency details or status are required"
  ),
  id: uuidSchema.optional(),
  serviceIds: z.array(uuidSchema).default([]),
}).strict().superRefine((payload, ctx) => {
  if (payload.id) return;
  if (!payload.data.company_name) {
    ctx.addIssue({ code: "custom", path: ["data", "company_name"], message: "Company name is required" });
  }
  if (!payload.data.person_name) {
    ctx.addIssue({ code: "custom", path: ["data", "person_name"], message: "Contact person name is required" });
  }
  if (!payload.data.contact_number) {
    ctx.addIssue({ code: "custom", path: ["data", "contact_number"], message: "Contact number is required" });
  }
});

export const upsertCrewMemberMasterSchema = z.object({
  table: z.literal("crew_members"),
  data: crewMemberMasterDataSchema.refine(
    (data) => data.name || data.contact_number || data.status,
    "Crew member details or status are required"
  ),
  id: uuidSchema.optional(),
  serviceIds: z.array(uuidSchema).default([]),
}).strict().superRefine((payload, ctx) => {
  if (payload.id) return;
  if (!payload.data.name) {
    ctx.addIssue({ code: "custom", path: ["data", "name"], message: "Crew member name is required" });
  }
  if (!payload.data.contact_number) {
    ctx.addIssue({ code: "custom", path: ["data", "contact_number"], message: "Contact number is required" });
  }
});

export const upsertMasterSchema = z.discriminatedUnion("table", [
  upsertServiceMasterSchema,
  upsertEventMasterSchema,
  upsertDeliverableMasterSchema,
  upsertAgencyMasterSchema,
  upsertCrewMemberMasterSchema,
]);

export type UpsertMasterInput = z.infer<typeof upsertMasterSchema>;
export type MasterTableName = z.infer<typeof masterTableSchema>;
export type MasterDataForTable<T extends MasterTableName> = Extract<
  UpsertMasterInput,
  { table: T }
>["data"];

export const deleteMasterSchema = z.object({
  table: masterTableSchema,
  id: uuidSchema,
}).strict();

export const adminNotesTableSchema = z.enum(["leads", "quotations", "orders"]);

export const updateAdminNotesSchema = z.object({
  table: adminNotesTableSchema,
  recordId: uuidSchema,
  notes: optionalTextSchema(5000).nullable(),
});

export const loginRequestSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(254),
  password: z.string().min(1, "Password is required"),
});

// Settings schema
export const updateSettingsSchema = z.object({
  key: trimmedTextSchema(100),
  value: z.string(),
}).strict();

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

// Route payload/query schemas
export const pagedAccountFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const accountCreateSchema = z.object({
  name: trimmedTextSchema(100),
  openingBalance: nonNegativeNumberSchema,
  status: accountingStatusSchema.optional(),
});

export const accountUpdateRouteSchema = z.object({
  name: trimmedTextSchema(100).optional(),
  openingBalance: nonNegativeNumberSchema.optional(),
  status: accountingStatusSchema.optional(),
});

export const pagedCategoryFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const categoryCreateRouteSchema = z.object({
  name: trimmedTextSchema(100),
  type: accountingTypeSchema,
});

export const categoryUpdateRouteSchema = z.object({
  name: trimmedTextSchema(100).optional(),
  type: accountingTypeSchema.optional(),
});

export const entryFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  type: z.enum(["income", "expense", "both"]).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const entryCreateRouteSchema = z.object({
  type: accountingTypeSchema,
  accountId: uuidSchema,
  categoryId: uuidSchema,
  amount: positiveNumberSchema,
  entryDate: dateStringSchema,
  remarks: z.string().optional(),
});

export const entryUpdateRouteSchema = z.object({
  type: accountingTypeSchema.optional(),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  amount: positiveNumberSchema.optional(),
  entryDate: dateStringSchema.optional(),
  remarks: z.string().nullable().optional(),
});

export const exportAccountsSchema = pagedAccountFilterSchema.pick({
  search: true,
  status: true,
  sortBy: true,
  sortOrder: true,
});

export const exportCategoriesSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["income", "expense", "all"]).optional(),
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const entrySummaryFilterSchema = entryFilterSchema.pick({
  type: true,
  accountId: true,
  categoryId: true,
  dateFrom: true,
  dateTo: true,
  search: true,
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
