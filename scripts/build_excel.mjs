import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const artifactModule = runtimeModules
  ? pathToFileURL(path.join(runtimeModules, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")).href
  : "@oai/artifact-tool";
const { SpreadsheetFile, Workbook } = await import(artifactModule);

const projectRoot = path.resolve(process.argv[2] ?? ".");
const dataDir = path.join(projectRoot, "dashboard", "data");
const outputDir = path.join(projectRoot, "excel");
const previewDir = path.join(outputDir, "previews");

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const C = {
  navy: "#132238",
  blue: "#1F4E78",
  cyan: "#20A4F3",
  teal: "#2CB67D",
  amber: "#F4B942",
  red: "#D64550",
  ink: "#17212B",
  muted: "#5F6B7A",
  pale: "#EEF3F8",
  paleBlue: "#E8F3FB",
  paleGreen: "#E8F6EF",
  paleAmber: "#FFF5D6",
  paleRed: "#FBEAEC",
  white: "#FFFFFF",
  line: "#D7DEE7",
};

const workbook = Workbook.create();
const cover = workbook.worksheets.add("Cover");
const summary = workbook.worksheets.add("Portfolio Summary");
const simulator = workbook.worksheets.add("Threshold Simulator");
const dictionary = workbook.worksheets.add("Data Dictionary");
const checks = workbook.worksheets.add("Checks");

async function importCsv(fileName, sheetName) {
  const csv = await fs.readFile(path.join(dataDir, fileName), "utf8");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  const width = Math.max(...rows.map((r) => r.length));
  const coerce = (cell, rowIndex) => {
    if (rowIndex === 0) return cell;
    if (cell === "") return null;
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(cell)) return Number(cell);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return new Date(`${cell}T00:00:00Z`);
    return cell;
  };
  const normalized = rows.map((r, rowIndex) => {
    const current = r.map((cell) => coerce(cell, rowIndex));
    while (current.length < width) current.push(null);
    return current;
  });
  const sheet = workbook.worksheets.add(sheetName);
  const chunkSize = 2000;
  for (let start = 0; start < normalized.length; start += chunkSize) {
    const chunk = normalized.slice(start, start + chunkSize);
    sheet.getRangeByIndexes(start, 0, chunk.length, width).values = chunk;
  }
  return sheet;
}

const sector = await importCsv("sector_risk.csv", "Sector Risk");
const metrics = await importCsv("model_metrics.csv", "Model Metrics");
const highRisk = await importCsv("high_risk_test_loans.csv", "High-Risk Loans");
const featureImportance = await importCsv("feature_importance.csv", "Feature Importance");
const riskDecile = await importCsv("risk_decile_lift.csv", "Risk Decile");
const thresholdData = await importCsv("selected_model_test_thresholds.csv", "Threshold Data");
const executiveKpis = await importCsv("executive_kpis.csv", "Executive KPIs");
const validationSource = await importCsv("validation_summary.csv", "Validation Source");

function titleBand(sheet, range, text) {
  sheet.getRange(range).merge();
  const cell = sheet.getRange(range.split(":")[0]);
  cell.values = [[text]];
  sheet.getRange(range).format = {
    fill: C.navy,
    font: { name: "Aptos Display", size: 18, bold: true, color: C.white },
    verticalAlignment: "center",
    horizontalAlignment: "left",
  };
  sheet.getRange(range).format.rowHeight = 34;
}

function sectionBand(sheet, range, text) {
  sheet.getRange(range).merge();
  sheet.getRange(range.split(":")[0]).values = [[text]];
  sheet.getRange(range).format = {
    fill: C.blue,
    font: { name: "Aptos", size: 11, bold: true, color: C.white },
    verticalAlignment: "center",
    horizontalAlignment: "left",
  };
}

function styleHeader(sheet, range) {
  sheet.getRange(range).format = {
    fill: C.blue,
    font: { name: "Aptos", size: 10, bold: true, color: C.white },
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: C.blue },
  };
}

function styleSourceSheet(sheet, usedRange, headerRange, tableName) {
  sheet.showGridLines = false;
  styleHeader(sheet, headerRange);
  sheet.freezePanes.freezeRows(1);
  sheet.getRange(usedRange).format.font = { name: "Aptos", size: 9, color: C.ink };
  sheet.getRange(headerRange).format.font = { name: "Aptos", size: 9, bold: true, color: C.white };
  if (tableName) {
    const table = sheet.tables.add(usedRange, true, tableName);
    table.style = "TableStyleMedium2";
    table.showBandedRows = true;
    table.showFilterButton = true;
  }
}

// Cover
cover.showGridLines = false;
cover.getRange("A1:H2").merge();
cover.getRange("A1").values = [["CREDIT RISK SCORING & LOAN DEFAULT PREDICTION"]];
cover.getRange("A1:H2").format = {
  fill: C.navy,
  font: { name: "Aptos Display", size: 22, bold: true, color: C.white },
  verticalAlignment: "center",
  horizontalAlignment: "left",
};
cover.getRange("A4:H4").merge();
cover.getRange("A4").values = [["Excel underwriting companion | Validated on the supplied 50,000-loan dataset"]];
cover.getRange("A4:H4").format = {
  font: { name: "Aptos", size: 12, bold: true, color: C.blue },
};
sectionBand(cover, "A6:H6", "HOW TO USE THIS WORKBOOK");
cover.getRange("A8:H13").values = [
  ["1", "Open Portfolio Summary", "Review portfolio scale, default rate, model ranking, and risk concentration.", null, null, null, null, null],
  ["2", "Use Threshold Simulator", "Edit only the blue threshold and opportunity-cost cells; formulas update automatically.", null, null, null, null, null],
  ["3", "Review High-Risk Loans", "Prioritize manual review by term-risk loss proxy. This is a ranking aid, not an approval engine.", null, null, null, null, null],
  ["4", "Read Checks", "Model status should show OK before using workbook outputs.", null, null, null, null, null],
  ["5", "Respect the horizon", "The score estimates default over the simulated contractual term, not 12-month PD.", null, null, null, null, null],
  ["6", "Do not infer causality", "Relationships and predictions do not prove that a feature causes default.", null, null, null, null, null],
];
cover.getRange("A8:A13").format = {
  fill: C.cyan,
  font: { bold: true, color: C.white, size: 11 },
  horizontalAlignment: "center",
};
cover.getRange("B8:B13").format.font = { bold: true, color: C.ink };
cover.getRange("C8:H13").merge(true);
cover.getRange("A8:H13").format = {
  borders: { preset: "inside", style: "thin", color: C.line },
  verticalAlignment: "center",
  wrapText: true,
};
cover.getRange("A8:H13").format.rowHeight = 35;
sectionBand(cover, "A15:H15", "MODEL STATUS & CONVENTIONS");
cover.getRange("A17:B22").values = [
  ["Selected model", "Calibrated Random Forest"],
  ["Operating threshold", 0.17],
  ["Test period", "2022-01 to 2023-12 (11,077 loans)"],
  ["Target", "Default during simulated contractual term"],
  ["Currency", "Dataset monetary units (displayed with $ for readability)"],
  ["Validation environment", "Python/file pipeline passed; PostgreSQL and Power BI require local app validation"],
];
cover.getRange("B17:H22").merge(true);
cover.getRange("A17:A22").format = { fill: C.pale, font: { bold: true, color: C.ink } };
cover.getRange("B17:H22").format = { font: { color: C.ink }, wrapText: true, verticalAlignment: "center", horizontalAlignment: "left" };
cover.getRange("A17:H22").format.rowHeight = 30;
cover.getRange("B18").format.numberFormat = "0.00";
cover.getRange("A24:H26").merge(true);
cover.getRange("A24").values = [["Source: Kaggle — Credit Risk Dataset: 50K Loans, 10 Sectors"]];
cover.getRange("A25").values = [["Workbook generated from actual pipeline outputs; no claimed model metric is manually invented."]];
cover.getRange("A26").values = [["Editable input cells use blue font and pale-yellow fill. Formula cells use black font."]];
cover.getRange("A24:H26").format = { font: { italic: true, color: C.muted, size: 9 }, wrapText: true };
cover.getRange("A:H").format.columnWidth = 15;
cover.getRange("A:A").format.columnWidth = 24;
cover.getRange("B:B").format.columnWidth = 20;
cover.getRange("C:H").format.columnWidth = 16;

// Portfolio Summary
summary.showGridLines = false;
titleBand(summary, "A1:N2", "Portfolio Summary");
summary.getRange("A3:N3").merge();
summary.getRange("A3").values = [["All-loan portfolio profile with out-of-time model metrics shown separately"]];
summary.getRange("A3:N3").format = { font: { italic: true, color: C.muted, size: 10 } };
const cardLabels = [["Loan Count", null, "Total EAD", null, "Observed Default Rate", null, "Test Review Rate", null]];
summary.getRange("A5:H5").values = cardLabels;
summary.getRange("A5:H5").format = { fill: C.pale, font: { bold: true, color: C.muted }, horizontalAlignment: "center" };
summary.getRange("A6:B7").merge();
summary.getRange("C6:D7").merge();
summary.getRange("E6:F7").merge();
summary.getRange("G6:H7").merge();
summary.getRange("A6").formulas = [["='Executive KPIs'!$A$2"]];
summary.getRange("C6").formulas = [["='Executive KPIs'!$B$2"]];
summary.getRange("E6").formulas = [["='Executive KPIs'!$D$2"]];
summary.getRange("G6").formulas = [["=1-'Threshold Simulator'!$B$14"]];
summary.getRange("A6:H7").format = {
  fill: C.white,
  font: { name: "Aptos Display", bold: true, size: 18, color: C.ink },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: C.line },
};
summary.getRange("A6").format.numberFormat = "#,##0";
summary.getRange("C6").format.numberFormat = "$0.0,,,\"B\"";
summary.getRange("E6").format.numberFormat = "0.0%";
summary.getRange("G6").format.numberFormat = "0.0%";

sectionBand(summary, "A9:H9", "OUT-OF-TIME TEST PERFORMANCE");
summary.getRange("A10:H10").values = [["Selected Model", null, "ROC-AUC", null, "PR-AUC", null, "Recall @ Operating Threshold", null]];
summary.getRange("A10:H10").format = { fill: C.pale, font: { bold: true, color: C.muted }, horizontalAlignment: "center" };
summary.getRange("A11:B12").merge();
summary.getRange("C11:D12").merge();
summary.getRange("E11:F12").merge();
summary.getRange("G11:H12").merge();
summary.getRange("A11").formulas = [["='Threshold Simulator'!$B$5"]];
summary.getRange("C11").formulas = [["=MAXIFS('Model Metrics'!$E$2:$E$100,'Model Metrics'!$A$2:$A$100,$A$11,'Model Metrics'!$B$2:$B$100,\"test\")"]];
summary.getRange("E11").formulas = [["=MAXIFS('Model Metrics'!$F$2:$F$100,'Model Metrics'!$A$2:$A$100,$A$11,'Model Metrics'!$B$2:$B$100,\"test\")"]];
summary.getRange("G11").formulas = [["=MAXIFS('Model Metrics'!$H$2:$H$100,'Model Metrics'!$A$2:$A$100,$A$11,'Model Metrics'!$B$2:$B$100,\"test\",'Model Metrics'!$C$2:$C$100,\"operating_recall_constraint\")"]];
summary.getRange("A11:H12").format = {
  fill: C.paleBlue,
  font: { bold: true, size: 15, color: C.blue },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: C.line },
};
summary.getRange("C11:G11").format.numberFormat = "0.000";

sectionBand(summary, "A14:E14", "SECTOR RISK PROFILE");
summary.getRange("A15:C15").values = [["Sector", "Observed Default Rate", "Total EAD"]];
for (let row = 16; row <= 25; row += 1) {
  const src = row - 14;
  summary.getRange(`A${row}:C${row}`).formulas = [[
    `='Sector Risk'!A${src}`,
    `='Sector Risk'!E${src}`,
    `='Sector Risk'!C${src}`,
  ]];
}
styleHeader(summary, "A15:C15");
summary.getRange("B16:B25").format.numberFormat = "0.0%";
summary.getRange("C16:C25").format.numberFormat = "$#,##0,,\"M\"";
summary.getRange("A15:C25").format.borders = { preset: "inside", style: "thin", color: C.line };
const sectorChart = summary.charts.add("bar", summary.getRange("A15:B25"));
sectorChart.title = "Observed Default Rate by Sector";
sectorChart.hasLegend = false;
sectorChart.yAxis = { numberFormatCode: "0.0%" };
sectorChart.setPosition("E14", "N29");

sectionBand(summary, "A28:E28", "TEST RISK DECILE LIFT");
summary.getRange("A29:C29").formulas = [["='Risk Decile'!A1", "='Risk Decile'!D1", "='Risk Decile'!H1"]];
for (let row = 30; row <= 39; row += 1) {
  const src = row - 28;
  summary.getRange(`A${row}:C${row}`).formulas = [[
    `='Risk Decile'!A${src}`,
    `='Risk Decile'!D${src}`,
    `='Risk Decile'!H${src}`,
  ]];
}
styleHeader(summary, "A29:C29");
summary.getRange("B30:B39").format.numberFormat = "0.0%";
summary.getRange("C30:C39").format.numberFormat = "0.0x";
const decileChart = summary.charts.add("bar", summary.getRange("A29:B39"));
decileChart.title = "Top Risk Decile Concentrates Defaults";
decileChart.hasLegend = false;
decileChart.yAxis = { numberFormatCode: "0.0%" };
decileChart.setPosition("E31", "N46");
summary.getRange("A42:D45").merge();
summary.getRange("A42").values = [["Interpretation: the top test risk decile has a 44.1% observed default rate (5.64x the test average). Use the score for review prioritization; do not treat it as causal or as a standalone approval decision."]];
summary.getRange("A42:D45").format = { fill: C.paleAmber, font: { color: C.ink, italic: true }, wrapText: true, verticalAlignment: "center" };
summary.freezePanes.freezeRows(3);
summary.getRange("A:N").format.columnWidth = 13;
summary.getRange("A:A").format.columnWidth = 18;
summary.getRange("E:N").format.columnWidth = 12;

// Threshold Simulator
simulator.showGridLines = false;
titleBand(simulator, "A1:M2", "Underwriting Threshold Simulator");
simulator.getRange("A3:M3").merge();
simulator.getRange("A3").values = [["Edit blue cells only. Threshold was selected on 2021 validation data; table below reports the unseen 2022-2023 test trade-off."]];
simulator.getRange("A3:M3").format = { font: { italic: true, color: C.muted }, wrapText: true };
simulator.getRange("A5:B7").values = [
  ["Selected Model", "Calibrated Random Forest"],
  ["Decision Threshold", 0.17],
  ["Opportunity Cost Rate", 0.02],
];
simulator.getRange("A5:A7").format = { fill: C.pale, font: { bold: true, color: C.ink } };
simulator.getRange("B5").format = { font: { color: "#008000", bold: true } };
simulator.getRange("B6:B7").format = {
  fill: C.paleAmber,
  font: { color: "#0000FF", bold: true },
  borders: { preset: "outside", style: "thin", color: C.amber },
};
simulator.getRange("B6:B7").format.numberFormat = "0.00";
simulator.getRange("B7").format.numberFormat = "0.0%";
simulator.getRange("B6").dataValidation = {
  rule: { type: "decimal", operator: "between", formula1: 0.01, formula2: 0.99 },
};
simulator.getRange("B7").dataValidation = {
  rule: { type: "decimal", operator: "between", formula1: 0, formula2: 1 },
};

sectionBand(simulator, "A9:B9", "SELECTED TEST OUTCOME");
const outcomeLabels = [
  "Precision", "Recall", "F1 Score", "Specificity", "Approval Rate",
  "False Positives", "False Negatives", "Missed Default Loss Exposure",
  "Rejected Good EAD", "Dynamic Cost Proxy"
];
simulator.getRange("A10:A19").values = outcomeLabels.map((x) => [x]);
simulator.getRange("A10:A19").format = { fill: C.pale, font: { bold: true, color: C.ink } };
const thresholdColumns = ["D", "E", "F", "G", "H", "J", "K", "M", "N", "Q"];
for (let i = 0; i < thresholdColumns.length; i += 1) {
  const row = 10 + i;
  simulator.getRange(`B${row}`).formulas = [[
    `=INDEX('Threshold Data'!$${thresholdColumns[i]}$2:$${thresholdColumns[i]}$100,MATCH($B$6,'Threshold Data'!$C$2:$C$100,0))`,
  ]];
}
simulator.getRange("B10:B14").format.numberFormat = "0.0%";
simulator.getRange("B15:B16").format.numberFormat = "#,##0";
simulator.getRange("B17:B19").format.numberFormat = "$#,##0,,\"M\"";
simulator.getRange("A10:B19").format.borders = { preset: "inside", style: "thin", color: C.line };

// Formula-backed chart helper table
simulator.getRange("A23:D23").values = [["Threshold", "Precision", "Recall", "Approval Rate"]];
styleHeader(simulator, "A23:D23");
for (let row = 24; row <= 73; row += 1) {
  const src = row - 22;
  simulator.getRange(`A${row}:D${row}`).formulas = [[
    `='Threshold Data'!C${src}`,
    `='Threshold Data'!D${src}`,
    `='Threshold Data'!E${src}`,
    `='Threshold Data'!H${src}`,
  ]];
}
simulator.getRange("A24:A73").format.numberFormat = "0.00";
simulator.getRange("B24:D73").format.numberFormat = "0%";
simulator.getRange("A24:D73").conditionalFormats.addCustom("=$A24=$B$6", {
  fill: C.paleAmber,
  font: { bold: true, color: C.ink },
});
const thresholdChart = simulator.charts.add("line", simulator.getRange("A23:D73"));
thresholdChart.title = "Precision–Recall–Approval Trade-off";
thresholdChart.hasLegend = true;
thresholdChart.yAxis = { numberFormatCode: "0%", min: 0, max: 1 };
thresholdChart.setPosition("D5", "M20");
simulator.getRange("F23:M26").merge(true);
simulator.getRange("F23").values = [["Cost proxy = missed default EAD × LGD + rejected-good EAD × editable opportunity-cost rate. It is a scenario aid, not a measured realized cost or causal policy effect."]];
simulator.getRange("F23:M26").format = { fill: C.paleAmber, font: { italic: true, color: C.ink }, wrapText: true };
simulator.freezePanes.freezeRows(3);
simulator.getRange("A:A").format.columnWidth = 32;
simulator.getRange("B:B").format.columnWidth = 18;
simulator.getRange("C:C").format.columnWidth = 3;
simulator.getRange("D:M").format.columnWidth = 12;
simulator.getRange("A23:A73").format.columnWidth = 32;
simulator.getRange("B23:D73").format.columnWidth = 16;

// Imported source tabs
styleSourceSheet(sector, "A1:L11", "A1:L1", "SectorRiskTable");
sector.getRange("C2:C11").format.numberFormat = "$#,##0,,\"M\"";
sector.getRange("E2:H11").format.numberFormat = "0.0%";
sector.getRange("I2:I11").format.numberFormat = "$#,##0,,\"M\"";
sector.getRange("J2:J11").format.numberFormat = "#,##0";
sector.getRange("L2:L11").format.numberFormat = "0.0%";
sector.getRange("A:L").format.columnWidth = 16;

styleSourceSheet(metrics, "A1:P7", "A1:P1", "ModelMetricsTable");
metrics.getRange("D2:L7").format.numberFormat = "0.000";
metrics.getRange("M2:P7").format.numberFormat = "#,##0";
metrics.getRange("A:P").format.columnWidth = 15;
metrics.getRange("A:A").format.columnWidth = 28;
metrics.getRange("C:C").format.columnWidth = 30;

styleSourceSheet(highRisk, "A1:P501", "A1:P1", "HighRiskLoansTable");
highRisk.getRange("B2:B501").format.numberFormat = "yyyy-mm-dd";
highRisk.getRange("H2:H501").format.numberFormat = "$#,##0";
highRisk.getRange("I2:J501").format.numberFormat = "0.0%";
highRisk.getRange("N2:N501").format.numberFormat = "$#,##0";
highRisk.getRange("A:P").format.columnWidth = 15;
highRisk.getRange("A:A").format.columnWidth = 13;
highRisk.getRange("B:B").format.columnWidth = 13;
highRisk.getRange("C:G").format.columnWidth = 16;
highRisk.getRange("M:M").format.columnWidth = 19;
highRisk.getRange("J2:J501").conditionalFormats.add("colorScale", {
  colors: [C.paleGreen, C.paleAmber, C.paleRed], thresholds: ["min", "50%", "max"]
});

styleSourceSheet(featureImportance, "A1:D19", "A1:D1", "FeatureImportanceTable");
featureImportance.getRange("C2:D19").format.numberFormat = "0.000";
featureImportance.getRange("A:D").format.columnWidth = 25;
const fiChart = featureImportance.charts.add("bar", featureImportance.getRange("B1:C11"));
fiChart.title = "Permutation Importance (Test PR-AUC)";
fiChart.hasLegend = false;
fiChart.setPosition("F2", "N20");

styleSourceSheet(riskDecile, "A1:H11", "A1:H1", "RiskDecileTable");
riskDecile.getRange("D2:E11").format.numberFormat = "0.0%";
riskDecile.getRange("F2:F11").format.numberFormat = "$#,##0,,\"M\"";
riskDecile.getRange("G2:G11").format.numberFormat = "0.0%";
riskDecile.getRange("H2:H11").format.numberFormat = "0.0x";
riskDecile.getRange("A:H").format.columnWidth = 18;

styleSourceSheet(thresholdData, "A1:P100", "A1:P1", "ThresholdDataTable");
thresholdData.getRange("Q1").values = [["dynamic_cost_proxy"]];
styleHeader(thresholdData, "Q1:Q1");
thresholdData.getRange("Q2").formulas = [["=M2+N2*'Threshold Simulator'!$B$7"]];
thresholdData.getRange("Q2:Q100").fillDown();
thresholdData.getRange("C2:H100").format.numberFormat = "0.0%";
thresholdData.getRange("M2:N100").format.numberFormat = "$#,##0";
thresholdData.getRange("O2:O100").format.numberFormat = "0.0%";
thresholdData.getRange("P2:Q100").format.numberFormat = "$#,##0";
thresholdData.getRange("A:Q").format.columnWidth = 16;
thresholdData.getRange("A:A").format.columnWidth = 28;

styleSourceSheet(executiveKpis, "A1:I2", "A1:I1", "ExecutiveKpisTable");
executiveKpis.getRange("B2:B2").format.numberFormat = "$#,##0";
executiveKpis.getRange("D2:D2").format.numberFormat = "0.0%";
executiveKpis.getRange("E2:F2").format.numberFormat = "$#,##0";
executiveKpis.getRange("H2:I2").format.numberFormat = "0.0%";
executiveKpis.getRange("A:I").format.columnWidth = 22;

styleSourceSheet(validationSource, "A1:H2", "A1:H1", "ValidationSourceTable");
validationSource.getRange("G2:H2").format.numberFormat = "0.000000";
validationSource.getRange("A:H").format.columnWidth = 24;

// Data dictionary
dictionary.showGridLines = false;
titleBand(dictionary, "A1:E2", "Data Dictionary & Methodological Role");
dictionary.getRange("A4:E4").values = [["Field", "Type", "Business Meaning", "Model Role", "Important Note"]];
styleHeader(dictionary, "A4:E4");
const dictRows = [
  ["loan_id", "Text", "Unique loan identifier", "Identifier", "Primary key; excluded from model"],
  ["origination_date", "Date", "Loan origination month", "Split key", "Used for time-based train/validation/test split"],
  ["maturity_date", "Date", "Reported maturity date", "Excluded", "Capped at 2024-12-31 for many loans"],
  ["maturity_months", "Integer", "Contractual tenor in months", "Feature", "Preferred to capped maturity_date"],
  ["sector", "Category", "Borrower industry sector", "Feature / segment", "10 sectors"],
  ["loan_type", "Category", "Loan product type", "Feature", "Application-time field"],
  ["collateral", "Category", "Collateral category", "Feature", "Application-time field"],
  ["initial_rating", "Category", "Rating at origination", "Feature", "Strongest permutation importance"],
  ["credit_score", "Integer", "Credit score at origination", "Feature", "Observed range 518-850"],
  ["ead", "Currency", "Exposure at default", "Feature via log_ead", "Highly skewed; not deleted as a business-valid value"],
  ["coupon_rate", "Percent points", "Contract coupon rate", "Feature", "Stored as 1.0-7.531, not decimal fraction"],
  ["leverage", "Decimal", "Borrower leverage", "Feature", "Used directly and in engineered ratios"],
  ["interest_coverage", "Decimal", "Interest coverage ratio", "Feature", "Lower bound clipped only in engineered division"],
  ["debt_to_equity", "Decimal", "Debt-to-equity ratio", "Feature", "Application-time field"],
  ["pd_annual", "Probability", "Dataset annual probability of default", "Benchmark only", "Excluded to avoid circularity; horizon differs from target"],
  ["lgd", "Probability", "Dataset loss-given-default rate", "Benchmark / loss proxy", "Excluded from classifier"],
  ["el", "Currency", "Dataset expected loss", "Benchmark only", "Approximately EAD × annual PD × LGD"],
  ["unexpected_loss", "Currency", "Dataset unexpected loss", "Benchmark only", "Excluded from classifier"],
  ["rwa", "Currency", "Risk-weighted assets", "Benchmark only", "Excluded from classifier"],
  ["defaulted", "Binary", "Eventual default during simulated term", "Target", "1=default; 0=no default over simulated term"],
  ["default_date", "Date", "Date of default", "Leakage / excluded", "Known only after outcome"],
  ["survival_months", "Integer", "Months survived before default/censoring", "Leakage / excluded", "Post-outcome field"],
  ["recovery_rate", "Probability", "Observed recovery for defaulted loans", "Leakage / excluded", "Missing by design for non-defaults"],
  ["loss_given_default", "Currency", "Observed default loss amount", "Leakage / excluded", "Despite name, field is a dollar amount"],
  ["origination_gdp_growth", "Percent points", "GDP growth at origination", "Feature", "Joined from monthly portfolio file"],
  ["origination_unemployment", "Percent", "Unemployment at origination", "Feature", "Joined from monthly portfolio file"],
  ["origination_policy_rate", "Percent", "Policy rate at origination", "Feature", "Joined from monthly portfolio file"],
  ["origination_credit_spread_bps", "Basis points", "Credit spread at origination", "Feature", "Joined from monthly portfolio file"],
  ["origination_year", "Integer", "Origination year", "Reporting", "Not directly modeled"],
  ["origination_month", "Integer", "Origination month 1-12", "Feature", "Categorical seasonality feature"],
  ["origination_quarter", "Text", "Origination quarter", "Reporting", "Cohort/segment field"],
  ["default_loss_amount", "Currency", "Observed default loss or zero", "Outcome reporting", "Never used as a feature"],
  ["existing_expected_loss_rate", "Probability", "Dataset EL divided by EAD", "Benchmark", "Annual risk-system output"],
  ["credit_score_band", "Category", "Readable credit-score band", "Reporting", "Dashboard segmentation"],
  ["ead_band", "Category", "Portfolio exposure quartile", "Reporting", "Dashboard segmentation"],
  ["reported_maturity_is_capped", "Binary", "Flags 2024-12-31 maturity cap", "Data quality", "Do not infer true maturity from capped date"],
  ["data_split", "Category", "Train, validation, or test period", "Evaluation", "Test is 2022-2023"],
  ["model_name", "Text", "Selected classifier", "Output", "Current locally validated model is calibrated RF"],
  ["default_probability", "Probability", "Model term-default risk score", "Output", "Not directly comparable to annual PD"],
  ["operating_threshold", "Probability", "Validation-selected review cutoff", "Decision parameter", "0.17 in locally validated run"],
  ["predicted_default", "Binary", "Score above operating threshold", "Output", "Used only to route manual review"],
  ["risk_band", "Category", "Score-based risk grouping", "Output", "Low/Moderate/High/Very High"],
  ["risk_decile", "Integer", "Portfolio rank from highest to lowest score", "Output", "1 is highest risk"],
  ["underwriting_action", "Category", "Approve or Manual Review", "Decision aid", "No automatic reject action is generated"],
  ["term_risk_loss_proxy", "Currency", "Score × EAD × dataset LGD", "Ranking output", "Not accounting expected loss; horizon is contractual term"],
];
dictionary.getRange(`A5:E${4 + dictRows.length}`).values = dictRows;
dictionary.getRange(`A5:E${4 + dictRows.length}`).format = {
  font: { name: "Aptos", size: 9, color: C.ink },
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "inside", style: "thin", color: C.line },
};
dictionary.tables.add(`A4:E${4 + dictRows.length}`, true, "DataDictionaryTable").style = "TableStyleMedium2";
dictionary.freezePanes.freezeRows(4);
dictionary.getRange("A:A").format.columnWidth = 28;
dictionary.getRange("B:B").format.columnWidth = 18;
dictionary.getRange("C:C").format.columnWidth = 38;
dictionary.getRange("D:D").format.columnWidth = 22;
dictionary.getRange("E:E").format.columnWidth = 48;

// Checks
checks.showGridLines = false;
titleBand(checks, "A1:F2", "Workbook Checks");
checks.getRange("A3:B3").values = [["Overall Status", null]];
checks.getRange("B3").formulas = [["=IF(COUNTIF($E$6:$E$12,\"CHECK\")=0,\"OK\",\"CHECK\")"]];
checks.getRange("A3").format = { fill: C.pale, font: { bold: true, color: C.ink } };
checks.getRange("B3").format = { fill: C.paleGreen, font: { bold: true, color: C.teal, size: 14 }, horizontalAlignment: "center" };
checks.getRange("A5:F5").values = [["Check", "Actual", "Expected", "Difference", "Status", "Notes"]];
styleHeader(checks, "A5:F5");
checks.getRange("A6:A12").values = [
  ["Clean/scored loan row count"],
  ["Missing model probabilities"],
  ["Probabilities outside [0,1]"],
  ["Threshold exists in test table"],
  ["Test rows"],
  ["Default target values outside 0/1"],
  ["High-risk export rows"],
];
checks.getRange("B6:B12").formulas = [
  ["='Validation Source'!$A$2"],
  ["='Validation Source'!$D$2"],
  ["='Validation Source'!$E$2"],
  ["=COUNTIF('Threshold Data'!$C$2:$C$100,'Threshold Simulator'!$B$6)"],
  ["='Validation Source'!$C$2"],
  ["='Validation Source'!$F$2"],
  ["=COUNTA('High-Risk Loans'!$A$2:$A$501)"],
];
checks.getRange("C6:C12").values = [[50000], [0], [0], [1], [11077], [0], [500]];
checks.getRange("D6").formulas = [["=B6-C6"]];
checks.getRange("D6:D12").fillDown();
checks.getRange("E6").formulas = [["=IF(D6=0,\"OK\",\"CHECK\")"]];
checks.getRange("E6:E12").fillDown();
checks.getRange("F6:F12").values = [
  ["Must equal supplied portfolio size"],
  ["Every loan needs a score"],
  ["Probability validation"],
  ["Selected threshold must map to one row"],
  ["Out-of-time holdout: 2022-2023"],
  ["Binary target validation"],
  ["Review shortlist size"],
];
checks.getRange("A6:F12").format.borders = { preset: "inside", style: "thin", color: C.line };
checks.getRange("E6:E12").conditionalFormats.addCustom("=$E6=\"OK\"", { fill: C.paleGreen, font: { bold: true, color: C.teal } });
checks.getRange("E6:E12").conditionalFormats.addCustom("=$E6=\"CHECK\"", { fill: C.paleRed, font: { bold: true, color: C.red } });
checks.getRange("A:A").format.columnWidth = 34;
checks.getRange("B:E").format.columnWidth = 15;
checks.getRange("F:F").format.columnWidth = 42;

// Compact styling and inspect before export.
for (const sheetName of ["Cover", "Portfolio Summary", "Threshold Simulator", "Data Dictionary", "Checks"]) {
  const sheet = workbook.worksheets.getItem(sheetName);
  sheet.getUsedRange().format.font.name = "Aptos";
}

const inspectResult = await workbook.inspect({
  kind: "sheet,table,formula,drawing",
  maxChars: 12000,
  tableMaxRows: 4,
  tableMaxCols: 8,
  options: { maxResults: 200 },
});
await fs.writeFile(path.join(outputDir, "workbook_inspection.txt"), inspectResult.ndjson ?? String(inspectResult), "utf8");

const formulaErrorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 200 },
  maxChars: 8000,
});
await fs.writeFile(path.join(outputDir, "formula_error_scan.txt"), formulaErrorScan.ndjson ?? String(formulaErrorScan), "utf8");

for (const sheetName of ["Cover", "Portfolio Summary", "Threshold Simulator", "Sector Risk", "Model Metrics", "Feature Importance", "Data Dictionary", "Checks"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const safeName = sheetName.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
  await fs.writeFile(path.join(previewDir, `${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "credit_risk_underwriting_analysis.xlsx"));
console.log(path.join(outputDir, "credit_risk_underwriting_analysis.xlsx"));
