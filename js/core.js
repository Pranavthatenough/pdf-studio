/* PDF Studio — core: state, document load/save, rendering, overlay, drawing engine, history.
   Everything runs locally: pdf-lib edits the file, pdf.js draws it. No network requests. */
"use strict";
const { PDFDocument, StandardFonts, rgb, degrees, BlendMode, LineCapStyle,
        pushGraphicsState, popGraphicsState, concatTransformationMatrix, PDFName } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; // the worker script is also loaded in the page, so pdf.js runs fully offline even from file://

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S = {
  name: "", doc: null, pdf: null, bytes: null, originalBytes: null,
  cur: 0, sel: new Set(), anchor: 0, zoom: null, scale: 1,
  group: "organise", tool: "reorder",
  pending: {}, selObj: null, hist: [], fut: [], dirty: false, ver: 0,
  view: { W: 612, H: 792 }, renderTask: null, cropRect: null,
};

/* ---------- small UI helpers ---------- */
function fmtBytes(n) {
  if (n == null) return "–";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}
function toast(msg, err) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), err ? 5200 : 3200);
}
let busyDepth = 0;
function busy(text) { busyDepth++; $("#busyText").textContent = text || "Working…"; $("#busy").hidden = false; return sleep(20); }
function busyText(text) { $("#busyText").textContent = text; }
function done() { busyDepth = Math.max(0, busyDepth - 1); if (!busyDepth) $("#busy").hidden = true; }
async function guard(label, fn) {
  try { await busy(label); return await fn(); }
  catch (e) { console.error(e); toast(e.userMsg || ("Something went wrong: " + (e.message || e)), true); }
  finally { done(); }
}
function userError(msg) { const e = new Error(msg); e.userMsg = msg; return e; }
function download(data, name, mime = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = rej; r.readAsArrayBuffer(f); });
const readDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
function pickFiles(accept, multiple) {
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept; inp.multiple = !!multiple;
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}
function baseName() { return (S.name || "document").replace(/\.pdf$/i, ""); }
function hexToRgb(h) { const m = h.replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map(c => c + c).join("") : m, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
const pdfColor = h => { const [r, g, b] = hexToRgb(h); return rgb(r, g, b); };
function dataURLBytes(u) { const b = atob(u.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function canvasBlob(c, type, q) { return new Promise(r => c.toBlob(r, type, q)); }
async function canvasBytes(c, type, q) { return new Uint8Array(await (await canvasBlob(c, type, q)).arrayBuffer()); }

/* ---------- page ranges / scope ---------- */
function parseRange(str, n) {
  const out = new Set();
  for (const part of String(str).split(",").map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!m || (!m[1] && !m[3])) throw userError(`“${part}” isn't a page range. Use something like 1-3, 7, 10-`);
    let a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : n) : a;
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > n) throw userError(`Pages must be between 1 and ${n}.`);
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  if (!out.size) throw userError("Type the pages to use, like 1-3, 7.");
  return [...out].sort((x, y) => x - y);
}
const pageCount = () => (S.doc ? S.doc.getPageCount() : 0);

/* ---------- geometry: the same view space pdf.js shows on screen ---------- */
function viewportFor(vb, rot) {
  const [x0, y0, x1, y1] = vb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let A, B, C, D;
  switch (rot) { case 90: A = 0; B = 1; C = 1; D = 0; break; case 180: A = -1; B = 0; C = 0; D = 1; break; case 270: A = 0; B = -1; C = -1; D = 0; break; default: A = 1; B = 0; C = 0; D = -1; }
  let ox, oy, W, H;
  if (A === 0) { ox = Math.abs(cy - y0); oy = Math.abs(cx - x0); W = y1 - y0; H = x1 - x0; }
  else { ox = Math.abs(cx - x0); oy = Math.abs(cy - y0); W = x1 - x0; H = y1 - y0; }
  return { T: [A, B, C, D, ox - A * cx - C * cy, oy - B * cx - D * cy], W, H };
}
function pageGeom(page) {
  const mb = page.getMediaBox(), cb = page.getCropBox();
  let x0 = Math.max(cb.x, mb.x), y0 = Math.max(cb.y, mb.y), x1 = Math.min(cb.x + cb.width, mb.x + mb.width), y1 = Math.min(cb.y + cb.height, mb.y + mb.height);
  if (x1 <= x0 || y1 <= y0) { x0 = mb.x; y0 = mb.y; x1 = mb.x + mb.width; y1 = mb.y + mb.height; }
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  return viewportFor([x0, y0, x1, y1], rot);
}
const matInv = ([a, b, c, d, e, f]) => { const t = a * d - b * c; return [d / t, -b / t, -c / t, a / t, (c * f - d * e) / t, (b * e - a * f) / t]; };
const matMul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const matApply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/* view (y down, what you see) → PDF user space */
const viewToPdf = (page) => matInv(pageGeom(page).T);

/* ---------- fonts ---------- */
const FONTS = {
  Helvetica: { std: "Helvetica", bold: "HelveticaBold", css: "Helvetica, Arial, sans-serif" },
  Times: { std: "TimesRoman", bold: "TimesRomanBold", css: "'Times New Roman', Times, serif" },
  Courier: { std: "Courier", bold: "CourierBold", css: "'Courier New', Courier, monospace" },
};
const embedderCache = {};
function fontEmbedder(font, bold) {
  const key = FONTS[font || "Helvetica"][bold ? "bold" : "std"];
  return embedderCache[key] || (embedderCache[key] = PDFLib.StandardFontEmbedder.for(StandardFonts[key]));
}
function cleanText(s, font, bold) {
  const emb = fontEmbedder(font, bold);
  const ok = new Set(emb.encoding.supportedCodePoints);
  return String(s).replace(/₹/g, "Rs.").replace(/[‐-―]/g, "-").split("").map(ch => ch === "\n" || ok.has(ch.codePointAt(0)) ? ch : "?").join("");
}
function textWidth(s, size, font, bold) {
  const emb = fontEmbedder(font, bold);
  return Math.max(...cleanText(s, font, bold).split("\n").map(l => emb.widthOfTextAtSize(l, size)), 0);
}
const docFonts = new WeakMap(), docImages = new WeakMap();
async function getFont(font, bold) {
  if (!docFonts.has(S.doc)) docFonts.set(S.doc, {});
  const c = docFonts.get(S.doc), key = FONTS[font || "Helvetica"][bold ? "bold" : "std"];
  return c[key] || (c[key] = await S.doc.embedFont(StandardFonts[key]));
}
async function getImage(src) {
  if (!docImages.has(S.doc)) docImages.set(S.doc, new Map());
  const c = docImages.get(S.doc);
  if (!c.has(src)) c.set(src, src.startsWith("data:image/png") ? await S.doc.embedPng(dataURLBytes(src)) : await S.doc.embedJpg(dataURLBytes(src)));
  return c.get(src);
}

/* ---------- drawing primitives (view coordinates, y down) ----------
   text:{x,y(baseline),text,size,font,bold,color,opacity,rotate}  rect:{x,y,w,h,fill,stroke,sw,opacity,blend}
   ellipse:{cx,cy,rx,ry,fill,stroke,sw}  line:{x1,y1,x2,y2,stroke,sw,opacity}  path:{d,stroke,sw}  image:{x,y,w,h,src,opacity} */
function primSVG(p) {
  const op = p.opacity != null ? ` opacity="${p.opacity}"` : "";
  switch (p.k) {
    case "text": {
      const lines = String(p.text).split("\n"), lh = p.size * 1.25;
      const rot = p.rotate ? ` transform="rotate(${p.rotate} ${p.x} ${p.y})"` : "";
      return `<text x="${p.x}" y="${p.y}" font-family="${esc(FONTS[p.font || "Helvetica"].css)}" font-size="${p.size}" font-weight="${p.bold ? 700 : 400}" fill="${p.color}"${op}${rot} xml:space="preserve">` +
        lines.map((l, i) => `<tspan x="${p.x}" dy="${i ? lh : 0}">${esc(l) || " "}</tspan>`).join("") + `</text>`;
    }
    case "rect": return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx || 0}" fill="${p.fill || "none"}" stroke="${p.stroke || "none"}" stroke-width="${p.sw || 0}"${op}${p.blend ? ' style="mix-blend-mode:multiply"' : ""}/>`;
    case "ellipse": return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${Math.abs(p.rx)}" ry="${Math.abs(p.ry)}" fill="${p.fill || "none"}" stroke="${p.stroke || "none"}" stroke-width="${p.sw || 0}"${op}/>`;
    case "line": return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.stroke}" stroke-width="${p.sw}" stroke-linecap="round"${op}/>`;
    case "path": return `<path d="${p.d}" fill="none" stroke="${p.stroke}" stroke-width="${p.sw}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
    case "image": return `<image href="${p.src}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="none"${op}/>`;
  }
  return "";
}
async function drawPrims(page, prims) {
  if (!prims.length) return;
  const g = pageGeom(page), H = g.H;
  const M = matMul([1, 0, 0, -1, 0, H], matInv(g.T)); // "view, y up" → PDF space
  // pdf-lib caches a page's content stream after the first save; start a fresh one so these drawings are always written out
  page.contentStream = undefined; page.contentStreamRef = undefined;
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...M));
  for (const p of prims) {
    const op = p.opacity != null ? p.opacity : 1;
    switch (p.k) {
      case "text": {
        const font = await getFont(p.font, p.bold), lh = p.size * 1.25, th = (p.rotate || 0) * Math.PI / 180;
        cleanText(p.text, p.font, p.bold).split("\n").forEach((line, i) => {
          if (!line) return;
          const bx = p.x - i * lh * Math.sin(th), by = p.y + i * lh * Math.cos(th);
          page.drawText(line, { x: bx, y: H - by, size: p.size, font, color: pdfColor(p.color), opacity: op, rotate: degrees(-(p.rotate || 0)) });
        });
        break;
      }
      case "rect": {
        const o = { x: p.x, y: H - p.y - p.h, width: p.w, height: p.h, opacity: op, borderOpacity: op };
        if (p.fill) o.color = pdfColor(p.fill);
        if (p.stroke && p.sw) { o.borderColor = pdfColor(p.stroke); o.borderWidth = p.sw; }
        if (p.blend) o.blendMode = BlendMode.Multiply;
        page.drawRectangle(o); break;
      }
      case "ellipse": {
        const o = { x: p.cx, y: H - p.cy, xScale: Math.abs(p.rx), yScale: Math.abs(p.ry), opacity: op, borderOpacity: op };
        if (p.fill) o.color = pdfColor(p.fill);
        if (p.stroke && p.sw) { o.borderColor = pdfColor(p.stroke); o.borderWidth = p.sw; }
        page.drawEllipse(o); break;
      }
      case "line": page.drawLine({ start: { x: p.x1, y: H - p.y1 }, end: { x: p.x2, y: H - p.y2 }, thickness: p.sw, color: pdfColor(p.stroke), opacity: op, lineCap: LineCapStyle.Round }); break;
      case "path": page.drawSvgPath(p.d, { x: 0, y: H, borderColor: pdfColor(p.stroke), borderWidth: p.sw, borderOpacity: op, borderLineCap: LineCapStyle.Round }); break;
      case "image": page.drawImage(await getImage(p.src), { x: p.x, y: H - p.y - p.h, width: p.w, height: p.h, opacity: op }); break;
    }
  }
  page.pushOperators(popGraphicsState());
}

/* ---------- editable objects (pending edits before they are written into the PDF) ---------- */
function objPrims(o) {
  switch (o.type) {
    case "text": return [{ k: "text", x: o.x, y: o.y, text: o.text, size: o.size, font: o.font, bold: o.bold, color: o.color }];
    case "image": return [{ k: "image", x: o.x, y: o.y, w: o.w, h: o.h, src: o.src }];
    case "highlight": return [{ k: "rect", x: o.x, y: o.y, w: o.w, h: o.h, fill: o.color, opacity: 0.4, blend: true }];
    case "whiteout": return [{ k: "rect", x: o.x, y: o.y, w: o.w, h: o.h, fill: "#ffffff" }];
    case "redact": return [{ k: "rect", x: o.x, y: o.y, w: o.w, h: o.h, fill: "#000000" }];
    case "rect": return [{ k: "rect", x: o.x, y: o.y, w: o.w, h: o.h, stroke: o.color, sw: o.sw, fill: o.fill ? o.color : null, opacity: o.fill ? 0.25 : 1 }]
      .concat(o.fill ? [{ k: "rect", x: o.x, y: o.y, w: o.w, h: o.h, stroke: o.color, sw: o.sw }] : []);
    case "ellipse": return [{ k: "ellipse", cx: o.x + o.w / 2, cy: o.y + o.h / 2, rx: o.w / 2, ry: o.h / 2, stroke: o.color, sw: o.sw, fill: o.fill ? o.color : null, opacity: o.fill ? 0.25 : 1 }]
      .concat(o.fill ? [{ k: "ellipse", cx: o.x + o.w / 2, cy: o.y + o.h / 2, rx: o.w / 2, ry: o.h / 2, stroke: o.color, sw: o.sw }] : []);
    case "line": return [{ k: "line", x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, stroke: o.color, sw: o.sw }];
    case "arrow": {
      const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.max(10, o.sw * 4), s = 0.5;
      return [{ k: "line", x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, stroke: o.color, sw: o.sw },
        { k: "line", x1: o.x2, y1: o.y2, x2: o.x2 - L * Math.cos(a - s), y2: o.y2 - L * Math.sin(a - s), stroke: o.color, sw: o.sw },
        { k: "line", x1: o.x2, y1: o.y2, x2: o.x2 - L * Math.cos(a + s), y2: o.y2 - L * Math.sin(a + s), stroke: o.color, sw: o.sw }];
    }
    case "ink": return [{ k: "path", d: inkPath(o.pts), stroke: o.color, sw: o.sw }];
  }
  return [];
}
function inkPath(pts) {
  if (!pts.length) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  if (pts.length === 1) return d + ` L${(pts[0][0] + 0.1).toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
}
function objBox(o) {
  if (o.type === "text") {
    const lines = String(o.text).split("\n").length;
    return { x: o.x, y: o.y - o.size * 0.82, w: Math.max(textWidth(o.text, o.size, o.font, o.bold), 6), h: o.size * (0.82 + 0.25) + (lines - 1) * o.size * 1.25 };
  }
  if (o.type === "line" || o.type === "arrow") return { x: Math.min(o.x1, o.x2) - 4, y: Math.min(o.y1, o.y2) - 4, w: Math.abs(o.x2 - o.x1) + 8, h: Math.abs(o.y2 - o.y1) + 8 };
  if (o.type === "ink") { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x: x - 3, y: y - 3, w: Math.max(...xs) - x + 6, h: Math.max(...ys) - y + 6 }; }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}
function moveObj(o, dx, dy, orig) {
  if ("x1" in orig) { o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy; o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy; }
  else if (orig.pts) o.pts = orig.pts.map(p => [p[0] + dx, p[1] + dy]);
  else { o.x = orig.x + dx; o.y = orig.y + dy; }
}
const resizable = o => ["image", "highlight", "whiteout", "redact", "rect", "ellipse"].includes(o.type);
const pendingOn = i => S.pending[i] || (S.pending[i] = []);
const pendingCount = () => Object.values(S.pending).reduce((a, l) => a + l.length, 0);
function findObj(id) { for (const k in S.pending) { const o = S.pending[k].find(o => o.id === id); if (o) return o; } return null; }

/* ---------- history (undo / redo) ---------- */
const snapPending = () => JSON.parse(JSON.stringify(S.pending));
function pushHist(kind) {
  S.hist.push(kind === "doc" ? { kind, bytes: S.bytes, pending: snapPending() } : { kind, pending: snapPending() });
  let docs = S.hist.filter(h => h.kind === "doc").length;
  while (docs > 25) { const i = S.hist.findIndex(h => h.kind === "doc"); S.hist.splice(i, 1); docs--; }
  if (S.hist.length > 120) S.hist.shift();
  S.fut = []; S.dirty = true; updHist();
}
async function stepHist(from, to) {
  const h = from.pop(); if (!h) return;
  to.push(h.kind === "doc" ? { kind: "doc", bytes: S.bytes, pending: snapPending() } : { kind: "pending", pending: snapPending() });
  S.pending = h.pending; S.selObj = null; S.dirty = true;
  if (h.kind === "doc") {
    await guard("Restoring…", async () => { S.doc = await PDFDocument.load(h.bytes, { updateMetadata: false }); S.bytes = h.bytes; await reload(false); });
  } else { renderOverlay(); renderPendingBar(); markThumbPending(); }
  updHist(); refreshPanel();
}
const undo = () => stepHist(S.hist, S.fut);
const redo = () => stepHist(S.fut, S.hist);
function updHist() { $("#undoBtn").disabled = !S.hist.length; $("#redoBtn").disabled = !S.fut.length; updateMeta(); }

/* ---------- open / reload / save ---------- */
async function openBytes(bytes, name) {
  let doc;
  try { doc = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) {
    if (/encrypt/i.test(e.message)) throw userError("This PDF is password-protected. Remove the password in another app first, then open it here.");
    throw userError("This file couldn't be read as a PDF.");
  }
  if (doc.isEncrypted) throw userError("This PDF is password-protected. Remove the password in another app first, then open it here.");
  S.doc = doc; S.name = name; S.originalBytes = bytes; S.cur = 0; S.sel = new Set(); S.pending = {}; S.selObj = null;
  S.hist = []; S.fut = []; S.dirty = false; S.zoom = null; S.cropRect = null;
  await reload(true);
  document.body.classList.add("has-doc");
  $("#viewer").classList.remove("no-doc"); $("#empty").hidden = true; $("#saveBtn").disabled = false;
  updHist(); refreshPanel();
}
async function reload(save = true) {
  if (save) S.bytes = await S.doc.save();
  if (S.pdf) { try { S.pdf.destroy(); } catch (e) { } }
  S.pdf = await pdfjsLib.getDocument({ data: S.bytes.slice(), isEvalSupported: false }).promise;
  S.ver++;
  const n = pageCount();
  S.cur = clamp(S.cur, 0, n - 1);
  S.sel = new Set([...S.sel].filter(i => i < n));
  renderThumbs();
  await renderPage();
  updateMeta();
}
/* run an operation that changes the document; edits waiting on the page are written in first */
async function docOp(label, fn, opts = {}) {
  if (!S.doc) return toast("Open a PDF first.", true);
  return guard(label, async () => {
    await commitPending(true);
    pushHist("doc");
    const r = await fn();
    if (r === false) { S.hist.pop(); updHist(); return; }
    await reload(true);
    S.dirty = true; updHist(); refreshPanel();
    if (opts.ok) toast(typeof opts.ok === "function" ? opts.ok(r) : opts.ok);
    return r;
  });
}
async function savePDF() {
  if (!S.doc) return;
  await guard("Saving…", async () => {
    await commitPending(true);
    const bytes = await S.doc.save();
    download(bytes, baseName() + "-edited.pdf");
    S.dirty = false; updateMeta();
    toast(`Saved ${baseName()}-edited.pdf · ${fmtBytes(bytes.length)}`);
  });
}

/* ---------- write pending edits into the PDF ---------- */
async function commitPending(inner) {
  const keys = Object.keys(S.pending).filter(k => S.pending[k].length);
  if (!keys.length) return false;
  const run = async () => {
    pushHist("doc");
    const redactJobs = [];
    for (const k of keys) {
      const page = S.doc.getPage(+k), objs = S.pending[k];
      await drawPrims(page, objs.filter(o => o.type !== "redact").flatMap(objPrims));
      const red = objs.filter(o => o.type === "redact");
      if (red.length) redactJobs.push([+k, red]);
    }
    S.pending = {}; S.selObj = null;
    await reload(true);
    if (redactJobs.length) {
      for (const [i, boxes] of redactJobs) { busyText(`Redacting page ${i + 1}…`); await flattenPage(i, boxes); }
      await reload(true);
    }
    renderPendingBar();
  };
  if (inner) await run(); else await guard("Applying edits…", run);
  return true;
}
/* Redaction: the page is redrawn as an image with black boxes burnt in, so the hidden text no longer exists in the file. */
async function flattenPage(i, boxes, scale = 2.5) {
  const pg = await S.pdf.getPage(i + 1), vp = pg.getViewport({ scale });
  const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  ctx.fillStyle = "#000";
  for (const b of boxes) ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
  const img = await S.doc.embedJpg(await canvasBytes(c, "image/jpeg", 0.9));
  const W = vp.width / scale, H = vp.height / scale;
  const np = S.doc.insertPage(i, [W, H]);
  np.drawImage(img, { x: 0, y: 0, width: W, height: H });
  S.doc.removePage(i + 1);
}

/* ---------- rendering ---------- */
function updateMeta() {
  const m = $("#fileMeta");
  if (!S.doc) { m.textContent = "No file open"; return; }
  const n = pageCount();
  m.innerHTML = `<b>${esc(S.name)}</b> · ${n} page${n > 1 ? "s" : ""} · ${fmtBytes(S.bytes?.length)}` + (S.dirty || pendingCount() ? ` · <span class="dirty">unsaved changes</span>` : "");
  $("#pageCount").textContent = n;
  $("#pageTotal").textContent = n;
  $("#pageInput").value = S.cur + 1;
  $("#selInfo").textContent = S.sel.size ? `${S.sel.size} selected` : "";
}
async function renderPage() {
  if (!S.pdf) return;
  const idx = S.cur, ver = S.ver;
  const page = await S.pdf.getPage(idx + 1);
  if (idx !== S.cur || ver !== S.ver) return;
  const base = page.getViewport({ scale: 1 });
  S.view = { W: base.width, H: base.height };
  const viewer = $("#viewer");
  const avail = Math.max(200, viewer.clientWidth - (innerWidth < 900 ? 24 : 48));
  const fit = clamp(avail / base.width, 0.25, 2);
  const fitPage = clamp(Math.min(avail / base.width, (viewer.clientHeight - (innerWidth < 900 ? 24 : 48)) / base.height), 0.2, 2);
  S.scale = S.zoom === "page" ? fitPage : (S.zoom ?? fit);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const vp = page.getViewport({ scale: S.scale * dpr });
  const cv = $("#pageCanvas");
  if (S.renderTask) { try { S.renderTask.cancel(); } catch (e) { } }
  const off = document.createElement("canvas");
  off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
  const task = page.render({ canvasContext: off.getContext("2d"), viewport: vp });
  S.renderTask = task;
  try { await task.promise; } catch (e) { if (e?.name === "RenderingCancelledException") return; throw e; }
  if (idx !== S.cur || ver !== S.ver) return;
  cv.width = off.width; cv.height = off.height;
  cv.getContext("2d").drawImage(off, 0, 0);
  cv.style.width = base.width * S.scale + "px"; cv.style.height = base.height * S.scale + "px";
  const ov = $("#overlay");
  ov.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`);
  $("#zoomVal").textContent = Math.round(S.scale * 100) + "%";
  $("#zoomFit").setAttribute("aria-pressed", S.zoom == null); $("#zoomPage").setAttribute("aria-pressed", S.zoom === "page");
  renderOverlay();
  $$(".thumb").forEach((t, i) => t.classList.toggle("cur", i === S.cur));
  updateMeta();
  renderPendingBar();
}
function gotoPage(i) {
  if (!S.doc) return;
  i = clamp(i, 0, pageCount() - 1);
  if (i === S.cur) return;
  S.cur = i; S.selObj = null; S.cropRect = null;
  renderPage().then(() => { refreshPanel(true); });
  const t = $$(".thumb")[i]; if (t) t.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/* thumbnails: rendered lazily as they scroll into view */
let thumbObs = null, thumbQueue = [], thumbBusy = false;
function renderThumbs() {
  const list = $("#thumbList"), n = pageCount(), ver = S.ver;
  if (thumbObs) thumbObs.disconnect();
  thumbQueue = [];
  const html = [];
  for (let i = 0; i < n; i++) {
    const g = pageGeom(S.doc.getPage(i)), w = 112, h = Math.round(w * g.H / g.W);
    html.push(`<div class="thumb${i === S.cur ? " cur" : ""}${S.sel.has(i) ? " sel" : ""}" data-i="${i}" draggable="true" role="button" tabindex="0" aria-label="Page ${i + 1}">
      <canvas class="tc" width="${w}" height="${h}" style="width:${w}px;aspect-ratio:${g.W}/${g.H};height:auto"></canvas>
      <span class="chk" data-chk>✓</span><span class="tn">${i + 1}</span></div>`);
  }
  list.innerHTML = html.join("");
  thumbObs = new IntersectionObserver(ents => {
    for (const e of ents) if (e.isIntersecting) { thumbObs.unobserve(e.target); thumbQueue.push([+e.target.dataset.i, ver]); }
    pumpThumbs();
  }, { root: list, rootMargin: "300px" });
  $$(".thumb", list).forEach(t => thumbObs.observe(t));
  markThumbPending();
}
async function pumpThumbs() {
  if (thumbBusy) return; thumbBusy = true;
  while (thumbQueue.length) {
    const [i, ver] = thumbQueue.shift();
    if (ver !== S.ver) continue;
    try {
      const pg = await S.pdf.getPage(i + 1);
      const c = $$(".thumb .tc")[i]; if (!c || ver !== S.ver) continue;
      const vp1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: (c.width * 2) / vp1.width });
      const off = document.createElement("canvas"); off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      await pg.render({ canvasContext: off.getContext("2d"), viewport: vp }).promise;
      if (ver !== S.ver) continue;
      c.width = off.width; c.height = off.height; c.getContext("2d").drawImage(off, 0, 0);
    } catch (e) { }
  }
  thumbBusy = false;
}
function markThumbPending() {
  $$(".thumb").forEach((t, i) => {
    const n = (S.pending[i] || []).length, b = t.querySelector(".pend");
    if (n && !b) t.insertAdjacentHTML("beforeend", `<span class="pend">${n}</span>`);
    else if (n) b.textContent = n; else if (b) b.remove();
  });
}
function renderPendingBar() {
  const n = pendingCount();
  $("#pendingBar").hidden = !n;
  if (n) {
    const pages = Object.keys(S.pending).filter(k => S.pending[k].length).length;
    $("#pendingText").textContent = `${n} edit${n > 1 ? "s" : ""} on ${pages} page${pages > 1 ? "s" : ""} not written into the PDF yet. They are added when you save.`;
  }
  markThumbPending(); updateMeta();
}

/* overlay = pending objects for this page + tool previews */
function renderOverlay() {
  const ov = $("#overlay");
  if (!S.doc) { ov.innerHTML = ""; return; }
  const objs = S.pending[S.cur] || [];
  let h = "";
  for (const o of objs) {
    const b = objBox(o);
    h += `<g class="obj" data-id="${o.id}">${objPrims(o).map(primSVG).join("")}` +
      (o.type === "redact" ? `<text x="${b.x + 4}" y="${b.y + Math.min(b.h - 3, 12)}" font-size="${Math.min(10, b.h * .7)}" fill="#ff6b6b" font-family="monospace">REDACT</text>` : "") +
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/></g>`;
  }
  const t = currentTool();
  if (t && t.preview) { try { const prims = t.preview(); if (prims && prims.length) h += `<g class="draft" opacity="0.9">${prims.map(primSVG).join("")}</g>`; } catch (e) { } }
  if (S.draft) h += `<g class="draft">${objPrims(S.draft).map(primSVG).join("")}</g>`;
  const sel = S.selObj && objs.find(o => o.id === S.selObj);
  if (sel) {
    const b = objBox(sel), k = 1 / S.scale;
    h += `<rect class="selbox" x="${b.x - 2 * k}" y="${b.y - 2 * k}" width="${b.w + 4 * k}" height="${b.h + 4 * k}"/>`;
    if (resizable(sel)) h += `<rect class="handle" data-h="se" x="${b.x + b.w - 5 * k}" y="${b.y + b.h - 5 * k}" width="${10 * k}" height="${10 * k}"/>`;
  }
  ov.innerHTML = h;
  ov.setAttribute("class", "tool-" + ((t && t.cursor) || "none"));
}
