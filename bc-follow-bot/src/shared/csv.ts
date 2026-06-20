import { readFileSync } from "node:fs";

export interface ReadCsvRowsOptions {
  requiredHeaders: readonly string[];
  emptyMessage: string;
  noDataMessage: string;
  missingHeadersMessage: (missingHeaders: string[]) => string;
}

function parseCsvRecords(rawText: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let current = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  function pushField(): void {
    record.push(fieldWasQuoted ? current : current.trim());
    current = "";
    fieldWasQuoted = false;
  }

  function pushRecord(): void {
    pushField();

    if (record.some((field) => field.trim().length > 0)) {
      records.push(record);
    }

    record = [];
  }

  const text = rawText.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      fieldWasQuoted = true;
      continue;
    }

    if (character === "," && !inQuotes) {
      pushField();
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      pushRecord();
      continue;
    }

    current += character;
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted field.");
  }

  if (current.length > 0 || record.length > 0 || fieldWasQuoted) {
    pushRecord();
  }

  return records;
}

export function readCsvRowsFromFile(
  filePath: string,
  options: ReadCsvRowsOptions
): Record<string, string>[] {
  const records = parseCsvRecords(readFileSync(filePath, "utf-8"));

  if (records.length === 0) {
    throw new Error(options.emptyMessage);
  }

  if (records.length < 2) {
    throw new Error(options.noDataMessage);
  }

  const headers = records[0].map((header) => header.trim());
  const missingHeaders = options.requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(options.missingHeadersMessage(missingHeaders));
  }

  return records.slice(1).map((values) => {
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

export function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}
