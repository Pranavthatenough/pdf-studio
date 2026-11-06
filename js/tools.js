/* PDF Studio — the 29 tools, grouped like the brief: Organise · Edit · Stamp · Convert · Finish */
"use strict";
const GROUPS = [
  { id: "organise", label: "Organise", icon: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>' },
  { id: "edit", label: "Edit", icon: '<path d="M4 20l4.5-1 11-11-3.5-3.5-11 11z"/><path d="M14 6.5l3.5 3.5"/>' },
  { id: "stamp", label: "Stamp", icon: '<path d="M9.5 3.5h5v5l3.5 4.5H6l3.5-4.5z"/><path d="M4.5 16h15v3.5h-15z"/>' },
  { id: "convert", label: "Convert", icon: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>' },
  { id: "finish", label: "Finish", icon: '<path d="M5.5 21V4h11.5l-2.5 4 2.5 4H5.5"/>' },
];
const TOOLS = {}, ORDER = [];
const tool = d => { TOOLS[d.id] = d; ORDER.push(d.id); };
const currentTool = () => TOOLS[S.tool];
const OPT = {};
const O = (id = S.tool) => OPT[id] || (OPT[id] = JSON.parse(JSON.stringify(TOOLS[id].defaults || {})));
const INK = ["#1b1b1f", "#2f5bd3", "#d13b2e", "#1d8a55"];
const HL = ["#ffe14d", "#7bf08f", "#ff8fc7", "#79c8ff"];

/* ---------- panel field helpers (values live in OPT so they survive re-renders) ---------- */
const lab = (k, label, show) => `<label for="o-${k}">${label}${show ? ` <b data-show="${k}">${show}</b>` : ""}</label>`;
const fText = (k, label, ph = "") => `<div class="field">${lab(k, label)}<input class="inp" id="o-${k}" data-o="${k}" value="${esc(O()[k] ?? "")}" placeholder="${esc(ph)}"></div>`;
const fArea = (k, label) => `<div class="field">${lab(k, label)}<textarea class="inp" id="o-${k}" data-o="${k}">${esc(O()[k] ?? "")}</textarea></div>`;
const fNum = (k, label, min, max, step = 1) => `<div class="field">${lab(k, label)}<input class="inp" type="number" id="o-${k}" data-o="${k}" min="${min}" max="${max}" step="${step}" value="${O()[k]}"></div>`;
const fRange = (k, label, min, max, step, fmt = v => v) => `<div class="field">${lab(k, label, fmt(O()[k]))}<input type="range" id="o-${k}" data-o="${k}" data-fmt="${k}" min="${min}" max="${max}" step="${step}" value="${O()[k]}"></div>`;
const fSelect = (k, label, opts) => `<div class="field">${lab(k, label)}<select class="inp" id="o-${k}" data-o="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(O()[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
const fCheck = (k, label) => `<label class="check"><input type="checkbox" data-o="${k}" ${O()[k] ? "checked" : ""}> ${label}</label>`;
const fSeg = (k, label, opts) => `<div class="field">${label ? `<span class="lab">${label}</span>` : ""}<div class="seg">${opts.map(([v, t]) => `<button type="button" data-seg="${k}" data-v="${v}" aria-pressed="${String(O()[k]) === String(v)}">${t}</button>`).join("")}</div></div>`;
const fColor = (k, label, sw = INK) => `<div class="field"><span class="lab">${label}</span><div class="swatches">${sw.map(c => `<button type="button" class="sw" data-swk="${k}" data-v="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${O()[k] === c}"></button>`).join("")}<input type="color" class="sw-custom" data-o="${k}" value="${O()[k]}" aria-label="Custom colour"></div></div>`;
const fmtPct = v => Math.round(v * 100) + "%";
const head = (t, d) => `<h2>${t}</h2><p class="desc">${d}</p>`;
const btn = (id, t, cls = "btn block") => `<button class="${cls}" id="${id}">${t}</button>`;
function scopeOpt(def) { const o = O(); if (o.scope == null) o.scope = def; if (o.scope === "sel" && !S.sel.size) o.scope = "this"; return o; }
function scopeHTML(id, def = "all", allow = ["this", "sel", "all", "range"]) {
  const o = scopeOpt(def), n = S.sel.size;
  const t = { this: `This page (${S.cur + 1})`, sel: `Selected pages (${n})`, all: `All ${pageCount()} pages`, range: "Pages" };
  return `<div class="field"><span class="lab">Apply to</span><div class="radio-list">` + allow.map(k =>
    `<label><input type="radio" name="scope-${S.tool}" data-o="scope" value="${k}" ${o.scope === k ? "checked" : ""} ${k === "sel" && !n ? "disabled" : ""}> ${t[k]}${k === "range" ? ` <input class="inp" data-o="range" data-range value="${esc(o.range || "")}" placeholder="e.g. 1-3, 7, 10-">` : ""}</label>`).join("") + `</div></div>`;
}
function resolveScope() {
  const o = O(), n = pageCount();
  if (o.scope === "this") return [S.cur];
  if (o.scope === "sel") { if (!S.sel.size) throw userError("Select pages in the sidebar first."); return [...S.sel].sort((a, b) => a - b); }
  if (o.scope === "range") return parseRange(o.range || "", n);
  return [...Array(n).keys()];
}
const inScope = i => { try { return resolveScope().includes(i); } catch (e) { return false; } };

/* ============================== ORGANISE ============================== */
tool({ id: "merge", group: "organise", label: "Merge", defaults: { files: [], where: "end" },
  panel: () => {
    const o = O();
    return head("Merge PDFs", "Add other PDFs to this one. Their pages are copied in, in the order listed.") +
      `<div class="list">${o.files.map((f, i) => `<div class="li"><span class="nm">${esc(f.name)}</span><span class="sz">${f.pages}p · ${fmtBytes(f.size)}</span><button data-mv="${i}" title="Move up">↑</button><button data-rm="${i}" title="Remove">✕</button></div>`).join("") || `<div class="note">No PDFs added yet.</div>`}</div>` +
      btn("mAdd", "Add PDFs…", "btn block") +
      `<div style="height:10px"></div>` + fSelect("where", "Put them", [["end", "At the end"], ["after", `After page ${S.cur + 1}`], ["start", "At the start"]]) +
      btn("mRun", `Merge ${o.files.length || ""} file${o.files.length === 1 ? "" : "s"}`.replace("  ", " "), "btn primary block");
  },
  bind: () => {
    const o = O();
    $("#mAdd").onclick = async () => {
      for (const f of await pickFiles("application/pdf,.pdf", true)) {
        try { const b = await readFile(f); const d = await PDFDocument.load(b, { ignoreEncryption: true }); o.files.push({ name: f.name, size: f.size, pages: d.getPageCount(), bytes: b }); }
        catch (e) { toast(`${f.name} couldn't be read as a PDF.`, true); }
      }
      refreshPanel();
    };
    $("#panel").onclick = e => {
      const rm = e.target.closest("[data-rm]"), mv = e.target.closest("[data-mv]");
      if (rm) { o.files.splice(+rm.dataset.rm, 1); refreshPanel(); }
      if (mv && +mv.dataset.mv > 0) { const i = +mv.dataset.mv; [o.files[i - 1], o.files[i]] = [o.files[i], o.files[i - 1]]; refreshPanel(); }
    };
    $("#mRun").onclick = () => {
      if (!o.files.length) return toast("Add at least one PDF to merge.", true);
      docOp("Merging…", async () => {
        let at = o.where === "start" ? 0 : o.where === "after" ? S.cur + 1 : pageCount(), added = 0;
        for (const f of o.files) {
          const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
          const pages = await S.doc.copyPages(src, src.getPageIndices());
          for (const p of pages) S.doc.insertPage(at++, p);
          added += pages.length;
        }
        o.files = []; return added;
      }, { ok: n => `Merged ${n} page${n > 1 ? "s" : ""}.` });
    };
  } });

tool({ id: "split", group: "organise", label: "Split", defaults: { mode: "ranges", ranges: "", every: 5 },
  panel: () => {
    const o = O(), n = pageCount();
    if (!o.ranges) o.ranges = n > 1 ? `1-${Math.ceil(n / 2)}, ${Math.ceil(n / 2) + 1}-${n}` : "1";
    return head("Split into files", "Cut this PDF into several smaller PDFs. You get one ZIP with every part.") +
      fSeg("mode", "Split", [["ranges", "By ranges"], ["every", "Every N pages"], ["each", "Each page"]]) +
      (o.mode === "ranges" ? fText("ranges", "Ranges, one file each", "1-10, 11-20, 21-") : o.mode === "every" ? fNum("every", "Pages per file", 1, n, 1) : "") +
      `<div class="note" id="splitInfo"></div>` + btn("sRun", "Split and download", "btn primary block");
  },
  parts() {
    const o = O(), n = pageCount();
    if (o.mode === "each") return [...Array(n).keys()].map(i => [i]);
    if (o.mode === "every") { const k = clamp(+o.every || 1, 1, n), out = []; for (let i = 0; i < n; i += k) out.push([...Array(Math.min(k, n - i)).keys()].map(j => i + j)); return out; }
    return String(o.ranges).split(",").map(s => s.trim()).filter(Boolean).map(r => parseRange(r, n));
  },
  onChange(k) { if (k === "mode") refreshPanel(); else this.info(); },
  info() { try { const p = this.parts(); $("#splitInfo").textContent = `${p.length} file${p.length > 1 ? "s" : ""}: ` + p.slice(0, 6).map(a => a.length > 1 ? `${a[0] + 1}–${a[a.length - 1] + 1}` : a[0] + 1).join(", ") + (p.length > 6 ? ", …" : ""); } catch (e) { $("#splitInfo").textContent = e.userMsg || e.message; } },
  bind() {
    this.info();
    $("#sRun").onclick = () => guard("Splitting…", async () => {
      await commitPending(true);
      const parts = this.parts();
      if (parts.length === 1) { download(await subDoc(parts[0]), `${baseName()}-pages-${label(parts[0])}.pdf`); return; }
      const zip = new JSZip();
      for (let i = 0; i < parts.length; i++) { busyText(`Making file ${i + 1} of ${parts.length}…`); zip.file(`${baseName()}-part${i + 1}-pages-${label(parts[i])}.pdf`, await subDoc(parts[i])); }
      download(await zip.generateAsync({ type: "blob" }), `${baseName()}-split.zip`, "application/zip");
      toast(`Split into ${parts.length} files.`);
    });
  } });
function label(idx) { return idx.length > 1 ? `${idx[0] + 1}-${idx[idx.length - 1] + 1}` : `${idx[0] + 1}`; }
async function subDoc(indices) {
  const d = await PDFDocument.create();
  (await d.copyPages(S.doc, indices)).forEach(p => d.addPage(p));
  return d.save();
}
/* reorder pages in place: order = new list of old indices */
function applyOrder(order) {
  const pages = S.doc.getPages();
  for (let i = pages.length - 1; i >= 0; i--) S.doc.removePage(i);
  order.forEach(i => S.doc.addPage(pages[i]));
}
function movePages(indices, target) {
  const n = pageCount(), set = new Set(indices);
  const rest = [...Array(n).keys()].filter(i => !set.has(i));
  const before = [...Array(target).keys()].filter(i => !set.has(i)).length;
  const order = [...rest.slice(0, before), ...indices, ...rest.slice(before)];
  if (order.every((v, i) => v === i)) return;
  return docOp("Moving pages…", async () => {
    applyOrder(order);
    S.cur = order.indexOf(S.cur);
    S.sel = new Set(indices.map(i => order.indexOf(i)));
    return indices.length;
  }, { ok: k => `Moved ${k} page${k > 1 ? "s" : ""}.` });
}
const targets = () => (S.sel.size ? [...S.sel] : [S.cur]).sort((a, b) => a - b);

tool({ id: "reorder", group: "organise", label: "Reorder",
  panel: () => {
    const t = targets();
    return head("Reorder pages", "Drag pages in the sidebar to a new place. Select several with Ctrl/⌘ or Shift to move them together.") +
      `<div class="note">Moving: <b>${t.length > 1 ? `${t.length} selected pages` : `page ${t[0] + 1}`}</b></div>` +
      `<div class="btn-grid">${btn("roFirst", "⇤ To start", "btn")}${btn("roLast", "To end ⇥", "btn")}${btn("roUp", "↑ Up one", "btn")}${btn("roDown", "↓ Down one", "btn")}</div>` +
      `<h3>Whole document</h3>` + btn("roRev", "Reverse page order", "btn block");
  },
  bind: () => {
    $("#roFirst").onclick = () => movePages(targets(), 0);
    $("#roLast").onclick = () => movePages(targets(), pageCount());
    $("#roUp").onclick = () => { const t = targets(); if (t[0] > 0) movePages(t, t[0] - 1); };
    $("#roDown").onclick = () => { const t = targets(); if (t[t.length - 1] < pageCount() - 1) movePages(t, t[t.length - 1] + 2); };
    $("#roRev").onclick = () => docOp("Reversing…", async () => { const n = pageCount(); applyOrder([...Array(n).keys()].reverse()); S.cur = n - 1 - S.cur; S.sel = new Set(); }, { ok: "Page order reversed." });
  } });

tool({ id: "rotate", group: "organise", label: "Rotate", defaults: { scope: null },
  panel: () => head("Rotate pages", "Turn pages a quarter or half turn. Nothing is lost; the page is only turned.") + scopeHTML("sc", S.sel.size ? "sel" : "this") +
    `<div class="btn-grid">${btn("rL", "↺ Left 90°", "btn")}${btn("rR", "↻ Right 90°", "btn")}</div><div style="height:8px"></div>${btn("r180", "Turn 180°", "btn block")}`,
  bind: () => {
    const go = d => { let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
      docOp("Rotating…", async () => { for (const i of idx) { const p = S.doc.getPage(i); p.setRotation(degrees(((p.getRotation().angle + d) % 360 + 360) % 360)); } return idx.length; }, { ok: n => `Rotated ${n} page${n > 1 ? "s" : ""}.` }); };
    $("#rL").onclick = () => go(-90); $("#rR").onclick = () => go(90); $("#r180").onclick = () => go(180);
  } });

tool({ id: "delete", group: "organise", label: "Delete",
  panel: () => head("Delete pages", "Remove pages from this PDF. Undo brings them back.") + scopeHTML("sc", S.sel.size ? "sel" : "this", ["this", "sel", "range"]) + btn("dRun", "Delete pages", "btn primary block"),
  bind: () => { $("#dRun").onclick = () => {
    let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
    if (idx.length >= pageCount()) return toast("You can't delete every page. Keep at least one.", true);
    docOp("Deleting…", async () => { for (const i of [...idx].reverse()) S.doc.removePage(i); S.sel = new Set(); S.cur = Math.min(idx[0], pageCount() - 1); return idx.length; }, { ok: n => `Deleted ${n} page${n > 1 ? "s" : ""}.` });
  }; } });

tool({ id: "duplicate", group: "organise", label: "Duplicate", defaults: { copies: 1 },
  panel: () => head("Duplicate pages", "Each copy is placed right after its original page.") + scopeHTML("sc", S.sel.size ? "sel" : "this", ["this", "sel", "range"]) + fNum("copies", "Copies of each page", 1, 10) + btn("duRun", "Duplicate", "btn primary block"),
  bind: () => { $("#duRun").onclick = () => {
    let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
    const k = clamp(+O().copies || 1, 1, 10);
    docOp("Duplicating…", async () => {
      for (const i of [...idx].reverse()) { const copies = await S.doc.copyPages(S.doc, Array(k).fill(i)); copies.forEach((p, j) => S.doc.insertPage(i + 1 + j, p)); }
      return idx.length * k;
    }, { ok: n => `Added ${n} copied page${n > 1 ? "s" : ""}.` });
  }; } });

tool({ id: "extract", group: "organise", label: "Extract", defaults: { remove: false },
  panel: () => head("Extract pages", "Save some pages as their own new PDF.") + scopeHTML("sc", S.sel.size ? "sel" : "range", ["this", "sel", "range"]) + fCheck("remove", "Also remove them from this document") + btn("exRun", "Extract and download", "btn primary block"),
  bind: () => { $("#exRun").onclick = async () => {
    let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
    await guard("Extracting…", async () => { await commitPending(true); download(await subDoc(idx), `${baseName()}-pages-${idx.length > 1 ? label(idx) : idx[0] + 1}.pdf`); });
    if (O().remove) {
      if (idx.length >= pageCount()) return toast("Extracted. All pages were kept, because a PDF needs at least one page.");
      docOp("Removing extracted pages…", async () => { for (const i of [...idx].reverse()) S.doc.removePage(i); S.sel = new Set(); });
    } else toast(`Extracted ${idx.length} page${idx.length > 1 ? "s" : ""}.`);
  }; } });

tool({ id: "blank", group: "organise", label: "Insert blank", defaults: { where: "after", size: "same", count: 1 },
  panel: () => head("Insert blank pages", "Add empty pages for notes or to fix double-sided printing.") +
    fSelect("where", "Where", [["after", `After page ${S.cur + 1}`], ["before", `Before page ${S.cur + 1}`], ["end", "At the end"]]) +
    fSelect("size", "Page size", [["same", "Same as current page"], ["a4", "A4 (210 × 297 mm)"], ["letter", "Letter (8.5 × 11 in)"]]) +
    fNum("count", "How many", 1, 20) + btn("bRun", "Insert", "btn primary block"),
  bind: () => { $("#bRun").onclick = () => {
    const o = O(), k = clamp(+o.count || 1, 1, 20);
    docOp("Inserting…", async () => {
      const g = pageGeom(S.doc.getPage(S.cur));
      const size = o.size === "a4" ? [595.28, 841.89] : o.size === "letter" ? [612, 792] : [g.W, g.H];
      let at = o.where === "after" ? S.cur + 1 : o.where === "before" ? S.cur : pageCount();
      for (let i = 0; i < k; i++) S.doc.insertPage(at + i, size);
      S.cur = at; return k;
    }, { ok: n => `Inserted ${n} blank page${n > 1 ? "s" : ""}.` });
  }; } });

tool({ id: "crop", group: "organise", label: "Crop", cursor: "crosshair", kind: "crop",
  panel: () => {
    const r = S.cropRect, W = S.view.W, H = S.view.H, mm = v => (v * 25.4 / 72).toFixed(0);
    return head("Crop pages", "Drag a box on the page around the part you want to keep. The rest is hidden, not deleted, so you can undo the crop later.") +
      (r ? `<div class="note good">Keeping ${mm(r.w)} × ${mm(r.h)} mm · trims top ${mm(r.y)}, left ${mm(r.x)}, right ${mm(W - r.x - r.w)}, bottom ${mm(H - r.y - r.h)} mm</div>` : `<div class="note">No crop box yet. Drag on the page.</div>`) +
      scopeHTML("sc", "this") + btn("cRun", "Apply crop", "btn primary block") + `<div style="height:8px"></div>` + btn("cReset", "Remove crop from these pages", "btn block");
  },
  preview: () => {
    const r = S.cropRect; if (!r) return [];
    const W = S.view.W, H = S.view.H, sh = { fill: "#0b0d12", opacity: 0.5 };
    return [{ k: "rect", x: 0, y: 0, w: W, h: r.y, ...sh }, { k: "rect", x: 0, y: r.y + r.h, w: W, h: H - r.y - r.h, ...sh },
      { k: "rect", x: 0, y: r.y, w: r.x, h: r.h, ...sh }, { k: "rect", x: r.x + r.w, y: r.y, w: W - r.x - r.w, h: r.h, ...sh },
      { k: "rect", x: r.x, y: r.y, w: r.w, h: r.h, stroke: "#2f6fdc", sw: 1.5 / S.scale }];
  },
  bind: () => {
    $("#cRun").onclick = () => {
      const r = S.cropRect; if (!r) return toast("Drag a box on the page first.", true);
      let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
      const f = { x: r.x / S.view.W, y: r.y / S.view.H, w: r.w / S.view.W, h: r.h / S.view.H };
      docOp("Cropping…", async () => {
        for (const i of idx) {
          const p = S.doc.getPage(i), g = pageGeom(p), inv = matInv(g.T);
          const a = matApply(inv, f.x * g.W, f.y * g.H), b = matApply(inv, (f.x + f.w) * g.W, (f.y + f.h) * g.H);
          p.setCropBox(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
        }
        S.cropRect = null; return idx.length;
      }, { ok: n => `Cropped ${n} page${n > 1 ? "s" : ""}.` });
    };
    $("#cReset").onclick = () => {
      let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
      docOp("Removing crop…", async () => { for (const i of idx) { const p = S.doc.getPage(i), m = p.getMediaBox(); p.setCropBox(m.x, m.y, m.width, m.height); } S.cropRect = null; }, { ok: "Crop removed." });
    };
  } });

/* ============================== EDIT ============================== */
const editTip = `<div class="note">Edits stay movable until you save or press <b>Apply edits</b>. Use <b>Select</b> to move or delete them. <span class="kbd">Ctrl Z</span> undoes.</div>`;
tool({ id: "select", group: "edit", label: "Select", cursor: "select",
  panel: () => {
    const objs = S.pending[S.cur] || [];
    const names = { text: "Text", image: "Image", highlight: "Highlight", whiteout: "Whiteout", redact: "Redaction", rect: "Rectangle", ellipse: "Ellipse", line: "Line", arrow: "Arrow", ink: "Drawing" };
    return head("Select & move", "Click an edit on the page to select it. Drag to move, drag the corner to resize, press Delete to remove.") +
      `<h3>Edits on this page</h3><div class="list">${objs.map(o => `<div class="li"><span class="nm">${o.isSign ? "Signature" : names[o.type]}${o.type === "text" ? ": " + esc(o.text.slice(0, 24)) : ""}</span><button data-pick="${o.id}" title="Select">◎</button><button data-del="${o.id}" title="Delete">✕</button></div>`).join("") || `<div class="note">No edits on this page yet.</div>`}</div>` + editTip;
  },
  bind: () => { $("#panel").onclick = e => {
    const p = e.target.closest("[data-pick]"), d = e.target.closest("[data-del]");
    if (p) { S.selObj = p.dataset.pick; renderOverlay(); refreshPanel(); }
    if (d) deleteObj(d.dataset.del);
  }; } });

tool({ id: "text", group: "edit", label: "Add text", cursor: "text", kind: "click", defaults: { text: "Type your text", font: "Helvetica", size: 14, color: "#1b1b1f", bold: false },
  panel: () => head("Add text", "Type below, then click on the page where the text should start.") + fArea("text", "Text") +
    `<div class="grid2">${fSelect("font", "Font", [["Helvetica", "Sans (Helvetica)"], ["Times", "Serif (Times)"], ["Courier", "Mono (Courier)"]])}${fNum("size", "Size (pt)", 6, 96)}</div>` +
    fCheck("bold", "Bold") + fColor("color", "Colour") + editTip,
  place(pt) { const o = O(); if (!o.text.trim()) return toast("Type some text first.", true);
    return { type: "text", x: pt.x, y: pt.y + o.size * 0.8, text: o.text, size: +o.size, font: o.font, bold: o.bold, color: o.color }; } });

tool({ id: "image", group: "edit", label: "Add image", cursor: "place", kind: "click", defaults: { src: null, nw: 1, nh: 1, w: 180 },
  panel: () => { const o = O(); return head("Add image", "Choose a photo or logo, then click on the page to place it. Drag its corner to resize.") +
    (o.src ? `<div class="sig-preview"><img src="${o.src}" alt="Chosen image"></div><div style="height:8px"></div>` : "") +
    btn("imPick", o.src ? "Choose a different image" : "Choose image…", "btn block") + `<div style="height:10px"></div>` + fRange("w", "Width when placed", 40, 500, 10, v => v + " pt") + editTip; },
  bind: () => { $("#imPick").onclick = async () => { const [f] = await pickFiles("image/*"); if (!f) return; const r = await loadImageFile(f); Object.assign(O(), r); refreshPanel(); toast("Now click on the page to place it."); }; },
  place(pt) { const o = O(); if (!o.src) return toast("Choose an image first.", true);
    const w = Math.min(+o.w, S.view.W * 0.9), h = w * o.nh / o.nw;
    return { type: "image", x: pt.x - w / 2, y: pt.y - h / 2, w, h, src: o.src }; } });
async function loadImageFile(f) {
  let src = await readDataURL(f);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(userError(`${f.name} isn't an image this browser can open.`)); i.src = src; });
  if (!/^data:image\/(png|jpe?g)/.test(src)) { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); src = c.toDataURL("image/png"); }
  return { src, nw: img.naturalWidth, nh: img.naturalHeight, name: f.name, size: f.size };
}

tool({ id: "highlight", group: "edit", label: "Highlight", cursor: "crosshair", kind: "box", defaults: { color: "#ffe14d" },
  panel: () => head("Highlight", "Drag across the text you want to mark.") + fColor("color", "Marker colour", HL) + editTip,
  make: (o, r) => ({ type: "highlight", ...r, color: o.color }) });

tool({ id: "draw", group: "edit", label: "Draw", cursor: "crosshair", kind: "ink", defaults: { color: "#2f5bd3", sw: 2 },
  panel: () => head("Draw", "Draw freehand with your mouse, pen or finger.") + fColor("color", "Pen colour") + fRange("sw", "Pen width", 0.5, 12, 0.5, v => v + " pt") + editTip });

tool({ id: "shapes", group: "edit", label: "Shapes", cursor: "crosshair", defaults: { shape: "rect", color: "#d13b2e", sw: 2, fill: false },
  get kind() { return ["line", "arrow"].includes(O("shapes").shape) ? "line" : "box"; },
  panel: () => head("Shapes", "Pick a shape, then drag on the page.") + fSeg("shape", "", [["rect", "▭ Box"], ["ellipse", "◯ Ellipse"], ["line", "╱ Line"], ["arrow", "→ Arrow"]]) +
    fColor("color", "Colour") + fRange("sw", "Line width", 0.5, 12, 0.5, v => v + " pt") + (["rect", "ellipse"].includes(O().shape) ? fCheck("fill", "Light fill inside") : "") + editTip,
  onChange(k) { if (k === "shape") refreshPanel(); },
  make: (o, r) => ({ type: o.shape, ...r, color: o.color, sw: +o.sw, fill: o.fill }) });

tool({ id: "whiteout", group: "edit", label: "Whiteout", cursor: "crosshair", kind: "box",
  panel: () => head("Whiteout", "Drag a white box over something to cover it, like correction tape. Add text on top to replace it.") +
    `<div class="note warn">Whiteout only covers. The words underneath are still in the file and can be copied. To remove private information for good, use <b>Redact</b>.</div>` + editTip,
  make: (o, r) => ({ type: "whiteout", ...r }) });

tool({ id: "redact", group: "edit", label: "Redact", cursor: "crosshair", kind: "box", defaults: { find: "", found: null },
  panel: () => { const o = O(); return head("Redact", "Drag black boxes over private information, or find a word or number everywhere in the file.") +
    `<div class="note">When you save or apply, each page with a redaction is rebuilt as an image with the black boxes burnt in. The hidden text is gone from the file and can't be selected or found. Other text on that page also stops being selectable.</div>` +
    `<h3>Find & redact</h3>` + fText("find", "Word, name or number", "e.g. BSERC-2026-0417") + btn("rdFind", "Mark every match", "btn block") +
    (o.found != null ? `<div class="note ${o.found ? "good" : ""}">${o.found ? `Marked ${o.found} match${o.found > 1 ? "es" : ""}. Check them, then Apply or Save.` : "No matches found."}</div>` : "") + editTip; },
  make: (o, r) => ({ type: "redact", ...r }),
  bind: () => { $("#rdFind").onclick = () => guard("Searching…", async () => {
    const q = O().find.trim(); if (!q) throw userError("Type what to find first.");
    pushHist("pending");
    const n = await findAndMark(q, b => pendingOn(b.page).push({ id: uid(), type: "redact", x: b.x, y: b.y, w: b.w, h: b.h }));
    if (!n) S.hist.pop();
    O().found = n; renderOverlay(); renderPendingBar(); refreshPanel();
  }); } });
const measureCtx = document.createElement("canvas").getContext("2d");
async function findAndMark(q, add) {
  const ql = q.toLowerCase(); let n = 0;
  for (let i = 0; i < S.pdf.numPages; i++) {
    const pg = await S.pdf.getPage(i + 1), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
    for (const it of tc.items) {
      const s = (it.str || "").toLowerCase(); if (!s) continue;
      let from = 0, at;
      while ((at = s.indexOf(ql, from)) >= 0) {
        const tx = pdfjsLib.Util.transform(vp.transform, it.transform), fh = Math.hypot(tx[2], tx[3]), w = it.width * vp.scale;
        // measure with the real font shape so the box lands on the right letters, not an average letter width
        const fam = (tc.styles[it.fontName] || {}).fontFamily || "sans-serif", bold = /bold/i.test(it.fontName + fam);
        measureCtx.font = `${bold ? "bold " : ""}100px ${/serif/i.test(fam) && !/sans/i.test(fam) ? "Times New Roman, serif" : "Helvetica, Arial, sans-serif"}`;
        const full = measureCtx.measureText(it.str).width || 1;
        const x0 = tx[4] + w * measureCtx.measureText(it.str.slice(0, at)).width / full;
        const ww = w * measureCtx.measureText(it.str.slice(at, at + ql.length)).width / full;
        const pad = Math.max(2, fh * 0.25);
        add({ page: i, x: x0 - pad, y: tx[5] - fh * 0.95, w: ww + pad * 2, h: fh * 1.3 });
        n++; from = at + ql.length;
      }
    }
  }
  return n;
}

tool({ id: "sign", group: "edit", label: "Sign", cursor: "place", kind: "click", defaults: { mode: "draw", name: "R. Sharma", style: 0, color: "#1b2a6b", src: null, nw: 1, nh: 1, w: 150 },
  styles: ["'Segoe Script','Brush Script MT','Lucida Handwriting','Apple Chancery',cursive", "'Lucida Handwriting','Segoe Print','Bradley Hand',cursive", "Georgia,'Times New Roman',serif"],
  panel() { const o = O(); return head("Sign", "Draw or type your signature, then click on the page to place it.") +
    fSeg("mode", "", [["draw", "Draw"], ["type", "Type"]]) +
    (o.mode === "draw" ? `<canvas class="sigpad" id="sigPad" width="560" height="200" aria-label="Signature pad"></canvas><div class="row" style="margin-top:6px"><button class="mini" id="sigClear">Clear</button><span></span></div>`
      : fText("name", "Your name") + fSeg("style", "Style", [[0, "Script"], [1, "Handwriting"], [2, "Formal"]])) +
    `<div style="height:10px"></div>` + fColor("color", "Ink", ["#1b2a6b", "#1b1b1f", "#2f5bd3"]) +
    btn("sigUse", "Use this signature", "btn block") +
    (o.src ? `<div class="sig-preview"><img src="${o.src}" alt="Current signature"></div><div class="note good">Click on the page to place it. Drag the corner to resize.</div>` : "") + editTip; },
  onChange(k) { if (k === "mode" || k === "style") refreshPanel(); },
  bind() {
    const o = O(), pad = $("#sigPad");
    if (pad) {
      const ctx = pad.getContext("2d"); let drawing = false, last = null; this.padUsed = false;
      const p = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
      pad.onpointerdown = e => { drawing = true; last = p(e); pad.setPointerCapture(e.pointerId); this.padUsed = true; };
      pad.onpointermove = e => { if (!drawing) return; const q = p(e); ctx.strokeStyle = O().color; ctx.lineWidth = 4.5; ctx.lineCap = ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...q); ctx.stroke(); last = q; };
      pad.onpointerup = () => drawing = false;
      $("#sigClear").onclick = () => { ctx.clearRect(0, 0, pad.width, pad.height); this.padUsed = false; };
    }
    $("#sigUse").onclick = () => {
      let c;
      if (o.mode === "draw") { if (!this.padUsed) return toast("Draw your signature in the box first.", true); c = pad; }
      else {
        if (!o.name.trim()) return toast("Type your name first.", true);
        c = document.createElement("canvas"); c.width = 900; c.height = 260; const x = c.getContext("2d");
        x.fillStyle = o.color; x.font = `${o.style == 2 ? "italic " : ""}96px ${this.styles[o.style]}`; x.textBaseline = "middle"; x.fillText(o.name, 30, 130);
      }
      const t = trimCanvas(c); if (!t) return toast("The signature looks empty.", true);
      Object.assign(o, { src: t.toDataURL("image/png"), nw: t.width, nh: t.height });
      refreshPanel(); toast("Signature ready. Click on the page to place it.");
    };
  },
  place(pt) { const o = O(); if (!o.src) return toast("Make your signature first, then press “Use this signature”.", true);
    const w = Math.min(+o.w, S.view.W * 0.6), h = w * o.nh / o.nw;
    return { type: "image", isSign: true, x: pt.x - w / 2, y: pt.y - h / 2, w, h, src: o.src }; } });
function trimCanvas(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const p = 8, o = document.createElement("canvas"); o.width = x1 - x0 + 2 * p; o.height = y1 - y0 + 2 * p;
  o.getContext("2d").drawImage(c, x0 - p, y0 - p, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

tool({ id: "forms", group: "edit", label: "Fill forms", defaults: { flatten: false, vals: {} },
  fields() {
    let form; try { form = S.doc.getForm(); } catch (e) { return []; }
    const refs = S.doc.getPages().map(p => p.ref);
    return form.getFields().map(f => {
      let page = -1; try { const w = f.acroField.getWidgets()[0]; const pr = w && w.P(); page = pr ? refs.findIndex(r => r === pr || (r.objectNumber === pr.objectNumber)) : -1; } catch (e) { }
      const c = f.constructor.name;
      let type = f instanceof PDFLib.PDFTextField ? "text" : f instanceof PDFLib.PDFCheckBox ? "check" : f instanceof PDFLib.PDFDropdown ? "drop" : f instanceof PDFLib.PDFRadioGroup ? "radio" : f instanceof PDFLib.PDFOptionList ? "list" : "other";
      let value = "", options = [];
      try {
        if (type === "text") value = f.getText() || "";
        if (type === "check") value = f.isChecked();
        if (type === "drop" || type === "list") { options = f.getOptions(); value = f.getSelected()[0] || ""; }
        if (type === "radio") { options = f.getOptions(); value = f.getSelected() || ""; }
      } catch (e) { }
      return { f, name: f.getName(), type, value, options, page, ro: f.isReadOnly() };
    });
  },
  panel() {
    const fs = this.fields(), o = O();
    if (!fs.length) return head("Fill forms", "Type into the fillable boxes of a form.") + `<div class="note">This PDF has no fillable form fields. To write on a printed-style form, use <b>Add text</b> instead.</div>`;
    return head("Fill forms", `This PDF has ${fs.length} fillable field${fs.length > 1 ? "s" : ""}. Fill them in, then press Fill form.`) +
      fs.map((x, i) => {
        const v = o.vals[x.name] ?? x.value, id = "ff" + i;
        let input = "";
        if (x.type === "text") input = `<input class="inp" id="${id}" data-ff="${esc(x.name)}" value="${esc(v)}" ${x.ro ? "disabled" : ""}>`;
        else if (x.type === "check") input = `<label class="check"><input type="checkbox" id="${id}" data-ff="${esc(x.name)}" ${v ? "checked" : ""}> Ticked</label>`;
        else if (x.type === "drop" || x.type === "list" || x.type === "radio") input = `<select class="inp" id="${id}" data-ff="${esc(x.name)}"><option value="">—</option>${x.options.map(op => `<option ${op === v ? "selected" : ""}>${esc(op)}</option>`).join("")}</select>`;
        else input = `<div class="note">This kind of field can't be filled here.</div>`;
        return `<div class="formfield"><div class="ft"><span>${esc(x.name)}</span>${x.page >= 0 ? `<button data-go="${x.page}">Page ${x.page + 1}</button>` : ""}</div>${input}</div>`;
      }).join("") + fCheck("flatten", "Flatten after filling (fields become normal text and can't be changed)") + btn("ffRun", "Fill form", "btn primary block");
  },
  bind() {
    const o = O();
    $("#panel").oninput = $("#panel").onchange = e => { const el = e.target.closest("[data-ff]"); if (el) o.vals[el.dataset.ff] = el.type === "checkbox" ? el.checked : el.value; };
    $("#panel").onclick = e => { const g = e.target.closest("[data-go]"); if (g) gotoPage(+g.dataset.go); };
    const run = $("#ffRun"); if (!run) return;
    run.onclick = () => docOp("Filling form…", async () => {
      let n = 0;
      for (const x of this.fields()) {
        if (!(x.name in o.vals)) continue; const v = o.vals[x.name];
        try {
          if (x.type === "text") x.f.setText(String(v));
          else if (x.type === "check") v ? x.f.check() : x.f.uncheck();
          else if (x.type === "radio") v ? x.f.select(v) : x.f.clear();
          else if (x.type === "drop" || x.type === "list") v ? x.f.select(v) : x.f.clear();
          n++;
        } catch (e) { console.warn(e); }
      }
      if (o.flatten) S.doc.getForm().flatten();
      o.vals = {}; return n;
    }, { ok: n => o.flatten ? "Form filled and flattened." : `Filled ${n} field${n === 1 ? "" : "s"}.` });
  } });

/* ============================== STAMP ============================== */
function stampApply(label, prims, okMsg) {
  let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
  docOp(label, async () => {
    for (const i of idx) { const p = S.doc.getPage(i), g = pageGeom(p); await drawPrims(p, prims(i, g.W, g.H, idx)); }
    return idx.length;
  }, { ok: n => `${okMsg} ${n} page${n > 1 ? "s" : ""}.` });
}
const stampPreview = fn => () => { if (!inScope(S.cur)) return []; let idx; try { idx = resolveScope(); } catch (e) { idx = [S.cur]; } return fn(S.cur, S.view.W, S.view.H, idx); };
function placeText(text, size, font, bold, pos, W, H, margin) {
  const w = textWidth(text, size, font, bold), [v, h] = pos.split("-");
  const x = h === "left" ? margin : h === "right" ? W - margin - w : (W - w) / 2;
  const y = v === "top" ? margin + size * 0.8 : H - margin;
  return { x, y };
}
const POS6 = [["top-left", "↖"], ["top-center", "↑"], ["top-right", "↗"], ["bottom-left", "↙"], ["bottom-center", "↓"], ["bottom-right", "↘"]];

tool({ id: "watermark", group: "stamp", label: "Watermark", defaults: { text: "DRAFT", size: 72, color: "#d13b2e", opacity: 0.18, angle: -40, bold: true, scope: "all" },
  panel: () => head("Watermark", "Write a large faded word across pages. The preview shows on this page.") + fText("text", "Watermark text") +
    `<div class="grid2">${fNum("size", "Size (pt)", 10, 200)}${fSelect("angle", "Angle", [[-40, "Diagonal ↗"], [0, "Flat"], [40, "Diagonal ↘"], [-90, "Up the side"]])}</div>` +
    fRange("opacity", "Opacity", 0.05, 1, 0.01, fmtPct) + fColor("color", "Colour", ["#d13b2e", "#1b1b1f", "#2f5bd3", "#8a909c"]) + fCheck("bold", "Bold") + scopeHTML("sc", "all") + btn("wmRun", "Add watermark", "btn primary block"),
  prims(i, W, H) {
    const o = O("watermark"); if (!o.text.trim()) return [];
    const size = +o.size, w = textWidth(o.text, size, "Helvetica", o.bold), th = +o.angle * Math.PI / 180;
    const ux = Math.cos(th), uy = Math.sin(th), vx = -Math.sin(th), vy = Math.cos(th); // text direction and its "down" in view space
    const x = W / 2 - ux * w / 2 + vx * size * 0.35, y = H / 2 - uy * w / 2 + vy * size * 0.35;
    return [{ k: "text", x, y, text: o.text, size, font: "Helvetica", bold: o.bold, color: o.color, opacity: +o.opacity, rotate: +o.angle }];
  },
  get preview() { return stampPreview((i, W, H) => this.prims(i, W, H)); },
  bind() { $("#wmRun").onclick = () => stampApply("Adding watermark…", (i, W, H) => this.prims(i, W, H), "Watermarked"); } });

tool({ id: "pagenum", group: "stamp", label: "Page numbers", defaults: { fmt: "n", pos: "bottom-center", size: 10, start: 1, margin: 28, color: "#1b1b1f", skipFirst: false, scope: "all" },
  panel: () => head("Page numbers", "Number the pages. Count starts from the first page you number.") +
    fSelect("fmt", "Style", [["n", "1"], ["page", "Page 1"], ["of", "Page 1 of 10"], ["slash", "1 / 10"], ["dash", "– 1 –"]]) + fSeg("pos", "Position", POS6) +
    `<div class="grid2">${fNum("start", "Start at", 0, 9999)}${fNum("size", "Size (pt)", 6, 36)}</div>` + fRange("margin", "Distance from edge", 10, 80, 1, v => v + " pt") +
    fColor("color", "Colour") + fCheck("skipFirst", "Don't number the first page (cover)") + scopeHTML("sc", "all") + btn("pnRun", "Add page numbers", "btn primary block"),
  prims(i, W, H, idx) {
    const o = O("pagenum"); let list = idx; if (o.skipFirst) list = idx.slice(1);
    const k = list.indexOf(i); if (k < 0) return [];
    const n = +o.start + k, tot = +o.start + list.length - 1;
    const t = { n: `${n}`, page: `Page ${n}`, of: `Page ${n} of ${tot}`, slash: `${n} / ${tot}`, dash: `– ${n} –` }[o.fmt];
    const { x, y } = placeText(t, +o.size, "Helvetica", false, o.pos, W, H, +o.margin);
    return [{ k: "text", x, y, text: t, size: +o.size, font: "Helvetica", color: o.color }];
  },
  get preview() { return stampPreview((i, W, H, idx) => this.prims(i, W, H, idx)); },
  bind() { $("#pnRun").onclick = () => stampApply("Numbering pages…", (i, W, H, idx) => this.prims(i, W, H, idx), "Numbered"); } });

tool({ id: "headfoot", group: "stamp", label: "Header & footer", defaults: { header: "", hAlign: "left", footer: "{file} · {date}", fAlign: "left", size: 9, margin: 26, color: "#5b616e", scope: "all" },
  panel: () => head("Header & footer", "Add a line of text at the top and bottom of pages.") +
    fText("header", "Header text", "Leave empty for none") + fSeg("hAlign", "", [["left", "Left"], ["center", "Centre"], ["right", "Right"]]) +
    fText("footer", "Footer text", "Leave empty for none") + fSeg("fAlign", "", [["left", "Left"], ["center", "Centre"], ["right", "Right"]]) +
    `<div class="note">You can use <b>{page}</b>, <b>{total}</b>, <b>{date}</b> and <b>{file}</b> in the text.</div>` +
    `<div class="grid2">${fNum("size", "Size (pt)", 6, 24)}${fNum("margin", "From edge (pt)", 8, 80)}</div>` + fColor("color", "Colour", ["#5b616e", "#1b1b1f", "#2f5bd3", "#d13b2e"]) + scopeHTML("sc", "all") + btn("hfRun", "Add header & footer", "btn primary block"),
  prims(i, W, H, idx) {
    const o = O("headfoot"), out = [], tot = idx.length, k = idx.indexOf(i) + 1;
    const fill = s => s.replace(/\{page\}/g, k).replace(/\{total\}/g, tot).replace(/\{date\}/g, new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })).replace(/\{file\}/g, baseName());
    for (const [t, a, v] of [[o.header, o.hAlign, "top"], [o.footer, o.fAlign, "bottom"]]) {
      if (!t.trim()) continue; const s = fill(t); const { x, y } = placeText(s, +o.size, "Helvetica", false, `${v}-${a}`, W, H, +o.margin);
      out.push({ k: "text", x, y, text: s, size: +o.size, font: "Helvetica", color: o.color });
    }
    return out;
  },
  get preview() { return stampPreview((i, W, H, idx) => this.prims(i, W, H, idx)); },
  bind() { $("#hfRun").onclick = () => stampApply("Adding header & footer…", (i, W, H, idx) => this.prims(i, W, H, idx), "Added to"); } });

tool({ id: "datestamp", group: "stamp", label: "Date stamp", defaults: { prefix: "RECEIVED", fmt: "dmy", time: false, pos: "top-right", color: "#d13b2e", boxed: true, size: 11, scope: "this" },
  panel: () => head("Date stamp", "Stamp today's date, like an office rubber stamp.") + fText("prefix", "Label above the date", "e.g. RECEIVED, APPROVED, PAID") +
    fSelect("fmt", "Date format", [["dmy", "05 Nov 2026"], ["iso", "2026-11-05"], ["num", "05/11/2026"], ["long", "Thursday, 5 November 2026"]]) + fCheck("time", "Include the time") +
    fSeg("pos", "Corner", POS6) + `<div class="grid2">${fNum("size", "Size (pt)", 7, 30)}<div></div></div>` + fColor("color", "Ink", ["#d13b2e", "#2f5bd3", "#1d8a55", "#1b1b1f"]) + fCheck("boxed", "Draw a stamp border") +
    scopeHTML("sc", "this") + btn("dsRun", "Stamp", "btn primary block"),
  dateText() {
    const o = O("datestamp"), d = new Date();
    const opts = { dmy: { day: "2-digit", month: "short", year: "numeric" }, long: { weekday: "long", day: "numeric", month: "long", year: "numeric" } };
    let s = o.fmt === "iso" ? d.toISOString().slice(0, 10) : o.fmt === "num" ? d.toLocaleDateString("en-GB") : d.toLocaleDateString("en-GB", opts[o.fmt]);
    if (o.time) s += " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return s;
  },
  prims(i, W, H) {
    const o = O("datestamp"), sz = +o.size, date = this.dateText(), pre = o.prefix.trim().toUpperCase();
    const wPre = pre ? textWidth(pre, sz * 0.85, "Helvetica", true) : 0, wDate = textWidth(date, sz, "Helvetica", true);
    const pad = sz * 0.7, bw = Math.max(wPre, wDate) + pad * 2, bh = (pre ? sz * 0.85 * 1.3 : 0) + sz * 1.3 + pad * 1.2, m = 30;
    const [v, h] = o.pos.split("-");
    const bx = h === "left" ? m : h === "right" ? W - m - bw : (W - bw) / 2, by = v === "top" ? m : H - m - bh;
    const out = [];
    if (o.boxed) out.push({ k: "rect", x: bx, y: by, w: bw, h: bh, stroke: o.color, sw: 1.6, rx: 3 });
    let y = by + pad * 0.6;
    if (pre) { y += sz * 0.85; out.push({ k: "text", x: bx + (bw - wPre) / 2, y, text: pre, size: sz * 0.85, bold: true, font: "Helvetica", color: o.color }); y += sz * 0.85 * 0.3; }
    y += sz; out.push({ k: "text", x: bx + (bw - wDate) / 2, y, text: date, size: sz, bold: true, font: "Helvetica", color: o.color });
    return out;
  },
  get preview() { return stampPreview((i, W, H) => this.prims(i, W, H)); },
  bind() { $("#dsRun").onclick = () => stampApply("Stamping…", (i, W, H) => this.prims(i, W, H), "Stamped"); } });

/* ============================== CONVERT ============================== */
tool({ id: "img2pdf", group: "convert", label: "Images to PDF", needsDoc: false, defaults: { imgs: [], size: "fit", margin: 0 },
  panel: () => {
    const o = O();
    return head("Images to PDF", "Turn photos or scans into one PDF, one image per page.") +
      `<div class="list">${o.imgs.map((m, i) => `<div class="li"><img src="${m.src}" alt=""><span class="nm">${esc(m.name)}</span><span class="sz">${fmtBytes(m.size)}</span><button data-mv="${i}" title="Move up">↑</button><button data-rm="${i}" title="Remove">✕</button></div>`).join("") || `<div class="note">No images yet. JPG and PNG work best.</div>`}</div>` +
      btn("iAdd", "Add images…", "btn block") + `<div style="height:10px"></div>` +
      fSelect("size", "Page size", [["fit", "Same as each image"], ["a4", "A4"], ["letter", "Letter"]]) +
      (O().size !== "fit" ? fSelect("margin", "Margin", [[0, "None"], [20, "Small"], [40, "Large"]]) : "") +
      `<div class="btns">${btn("iNew", `Create PDF${o.imgs.length ? ` (${o.imgs.length} page${o.imgs.length > 1 ? "s" : ""})` : ""}`, "btn primary block")}${S.doc ? btn("iAppend", "Add to the end of this PDF", "btn block") : ""}</div>`;
  },
  onChange(k) { if (k === "size") refreshPanel(); },
  bind() {
    const o = O();
    $("#iAdd").onclick = async () => { await addImages(await pickFiles("image/*", true)); };
    $("#panel").onclick = e => {
      const rm = e.target.closest("[data-rm]"), mv = e.target.closest("[data-mv]");
      if (rm) { o.imgs.splice(+rm.dataset.rm, 1); refreshPanel(); }
      if (mv && +mv.dataset.mv > 0) { const i = +mv.dataset.mv; [o.imgs[i - 1], o.imgs[i]] = [o.imgs[i], o.imgs[i - 1]]; refreshPanel(); }
    };
    const build = async target => {
      for (const m of o.imgs) {
        const img = m.src.startsWith("data:image/png") ? await target.embedPng(dataURLBytes(m.src)) : await target.embedJpg(dataURLBytes(m.src));
        let pw, ph, w, h;
        if (o.size === "fit") { w = pw = img.width * 0.75; h = ph = img.height * 0.75; }
        else {
          [pw, ph] = o.size === "a4" ? [595.28, 841.89] : [612, 792];
          if (img.width > img.height) [pw, ph] = [ph, pw];
          const mg = +o.margin, s = Math.min((pw - 2 * mg) / img.width, (ph - 2 * mg) / img.height); w = img.width * s; h = img.height * s;
        }
        target.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
    };
    $("#iNew").onclick = () => { if (!o.imgs.length) return toast("Add at least one image.", true);
      if (S.doc && (S.dirty || pendingCount()) && !confirmDiscard()) return;
      guard("Creating PDF…", async () => {
        const d = await PDFDocument.create(); await build(d); const n = o.imgs.length;
        o.imgs = []; await openBytes(await d.save(), "images.pdf"); setTool("img2pdf"); toast(`Created a ${n}-page PDF. Press Save PDF to download it.`);
      }); };
    const ap = $("#iAppend"); if (ap) ap.onclick = () => { if (!o.imgs.length) return toast("Add at least one image.", true);
      docOp("Adding images…", async () => { const n = o.imgs.length; await build(S.doc); o.imgs = []; S.cur = pageCount() - 1; return n; }, { ok: n => `Added ${n} page${n > 1 ? "s" : ""}.` }); };
  } });
async function addImages(files) {
  const o = O("img2pdf");
  for (const f of files) { try { o.imgs.push(await loadImageFile(f)); } catch (e) { toast(e.userMsg || `${f.name} couldn't be opened.`, true); } }
  refreshPanel();
}

tool({ id: "pdf2img", group: "convert", label: "PDF to images", defaults: { fmt: "png", dpi: 150, scope: "all" },
  panel: () => head("PDF to images", "Save pages as pictures. Several pages come as one ZIP file.") + fSeg("fmt", "Format", [["png", "PNG (sharp)"], ["jpg", "JPG (smaller)"]]) +
    fSeg("dpi", "Quality", [[72, "72 dpi"], [150, "150 dpi"], [300, "300 dpi"]]) + scopeHTML("sc", "all") + btn("p2iRun", "Export images", "btn primary block"),
  bind: () => { $("#p2iRun").onclick = () => {
    let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
    guard("Exporting…", async () => {
      await commitPending(true);
      const o = O(), sc = +o.dpi / 72, type = o.fmt === "png" ? "image/png" : "image/jpeg", ext = o.fmt;
      const zip = idx.length > 1 ? new JSZip() : null; let total = 0;
      for (let k = 0; k < idx.length; k++) {
        busyText(`Rendering page ${idx[k] + 1} (${k + 1} of ${idx.length})…`);
        const c = await renderToCanvas(S.pdf, idx[k], sc);
        const b = await canvasBlob(c, type, 0.9); total += b.size;
        const name = `${baseName()}-page-${String(idx[k] + 1).padStart(String(pageCount()).length, "0")}.${ext}`;
        if (zip) zip.file(name, b); else download(b, name, type);
      }
      if (zip) download(await zip.generateAsync({ type: "blob" }), `${baseName()}-images.zip`, "application/zip");
      toast(`Exported ${idx.length} image${idx.length > 1 ? "s" : ""} · ${fmtBytes(total)}`);
    });
  }; } });
async function renderToCanvas(pdf, i, scale) {
  const pg = await pdf.getPage(i + 1), vp = pg.getViewport({ scale });
  const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
async function pageText(pdf, i) {
  const tc = await (await pdf.getPage(i + 1)).getTextContent();
  return tc.items.map(it => (it.str || "") + (it.hasEOL ? "\n" : "")).join("").replace(/[ \t]+\n/g, "\n").trim();
}

tool({ id: "pdf2text", group: "convert", label: "PDF to text", defaults: { scope: "all", out: null },
  panel: () => { const o = O(); return head("PDF to text", "Pull out all the text so you can copy or edit it. Scanned pages (pictures of text) have no text to pull out.") + scopeHTML("sc", "all") + btn("p2tRun", "Extract text", "btn primary block") +
    (o.out != null ? `<h3>Result · ${o.words} words</h3><textarea class="textout" readonly id="p2tOut">${esc(o.out)}</textarea><div class="btn-grid" style="margin-top:8px">${btn("p2tCopy", "Copy", "btn")}${btn("p2tSave", "Download .txt", "btn")}</div>` : ""); },
  bind: () => {
    const o = O();
    $("#p2tRun").onclick = () => { let idx; try { idx = resolveScope(); } catch (e) { return toast(e.userMsg, true); }
      guard("Reading text…", async () => { await commitPending(true); const parts = [];
        for (const i of idx) parts.push(`--- Page ${i + 1} ---\n` + (await pageText(S.pdf, i) || "(no text on this page)"));
        o.out = parts.join("\n\n"); o.words = (o.out.match(/\S+/g) || []).length - idx.length * 3; refreshPanel(); }); };
    if (o.out != null) {
      $("#p2tCopy").onclick = async () => { try { await navigator.clipboard.writeText(o.out); toast("Text copied."); } catch (e) { $("#p2tOut").select(); document.execCommand("copy"); toast("Text copied."); } };
      $("#p2tSave").onclick = () => download(o.out, baseName() + ".txt", "text/plain;charset=utf-8");
    }
  } });

/* ============================== FINISH ============================== */
tool({ id: "compress", group: "finish", label: "Compress", defaults: { mode: "smart", quality: 0.6, dpi: 110, maxpx: 1400, result: null },
  panel: () => {
    const o = O(), before = S.bytes.length, r = o.result;
    let res = "";
    if (r) {
      const max = Math.max(before, r.size), pct = Math.round((1 - r.size / before) * 100);
      res = `<div class="sizes"><div class="sizebar"><div class="top-l"><span>Before</span><b>${fmtBytes(before)}</b></div><div class="bar"><i style="width:${before / max * 100}%"></i></div></div>
        <div class="sizebar after"><div class="top-l"><span>After</span><b>${fmtBytes(r.size)}</b></div><div class="bar"><i style="width:${r.size / max * 100}%"></i></div></div></div>` +
        (pct > 0 ? `<div class="saving">−${pct}%</div><p class="desc">${fmtBytes(before - r.size)} smaller.${o.mode === "smart" && o.note ? " " + esc(o.note) : ""}</p>` : `<div class="note warn">This file is already compact; compressing didn't make it smaller. Keep the original.</div>`) +
        (pct <= 0 && o.mode === "images" ? `<div class="note">Strong works best on scanned pages and photos. For a typed document like this, try <b>Recommended</b>.</div>` : "") +
        (pct > 0 ? `<div class="btns">${btn("cUse", "Use the smaller version", "btn primary block")}${btn("cDl", "Download smaller version", "btn block")}</div>` : "");
    }
    return head("Compress", "Make the file smaller to email or upload. You see the size before and after, and nothing changes until you choose to use it.") +
      fSeg("mode", "Method", [["smart", "Recommended"], ["images", "Strong"], ["clean", "Lossless"]]) +
      (o.mode === "smart" ? `<div class="note">Recommended: photos and figures inside the PDF are shrunk and saved as lighter JPGs. Text stays sharp and selectable.</div>` + fRange("quality", "Picture quality", 0.3, 0.9, 0.05, fmtPct) + fSelect("maxpx", "Largest picture size", [[800, "800 px (smallest)"], [1400, "1400 px (balanced)"], [2000, "2000 px (sharp)"]])
      : o.mode === "images" ? `<div class="note">Strong: pages are re-drawn as JPG pictures. Big savings on scans and photos, but text stops being selectable.</div>` + fRange("quality", "Picture quality", 0.3, 0.9, 0.05, fmtPct) + fRange("dpi", "Resolution", 72, 200, 2, v => v + " dpi")
        : `<div class="note">Lossless: rebuilds the file and drops unused data. Everything stays exactly the same; savings are usually small.</div>`) +
      btn("cRun", "Compress", "btn block") + res;
  },
  onChange(k) { O().result = null; refreshPanel(); },
  bind() {
    const o = O();
    $("#cRun").onclick = () => guard("Compressing…", async () => {
      if (await commitPending(true)) toast("Your pending edits were applied first.");
      let bytes;
      if (o.mode === "smart") {
        const d = await PDFDocument.load(S.bytes, { updateMetadata: false });
        const r = await shrinkImages(d, +o.quality, +o.maxpx);
        bytes = await d.save({ useObjectStreams: true });
        o.note = r.n ? `${r.n} picture${r.n > 1 ? "s" : ""} shrunk, ${r.skipped} left as they were.` : "No pictures could be made smaller.";
      } else if (o.mode === "clean") {
        const d = await PDFDocument.create(); (await d.copyPages(S.doc, S.doc.getPageIndices())).forEach(p => d.addPage(p));
        for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"]) { const v = S.doc["get" + k]?.(); if (v) try { k === "Keywords" ? d.setKeywords([v]) : d["set" + k](v); } catch (e) { } }
        bytes = await d.save({ useObjectStreams: true });
      } else {
        const d = await PDFDocument.create(), sc = +o.dpi / 72;
        for (let i = 0; i < pageCount(); i++) {
          busyText(`Compressing page ${i + 1} of ${pageCount()}…`);
          const c = await renderToCanvas(S.pdf, i, sc), img = await d.embedJpg(await canvasBytes(c, "image/jpeg", +o.quality));
          const W = c.width / sc, H = c.height / sc; d.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
        }
        bytes = await d.save({ useObjectStreams: true });
      }
      o.result = { size: bytes.length, bytes }; refreshPanel();
    });
    if ($("#cUse")) {
      $("#cUse").onclick = () => guard("Switching…", async () => { pushHist("doc"); S.doc = await PDFDocument.load(o.result.bytes, { updateMetadata: false }); S.bytes = o.result.bytes; o.result = null; await reload(false); refreshPanel(); toast("Now using the compressed version. Save PDF to download it."); });
      $("#cDl").onclick = () => download(o.result.bytes, baseName() + "-compressed.pdf");
    }
  } });

const META = [["Title", "title"], ["Author", "author"], ["Subject", "subject"], ["Keywords", "keywords"], ["Creator", "creator"], ["Producer", "producer"]];
function readMeta() {
  const m = {};
  for (const [K] of META) { try { m[K] = S.doc["get" + K]() || ""; } catch (e) { m[K] = ""; } }
  try { m.Created = S.doc.getCreationDate()?.toLocaleString("en-GB") || ""; } catch (e) { m.Created = ""; }
  try { m.Modified = S.doc.getModificationDate()?.toLocaleString("en-GB") || ""; } catch (e) { m.Modified = ""; }
  m.XMP = !!S.doc.catalog.get(PDFName.of("Metadata"));
  return m;
}
tool({ id: "meta", group: "finish", label: "Edit details", defaults: {},
  panel() { const m = readMeta(), o = O(); META.forEach(([K, k]) => { if (o[k] == null) o[k] = m[K]; });
    return head("Edit details", "Change the hidden details stored in the file. They show in a PDF reader's Properties window and in search results.") +
      META.map(([K, k]) => fText(k, K)).join("") + `<dl class="kv"><dt>Created</dt><dd>${esc(m.Created || "—")}</dd><dt>Modified</dt><dd>${esc(m.Modified || "—")}</dd></dl>` + btn("mdRun", "Save details", "btn primary block"); },
  bind() { $("#mdRun").onclick = () => docOp("Saving details…", async () => {
    const o = O();
    S.doc.setTitle(o.title || ""); S.doc.setAuthor(o.author || ""); S.doc.setSubject(o.subject || "");
    S.doc.setKeywords((o.keywords || "").split(/[,;]\s*|\s+/).filter(Boolean)); S.doc.setCreator(o.creator || ""); S.doc.setProducer(o.producer || "");
    S.doc.setModificationDate(new Date());
    for (const [, k] of META) delete o[k];
  }, { ok: "Details saved." }); } });

tool({ id: "clean", group: "finish", label: "Remove details",
  panel() { const m = readMeta(), present = META.filter(([K]) => m[K]).concat(m.Created ? [["Created"]] : [], m.Modified ? [["Modified"]] : []);
    return head("Remove details", "Strip hidden details like author name, software and dates before you share the file.") +
      (present.length || m.XMP ? `<h3>Found in this file</h3><dl class="kv">${present.map(([K]) => `<dt>${K}</dt><dd>${esc(m[K])}</dd>`).join("")}${m.XMP ? `<dt>XMP</dt><dd>Extra metadata block</dd>` : ""}</dl>` + btn("clRun", "Remove all details", "btn primary block")
        : `<div class="note good">This file has no hidden details.</div>`); },
  bind() { const b = $("#clRun"); if (b) b.onclick = () => docOp("Removing details…", async () => {
    const info = S.doc.getInfoDict();
    for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"]) info.delete(PDFName.of(k));
    S.doc.catalog.delete(PDFName.of("Metadata"));
    OPT.meta = null;
  }, { ok: "All details removed." }); } });

tool({ id: "compare", group: "finish", label: "Compare", defaults: { src: "original", other: null, res: null },
  panel() {
    const o = O(), r = o.res;
    let out = "";
    if (r) {
      const changed = r.pages.filter(p => p.changed);
      out = `<div class="note ${changed.length ? "" : "good"}"><b>${r.aName}</b> (${r.aN} pages) vs <b>${r.bName}</b> (${r.bN} pages). ${changed.length ? `${changed.length} page${changed.length > 1 ? "s" : ""} differ.` : "The text of every page matches."}</div>` +
        changed.map(p => `<div class="diff-page"><div class="dh"><span>Page ${p.i + 1}</span><span style="font-weight:400;color:var(--muted)">${p.note}</span><button class="mini" data-vd="${p.i}">See difference</button></div><div class="dt">${p.html}</div><div id="vd-${p.i}"></div></div>`).join("");
    }
    return head("Compare two PDFs", "Find what changed between two versions. Text is compared page by page; you can also see the pixels that changed.") +
      fSeg("src", "Compare this document with", [["original", "The file as I opened it"], ["file", "Another PDF"]]) +
      (o.src === "file" ? btn("cmPick", o.other ? `✓ ${esc(o.other.name)} · change` : "Choose the other PDF…", "btn block") + `<div style="height:8px"></div>` : "") +
      btn("cmRun", "Compare", "btn primary block") + `<div style="height:12px"></div>` + out;
  },
  onChange(k) { if (k === "src") { O().res = null; refreshPanel(); } },
  bind() {
    const o = O();
    const pk = $("#cmPick"); if (pk) pk.onclick = async () => { const [f] = await pickFiles("application/pdf,.pdf"); if (!f) return; o.other = { name: f.name, bytes: await readFile(f) }; o.res = null; refreshPanel(); };
    $("#cmRun").onclick = () => guard("Comparing…", async () => {
      await commitPending(true);
      let aBytes, aName;
      if (o.src === "file") { if (!o.other) throw userError("Choose the other PDF first."); aBytes = o.other.bytes; aName = o.other.name; }
      else { aBytes = S.originalBytes; aName = "Original " + S.name; }
      const A = await pdfjsLib.getDocument({ data: aBytes.slice() }).promise, B = S.pdf;
      this.A = A;
      const n = Math.max(A.numPages, B.numPages), pages = [];
      for (let i = 0; i < n; i++) {
        busyText(`Comparing page ${i + 1} of ${n}…`);
        if (i >= A.numPages) { pages.push({ i, changed: true, note: "only in this version", html: "<ins>New page</ins>" }); continue; }
        if (i >= B.numPages) { pages.push({ i, changed: true, note: "missing here", html: "<del>Page removed</del>" }); continue; }
        const [ta, tb] = [await pageText(A, i), await pageText(B, i)];
        const d = wordDiff(ta, tb);
        let pix = false;
        if (!d.changed) pix = await pixelsDiffer(A, B, i);
        pages.push({ i, changed: d.changed || pix, note: d.changed ? `${d.add} added · ${d.del} removed` : "looks different", html: d.changed ? d.html : "Text is the same; something visual changed." });
      }
      o.res = { pages, aName, bName: "This version", aN: A.numPages, bN: B.numPages }; refreshPanel();
    });
    $("#panel").onclick = async e => {
      const b = e.target.closest("[data-vd]"); if (!b || !this.A) return;
      const i = +b.dataset.vd, box = $("#vd-" + i);
      if (box.innerHTML) { box.innerHTML = ""; return; }
      await guard("Drawing difference…", async () => {
        const ca = i < this.A.numPages ? await renderToCanvas(this.A, i, 0.8) : null, cb = i < S.pdf.numPages ? await renderToCanvas(S.pdf, i, 0.8) : null;
        const out = document.createElement("canvas"), base = cb || ca; out.width = base.width; out.height = base.height;
        const x = out.getContext("2d"); x.drawImage(base, 0, 0);
        if (ca && cb) {
          const da = ca.getContext("2d").getImageData(0, 0, out.width, out.height).data, img = x.getImageData(0, 0, out.width, out.height), db = img.data;
          for (let p = 0; p < db.length; p += 4) {
            const diff = Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]);
            if (diff > 60) { db[p] = 230; db[p + 1] = 40; db[p + 2] = 30; } else { db[p] = 255 - (255 - db[p]) * 0.35; db[p + 1] = 255 - (255 - db[p + 1]) * 0.35; db[p + 2] = 255 - (255 - db[p + 2]) * 0.35; }
          }
          x.putImageData(img, 0, 0);
        }
        box.innerHTML = `<div class="vdiff"><div><span>Before</span></div><div><span>Changes in red</span></div></div>`;
        const cols = box.querySelectorAll(".vdiff>div");
        if (ca) cols[0].prepend(ca); cols[1].prepend(out);
      });
    };
  } });
async function pixelsDiffer(A, B, i) {
  const a = await renderToCanvas(A, i, 0.4), b = await renderToCanvas(B, i, 0.4);
  if (a.width !== b.width || a.height !== b.height) return true;
  const da = a.getContext("2d").getImageData(0, 0, a.width, a.height).data, db = b.getContext("2d").getImageData(0, 0, a.width, a.height).data;
  let n = 0; for (let p = 0; p < da.length; p += 4) if (Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]) > 90) n++;
  return n > 12;
}
function wordDiff(a, b) {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
  if (A.join(" ") === B.join(" ")) return { changed: false };
  const n = A.length, m = B.length;
  if (n * m > 4e6) return { changed: true, add: m, del: n, html: "Too much text to compare word by word on this page." };
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { ops.push(["=", A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(["-", A[i++]]); else ops.push(["+", B[j++]]); }
  while (i < n) ops.push(["-", A[i++]]); while (j < m) ops.push(["+", B[j++]]);
  let html = "", add = 0, del = 0, run = [];
  const flush = () => { if (run.length > 14) html += esc(run.slice(0, 5).join(" ")) + ` <span style="opacity:.6">… ${run.length - 10} words …</span> ` + esc(run.slice(-5).join(" ")) + " "; else if (run.length) html += esc(run.join(" ")) + " "; run = []; };
  for (const [t, w] of ops) { if (t === "=") { run.push(w); continue; } flush(); if (t === "+") { add++; html += `<ins>${esc(w)}</ins> `; } else { del++; html += `<del>${esc(w)}</del> `; } }
  flush();
  return { changed: true, add, del, html };
}

/* Recompress pictures inside the PDF: decode each image, scale it down, save as JPG, keep it only if smaller. */
async function shrinkImages(doc, quality, maxpx) {
  const ctx = doc.context, N = k => PDFName.of(k);
  const num = v => (v && v.asNumber ? v.asNumber() : v && v.numberValue != null ? v.numberValue : null);
  let n = 0, skipped = 0;
  const imgs = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFLib.PDFRawStream && String(o.dict.get(N("Subtype"))) === "/Image");
  for (let k = 0; k < imgs.length; k++) {
    const [ref, obj] = imgs[k], d = obj.dict;
    busyText(`Shrinking picture ${k + 1} of ${imgs.length}…`);
    try {
      const filter = String(d.get(N("Filter")) || ""), cs = String(d.get(N("ColorSpace")) || ""), bpc = num(d.get(N("BitsPerComponent")));
      const w = num(d.get(N("Width"))), h = num(d.get(N("Height")));
      if (d.get(N("SMask")) || d.get(N("Mask")) || d.get(N("ImageMask")) || d.get(N("Decode")) || /CMYK|Indexed|Separation|DeviceN/.test(cs) || !w || !h) { skipped++; continue; }
      let src;
      if (filter === "/DCTDecode") src = await createImageBitmap(new Blob([obj.contents], { type: "image/jpeg" }));
      else if (filter === "/FlateDecode" && bpc === 8 && !d.get(N("DecodeParms")) && (cs === "/DeviceRGB" || cs === "/DeviceGray")) {
        const raw = PDFLib.decodePDFRawStream(obj).decode(), ch = cs === "/DeviceRGB" ? 3 : 1;
        if (raw.length < w * h * ch) { skipped++; continue; }
        const id = new ImageData(w, h), px = id.data;
        for (let i = 0, j = 0; i < w * h; i++, j += ch) { px[i * 4] = raw[j]; px[i * 4 + 1] = raw[j + (ch === 3 ? 1 : 0)]; px[i * 4 + 2] = raw[j + (ch === 3 ? 2 : 0)]; px[i * 4 + 3] = 255; }
        src = document.createElement("canvas"); src.width = w; src.height = h; src.getContext("2d").putImageData(id, 0, 0);
      } else { skipped++; continue; }
      const s = Math.min(1, maxpx / Math.max(w, h)), cw = Math.max(1, Math.round(w * s)), chh = Math.max(1, Math.round(h * s));
      const c = document.createElement("canvas"); c.width = cw; c.height = chh;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cw, chh); g.drawImage(src, 0, 0, cw, chh);
      const jpg = await canvasBytes(c, "image/jpeg", quality);
      if (jpg.length < obj.contents.length * 0.92) {
        ctx.assign(ref, ctx.stream(jpg, { Type: "XObject", Subtype: "Image", Width: cw, Height: chh, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "DCTDecode" }));
        n++;
      } else skipped++;
    } catch (e) { console.warn("image skipped", e); skipped++; }
  }
  return { n, skipped };
}
