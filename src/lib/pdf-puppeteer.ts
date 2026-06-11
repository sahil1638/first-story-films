import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const chromiumCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

function getExecutablePath() {
  return chromiumCandidates.find((candidate) => fs.existsSync(candidate));
}

function isAllowedPdfResource(url: string) {
  if (
    url === "about:blank" ||
    url.startsWith("data:") ||
    url.startsWith("https://fonts.googleapis.com/") ||
    url.startsWith("https://fonts.gstatic.com/")
  ) {
    return true;
  }

  if (url.startsWith("file://")) {
    const publicDir = path.resolve(process.cwd(), "public");
    const filePath = path.resolve(fileURLToPath(url));
    return filePath === publicDir || filePath.startsWith(`${publicDir}${path.sep}`);
  }

  return false;
}

function mimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function isPublicFilePath(filePath: string) {
  const publicDir = path.resolve(process.cwd(), "public");
  const resolvedPath = path.resolve(filePath);
  return resolvedPath === publicDir || resolvedPath.startsWith(`${publicDir}${path.sep}`);
}

function inlinePublicFileImages(htmlContent: string) {
  return htmlContent.replace(/file:\/\/\/[^"')]+/g, (fileUrl) => {
    const filePath = path.resolve(fileURLToPath(fileUrl));
    if (!isPublicFilePath(filePath) || !fs.existsSync(filePath)) {
      return fileUrl;
    }

    const content = fs.readFileSync(filePath);
    return `data:${mimeTypeForFile(filePath)};base64,${content.toString("base64")}`;
  });
}

/**
 * Compiles a luxury HTML/CSS template to a PDF Buffer using a headless browser (Puppeteer).
 * 
 * Enforces the following configurations:
 * 1. printBackground: true (renders background colors, gradients, and images)
 * 2. Margins: top: 0, left: 0, right: 0 (enables full-bleed hero headers)
 * 3. Asset Loading: Wait for all network resources to settle (Google Fonts, Unsplash assets)
 */
export async function compileHtmlToPdf(htmlContent: string): Promise<Buffer> {
  const executablePath = getExecutablePath();
  const renderHtml = inlinePublicFileImages(htmlContent);
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ],
  });
  
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      if (isAllowedPdfResource(request.url())) {
        await request.continue();
      } else {
        await request.abort();
      }
    });
    
    // Set a standard desktop User-Agent to bypass CDN bot blocking (e.g. Unsplash/Cloudflare 403 Forbidden)
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    
    await page.setContent(renderHtml, {
      waitUntil: "load",
      timeout: 30000,
    });
    
    // Explicit brief delay to ensure sub-layout styles and fonts are rendered
    await new Promise((r) => setTimeout(r, 1000));

    // Generate A4 PDF with full-bleed configuration
    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    return Buffer.from(pdfUint8Array);
  } finally {
    await browser.close();
  }
}
