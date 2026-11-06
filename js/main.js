/* PDF Studio — wiring: rail, toolbar, panel, page interactions, thumbnails, keyboard, drag & drop */
"use strict";

/* ---------- rail + toolbar ---------- */
function renderRail() {
  $("#rail").innerHTML = GROUPS.map(g => `<button data-g="${g.id}" aria-pressed="${S.group === g.id}"><svg viewBox="0 0 24 24">${g.icon}</svg>${g.label}<span class="count">${ORDER.filter(id => TOOLS[id].group === g.id && id !== "select").length} tools</span></button>`).join("");
}
function renderToolbar() {
  $("#toolbar").innerHTML = ORDER.filter(id => TOOLS[id].group === S.group).map(id => `<button class="chip" data-t="${id}" aria-pressed="${S.tool === id}">${TOOLS[id].label}</button>`).join("");
}
const lastTool = { organise: "reorder", edit: "select", stamp: "watermark", convert: "img2pdf", finish: "compress" };
function setGroup(g) { S.group = g; setTool(lastTool[g]); }
function setTool(id) {
  const t = TOOLS[id]; if (!t) return;
  if (t.group !== S.group) S.group = t.group;
  S.tool = id; lastTool[t.group] = id; S.draft = null;
  if (t.group !== "edit") S.selObj = null;
  if (id !== "crop") S.cropRect = null;
  renderRail(); renderToolbar(); refreshPanel(); renderOverlay();
  const chip = $(`.chip[data-t="${id}"]`); if (chip) chip.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/* ---------- panel ---------- */
function refreshPanel() {
  const p = $("#panel"), t = currentTool();
  p.onclick = p.oninput = p.onchange = null;
  if (!S.doc && t.needsDoc !== false) {
    p.innerHTML = `<h2>${t.label}</h2><p class="desc">Open a PDF first, or try the 50-page sample.</p><div class="btns">${btn("pOpen", "Open PDF", "btn primary block")}${btn("pSample", "Try the sample", "btn block")}</div>`;
    $("#pOpen").onclick = () => $("#openInput").click(); $("#pSample").onclick = loadSample;
    return;
  }
  let html = "";
  if (t.group === "edit") html += selCard();
  try { html += t.panel.call(t); } catch (e) { console.error(e); html += `<div class="note warn">${esc(e.message)}</div>`; }
  p.innerHTML = html;
  try { t.bind && t.bind.call(t); } catch (e) { console.error(e); }
  bindSelCard();
}
/* generic binding for every data-o / data-seg / swatch control */
function onOpt(e) {
  const el = e.target, t = currentTool(), o = O();
  let k = null;
  if (el.matches("[data-o]")) {
    k = el.dataset.o;
    if (el.type === "checkbox") o[k] = el.checked;
    else if (el.type === "radio") { if (!el.checked) return; o[k] = el.value; }
    else if (el.type === "range" || el.type === "number") o[k] = el.value === "" ? "" : +el.value;
    else o[k] = el.value;
    if (el.type === "color") $$(`[data-swk="${k}"]`).forEach(b => b.setAttribute("aria-pressed", "false"));
    const show = $(`[data-show="${k}"]`); if (show) { const f = el.closest(".field")?.querySelector("[data-fmt]"); show.textContent = el.type === "range" ? fmtFor(t, k, o[k]) : o[k]; }
  } else if (e.type === "click" && el.closest("[data-seg]")) {
    const b = el.closest("[data-seg]"); k = b.dataset.seg; o[k] = b.dataset.v;
    $$(`[data-seg="${k}"]`).forEach(x => x.setAttribute("aria-pressed", x === b));
  } else if (e.type === "click" && el.closest("[data-swk]")) {
    const b = el.closest("[data-swk]"); k = b.dataset.swk; o[k] = b.dataset.v;
    $$(`[data-swk="${k}"]`).forEach(x => x.setAttribute("aria-pressed", x === b));
    const ci = $(`input[type=color][data-o="${k}"]`); if (ci) ci.value = b.dataset.v;
  }
  if (k == null) return;
  if (k === "range" && el.matches("[data-range]")) { o.scope = "range"; const r = el.closest("label")?.querySelector("input[type=radio]"); if (r) r.checked = true; }
  if (t.onChange) t.onChange.call(t, k);
  if (t.preview) renderOverlay();
}
function fmtFor(t, k, v) {
  if (k === "opacity" || k === "quality") return Math.round(v * 100) + "%";
  if (k === "dpi") return v + " dpi";
  if (k === "w" || k === "sw" || k === "margin") return v + " pt";
  return v;
}
["input", "change", "click"].forEach(ev => $("#panel").addEventListener(ev, e => {
  if (e.target.closest(".selcard")) return;
  if (ev === "click" && !e.target.closest("[data-seg],[data-swk]")) return;
  if (ev === "input" && e.target.type === "radio") return;
  onOpt(e);
}));

/* properties of the selected edit */
function selCard() {
  const o = S.selObj && findObj(S.selObj); if (!o) return "";
  const names = { text: "Text", image: o.isSign ? "Signature" : "Image", highlight: "Highlight", whiteout: "Whiteout", redact: "Redaction", rect: "Box", ellipse: "Ellipse", line: "Line", arrow: "Arrow", ink: "Drawing" };
  let f = "";
  if (o.type === "text") f += `<div class="field"><textarea class="inp" data-ob="text" aria-label="Text">${esc(o.text)}</textarea></div><div class="grid2"><div class="field"><label>Size</label><input class="inp" type="number" min="6" max="144" data-ob="size" value="${o.size}"></div><div class="field"><label>Colour</label><input type="color" class="inp" style="height:34px;padding:2px" data-ob="color" value="${o.color}"></div></div>`;
  else if (["highlight", "rect", "ellipse", "line", "arrow", "ink"].includes(o.type)) f += `<div class="grid2"><div class="field"><label>Colour</label><input type="color" class="inp" style="height:34px;padding:2px" data-ob="color" value="${o.color}"></div>${o.sw != null ? `<div class="field"><label>Width</label><input class="inp" type="number" min="0.5" max="20" step="0.5" data-ob="sw" value="${o.sw}"></div>` : "<div></div>"}</div>`;
  return `<div class="selcard"><div class="sh"><span>Selected: ${names[o.type]}</span><span><button class="mini" id="obDup">Duplicate</button> <button class="mini" id="obDel">Delete</button></span></div>${f}</div>`;
}
function bindSelCard() {
  const card = $(".selcard"); if (!card) return;
  let pushed = false;
  card.oninput = e => {
    const el = e.target.closest("[data-ob]"), o = findObj(S.selObj); if (!el || !o) return;
    if (!pushed) { pushHist("pending"); pushed = true; }
    o[el.dataset.ob] = el.type === "number" ? (+el.value || o[el.dataset.ob]) : el.value;
    renderOverlay();
  };
  $("#obDel").onclick = () => deleteObj(S.selObj);
  $("#obDup").onclick = () => { const o = findObj(S.selObj); if (!o) return; pushHist("pending"); const c = JSON.parse(JSON.stringify(o)); c.id = uid(); moveObj(c, 12, 12, JSON.parse(JSON.stringify(o))); pendingOn(S.cur).push(c); S.selObj = c.id; renderOverlay(); renderPendingBar(); refreshPanel(); };
}
function deleteObj(id) {
  for (const k in S.pending) { const i = S.pending[k].findIndex(o => o.id === id); if (i >= 0) { pushHist("pending"); S.pending[k].splice(i, 1); } }
  if (S.selObj === id) S.selObj = null;
  renderOverlay(); renderPendingBar(); refreshPanel();
}

/* ---------- page interactions (drawing, placing, moving) ---------- */
const ov = $("#overlay");
function svgPt(e) { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * S.view.W, y: (e.clientY - r.top) / r.height * S.view.H }; }
let drag = null;
ov.addEventListener("pointerdown", e => {
  if (!S.doc || e.button > 0) return;
  const t = currentTool(), pt = svgPt(e);
  ov.setPointerCapture(e.pointerId);
  if (t.id === "select" || (t.group === "edit" && e.target.closest(".obj") && !t.kind)) {
    const h = e.target.closest("[data-h]"), g = e.target.closest(".obj");
    if (h && S.selObj) { const o = findObj(S.selObj); drag = { mode: "resize", o, orig: JSON.parse(JSON.stringify(o)), p0: pt, pushed: false }; return; }
    if (g) { S.selObj = g.dataset.id; const o = findObj(S.selObj); drag = { mode: "move", o, orig: JSON.parse(JSON.stringify(o)), p0: pt, pushed: false }; renderOverlay(); refreshPanel(); return; }
    if (S.selObj) { S.selObj = null; renderOverlay(); refreshPanel(); }
    return;
  }
  const kind = t.kind;
  if (kind === "click") {
    const obj = t.place.call(t, pt); if (!obj) return;
    pushHist("pending"); obj.id = uid(); pendingOn(S.cur).push(obj);
    S.selObj = obj.id; setTool("select"); renderPendingBar();
    if (obj.type === "text") setTimeout(() => { const ta = $('.selcard textarea'); if (ta) { ta.focus(); ta.select(); } }, 30);
    return;
  }
  if (kind === "box") drag = { mode: "box", p0: pt };
  else if (kind === "line") drag = { mode: "line", p0: pt };
  else if (kind === "ink") { drag = { mode: "ink" }; S.draft = { type: "ink", pts: [[pt.x, pt.y]], color: O().color, sw: +O().sw }; }
  else if (kind === "crop") drag = { mode: "crop", p0: pt };
  else return;
  S.selObj = null;
});
ov.addEventListener("pointermove", e => {
  if (!drag) return;
  const pt = svgPt(e), t = currentTool();
  const box = () => ({ x: Math.min(drag.p0.x, pt.x), y: Math.min(drag.p0.y, pt.y), w: Math.abs(pt.x - drag.p0.x), h: Math.abs(pt.y - drag.p0.y) });
  if (drag.mode === "move" || drag.mode === "resize") {
    const dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y;
    if (!drag.pushed && Math.hypot(dx, dy) > 1) { pushHist("pending"); drag.pushed = true; }
    if (drag.mode === "move") moveObj(drag.o, dx, dy, drag.orig);
    else {
      drag.o.w = Math.max(6, drag.orig.w + dx);
      drag.o.h = drag.o.type === "image" && !e.shiftKey ? drag.o.w * drag.orig.h / drag.orig.w : Math.max(4, drag.orig.h + dy);
    }
  }
  else if (drag.mode === "box") S.draft = t.make.call(t, O(), box());
  else if (drag.mode === "line") S.draft = t.make.call(t, O(), { x1: drag.p0.x, y1: drag.p0.y, x2: pt.x, y2: pt.y });
  else if (drag.mode === "ink") { const l = S.draft.pts[S.draft.pts.length - 1]; if (Math.hypot(pt.x - l[0], pt.y - l[1]) > 0.8) S.draft.pts.push([pt.x, pt.y]); }
  else if (drag.mode === "crop") { const b = box(); S.cropRect = { x: clamp(b.x, 0, S.view.W), y: clamp(b.y, 0, S.view.H), w: Math.min(b.w, S.view.W - b.x), h: Math.min(b.h, S.view.H - b.y) }; }
  renderOverlay();
});
function endDrag() {
  if (!drag) return;
  const d = S.draft, mode = drag.mode; drag = null; S.draft = null;
  if (d && (mode === "box" || mode === "line" || mode === "ink")) {
    const b = objBox(d);
    const ok = mode === "ink" ? d.pts.length > 1 : mode === "line" ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 4 : b.w > 3 && b.h > 3;
    if (ok) { pushHist("pending"); d.id = uid(); pendingOn(S.cur).push(d); renderPendingBar(); }
  }
  if (mode === "crop") { if (S.cropRect && (S.cropRect.w < 10 || S.cropRect.h < 10)) S.cropRect = null; refreshPanel(); }
  if (mode === "move" || mode === "resize") refreshPanel();
  renderOverlay();
}
ov.addEventListener("pointerup", endDrag);
ov.addEventListener("pointercancel", endDrag);

/* ---------- thumbnails: select, navigate, drag to reorder ---------- */
const tl = $("#thumbList");
tl.addEventListener("click", e => {
  const th = e.target.closest(".thumb"); if (!th) return;
  const i = +th.dataset.i;
  if (e.target.closest("[data-chk]") || e.ctrlKey || e.metaKey) { S.sel.has(i) ? S.sel.delete(i) : S.sel.add(i); S.anchor = i; }
  else if (e.shiftKey) { const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)]; for (let k = a; k <= b; k++) S.sel.add(k); }
  else { S.sel.clear(); S.anchor = i; gotoPage(i); }
  $$(".thumb").forEach((t, k) => t.classList.toggle("sel", S.sel.has(k)));
  updateMeta(); if (currentTool().group === "organise" || /scope/.test($("#panel").innerHTML)) refreshPanel();
});
tl.addEventListener("keydown", e => { const th = e.target.closest(".thumb"); if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); gotoPage(+th.dataset.i); } });
let dragFrom = null;
tl.addEventListener("dragstart", e => {
  const th = e.target.closest(".thumb"); if (!th) return;
  dragFrom = +th.dataset.i; th.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(dragFrom));
});
const horiz = () => getComputedStyle(tl).flexDirection === "row";
tl.addEventListener("dragover", e => {
  if (dragFrom == null) return;
  const th = e.target.closest(".thumb"); if (!th) return;
  e.preventDefault();
  const r = th.getBoundingClientRect(), after = horiz() ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
  $$(".thumb").forEach(t => t.classList.remove("drop-before", "drop-after"));
  th.classList.add(after ? "drop-after" : "drop-before");
});
tl.addEventListener("drop", e => {
  if (dragFrom == null) return;
  e.preventDefault();
  const th = $(".thumb.drop-before, .thumb.drop-after"); if (!th) return;
  const target = +th.dataset.i + (th.classList.contains("drop-after") ? 1 : 0);
  const moving = S.sel.has(dragFrom) && S.sel.size > 1 ? [...S.sel].sort((a, b) => a - b) : [dragFrom];
  dragFrom = null; $$(".thumb").forEach(t => t.classList.remove("drop-before", "drop-after", "dragging"));
  movePages(moving, target);
});
tl.addEventListener("dragend", () => { dragFrom = null; $$(".thumb").forEach(t => t.classList.remove("drop-before", "drop-after", "dragging")); });

/* ---------- top bar, pager, zoom ---------- */
$("#rail").addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (b) setGroup(b.dataset.g); });
$("#toolbar").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) setTool(b.dataset.t); });
$("#openBtn").onclick = $("#emptyOpen").onclick = () => $("#openInput").click();
$("#openInput").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) openFile(f); };
$("#saveBtn").onclick = savePDF;
$("#undoBtn").onclick = undo; $("#redoBtn").onclick = redo;
$("#applyBtn").onclick = () => commitPending(false).then(() => { refreshPanel(); toast("Edits written into the PDF."); });
$("#discardBtn").onclick = () => { pushHist("pending"); S.pending = {}; S.selObj = null; renderOverlay(); renderPendingBar(); refreshPanel(); };
$("#selAll").onclick = () => { S.sel = new Set([...Array(pageCount()).keys()]); $$(".thumb").forEach(t => t.classList.add("sel")); updateMeta(); refreshPanel(); };
$("#selNone").onclick = () => { S.sel.clear(); $$(".thumb").forEach(t => t.classList.remove("sel")); updateMeta(); refreshPanel(); };
$("#prevBtn").onclick = () => gotoPage(S.cur - 1);
$("#nextBtn").onclick = () => gotoPage(S.cur + 1);
$("#pageInput").onchange = e => { const v = parseInt(e.target.value, 10); if (v) gotoPage(v - 1); else e.target.value = S.cur + 1; };
$("#zoomIn").onclick = () => { S.zoom = clamp(S.scale * 1.2, 0.25, 4); renderPage(); };
$("#zoomOut").onclick = () => { S.zoom = clamp(S.scale / 1.2, 0.25, 4); renderPage(); };
$("#zoomFit").onclick = () => { S.zoom = null; renderPage(); };
$("#zoomPage").onclick = () => { S.zoom = "page"; renderPage(); };
let rsz; addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (S.pdf && (S.zoom == null || S.zoom === "page")) renderPage(); }, 150); });

async function openFile(f) {
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast(`${f.name} isn't a PDF. To turn images into a PDF, use Convert → Images to PDF.`, true);
  if (S.doc && (S.dirty || pendingCount()) && !confirmDiscard()) return;
  await guard("Opening " + f.name + "…", async () => { await openBytes(await readFile(f), f.name); toast(`Opened ${f.name} · ${pageCount()} pages`); });
}
function confirmDiscard() { try { return window.confirm("Your current PDF has unsaved changes. Open the new file anyway?"); } catch (e) { return true; } }
async function loadSample() {
  if (S.doc && (S.dirty || pendingCount()) && !confirmDiscard()) return;
  await guard("Making a 50-page sample…", async () => { await openBytes(await makeSamplePDF(), "sample-thermo-notes.pdf"); toast("Sample loaded: 50 pages with text, figures and a form on page 2."); });
}
$("#sampleBtn").onclick = loadSample;
$("#imgStartBtn").onclick = async () => { setTool("img2pdf"); const fs = await pickFiles("image/*", true); if (fs.length) addImages(fs); };

/* drag files onto the window */
let dragDepth = 0;
addEventListener("dragenter", e => { if (e.dataTransfer?.types?.includes("Files")) { dragDepth++; document.body.classList.add("dragover"); } });
addEventListener("dragleave", e => { if (e.dataTransfer?.types?.includes("Files") && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragover"); } });
addEventListener("dragover", e => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
addEventListener("drop", e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragover");
  const files = [...e.dataTransfer.files], pdfs = files.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf"), imgs = files.filter(f => f.type.startsWith("image/"));
  if (pdfs.length && (!S.doc || S.tool !== "merge")) openFile(pdfs[0]);
  else if (pdfs.length) $("#mAdd")?.click();
  else if (imgs.length) { setTool("img2pdf"); addImages(imgs); }
});

/* keyboard */
addEventListener("keydown", e => {
  const typing = e.target.closest("input, textarea, select, [contenteditable]");
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); savePDF(); return; }
  if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); $("#openInput").click(); return; }
  if (typing) return;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
  if (!S.doc) return;
  if ((e.key === "Delete" || e.key === "Backspace") && S.selObj) { e.preventDefault(); deleteObj(S.selObj); return; }
  if (e.key === "Escape") { S.selObj = null; S.cropRect = null; renderOverlay(); refreshPanel(); return; }
  if (S.selObj && e.key.startsWith("Arrow")) {
    e.preventDefault(); const o = findObj(S.selObj), st = e.shiftKey ? 10 : 1, orig = JSON.parse(JSON.stringify(o));
    pushHist("pending"); moveObj(o, e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0, e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0, orig); renderOverlay(); return;
  }
  if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); gotoPage(S.cur + 1); }
  if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); gotoPage(S.cur - 1); }
  if (e.key === "Home") gotoPage(0);
  if (e.key === "End") gotoPage(pageCount() - 1);
});
addEventListener("beforeunload", e => { if (S.doc && (S.dirty || pendingCount())) { e.preventDefault(); e.returnValue = ""; } });

/* online / offline badge */
function net() {
  const on = navigator.onLine, n = $("#net");
  n.classList.toggle("on", on);
  $("#netText").textContent = on ? "Online · not used" : "Offline · fully working";
}
addEventListener("online", net); addEventListener("offline", net);

/* start */
$("#viewer").classList.add("no-doc");
renderRail(); renderToolbar(); refreshPanel(); net(); updHist();
