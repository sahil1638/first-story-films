"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { AlertModal } from "@/components/ui/alert-modal";
import { cn } from "@/lib/utils";
import {
  ALBUM_OPTIONS,
  BUDGET_RANGES,
  DRONE_OPTIONS,
  LEAD_REFERRAL_OPTIONS,
  PRE_WEDDING_OPTIONS,
  SHOOTING_SIDE_OPTIONS,
  LEAD_STATUSES,
} from "@/lib/constants";
import { createLead, type FunctionDayInput, type LeadFormInput, updateLead } from "@/lib/actions/leads";
import { createClient } from "@/lib/supabase/client";
import type { Event, Service } from "@/types/database";

type FormState = {
  your_name: string;
  couple_name: string;
  referral_source: string;
  contact_number: string;
  email: string;
  event_location: string;
  wedding_date: string;
  wedding_venue: string;
  album_requirement: string;
  drone_requirement: string;
  shooting_side: string;
  pre_wedding_shoot: string;
  functions_count: number;
  has_additional_info: string;
  additional_details: string;
  agreement_accepted: boolean;
  budget_range: string;
  status: string;
};

const initial: FormState = {
  your_name: "",
  couple_name: "",
  referral_source: "",
  contact_number: "",
  email: "",
  event_location: "",
  wedding_date: "",
  wedding_venue: "",
  album_requirement: "",
  drone_requirement: "",
  shooting_side: "",
  pre_wedding_shoot: "",
  functions_count: 1,
  has_additional_info: "no",
  additional_details: "",
  agreement_accepted: false,
  budget_range: "",
  status: "pending",
};

const normalizeOption = (value: string | undefined, options: readonly string[]) =>
  value && options.includes(value) ? value : "";

export function PublicLeadForm({
  isDashboard = false,
  onSuccess,
  onCancel,
  initialData,
  events: initialEvents,
  services: initialServices,
}: {
  isDashboard?: boolean;
  onSuccess?: (leadId: string) => void;
  onCancel?: () => void;
  initialData?: LeadFormInput & { id: string };
  events?: Event[];
  services?: Service[];
} = {}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  
  const [form, setForm] = useState<FormState>(() => {
    if (initialData) {
      return {
        your_name: initialData.your_name || "",
        couple_name: initialData.couple_name || "",
        referral_source: normalizeOption(initialData.referral_source, LEAD_REFERRAL_OPTIONS),
        contact_number: initialData.contact_number || "",
        email: initialData.email || "",
        event_location: initialData.event_location || "",
        wedding_date: initialData.wedding_date || "",
        wedding_venue: initialData.wedding_venue || "",
        album_requirement: normalizeOption(initialData.album_requirement, ALBUM_OPTIONS),
        drone_requirement: normalizeOption(initialData.drone_requirement, DRONE_OPTIONS),
        shooting_side: normalizeOption(initialData.shooting_side, SHOOTING_SIDE_OPTIONS),
        pre_wedding_shoot: normalizeOption(initialData.pre_wedding_shoot, PRE_WEDDING_OPTIONS),
        functions_count: initialData.functions_count || 1,
        has_additional_info: initialData.has_additional_info ? "yes" : "no",
        additional_details: initialData.additional_details || "",
        agreement_accepted: true,
        budget_range: initialData.budget_range || "",
        status: initialData.status || "pending",
      };
    }
    return initial;
  });

  const [functionDays, setFunctionDays] = useState<FunctionDayInput[]>(() => {
    if (initialData?.function_days) {
      return initialData.function_days;
    }
    return [];
  });

  const [events, setEvents] = useState<Event[]>(initialEvents ?? []);
  const [services, setServices] = useState<Service[]>(initialServices ?? []);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  function showAlert(msg: string) {
    setError(msg);
    setAlertMessage(msg);
    setAlertOpen(true);
  }

  useEffect(() => {
    if (initialEvents && initialEvents.length > 0 && initialServices && initialServices.length > 0) {
      return;
    }

    const supabase = createClient();
    let isMounted = true;
    Promise.all([
      supabase.from("events").select("*").eq("status", "active"),
      supabase.from("services").select("*").eq("status", "active"),
    ]).then(([ev, sv]) => {
      if (isMounted) {
        setTimeout(() => {
          if (!initialEvents || initialEvents.length === 0) {
            setEvents(ev.data ?? []);
          }
          if (!initialServices || initialServices.length === 0) {
            setServices(sv.data ?? []);
          }
        }, 0);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [initialEvents, initialServices]);

  useEffect(() => {
    const count = Math.min(Math.max(form.functions_count, 1), 30);
    const timer = setTimeout(() => {
      setFunctionDays((prev) => {
        const next: FunctionDayInput[] = [];
        for (let i = 0; i < count; i++) {
          next.push(
            prev[i] ?? {
              day_index: i + 1,
              day_date: "",
              first_event_id: "",
              second_event_id: "",
              service_ids: [],
            }
          );
        }
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [form.functions_count]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function updateDay(index: number, patch: Partial<FunctionDayInput>) {
    setFunctionDays((days) =>
      days.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
    setErrors((e) => {
      const next = { ...e };
      let changed = false;
      for (const field of Object.keys(patch)) {
        const errorKey = `${field}_${index}`;
        if (next[errorKey]) {
          delete next[errorKey];
          changed = true;
        }
      }
      return changed ? next : e;
    });
  }

  function toggleService(dayIndex: number, serviceId: string) {
    setFunctionDays((days) =>
      days.map((d, i) => {
        if (i !== dayIndex) return d;
        const ids = d.service_ids.includes(serviceId)
          ? d.service_ids.filter((id) => id !== serviceId)
          : [...d.service_ids, serviceId];
        return { ...d, service_ids: ids };
      })
    );
  }

  function isValidPhone(value: string) {
    return /^\+?\d{10}$/.test(value.trim());
  }

  function isValidText(value: string) {
    return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(value.trim());
  }

  function isValidCoupleName(value: string) {
    return /^[A-Za-zÀ-ÖØ-öø-ÿ' &-]+$/.test(value.trim());
  }

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function hasAllowedValue(value: string, options: readonly string[]) {
    return options.includes(value);
  }

  function validateStep1() {
    const nextErrors: Record<string, string> = {};
    
    if (!form.your_name.trim()) {
      nextErrors.your_name = "Please enter your name.";
    } else if (!isValidText(form.your_name)) {
      nextErrors.your_name = "Name can only contain letters, spaces, apostrophes, and hyphens.";
    }

    if (!form.couple_name.trim()) {
      nextErrors.couple_name = "Please enter the couple's name.";
    } else if (!isValidCoupleName(form.couple_name)) {
      nextErrors.couple_name = "Couple name can only contain letters, spaces, apostrophes, ampersands, and hyphens.";
    }

    if (!hasAllowedValue(form.referral_source, LEAD_REFERRAL_OPTIONS)) {
      nextErrors.referral_source = "Please select how you came to know us.";
    }

    if (!form.contact_number.trim()) {
      nextErrors.contact_number = "Please enter a contact number.";
    } else if (!/^\+?[0-9]+$/.test(form.contact_number.trim())) {
      nextErrors.contact_number = "Contact number can only contain digits and an optional leading +.";
    } else if (!isValidPhone(form.contact_number)) {
      nextErrors.contact_number = "Contact number must be exactly 10 digits, with an optional leading +.";
    }

    if (form.email && !isValidEmail(form.email)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!form.event_location.trim()) {
      nextErrors.event_location = "Please enter the event location.";
    }

    if (!form.wedding_date) {
      nextErrors.wedding_date = "Please select the wedding date.";
    }

    if (!hasAllowedValue(form.album_requirement, ALBUM_OPTIONS)) {
      nextErrors.album_requirement = "Please select an album requirement.";
    }

    if (!hasAllowedValue(form.drone_requirement, DRONE_OPTIONS)) {
      nextErrors.drone_requirement = "Please select a drone shoot requirement.";
    }

    if (!hasAllowedValue(form.shooting_side, SHOOTING_SIDE_OPTIONS)) {
      nextErrors.shooting_side = "Please select the shooting side.";
    }

    if (!hasAllowedValue(form.pre_wedding_shoot, PRE_WEDDING_OPTIONS)) {
      nextErrors.pre_wedding_shoot = "Please select the pre-wedding shoot option.";
    }

    if (!Number.isInteger(form.functions_count) || form.functions_count < 1 || form.functions_count > 30) {
      nextErrors.functions_count = "Please enter a valid number of functions (1-30).";
    }

    return nextErrors;
  }

  function validateStep2() {
    const nextErrors: Record<string, string> = {};
    for (const [index, day] of functionDays.entries()) {
      if (!day.day_date) {
        nextErrors[`day_date_${index}`] = `Please select a date for Day ${index + 1}.`;
      }
      if (!day.first_event_id) {
        nextErrors[`first_event_id_${index}`] = `Please select the first event for Day ${index + 1}.`;
      }
    }
    return nextErrors;
  }

  function validateStep3() {
    const nextErrors: Record<string, string> = {};
    if (!form.has_additional_info) {
      nextErrors.has_additional_info = "Please select whether you have additional information.";
    }
    if (form.has_additional_info === "yes" && !form.additional_details.trim()) {
      nextErrors.additional_details = "Please provide additional event details.";
    }
    if (!hasAllowedValue(form.budget_range, BUDGET_RANGES)) {
      nextErrors.budget_range = "Please select a budget range.";
    }
    if (isDashboard && !form.status) {
      nextErrors.status = "Please select a lead status.";
    }
    if (!form.agreement_accepted) {
      nextErrors.agreement_accepted = "Please accept the agreement to continue.";
    }
    return nextErrors;
  }



  async function handleSubmit() {
    setError("");
    setErrors({});
    
    const step1Errors = validateStep1();
    if (Object.keys(step1Errors).length > 0) {
      setErrors(step1Errors);
      setStep(1);
      const firstErrorKey = Object.keys(step1Errors)[0];
      showAlert(step1Errors[firstErrorKey]);
      return;
    }

    const step2Errors = validateStep2();
    if (Object.keys(step2Errors).length > 0) {
      setErrors(step2Errors);
      setStep(2);
      const firstErrorKey = Object.keys(step2Errors)[0];
      showAlert(step2Errors[firstErrorKey]);
      return;
    }

    const step3Errors = validateStep3();
    if (Object.keys(step3Errors).length > 0) {
      setErrors(step3Errors);
      setStep(3);
      const firstErrorKey = Object.keys(step3Errors)[0];
      showAlert(step3Errors[firstErrorKey]);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        has_additional_info: form.has_additional_info === "yes",
        functions_count: form.functions_count,
        function_days: functionDays,
        source: initialData?.source ?? "public_form",
        status: form.status,
      };

      if (initialData?.id) {
        await updateLead(initialData.id, payload);
        if (onSuccess) {
          onSuccess(initialData.id);
        }
      } else {
        const id = await createLead(payload);
        if (onSuccess) {
          onSuccess(id);
        } else {
          router.push(`/inquiry/success?id=${id}`);
        }
      }
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  const eventOptions = events.map((e) => ({ value: e.id, label: e.name }));
  const opt = (arr: readonly string[]) => arr.map((v) => ({ value: v, label: v }));

  const content = (
    <div className={cn("space-y-6", isDashboard ? "text-stone-900" : "")}>
      {!isDashboard && (
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl font-semibold text-stone-900">
            Wedding Inquiry
          </h1>
          <p className="mt-1 text-sm text-stone-500">First Story Films</p>
        </div>
      )}

      {/* Progress Step Bar */}
      <div className="flex justify-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={cn(
              "h-2 w-16 rounded-full transition-all duration-300",
              step >= s ? "bg-amber-600" : "bg-stone-200"
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Input
            label="Your Name"
            required
            placeholder="Enter your full name"
            value={form.your_name}
            onChange={(e) => updateField("your_name", e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ""))}
            error={errors.your_name}
          />
          <Input
            label="Name of Couple"
            required
            placeholder="e.g. Aditi & Rohan"
            value={form.couple_name}
            onChange={(e) => updateField("couple_name", e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' &-]/g, ""))}
            error={errors.couple_name}
          />
          <Select
            label="How did you come to know about us?"
            required
            placeholder="Select referral source..."
            options={opt(LEAD_REFERRAL_OPTIONS)}
            value={form.referral_source}
            onChange={(e) => updateField("referral_source", e.target.value)}
            error={errors.referral_source}
          />
          <Input
            label="Contact Number (WhatsApp Preferred)"
            required
            type="tel"
            inputMode="tel"
            pattern="\+?[0-9]{10}"
            placeholder="e.g. +1000000022"
            value={form.contact_number}
            onChange={(e) => {
              const value = e.target.value.replace(/(?!^\+)\D/g, "");
              updateField("contact_number", value.startsWith("+") ? `+${value.slice(1).replace(/\+/g, "")}` : value.replace(/\+/g, ""));
            }}
            error={errors.contact_number}
          />
          <Input
            label="Email"
            type="email"
            placeholder="name@example.com"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            error={errors.email}
          />
          <Input
            label="Event Location"
            required
            placeholder="e.g. Jaipur, Rajasthan"
            value={form.event_location}
            onChange={(e) => updateField("event_location", e.target.value)}
            error={errors.event_location}
          />
          <Input
            label="Wedding Date"
            required
            type="date"
            placeholder="Select wedding date"
            value={form.wedding_date}
            onChange={(e) => updateField("wedding_date", e.target.value)}
            error={errors.wedding_date}
          />
          <Input
            label="Wedding Venue (Optional)"
            placeholder="e.g. The Leela Palace"
            value={form.wedding_venue}
            onChange={(e) => updateField("wedding_venue", e.target.value)}
            error={errors.wedding_venue}
          />
          <Select
            label="Album Requirement"
            required
            placeholder="Select album requirement..."
            options={opt(ALBUM_OPTIONS)}
            value={form.album_requirement}
            onChange={(e) => updateField("album_requirement", e.target.value)}
            error={errors.album_requirement}
          />
          <Select
            label="Drone Shoot Requirement"
            required
            placeholder="Select drone requirement..."
            options={opt(DRONE_OPTIONS)}
            value={form.drone_requirement}
            onChange={(e) => updateField("drone_requirement", e.target.value)}
            error={errors.drone_requirement}
          />
          <Select
            label="Shooting Side"
            required
            placeholder="Select shooting side..."
            options={opt(SHOOTING_SIDE_OPTIONS)}
            value={form.shooting_side}
            onChange={(e) => updateField("shooting_side", e.target.value)}
            error={errors.shooting_side}
          />
          <Select
            label="Pre-Wedding Shoot"
            required
            placeholder="Select pre-wedding option..."
            options={opt(PRE_WEDDING_OPTIONS)}
            value={form.pre_wedding_shoot}
            onChange={(e) => updateField("pre_wedding_shoot", e.target.value)}
            error={errors.pre_wedding_shoot}
          />
          <Input
            label="Number of Functions / Days"
            required
            type="number"
            min={1}
            max={30}
            inputMode="numeric"
            placeholder="e.g. 2"
            value={form.functions_count}
            onChange={(e) => {
              const value = Number(e.target.value);
              updateField("functions_count", Number.isNaN(value) ? 0 : value);
            }}
            error={errors.functions_count}
          />
          {onCancel ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  const step1Errors = validateStep1();
                  if (Object.keys(step1Errors).length > 0) {
                    setErrors(step1Errors);
                    const firstErrorKey = Object.keys(step1Errors)[0];
                    showAlert(step1Errors[firstErrorKey]);
                    return;
                  }
                  setErrors({});
                  setStep(2);
                }}
              >
                Continue to Function Details
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={() => {
                const step1Errors = validateStep1();
                if (Object.keys(step1Errors).length > 0) {
                  setErrors(step1Errors);
                  const firstErrorKey = Object.keys(step1Errors)[0];
                  showAlert(step1Errors[firstErrorKey]);
                  return;
                }
                setErrors({});
                setStep(2);
              }}
            >
              Continue to Function Details
            </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          {functionDays.map((day, index) => (
            <div key={index} className="rounded-lg border border-stone-200 p-4">
              <h3 className="mb-3 font-medium text-stone-800">Day {day.day_index}</h3>
              <div className="space-y-4">
                <Input
                  label="Day Date"
                  required
                  type="date"
                  placeholder="Select day date"
                  value={day.day_date}
                  onChange={(e) => updateDay(index, { day_date: e.target.value })}
                  error={errors[`day_date_${index}`]}
                />
                <Select
                  label="First Event Name"
                  required
                  placeholder="Select event..."
                  options={eventOptions}
                  value={day.first_event_id}
                  onChange={(e) => updateDay(index, { first_event_id: e.target.value })}
                  error={errors[`first_event_id_${index}`]}
                />
                <Select
                  label="Second Event Name (Optional)"
                  placeholder="Select event..."
                  options={eventOptions}
                  value={day.second_event_id ?? ""}
                  onChange={(e) => updateDay(index, { second_event_id: e.target.value })}
                />
              </div>
              <p className="mt-4 text-sm font-medium text-stone-700">Service Requirements</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {services.map((svc) => (
                  <label key={svc.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
                    <input type="checkbox" checked={day.service_ids.includes(svc.id)} onChange={() => toggleService(index, svc.id)} />
                    {svc.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setErrors({});
                setStep(1);
              }}
            >
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                const step2Errors = validateStep2();
                if (Object.keys(step2Errors).length > 0) {
                  setErrors(step2Errors);
                  const firstErrorKey = Object.keys(step2Errors)[0];
                  showAlert(step2Errors[firstErrorKey]);
                  return;
                }
                setErrors({});
                setStep(3);
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Select
            label="Any other information to help customize deliverables?"
            required
            options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
            value={form.has_additional_info}
            onChange={(e) => updateField("has_additional_info", e.target.value)}
            error={errors.has_additional_info}
          />
          {form.has_additional_info === "yes" && (
            <Textarea
              label="Additional Event Details"
              rows={4}
              placeholder="Share any rituals, timings, deliverables, or special notes..."
              value={form.additional_details}
              onChange={(e) => updateField("additional_details", e.target.value)}
              error={errors.additional_details}
            />
          )}
          <div className="space-y-1">
            <label className={cn(
              "flex gap-3 rounded-lg border border-stone-200 p-4 text-sm",
              errors.agreement_accepted && "border-red-500"
            )}>
              <input
                type="checkbox"
                checked={form.agreement_accepted}
                onChange={(e) => updateField("agreement_accepted", e.target.checked)}
                className="mt-1"
              />
              <span>Kindly note that the quotation will be drafted only on the function details filled above. Any additional function not filled above will be separately charged.</span>
            </label>
            {errors.agreement_accepted && (
              <p className="text-sm text-red-600">{errors.agreement_accepted}</p>
            )}
          </div>
          <Select
            label="Budget Range"
            required
            placeholder="Select budget..."
            options={opt(BUDGET_RANGES)}
            value={form.budget_range}
            onChange={(e) => updateField("budget_range", e.target.value)}
            error={errors.budget_range}
          />
          {isDashboard && (
            <Select
              label="Lead Status"
              required
              options={LEAD_STATUSES as unknown as { value: string; label: string }[]}
              value={form.status}
              onChange={(e) => updateField("status", e.target.value)}
              error={errors.status}
            />
          )}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setErrors({});
                setStep(2);
              }}
            >
              Back
            </Button>
            <Button className="flex-1" loading={loading} onClick={handleSubmit}>Submit Inquiry</Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {isDashboard ? (
        content
      ) : (
        <Card className="mx-auto max-w-2xl">
          {content}
        </Card>
      )}
      
      <AlertModal
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        message={alertMessage}
      />
    </>
  );
}
