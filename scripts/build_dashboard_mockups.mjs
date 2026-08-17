import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const require = createRequire(import.meta.url);
const sharp = require(runtimeModules ? path.join(runtimeModules, "sharp") : "sharp");

const projectRoot = path.resolve(process.argv[2] ?? ".");
const dataDir = path.join(projectRoot, "dashboard", "data");
const outputDir = path.join(projectRoot, "dashboard", "mockups");
await fs.mkdir(outputDir, { recursive: true });

const c = {
  bg: "#F5F7FA",
  card: "#FFFFFF",
  navy: "#132238",
  blue: "#1F4E78",
  cyan: "#20A4F3",
  teal: "#2CB67D",
  amber: "#F4B942",
  red: "#D64550",
  purple: "#7A6FF0",
  ink: "#17212B",
  muted: "#667587",
  line: "#D7DEE7",
  paleBlue: "#E8F3FB",
  paleGreen: "#E8F6EF",
  paleAmber: "#FFF5D6",
  paleRed: "#FBEAEC",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (row.length || value) {
    row.push(value);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.some((x) => x !== "")).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))
  );
}

async function load(name) {
  return parseCsv(await fs.readFile(path.join(dataDir, name), "utf8"));
}

const [loans, sector, rating, metrics, deciles, importance, thresholds, stress, vintage, ratings, highRisk] = await Promise.all([
  load("loans_scored.csv"),
  load("sector_risk.csv"),
  load("rating_risk.csv"),
  load("model_metrics.csv"),
  load("risk_decile_lift.csv"),
  load("feature_importance.csv"),
  load("selected_model_test_thresholds.csv"),
  load("stress_scenarios.csv"),
  load("vintage_analysis.csv"),
  load("credit_ratings.csv"),
  load("high_risk_test_loans.csv"),
]);

const n = (x) => Number(x);
const fmtPct = (x, d = 1) => `${(n(x) * 100).toFixed(d)}%`;
const fmtNum = (x, d = 0) => n(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney = (x) => {
  const v = n(x);
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(v >= 1e11 ? 1 : 2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${fmtNum(v)}`;
};
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function text(x, y, value, size = 14, fill = c.ink, weight = 400, anchor = "start") {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
}

function multiText(x, y, value, widthChars, size = 14, fill = c.ink, weight = 400, lineHeight = 20) {
  return wrapText(value, widthChars).map((line, i) => text(x, y + i * lineHeight, line, size, fill, weight)).join("");
}

function rect(x, y, w, h, fill, radius = 10, stroke = "none") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

function base(pageTitle, pageNumber, pageSubtitle) {
  const nav = ["Overview", "Model", "Decision", "Resilience"];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
  <style>text{font-family:'Segoe UI',Arial,sans-serif} .shadow{filter:drop-shadow(0 3px 8px rgba(19,34,56,.08))}</style>
  <rect width="1440" height="900" fill="${c.bg}"/>
  <rect width="96" height="900" fill="${c.navy}"/>`;
  svg += text(48, 48, "CR", 22, "#FFFFFF", 700, "middle");
  nav.forEach((label, i) => {
    const y = 146 + i * 104;
    if (i + 1 === pageNumber) svg += rect(14, y - 34, 68, 72, c.blue, 12);
    svg += `<circle cx="48" cy="${y - 10}" r="11" fill="${i + 1 === pageNumber ? c.cyan : "#5A6A80"}"/>`;
    svg += text(48, y + 22, label, 10, "#FFFFFF", i + 1 === pageNumber ? 700 : 400, "middle");
  });
  svg += text(48, 850, "v1.0", 10, "#91A0B3", 400, "middle");
  svg += text(124, 46, pageTitle, 27, c.ink, 700);
  svg += text(124, 70, pageSubtitle, 12, c.muted, 400);
  svg += rect(1110, 28, 306, 34, c.paleBlue, 17);
  svg += text(1263, 50, "REFERENCE MOCKUP · BUILD IN POWER BI", 10, c.blue, 700, "middle");
  return svg;
}

function card(x, y, w, h, label, value, sub = "", accent = c.blue) {
  let out = `<g class="shadow">${rect(x, y, w, h, c.card, 12, c.line)}</g>`;
  out += `<rect x="${x}" y="${y}" width="5" height="${h}" rx="2.5" fill="${accent}"/>`;
  out += text(x + 20, y + 28, label.toUpperCase(), 10, c.muted, 700);
  out += text(x + 20, y + 66, value, value.length > 20 ? 20 : 27, c.ink, 700);
  if (sub) out += text(x + 20, y + h - 16, sub, 10, c.muted, 400);
  return out;
}

function panel(x, y, w, h, titleValue, subtitle = "") {
  let out = `<g class="shadow">${rect(x, y, w, h, c.card, 12, c.line)}</g>`;
  out += text(x + 18, y + 28, titleValue, 15, c.ink, 700);
  if (subtitle) out += text(x + 18, y + 47, subtitle, 10, c.muted, 400);
  return out;
}

function horizontalBars(items, x, y, w, h, valueFn, labelFn, colorFn, formatter, maxValue = null) {
  const max = maxValue ?? Math.max(...items.map(valueFn));
  const rowH = h / items.length;
  let out = "";
  items.forEach((item, i) => {
    const value = valueFn(item);
    const yy = y + i * rowH;
    const bw = Math.max(2, (value / max) * (w - 150));
    out += text(x, yy + rowH * 0.68, labelFn(item), 11, c.ink, 500);
    out += rect(x + 112, yy + rowH * 0.24, w - 150, rowH * 0.48, "#EDF1F5", 5);
    out += rect(x + 112, yy + rowH * 0.24, bw, rowH * 0.48, colorFn(item, i), 5);
    out += text(x + w - 4, yy + rowH * 0.68, formatter(value), 11, c.ink, 700, "end");
  });
  return out;
}

function verticalBars(items, x, y, w, h, valueFn, labelFn, colorFn, formatter, maxValue = null) {
  const max = maxValue ?? Math.max(...items.map(valueFn));
  const gap = 10;
  const barW = (w - gap * (items.length - 1)) / items.length;
  let out = `<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="${c.line}"/>`;
  items.forEach((item, i) => {
    const value = valueFn(item);
    const bh = Math.max(2, (value / max) * (h - 34));
    const xx = x + i * (barW + gap);
    const yy = y + h - bh;
    out += rect(xx, yy, barW, bh, colorFn(item, i), 5);
    out += text(xx + barW / 2, y + h + 18, labelFn(item), 10, c.muted, 500, "middle");
    if (items.length <= 10) out += text(xx + barW / 2, yy - 7, formatter(value), 10, c.ink, 700, "middle");
  });
  return out;
}

function linePath(items, x, y, w, h, valueFn, minValue = 0, maxValue = null) {
  const max = maxValue ?? Math.max(...items.map(valueFn));
  return items.map((item, i) => {
    const xx = x + (i / Math.max(1, items.length - 1)) * w;
    const yy = y + h - ((valueFn(item) - minValue) / Math.max(1e-9, max - minValue)) * h;
    return `${i === 0 ? "M" : "L"}${xx.toFixed(1)},${yy.toFixed(1)}`;
  }).join(" ");
}

function closeSvg(svg) {
  return `${svg}</svg>`;
}

async function save(name, svg) {
  const svgPath = path.join(outputDir, `${name}.svg`);
  const pngPath = path.join(outputDir, `${name}.png`);
  await fs.writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  return pngPath;
}

const loanCount = loans.length;
const totalEad = loans.reduce((a, r) => a + n(r.ead), 0);
const defaults = loans.reduce((a, r) => a + n(r.defaulted), 0);
const existingEl = loans.reduce((a, r) => a + n(r.el), 0);
const avgScore = loans.reduce((a, r) => a + n(r.credit_score), 0) / loanCount;
const byYearMap = new Map();
for (const row of loans) {
  const year = row.origination_year;
  const v = byYearMap.get(year) ?? { year, loans: 0, defaults: 0 };
  v.loans += 1;
  v.defaults += n(row.defaulted);
  byYearMap.set(year, v);
}
const byYear = [...byYearMap.values()].sort((a, b) => n(a.year) - n(b.year)).map((r) => ({ ...r, rate: r.defaults / r.loans }));

// Page 1
let p1 = base("Executive Portfolio Overview", 1, "Portfolio concentration, observed outcomes, and cohort drift · 50,000 supplied loans");
const kpiY = 102;
const kpiW = 242;
const gap = 16;
[
  ["Loan Count", fmtNum(loanCount), "One row per originated loan", c.blue],
  ["Total EAD", fmtMoney(totalEad), "Dataset monetary units", c.cyan],
  ["Observed Default Rate", fmtPct(defaults / loanCount), `${fmtNum(defaults)} eventual defaults`, c.red],
  ["Existing Expected Loss", fmtMoney(existingEl), "Dataset annual risk benchmark", c.amber],
  ["Average Credit Score", fmtNum(avgScore), "Observed range 518–850", c.teal],
].forEach((k, i) => { p1 += card(124 + i * (kpiW + gap), kpiY, kpiW, 108, ...k); });
p1 += panel(124, 230, 620, 300, "Origination Cohort Default Rate", "Material drift requires time-based model validation");
p1 += `<line x1="154" y1="482" x2="714" y2="482" stroke="${c.line}"/>`;
p1 += `<path d="${linePath(byYear, 160, 295, 540, 170, (r) => r.rate, 0.05, 0.23)}" fill="none" stroke="${c.blue}" stroke-width="4"/>`;
byYear.forEach((r, i) => {
  const x = 160 + (i / (byYear.length - 1)) * 540;
  const y = 295 + 170 - ((r.rate - 0.05) / 0.18) * 170;
  p1 += `<circle cx="${x}" cy="${y}" r="4.5" fill="${c.cyan}" stroke="white" stroke-width="2"/>`;
  p1 += text(x, 502, r.year, 9, c.muted, 500, "middle");
});
p1 += text(160, 282, "23%", 9, c.muted, 400);
p1 += text(160, 474, "5%", 9, c.muted, 400);

p1 += panel(760, 230, 656, 300, "Sector Risk & Exposure", "Bars: observed eventual-default rate · labels: EAD");
p1 += horizontalBars(sector.slice(0, 10), 786, 286, 602, 216,
  (r) => n(r.observed_default_rate), (r) => r.sector.replaceAll("_", " "),
  (_r, i) => i < 3 ? c.red : i < 6 ? c.amber : c.blue, (v) => fmtPct(v), 0.16);
sector.slice(0, 5).forEach((r, i) => { p1 += text(1112, 301 + i * 21.6, fmtMoney(r.total_ead), 9, c.muted, 400); });

p1 += panel(124, 548, 800, 326, "Rating Risk Ladder", "Observed default rates rise sharply for speculative-grade ratings");
p1 += verticalBars(rating, 165, 626, 710, 192, (r) => n(r.observed_default_rate), (r) => r.initial_rating,
  (_r, i) => [c.teal, c.teal, c.cyan, c.blue, c.amber, "#E37A3E", c.red][i], (v) => fmtPct(v), 0.55);
p1 += panel(940, 548, 476, 326, "Executive Findings", "Interpret with exposure, capacity, and model limitations");
[
  [c.red, "Financials", "14.75% default rate and $30.17B EAD — highest risk/materiality overlap."],
  [c.amber, "CCC rating", "50.87% eventual-default rate; require deeper review, not automatic rejection."],
  [c.blue, "Cohort drift", "2019 peaks at 21.54%; 2023 is 7.54%. Do not interpret the change causally."],
  [c.teal, "Next action", "Monitor limits by sector/rating and track threshold performance by cohort."],
].forEach((item, i) => {
  const y = 622 + i * 62;
  p1 += `<circle cx="970" cy="${y}" r="8" fill="${item[0]}"/>`;
  p1 += text(990, y - 5, item[1], 12, c.ink, 700);
  p1 += multiText(990, y + 14, item[2], 54, 11, c.muted, 400, 15);
});
p1 = closeSvg(p1);

// Page 2
const selectedOperating = metrics.find((r) => r.model_name === "Calibrated Random Forest" && r.split === "test" && r.threshold_type === "operating_recall_constraint");
const selectedStandard = metrics.find((r) => r.model_name === "Calibrated Random Forest" && r.split === "test" && r.threshold_type === "standard_0.50");
const logisticTest = metrics.find((r) => r.model_name === "Logistic Regression" && r.split === "test");
let p2 = base("Model Performance & Risk Segmentation", 2, "Out-of-time holdout: 2022–2023 · 11,077 loans · 7.81% observed default rate");
[
  ["Selected Model", "Calibrated Random Forest", "Chosen by validation PR-AUC", c.blue, 300],
  ["Test ROC-AUC", n(selectedOperating.roc_auc).toFixed(3), "Ranking quality", c.cyan, 220],
  ["Test PR-AUC", n(selectedOperating.pr_auc).toFixed(3), "5.44× test prevalence", c.teal, 220],
  ["Brier Score", n(selectedOperating.brier_score).toFixed(3), "Lower is better", c.amber, 220],
  ["Test Default Rate", "7.8%", "Temporal prevalence shift", c.red, 220],
].reduce((x, item) => {
  p2 += card(x, 102, item[4], 108, item[0], item[1], item[2], item[3]);
  return x + item[4] + 16;
}, 124);

p2 += panel(124, 230, 620, 300, "Risk Decile Lift", "Decile 1 is the highest model score");
p2 += verticalBars(deciles, 160, 300, 548, 170, (r) => n(r.default_rate), (r) => r.risk_decile,
  (_r, i) => i === 0 ? c.red : i === 1 ? c.amber : c.blue, (v) => fmtPct(v), 0.50);
p2 += text(160, 505, "Top decile: 44.1% default rate · 5.64× test average", 11, c.red, 700);

p2 += panel(760, 230, 320, 300, "Model Comparison", "Test PR-AUC");
const comp = [
  { model: "Logistic", value: n(logisticTest.pr_auc), color: c.cyan },
  { model: "Calibrated RF", value: n(selectedOperating.pr_auc), color: c.blue },
];
p2 += horizontalBars(comp, 786, 310, 270, 90, (r) => r.value, (r) => r.model, (r) => r.color, (v) => v.toFixed(3), 0.50);
p2 += rect(786, 425, 266, 72, c.paleAmber, 8);
p2 += text(801, 449, "XGBoost", 12, c.ink, 700);
p2 += multiText(801, 468, "Packaged in pipeline; not executed in this validation environment.", 38, 10, c.muted, 400, 14);

p2 += panel(1096, 230, 320, 300, "Confusion Matrix @ 0.17", "Rows: actual · Columns: decision");
const cm = [
  ["True Negative", n(selectedOperating.true_negative), c.paleGreen, c.teal],
  ["False Positive", n(selectedOperating.false_positive), c.paleAmber, c.amber],
  ["False Negative", n(selectedOperating.false_negative), c.paleRed, c.red],
  ["True Positive", n(selectedOperating.true_positive), c.paleBlue, c.blue],
];
cm.forEach((item, i) => {
  const xx = 1118 + (i % 2) * 137;
  const yy = 300 + Math.floor(i / 2) * 92;
  p2 += rect(xx, yy, 125, 78, item[2], 8);
  p2 += text(xx + 62.5, yy + 30, item[0], 10, c.muted, 600, "middle");
  p2 += text(xx + 62.5, yy + 59, fmtNum(item[1]), 23, item[3], 700, "middle");
});

p2 += panel(124, 548, 620, 326, "Permutation Feature Importance", "Impact on test PR-AUC when each feature is shuffled");
const topImportance = importance.slice(0, 9);
p2 += horizontalBars(topImportance, 154, 612, 560, 220, (r) => n(r.importance_mean), (r) => r.feature.replaceAll("_", " "),
  (_r, i) => i === 0 ? c.red : i === 1 ? c.amber : c.blue, (v) => v.toFixed(3));

p2 += panel(760, 548, 656, 326, "Operating Interpretation", "High recall is useful only when review capacity is available");
[
  ["87.5%", "Recall", "757 of 865 test defaults are routed to review.", c.teal],
  ["19.8%", "Precision", "Most review flags are false positives; do not auto-reject.", c.amber],
  ["34.5%", "Review rate", "3,819 test applications require analyst capacity.", c.blue],
  ["0 positives", "At 0.50", "Calibrated scores max at 0.489; a fixed 0.50 cutoff is unsuitable.", c.red],
].forEach((item, i) => {
  const x = 788 + (i % 2) * 300;
  const y = 620 + Math.floor(i / 2) * 112;
  p2 += rect(x, y, 278, 94, i === 3 ? c.paleRed : "#F8FAFC", 9, c.line);
  p2 += text(x + 16, y + 32, item[0], 23, item[3], 700);
  p2 += text(x + (item[0].length > 7 ? 170 : 112), y + 29, item[1], 11, c.ink, 700);
  p2 += multiText(x + 16, y + 58, item[2], 42, 10, c.muted, 400, 14);
});
p2 = closeSvg(p2);

// Page 3
const selectedThreshold = thresholds.find((r) => n(r.threshold) === 0.17);
let p3 = base("Underwriting Decision Simulator", 3, "Interactive what-if analysis · parameters affect review decisions, not historical outcomes");
p3 += panel(124, 102, 1292, 104, "Decision Controls", "Blue values are user-controlled assumptions");
p3 += text(152, 160, "Decision Threshold", 12, c.ink, 700);
p3 += `<line x1="285" y1="155" x2="690" y2="155" stroke="${c.line}" stroke-width="8" stroke-linecap="round"/>`;
p3 += `<line x1="285" y1="155" x2="430" y2="155" stroke="${c.cyan}" stroke-width="8" stroke-linecap="round"/>`;
p3 += `<circle cx="430" cy="155" r="11" fill="${c.blue}" stroke="white" stroke-width="3"/>`;
p3 += text(714, 162, "0.17", 25, c.blue, 700);
p3 += text(830, 160, "Opportunity Cost Rate", 12, c.ink, 700);
p3 += rect(1000, 130, 130, 48, c.paleAmber, 8, c.amber);
p3 += text(1065, 162, "2.0%", 23, c.blue, 700, "middle");
p3 += multiText(1160, 146, "Illustrative assumption — not measured realized cost", 34, 10, c.muted, 400, 15);

const decisionCards = [
  ["Precision", fmtPct(selectedThreshold.precision), "Flag quality", c.amber],
  ["Recall", fmtPct(selectedThreshold.recall), "Default capture", c.teal],
  ["Approval Rate", fmtPct(selectedThreshold.approval_rate), "7,258 test loans", c.blue],
  ["Manual Review", fmtPct(1 - n(selectedThreshold.approval_rate)), "3,819 test loans", c.cyan],
  ["F1 Score", fmtPct(selectedThreshold.f1), "Balance metric", c.purple],
];
decisionCards.forEach((k, i) => { p3 += card(124 + i * (242 + 16), 224, 242, 100, ...k); });

p3 += panel(124, 344, 760, 300, "Threshold Trade-off", "Precision rises as review volume and recall fall");
const shownThresholds = thresholds.filter((r) => n(r.threshold) <= 0.50);
const chartX = 164, chartY = 414, chartW = 680, chartH = 165;
for (const [field, color] of [["precision", c.blue], ["recall", c.red], ["approval_rate", c.teal]]) {
  p3 += `<path d="${linePath(shownThresholds, chartX, chartY, chartW, chartH, (r) => n(r[field]), 0, 1)}" fill="none" stroke="${color}" stroke-width="3"/>`;
}
const selectedX = chartX + ((0.17 - 0.01) / (0.50 - 0.01)) * chartW;
p3 += `<line x1="${selectedX}" y1="${chartY}" x2="${selectedX}" y2="${chartY + chartH}" stroke="${c.amber}" stroke-width="2" stroke-dasharray="5 5"/>`;
p3 += text(selectedX, chartY - 10, "0.17", 10, c.amber, 700, "middle");
p3 += text(chartX, chartY + chartH + 22, "0.01", 9, c.muted, 400);
p3 += text(chartX + chartW, chartY + chartH + 22, "0.50", 9, c.muted, 400, "end");
[[c.blue, "Precision"], [c.red, "Recall"], [c.teal, "Approval"]].forEach((it, i) => {
  p3 += rect(470 + i * 105, 615, 12, 4, it[0], 2);
  p3 += text(488 + i * 105, 621, it[1], 10, c.muted, 600);
});

p3 += panel(900, 344, 516, 300, "Decision Cost Proxy", "Uses EAD × LGD for missed defaults plus a 2% opportunity-cost assumption");
const costItems = [
  ["Missed default loss exposure", fmtMoney(selectedThreshold.default_loss_exposure), c.red],
  ["Rejected-good EAD", fmtMoney(selectedThreshold.rejected_good_ead), c.amber],
  ["Dynamic cost proxy", fmtMoney(n(selectedThreshold.default_loss_exposure) + n(selectedThreshold.rejected_good_ead) * 0.02), c.blue],
];
costItems.forEach((it, i) => {
  const y = 430 + i * 59;
  p3 += text(930, y, it[0], 12, c.muted, 500);
  p3 += text(1380, y, it[1], 23, it[2], 700, "end");
  if (i < 2) p3 += `<line x1="930" y1="${y + 17}" x2="1380" y2="${y + 17}" stroke="${c.line}"/>`;
});
p3 += rect(930, 574, 450, 46, c.paleAmber, 8);
p3 += multiText(944, 594, "Scenario aid only. Validate realized costs and review capacity before policy adoption.", 70, 10, c.ink, 600, 14);

p3 += panel(124, 664, 1292, 210, "Manual Review Queue", "Sorted by term-risk loss proxy · top five shown");
const headers = ["Loan ID", "Sector", "Rating", "Score", "EAD", "Loss Proxy", "Action"];
const colX = [146, 278, 480, 585, 700, 865, 1065];
headers.forEach((h, i) => { p3 += text(colX[i], 720, h.toUpperCase(), 10, c.muted, 700); });
highRisk.slice(0, 5).forEach((r, ri) => {
  const y = 748 + ri * 24;
  if (ri % 2 === 0) p3 += rect(140, y - 17, 1238, 23, "#F8FAFC", 3);
  const vals = [r.loan_id, r.sector.replaceAll("_", " "), r.initial_rating, fmtPct(r.default_probability), fmtMoney(r.ead), fmtMoney(r.term_risk_loss_proxy), "MANUAL REVIEW"];
  vals.forEach((v, i) => { p3 += text(colX[i], y, v, 11, i === 6 ? c.red : c.ink, i === 6 ? 700 : 500); });
});
p3 = closeSvg(p3);

// Page 4
const stressAgg = new Map();
for (const r of stress) {
  const v = stressAgg.get(r.scenario) ?? { scenario: r.scenario, base: 0, stressed: 0, incremental: 0 };
  v.base += n(r.expected_loss_base);
  v.stressed += n(r.expected_loss_stress);
  v.incremental += n(r.incremental_expected_loss);
  stressAgg.set(r.scenario, v);
}
const severe = stressAgg.get("severe");
const covid = stressAgg.get("covid_like");
const severeSector = stress.filter((r) => r.scenario === "severe").sort((a, b) => n(b.incremental_expected_loss) - n(a.incremental_expected_loss));
const vintageNames = ["2017Q3", "2019Q4", "2021Q4", "2023Q4"];
const vintageSeries = vintageNames.map((name) => ({ name, rows: vintage.filter((r) => r.vintage === name).sort((a, b) => n(a.months_on_books) - n(b.months_on_books)) }));
const migrationMap = new Map();
for (const r of ratings) {
  const v = migrationMap.get(r.year) ?? { year: r.year, obs: 0, down: 0 };
  v.obs += 1;
  v.down += n(r.downgraded);
  migrationMap.set(r.year, v);
}
const migration = [...migrationMap.values()].sort((a, b) => n(a.year) - n(b.year)).map((r) => ({ ...r, rate: r.down / r.obs }));

let p4 = base("Portfolio Resilience", 4, "Stress scenarios, vintage curves, and rating migration · descriptive monitoring only");
[
  ["Selected Scenario", "Severe", "GDP −6pp · unemployment +5.5pp", c.red],
  ["Stressed Expected Loss", fmtMoney(severe.stressed), "Across 10 sectors", c.red],
  ["Incremental Expected Loss", fmtMoney(severe.incremental), "+102.4% vs stress-table base", c.amber],
  ["Largest Supplied Stress", fmtMoney(covid.stressed), "COVID-like · +166.2%", c.purple],
  ["Worst MOB-36 Vintage", "2019Q4", "20.72% cumulative default rate", c.blue],
].forEach((k, i) => { p4 += card(124 + i * (242 + 16), 102, 242, 108, ...k); });

p4 += panel(124, 230, 620, 300, "Severe Stress Impact by Sector", "Incremental expected loss");
p4 += horizontalBars(severeSector, 154, 292, 560, 210, (r) => n(r.incremental_expected_loss), (r) => r.sector.replaceAll("_", " "),
  (_r, i) => i < 3 ? c.red : i < 6 ? c.amber : c.blue, (v) => fmtMoney(v));

p4 += panel(760, 230, 656, 300, "Vintage Curves", "Cumulative default rate by months on books");
const vintColors = [c.blue, c.red, c.teal, c.purple];
vintageSeries.forEach((series, i) => {
  p4 += `<path d="${linePath(series.rows, 798, 300, 570, 170, (r) => n(r.cumulative_default_rate), 0, 0.24)}" fill="none" stroke="${vintColors[i]}" stroke-width="3"/>`;
  p4 += rect(820 + i * 125, 490, 13, 4, vintColors[i], 2);
  p4 += text(840 + i * 125, 496, series.name, 10, c.muted, 600);
});
p4 += text(798, 287, "24%", 9, c.muted, 400);
p4 += text(798, 484, "0%", 9, c.muted, 400);

p4 += panel(124, 548, 620, 326, "Rating Downgrade Rate", "Portfolio issuer observations by year");
p4 += `<path d="${linePath(migration, 166, 630, 530, 160, (r) => r.rate, 0.05, 0.105)}" fill="none" stroke="${c.red}" stroke-width="4"/>`;
migration.forEach((r, i) => {
  const x = 166 + (i / (migration.length - 1)) * 530;
  const y = 630 + 160 - ((r.rate - 0.05) / 0.055) * 160;
  p4 += `<circle cx="${x}" cy="${y}" r="4" fill="${c.red}" stroke="white" stroke-width="2"/>`;
  p4 += text(x, 816, r.year, 9, c.muted, 500, "middle");
});
p4 += text(166, 612, "10.5%", 9, c.muted, 400);
p4 += text(166, 798, "5.0%", 9, c.muted, 400);

p4 += panel(760, 548, 656, 326, "Resilience Actions & Caveats", "Use scenarios to prioritize review and capital planning");
[
  [c.red, "Severe scenario", `$${(severe.incremental / 1e9).toFixed(2)}B incremental EL; Financials is the largest sector impact.`],
  [c.purple, "COVID-like", `$${(covid.incremental / 1e9).toFixed(2)}B incremental EL — largest supplied scenario.`],
  [c.blue, "Vintage focus", "2019Q4 reaches 20.72% cumulative default at month 36; inspect origination conditions."],
  [c.amber, "Dataset caveat", "Baseline stress EL is below base EL because scenario LGD assumptions differ. Do not hide it."],
].forEach((item, i) => {
  const y = 625 + i * 61;
  p4 += `<circle cx="792" cy="${y}" r="8" fill="${item[0]}"/>`;
  p4 += text(812, y - 5, item[1], 12, c.ink, 700);
  p4 += multiText(812, y + 14, item[2], 70, 11, c.muted, 400, 15);
});
p4 = closeSvg(p4);

const files = [];
files.push(await save("01_executive_overview", p1));
files.push(await save("02_model_performance", p2));
files.push(await save("03_underwriting_simulator", p3));
files.push(await save("04_portfolio_resilience", p4));
console.log(files.join("\n"));
