/**
 * CSV export for C.A.S.P.E.R.-2 flight log data.
 *
 * Uses Electron's dialog API to let the user choose save locations and
 * Node's fs to write CSV files.  Column definitions match the Python
 * reference decoder exactly.
 *
 * @module readout/csv_export
 */

import { dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { HrEntry, LrEntry, SummaryEntry, ReadoutResult } from './readout_types';
import {
  HR_CSV_COLUMNS, LR_CSV_COLUMNS, SUMMARY_CSV_COLUMNS
} from './readout_types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format current date/time as YYYYMMDD_HHmmss for default filenames. */
function date_stamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

/**
 * Convert an array of entry objects to a CSV string.
 *
 * @param entries  - Array of record-like objects.
 * @param columns  - Ordered list of column names to extract.
 * @returns Complete CSV string with header row and data rows.
 */
function entries_to_csv(entries: Record<string, unknown>[], columns: readonly string[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(columns.join(','));

  // Data rows
  for (const entry of entries) {
    const values = columns.map((col) => {
      const val = entry[col];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (Array.isArray(val)) return JSON.stringify(val);
      return String(val);
    });
    lines.push(values.join(','));
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Individual export functions
// ---------------------------------------------------------------------------

/**
 * Export high-rate entries as a CSV file.
 *
 * Shows a save dialog and writes the file if the user picks a path.
 *
 * @returns true if the file was saved, false if the user cancelled.
 */
export async function export_hr_csv(entries: HrEntry[], window: BrowserWindow): Promise<boolean> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Export HR Flight Log',
    defaultPath: `casper_hr_${date_stamp()}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) return false;

  const csv = entries_to_csv(entries as unknown as Record<string, unknown>[], HR_CSV_COLUMNS);
  writeFileSync(result.filePath, csv, 'utf-8');
  return true;
}

/**
 * Export low-rate entries as a CSV file.
 *
 * @returns true if the file was saved, false if the user cancelled.
 */
export async function export_lr_csv(entries: LrEntry[], window: BrowserWindow): Promise<boolean> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Export LR Flight Log',
    defaultPath: `casper_lr_${date_stamp()}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) return false;

  const csv = entries_to_csv(entries as unknown as Record<string, unknown>[], LR_CSV_COLUMNS);
  writeFileSync(result.filePath, csv, 'utf-8');
  return true;
}

/**
 * Export summary entries as a CSV file.
 *
 * @returns true if the file was saved, false if the user cancelled.
 */
export async function export_summary_csv(entries: SummaryEntry[], window: BrowserWindow): Promise<boolean> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Export Summary Log',
    defaultPath: `casper_summary_${date_stamp()}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) return false;

  const csv = entries_to_csv(entries as unknown as Record<string, unknown>[], SUMMARY_CSV_COLUMNS);
  writeFileSync(result.filePath, csv, 'utf-8');
  return true;
}

// ---------------------------------------------------------------------------
// Export all
// ---------------------------------------------------------------------------

/**
 * Export all flight log data (HR, LR, summary) into a user-chosen directory.
 *
 * Shows a directory picker dialog and writes `hr.csv`, `lr.csv`, and
 * `summary.csv` into the chosen directory.
 *
 * @returns true if files were saved, false if the user cancelled.
 */
export async function export_all_csv(result: ReadoutResult, window: BrowserWindow): Promise<boolean> {
  const dir_result = await dialog.showOpenDialog(window, {
    title: 'Choose Export Directory',
    properties: ['openDirectory', 'createDirectory']
  });

  if (dir_result.canceled || dir_result.filePaths.length === 0) return false;

  const dir = dir_result.filePaths[0];

  const hr_csv = entries_to_csv(
    result.hr_entries as unknown as Record<string, unknown>[],
    HR_CSV_COLUMNS
  );
  writeFileSync(join(dir, 'hr.csv'), hr_csv, 'utf-8');

  const lr_csv = entries_to_csv(
    result.lr_entries as unknown as Record<string, unknown>[],
    LR_CSV_COLUMNS
  );
  writeFileSync(join(dir, 'lr.csv'), lr_csv, 'utf-8');

  const summary_csv = entries_to_csv(
    result.summary_entries as unknown as Record<string, unknown>[],
    SUMMARY_CSV_COLUMNS
  );
  writeFileSync(join(dir, 'summary.csv'), summary_csv, 'utf-8');

  return true;
}
