import type { Alert, Portfolio, Supplier } from "@/data/suppliers";
import { riskLevel } from "@/data/suppliers";

/**
 * Generates a polished, multi-section vector PDF of the supplier risk
 * portfolio — gauge, distribution chart, per-dimension averages, the full
 * supplier register, and top alerts. Drawn with jsPDF primitives (no DOM
 * rasterization) so text stays crisp/selectable and the app's oklch theme
 * colors don't need to round-trip through a canvas.
 */

// ── Brand palette (RGB, mirrors the "Porcelain & Evergreen Ink" theme) ──
const C = {
  ink: [31, 51, 43] as RGB,
  evergreen: [38, 77, 58] as RGB,
  porcelain: [247, 246, 242] as RGB,
  white: [255, 255, 255] as RGB,
  border: [225, 223, 216] as RGB,
  muted: [108, 112, 104] as RGB,
  low: [76, 134, 99] as RGB,
  med: [184, 140, 58] as RGB,
  high: [168, 70, 60] as RGB,
};

type RGB = [number, number, number];

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
  const lvl = riskLevel(score);
  return lvl === "high" ? "HIGH" : lvl === "medium" ? "MEDIUM" : "LOW";
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
  const M = 40; // margin
  const contentW = pageW - M * 2;

  // Derived metrics
  const total = suppliers.length || 1;
  const portfolioRisk =
    portfolio?.portfolioRisk ??
    Math.round(suppliers.reduce((s, x) => s + x.overall, 0) / total);
  const buckets = { low: 0, medium: 0, high: 0 };
  suppliers.forEach((s) => buckets[riskLevel(s.overall)]++);
  const dimAvgs = DIMS.map((d) => ({
    label: d.label,
    value: Math.round(
      suppliers.reduce((s, x) => s + (x.scores[d.key] ?? 0), 0) / total,
    ),
  }));
  const unack = alerts.filter((a) => !a.acknowledged);
  const criticalCount = portfolio?.criticalCount ??
    unack.filter((a) => a.severity === "high").length;
  const generated = new Date();

  // ── Header band ──────────────────────────────────────────
  doc.setFillColor(...C.ink);
  doc.rect(0, 0, pageW, 92, "F");
  doc.setFillColor(...C.evergreen);
  doc.circle(M + 12, 46, 13, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("R", M + 12, 49, { align: "center" });

  doc.setFontSize(17);
  doc.text("RiskScan — Supplier Risk Portfolio Report", M + 36, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(206, 214, 206);
  doc.text("SCMDOJO · Supply Intelligence · Autonomous monitoring across 5 risk dimensions", M + 36, 60);
  doc.text(
    `Generated ${generated.toLocaleDateString()} ${generated.toLocaleTimeString()}`,
    pageW - M, 42, { align: "right" },
  );

  let y = 122;

  // ── Executive summary KPI strip ──────────────────────────
  doc.setTextColor(...C.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Executive Summary", M, y - 8);

  const kpis = [
    { label: "Portfolio Risk Index", value: String(portfolioRisk), tone: bandColor(portfolioRisk) },
    { label: "Monitored Entities", value: String(suppliers.length), tone: C.ink },
    { label: "Critical Alerts", value: String(criticalCount), tone: C.high },
    { label: "Risk Scans Run", value: String(portfolio?.scansCompleted ?? 0), tone: C.evergreen },
  ];
  const cardW = (contentW - 3 * 12) / 4;
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + 12);
    roundedCard(doc, x, y, cardW, 64);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(k.label.toUpperCase(), x + 12, y + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...k.tone);
    doc.text(k.value, x + 12, y + 46);
  });
  y += 64 + 26;

  // ── Charts row: gauge + distribution ─────────────────────
  const chartH = 150;
  const gaugeW = contentW * 0.38;
  const distW = contentW - gaugeW - 16;

  // Gauge card
  roundedCard(doc, M, y, gaugeW, chartH);
  sectionLabel(doc, "PORTFOLIO RISK INDEX", M + 14, y + 20);
  drawGauge(doc, M + gaugeW / 2, y + chartH - 28, 52, portfolioRisk);

  // Distribution card
  const dx = M + gaugeW + 16;
  roundedCard(doc, dx, y, distW, chartH);
  sectionLabel(doc, "RISK DISTRIBUTION", dx + 14, y + 20);
  drawBars(
    doc,
    dx + 14,
    y + 36,
    distW - 28,
    chartH - 58,
    [
      { label: "Low", value: buckets.low, color: C.low },
      { label: "Medium", value: buckets.medium, color: C.med },
      { label: "High", value: buckets.high, color: C.high },
    ],
    suppliers.length,
  );
  y += chartH + 22;

  // ── Average risk by dimension ────────────────────────────
  const dimH = 150;
  roundedCard(doc, M, y, contentW, dimH);
  sectionLabel(doc, "AVERAGE RISK BY DIMENSION", M + 14, y + 20);
  drawBars(
    doc,
    M + 14,
    y + 36,
    contentW - 28,
    dimH - 58,
    dimAvgs.map((d) => ({ label: d.label, value: d.value, color: bandColor(d.value) })),
    100,
    true,
  );
  y += dimH + 8;

  // ── Supplier register table ──────────────────────────────
  const sorted = [...suppliers].sort((a, b) => b.overall - a.overall);
  autoTable(doc, {
    startY: y + 14,
    margin: { left: M, right: M },
    head: [[
      "Supplier", "Country", "Cat.", "Tier",
      "Fin", "Ops", "Comp", "Geo", "ESG", "Overall", "Band",
    ]],
    body: sorted.map((s) => [
      s.name,
      s.country,
      s.category,
      `T${s.tier}`,
      s.scores.financial,
      s.scores.operational,
      s.scores.compliance,
      s.scores.geopolitical,
      s.scores.esg,
      s.overall,
      bandLabel(s.overall),
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: C.ink, lineColor: C.border, lineWidth: 0.5 },
    headStyles: { fillColor: C.evergreen, textColor: C.white, fontSize: 8, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { cellWidth: 108, fontStyle: "bold" },
      3: { halign: "center" },
      4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center" },
      7: { halign: "center" }, 8: { halign: "center" },
      9: { halign: "center", fontStyle: "bold" },
      10: { halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        if (data.column.index === 10) {
          const band = String(data.cell.raw);
          data.cell.styles.textColor = band === "HIGH" ? C.high : band === "MEDIUM" ? C.med : C.low;
        }
        if (data.column.index === 9) {
          const v = Number(data.cell.raw);
          data.cell.styles.textColor = bandColor(v);
        }
      }
    },
    didDrawPage: () => drawFooter(doc, pageW, pageH, M),
  });

  // ── Top alerts section (new page if needed) ──────────────
  const topAlerts = [...alerts]
    .sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0))
    .slice(0, 6);
  if (topAlerts.length) {
    // @ts-expect-error lastAutoTable is augmented at runtime by the plugin
    const afterTable: number = doc.lastAutoTable?.finalY ?? y;
    let ay = afterTable + 28;
    if (ay > pageH - 160) {
      doc.addPage();
      drawFooter(doc, pageW, pageH, M);
      ay = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C.ink);
    doc.text("Active Alerts (most severe)", M, ay);
    ay += 12;

    topAlerts.forEach((a) => {
      const boxH = 46;
      if (ay + boxH > pageH - 50) {
        doc.addPage();
        drawFooter(doc, pageW, pageH, M);
        ay = 60;
      }
      const tone = a.severity === "high" ? C.high : a.severity === "medium" ? C.med : C.low;
      roundedCard(doc, M, ay, contentW, boxH);
      doc.setFillColor(...tone);
      doc.roundedRect(M, ay, 4, boxH, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      doc.text(`${a.title}`, M + 14, ay + 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...tone);
      doc.text(`${a.severity.toUpperCase()} · ${a.category.toUpperCase()} · ${a.supplierName}`, M + 14, ay + 30);
      doc.setTextColor(...C.muted);
      const breach = doc.splitTextToSize(a.breach, contentW - 28);
      doc.text(breach.slice(0, 1), M + 14, ay + 41);
      ay += boxH + 8;
    });
  }

  doc.save(`riskscan-report-${generated.toISOString().slice(0, 10)}.pdf`);
}

// ── Drawing helpers ────────────────────────────────────────
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

function drawGauge(doc: import("jspdf").jsPDF, cx: number, cy: number, r: number, value: number) {
  const steps = 60;
  const lineW = 11;
  // Track
  doc.setLineWidth(lineW);
  doc.setDrawColor(...C.border);
  arc(doc, cx, cy, r, 180, 360, steps);
  // Value arc
  const frac = Math.max(0, Math.min(100, value)) / 100;
  doc.setDrawColor(...bandColor(value));
  arc(doc, cx, cy, r, 180, 180 + 180 * frac, steps);
  // Value text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...bandColor(value));
  doc.text(String(value), cx, cy - 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text(`${bandLabel(value)} RISK`, cx, cy + 12, { align: "center" });
}

function arc(
  doc: import("jspdf").jsPDF,
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number, steps: number,
) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (startDeg + (endDeg - startDeg) * (i / steps)) * (Math.PI / 180);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
}

function drawBars(
  doc: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  data: { label: string; value: number; color: RGB }[],
  maxValue: number,
  showValueOnTop = false,
) {
  const n = data.length;
  const gap = 16;
  const barW = (w - gap * (n - 1)) / n;
  const baseY = y + h - 16;
  const usableH = h - 24;
  const max = Math.max(maxValue, 1);

  data.forEach((d, i) => {
    const bx = x + i * (barW + gap);
    const bh = Math.max(2, (d.value / max) * usableH);
    // Track
    doc.setFillColor(...C.porcelain);
    doc.roundedRect(bx, baseY - usableH, barW, usableH, 3, 3, "F");
    // Bar
    doc.setFillColor(...d.color);
    doc.roundedRect(bx, baseY - bh, barW, bh, 3, 3, "F");
    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...d.color);
    doc.text(
      String(d.value),
      bx + barW / 2,
      showValueOnTop ? baseY - bh - 5 : baseY - usableH - 5,
      { align: "center" },
    );
    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(d.label, bx + barW / 2, baseY + 11, { align: "center" });
  });
}

function drawFooter(doc: import("jspdf").jsPDF, pageW: number, pageH: number, M: number) {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(M, pageH - 32, pageW - M, pageH - 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("SCMDOJO RiskScan — confidential supplier risk assessment", M, pageH - 18);
  const page = doc.getNumberOfPages();
  doc.text(`Page ${page}`, pageW - M, pageH - 18, { align: "right" });
}
