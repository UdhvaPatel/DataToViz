# DataToViz 🚀

> Upload any dataset. Describe what you want to understand. Get a fully interactive AI-powered dashboard — in seconds.

![DataToViz Banner](https://img.shields.io/badge/DataToViz-AI%20Powered-6366f1?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js%2015-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge)

---

## What is DataToViz?

DataToViz is a no-code AI analytics platform that transforms raw datasets into interactive dashboards through a fully automated pipeline. Upload a CSV, Excel, or JSON file, type what you want to understand in plain English, and the AI handles everything — data profiling, cleaning, feature engineering, exploratory data analysis, and dashboard generation.

No Python. No SQL. No configuration. Just upload and go.

---

## The Story Behind It

This project started during an Applied Machine Learning course where we helped a supply chain organization predict late deliveries using supervised learning and identify high-value customers using unsupervised learning.

Somewhere between cleaning CSVs at 2AM and debugging pipelines, one thought hit: *"What if a tool could just read your file, clean it automatically, and make it analysis-ready?"*

One conversation with Claude later — DataToViz was born.

---

## Live Demo

🔗 **[Try DataToViz](your-deployment-url-here)**

---

## Features

### Automated Data Pipeline
- **Statistical Profiling** — Automatically detects column types, null percentages, skewness, outliers, and dataset type (time-series, behavioral, transactional, survey)
- **Smart Sampling** — Uses reservoir sampling for large datasets to ensure statistically representative LLM context
- **AI-Powered Cleaning** — Handles missing values, duplicates, outliers, standardization, and type coercion via Groq LLM
- **Prompt Understanding** — Extracts intent, entities, and target from plain English descriptions
- **Feature Engineering** — Automatically derives new columns (transformations, aggregations, encodings, decompositions, derived scores) that improve visualization quality
- **Exploratory Data Analysis** — Runs correlation matrix, distribution analysis, temporal trends, and composition analysis locally
- **Dashboard Blueprint** — AI selects the optimal chart types for your specific data and prompt

### Interactive Dashboard
- **Cross-filtering** — Click any chart element to filter all other charts simultaneously with animation
- **Chart Management** — Hide, delete, or change chart types directly from the dashboard
- **Alternative Chart Types** — Switch any chart to a compatible alternative (e.g. Bar → Line → Pie) with one click
- **Filter Panel** — Range sliders for numeric columns, multi-select for categorical columns, date pickers for datetime columns
- **Data Summary Drawer** — Full transparency on what was cleaned, what features were engineered, and why
- **Export** — Download the cleaned dataset as CSV at any time

### User Accounts & History
- **Authentication** — Email/password and Google OAuth via Supabase Auth
- **Session Storage** — Every dashboard is saved and fully restorable without re-running the pipeline
- **Chart Usage Analytics** — Tracks which chart types each user generates over time
- **Personal Stats** — Total dashboards built, favorite chart type, last active date

### Performance (Large Dataset Support)
- **Web Workers** — Heavy processing runs off the main thread to prevent browser freezes
- **Chunked Profiling** — Datasets profiled in 2000-row chunks with event loop yielding
- **LTTB Downsampling** — Line charts downsampled using Largest-Triangle-Three-Buckets algorithm to preserve shape while reducing points
- **Streaming CSV Parse** — Large CSV files parsed using Papaparse streaming mode
- **Virtualized Storage** — Only vizReadyRows stored in Supabase, never raw uploaded data (protects user PII)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI Components | Shadcn/ui |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Charts | Recharts |
| LLM / AI | Groq API — Llama 3.3 70B Versatile |
| Auth & Database | Supabase (PostgreSQL + RLS) |
| State Management | Zustand |
| CSV Parsing | Papaparse |
| Excel Parsing | SheetJS (xlsx) |
| Language | TypeScript |

---

## How the Pipeline Works

```
User Upload + Prompt
        ↓
Local Statistical Profiling       (free, instant, no API)
        ↓
Smart Sampling Strategy           (reservoir sampling for large files)
        ↓
LLM Call 1 — Understand Data      (Groq: column roles + cleaning plan)
        ↓
Local Cleaning on Full Dataset    (impute, dedupe, standardize, outliers)
        ↓
Validation Profile Diff           (compare before/after distributions)
        ↓
LLM Call 2 — Understand Prompt    (Groq: intent + entities + target)
        ↓
LLM Call 3 — Feature Engineering  (Groq: column selection + derived features)
        ↓
Local EDA + Relationship Mapping  (correlation, trends, composition)
        ↓
LLM Call 4 — Dashboard Blueprint  (Groq: chart types + layout + narratives)
        ↓
User Selects Charts               (choose 1–6, swap types, see alternatives)
        ↓
Render Interactive Dashboard
        ↓
Auto-save to Supabase
```

Only 4 LLM API calls total. All heavy computation runs locally.

---

## Supported File Formats

| Format | Extension | Max Recommended Size |
|---|---|---|
| CSV | `.csv` | 50MB (streaming) |
| Excel | `.xlsx`, `.xls` | 20MB |
| JSON | `.json` | 20MB |

For datasets over 10,000 rows, processing runs in a Web Worker to keep the UI responsive.

---

## Supported Chart Types

| Chart | Best For |
|---|---|
| Bar Chart | Comparing values across categories |
| Line Chart | Trends and changes over time |
| Scatter Plot | Correlation between two numeric values |
| Pie Chart | Part-to-whole composition |
| Donut Chart | Part-to-whole with center label |
| Histogram | Distribution of a single numeric column |
| Heatmap | Density across two dimensions |
| Bubble Chart | Three-variable relationships |
| Funnel Chart | Sequential drop-off or staged data |

---



## Project Structure

```
/app
  /               → Landing page
  /auth           → Sign in / Sign up
  /auth/callback  → OAuth callback handler
  /upload         → File upload + prompt input
  /processing     → Live pipeline progress + chart selection
  /dashboard      → Final interactive dashboard
  /history        → Saved sessions

/components
  /dashboard      → All chart components + ChartWrapper + FilterPanel
  /layout         → Navbar

/lib
  /data           → Full pipeline: profiler, sampler, cleaner, EDA,
                    all LLM calls, pipeline orchestrator
  /supabase       → Browser + server clients, auth helpers, sessions
  /store          → Zustand store (pipeline + user state)
  /viz            → Chart compatibility map, color palette,
                    downsampling, axis utils
  /workers        → Web Worker for off-thread processing

/types            → Shared TypeScript interfaces
```

---



## Privacy

DataToViz never stores your raw uploaded file. Only the cleaned, filtered, visualization-ready subset of your data is saved to Supabase. This protects any PII that may exist in the original dataset.

---

## Roadmap

- [ ] PDF export of dashboard
- [ ] Share dashboard via public link
- [ ] Re-run pipeline with different prompt on same dataset
- [ ] Multi-dataset merge and comparison
- [ ] Personal insights page (trends across all your sessions)
- [ ] Custom chart color themes
- [ ] Natural language chart annotations

---



## Acknowledgments

Built in 5 days with the help of Claude (Anthropic) as an AI pair programmer.
Powered by Groq's blazing fast LLM inference.
Inspired by a real ML project helping supply chain organizations make smarter decisions with their data.

---

<p align="center">
  Built with 🤖 + ☕ by <a href="https://github.com/UdhvaPatel">Udhva Patel</a>
</p>

<p align="center">
  <a href="your-deployment-url">Live Demo</a> ·
  <a href="https://github.com/UdhvaPatel/datatoviz/issues">Report Bug</a> ·
  <a href="https://github.com/UdhvaPatel/datatoviz/issues">Request Feature</a>
</p>
