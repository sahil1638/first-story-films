import { formatCurrency, formatDate } from "@/lib/utils";

type SettingMap = Record<string, string>;

export type PdfOrderService = {
  id: string;
  service_id: string;
  person_count: number;
  order_service_allocations?: { crew_member_id: string }[] | null;
};

export type PdfFunctionDay = {
  id?: string;
  day_index: number;
  day_date: string;
  first_event_id: string | null;
  second_event_id: string | null;
  quotation_function_day_services?: { service_id: string }[] | null;
};

export type PdfPayment = {
  amount: number;
  payment_date: string;
  receipt_number?: string | null;
  notes?: string | null;
};

export type PdfCrewMember = {
  id: string;
  name: string;
  crew_member_services?: { service_id: string }[] | null;
};

export type OrderAgreementPdfData = {
  order: Record<string, unknown>;
  quotation: Record<string, unknown> | null;
  services: { id: string; name: string }[];
  deliverables: { id: string; title: string }[];
  functionDays: PdfFunctionDay[];
  payments: PdfPayment[];
  crew: PdfCrewMember[];
  settings: SettingMap;
  serviceMap: Map<string, string>;
  eventMap: Map<string, string>;
};

type TeamRow = {
  service: string;
  count: number;
};

const notSpecified = "Not specified";

export function generateOrderAgreementHtml(data: OrderAgreementPdfData): string {
  const {
    order,
    quotation,
    services,
    deliverables,
    functionDays,
    payments,
    settings,
    serviceMap,
    eventMap,
  } = data;

  const orderNumber = stringValue(order.id).slice(0, 8).toUpperCase();
  const companyName = setting(settings, "company_name", setting(settings, "studio_name", "First Story Films"));
  const coupleName = stringValue(order.couple_name) || notSpecified;
  const venue = stringValue(order.wedding_venue) || stringValue(order.event_location) || notSpecified;
  const weddingDate = stringValue(order.wedding_date);
  const paidAmount = numberValue(order.paid_amount);
  const subtotal = numberValue(order.subtotal_amount) || numberValue(order.total_amount);
  const gst = numberValue(order.gst_amount);
  const grandTotal = numberValue(order.total_amount);
  const remaining = Math.max(0, grandTotal - paidAmount);
  const discount = numberValue(order.discount);
  const paymentProgress = grandTotal > 0 ? Math.min(100, Math.round((paidAmount / grandTotal) * 100)) : 0;
  const teamRows = buildTeamRows(data);
  const allCrewCount = teamRows.reduce((sum, row) => sum + row.count, 0);
  const eventsCovered = eventRows(functionDays, eventMap, serviceMap);
  const terms = stringValue(order.agreement_content) || settings.agreement_content || settings.terms_and_conditions || "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Wedding Order Agreement ${escapeHtml(orderNumber)}</title>
  ${fontLinks()}
  <style>${baseCss()}</style>
</head>
<body>
  ${page(
    "Cover",
    `<section class="cover-sheet">
      <div class="cover-frame">
        <div class="cover-topline">
          <div class="brand-mark">${initials(companyName)}</div>
          <div>
            <div class="eyebrow">${escapeHtml(companyName)}</div>
            <div class="muted">Wedding Photography and Filmmaking</div>
          </div>
          <div class="agreement-pill">Agreement ${escapeHtml(orderNumber)}</div>
        </div>

        <div class="cover-hero-copy">
          <div class="kicker">Wedding Coverage Agreement</div>
          <p>Premium wedding photography and filmmaking coverage prepared for the events, team allocation, services, deliverables, payment terms, and agreement policies listed in this document.</p>
        </div>

        <h1 class="cover-couple-name">${escapeHtml(coupleName)}</h1>
        <div class="mini-title cover-details-title">Couple Details</div>
        <div class="cover-highlights">
          ${coverStat("Wedding Date", weddingDate ? formatDate(weddingDate) : notSpecified)}
          ${coverStat("Venue", venue)}
          ${coverStat("Location", stringValue(order.event_location) || notSpecified)}
          ${coverStat("Contact", contactLine(order))}
        </div>

        <div class="cover-overview">
          <div>
            <div class="mini-title">Event Overview</div>
            ${compactTable(["Event", "Date", "Coverage Team"], eventsCovered.map((event) => [
              event.name,
              event.date,
              event.coverage,
            ]))}
            ${chipSection("Coverage Includes", selectedCoverageItems(services, quotation), "cover-chips")}
          </div>
        </div>
      </div>
    </section>`,
    1
  )}

  ${page(
    "Services",
    `${sectionTitle("Services Included")}
    ${table(["Service", "Person Count", "Day", "Price"], services.map((service) => [
      service.name,
      servicePersonCount(service.id, data),
      serviceQty(service.id, data),
      servicePrice(service.id, order),
    ]))}
    <div class="total-line"><span>Services Subtotal</span><strong>${formatCurrency(subtotal)}</strong></div>
    <div class="inline-section">
      <h3>Deliverables</h3>
      ${table(["Deliverable", "Quantity", "Delivery Timeline"], deliverables.map((deliverable) => [
        deliverable.title,
        deliverableQuantity(deliverable.title),
        deliverableTimeline(deliverable.title, settings),
      ]))}
    </div>`,
    2
  )}

  ${page(
    "Payment",
    `${sectionTitle("Payment Agreement")}
    <div class="finance-grid">
      ${money("Package Amount", subtotal)}
      ${money("Discount", discount)}
      ${money("GST", gst)}
      ${money("Grand Total", grandTotal, true)}
      ${money("Advance Received", paidAmount)}
      ${money("Remaining Amount", remaining, true)}
      ${money("Amount In Words", amountInWords(grandTotal), false, "wide")}
    </div>
    <div class="progress-wrap">
      <div class="progress-label"><span>Payment Progress</span><strong>${paymentProgress}%</strong></div>
      <div class="progress"><span style="width:${paymentProgress}%"></span></div>
    </div>
    ${table(["Payment Date", "Receipt", "Amount", "Notes"], payments.map((payment) => [
      formatDate(payment.payment_date),
      payment.receipt_number || notSpecified,
      formatCurrency(numberValue(payment.amount)),
      payment.notes || notSpecified,
    ]))}`,
    3
  )}

  ${page(
    "Terms",
    `${sectionTitle("Terms and Conditions")}
    <div class="terms">${renderTerms(terms)}</div>`,
    4
  )}
</body>
</html>`;
}

function page(title: string, content: string, pageNumber: number) {
  const pageClass = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const footer = title === "Terms"
    ? ""
    : `<footer><span>Premium wedding coverage document</span><span>${pageNumber}</span></footer>`;

  return `<main class="page page-${pageClass}">
    <header><span>${escapeHtml(title)}</span><span>Wedding Order Agreement</span></header>
    ${content}
    ${footer}
  </main>`;
}

function sectionTitle(title: string) {
  return `<div class="section-title"><div class="kicker">Agreement Section</div><h2>${escapeHtml(title)}</h2></div>`;
}

function table(headers: string[], rows: string[][]) {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell || notSpecified)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}" class="empty">No records attached to this order.</td></tr>`;

  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function compactTable(headers: string[], rows: string[][]) {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell || notSpecified)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}" class="empty">No event rows attached.</td></tr>`;

  return `<table class="compact-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function coverStat(label: string, value: string) {
  return `<div class="cover-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function contactLine(order: Record<string, unknown>) {
  return [
    stringValue(order.contact_number),
    stringValue(order.email),
  ].filter(Boolean).join(" | ") || notSpecified;
}

function chipSection(title: string, items: string[], className = "") {
  const chips = items.length ? items : [notSpecified];
  return `<div class="chips ${escapeHtml(className)}"><h3>${escapeHtml(title)}</h3>${chips.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function money(label: string, value: number | string, strong = false, className = "") {
  const formatted = typeof value === "number" ? formatCurrency(value) : value;
  return `<div class="money ${strong ? "strong" : ""} ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatted)}</strong></div>`;
}

function buildTeamRows(data: OrderAgreementPdfData): TeamRow[] {
  const serviceCounts = new Map<string, number>();

  for (const orderService of data.order.order_services as PdfOrderService[] | undefined ?? []) {
    const serviceName = data.serviceMap.get(orderService.service_id) || orderService.service_id;
    const plannedCount = Math.max(1, numberValue(orderService.person_count));
    serviceCounts.set(serviceName, (serviceCounts.get(serviceName) ?? 0) + plannedCount);
  }

  return Array.from(serviceCounts.entries()).map(([service, count]) => ({ service, count }));
}

function eventRows(days: PdfFunctionDay[], eventMap: Map<string, string>, serviceMap: Map<string, string>) {
  return days.flatMap((day) => {
    const services = (day.quotation_function_day_services ?? [])
      .map((service) => serviceMap.get(service.service_id))
      .filter(Boolean)
      .join(", ");
    const ids = [day.first_event_id, day.second_event_id].filter(Boolean) as string[];
    return ids.map((eventId) => ({
      name: eventMap.get(eventId) || "Wedding Event",
      date: formatDate(day.day_date),
      coverage: services || notSpecified,
    }));
  });
}

function selectedCoverageItems(services: { name: string }[], quotation: Record<string, unknown> | null) {
  const names = services.map((service) => service.name.toLowerCase()).join(" ");
  const items = [];
  if (names.includes("photo")) items.push("Getting Ready", "Family Portraits", "Couple Portraits");
  if (names.includes("cinema") || names.includes("video")) items.push("Event Coverage");
  if (stringValue(quotation?.drone_requirement).toLowerCase().includes("yes") || names.includes("drone")) items.push("Drone Coverage");
  if (items.length) items.push("Decor Coverage");
  return Array.from(new Set(items));
}

function serviceQty(serviceId: string, data: OrderAgreementPdfData) {
  const serviceDays = data.functionDays.filter((day) =>
    (day.quotation_function_day_services ?? []).some((service) => service.service_id === serviceId)
  ).length;

  return String(serviceDays || 1);
}

function servicePersonCount(serviceId: string, data: OrderAgreementPdfData) {
  const orderService = (data.order.order_services as PdfOrderService[] | undefined ?? [])
    .find((os) => os.service_id === serviceId);
  return String(orderService ? Math.max(1, numberValue(orderService.person_count)) : 1);
}

function servicePrice(_serviceId: string, order: Record<string, unknown>) {
  return numberValue(order.subtotal_amount) > 0 ? "Included in package" : notSpecified;
}

function deliverableQuantity(title: string) {
  const lowered = title.toLowerCase();
  if (lowered.includes("album") || lowered.includes("frame")) return "1";
  return "As selected";
}

function deliverableTimeline(title: string, settings: SettingMap) {
  const lowered = title.toLowerCase();
  if (lowered.includes("album")) return setting(settings, "album_delivery_timeline", "Within 90 days");
  if (lowered.includes("film") || lowered.includes("video")) return setting(settings, "film_delivery_timeline", "Within 60 days");
  if (lowered.includes("photo") || lowered.includes("image")) return setting(settings, "photo_delivery_timeline", "Within 30 days");
  return setting(settings, "default_delivery_timeline", "As per agreement");
}

function renderTerms(terms: string) {
  if (!terms.trim()) return `<p>${notSpecified}</p>`;

  const html: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const rawBlock of terms.split(/\n{2,}/)) {
    const lines = rawBlock
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const normalizedLine = line.replace(/^#{1,6}\s*/, "");
      const headingMatch = normalizedLine.match(/^(\d+)[.)]\s+(.+)$/);
      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);

      if (headingMatch) {
        flushList();
        html.push(`<h3><span>${headingMatch[1]}.</span> ${escapeHtml(headingMatch[2])}</h3>`);
      } else if (bulletMatch) {
        listItems.push(bulletMatch[1]);
      } else {
        flushList();
        html.push(`<p>${escapeHtml(line)}</p>`);
      }
    }
  }

  flushList();
  return html.join("");
}

function setting(settings: SettingMap, key: string, fallback = "") {
  return settings[key]?.trim() || fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function initials(value: string) {
  return escapeHtml(value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "FS");
}

function amountInWords(amount: number) {
  if (!amount) return "Zero Rupees Only";
  return `${formatIndianNumberWords(Math.round(amount))} Rupees Only`;
}

function formatIndianNumberWords(value: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowHundred = (num: number): string => (num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`);
  const belowThousand = (num: number): string => {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ""}${hundred && rest ? " " : ""}${rest ? belowHundred(rest) : ""}`.trim();
  };
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const rest = value % 1000;
  return [
    crore ? `${belowThousand(crore)} Crore` : "",
    lakh ? `${belowThousand(lakh)} Lakh` : "",
    thousand ? `${belowThousand(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ].filter(Boolean).join(" ");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fontLinks() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;
}

function baseCss() {
  return `
@page { size: A4; margin: 0; }
@page terms-page {
  size: A4;
  margin-top: 22mm;
  margin-bottom: 18mm;
  margin-left: 18mm;
  margin-right: 18mm;
  background-color: #fbf8f1;
}
* { box-sizing: border-box; }
body { margin: 0; color: #2b2621; background: #fbf8f1; font-family: 'Montserrat', Arial, sans-serif; }
.page { width: 210mm; height: 297mm; padding: 22mm 18mm 18mm; page-break-after: always; position: relative; overflow: hidden; background: #fbf8f1; }
.page:nth-of-type(even) { background: #fbf8f1; }
.page:last-child { page-break-after: auto; }
.page-terms {
  page: terms-page;
  width: 100%;
  height: auto;
  min-height: 100%;
  overflow: visible;
  padding: 0 !important;
  background: #fbf8f1;
}
.page-terms header {
  top: -12mm !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
}
header, footer { position: absolute; left: 18mm; right: 18mm; display: flex; justify-content: space-between; color: #9a866c; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; }
header { top: 10mm; } footer { bottom: 8mm; }
.page-cover { padding: 7mm 8mm; background: linear-gradient(135deg, #fbf8f1 0%, #f5eadb 58%, #ead8bf 100%); }
.page-cover header, .page-cover footer { display: none; }
.cover-sheet { min-height: 283mm; border: 1px solid rgba(156, 117, 67, .34); padding: 9mm 10mm; position: relative; overflow: hidden; background: rgba(255,255,255,.58); }
.cover-sheet:before { content: ""; position: absolute; inset: 4mm; border: 1px solid rgba(156, 117, 67, .18); pointer-events: none; }
.cover-sheet:after { content: ""; position: absolute; width: 88mm; height: 88mm; right: -30mm; top: -24mm; border: 1px solid rgba(156, 117, 67, .2); transform: rotate(28deg); }
.cover-frame { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; }
.cover-topline { display: flex; align-items: center; gap: 14px; padding-bottom: 8mm; border-bottom: 1px solid rgba(156, 117, 67, .26); }
.brand-mark { width: 52px; height: 52px; border: 1px solid #a47a44; color: #8c6330; background: rgba(255,255,255,.62); display: grid; place-items: center; font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 700; }
.agreement-pill { margin-left: auto; border: 1px solid rgba(156, 117, 67, .35); color: #7f674c; padding: 8px 10px; font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; background: rgba(255,255,255,.5); }
.cover-hero-copy { padding: 10mm 0 5mm; max-width: 174mm; }
.cover-hero-copy p { margin: 10px 0 0; width: 155mm; color: #5f564d; font-size: 12px; line-height: 1.7; }
.kicker, .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 3px; font-weight: 700; color: #b99a67; }
.muted { color: #7f756a; font-size: 11px; margin-top: 4px; }
h1, h2 { font-family: 'Cormorant Garamond', Georgia, serif; margin: 0; font-weight: 600; }
h1 { font-size: 58px; line-height: .9; max-width: 620px; color: #2b2621; }
.cover-couple-name { margin: 0 0 9mm; }
.cover-details-title { margin-bottom: 8px; }
.cover-highlights { display: grid; grid-template-columns: 34mm 1fr 1fr 62mm; gap: 10px; margin-bottom: 9mm; }
.cover-stat { min-height: 18mm; border-top: 1px solid #cdb895; border-bottom: 1px solid #e3d5c1; padding: 8px 2px 6px; }
.cover-stat span { display: block; color: #9a866c; font-size: 8px; text-transform: uppercase; letter-spacing: 1.4px; font-weight: 700; margin-bottom: 4px; }
.cover-stat strong { display: block; color: #2b2621; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
.cover-overview { display: block; margin-top: 0; width: 100%; }
.mini-title { margin-bottom: 8px; color: #8c6330; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 700; }
.section-title { margin-bottom: 18px; border-bottom: 1px solid #e7dac8; padding-bottom: 12px; }
.page-terms .section-title { margin-bottom: 18px; border-bottom: 0; padding-bottom: 0; }
.section-title h2 { font-size: 34px; color: #2b2621; }
.section-title p, .lead { color: #6b6257; line-height: 1.7; font-size: 13px; }
.highlights, .detail-grid, .finance-grid, .signature-grid { display: grid; gap: 10px; }
.highlights { grid-template-columns: 1fr 1fr; margin-top: 16px; }
.highlight, .detail, .money { border: 1px solid #eadfce; background: rgba(255,255,255,.7); padding: 12px; }
.highlight span, .detail span, .money span, .label { display: block; color: #9a866c; font-size: 9px; text-transform: uppercase; letter-spacing: 1.4px; font-weight: 700; margin-bottom: 6px; }
.highlight strong, .detail strong, .money strong { font-size: 15px; color: #2b2621; }
.detail-grid, .finance-grid { grid-template-columns: 1fr 1fr; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e8ddce; margin-top: 8px; }
th { background: #efe5d4; color: #5a4938; font-size: 9px; text-align: left; letter-spacing: 1px; text-transform: uppercase; padding: 10px; }
td { border-top: 1px solid #eee5da; padding: 10px; font-size: 11px; line-height: 1.45; color: #3b332c; vertical-align: top; }
.compact-table { margin-top: 0; background: rgba(255,255,255,.75); }
.compact-table th { padding: 9px 10px; font-size: 8.5px; }
.compact-table td { padding: 10px; font-size: 11px; line-height: 1.45; }
.empty { text-align: center; color: #8c8177; padding: 20px; }
.total-line { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #d9c7ae; padding-top: 10px; color: #5a4938; }
.total-line strong { font-size: 18px; color: #2b2621; }
.chips { margin-top: 18px; }
.chips h3 { font-family: 'Cormorant Garamond', serif; font-size: 20px; margin: 0 0 8px; }
.chips span { display: inline-block; margin: 0 6px 8px 0; padding: 8px 10px; border: 1px solid #dfd0bb; background: #fff; font-size: 11px; }
.cover-chips { margin-top: 8mm; }
.cover-chips h3 { font-size: 18px; }
.cover-chips span { padding: 7px 9px; font-size: 10px; background: rgba(255,255,255,.68); }
.inline-section { margin-top: 18px; }
.inline-section h3 { font-family: 'Cormorant Garamond', serif; font-size: 20px; margin: 0 0 8px; color: #2b2621; }
.inline-section table + table { margin-top: 12px; }
.money.strong { background: #2b2621; color: #fff; }
.money.strong span, .money.strong strong { color: #fff; }
.money.wide { grid-column: 1 / -1; }
.progress-wrap { margin: 14px 0; }
.progress-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; }
.progress { height: 10px; background: #e9dcc9; overflow: hidden; }
.progress span { display: block; height: 100%; background: #9f7845; }
.terms { columns: auto; border-top: 1px solid #d9cbbb; padding-top: 18px; color: #2f2a25; }
.terms h3 { break-after: avoid; margin: 0 0 12px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; line-height: 1.25; font-weight: 700; color: #8c6330; }
.terms h3:not(:first-child) { margin-top: 22px; }
.terms h3 span { font-variant-numeric: lining-nums; }
.terms p { break-inside: avoid; margin: 0 0 12px; font-size: 13.5px; line-height: 1.65; color: #2f2a25; }
.terms ul { break-inside: avoid; margin: 0 0 12px 18px; padding: 0; }
.terms li { margin: 0 0 7px; padding-left: 5px; font-size: 13.5px; line-height: 1.55; color: #2f2a25; }
.signature-grid { grid-template-columns: 1fr 1fr; margin-top: 20px; }
.signature { height: 42mm; background: #fff; border: 1px solid #e2d4c1; padding: 12px; display: flex; flex-direction: column; justify-content: flex-end; }
.signature div { border-bottom: 1px solid #8e7c68; margin-bottom: 8px; }
.signature span { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: #7d6d5e; }
.qr { width: 34mm; height: 34mm; border: 1px solid #e2d4c1; padding: 4px; background: #fff; }
.mt { margin-top: 12px; }
`;
}
