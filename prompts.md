# Prompts — PDF Studio (Week 2 · Section A · Project 1)

Agent: Claude. Prompts are in the order they were given, followed by the plan, build steps and fix rounds that came out of testing.

---

## Prompt 1 — understanding the brief

> *(attached Week-2-Projects.pdf)* explain what to do

Claude summarised the rules: 17 projects in 4 sections, at least 2 per section and at least 8 in total. Every app must work offline with no paid API or login. Keep every prompt in `prompts.md`, test with sample files, and follow Plan → Prompt → Build → Test → Improve.

## Prompt 2 — the build request

> now ur task is to make a project from 1st section i.e web tool in that i want u to work on pdf studio and read the pdf properly for what to do and make sure it work good the frontend looks good

---

## Plan (from the project page)

- **What to build:** 29 tools in 5 groups.
  - Organise: merge, split, reorder, rotate, delete, duplicate, extract, insert blank, crop.
  - Edit: text, image, highlight, draw, shapes, whiteout, redact, sign, fill forms.
  - Stamp: watermark, page numbers, header & footer, date stamp.
  - Convert: images→PDF, PDF→images, PDF→text.
  - Finish: compress, edit details, remove details, compare.
- **Done when:**
  - With Wi-Fi off, edit a 50-page PDF using tools from all 5 groups.
  - The saved file opens in another reader.
  - Redacted text can't be found.
  - Compress shows the size before and after.
- **Decisions:**
  - Plain HTML/CSS/JS that opens by double-clicking `index.html`, with no install and no server.
  - pdf-lib for editing, pdf.js for viewing and text, and JSZip for ZIPs. All three are stored in `vendor/` so the app works offline.
  - pdf.js's worker is loaded as a normal script so it also works from `file://`.
  - Edits stay movable on an overlay until they are saved into the file.
  - Redaction flattens the page to an image so the text is truly removed.
  - A built-in 50-page sample (text, figures, a form, fake personal details) means nobody has to test with real documents.
  - Layout follows the preview in the brief: tool groups on the left, page thumbnails, the page, and an options panel.

## Build steps

1. App shell: top bar (Open, Save, Undo, Redo), group rail, page sidebar, viewer with zoom, options panel, offline badge, drag-and-drop to open.
2. Core engine: load/save, page rendering, lazy thumbnails, undo/redo history, and one drawing engine shared by the on-screen preview and the PDF output. It maps screen coordinates to PDF coordinates for rotated and cropped pages.
3. Sample generator: 50 A4 pages with chapters, figures, a fillable form on page 2 and fake ID and phone details on page 3.
4. All 29 tools with their own panels, the "Apply to" page choice (this page / selected / all / range) and live previews for stamps.

## Testing

Automated in headless Chrome **with the network blocked**, on the 50-page sample. Every tool in all 5 groups was used, then the saved file was checked in other readers: Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), `qpdf --check` and `pypdf`. The phone layout was checked at 390 px wide.

## Fix rounds (problems found by testing, and the fix asked for)

1. **"Compress made the sample bigger (398 KB → 2.75 MB)."** Turning text pages into pictures costs more than it saves. Added a **Recommended** mode that only shrinks the pictures inside the PDF and keeps text selectable. Now 477 KB → 238 KB (−50%). Strong mode now suggests Recommended when it can't help.
2. **"Stamps show on screen, but page numbers, header and date stamp are missing when the saved file is opened in Poppler."** Cause: pdf-lib caches a page's content stream after the first save, so a second round of drawing on the same page was never written out. Fix: start a fresh content stream for every round of drawing. Verified in Poppler.
3. **"I can't see the whole page, so clicks near the bottom miss."** Added a **Fit page** zoom next to Fit width.
4. **"Toast messages cover the page number and zoom controls."** Moved them up, clear of the pager.
5. **"Find & redact boxes start one letter late, so the first letter of the ID shows."** The box was placed by counting letters; now it measures the real letter widths of the font and adds padding. Verified on the ID, the phone number and a phrase on 25 pages.
6. **"The default header sits on top of the document's own header line."** The default is now a footer (`{file} · {date}`) and the header starts empty.

## Result

All four "Done when" checks pass. See README.md for how to open the app and how it works.
