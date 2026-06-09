import { formatDate } from "@/lib/utils";

export type PaymentReceiptPdfData = {
  order: {
    id: string;
    couple_name: string;
    your_name: string;
    contact_number: string;
    email: string | null;
    event_location: string;
    wedding_venue: string | null;
    wedding_date: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
    invoice_type?: string;
    gst_rate?: number;
    gst_amount?: number;
    subtotal_amount?: number;
  };
  quotation: {
    functions_count: number;
  } | null;
  currentPayment: {
    id: string;
    amount: number;
    payment_date: string;
    receipt_number: string;
    notes: string | null;
  };
  paymentsHistory: Array<{
    id: string;
    payment_date: string;
    payment_method: string;
    payment_phase_title: string;
    amount_rendered: number;
    receipt_number: string;
    is_current: boolean;
  }>;
};

export function generatePaymentReceiptHtml(data: PaymentReceiptPdfData): string {
  const { order, currentPayment, paymentsHistory } = data;

  const brandName = "FIRST STORY FILMS";
  const orderNumber = order.id.slice(0, 8).toUpperCase();
  
  // Formatted date values
  const dateIssuedFormatted = formatDate(currentPayment.payment_date);
  const weddingDateFormatted = order.wedding_date ? formatDate(order.wedding_date) : "-";
  
  const clientName = order.your_name || order.couple_name || "Valued Client";
  
  // Resolve event location/venue details
  const location = order.wedding_venue || order.event_location || "Specified Venue";

  // Resolve bill/invoice type details
  const isGst = order.invoice_type === "gst";
  const billTypeLabel = isGst ? "GST" : "Non-GST";

  // Calculations for Financial Summary
  const totalContractValue = Number(order.total_amount);
  const cumulativePaid = paymentsHistory.reduce((sum, p) => sum + p.amount_rendered, 0);
  const balanceDue = Math.max(0, totalContractValue - cumulativePaid);

  // Status Indicator
  const isPaidInFull = balanceDue <= 0.01;
  const statusBadgeText = isPaidInFull 
    ? "[ PAID IN FULL ]" 
    : "[ PARTIAL RECEIPT — BALANCE OUTSTANDING ]";
  const statusClass = isPaidInFull ? "paid-in-full" : "partial-receipt";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Receipt - ${currentPayment.receipt_number}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* Global Page Sizing & Reset */
    @page {
      size: A4;
      margin: 0;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      height: 297mm;
      background-color: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: 'Montserrat', sans-serif;
    }

    /* Strict A4 Container Constraint */
    .receipt-container {
      width: 210mm;
      height: 297mm;
      padding: 50px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background-color: #FFFFFF;
      position: relative;
    }

    /* Block A: Header Section */
    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 35px;
    }
    .header-left {
      max-width: 60%;
    }
    .header-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 34px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #232323;
      margin: 0;
      line-height: 1.1;
    }
    .header-brand {
      font-family: 'Montserrat', sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.25em;
      color: #8C6A3C;
      margin-top: 8px;
      text-transform: uppercase;
    }
    .header-right {
      text-align: right;
      font-family: 'Montserrat', sans-serif;
      font-size: 11px;
      line-height: 1.6;
      color: #666666;
    }
    .meta-value {
      font-weight: 600;
      color: #232323;
    }

    /* Block B: Client, Wedding, & Billing Record (3-Column Layout) */
    .client-wedding-section {
      border-top: 1.5px solid #D2C9BD;
      border-bottom: 1.5px solid #D2C9BD;
      padding: 24px 0;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
    }
    .record-column {
      flex: 1;
    }
    .record-label {
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #7A5B32;
      margin-bottom: 8px;
    }
    .record-value {
      font-size: 15.5px;
      color: #1E1E1E;
      font-weight: 700;
      line-height: 1.4;
      margin-bottom: 5px;
    }
    .record-subvalue {
      font-size: 12.5px;
      color: #333333;
      margin-top: 5px;
      line-height: 1.4;
    }

    /* Block C: Payments Ledger Table */
    .ledger-container {
      flex-grow: 1;
      margin-bottom: 30px;
    }
    .receipt-ledger-table {
      width: 100%;
      border-collapse: collapse;
    }
    .receipt-ledger-table th {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #7A5B32;
      border-bottom: 2px solid #1E1E1E;
      padding: 14px 10px;
      text-align: left;
    }
    .receipt-ledger-table td {
      font-size: 13.5px;
      color: #1E1E1E;
      padding: 16px 10px;
      border-bottom: 1px solid #D2C9BD;
      vertical-align: middle;
    }
    .receipt-ledger-table tr.current-payment-row td {
      background-color: rgba(140, 106, 60, 0.05);
      font-weight: 600;
    }
    .receipt-ledger-table tr.current-payment-row td:first-child {
      border-left: 4px solid #8C6A3C;
    }
    .amount-column {
      text-align: right;
      font-weight: 700;
      color: #1E1E1E;
    }
    .current-label {
      display: inline-block;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background-color: #8C6A3C;
      color: #FFFFFF;
      padding: 2px 5px;
      border-radius: 2px;
      margin-left: 6px;
      font-weight: 600;
      vertical-align: middle;
    }

    /* Block D & E: Summary, Stamp & Footer */
    .summary-stamp-wrapper {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1.5px solid #D2C9BD;
      gap: 30px;
    }
    
    /* Block E: Status Stamp */
    .stamp-container {
      max-width: 50%;
    }
    .status-badge {
      display: inline-block;
      white-space: nowrap;
      border: 1.5px solid #1E1E1E;
      padding: 8px 14px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #1E1E1E;
      margin-top: 8px;
      background-color: #FFFFFF;
    }
    .status-badge.paid-in-full {
      border-color: #7A5B32;
      color: #7A5B32;
      background-color: rgba(122, 91, 50, 0.03);
    }
    .status-badge.partial-receipt {
      border-color: #1E1E1E;
      color: #1E1E1E;
    }

    /* Block D: Financial Summary Card */
    .summary-card {
      width: 350px;
      font-family: 'Montserrat', sans-serif;
      font-size: 13px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      color: #333333;
      align-items: center;
      gap: 15px;
    }
    .summary-row span:last-child {
      white-space: nowrap;
    }
    .summary-row.highlight-row {
      color: #7A5B32;
      font-weight: 600;
    }
    .summary-row.total-row {
      border-top: 1.5px solid #D2C9BD;
      margin-top: 8px;
      padding-top: 14px;
      color: #1E1E1E;
    }
    .balance-amount {
      font-family: 'Cormorant Garamond', serif;
      font-size: 21px;
      font-weight: 700;
      color: #1E1E1E;
      white-space: nowrap;
    }

    /* Sign-off & Footer */
    .receipt-footer {
      margin-top: 30px;
      text-align: center;
    }
    .footer-divider {
      width: 100%;
      height: 1.5px;
      background-color: #D2C9BD;
      margin-bottom: 20px;
    }
    .footer-text {
      font-size: 9.5px;
      line-height: 1.6;
      color: #888888;
      max-width: 80%;
      margin: 0 auto;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    
    <!-- Block A: Document Metadata -->
    <div class="header-section">
      <div class="header-left">
        <h1 class="header-title">Receipt of Payment</h1>
        <div class="header-brand">${brandName}</div>
      </div>
      <div class="header-right">
        <div>Receipt Reference: <span class="meta-value">#${currentPayment.receipt_number}</span></div>
        <div>Date Issued: <span class="meta-value">${dateIssuedFormatted}</span></div>
        <div>Project Contract Ref: <span class="meta-value">#${orderNumber}</span></div>
      </div>
    </div>

    <!-- Block B: Client, Wedding, & Billing Record (3-Column Layout) -->
    <div class="client-wedding-section">
      <div class="record-column">
        <div class="record-label">Client Details</div>
        <div class="record-value">${clientName}</div>
        <div class="record-subvalue">Phone: ${order.contact_number || "-"}</div>
        <div class="record-subvalue">Email: ${order.email || "-"}</div>
      </div>
      <div class="record-column">
        <div class="record-label">Wedding Details</div>
        <div class="record-value">${order.couple_name || "-"}</div>
        <div class="record-subvalue">Wedding Date: ${weddingDateFormatted}</div>
        <div class="record-subvalue">Venue: ${location}</div>
      </div>
      <div class="record-column" style="text-align: right;">
        <div class="record-label">Bill Type</div>
        <div class="record-value">${billTypeLabel}</div>
      </div>
    </div>

    <!-- Block C: Ledger Table -->
    <div class="ledger-container">
      <table class="receipt-ledger-table">
        <thead>
          <tr>
            <th style="width: 30%;">Transaction Date</th>
            <th style="width: 45%;">Allocation Phase / Note</th>
            <th style="width: 25%; text-align: right;">Amount Paid</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsHistory.map((p) => {
            const formattedDate = formatDate(p.payment_date);
            const amountRenderedText = `Rs. ${p.amount_rendered.toLocaleString("en-IN")}/-`;
            const rowClass = p.is_current ? 'class="current-payment-row"' : '';
            const currentBadge = p.is_current ? '<span class="current-label">Current</span>' : '';
            
            return `
              <tr ${rowClass}>
                <td>${formattedDate}</td>
                <td><span style="font-weight: 600; color: #1E1E1E;">${p.payment_phase_title}</span>${currentBadge}</td>
                <td class="amount-column">${amountRenderedText}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Block D & E: Summary & Stamp -->
    <div class="summary-stamp-wrapper">
      
      <!-- Block E: Status Stamp -->
      <div class="stamp-container">
        <div class="record-label">Transaction Status</div>
        <div class="status-badge ${statusClass}">${statusBadgeText}</div>
      </div>

      <!-- Block D: Financial Summary Card -->
      <div class="summary-card">
        <div class="summary-row">
          <span>Total Contract Value:</span>
          <span class="meta-value">Rs. ${totalContractValue.toLocaleString("en-IN")}/-</span>
        </div>
        <div class="summary-row highlight-row">
          <span>Cumulative Paid to Date:</span>
          <span>Rs. ${cumulativePaid.toLocaleString("en-IN")}/-</span>
        </div>
        <div class="summary-row total-row">
          <span style="font-weight: 600; color: #232323;">Remaining Outstanding Balance:</span>
          <span class="balance-amount">Rs. ${balanceDue.toLocaleString("en-IN")}/-</span>
        </div>
      </div>
    </div>

    <!-- Footer & Sign-off -->
    <div class="receipt-footer">
      <div class="footer-divider"></div>
      <p class="footer-text">
        Thank you for your payment. This document serves as an official confirmation of funds received by First Story Films. Retain for your contractual financial records.
      </p>
    </div>

  </div>
</body>
</html>
`;
}
