"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import {
  ALBUM_OPTIONS,
  BUDGET_RANGES,
  DRONE_OPTIONS,
  LEAD_REFERRAL_OPTIONS,
  LEAD_STATUSES,
  PRE_WEDDING_OPTIONS,
  SHOOTING_SIDE_OPTIONS,
} from "@/lib/constants";
import { checkDbRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import type { LeadSource } from "@/types/database";
import { withSafeError } from "@/lib/security/errors";
import { createPublicLead } from "@/lib/data/service-role/leads";
import { getCurrentAuthUserId } from "@/lib/data/auth";
import {
  createAdminLead,
  updateLead as dalUpdateLead,
  updateLeadStatus as dalUpdateLeadStatus,
  convertLeadToQuotation as dalConvertLeadToQuotation,
  deleteLead as dalDeleteLead,
} from "@/lib/data/leads";
import { uuidSchema, servicePersonSchema, nonNegativeNumberSchema } from "@/lib/security/schemas";

export interface FunctionDayInput {
  day_index: number;
  day_date: string;
  first_event_id: string;
  second_event_id?: string;
  service_ids: string[];
}

export interface LeadFormInput {
  your_name: string;
  couple_name: string;
  referral_source: string;
  contact_number: string;
  email?: string;
  event_location: string;
  wedding_date: string;
  wedding_venue?: string;
  album_requirement: string;
  drone_requirement: string;
  shooting_side: string;
  pre_wedding_shoot: string;
  functions_count: number;
  has_additional_info: boolean;
  additional_details?: string;
  agreement_accepted: boolean;
  budget_range: string;
  function_days: FunctionDayInput[];
  source?: LeadSource;
  status?: string;
}

const leadStatusValues = LEAD_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];

const trimmedText = (max: number) =>
  z.string().trim().min(1, "Required").max(max, `Must be ${max} characters or less`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or less`)
    .optional()
    .transform((value) => value || undefined);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Invalid date");

const functionDaySchema = z
  .object({
    day_index: z.number().int().min(1).max(30),
    day_date: dateString,
    first_event_id: z.string().uuid(),
    second_event_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || undefined),
    service_ids: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict()
  .transform((day) => ({
    ...day,
    service_ids: Array.from(new Set(day.service_ids)),
  }));

const leadInputSchema = z
  .object({
    your_name: trimmedText(80).regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "Invalid name"),
    couple_name: trimmedText(120).regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' &-]+$/, "Invalid couple name"),
    referral_source: z.enum(LEAD_REFERRAL_OPTIONS),
    contact_number: z.string().trim().regex(/^\+?\d{10}$/, "Invalid contact number"),
    email: z.email().max(254).optional().or(z.literal("")).transform((value) => value || undefined),
    event_location: trimmedText(160),
    wedding_date: dateString,
    wedding_venue: optionalText(160),
    album_requirement: z.enum(ALBUM_OPTIONS),
    drone_requirement: z.enum(DRONE_OPTIONS),
    shooting_side: z.enum(SHOOTING_SIDE_OPTIONS),
    pre_wedding_shoot: z.enum(PRE_WEDDING_OPTIONS),
    functions_count: z.number().int().min(1).max(30),
    has_additional_info: z.boolean(),
    additional_details: optionalText(2000),
    agreement_accepted: z.literal(true),
    budget_range: z.enum(BUDGET_RANGES),
    function_days: z.array(functionDaySchema).min(1).max(30),
    source: z.enum(["public_form", "admin_manual", "user_management"]).optional(),
    status: z.enum(leadStatusValues).optional(),
  })
  .strict()
  .refine((input) => input.function_days.length === input.functions_count, {
    path: ["function_days"],
    message: "Function day count must match functions count",
  })
  .refine(
    (input) => !input.has_additional_info || Boolean(input.additional_details?.trim()),
    { path: ["additional_details"], message: "Additional details are required" }
  );

type ParsedLeadInput = z.infer<typeof leadInputSchema>;

async function getClientIp() {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown"
  );
}

export async function createLead(input: LeadFormInput) {
  return withSafeError(async () => {
    const parsed = leadInputSchema.parse(input);
    const currentUserId = await getCurrentAuthUserId();

    if (currentUserId) {
      await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
      const leadId = await createAdminLead(parsed as ParsedLeadInput);
      revalidatePath("/leads");
      return leadId;
    } else {
      const ip = await getClientIp();
      const allowed = await checkDbRateLimit(rateLimitKey("public-lead", ip), {
        maxTokens: 5.0,
        refillRatePerSec: 5.0 / 3600.0,
        cost: 1.0,
      });
      if (!allowed) {
        throw new Error("Too many inquiry submissions. Please try again later.");
      }

      const leadId = await createPublicLead(parsed as ParsedLeadInput);
      revalidatePath("/leads");
      return leadId;
    }
  });
}

export async function updateLeadStatus(id: string, status: string) {
  return withSafeError(async () => {
    const parsed = z.object({
      id: uuidSchema,
      status: z.enum(leadStatusValues),
    }).parse({ id, status });

    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    await dalUpdateLeadStatus(parsed.id, parsed.status);
    revalidatePath("/leads");
    revalidatePath(`/leads/${parsed.id}`);
  });
}

export async function convertLeadToQuotation(
  leadId: string,
  servicePersons: { service_id: string; person_count: number }[] = [],
  deliverableIds: string[] = [],
  amount = 0
) {
  return withSafeError(async () => {
    const parsed = z.object({
      leadId: uuidSchema,
      servicePersons: z.array(servicePersonSchema),
      deliverableIds: z.array(uuidSchema),
      amount: nonNegativeNumberSchema,
    }).parse({ leadId, servicePersons, deliverableIds, amount });

    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const quotationId = await dalConvertLeadToQuotation(
      parsed.leadId,
      parsed.servicePersons,
      parsed.deliverableIds,
      parsed.amount
    );
    revalidatePath("/leads");
    revalidatePath("/quotations");
    return quotationId;
  });
}

export async function deleteLead(id: string) {
  return withSafeError(async () => {
    await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
    await dalDeleteLead(id);
    revalidatePath("/leads");
  });
}

export async function updateLead(id: string, input: LeadFormInput) {
  return withSafeError(async () => {
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const parsed = leadInputSchema.parse(input);
    await dalUpdateLead(id, parsed as ParsedLeadInput);
    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
  });
}
