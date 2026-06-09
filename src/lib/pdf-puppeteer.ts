import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import os from "os";

/**
 * Compiles a luxury HTML/CSS template to a PDF Buffer using a headless browser (Puppeteer).
 * 
 * Enforces the following configurations:
 * 1. printBackground: true (renders background colors, gradients, and images)
 * 2. Margins: top: 0, left: 0, right: 0 (enables full-bleed hero headers)
 * 3. Asset Loading: Wait for all network resources to settle (Google Fonts, Unsplash assets)
 */
export async function compileHtmlToPdf(htmlContent: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--allow-file-access-from-files"
    ],
  });
  
  const tempPath = path.join(os.tmpdir(), `temp_quotation_${Date.now()}.html`);
  
  try {
    // Write content to a temporary local file so Chrome opens it with a file:/// origin,
    // which fully permits loading other local public image files on disk.
    await fs.writeFile(tempPath, htmlContent, "utf-8");

    const page = await browser.newPage();
    
    // Set a standard desktop User-Agent to bypass CDN bot blocking (e.g. Unsplash/Cloudflare 403 Forbidden)
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    
    // Load local file origin in browser
    const fileUrl = `file:///${tempPath.replace(/\\/g, "/")}`;
    await page.goto(fileUrl, {
      waitUntil: "networkidle2",
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
    // Clean up temporary local file
    await fs.unlink(tempPath).catch(() => {});
    await browser.close();
  }
}
