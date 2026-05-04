import PDFDocument from "pdfkit";
import type { ApplicationSummaryData, QAEntry } from "./application-summary-data";

/**
 * Render the operator-queue Q&A summary PDF.
 *
 * Visual conventions (kept simple but consistent):
 *  - Bundled Helvetica family — no font assets to ship.
 *  - 0.75 in margins, US Letter — fits cleanly when printed.
 *  - Two-column key/value layout (~32% label, ~68% value) for scanning.
 *  - Section headers above a thin rule for clear visual hierarchy.
 *  - Footer with page number and application ID drawn in a buffered pass
 *    so totals are accurate.
 */

const PAGE_OPTS = { size: "LETTER" as const, margins: { top: 54, bottom: 64, left: 54, right: 54 } };
const COLOR_TEXT = "#111111";
const COLOR_MUTED = "#555555";
const COLOR_RULE = "#cccccc";
const COLOR_ACCENT = "#7c3aed"; // violet-600 — matches existing UI accent
const COLOR_WARN = "#b45309"; // amber-700
const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_OBLIQUE = "Helvetica-Oblique";

function formatDate(d: Date): string {
  return `${d.toUTCString()}`;
}

function fmtMaybe(v: string | null | undefined): string {
  return v && v.length > 0 ? v : "—";
}

interface RenderInput {
  data: ApplicationSummaryData;
}

export async function renderApplicationSummaryPDF({ data }: RenderInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        ...PAGE_OPTS,
        bufferPages: true, // allow footer pass after content
        info: {
          Title: `Application summary — ${data.header.companyName} / ${data.header.jobTitle}`,
          Author: "Pipeline",
          Subject: `Application ${data.header.applicationId}`,
          Creator: "Pipeline operator queue",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawHeader(doc, data);
      drawApplicantBlock(doc, data);
      drawTrackingBlock(doc, data);
      if (data.operatorNotes.length > 0) drawOperatorNotes(doc, data.operatorNotes);
      drawAnsweredQA(doc, data.answered);
      drawPendingQA(doc, data.pending);
      if (data.eeoc) drawEeoc(doc, data.eeoc);

      drawFooters(doc, data.header.applicationId);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function pageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc: PDFKit.PDFDocument, required: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + required > bottom) doc.addPage();
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  // Reserve space for header + rule + a couple of body lines so we don't
  // orphan the header at the bottom of a page.
  ensureSpace(doc, 64);
  doc.moveDown(0.5);
  doc
    .fillColor(COLOR_ACCENT)
    .font(FONT_BOLD)
    .fontSize(10)
    .text(title.toUpperCase(), { characterSpacing: 1 });
  const y = doc.y + 2;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.5)
    .strokeColor(COLOR_RULE)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor(COLOR_TEXT);
}

/** Two-column row: bold label on left, wrapped value on right. */
function kvRow(doc: PDFKit.PDFDocument, label: string, value: string, opts?: { valueColor?: string; valueOblique?: boolean }): void {
  const labelWidth = pageWidth(doc) * 0.32;
  const valueWidth = pageWidth(doc) * 0.65;
  const valueX = doc.page.margins.left + labelWidth + 8;

  // Measure both columns BEFORE drawing so the page-break reservation is
  // accurate and we don't compute label height with the wrong active font.
  doc.font(FONT_BOLD).fontSize(10);
  const labelHeight = doc.heightOfString(label, { width: labelWidth });
  doc.font(opts?.valueOblique ? FONT_OBLIQUE : FONT_REGULAR).fontSize(10);
  const valueHeight = doc.heightOfString(value, { width: valueWidth });

  const rowHeight = Math.max(labelHeight, valueHeight);
  ensureSpace(doc, rowHeight + 6);

  const y = doc.y;

  doc
    .font(FONT_BOLD)
    .fontSize(10)
    .fillColor(COLOR_MUTED)
    .text(label, doc.page.margins.left, y, { width: labelWidth });

  doc
    .font(opts?.valueOblique ? FONT_OBLIQUE : FONT_REGULAR)
    .fontSize(10)
    .fillColor(opts?.valueColor ?? COLOR_TEXT)
    .text(value, valueX, y, { width: valueWidth });

  // Advance to whichever column ended lower so the next row doesn't overlap.
  doc.y = y + rowHeight + 4;
  doc.x = doc.page.margins.left;
  doc.fillColor(COLOR_TEXT);
}

function bodyText(doc: PDFKit.PDFDocument, text: string, color = COLOR_TEXT): void {
  ensureSpace(doc, 24);
  doc.font(FONT_REGULAR).fontSize(10).fillColor(color).text(text, { width: pageWidth(doc) });
  doc.moveDown(0.3);
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function drawHeader(doc: PDFKit.PDFDocument, data: ApplicationSummaryData): void {
  doc
    .font(FONT_BOLD)
    .fontSize(18)
    .fillColor(COLOR_TEXT)
    .text("Operator Application Summary", { width: pageWidth(doc) });
  doc.moveDown(0.2);

  doc
    .font(FONT_REGULAR)
    .fontSize(12)
    .fillColor(COLOR_MUTED)
    .text(`${data.header.jobTitle} · ${data.header.companyName}`, { width: pageWidth(doc) });
  doc.moveDown(0.4);

  doc
    .font(FONT_REGULAR)
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text(`Application ID: ${data.header.applicationId}`, { width: pageWidth(doc) })
    .text(`Generated at: ${formatDate(data.header.generatedAt)}`, { width: pageWidth(doc) });
  if (data.header.applyUrl) {
    doc.text(`Source URL: ${data.header.applyUrl}`, { width: pageWidth(doc) });
  }
  doc.moveDown(0.4);

  // Header rule
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(1)
    .strokeColor(COLOR_TEXT)
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor(COLOR_TEXT);
}

function drawApplicantBlock(doc: PDFKit.PDFDocument, data: ApplicationSummaryData): void {
  sectionHeader(doc, "Applicant");
  const a = data.applicant;
  kvRow(doc, "Name", a.fullName);
  if (a.preferredFirstName) kvRow(doc, "Preferred name", a.preferredFirstName);
  kvRow(doc, "Email", a.email);
  kvRow(doc, "Phone", fmtMaybe(a.phone));
  kvRow(doc, "Location", fmtMaybe(a.location));
  if (a.country) kvRow(doc, "Country", a.country);
  if (a.linkedIn) kvRow(doc, "LinkedIn", a.linkedIn);
  if (a.github) kvRow(doc, "GitHub", a.github);
  if (a.website) kvRow(doc, "Website", a.website);
  kvRow(doc, "Resume file", fmtMaybe(a.resumeFileName), { valueOblique: !a.resumeFileName });
}

function drawTrackingBlock(doc: PDFKit.PDFDocument, data: ApplicationSummaryData): void {
  sectionHeader(doc, "Tracking");
  const t = data.tracking;
  kvRow(doc, "Tracking email", fmtMaybe(t.trackingEmail));
  kvRow(doc, "Board / external ID", `${t.boardToken} / ${t.externalId}`);
  if (t.manualApplyUrl) kvRow(doc, "Manual apply URL", t.manualApplyUrl);
  if (t.snapshotAt) kvRow(doc, "Snapshot taken", t.snapshotAt);
}

function drawOperatorNotes(doc: PDFKit.PDFDocument, notes: string[]): void {
  sectionHeader(doc, "Operator notes");
  for (const note of notes) {
    ensureSpace(doc, 24);
    const x = doc.page.margins.left;
    const y = doc.y;
    // Bullet
    doc
      .font(FONT_BOLD)
      .fontSize(10)
      .fillColor(COLOR_WARN)
      .text("•", x, y, { width: 12 });
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .fillColor(COLOR_TEXT)
      .text(note, x + 12, y, { width: pageWidth(doc) - 12 });
    doc.moveDown(0.2);
    doc.x = x;
  }
  doc.fillColor(COLOR_TEXT);
}

function drawAnsweredQA(doc: PDFKit.PDFDocument, answered: QAEntry[]): void {
  sectionHeader(doc, `Answered application questions (${answered.length})`);
  if (answered.length === 0) {
    bodyText(doc, "No custom questions were captured for this application.", COLOR_MUTED);
    return;
  }
  for (const q of answered) {
    drawQAEntry(doc, q);
  }
}

function drawPendingQA(doc: PDFKit.PDFDocument, pending: QAEntry[]): void {
  const unanswered = pending.filter((q) => q.status === "unanswered");
  const partial = pending.filter((q) => q.status === "answered");
  sectionHeader(
    doc,
    `Pending / operator-flagged questions (${unanswered.length} unanswered · ${partial.length} answered)`
  );
  if (pending.length === 0) {
    bodyText(doc, "No pending questions flagged for this application.", COLOR_MUTED);
    return;
  }
  // Render unanswered first — those are what the operator must fill.
  for (const q of [...unanswered, ...partial]) {
    drawQAEntry(doc, q);
  }
}

function drawQAEntry(doc: PDFKit.PDFDocument, q: QAEntry): void {
  // Reserve only label + first answer line so we don't orphan a question
  // header at the bottom, but still let long free-text answers flow
  // naturally across pages instead of jamming past the footer.
  doc.font(FONT_BOLD).fontSize(10);
  const labelHeight = doc.heightOfString(q.label, { width: pageWidth(doc) - 64 });
  doc.font(FONT_REGULAR).fontSize(10);
  const oneLine = doc.currentLineHeight();
  ensureSpace(doc, labelHeight + oneLine + 18);

  const x = doc.page.margins.left;

  // Status pill + label row
  const pillText = q.status === "unanswered" ? (q.required ? "REQUIRED" : "OPEN") : "ANSWERED";
  const pillColor = q.status === "unanswered" ? (q.required ? "#dc2626" : COLOR_WARN) : "#15803d";

  const startY = doc.y;
  doc
    .font(FONT_BOLD)
    .fontSize(8)
    .fillColor(pillColor)
    .text(pillText, x, startY, { width: 60, characterSpacing: 0.5 });

  doc
    .font(FONT_BOLD)
    .fontSize(10)
    .fillColor(COLOR_TEXT)
    .text(q.label, x + 64, startY, { width: pageWidth(doc) - 64 });

  const labelBottom = Math.max(startY + 12, doc.y);
  doc.y = labelBottom + 2;
  doc.x = x;

  doc
    .font(q.status === "unanswered" ? FONT_OBLIQUE : FONT_REGULAR)
    .fontSize(10)
    .fillColor(q.status === "unanswered" ? COLOR_MUTED : COLOR_TEXT)
    .text(q.answer, x + 12, doc.y, { width: pageWidth(doc) - 12 });

  doc.moveDown(0.5);
  doc.x = x;
  doc.fillColor(COLOR_TEXT);
}

function drawEeoc(doc: PDFKit.PDFDocument, eeoc: NonNullable<ApplicationSummaryData["eeoc"]>): void {
  sectionHeader(doc, "EEOC disclosures");
  kvRow(doc, "Gender", fmtMaybe(eeoc.gender));
  kvRow(doc, "Race / ethnicity", fmtMaybe(eeoc.race));
  kvRow(doc, "Veteran status", fmtMaybe(eeoc.veteranStatus));
  kvRow(doc, "Disability", fmtMaybe(eeoc.disability));
}

// ─── Footer pass ──────────────────────────────────────────────────────────────

function drawFooters(doc: PDFKit.PDFDocument, applicationId: string): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const footerY = doc.page.height - doc.page.margins.bottom + 24;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    // Top rule for footer
    doc
      .moveTo(left, footerY - 6)
      .lineTo(right, footerY - 6)
      .lineWidth(0.5)
      .strokeColor(COLOR_RULE)
      .stroke();

    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(`Application ${applicationId}`, left, footerY, {
        width: pageWidth(doc),
        align: "left",
        lineBreak: false,
      });
    doc.text(`Page ${i + 1} of ${range.count}`, left, footerY, {
      width: pageWidth(doc),
      align: "right",
      lineBreak: false,
    });
  }
}
