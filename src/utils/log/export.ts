import JSZip from "jszip";

import type { LogEntry } from "@/rpc/types";
import { VERSION } from "@/shared/consts";
import { getLogEntries } from "@/utils/log/backend";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function canUseObjectUrl(): boolean {
  return typeof URL.createObjectURL === "function";
}

function buildDataUrl(bytes: Uint8Array): string {
  return `data:application/zip;base64,${bytesToBase64(bytes)}`;
}

async function downloadZip(zip: JSZip, filename: string): Promise<void> {
  if (canUseObjectUrl()) {
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);

    try {
      await browser.downloads.download({ url, filename, saveAs: true });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    return;
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  await browser.downloads.download({
    url: buildDataUrl(zipBytes),
    filename,
    saveAs: true,
  });
}

function formatTextLog(entry: LogEntry): string {
  return [
    `[${entry.isoTime}] [${entry.level.toUpperCase()}] [${entry.context}] ${entry.text}`,
    `version: ${entry.version}`,
    `args: ${JSON.stringify(entry.args)}`,
  ].join("\n");
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatFilenameTime(timestamp: number): string {
  const time = new Date(timestamp + 8 * 60 * 60 * 1000);
  return `${pad2(time.getUTCMonth() + 1)}${pad2(time.getUTCDate())}${pad2(time.getUTCHours())}${pad2(time.getUTCMinutes())}`;
}

function buildZipName(entries: LogEntry[]): string {
  const startTimestamp = entries[0]?.timestamp ?? Date.now();
  return `addon-${VERSION}-log-${formatFilenameTime(startTimestamp)}.zip`;
}

export async function exportLogs(): Promise<{
  count: number;
  filename: string;
}> {
  const entries = await getLogEntries();
  const zip = new JSZip();

  const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const text =
    entries.length > 0
      ? entries.map(formatTextLog).join("\n\n---\n\n")
      : "No logs found for selected range.\n";

  zip.file("logs.jsonl", jsonl + (jsonl ? "\n" : ""));
  zip.file("logs.txt", text);
  zip.file(
    "metadata.json",
    JSON.stringify(
      {
        version: VERSION,
        range: "all",
        exportedAt: new Date().toISOString(),
        count: entries.length,
        startTimestamp: entries[0]?.timestamp ?? null,
        endTimestamp: entries.at(-1)?.timestamp ?? null,
      },
      null,
      2,
    ),
  );

  const filename = buildZipName(entries);
  await downloadZip(zip, filename);

  return { count: entries.length, filename };
}
