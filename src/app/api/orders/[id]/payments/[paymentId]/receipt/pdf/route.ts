import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";
import { generatePaymentReceiptHtml } from "@/lib/payment-receipt-template";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  await requireRole(["admin", "manager", "sales"]);
  const { id, paymentId } = await params;
  const supabase = await createClient();

  // 1. Fetch Order and Current Payment
  const [{ data: order }, { data: payment }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("payments").select("*").eq("id", paymentId).eq("order_id", id).single(),
  ]);

  if (!order || !payment) notFound();

  // 2. Fetch Quotation for functions count / Celebration Days
  const { data: quotation } = order.quotation_id
    ? await supabase.from("quotations").select("functions_count").eq("id", order.quotation_id).maybeSingle()
    : { data: null };

  // 3. Fetch all payments for this order (chronological order)
  const { data: allPayments } = await supabase
    .from("payments")
    .select("*")
    .eq("order_id", id)
    .order("payment_date", { ascending: true });

  // 4. Fetch accounting entries to resolve payment method (account name)
  const paymentIds = allPayments?.map((p) => p.id) ?? [];
  const { data: entries } = paymentIds.length > 0
    ? await supabase
        .from("accounting_entries")
        .select(`
          source_id,
          accounting_accounts (
            name
          )
        `)
        .in("source_id", paymentIds)
        .eq("source", "order_payment")
    : { data: [] };

  const accountMap = new Map<string, string>();
  if (entries) {
    for (const entry of entries) {
      if (entry.source_id && entry.accounting_accounts) {
        const account = entry.accounting_accounts as any;
        if (account.name) {
          accountMap.set(entry.source_id, account.name);
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
  const pdf = await compileHtmlToPdf(htmlContent);

  // 8. Return Response
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${payment.receipt_number}.pdf"`,
    },
  });
}

