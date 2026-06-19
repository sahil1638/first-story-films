import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";
import { generatePaymentReceiptHtml } from "@/lib/payment-receipt-template";
import { getOrderById, getPaymentsByOrderId } from "@/lib/data/orders";
import { getQuotationById } from "@/lib/data/quotations";
import { getAccountingAccountsForPayments } from "@/lib/data/accounting";
import { checkDbRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { handleApiError } from "@/lib/security/api-errors";
import { getCachedPdfArtifact, setCachedPdfArtifact } from "@/lib/pdf-cache";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  let profile;
  try {
    profile = await requireRoleOrThrow(["admin", "manager", "sales"]);
  } catch (error) {
    return handleApiError(error, { context: "receipt.pdf" });
  }
  const { id, paymentId } = await params;
  const supabase = await createClient();

  // Perform lightweight metadata query first
  const { data: paymentMeta, error: metaError } = await supabase
    .from("payments")
    .select("created_at, receipt_number, order_id")
    .eq("id", paymentId)
    .single();

  if (metaError || !paymentMeta) notFound();
  // Ensure the payment belongs to the order in the route
  if (paymentMeta.order_id !== id) notFound();

  // 1. Per-user rate limit: max 5 requests, refilling 1 token every 5 seconds (0.2/sec) (cheap check before cache)
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userKey = profile ? `user:${profile.id}` : `ip:${ip}`;
  const allowed = await checkDbRateLimit(rateLimitKey("pdf", userKey), {
    maxTokens: 5,
    refillRatePerSec: 0.2,
    cost: 1.0,
    context: "receipt.pdf",
  });
  if (!allowed) {
    return new Response("Too many PDF requests. Please try again later.", { status: 429 });
  }

  // 2. Cache check
  const cacheKey = `receipt:${paymentId}`;
  const cached = await getCachedPdfArtifact(cacheKey, paymentMeta.created_at);
  if (cached) {
    return new Response(new Uint8Array(cached), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${paymentMeta.receipt_number}.pdf"`,
      },
    });
  }

  // 3. Per-route rate limit (expensive rendering check only on cache miss)
  const routeAllowed = await checkDbRateLimit(rateLimitKey("pdf", "route-receipts"), {
    maxTokens: 10,
    refillRatePerSec: 0.5,
    cost: 1.0,
    context: "receipts.pdf.route",
  });
  if (!routeAllowed) {
    return new Response("Too many PDF requests. Please try again later.", { status: 429 });
  }

  // 1. Fetch Order and Payments
  let order;
  let allPaymentsRaw;
  try {
    [order, allPaymentsRaw] = await Promise.all([
      getOrderById(id),
      getPaymentsByOrderId(id),
    ]);
  } catch {
    notFound();
  }

  if (!order) notFound();

  // Find the current payment in-memory from all payments of this order
  const payment = (allPaymentsRaw ?? []).find((p) => p.id === paymentId);
  if (!payment) notFound();

  // 2. Fetch Quotation for functions count / Celebration Days
  let quotation = null;
  if (order.quotation_id) {
    try {
      quotation = await getQuotationById(order.quotation_id);
    } catch (e) {
      console.error("Payment receipt PDF quotation query failed", e);
    }
  }

  // 3. Keep all payments for this order, sorted by payment_date ascending
  const allPayments = [...(allPaymentsRaw ?? [])].sort(
    (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
  );

  // 4. Fetch accounting entries to resolve payment method (account name)
  const paymentIds = allPayments.map((p) => p.id);
  let entries: Awaited<ReturnType<typeof getAccountingAccountsForPayments>> = [];
  if (paymentIds.length > 0) {
    try {
      entries = await getAccountingAccountsForPayments(paymentIds);
    } catch (e) {
      console.error("Failed to fetch accounting accounts for payments", e);
    }
  }

  const accountMap = new Map<string, string>();
  if (entries) {
    for (const entry of entries) {
      if (entry.source_id && entry.accounting_accounts) {
        const accounts = entry.accounting_accounts as unknown as { name: string }[] | { name: string } | null;
        if (Array.isArray(accounts)) {
          const name = accounts[0]?.name;
          if (name) {
            accountMap.set(entry.source_id, name);
          }
        } else if (accounts && typeof accounts === "object" && "name" in accounts && accounts.name) {
          accountMap.set(entry.source_id, accounts.name);
        }
      }
    }
  }

  // 5. Build Payments History Ledger entries
  const totalAmount = Number(order.total_amount);
  const paymentsHistory = (allPayments ?? []).map((p, index) => {
    const isCurrent = p.id === paymentId;
    
    // Determine payment method from accounting account
    const accountName = accountMap.get(p.id);
    let method = "Bank Transfer / UPI";
    if (accountName) {
      if (accountName.toLowerCase().includes("cash")) {
        method = "Cash";
      } else if (
        accountName.toLowerCase().includes("upi") || 
        accountName.toLowerCase().includes("gpay") || 
        accountName.toLowerCase().includes("phonepe")
      ) {
        method = "UPI";
      } else if (accountName === "Order Transactions") {
        method = "Bank Transfer";
      } else {
        method = accountName;
      }
    }

    // Determine allocation phase/note
    let phase = p.notes?.trim() || "";
    if (!phase) {
      if (index === 0) {
        phase = "Advance Booking Payment";
      } else if (
        index === (allPayments?.length ?? 0) - 1 && 
        totalAmount <= (allPayments ?? []).reduce((sum, item) => sum + Number(item.amount), 0)
      ) {
        phase = "Final Balance Clearance";
      } else {
        phase = "Milestone Part-Payment";
      }
    }

    return {
      id: p.id,
      payment_date: p.payment_date,
      payment_method: method,
      payment_phase_title: phase,
      amount_rendered: Number(p.amount),
      receipt_number: p.receipt_number,
      is_current: isCurrent,
    };
  });

  // 6. Generate Premium HTML Template
  const htmlContent = generatePaymentReceiptHtml({
    order: {
      id: order.id,
      couple_name: order.couple_name,
      your_name: order.your_name,
      contact_number: order.contact_number,
      email: order.email,
      event_location: order.event_location,
      wedding_venue: order.wedding_venue,
      wedding_date: order.wedding_date,
      total_amount: Number(order.total_amount),
      paid_amount: Number(order.paid_amount),
      payment_status: order.payment_status,
      invoice_type: order.invoice_type,
      gst_rate: order.gst_rate,
      gst_amount: order.gst_amount,
      subtotal_amount: order.subtotal_amount,
    },
    quotation,
    currentPayment: {
      id: payment.id,
      amount: Number(payment.amount),
      payment_date: payment.payment_date,
      receipt_number: payment.receipt_number,
      notes: payment.notes,
    },
    paymentsHistory,
  });

  // 7. Compile HTML to PDF via Puppeteer
  const pdf = await compileHtmlToPdf(htmlContent, "receipt.pdf");
  await setCachedPdfArtifact(cacheKey, payment.created_at, pdf);

  // 8. Return Response
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${payment.receipt_number}.pdf"`,
    },
  });
}
