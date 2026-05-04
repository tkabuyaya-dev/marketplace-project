/**
 * NUNULIA — Génération reçu PDF + upload Cloudinary
 *
 * Génère un reçu d'abonnement minimal en PDF via pdf-lib (aucune police
 * externe requise : StandardFonts.Helvetica couvre tout le Latin étendu).
 * Uploadé sur Cloudinary en resource_type=raw pour obtenir une URL stable.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReceiptData {
  receiptId: string;       // ex. REQ-<requestId> ou auto-generated
  vendorId: string;
  sellerName: string;
  sellerEmail?: string;
  planLabel: string;
  countryId: string;
  currency: string;
  amount: number;
  transactionRef: string | null;
  verifiedVia: string | null;
  approvedAt: number;      // ms timestamp
  expiresAt: number;       // ms timestamp
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Construit le PDF en mémoire. Retourne un Uint8Array.
 */
export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();

  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const BLUE  = rgb(0.067, 0.416, 0.925); // #1169EC
  const GREY  = rgb(0.4, 0.4, 0.4);
  const BLACK = rgb(0.1, 0.1, 0.1);
  const WHITE = rgb(1, 1, 1);

  let y = height - 60;

  // ── En-tête ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: BLUE });

  page.drawText("NUNULIA", {
    x: 40, y: height - 55,
    size: 28, font: fontBold, color: WHITE,
  });
  page.drawText("Reçu d'abonnement", {
    x: 40, y: height - 80,
    size: 12, font: fontRegular, color: WHITE,
  });

  // N° reçu (coin droit)
  const recTxt = `N° ${d.receiptId}`;
  const recW   = fontRegular.widthOfTextAtSize(recTxt, 10);
  page.drawText(recTxt, {
    x: width - recW - 40, y: height - 55,
    size: 10, font: fontRegular, color: WHITE,
  });
  const dateTxt = formatDate(d.approvedAt);
  const dateW   = fontRegular.widthOfTextAtSize(dateTxt, 10);
  page.drawText(dateTxt, {
    x: width - dateW - 40, y: height - 75,
    size: 10, font: fontRegular, color: WHITE,
  });

  y = height - 140;

  // ── Section "Émis à" ─────────────────────────────────────────────────────
  drawSectionTitle(page, fontBold, "Vendeur", 40, y, BLUE);
  y -= 22;
  drawRow(page, fontRegular, fontBold, "Nom", d.sellerName, 40, y, BLACK, GREY);
  y -= 18;
  if (d.sellerEmail) {
    drawRow(page, fontRegular, fontBold, "Email", d.sellerEmail, 40, y, BLACK, GREY);
    y -= 18;
  }
  drawRow(page, fontRegular, fontBold, "Pays", d.countryId.toUpperCase(), 40, y, BLACK, GREY);
  y -= 35;

  // Ligne de séparation
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  // ── Section "Abonnement" ─────────────────────────────────────────────────
  drawSectionTitle(page, fontBold, "Details de l'abonnement", 40, y, BLUE);
  y -= 22;
  drawRow(page, fontRegular, fontBold, "Plan", d.planLabel, 40, y, BLACK, GREY);
  y -= 18;
  drawRow(page, fontRegular, fontBold, "Valide jusqu'au", formatDate(d.expiresAt), 40, y, BLACK, GREY);
  y -= 18;
  if (d.transactionRef) {
    drawRow(page, fontRegular, fontBold, "Ref. transaction", d.transactionRef, 40, y, BLACK, GREY);
    y -= 18;
  }
  if (d.verifiedVia) {
    drawRow(page, fontRegular, fontBold, "Mode de paiement", d.verifiedVia, 40, y, BLACK, GREY);
    y -= 18;
  }
  y -= 20;

  // ── Bloc montant ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: width - 220, y: y - 50, width: 180, height: 70, color: rgb(0.95, 0.97, 1) });
  page.drawText("MONTANT PAYÉ", {
    x: width - 210, y: y + 5,
    size: 9, font: fontBold, color: GREY,
  });
  const amtTxt = `${d.amount.toLocaleString("fr-FR")} ${d.currency}`;
  page.drawText(amtTxt, {
    x: width - 210, y: y - 20,
    size: 18, font: fontBold, color: BLUE,
  });
  y -= 80;

  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  // ── Note légale ──────────────────────────────────────────────────────────
  page.drawText(
    "Ce document constitue une preuve de paiement et d'activation de votre abonnement NUNULIA.",
    { x: 40, y, size: 9, font: fontRegular, color: GREY, maxWidth: width - 80 }
  );
  y -= 15;
  page.drawText("Pour toute question, contactez le support via la plateforme.", {
    x: 40, y, size: 9, font: fontRegular, color: GREY,
  });

  // ── Pied de page ─────────────────────────────────────────────────────────
  page.drawText("nunulia.com", {
    x: 40, y: 30,
    size: 9, font: fontRegular, color: GREY,
  });
  page.drawText(`Document généré le ${formatDate(Date.now())}`, {
    x: width - 200, y: 30,
    size: 9, font: fontRegular, color: GREY,
  });

  return doc.save();
}

function drawSectionTitle(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  x: number,
  y: number,
  color: ReturnType<typeof rgb>
): void {
  page.drawText(text.toUpperCase(), { x, y, size: 11, font, color });
}

function drawRow(
  page: ReturnType<PDFDocument["addPage"]>,
  fontLabel: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontValue: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  label: string,
  value: string,
  x: number,
  y: number,
  colorValue: ReturnType<typeof rgb>,
  colorLabel: ReturnType<typeof rgb>
): void {
  page.drawText(`${label} :`, { x, y, size: 10, font: fontLabel, color: colorLabel });
  page.drawText(value, { x: x + 160, y, size: 10, font: fontValue, color: colorValue });
}

// ─── Cloudinary raw upload ────────────────────────────────────────────────────

interface CloudinaryRawUploadResult {
  secure_url: string;
  public_id: string;
}

/**
 * Uploade un buffer PDF vers Cloudinary (resource_type=raw).
 * Signature via HMAC SHA1 comme dans delete-products.ts.
 */
export async function uploadPdfToCloudinary(
  pdfBytes: Uint8Array,
  publicId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder    = "nunulia-receipts";

  // Params sorted alphabetically before signing
  const signParams = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature  = createHash("sha1").update(signParams).digest("hex");

  const formData = new FormData();
  formData.append("file",         new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" }), `${publicId}.pdf`);
  formData.append("api_key",      apiKey);
  formData.append("timestamp",    timestamp);
  formData.append("signature",    signature);
  formData.append("public_id",    publicId);
  formData.append("folder",       folder);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
  const response = await fetch(url, { method: "POST", body: formData });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary raw upload failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as CloudinaryRawUploadResult;
  return json.secure_url;
}
