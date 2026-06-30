import { statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
// Split accumulated text into complete lines (CRLF-safe); returns leftover.
export function extractLines(buffer) {
  const lines = []; let buf = buffer; let idx;
  while ((idx = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, idx).replace(/\r$/, '')); buf = buf.slice(idx + 1); }
  return { lines, rest: buf };
}
// Poll a file and emit appended lines. Handles rotation (shrink/replace -> reset).
export function tailFile(path, onLine, { fromStart = false, pollMs = 500 } = {}) {
  let pos = 0; let buf = ''; let stopped = false;
  if (existsSync(path) && !fromStart) { try { pos = statSync(path).size; } catch {} }
  function readNew() {
    if (stopped || !existsSync(path)) return;
    let size; try { size = statSync(path).size; } catch { return; }
    if (size < pos) { pos = 0; buf = ''; }
    if (size <= pos) return;
    const fd = openSync(path, 'r'); const len = size - pos; const b = Buffer.alloc(len);
    try { readSync(fd, b, 0, len, pos); } finally { closeSync(fd); }
    pos = size; const r = extractLines(buf + b.toString('utf8')); buf = r.rest;
    for (const line of r.lines) onLine(line);
  }
  readNew();
  const timer = setInterval(readNew, pollMs);
  return () => { stopped = true; clearInterval(timer); };
}
