import type { Alert, Portfolio, Supplier } from "@/data/suppliers";
import { riskLevel } from "@/data/suppliers";

/**
 * Generates a polished, multi-page vector PDF of the supplier risk portfolio:
 *   1. Cover page (hero gauge + headline stats)
 *   2. Portfolio overview (KPIs, distribution + dimension-average charts, top alerts)
 *   3. Supplier register (full ranked table)
 *   4+. Per-supplier detail cards — 5-dimension radar, score bars, 30-day
 *       timeline area chart, key metrics, primary driver.
 *
 * Everything is drawn with jsPDF vector primitives (no DOM rasterization) so
 * text stays crisp/selectable and the app's oklch theme colors don't need to
 * round-trip through a canvas.
 */

type RGB = [number, number, number];

// ── Brand palette (mirrors "Porcelain & Evergreen Ink") ──
const C = {
  ink: [31, 51, 43] as RGB,
  evergreen: [38, 77, 58] as RGB,
  evergreenDeep: [24, 46, 36] as RGB,
  porcelain: [247, 246, 242] as RGB,
  white: [255, 255, 255] as RGB,
  border: [225, 223, 216] as RGB,
  muted: [108, 112, 104] as RGB,
  low: [76, 134, 99] as RGB,
  med: [184, 140, 58] as RGB,
  high: [168, 70, 60] as RGB,
};

const DIMS = [
  { key: "financial", label: "Financial" },
  { key: "operational", label: "Operational" },
  { key: "compliance", label: "Compliance" },
  { key: "geopolitical", label: "Geopolitical" },
  { key: "esg", label: "ESG" },
] as const;

function bandColor(score: number): RGB {
  const lvl = riskLevel(score);
  return lvl === "high" ? C.high : lvl === "medium" ? C.med : C.low;
}
function bandLabel(score: number): string {
  return riskLevel(score).toUpperCase();
}
/** Mix a color toward white (amount 0..1) for soft fills. */
function tint(c: RGB, amount: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * amount),
    Math.round(c[1] + (255 - c[1]) * amount),
    Math.round(c[2] + (255 - c[2]) * amount),
  ];
}

export async function exportPortfolioPdf(args: {
  suppliers: Supplier[];
  alerts: Alert[];
  portfolio?: Portfolio;
}): Promise<void> {
  const { suppliers, alerts, portfolio } = args;

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const contentW = pageW - M * 2;

  // ── Derived metrics ──────────────────────────────────────
  const total = suppliers.length || 1;
  const portfolioRisk =
    portfolio?.portfolioRisk ??
    Math.round(suppliers.reduce((s, x) => s + x.overall, 0) / total);
  const buckets = { low: 0, medium: 0, high: 0 };
  suppliers.forEach((s) => buckets[riskLevel(s.overall)]++);
  const dimAvgs = DIMS.map((d) => ({
    label: d.label,
    value: Math.round(suppliers.reduce((s, x) => s + (x.scores[d.key] ?? 0), 0) / total),
  }));
  const unack = alerts.filter((a) => !a.acknowledged);
  const criticalCount =
    portfolio?.criticalCount ?? unack.filter((a) => a.severity === "high").length;
  const sorted = [...suppliers].sort((a, b) => b.overall - a.overall);
  const generated = new Date();

  // ════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ════════════════════════════════════════════════════════
  doc.setFillColor(...C.evergreenDeep);
  doc.rect(0, 0, pageW, pageH, "F");
  // Subtle top band accent
  doc.setFillColor(...C.evergreen);
  doc.rect(0, 0, pageW, 6, "F");

  // Brand mark
  doc.setFillColor(...C.white);
  doc.circle(M + 14, 92, 15, "F");
  doc.setTextColor(...C.evergreenDeep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("R", M + 14, 97, { align: "center" });
  doc.setTextColor(...C.white);
  doc.setFontSize(12);
  doc.text("SCMDOJO  ·  RiskScan", M + 38, 96);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(...C.white);
  doc.text("Supplier Risk", M, 230);
  doc.text("Portfolio Report", M, 272);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(200, 212, 202);
  doc.text(
    "Autonomous monitoring across financial, operational, compliance,",
    M, 304,
  );
  doc.text("geopolitical and ESG risk dimensions.", M, 320);

  // Hero gauge
  drawGauge(doc, pageW / 2, 470, 78, portfolioRisk, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 212, 202);
  doc.text("PORTFOLIO RISK INDEX", pageW / 2, 560, { align: "center" });

  // Headline stat chips
  const chipY = 610;
  const chips = [
    { label: "Suppliers", value: String(suppliers.length) },
    { label: "Critical Alerts", value: String(criticalCount) },
    { label: "Risk Scans", value: String(portfolio?.scansCompleted ?? 0) },
    { label: "Alerts Raised", value: String(portfolio?.alertsRaised ?? alerts.length) },
  ];
  const chipW = (contentW - 3 * 14) / 4;
  chips.forEach((c, i) => {
    const x = M + i * (chipW + 14);
    doc.setFillColor(...C.evergreen);
    doc.roundedRect(x, chipY, chipW, 70, 10, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...C.white);
    doc.text(c.value, x + chipW / 2, chipY + 36, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(190, 205, 195);
    doc.text(c.label.toUpperCase(), x + chipW / 2, chipY + 54, { align: "center" });
  });

  // Footer on cover
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 178, 168);
  doc.text(
    `Generated ${generated.toLocaleDateString()} ${generated.toLocaleTimeString()}`,
    M, pageH - 40,
  );
  doc.text("Confidential", pageW - M, pageH - 40, { align: "right" });

  // ════════════════════════════════════════════════════════
  // PAGE 2 — PORTFOLIO OVERVIEW
  // ════════════════════════════════════════════════════════
  doc.addPage();
  let y = pageHeader(doc, pageW, M, "Portfolio Overview", "Aggregate posture across the supplier base");

  // KPI cards
  const kpis = [
    { label: "Portfolio Risk Index", value: String(portfolioRisk), tone: bandColor(portfolioRisk) },
    { label: "Monitored Entities", value: String(suppliers.length), tone: C.ink },
    { label: "Critical Alerts", value: String(criticalCount), tone: C.high },
    { label: "Risk Scans Run", value: String(portfolio?.scansCompleted ?? 0), tone: C.evergreen },
  ];
  const cardW = (contentW - 3 * 12) / 4;
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + 12);
    roundedCard(doc, x, y, cardW, 62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(k.label.toUpperCase(), x + 11, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.setTextColor(...k.tone);
    doc.text(k.value, x + 11, y + 44);
  });
  y += 62 + 22;

  // Distribution + dimension averages side by side
  const chartH = 168;
  const halfW = (contentW - 16) / 2;

  roundedCard(doc, M, y, halfW, chartH);
  sectionLabel(doc, "RISK DISTRIBUTION", M + 14, y + 20);
  drawBars(
    doc, M + 14, y + 36, halfW - 28, chartH - 58,
    [
      { label: "Low", value: buckets.low, color: C.low },
      { label: "Medium", value: buckets.medium, color: C.med },
      { label: "High", value: buckets.high, color: C.high },
    ],
    Math.max(suppliers.length, 1), true,
  );

  const dx = M + halfW + 16;
  roundedCard(doc, dx, y, halfW, chartH);
  sectionLabel(doc, "AVERAGE RISK BY DIMENSION", dx + 14, y + 20);
  drawBars(
    doc, dx + 14, y + 36, halfW - 28, chartH - 58,
    dimAvgs.map((d) => ({ label: d.label.slice(0, 4), value: d.value, color: bandColor(d.value) })),
    100, true,
  );
  y += chartH + 22;

  // Portfolio radar (dimension averages as a radar)
  const radarH = 230;
  roundedCard(doc, M, y, contentW, radarH);
  sectionLabel(doc, "PORTFOLIO RISK SURFACE — AVERAGE ACROSS ALL SUPPLIERS", M + 14, y + 20);
  drawRadar(
    doc, M + contentW / 2, y + radarH / 2 + 12, 78,
    dimAvgs.map((d) => ({ label: d.label, value: d.value })),
    C.evergreen,
  );
  drawFooter(doc, pageW, pageH, M);

  // ════════════════════════════════════════════════════════
  // PAGE 3 — SUPPLIER REGISTER TABLE
  // ════════════════════════════════════════════════════════
  doc.addPage();
  const tableTop = pageHeader(doc, pageW, M, "Supplier Register", "All suppliers ranked by overall risk index");
  autoTable(doc, {
    startY: tableTop,
    margin: { left: M, right: M },
    head: [["#", "Supplier", "Country", "Category", "Tier", "Fin", "Ops", "Comp", "Geo", "ESG", "Overall", "Band"]],
    body: sorted.map((s, i) => [
      i + 1, s.name, s.country, s.category, `T${s.tier}`,
      s.scores.financial, s.scores.operational, s.scores.compliance,
      s.scores.geopolitical, s.scores.esg, s.overall, bandLabel(s.overall),
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: C.ink, lineColor: C.border, lineWidth: 0.5 },
    headStyles: { fillColor: C.evergreen, textColor: C.white, fontSize: 8, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { cellWidth: 22, halign: "center", textColor: C.muted },
      1: { cellWidth: 104, fontStyle: "bold" },
      4: { halign: "center" },
      5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "center" },
      8: { halign: "center" }, 9: { halign: "center" },
      10: { halign: "center", fontStyle: "bold" },
      11: { halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        if (data.column.index === 11) {
          const band = String(data.cell.raw);
          data.cell.styles.textColor = band === "HIGH" ? C.high : band === "MEDIUM" ? C.med : C.low;
        }
        if (data.column.index === 10) data.cell.styles.textColor = bandColor(Number(data.cell.raw));
      }
    },
    didDrawPage: () => drawFooter(doc, pageW, pageH, M),
  });

  // ════════════════════════════════════════════════════════
  // PAGES 4+ — PER-SUPPLIER DETAIL CARDS (2 per page)
  // ════════════════════════════════════════════════════════
  const cardH = 318;
  const gap = 20;
  let isFirstOnPage = true;
  let cardY = 0;

  sorted.forEach((s, idx) => {
    if (idx % 2 === 0) {
      doc.addPage();
      const top = pageHeader(
        doc, pageW, M,
        idx === 0 ? "Supplier Risk Profiles" : "Supplier Risk Profiles (cont.)",
        "Per-supplier risk surface, dimension scores and 30-day trend",
      );
      cardY = top;
      isFirstOnPage = true;
      drawFooter(doc, pageW, pageH, M);
    }
    const yTop = isFirstOnPage ? cardY : cardY + cardH + gap;
    drawSupplierCard(doc, M, yTop, contentW, cardH, s, alerts);
    if (!isFirstOnPage) cardY = yTop;
    isFirstOnPage = !isFirstOnPage ? true : false;
  });

  doc.save(`riskscan-report-${generated.toISOString().slice(0, 10)}.pdf`);
}

// ════════════════════════════════════════════════════════════
// Per-supplier card
// ════════════════════════════════════════════════════════════
function drawSupplierCard(
  doc: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  s: Supplier, alerts: Alert[],
) {
  roundedCard(doc, x, y, w, h);
  const tone = bandColor(s.overall);

  // Accent stripe
  doc.setFillColor(...tone);
  doc.roundedRect(x, y, 4, h, 2, 2, "F");

  // ── Header row ──
  const hx = x + 18;
  // Score badge
  doc.setFillColor(...tint(tone, 0.86));
  doc.setDrawColor(...tone);
  doc.setLineWidth(1.2);
  doc.roundedRect(hx, y + 16, 46, 46, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...tone);
  doc.text(String(s.overall), hx + 23, y + 41, { align: "center" });
  doc.setFontSize(6);
  doc.text(bandLabel(s.overall), hx + 23, y + 53, { align: "center" });

  // Name + meta
  const tx = hx + 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.ink);
  doc.text(truncate(doc, s.name, w - 230), tx, y + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  doc.text(`${s.country} · ${s.region}  ·  ${s.category}  ·  Tier ${s.tier}`, tx, y + 47);
  const driver = `Primary driver: ${s.primaryDriver}`;
  doc.text(truncate(doc, driver, w - 240), tx, y + 60);

  // Active alert count (top-right)
  const sAlerts = alerts.filter((a) => a.supplierId === s.id && !a.acknowledged);
  if (sAlerts.length) {
    const label = `${sAlerts.length} ACTIVE ALERT${sAlerts.length === 1 ? "" : "S"}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const tw = doc.getTextWidth(label) + 16;
    doc.setFillColor(...tint(C.high, 0.85));
    doc.roundedRect(x + w - tw - 16, y + 18, tw, 18, 9, 9, "F");
    doc.setTextColor(...C.high);
    doc.text(label, x + w - tw / 2 - 16, y + 30, { align: "center" });
  }

  // Divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(x + 14, y + 74, x + w - 14, y + 74);

  // ── Left: radar ──
  const colY = y + 86;
  const leftW = w * 0.42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("RISK SURFACE · 5 DIMENSIONS", x + 18, colY);
  drawRadar(
    doc, x + 18 + leftW / 2 - 8, colY + 105, 62,
    DIMS.map((d) => ({ label: d.label, value: s.scores[d.key] })),
    tone,
  );

  // ── Right: dimension bars + timeline ──
  const rx = x + leftW + 18;
  const rw = w - leftW - 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("DIMENSION SCORES", rx, colY);
  let by = colY + 14;
  DIMS.forEach((d) => {
    const v = s.scores[d.key];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.ink);
    doc.text(d.label, rx, by + 7);
    const trackX = rx + 78;
    const trackW = rw - 78 - 22;
    doc.setFillColor(...C.porcelain);
    doc.roundedRect(trackX, by, trackW, 7, 3.5, 3.5, "F");
    doc.setFillColor(...bandColor(v));
    doc.roundedRect(trackX, by, Math.max(3, (v / 100) * trackW), 7, 3.5, 3.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...bandColor(v));
    doc.text(String(v), trackX + trackW + 6, by + 7);
    by += 17;
  });

  // Timeline area chart
  const tlY = by + 8;
  const tlH = y + h - tlY - 16;
  if (tlH > 30 && s.history?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    const delta = s.history[s.history.length - 1] - s.history[0];
    doc.text("30-DAY RISK TREND", rx, tlY);
    doc.setTextColor(...(delta > 0 ? C.high : C.low));
    doc.text(`${delta >= 0 ? "+" : ""}${delta} pts`, rx + rw - 22, tlY, { align: "right" });
    drawAreaChart(doc, rx, tlY + 8, rw - 22, tlH - 8, s.history, tone);
  }
}

// ════════════════════════════════════════════════════════════
// Drawing helpers
// ════════════════════════════════════════════════════════════
function pageHeader(
  doc: import("jspdf").jsPDF, pageW: number, M: number, title: string, subtitle: string,
): number {
  doc.setFillColor(...C.ink);
  doc.rect(0, 0, pageW, 64, "F");
  doc.setFillColor(...C.evergreen);
  doc.circle(M + 10, 32, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text("R", M + 10, 35, { align: "center" });
  doc.setFontSize(14);
  doc.text(title, M + 28, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(195, 208, 199);
  doc.text(subtitle, M + 28, 45);
  return 90;
}

function roundedCard(doc: import("jspdf").jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.white);
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, w, h, 8, 8, "FD");
}

function sectionLabel(doc: import("jspdf").jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text(text, x, y);
}

function truncate(doc: import("jspdf").jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 4 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1);
  return t + "…";
}

function drawGauge(
  doc: import("jspdf").jsPDF, cx: number, cy: number, r: number, value: number, onDark = false,
) {
  const steps = 64;
  doc.setLineWidth(13);
  doc.setDrawColor(...(onDark ? ([60, 90, 74] as RGB) : C.border));
  arc(doc, cx, cy, r, 180, 360, steps);
  const frac = Math.max(0, Math.min(100, value)) / 100;
  doc.setDrawColor(...bandColor(value));
  arc(doc, cx, cy, r, 180, 180 + 180 * frac, steps);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(...(onDark ? C.white : bandColor(value)));
  doc.text(String(value), cx, cy - 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...(onDark ? ([200, 212, 202] as RGB) : C.muted));
  doc.text(`${bandLabel(value)} RISK`, cx, cy + 16, { align: "center" });
}

function arc(
  doc: import("jspdf").jsPDF, cx: number, cy: number, r: number,
  startDeg: number, endDeg: number, steps: number,
) {
  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i++) {
    const a = (startDeg + (endDeg - startDeg) * (i / steps)) * (Math.PI / 180);
    const p: [number, number] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    if (prev) doc.line(prev[0], prev[1], p[0], p[1]);
    prev = p;
  }
}

function drawBars(
  doc: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  data: { label: string; value: number; color: RGB }[],
  maxValue: number, valueOnTop = false,
) {
  const n = data.length;
  const gap = n > 3 ? 10 : 16;
  const barW = (w - gap * (n - 1)) / n;
  const baseY = y + h - 16;
  const usableH = h - 24;
  const max = Math.max(maxValue, 1);

  data.forEach((d, i) => {
    const bx = x + i * (barW + gap);
    const bh = Math.max(2, (d.value / max) * usableH);
    doc.setFillColor(...C.porcelain);
    doc.roundedRect(bx, baseY - usableH, barW, usableH, 3, 3, "F");
    doc.setFillColor(...d.color);
    doc.roundedRect(bx, baseY - bh, barW, bh, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...d.color);
    doc.text(String(d.value), bx + barW / 2, valueOnTop ? baseY - bh - 5 : baseY - usableH - 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(d.label, bx + barW / 2, baseY + 11, { align: "center" });
  });
}

/** Pentagon radar chart with grid rings, axes, labels and a filled polygon. */
function drawRadar(
  doc: import("jspdf").jsPDF,
  cx: number, cy: number, r: number,
  data: { label: string; value: number }[],
  color: RGB,
) {
  const n = data.length;
  const angleAt = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pointAt = (i: number, radius: number): [number, number] => [
    cx + radius * Math.cos(angleAt(i)),
    cy + radius * Math.sin(angleAt(i)),
  ];

  // Grid rings (4 levels)
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  [0.25, 0.5, 0.75, 1].forEach((lvl) => {
    const pts = data.map((_, i) => pointAt(i, r * lvl));
    polyline(doc, pts, true);
  });
  // Axes
  data.forEach((_, i) => {
    const p = pointAt(i, r);
    doc.line(cx, cy, p[0], p[1]);
  });

  // Value polygon (soft fill + stroke)
  const valPts = data.map((d, i) => pointAt(i, r * (Math.max(0, Math.min(100, d.value)) / 100)));
  doc.setFillColor(...tint(color, 0.72));
  fillPolygon(doc, valPts);
  doc.setDrawColor(...color);
  doc.setLineWidth(1.5);
  polyline(doc, valPts, true);
  // Vertex dots
  doc.setFillColor(...color);
  valPts.forEach((p) => doc.circle(p[0], p[1], 1.6, "F"));

  // Labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  data.forEach((d, i) => {
    const p = pointAt(i, r + 14);
    const a = angleAt(i);
    const align = Math.abs(Math.cos(a)) < 0.3 ? "center" : Math.cos(a) > 0 ? "left" : "right";
    doc.text(d.label, p[0], p[1] + 3, { align: align as "center" | "left" | "right" });
  });
}

/** Filled area/line chart for the 30-day trend. */
function drawAreaChart(
  doc: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  values: number[], color: RGB,
) {
  if (values.length < 2) return;
  const max = 100;
  const baseY = y + h;
  const stepX = w / (values.length - 1);
  const pts: [number, number][] = values.map((v, i) => [
    x + i * stepX,
    baseY - (Math.max(0, Math.min(max, v)) / max) * h,
  ]);

  // Baseline + frame
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(x, baseY, x + w, baseY);

  // Soft fill under the line (triangle fan to baseline)
  doc.setFillColor(...tint(color, 0.8));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    fillPolygon(doc, [
      [a[0], baseY], [a[0], a[1]], [b[0], b[1]], [b[0], baseY],
    ]);
  }
  // Line
  doc.setDrawColor(...color);
  doc.setLineWidth(1.5);
  polyline(doc, pts, false);
}

// ── Polygon primitives via jsPDF lines() ──
function polyline(doc: import("jspdf").jsPDF, pts: [number, number][], closed: boolean) {
  if (pts.length < 2) return;
  const deltas: number[][] = [];
  for (let i = 1; i < pts.length; i++) {
    deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  }
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "S", closed);
}

function fillPolygon(doc: import("jspdf").jsPDF, pts: [number, number][]) {
  if (pts.length < 3) return;
  const deltas: number[][] = [];
  for (let i = 1; i < pts.length; i++) {
    deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  }
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "F", true);
}

function drawFooter(doc: import("jspdf").jsPDF, pageW: number, pageH: number, M: number) {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(M, pageH - 32, pageW - M, pageH - 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("SCMDOJO RiskScan — confidential supplier risk assessment", M, pageH - 18);
  doc.text(`Page ${doc.getNumberOfPages()}`, pageW - M, pageH - 18, { align: "right" });
}
