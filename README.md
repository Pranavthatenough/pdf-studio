# PDF Studio

A full PDF app that runs on your own laptop. No upload, no account, no internet needed.

BSERC GenAI Internship · Week 2 · Section A (Web tools) · Project 1

## How to open it

1. Unzip the folder anywhere.
2. Double-click **`index.html`**. It opens in Chrome, Edge or Firefox.
3. Open a PDF (button, or drag it onto the window), or press **Try a 50-page sample**.

That's it. You can turn Wi-Fi off first; everything still works. The status bar at the bottom shows "Offline · fully working".

## The 29 tools

| Group | Tools |
|---|---|
| **Organise** (9) | Merge · Split · Reorder (drag pages in the sidebar) · Rotate · Delete · Duplicate · Extract · Insert blank page · Crop |
| **Edit** (9) | Add text · Add image · Highlight · Draw · Shapes (box, ellipse, line, arrow) · Whiteout · Redact (draw boxes or find a word everywhere) · Sign (draw or type) · Fill forms |
| **Stamp** (4) | Watermark · Page numbers · Header & footer · Date stamp |
| **Convert** (3) | Images to PDF · PDF to images (PNG/JPG, ZIP) · PDF to text |
| **Finish** (4) | Compress (shows size before and after) · Edit details · Remove details · Compare two PDFs |

Plus **Select** to move, resize or delete edits, **Undo / Redo** for everything, and **Save PDF**.

Keyboard: `Ctrl+S` save · `Ctrl+O` open · `Ctrl+Z` / `Ctrl+Y` undo / redo · `←` `→` change page · `Delete` removes the selected edit · arrow keys nudge it.

## "Done when" checklist (all tested)

- [x] **With Wi-Fi off, edit a 50-page PDF using tools from all 5 groups.** Tested with the network fully blocked on the 50-page sample: rotate, duplicate, delete, reorder, crop, merge, split, extract; text, image, highlight, drawing, shapes, whiteout, two signatures, redaction, form filling; watermark, page numbers, header/footer, date stamp; PDF to text, PDF to images, images to PDF; details, compare, compress. Zero network requests, zero errors.
- [x] **The saved file opens correctly in another PDF reader.** Checked the saved file with Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), `qpdf --check` (no errors) and `pypdf` (form values read back: name, roll number, branch, semester, tick box).
- [x] **Redacted text can't be selected or found by search afterwards.** The page is rebuilt as an image with the black boxes burnt in. Searching the saved file with both pdf.js and Poppler finds neither the student ID nor the phone number.
- [x] **Compress shows the file size before and after.** Bars and a percentage. Example: 477 KB → 238 KB (−50%) with text still selectable.

## How it works (so you can explain it)

- **pdf-lib** reads and writes the PDF file: moving pages, drawing text and shapes, forms, details.
- **pdf.js** (from Mozilla, the same engine inside Firefox) draws pages on screen, extracts text and finds words for redaction.
- **JSZip** packs several files into one ZIP download.
- All three libraries are saved inside the `vendor/` folder, so nothing is ever downloaded. Files are read with the browser's own file picker and saved with a normal download. They never leave the computer.
- **Edits stay movable** until you save or press *Apply edits*. Then they are written into the PDF.
- **Rotated or cropped pages:** one coordinate formula maps what you see on screen to the PDF's own coordinates. Edits land exactly where you clicked, even on a page turned 90°.
- **Redaction** is real removal: the page is re-drawn as a picture with black boxes, so the hidden words no longer exist in the file. Whiteout only covers.
- **Compress → Recommended** shrinks the photos inside the PDF and keeps the text. **Strong** turns every page into a picture (good for scans). **Lossless** just rebuilds the file.

## Files

```
index.html      the app page
styles.css      layout and look (light and dark mode)
js/core.js      document state, rendering, drawing engine, undo/redo, redaction
js/tools.js     the 29 tools and their option panels
js/main.js      buttons, mouse/touch on the page, sidebar drag & drop, keyboard
js/sample.js    builds the harmless 50-page sample PDF
vendor/         pdf-lib, pdf.js, JSZip (stored locally so it works offline)
prompts.md      every prompt, in order
```

## Limits

- Password-protected PDFs must be unlocked in another app first.
- Text is added in the standard PDF fonts (Helvetica, Times, Courier), so letters outside Western European alphabets are replaced by `?`. "₹" becomes "Rs.".
- Scanned pages have no text, so PDF to text and Find & redact can't see words on them (that would need OCR).
- Very large PDFs (hundreds of pages with big images) can be slow, because everything runs inside the browser tab.

Test with sample or fake documents only.
