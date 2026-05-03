import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParseResult {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  fileType: string;
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Filters out non-object rows and replaces undefined values with null
 * so downstream consumers always deal with a consistent shape.
 */
function sanitizeRows(raw: unknown[]): Record<string, unknown>[] {
  return raw
    .filter(
      (row): row is Record<string, unknown> =>
        row !== null &&
        typeof row === "object" &&
        !Array.isArray(row)
    )
    .map((row) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        clean[k] = v === undefined ? null : v;
      }
      return clean;
    });
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      encoding: "UTF-8",
      complete(result) {
        const rows = sanitizeRows(result.data as unknown[]);

        // meta.fields is the definitive ordered header list from PapaParse
        const columns = (result.meta.fields ?? Object.keys(rows[0] ?? {})).filter(
          (f) => f.trim() !== ""
        );

        resolve({ rows, columns, rowCount: rows.length, fileType: "csv" });
      },
      error(err) {
        reject(new Error(`CSV parsing failed: ${err.message}`));
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Excel (.xlsx / .xls)
// ---------------------------------------------------------------------------

async function parseExcel(file: File): Promise<ParseResult> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error("Could not read the Excel file from disk.");
  }

  let workbook: XLSX.WorkBook;
  try {
    // cellDates: true → date serial numbers become JS Date objects
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new Error(
      "Excel file is corrupted or in an unrecognised format. " +
        "Please save it as .xlsx and try again."
    );
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error("Excel file contains no sheets.");
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  // Extract column names from the literal first row so empty trailing
  // columns and non-string headers are handled cleanly.
  const firstRowRaw = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
  })[0];

  const columns = (firstRowRaw ?? [])
    .map((cell) => String(cell).trim())
    .filter((c) => c !== "");

  if (columns.length === 0) {
    return { rows: [], columns: [], rowCount: 0, fileType: "xlsx" };
  }

  // defval: null fills missing cells consistently
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
  });

  const rows = sanitizeRows(rawRows);
  const fileType = file.name.toLowerCase().endsWith(".xls") ? "xls" : "xlsx";

  return { rows, columns, rowCount: rows.length, fileType };
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

async function parseJSON(file: File): Promise<ParseResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error(
      "Failed to read the JSON file. It may be corrupted or use an unsupported encoding."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "malformed content";
    throw new Error(`Invalid JSON — ${detail}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "JSON file must contain a top-level array of objects, e.g. [{…}, {…}]."
    );
  }

  const rows = sanitizeRows(parsed);

  // Union all keys so sparse rows don't silently lose columns
  const columnSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }

  const columns = Array.from(columnSet);
  return { rows, columns, rowCount: rows.length, fileType: "json" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFile(file: File): Promise<ParseResult> {
  if (!file || file.size === 0) {
    throw new Error("The file is empty.");
  }

  const ext = getExtension(file.name);

  switch (ext) {
    case "csv":
      return parseCSV(file);
    case "xlsx":
    case "xls":
      return parseExcel(file);
    case "json":
      return parseJSON(file);
    default:
      throw new Error(
        `Unsupported file type ".${ext || "unknown"}". ` +
          "Accepted formats: .csv, .xlsx, .xls, .json"
      );
  }
}
