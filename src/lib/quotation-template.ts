import { formatDate, formatCurrency } from "@/lib/utils";
import type { Quotation, Service, Event, Deliverable } from "@/types/database";

type QuotationFunctionDayService = {
  service_id: string;
};

type QuotationFunctionDay = {
  day_index: number;
  day_date: string;
  first_event_id: string | null;
  second_event_id: string | null;
  quotation_function_day_services?: QuotationFunctionDayService[];
};

type QuotationServicePerson = {
  service_id: string;
  person_count: number;
};

type QuotationWithRelations = Quotation & {
  quotation_function_days?: QuotationFunctionDay[];
  quotation_service_persons?: QuotationServicePerson[];
};

type QuotationData = {
  quotation: QuotationWithRelations;
  services: Service[];
  events: Event[];
  deliverables: Deliverable[];
  terms: string;
  settings?: Record<string, string>;
};

const notSpecified = "Not specified";

export function generateQuotationHtml({
  quotation,
  services,
  events,
  deliverables,
  terms,
  settings = {},
}: QuotationData): string {
  const serviceMap = new Map(services.map((s) => [s.id, s.name]));
  const eventMap = new Map(events.map((e) => [e.id, e.name]));

  const functionDays = quotation.quotation_function_days ?? [];
  const servicePersons = quotation.quotation_service_persons ?? [];
  let currentPage = 4;

  // Filter deliverables dynamically based on database items
  const photoDeliverables = deliverables.filter(d => 
    d.title.toLowerCase().includes("photo") || 
    d.title.toLowerCase().includes("album") || 
    d.title.toLowerCase().includes("print") ||
    d.title.toLowerCase().includes("book") ||
    d.title.toLowerCase().includes("canvas")
  );

  const videoDeliverables = deliverables.filter(d => 
    d.title.toLowerCase().includes("film") || 
    d.title.toLowerCase().includes("video") || 
    d.title.toLowerCase().includes("reel") ||
    d.title.toLowerCase().includes("teaser") ||
    d.title.toLowerCase().includes("footage") ||
    d.title.toLowerCase().includes("raw")
  );

  // Determine active services
  const selectedServiceIds = new Set<string>();
  for (const day of functionDays) {
    for (const service of day.quotation_function_day_services ?? []) {
      selectedServiceIds.add(service.service_id);
    }
  }

  // Count active days for core services
  let photographyDays = 0;
  let cinematographyDays = 0;

  for (const day of functionDays) {
    const dayServices = day.quotation_function_day_services ?? [];
    const hasPhoto = dayServices.some((s) =>
      serviceMap.get(s.service_id)?.toLowerCase().includes("photography")
    );
    const hasCinema = dayServices.some((s) =>
      serviceMap.get(s.service_id)?.toLowerCase().includes("cinematography")
    );
    if (hasPhoto) photographyDays++;
    if (hasCinema) cinematographyDays++;
  }

  const isPhotographySelected = Array.from(selectedServiceIds).some((id) =>
    serviceMap.get(id)?.toLowerCase().includes("photography")
  );
  const isCinematographySelected = Array.from(selectedServiceIds).some((id) =>
    serviceMap.get(id)?.toLowerCase().includes("cinematography")
  );

  if (photographyDays === 0 && isPhotographySelected) {
    photographyDays = functionDays.length || 1;
  }
  if (cinematographyDays === 0 && isCinematographySelected) {
    cinematographyDays = functionDays.length || 1;
  }

  const photographyCount = servicePersons.find((sp) =>
    serviceMap.get(sp.service_id)?.toLowerCase() === "photography"
  )?.person_count ?? (isPhotographySelected ? 2 : 0);

  const cinematographyCount = servicePersons.find((sp) =>
    serviceMap.get(sp.service_id)?.toLowerCase() === "cinematography"
  )?.person_count ?? (isCinematographySelected ? 2 : 0);

  const isDroneSelected =
    Array.from(selectedServiceIds).some((id) =>
      serviceMap.get(id)?.toLowerCase().includes("drone")
    ) || quotation.drone_requirement?.toLowerCase() === "yes";

  const droneCount = servicePersons.find((sp) =>
    serviceMap.get(sp.service_id)?.toLowerCase().includes("drone")
  )?.person_count ?? (isDroneSelected ? 1 : 0);

  const isAlbumSelected =
    Array.from(selectedServiceIds).some((id) =>
      serviceMap.get(id)?.toLowerCase().includes("album")
    ) || quotation.album_requirement?.toLowerCase() === "yes";

  const albumDesignCount = servicePersons.find((sp) =>
    serviceMap.get(sp.service_id)?.toLowerCase().includes("album")
  )?.person_count ?? (isAlbumSelected ? 1 : 0);

  const isPreWeddingSelected =
    quotation.pre_wedding_shoot?.toLowerCase() === "yes" ||
    quotation.pre_wedding_shoot?.toLowerCase() === "required";

  // Dynamic pricing algorithm based on selected parameters
  const basePhotoPrice = 85000 * photographyDays;
  const baseFilmPrice = 110000 * cinematographyDays;
  const baseDronePrice = isDroneSelected ? 25000 * (functionDays.length || 1) : 0;
  const baseAlbumPrice = isAlbumSelected ? 20000 : 0;
  const basePreWeddingPrice = isPreWeddingSelected ? 45000 : 0;

  const extraPhotoCrewCost = Math.max(0, photographyCount - 2) * 25000 * photographyDays;
  const extraCinemaCrewCost = Math.max(0, cinematographyCount - 2) * 25000 * cinematographyDays;
  const extraDroneCrewCost = Math.max(0, droneCount - 1) * 20000 * (functionDays.length || 1);
  const extraAlbumCrewCost = Math.max(0, albumDesignCount - 1) * 15000;
  
  const crewCost = extraPhotoCrewCost + extraCinemaCrewCost + extraDroneCrewCost + extraAlbumCrewCost;
  const deliverablesCost = (photoDeliverables.length * 5000) + (videoDeliverables.length * 10000);

  let totalInvestment = 0;
  if (isPhotographySelected) totalInvestment += basePhotoPrice;
  if (isCinematographySelected) totalInvestment += baseFilmPrice;
  if (isDroneSelected) totalInvestment += baseDronePrice;
  if (isPreWeddingSelected) totalInvestment += basePreWeddingPrice;
  if (isAlbumSelected) totalInvestment += baseAlbumPrice;

  // Custom unmapped services pricing
  services.forEach((service) => {
    const isMapped =
      service.name.toLowerCase().includes("photography") ||
      service.name.toLowerCase().includes("cinematography") ||
      service.name.toLowerCase().includes("drone") ||
      service.name.toLowerCase().includes("album");

    if (!isMapped && selectedServiceIds.has(service.id)) {
      totalInvestment += 30000 * functionDays.length;
    }
  });

  totalInvestment += crewCost + deliverablesCost;

  // Fetch images locally for offline rendering
  const publicDir = process.cwd().replace(/\\/g, "/");
  const coverImageUrl = `file:///${publicDir}/public/images/cover.png`;
  const heroImageUrl1 = `file:///${publicDir}/public/images/landscape1.png`;
  const heroImageUrl2 = `file:///${publicDir}/public/images/landscape2.png`;
  const heroImageUrl3 = `file:///${publicDir}/public/images/landscape3.png`;

  // Dynamically resolved settings values with custom fallbacks
  const companyName = settings.company_name || settings.studio_name || "First Story Films";
  const aboutCompany = settings.about_company || "Founded in 2018, First Story Films has captured over 300+ luxury weddings across the globe, bringing an editorial, high-fashion, and deeply authentic storytelling approach to every celebration.";
  const rawYears = settings.years_of_experience || "7 Years";
  const yearsNumber = rawYears.match(/[0-9+]+/)?.[0] || "7";
  const yearsLabel = rawYears.toLowerCase().includes("year") ? "Years Experience" : "Experience";

  const rawWeddings = settings.weddings_covered || "300+ Celebrations";
  const weddingsNumber = rawWeddings.match(/[0-9+]+/)?.[0] || "300+";
  const weddingsLabel = "Weddings Covered";

  const rawCities = settings.cities_covered || "25+ Destinations";
  const citiesNumber = rawCities.match(/[0-9+]+/)?.[0] || "25+";
  const citiesLabel = "Cities Covered";

  const rawSocial = settings.social_links || "Instagram: @firststoryfilms";
  const socialHandle = rawSocial.includes("@") ? rawSocial.slice(rawSocial.indexOf("@")) : "@firststoryfilms";
  const socialLabel = "Instagram Social";

  const achievements = settings.achievements || "Voted India's Top 10 Luxury Wedding Photographers by multiple elite publications.";
  const awards = settings.awards || "WedMeGood Top Choice 2025, WeddingSutra Gold Winner 2024";
  const featuredPlatforms = settings.featured_platforms || "WedMeGood, WeddingSutra, WeddingWire";
  const publications = settings.publications || "Vogue Weddings, Harper's Bazaar Bride, WeddingSutra";

  const coupleName = quotation.couple_name || notSpecified;
  const contactNumber = quotation.contact_number || notSpecified;
  const email = quotation.email || notSpecified;
  const weddingDate = quotation.wedding_date;
  const coverageDays = functionDays.length || quotation.functions_count || 1;
  const venue = quotation.wedding_venue || quotation.event_location || notSpecified;
  const location = quotation.event_location || notSpecified;
  const projectSummary = quotation.admin_notes || quotation.additional_details || "";

  // Dynamic Date calculation
  const createdDate = quotation.created_at ? new Date(quotation.created_at) : new Date();
  const validTill = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const validTillDate = formatDate(validTill.toISOString().slice(0, 10));

  const packageTotal = totalInvestment;
  const customAmount = Number(quotation.amount ?? 0);
  const gst = 0; // Quotation pricing defaults to GST inclusive / separate on final contract
  const grandTotal = customAmount > 0 ? customAmount : (packageTotal + gst);
  const amountWords = amountInWords(grandTotal);

  // Static Addon check - since DB has no table, we hide or fetch if present
  const addonsList: { name: string; qty: number; rate: number; amount: number }[] = [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Wedding Investment Proposal Booklet - ${escapeHtml(companyName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    @page terms-page {
      size: A4;
      margin-top: 24mm;
      margin-bottom: 24mm;
      margin-left: 20mm;
      margin-right: 20mm;
      background-color: #fbf8f1;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Montserrat', sans-serif;
      color: #111111;
      background-color: #fbf8f1;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 13.5px;
      line-height: 1.6;
    }
    .page {
      width: 210mm;
      height: 297mm;
      padding: 24mm 20mm;
      page-break-after: always;
      page-break-inside: avoid;
      position: relative;
      overflow: hidden;
      background-color: #fbf8f1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .page-footer {
      position: absolute;
      bottom: 15mm;
      left: 20mm;
      right: 20mm;
      border-top: 2px solid #EAE6E1;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #555555;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 600;
    }
    .editorial-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      border: 2px solid #EAE6E1;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .editorial-table th {
      background-color: #F5EFEB;
      color: #111111;
      font-weight: 700;
      text-align: left;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 1.5px;
      padding: 12px 14px;
      border-bottom: 2px solid #EAE6E1;
    }
    .editorial-table td {
      padding: 12px 14px;
      border-bottom: 1px solid #EAE6E1;
      color: #111111;
      vertical-align: middle;
      font-weight: 500;
    }
    .editorial-table tr:last-child td {
      border-bottom: none;
    }
    .schedule-table {
      table-layout: fixed;
      margin-bottom: 0;
    }
    .schedule-table th {
      padding: 9px 10px;
      letter-spacing: 1.1px;
    }
    .schedule-table td {
      padding: 8px 10px;
      vertical-align: top;
      font-size: 10.5px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .schedule-event-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 13.5px;
      line-height: 1.2;
      font-weight: 700;
      color: #111111;
    }
    .schedule-coverage {
      color: #B68D40;
      font-size: 10px;
      line-height: 1.35;
      font-weight: 700;
    }
    .payment-schedule-box {
      border: 2px solid #EAE6E1;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .payment-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid #EAE6E1;
      font-weight: 500;
      color: #111111;
    }
    .payment-row:last-child {
      border-bottom: none;
    }
    .payment-row.header {
      background-color: #F5EFEB;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .payment-percent {
      font-weight: 700;
      color: #B68D40;
    }
    .payment-amount {
      font-family: 'Cormorant Garamond', serif;
      font-weight: 700;
      font-size: 16px;
    }
    .page-terms {
      page: terms-page;
      width: 100%;
      height: auto;
      min-height: 100%;
      overflow: visible;
      padding: 0 !important;
      background-color: #fbf8f1;
    }
    .terms {
      color: #111111;
    }
    .terms h3 {
      break-after: avoid;
      margin: 0 0 12px;
      font-family: 'Cormorant Garamond', serif;
      font-size: 18px;
      line-height: 1.25;
      font-weight: 700;
      color: #B68D40;
    }
    .terms h3:not(:first-child) {
      margin-top: 22px;
    }
    .terms p {
      break-inside: avoid;
      margin: 0 0 12px;
      font-size: 13px;
      line-height: 1.65;
      color: #111111;
      font-weight: 500;
      text-align: justify;
    }
    .terms ul {
      break-inside: avoid;
      margin: 0 0 12px 18px;
      padding: 0;
    }
    .terms li {
      margin: 0 0 7px;
      padding-left: 5px;
      font-size: 13px;
      line-height: 1.55;
      color: #111111;
      font-weight: 500;
    }
  </style>
</head>
<body>

  <!-- ==================== PAGE 1 — COVER PAGE ==================== -->
  <div class="page" style="padding: 0; background-image: url('${coverImageUrl}'); background-size: cover; background-position: center;">
    <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.8) 100%);"></div>
    <div style="position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 30mm 20mm; color: #FFFFFF; text-align: center;">
      <div>
        <div style="font-family: 'Cormorant Garamond', serif; font-size: 40px; font-weight: 600; letter-spacing: 7px; text-transform: uppercase; color: #B68D40; margin-bottom: 8px; text-shadow: 0 2px 5px rgba(0, 0, 0, 0.85);">${escapeHtml(companyName)}</div>
        <div style="font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #FFFFFF; font-weight: 600; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);">Wedding Photography & Proposal Booklet</div>
      </div>
      
      <div>
        <div style="font-size: 12px; letter-spacing: 4px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 24px; text-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.85);">Bespoke Proposals For</div>
        <h1 style="font-family: 'Cormorant Garamond', serif; font-size: 60px; font-weight: 600; line-height: 1.1; margin: 0 0 20px 0; color: #FFFFFF; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.95);">${escapeHtml(coupleName)}</h1>
        <div style="width: 60px; height: 2px; background-color: #B68D40; margin: 0 auto 20px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>
        <div style="font-family: 'Cormorant Garamond', serif; font-size: 26px; font-style: italic; font-weight: 500; color: #FFFFFF; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85);">${weddingDate ? formatDate(weddingDate) : notSpecified}</div>
      </div>

      <div>
        <div style="font-size: 12px; letter-spacing: 2.5px; text-transform: uppercase; color: #FFFFFF; margin-bottom: 6px; font-weight: 600; text-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.85);">${escapeHtml(venue)}</div>
        <div style="font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #B68D40; font-weight: 700; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);">Document Reference: #${escapeHtml(quotation.id.slice(0, 8).toUpperCase())}</div>
      </div>
    </div>
  </div>

  <!-- ==================== PAGE 2 — ABOUT COMPANY ==================== -->
  <div class="page" style="display: flex; flex-direction: row; padding: 0;">
    <div style="width: 50%; padding: 24mm 15mm; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
      <div>
        <div style="font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 12px;">Premium Art</div>
        <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 36px; line-height: 1.15; font-weight: 600; margin: 0 0 20px 0; color: #111111; text-transform: uppercase;">About ${escapeHtml(companyName)}</h2>
        <p style="font-family: 'Montserrat', sans-serif; font-size: 12px; line-height: 1.8; color: #111111; text-align: justify; margin: 0 0 24px 0; font-weight: 500;">${escapeHtml(aboutCompany)}</p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px;">
          <div style="border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; height: 75px; display: flex; flex-direction: column; justify-content: flex-end;">
            <div style="font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 700; color: #B68D40; line-height: 1;">${escapeHtml(yearsNumber)}</div>
            <div style="font-size: 8.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #555555; margin-top: 6px; font-weight: 700;">${escapeHtml(yearsLabel)}</div>
          </div>
          <div style="border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; height: 75px; display: flex; flex-direction: column; justify-content: flex-end;">
            <div style="font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 700; color: #B68D40; line-height: 1;">${escapeHtml(weddingsNumber)}</div>
            <div style="font-size: 8.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #555555; margin-top: 6px; font-weight: 700;">${escapeHtml(weddingsLabel)}</div>
          </div>
          <div style="border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; height: 75px; display: flex; flex-direction: column; justify-content: flex-end;">
            <div style="font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 700; color: #B68D40; line-height: 1;">${escapeHtml(citiesNumber)}</div>
            <div style="font-size: 8.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #555555; margin-top: 6px; font-weight: 700;">${escapeHtml(citiesLabel)}</div>
          </div>
          <div style="border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; height: 75px; display: flex; flex-direction: column; justify-content: flex-end;">
            <div style="font-family: 'Cormorant Garamond', serif; font-size: 19px; font-weight: 700; color: #B68D40; line-height: 1.2; word-break: break-all; margin-bottom: 4px;">${escapeHtml(socialHandle)}</div>
            <div style="font-size: 8.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #555555; margin-top: 6px; font-weight: 700;">${escapeHtml(socialLabel)}</div>
          </div>
        </div>
      </div>
      
      <div style="font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: #111111; border-top: 2px solid #EAE6E1; padding-top: 15px; font-weight: 700;">
        Accolades: ${escapeHtml(achievements)}
      </div>
    </div>
    <div style="width: 50%; height: 100%; background-image: url('${heroImageUrl1}'); background-size: cover; background-position: center;"></div>
  </div>

  <!-- ==================== PAGE 3 — FEATURED IN / TRUST ==================== -->
  <div class="page" style="padding: 0; background-image: url('${heroImageUrl2}'); background-size: cover; background-position: center;">
    <div style="position: absolute; inset: 0; background: rgba(0, 0, 0, 0.85);"></div>
    <div style="position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 30mm 20mm; color: #FFFFFF; text-align: center;">
      <div>
        <div style="font-size: 12px; letter-spacing: 4px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 12px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);">Industry Trust</div>
        <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 40px; font-weight: 500; text-transform: uppercase; letter-spacing: 3px; margin: 0 0 16px 0; color: #FFFFFF; text-shadow: 0 2px 5px rgba(0, 0, 0, 0.85);">Featured Publications & Honors</h2>
        <div style="width: 50px; height: 2px; background-color: #B68D40; margin: 0 auto 30px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>
        <p style="max-width: 140mm; margin: 0 auto; font-family: 'Montserrat', sans-serif; font-size: 13px; line-height: 1.8; color: #FAF7F2; font-weight: 500; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);">We commit to artistic excellence and editorial wedding documentation that has been highlighted by premier platforms.</p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 40px; margin: 40px 0;">
        ${featuredPlatforms ? `
          <div>
            <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 15px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);">Featured Platforms</div>
            <div style="display: flex; justify-content: center; gap: 30px; font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 600; font-style: italic; color: #FFFFFF; letter-spacing: 1.5px; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.85);">
              ${featuredPlatforms.split(",").map((p: string) => `<span>${escapeHtml(p.trim())}</span>`).join("")}
            </div>
          </div>
        ` : ""}
        
        ${publications ? `
          <div>
            <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 15px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);">Selected Publications</div>
            <div style="display: flex; justify-content: center; gap: 30px; font-family: 'Montserrat', sans-serif; font-size: 14px; color: #FAF7F2; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; text-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.85);">
              ${publications.split(",").map((pub: string) => `<span>${escapeHtml(pub.trim())}</span>`).join("")}
            </div>
          </div>
        ` : ""}
      </div>

      <div>
        <div style="font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: #FFFFFF; font-weight: 600; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);">
          ${awards ? `Accolades: ${escapeHtml(awards)}` : ""}
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== PAGE 4 — PROJECT DETAILS ==================== -->
  <div class="page">
    <div style="padding-bottom: 24mm;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EAE6E1; padding-bottom: 10px; margin-bottom: 18px;">
        <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #111111; margin: 0;">Custom Package</h2>
        <div style="font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700;">Proposal Overview</div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px;">
        <div>
          <div style="font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #555555; margin-bottom: 4px; font-weight: 700;">Client Names</div>
          <div style="font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 700; color: #111111;">${escapeHtml(coupleName)}</div>
        </div>
        <div>
          <div style="font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #555555; margin-bottom: 4px; font-weight: 700;">Wedding Location</div>
          <div style="font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 700; color: #111111;">${escapeHtml(location)}</div>
        </div>
        <div>
          <div style="font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #555555; margin-bottom: 4px; font-weight: 700;">Wedding Date</div>
          <div style="font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 700; color: #111111;">${weddingDate ? formatDate(weddingDate) : notSpecified}</div>
        </div>
        <div>
          <div style="font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #555555; margin-bottom: 4px; font-weight: 700;">Coverage Duration</div>
          <div style="font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 700; color: #111111;">${coverageDays} Day(s)</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 22px; font-size: 12.5px; border-top: 2px solid #EAE6E1; padding-top: 13px;">
        <div>
          <div style="font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #555555; margin-bottom: 4px; font-weight: 700;">Contact Information</div>
          <div style="font-family: 'Montserrat', sans-serif; font-size: 12px; color: #111111; line-height: 1.6; font-weight: 600;">
            Phone: ${escapeHtml(contactNumber)}<br>
            Email: ${escapeHtml(email)}
          </div>
        </div>
        <div>
          <div style="font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #555555; margin-bottom: 4px; font-weight: 700;">Project Summary</div>
          <div style="font-family: 'Montserrat', sans-serif; font-size: 12px; color: #111111; line-height: 1.6; text-align: justify; font-weight: 500;">
            ${escapeHtml(projectSummary) || "Dynamic wedding proposal tailored to capture artistic and authentic cinematic and photographic coverage of your celebratory events."}
          </div>
        </div>
      </div>

      <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 20px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin: 0 0 12px 0;">Event Celebration Schedule</h3>
      
      <table class="editorial-table schedule-table">
        <thead>
          <tr>
            <th style="width: 20%; font-size: 9px;">Date</th>
            <th style="width: 30%; font-size: 9px;">Event Name</th>
            <th style="width: 25%; font-size: 9px;">Venue</th>
            <th style="width: 25%; font-size: 9px;">Coverage Type</th>
          </tr>
        </thead>
        <tbody>
          ${functionDays.map((day) => {
            const firstEvent = eventMap.get(day.first_event_id ?? "") || "";
            const secondEvent = eventMap.get(day.second_event_id ?? "") || "";
            const eventString = [firstEvent, secondEvent].filter(Boolean).join(" & ") || "Celebration Event";
            const activeServices = (day.quotation_function_day_services ?? [])
              .map((s) => serviceMap.get(s.service_id))
              .filter(Boolean) as string[];
            const activeServicesList = Array.from(new Set(activeServices)).join(", ");

            return `
              <tr>
                <td><strong>${formatDate(day.day_date)}</strong></td>
                <td><span class="schedule-event-name">${escapeHtml(eventString)}</span></td>
                <td style="font-weight: 600;">${escapeHtml(venue)}</td>
                <td><span class="schedule-coverage">${escapeHtml(activeServicesList)}</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    
    <div class="page-footer">
      <div>${escapeHtml(companyName)}</div>
      <div>Page ${currentPage}</div>
    </div>
  </div>

  <!-- ==================== PAGE 5 — TEAM STRENGTH ==================== -->
  <div class="page">
    <div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; margin-bottom: 24px;">
        <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #111111; margin: 0;">Team Strength</h2>
        <div style="font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700;">Crew Allocation</div>
      </div>

      <img src="${heroImageUrl3}" alt="Cinematic Crew" style="width: 100%; height: 160px; object-fit: cover; border-radius: 4px; margin-bottom: 24px;">

      <p style="font-family: 'Montserrat', sans-serif; font-size: 12px; line-height: 1.7; color: #111111; text-align: justify; margin-bottom: 24px; font-weight: 500;">
        To ensure the highest standard of documentation, we deploy a curated team of specialized photographic and cinematic artists. Our professionals are assigned dynamically to each event according to the creative and logistical parameters required for elite storytelling.
      </p>

      <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 20px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin: 0 0 12px 0;">Dynamic Team Allocation</h3>

      <table class="editorial-table" style="margin-bottom: 0;">
        <thead>
          <tr>
            <th style="width: 35%; font-size: 9px;">SERVICE</th>
            <th style="width: 20%; font-size: 9px;">PERSON COUNT</th>
            <th style="width: 20%; font-size: 9px;">DAY</th>
            <th style="width: 25%; font-size: 9px;">PRICE</th>
          </tr>
        </thead>
        <tbody>
          ${services.filter((service) => selectedServiceIds.has(service.id)).map((service) => {
            const personCountObj = servicePersons.find((sp) => sp.service_id === service.id);
            const personCount = personCountObj ? personCountObj.person_count : 2;
            
            let daysUsed = 0;
            for (const day of functionDays) {
              const dayServices = day.quotation_function_day_services ?? [];
              if (dayServices.some((ds) => ds.service_id === service.id)) {
                daysUsed++;
              }
            }
            if (daysUsed === 0) daysUsed = 1;

            return `
              <tr>
                <td style="font-family: 'Cormorant Garamond', serif; font-size: 15px; font-weight: 700; color: #111111; text-transform: uppercase;">${escapeHtml(service.name)}</td>
                <td style="font-weight: 600;">${personCount}</td>
                <td style="font-weight: 600;">${daysUsed}</td>
                <td style="color: #B68D40; font-weight: 700;">Included in package</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>

    <div class="page-footer">
      <div>${escapeHtml(companyName)}</div>
      <div>Page ${++currentPage}</div>
    </div>
  </div>

  <!-- ==================== PAGE 6 — SERVICES & DELIVERABLES ==================== -->
  ${(() => {
    const activeServices = services.filter((service) => selectedServiceIds.has(service.id));
    
    // Chunk active services into pages of 4 as requested by the user
    const serviceChunks: Service[][] = [];
    const chunkSize = 4;
    for (let i = 0; i < activeServices.length; i += chunkSize) {
      serviceChunks.push(activeServices.slice(i, i + chunkSize));
    }
    
    if (serviceChunks.length === 0) {
      currentPage++;
      return `
        <div class="page">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; margin-bottom: 24px;">
              <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #111111; margin: 0;">Services Included</h2>
              <div style="font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700;">Creative Scope</div>
            </div>
            <p style="font-family: 'Montserrat', sans-serif; font-size: 13px; color: #555555; font-weight: 500;">No services are currently selected for this quotation.</p>
          </div>
          <div class="page-footer">
            <div>${escapeHtml(companyName)}</div>
            <div>Page ${currentPage}</div>
          </div>
        </div>
      `;
    }
    
    return serviceChunks.map((chunk: Service[], chunkIndex: number) => {
      currentPage++;
      return `
        <div class="page">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; margin-bottom: 24px;">
              <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #111111; margin: 0;">Services Included</h2>
              <div style="font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700;">Creative Scope ${serviceChunks.length > 1 ? `(${chunkIndex + 1}/${serviceChunks.length})` : ""}</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 24px;">
              ${chunk.map((service: Service, index: number) => {
                const personCountObj = servicePersons.find((sp) => sp.service_id === service.id);
                const personCount = personCountObj ? personCountObj.person_count : 2;
                
                let daysUsed = 0;
                for (const day of functionDays) {
                  const dayServices = day.quotation_function_day_services ?? [];
                  if (dayServices.some((ds) => ds.service_id === service.id)) {
                    daysUsed++;
                  }
                }
                if (daysUsed === 0) daysUsed = 1;

                let description = service.description?.trim();
                if (!description) {
                  description = "Professional coverage using state-of-the-art camera equipment, custom color grading, and artistic post-production design.";
                  if (service.name.toLowerCase().includes("photography")) {
                    description = "High-fashion, editorial-style wedding photography coverage, capturing the raw emotions, styling, candids, and grand family portraits.";
                  } else if (service.name.toLowerCase().includes("cinematography") || service.name.toLowerCase().includes("cinema") || service.name.toLowerCase().includes("video")) {
                    description = "Cinematic storytelling that records fine audio, bespoke ambient soundtracks, narrative edits, dialogue clips, and dynamic color grading.";
                  }
                }

                let serviceDeliverables: Deliverable[] = [];
                if (service.name.toLowerCase().includes("photography") || service.name.toLowerCase().includes("photo")) {
                  serviceDeliverables = photoDeliverables;
                } else if (service.name.toLowerCase().includes("cinematography") || service.name.toLowerCase().includes("cinema") || service.name.toLowerCase().includes("video")) {
                  serviceDeliverables = videoDeliverables;
                } else {
                  serviceDeliverables = deliverables.filter(d => 
                    !photoDeliverables.includes(d) && !videoDeliverables.includes(d)
                  );
                }

                const isLast = index === chunk.length - 1;

                return `
                  <div style="${isLast ? "" : "border-bottom: 2px solid #F3EFEA; padding-bottom: 16px;"}">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                      <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 21px; font-weight: 700; color: #111111; text-transform: uppercase; margin: 0; letter-spacing: 1px;">${escapeHtml(service.name)}</h3>
                      <span style="font-size: 10px; color: #B68D40; font-weight: 700;">Package Included</span>
                    </div>
                    
                    <p style="font-family: 'Montserrat', sans-serif; font-size: 12px; line-height: 1.6; color: #111111; text-align: justify; margin: 0 0 10px 0; font-weight: 500;">
                      ${escapeHtml(description)}
                    </p>

                    <div style="display: flex; gap: 20px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #555555; margin-bottom: 10px; font-weight: 700;">
                      <span>Crew Size: <strong style="color: #111111;">${personCount} Artist(s)</strong></span>
                      <span>•</span>
                      <span>Duration: <strong style="color: #111111;">${daysUsed} Day(s)</strong></span>
                    </div>

                    ${serviceDeliverables.length > 0 ? `
                      <div>
                        <div style="font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 6px;">Included Deliverables</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                          ${serviceDeliverables.map((bullet: Deliverable) => `
                            <div style="font-size: 11.5px; color: #111111; font-weight: 600; display: flex; align-items: baseline; gap: 6px;">
                              <span style="color: #B68D40;">✦</span>
                              <span>${escapeHtml(bullet.title)}</span>
                            </div>
                          `).join("")}
                        </div>
                      </div>
                    ` : ""}
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <div class="page-footer">
            <div>${escapeHtml(companyName)}</div>
            <div>Page ${currentPage}</div>
          </div>
        </div>
      `;
    }).join("");
  })()}

  <!-- ==================== PAGE 7 — INVESTMENT & MILESTONES ==================== -->
  <div class="page">
    <div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; margin-bottom: 24px;">
        <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #111111; margin: 0;">Investment & Milestones</h2>
      </div>

      ${addonsList && addonsList.length > 0 ? `
        <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin: 0 0 12px 0;">Selected Enhancements</h3>
        <table class="editorial-table" style="margin-bottom: 24px;">
          <thead>
            <tr>
              <th style="width: 50%; font-size: 9px;">Addon / Enhancement</th>
              <th style="width: 15%; text-align: right; font-size: 9px;">Qty</th>
              <th style="width: 15%; text-align: right; font-size: 9px;">Rate</th>
              <th style="width: 20%; text-align: right; font-size: 9px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${addonsList.map((addon) => `
              <tr>
                <td style="font-family: 'Cormorant Garamond', serif; font-size: 13.5px; font-weight: 700; color: #111111;">${escapeHtml(addon.name)}</td>
                <td style="text-align: right;">${addon.qty}</td>
                <td style="text-align: right; color: #555555;">${formatCurrency(addon.rate)}</td>
                <td style="text-align: right; font-weight: 700; color: #111111;">${formatCurrency(addon.amount)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}



      <div style="background-color: #111111; border-radius: 4px; padding: 22px; color: #FFFFFF; display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px;">
        <div>
          <div style="font-size: 9.5px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin-bottom: 4px;">Grand Total Investment</div>
          <div style="font-size: 12px; color: #FFFFFF; font-weight: 600; font-family: 'Cormorant Garamond', serif; font-style: italic; letter-spacing: 0.5px;">${escapeHtml(amountWords)}</div>
        </div>
        <strong style="font-family: 'Cormorant Garamond', serif; font-size: 28px; color: #B68D40; font-weight: 700; letter-spacing: 1px;">${formatCurrency(grandTotal)}</strong>
      </div>

      <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 20px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700; margin: 0 0 12px 0;">Payment Schedule Milestones</h3>
      
      <div class="payment-schedule-box" style="margin-bottom: 24px;">
        <div class="payment-row header">
          <span>Milestone Phase</span>
          <span style="text-align: right;">Amount</span>
        </div>
        <div class="payment-row">
          <span style="font-weight: 600;">40% Advance (For booking confirmation)</span>
          <span class="payment-amount" style="color: #111111; text-align: right;">${formatCurrency(grandTotal * 0.4)}</span>
        </div>
        <div class="payment-row">
          <span style="font-weight: 600;">60% Balance (To be cleared on or before the wedding)</span>
          <span class="payment-amount" style="color: #111111; text-align: right;">${formatCurrency(grandTotal * 0.6)}</span>
        </div>
      </div>

      <div style="border-left: 3px solid #B68D40; padding: 12px 18px; background-color: #F5EFEB; font-size: 11.5px; color: #111111; border-radius: 0 4px 4px 0; font-weight: 500; display: flex; flex-direction: column; gap: 8px;">
        <div><strong>Validity Notice:</strong> This premium wedding brochure, bespoke pricing proposals, and calendar availability are strictly valid till <strong style="color: #111111; font-weight: 700;">${escapeHtml(validTillDate)}</strong>.</div>
        <div><strong>Retainer Clause:</strong> Production editing, post-production color grading, signature album rendering, and final delivery will be generated and dispatched only after 100% clearing and realization of the final balance payment as detailed in the milestones.</div>
      </div>
    </div>

    <div class="page-footer">
      <div>${escapeHtml(companyName)}</div>
      <div>Page ${++currentPage}</div>
    </div>
  </div>

  <!-- ==================== PAGE 8 — TERMS & CONDITIONS ==================== -->
  <div class="page page-terms">
    <div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EAE6E1; padding-bottom: 12px; margin-bottom: 24px;">
        <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #111111; margin: 0;">Terms & Conditions</h2>
        <div style="font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #B68D40; font-weight: 700;">Agreement</div>
      </div>

      <div class="terms">
        ${renderTerms(terms)}
      </div>
    </div>
  </div>

</body>
</html>`.trim();
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

function escapeHtml(value: string) {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
