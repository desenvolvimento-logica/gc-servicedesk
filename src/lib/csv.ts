/**
 * CSV for Excel in Brazilian Portuguese: ";" separator (comma is the decimal
 * separator there), CRLF line breaks and a UTF-8 BOM so accents survive.
 */

export const CSV_SEPARATOR = ";";
const BOM = "﻿";

/** Cells starting with these are run as formulas by spreadsheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return BOM + rows.map((row) => row.map(escapeCsvCell).join(CSV_SEPARATOR)).join("\r\n") + "\r\n";
}
