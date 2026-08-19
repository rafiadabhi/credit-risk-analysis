# Panduan End-to-End — Dashboard Power BI Credit Risk (Project 2)

Panduan ini menjelaskan cara membangun dashboard **Credit Risk Portfolio & Underwriting Analytics** dari nol sampai siap ditunjukkan sebagai portfolio project. Semua nama tabel, relasi, dan metrik di bawah mengikuti source code Project 2 ini; jadi jangan mengganti nama tabel atau memakai CSV lain sebagai sumber dashboard.

Hasil akhirnya adalah satu file `credit_risk_dashboard.pbix` dengan empat halaman:

1. **Executive Portfolio Overview** — konsentrasi exposure dan observed default.
2. **Model Performance & Risk Segmentation** — performa model pada test period dan risk lift.
3. **Underwriting Decision Simulator** — simulasi threshold untuk antrean manual review.
4. **Portfolio Resilience** — stress scenario, vintage, dan rating migration.

> **Interpretasi yang wajib dipertahankan:** target `defaulted` adalah default selama *simulated contractual term*, bukan PD 12-bulan. `default_probability` adalah term-risk score. Dashboard hanya mendukung prioritisasi ke **Manual Review**, bukan auto-reject atau keputusan kredit produksi.

---

## 1. Yang perlu disiapkan

| Kebutuhan | Tujuan |
| --- | --- |
| Power BI Desktop | Membuat file PBIX dan report interaktif. |
| Python virtual environment + `requirements.txt` | Menjalankan pipeline. |
| PostgreSQL lokal | Tahap wajib: pipeline membaca/menulis analytical layer di PostgreSQL. |
| Lima raw CSV di `data/raw/` | Input utama pipeline. |
| File `.env` yang benar | Menghubungkan pipeline ke PostgreSQL. |

Raw file yang wajib berada di `data/raw/`:

```text
loan_portfolio.csv
credit_ratings.csv
macro_stress_scenarios.csv
portfolio_metrics.csv
vintage_analysis.csv
```

Contoh `.env` di project root:

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=credit_risk_db
PGUSER=postgres
PGPASSWORD=YOUR_ACTUAL_POSTGRES_PASSWORD
```

Jangan commit `.env` atau raw CSV ke GitHub.

---

## 2. Buat data dashboard terlebih dahulu

Dashboard **tidak** boleh dibuat dari screenshot, placeholder, atau angka yang diketik manual. Jalankan pipeline dari project root.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python run_pipeline.py
```

Urutan tahap yang benar adalah:

```text
01_audit_clean
03_load_postgresql
02_train_models
04_build_powerbi_views
05_export_powerbi_data
06_validate_outputs
```

Lanjut ke Power BI hanya jika output validasi berakhir dengan:

```json
"status": "PASS"
```

File satu-satunya yang perlu diimpor ke Power BI adalah:

```text
data\outputs\credit_risk_powerbi_dataset.xlsx
```

Workbook tersebut bukan Excel sumber biasa: ia diekspor dari PostgreSQL setelah cleaning, modeling, dan reporting view selesai. Karena tabel di dalamnya punya grain berbeda, **jangan** menggabungkan semuanya menjadi satu flat table dan jangan membuat fallback CSV.

### Pemeriksaan cepat sebelum membuka Power BI

Pastikan hasil run memiliki kondisi berikut.

| Pemeriksaan | Nilai yang diharapkan |
| --- | ---: |
| `Fact Loans` | 50,000 baris |
| `Fact Monthly Portfolio` | 120 baris |
| `Fact Stress` | 60 baris |
| `Fact Vintage` | 2,160 baris |
| `loan_id` unik | 50,000 |
| `data_split` | `train`, `validation`, `test` |
| Test loans | 11,077 |
| `default_probability` | tidak kosong dan berada di 0–1 |

Nilai portfolio yang dihasilkan dari source data yang sama dapat dipakai sebagai rekonsiliasi akhir, bukan untuk diketik manual: 50,000 loan, EAD sekitar `$164.93B`, 6,950 observed defaults, dan observed default rate sekitar `13.90%`.

---

## 3. Buat file PBIX dan pasang theme

1. Buka **Power BI Desktop**.
2. Simpan segera sebagai `dashboard/credit_risk_dashboard.pbix`.
3. Pada **Format page > Canvas settings**, set **Type = Custom** dan ukuran `1440 × 900`.
4. Pada **View > Themes > Browse for themes**, pilih file:

   ```text
   dashboard/credit_risk_theme.json
   ```

5. Gunakan font **Segoe UI**. Theme sudah menetapkan dasar warna dan card, tetapi rapikan tiap visual bila perlu.

Spesifikasi visual yang konsisten dengan mockup:

| Elemen | Nilai |
| --- | --- |
| Background | `#F5F7FA` |
| Header/navigation | `#132238` |
| Primary navy | `#1F4E78` |
| Highlight blue | `#20A4F3` |
| Positive teal | `#2CB67D` |
| Warning amber | `#F4B942` |
| Adverse red | `#D64550` |
| Outer margin / gutter / radius | `24 px` / `16 px` / `8 px` |
| Judul halaman / visual / KPI | `24–28 pt` / `12–14 pt` / `24–32 pt` |

Jangan memakai red/green sebagai satu-satunya pembeda. Tambahkan label, judul yang eksplisit, dan tooltip.

---

## 4. Import workbook ke Power BI

1. Pilih **Home > Get data > Excel workbook**.
2. Buka `data\outputs\credit_risk_powerbi_dataset.xlsx`.
3. Di **Navigator**, pilih **table** berikut — bukan worksheet dengan nama mirip.
4. Pilih **Transform Data**, jangan langsung Load.

| Excel table | Nama query Power BI setelah di-rename | Grain |
| --- | --- | --- |
| `tblFact_Loans` | `Fact Loans` | Satu originated loan |
| `tblFact_Thresholds` | `Fact Thresholds` | Satu threshold test untuk selected model |
| `tblFact_ModelMetrics` | `Fact Model Metrics` | Satu model, split, dan threshold type |
| `tblFact_Portfolio` | `Fact Monthly Portfolio` | Satu bulan portfolio |
| `tblFact_Stress` | `Fact Stress` | Satu scenario dan sector |
| `tblFact_Vintage` | `Fact Vintage` | Satu vintage dan months-on-books |
| `tblFact_Migration` | `Fact Migration` | Satu tahun dan sector |
| `tblFeature_Importance` | `Feature Importance` | Satu feature selected model |

Jangan load `tblManifest` sebagai tabel analitis. Ia hanya berfungsi sebagai data-lineage dan validation manifest.

### 4.1 Rapikan tipe data di Power Query

Rename query sesuai tabel di atas. Lalu gunakan tipe berikut.

| Kelompok kolom | Tipe Power Query |
| --- | --- |
| `origination_date`, `maturity_date`, `default_date`, `Fact Monthly Portfolio[date]` | Date |
| ID dan kategori (`loan_id`, `sector`, `initial_rating`, `risk_band`, `model_name`) | Text |
| Count dan flag (`defaulted`, `risk_decile`, `months_on_books`, `year`) | Whole number |
| EAD, EL, RWA, loss, `term_risk_loss_proxy` | Fixed decimal number |
| PD, LGD, rate, score probability, model metric | Decimal number |

Jangan menghapus EAD besar hanya karena tampak sebagai outlier secara IQR; nilai tersebut dapat menjadi exposure yang sah secara bisnis.

### 4.2 Buat dimension query

Di Power Query, klik kanan `Fact Loans` lalu pilih **Reference**. Ganti nama query menjadi `Dim Sector`, buka **Advanced Editor**, lalu gunakan:

```powerquery
let
    Source = #"Fact Loans",
    Keep = Table.SelectColumns(Source, {"sector"}),
    DistinctRows = Table.Distinct(Keep)
in
    DistinctRows
```

Untuk rating, pilih **Home > New Source > Blank Query**, rename menjadi `Dim Rating`, lalu gunakan:

```powerquery
let
    Source = #table(
        {"initial_rating", "rating_sort"},
        {{"AAA",1},{"AA",2},{"A",3},{"BBB",4},{"BB",5},{"B",6},{"CCC",7}}
    )
in
    Source
```

Pilih **Close & Apply** setelah semua tipe data dan query sudah benar.

---

## 5. Bangun semantic model yang aman

### 5.1 Buat date dimension

Di **Modeling > New table**, buat tabel berikut:

```DAX
Dim Date =
ADDCOLUMNS(
    CALENDAR(DATE(2015, 1, 1), DATE(2024, 12, 31)),
    "Year", YEAR([Date]),
    "Month Number", MONTH([Date]),
    "Month", FORMAT([Date], "MMM"),
    "Year Month", FORMAT([Date], "YYYY-MM"),
    "Quarter", "Q" & FORMAT([Date], "Q")
)
```

Kemudian:

1. Pilih `Dim Date[Month]` > **Column tools > Sort by column** > `Month Number`.
2. Pilih `Dim Rating[initial_rating]` > **Sort by column** > `rating_sort`.
3. Mark `Dim Date` sebagai date table jika Power BI meminta konfigurasi date table.

### 5.2 Buat relationship

Di **Model view**, gunakan filter direction **Single** dari dimension ke fact. Jangan menghubungkan fact dengan fact.

| Dari (1) | Ke (*) | Kolom | Active |
| --- | --- | --- | --- |
| `Dim Date` | `Fact Loans` | `Date` → `origination_date` | Ya |
| `Dim Date` | `Fact Monthly Portfolio` | `Date` → `date` | Ya |
| `Dim Sector` | `Fact Loans` | `sector` → `sector` | Ya |
| `Dim Sector` | `Fact Stress` | `sector` → `sector` | Ya |
| `Dim Sector` | `Fact Migration` | `sector` → `sector` | Ya |
| `Dim Rating` | `Fact Loans` | `initial_rating` → `initial_rating` | Ya |

Biarkan `Fact Thresholds`, `Fact Model Metrics`, `Fact Vintage`, dan `Feature Importance` **disconnected**. Tabel-tabel tersebut memiliki grain berbeda; memaksa relationship akan membuat jalur filter ambigu dan angka bisa terduplikasi.

Konsekuensinya, metric card model bersifat **current-run global metric**. Slicer Sector/Rating tidak boleh dianggap mengubah ROC-AUC/PR-AUC karena model metric tersebut tidak dihitung ulang per segment.

---

## 6. Buat measures dan what-if parameter

### 6.1 Buat tabel khusus measure

Di **Modeling > New table**, buat:

```DAX
_Measures = { BLANK() }
```

Hide kolom `Value` yang dibuat otomatis. Pilih tabel `_Measures` sebelum membuat measure agar semua measure tersimpan rapi di satu tempat.

### 6.2 Measure dasar portfolio

Buat measure berikut satu per satu melalui **Modeling > New measure**.

```DAX
Loan Count = DISTINCTCOUNT('Fact Loans'[loan_id])

Total EAD = SUM('Fact Loans'[ead])

Observed Defaults = SUM('Fact Loans'[defaulted])

Observed Default Rate = DIVIDE([Observed Defaults], [Loan Count])

Existing Expected Loss = SUM('Fact Loans'[el])

Average Credit Score = AVERAGE('Fact Loans'[credit_score])

Average Term Risk Score = AVERAGE('Fact Loans'[default_probability])

Test Loans =
CALCULATE([Loan Count], KEEPFILTERS('Fact Loans'[data_split] = "test"))

Test Default Rate =
CALCULATE([Observed Default Rate], KEEPFILTERS('Fact Loans'[data_split] = "test"))

Generated Operating Threshold =
CALCULATE(
    MAX('Fact Loans'[operating_threshold]),
    REMOVEFILTERS('Fact Loans')
)
```

Format yang dipakai:

| Measure | Format |
| --- | --- |
| `Loan Count`, `Observed Defaults`, `Test Loans` | `#,##0` |
| `Total EAD`, `Existing Expected Loss` | `$0.0B` atau `$0M` |
| Default rate, risk score, threshold | `0.0%` atau `0.000` sesuai konteks |
| `Average Credit Score` | `#,##0` |

### 6.3 Buat parameter simulator

Di **Modeling > New parameter > Numeric range**, buat dua parameter berikut. Power BI akan membuat table dan measure value secara otomatis.

| Parameter | Minimum | Maximum | Increment | Default | Add slicer |
| --- | ---: | ---: | ---: | ---: | --- |
| `Decision Threshold` | 0.01 | 0.99 | 0.01 | nilai dari `[Generated Operating Threshold]` pada current run | Ya |
| `Opportunity Cost Rate` | 0.00 | 0.10 | 0.005 | 0.02 | Ya |

Parameter adalah *disconnected table* secara normal; efeknya datang dari DAX. Parameter threshold tidak dapat mengambil default secara live dari measure. Setelah pipeline di-run ulang, cek `[Generated Operating Threshold]`, ubah default parameter jika diperlukan, lalu republish PBIX.

Gunakan nama auto-generated berikut pada formula DAX selanjutnya:

```DAX
[Decision Threshold Value]
[Opportunity Cost Rate Value]
```

Jika nama yang dibuat Power BI berbeda karena Anda menamai parameter secara berbeda, sesuaikan semua referensinya secara konsisten.

### 6.4 Measure model hasil pipeline

```DAX
Selected Model =
CALCULATE(
    SELECTEDVALUE('Fact Model Metrics'[model_name]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[threshold_type] = "operating_recall_constraint"
)

Test ROC-AUC =
VAR ModelName = [Selected Model]
RETURN
CALCULATE(
    MAX('Fact Model Metrics'[roc_auc]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[threshold_type] = "operating_recall_constraint",
    'Fact Model Metrics'[model_name] = ModelName
)

Test PR-AUC =
VAR ModelName = [Selected Model]
RETURN
CALCULATE(
    MAX('Fact Model Metrics'[pr_auc]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[threshold_type] = "operating_recall_constraint",
    'Fact Model Metrics'[model_name] = ModelName
)

Test Brier Score =
VAR ModelName = [Selected Model]
RETURN
CALCULATE(
    MAX('Fact Model Metrics'[brier_score]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[threshold_type] = "operating_recall_constraint",
    'Fact Model Metrics'[model_name] = ModelName
)
```

Jangan ketik nama model atau angka metric secara statis pada visual. Card harus selalu membaca model terpilih dari current pipeline run.

### 6.5 Measure decision simulator yang dinamis

```DAX
Manual Review Loans =
VAR ThresholdValue = [Decision Threshold Value]
RETURN
    CALCULATE(
        [Loan Count],
        KEEPFILTERS('Fact Loans'[data_split] = "test"),
        FILTER('Fact Loans', 'Fact Loans'[default_probability] >= ThresholdValue)
    )

Manual Review Rate = DIVIDE([Manual Review Loans], [Test Loans])

Approval Rate = 1 - [Manual Review Rate]

True Positive =
VAR T = [Decision Threshold Value]
RETURN
COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 1 &&
        'Fact Loans'[default_probability] >= T
    )
)

False Positive =
VAR T = [Decision Threshold Value]
RETURN
COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 0 &&
        'Fact Loans'[default_probability] >= T
    )
)

False Negative =
VAR T = [Decision Threshold Value]
RETURN
COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 1 &&
        'Fact Loans'[default_probability] < T
    )
)

True Negative =
VAR T = [Decision Threshold Value]
RETURN
COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 0 &&
        'Fact Loans'[default_probability] < T
    )
)

Precision = DIVIDE([True Positive], [True Positive] + [False Positive])

Recall = DIVIDE([True Positive], [True Positive] + [False Negative])

Specificity = DIVIDE([True Negative], [True Negative] + [False Positive])

F1 Score = DIVIDE(2 * [Precision] * [Recall], [Precision] + [Recall])
```

Tambahkan ekonomi threshold. Ini adalah **proxy scenario**, bukan loss accounting aktual.

```DAX
Missed Default Loss Exposure =
VAR T = [Decision Threshold Value]
RETURN
SUMX(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 1 &&
        'Fact Loans'[default_probability] < T
    ),
    'Fact Loans'[ead] * 'Fact Loans'[lgd]
)

Rejected Good EAD =
VAR T = [Decision Threshold Value]
RETURN
SUMX(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 0 &&
        'Fact Loans'[default_probability] >= T
    ),
    'Fact Loans'[ead]
)

Dynamic Cost Proxy =
[Missed Default Loss Exposure] +
[Rejected Good EAD] * [Opportunity Cost Rate Value]

Manual Review Queue Flag =
VAR Score = MAX('Fact Loans'[default_probability])
VAR IsTest = SELECTEDVALUE('Fact Loans'[data_split]) = "test"
RETURN
INT(IsTest && Score >= [Decision Threshold Value])
```

### 6.6 Measure stress

```DAX
Stressed Expected Loss = SUM('Fact Stress'[expected_loss_stress])

Base Expected Loss (Stress Table) = SUM('Fact Stress'[expected_loss_base])

Incremental Expected Loss = SUM('Fact Stress'[incremental_expected_loss])

Stress EL Uplift =
DIVIDE([Incremental Expected Loss], [Base Expected Loss (Stress Table)])
```

### 6.7 Helper table untuk confusion matrix dan cost bridge

Buat tiga table melalui **Modeling > New table**. Ketiganya sengaja disconnected.

```DAX
Dim Actual Outcome =
DATATABLE("Actual Outcome", STRING, {{"Default"}, {"Non-default"}})

Dim Review Decision =
DATATABLE("Review Decision", STRING, {{"Manual Review"}, {"Approve"}})

Dim Cost Bridge =
DATATABLE(
    "Cost component", STRING,
    {{"Missed default loss exposure"}, {"Rejected good EAD opportunity cost"}}
)
```

Lalu buat dua measure:

```DAX
Confusion Matrix Count =
VAR ActualOutcome = SELECTEDVALUE('Dim Actual Outcome'[Actual Outcome])
VAR ReviewDecision = SELECTEDVALUE('Dim Review Decision'[Review Decision])
RETURN
SWITCH(
    TRUE(),
    ActualOutcome = "Default" && ReviewDecision = "Manual Review", [True Positive],
    ActualOutcome = "Default" && ReviewDecision = "Approve", [False Negative],
    ActualOutcome = "Non-default" && ReviewDecision = "Manual Review", [False Positive],
    ActualOutcome = "Non-default" && ReviewDecision = "Approve", [True Negative]
)

Cost Bridge Value =
SWITCH(
    SELECTEDVALUE('Dim Cost Bridge'[Cost component]),
    "Missed default loss exposure", [Missed Default Loss Exposure],
    "Rejected good EAD opportunity cost", [Rejected Good EAD] * [Opportunity Cost Rate Value]
)
```

---

## 7. Bangun halaman 1 — Executive Portfolio Overview

**Pertanyaan:** di mana exposure dan observed default risk terkonsentrasi?

Nama halaman: `01 Executive Overview`.

### 7.1 Header dan slicer

- Tambahkan judul **Executive Portfolio Overview** dan subtitle singkat: `Portfolio concentration, observed outcomes, and cohort drift`.
- Tambahkan slicer `Dim Date[Year]`, `Dim Sector[sector]`, `Dim Rating[initial_rating]`, dan `Fact Loans[loan_type]`.
- Gunakan dropdown/compact slicer agar layout tidak penuh.

### 7.2 KPI row

Buat lima **Card (new)** dalam satu baris:

| Title card | Field | Format |
| --- | --- | --- |
| Loan Count | `[Loan Count]` | `#,##0` |
| Total EAD | `[Total EAD]` | `$0.0B` |
| Observed Default Rate | `[Observed Default Rate]` | `0.0%` |
| Existing Expected Loss | `[Existing Expected Loss]` | `$0.0B` |
| Average Credit Score | `[Average Credit Score]` | `#,##0` |

### 7.3 Visual utama

| Visual | Type dan field | Pengaturan penting |
| --- | --- | --- |
| Origination Cohort Default Rate | Line chart; X `Dim Date[Year]`, Y `[Observed Default Rate]`; tooltip `[Loan Count]`, `[Total EAD]` | Judul harus menyebut cohort/origination. Jangan mengklaim perubahan itu kausal. |
| Sector Risk & Exposure | **Bar chart horizontal**; Y `Dim Sector[sector]`, X `[Observed Default Rate]`; tooltip `[Total EAD]`, `[Existing Expected Loss]`, `[Average Credit Score]` | Ini mengikuti mockup: urutkan default rate descending dan letakkan EAD di tooltip. Jika ingin analisis alternatif, gunakan scatter X `[Observed Default Rate]`, Y `[Total EAD]`, Size `[Loan Count]`. |
| Rating Risk Ladder | Clustered column chart; X `Dim Rating[initial_rating]`, Y `[Observed Default Rate]`; tooltip `[Loan Count]`, `[Total EAD]` | Warna bertingkat dari teal untuk AAA ke red untuk CCC; pastikan urutan memakai `rating_sort`. |

Mockup menampilkan panel “Executive Findings”. Untuk PBIX portfolio final, jangan mengisi kanvas dengan narasi panjang atau angka statis. Gunakan **Info button + report-page tooltip** berisi definisi default, scope, dan caveat singkat. Hal ini membuat visual tetap fokus pada data.

---

## 8. Bangun halaman 2 — Model Performance & Risk Segmentation

**Pertanyaan:** apakah selected model dapat meranking unseen loans secara baik, dan di mana error operasionalnya?

Nama halaman: `02 Model Performance`.

Untuk visual yang memakai `Fact Loans`, set page/visual filter `Fact Loans[data_split] = test`. Jangan mencoba memfilter `Fact Model Metrics` lewat relationship karena memang disconnected.

### 8.1 KPI row

| Title card | Field | Format |
| --- | --- | --- |
| Selected Model | `[Selected Model]` | Text |
| Test ROC-AUC | `[Test ROC-AUC]` | `0.000` |
| Test PR-AUC | `[Test PR-AUC]` | `0.000` |
| Brier Score | `[Test Brier Score]` | `0.000` |
| Test Default Rate | `[Test Default Rate]` | `0.0%` |

### 8.2 Visual dan field wells

| Visual | Type dan field | Visual filter / format |
| --- | --- | --- |
| Risk Decile Lift | Clustered column; X `Fact Loans[risk_decile]`, Y `[Observed Default Rate]`; tooltip `[Loan Count]`, `[Total EAD]` | Filter `data_split = test`; gunakan colour scale sesuai arti `risk_decile`, bukan rainbow. |
| Model Comparison | Clustered bar; Y `Fact Model Metrics[model_name]`, X `MAX(pr_auc)`; legend `split`; tooltip `MAX(roc_auc)`, `MAX(brier_score)` | Filter `threshold_type = standard_0.50` untuk membandingkan kandidat dengan basis yang konsisten. Tampilkan Logistic Regression, Calibrated Random Forest, dan XGBoost. |
| Confusion Matrix | Matrix; rows `Dim Actual Outcome[Actual Outcome]`, columns `Dim Review Decision[Review Decision]`, values `[Confusion Matrix Count]` | Conditional format: TP/TN teal, FP amber, FN red. Nilai berubah mengikuti threshold di Page 3 jika parameter disinkronkan. |
| Permutation Feature Importance | Bar chart horizontal; Y `Feature Importance[feature]`, X `SUM(importance_mean)`; tooltip `SUM(importance_std)` | Sort descending. Ini predictive association, bukan causal importance. |
| Performance by Temporal Split | Line/clustered column; X `Fact Model Metrics[split]`, Y `MAX(pr_auc)`; legend `model_name` | Filter `threshold_type = standard_0.50`; hanya validation dan test. |

Tidak ada model result yang boleh ditulis sebagai angka hardcoded. Jika card kosong, periksa `split = test` dan `threshold_type = operating_recall_constraint` pada dataset hasil pipeline.

Tambahkan tooltip info pendek: test prevalence dapat berbeda dari train prevalence; threshold high-recall menghasilkan false positive; fairness audit belum lengkap karena tidak ada protected-class data.

---

## 9. Bangun halaman 3 — Underwriting Decision Simulator

**Pertanyaan:** bagaimana workload manual review dan trade-off missed-default berubah ketika threshold digeser?

Nama halaman: `03 Underwriting Simulator`.

### 9.1 Control strip

Letakkan slicer berikut di bagian atas dan beri label **User-controlled scenario assumption**.

| Control | Field |
| --- | --- |
| Decision Threshold | `Decision Threshold[Decision Threshold]` |
| Opportunity Cost Assumption | `Opportunity Cost Rate[Opportunity Cost Rate]` |

Tambahkan card kecil `[Generated Operating Threshold]` di mode authoring untuk memastikan default parameter sama dengan pipeline. Anda dapat menyembunyikan card tersebut pada versi presentasi setelah sudah diverifikasi.

### 9.2 KPI row

| Title card | Field |
| --- | --- |
| Precision | `[Precision]` |
| Recall | `[Recall]` |
| Approval Rate | `[Approval Rate]` |
| Manual Review Loans | `[Manual Review Loans]` |
| Dynamic Cost Proxy | `[Dynamic Cost Proxy]` |

Gunakan `0.0%` untuk metric/rate, `#,##0` untuk jumlah loans, dan `$0.0B` atau `$0M` untuk proxy biaya.

### 9.3 Visual utama

| Visual | Type dan field | Pengaturan penting |
| --- | --- | --- |
| Threshold Trade-off | Line chart; X `Fact Thresholds[threshold]`; Y `MAX(precision)`, `MAX(recall)`, `MAX(approval_rate)` | Tambahkan `MAX(f1)`, `MAX(false_positive)`, `MAX(false_negative)`, dan `MAX(total_cost_proxy)` ke tooltip. Ini adalah tabel simulator dari selected model dan test split. |
| Dynamic Confusion Matrix | Matrix menggunakan helper tables dari §6.7; values `[Confusion Matrix Count]` | Ikat ke parameter; jangan mengambil static TP/FP/FN/TN dari satu threshold row. |
| Cost Bridge | Waterfall; category `Dim Cost Bridge[Cost component]`; Y `[Cost Bridge Value]` | Tambahkan `[Dynamic Cost Proxy]` sebagai tooltip. |
| Prioritized Manual Review Queue | Table: `loan_id`, `sector`, `initial_rating`, `credit_score`, `ead`, `default_probability`, `risk_band`, `term_risk_loss_proxy` | Set visual-level filter `[Manual Review Queue Flag] = 1`; sort `term_risk_loss_proxy` descending. Jangan tampilkan `defaulted` sebagai informasi yang tersedia saat triage. |

Interpretasi yang benar: parameter menghasilkan simulasi **test-set review workload**. Gunakan operating threshold hasil validation sebagai titik awal manual review, lalu validasi kapasitas analyst, calibration, dan realized costs sebelum kebijakan digunakan.

---

## 10. Bangun halaman 4 — Portfolio Resilience

**Pertanyaan:** apa dampak scenario stress, perilaku vintage, dan perubahan rating portfolio?

Nama halaman: `04 Portfolio Resilience`.

### 10.1 Slicer dan KPI

- Tambahkan slicer `Fact Stress[scenario]`; set default **Severe**.
- Buat card `[Stressed Expected Loss]`, `[Incremental Expected Loss]`, dan `[Stress EL Uplift]`.
- Optional: tambah card dengan `Fact Stress[scenario]` untuk memperjelas scenario yang sedang dipilih.

### 10.2 Visual dan field wells

| Visual | Type dan field | Pengaturan penting |
| --- | --- | --- |
| Stress Impact by Sector | Clustered bar; Y `Dim Sector[sector]`, X `[Incremental Expected Loss]`; tooltip `stressed_pd`, `stressed_lgd`, `total_ead`, `expected_loss_stress` | Slicer scenario harus berinteraksi dengan visual ini. Sort descending. |
| Vintage Curves | Line chart; X `Fact Vintage[months_on_books]`, Y `AVERAGE(cumulative_default_rate)`, legend `Fact Vintage[vintage]` | Batasi vintage yang ditampilkan (misalnya empat cohort) agar tidak menjadi spaghetti chart. |
| Rating Downgrade Rate | Line chart; X `Fact Migration[year]`, Y `AVERAGE(downgrade_rate)`, legend `Fact Migration[sector]` | Jika terlalu ramai, gunakan small multiples atau slicer sector. |
| Monthly Macro Context | Line and clustered column chart; X `Dim Date[Date]`, column `SUM(Fact Monthly Portfolio[new_defaults])`, line `AVERAGE(Fact Monthly Portfolio[unemployment])` | Ini konteks deskriptif. Jangan mengklaim macro variable menyebabkan default. |

Data reference dari pipeline yang sama dapat dipakai untuk QA: Severe stress expected loss sekitar `$3.894B` dan incremental EL sekitar `$1.970B`; COVID-like adalah largest supplied stress sekitar `$5.122B`. Tampilkan angka yang sebenarnya berasal dari run Anda, bukan nilai ini yang diketik manual.

Jangan menyembunyikan caveat bahwa supplied `baseline` dapat memiliki stressed EL di bawah `expected_loss_base` akibat asumsi LGD sector pada scenario table. Letakkan catatan singkat di info tooltip, bukan panel naratif besar.

---

## 11. Navigation, tooltip, interaction, dan accessibility

### 11.1 Navigation

1. Pilih **Insert > Buttons > Navigator > Page navigator**.
2. Posisikan vertikal di kiri, lalu format sebagai navy navigation rail.
3. Rename pages dalam urutan yang jelas: Overview, Model, Decision, Resilience.
4. Jangan membuat button manual satu per satu kecuali ada kebutuhan desain yang benar-benar spesifik; Page Navigator akan tetap sinkron saat nama halaman berubah.

### 11.2 Sync slicer

Di **View > Sync slicers**:

- Sync `Year`, `Sector`, dan `Initial Rating` di Pages 1–3 jika ingin exploratory flow yang konsisten.
- Sync `Decision Threshold` di Pages 2–3 bila ingin confusion matrix di Page 2 selalu mengikuti simulasi Page 3; slicer dapat disembunyikan di Page 2.
- Jangan sync `Decision Threshold` ke Page 1 atau Page 4. Threshold hanya untuk simulator dan dynamic decision measures.
- Pastikan Page 2 tidak memberi kesan metric model di-filter per sector/rating apabila metric card tetap global current-run metric.

### 11.3 Tooltip dan drill-through

- Buat report-page tooltip `Sector Tooltip` dengan EAD, observed default rate, average credit score, dan stress impact.
- Buat drill-through `Loan Detail` menggunakan `loan_id`; tampilkan application attributes, risk score, risk band, dan underwriting action.
- Jangan menampilkan target `defaulted` dalam detail yang diposisikan sebagai pre-decision underwriting view.

### 11.4 Reset filters

Pada masing-masing halaman:

1. Atur tampilan default dan slicer default.
2. Pilih **View > Bookmarks > Add**, beri nama `Reset filters`.
3. Tambahkan button dan set **Action = Bookmark > Reset filters**.
4. Test dari kondisi slicer yang berubah.

### 11.5 Accessibility dan performance

- Isi **Alt text** pada setiap visual yang bermakna.
- Atur **View > Selection** dan tab order secara logis: navigation, slicer, KPI, chart, table.
- Gunakan title yang menjawab pertanyaan, bukan title generik seperti “Chart 1”.
- Buka **View > Performance analyzer**, mulai recording, interaksikan report, dan rapikan visual yang lambat.

---

## 12. QA dan rekonsiliasi sebelum screenshot/publish

Lakukan checklist ini sebelum menyimpan final PBIX.

### Data dan model

- [ ] Delapan analytical table sudah ter-load; `tblManifest` tidak dipakai sebagai fact.
- [ ] Tidak ada relationship fact-to-fact atau bidirectional relationship yang tidak diperlukan.
- [ ] `Fact Loans` memiliki 50,000 row dan 50,000 unique `loan_id`.
- [ ] Test loan count adalah 11,077.
- [ ] Tidak ada blank pada `default_probability`, `risk_band`, `underwriting_action`, atau `term_risk_loss_proxy`.
- [ ] Score berada di rentang 0–1.

### Halaman dashboard

- [ ] Page 1: Loan Count, EAD, default rate, EL, dan credit score merekonsiliasi ke workbook.
- [ ] Page 2: selected model, ROC-AUC, PR-AUC, dan Brier berasal dari `Fact Model Metrics`, bukan angka statis.
- [ ] Page 3: pada default operating threshold, dynamic confusion matrix sama dengan row yang relevan di `Fact Thresholds`.
- [ ] Page 3: menggeser threshold mengubah precision, recall, approval rate, review queue, dan dynamic cost proxy.
- [ ] Page 4: Severe stress total sama dengan hasil `Fact Stress` untuk scenario Severe.
- [ ] Slicer tidak memfilter visual yang seharusnya disconnected secara menyesatkan.

### Design dan narasi

- [ ] Konsisten dengan `credit_risk_theme.json` dan mockup.
- [ ] Tidak ada mockup placeholder, `—`, atau “from pipeline” yang tersisa pada final.
- [ ] Tidak ada paragraph panjang sebagai pengganti visualisasi.
- [ ] Setiap caveat ditempatkan dalam info tooltip atau subtitle ringkas.
- [ ] Screenshot dibuat setelah data benar-benar muncul.

---

## 13. Simpan, screenshot, dan publish

1. Save PBIX di:

   ```text
   dashboard/credit_risk_dashboard.pbix
   ```

2. Capture empat halaman dan simpan, misalnya:

   ```text
   dashboard/screenshots/01_executive_overview.png
   dashboard/screenshots/02_model_performance.png
   dashboard/screenshots/03_underwriting_simulator.png
   dashboard/screenshots/04_portfolio_resilience.png
   ```

3. Buka kembali PBIX, refresh data, dan pastikan tidak ada error credential atau query.
4. Jika akan publish, lakukan hanya setelah checklist QA lulus. Setelah publish, atur data refresh sesuai lokasi workbook dan akses PostgreSQL yang benar.
5. Commit PBIX/screenshot hanya setelah memeriksa ukuran file dan memastikan `.env`, raw data, cache, serta credential tetap tidak terlacak.

---

## 14. Troubleshooting cepat

| Gejala | Penyebab paling mungkin | Perbaikan |
| --- | --- | --- |
| Table tidak muncul di Navigator | Memilih sheet, bukan Excel table, atau pipeline belum PASS | Jalankan pipeline lagi; pilih item `tblFact_*` dan `tblFeature_Importance`. |
| Banyak visual kosong | Query belum di-rename atau tipe data salah | Cocokkan nama query dengan §4 dan cek type Date/Decimal/Text. |
| Model card kosong | Filter DAX tidak menemukan selected model/test row | Cek `split = test` dan `threshold_type = operating_recall_constraint` di `Fact Model Metrics`. |
| Angka EAD/default rate dobel | Relationship fact-to-fact atau bidirectional | Hapus relationship salah; kembali ke model pada §5.2. |
| Threshold slicer tidak mengubah KPI | Measure masih memakai kolom threshold statis | Pastikan memakai `[Decision Threshold Value]`, bukan `Fact Thresholds[threshold]`, dalam dynamic measure. |
| Review queue salah jumlah | Tidak ada visual filter atau `data_split` tidak dibatasi | Terapkan `[Manual Review Queue Flag] = 1`; measure sudah membatasi test split. |
| Page 4 scenario tidak berubah | Slicer tidak berinteraksi atau measure memakai tabel lain | Check **Format > Edit interactions** dan gunakan `Fact Stress[scenario]`. |
| Rating tidak berurutan | Sort-by-column belum dibuat | Sort `initial_rating` dengan `rating_sort`. |
| Visual lambat | Terlalu banyak detail/relationship atau visual custom | Cek Performance Analyzer, batasi field/tooltips, dan gunakan visual native bila cukup. |

---

## 15. Referensi implementation

Dokumen Microsoft berikut dipakai untuk menu dan perilaku Power BI yang bisa berubah antarrilis:

- [Connect to an Excel workbook from Power Query](https://learn.microsoft.com/en-us/power-query/connectors/excel)
- [Create and use What-if parameters](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-what-if)
- [Understand model relationships in Power BI Desktop](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-relationships-understand)
- [Use report themes in Power BI](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes)
- [Create Page and Bookmark Navigators](https://learn.microsoft.com/en-us/power-bi/create-reports/button-navigators)
- [Create accessible Power BI reports](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-creating-tools)

Untuk versi yang lebih ringkas sebagai spesifikasi teknis, lihat juga [`POWER_BI_DASHBOARD_BLUEPRINT.md`](POWER_BI_DASHBOARD_BLUEPRINT.md). Panduan ini adalah urutan implementasi praktisnya.
