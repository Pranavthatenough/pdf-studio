/* Builds a harmless 50-page sample PDF locally (no files needed): notes text, figures, and a fillable form on page 2. */
"use strict";
async function makeSamplePDF() {
  const doc = await PDFDocument.create();
  doc.setTitle("Thermodynamics — Semester 4 notes (sample)");
  doc.setAuthor("R. Sharma");
  doc.setSubject("Sample document for PDF Studio");
  doc.setKeywords(["thermodynamics", "sample", "notes"]);
  doc.setCreator("PDF Studio sample generator");
  doc.setProducer("PDF Studio");
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold), FT = await doc.embedFont(StandardFonts.TimesRoman);
  const ink = rgb(0.12, 0.13, 0.16), grey = rgb(0.45, 0.47, 0.52), red = rgb(0.82, 0.23, 0.18);
  const topics = [
    ["Systems and surroundings", "A thermodynamic system is the part of the universe we choose to study; everything else is the surroundings. A closed system exchanges energy but not mass with its surroundings, while an open system exchanges both. An isolated system exchanges neither."],
    ["The zeroth law", "If two bodies are each in thermal equilibrium with a third body, they are in thermal equilibrium with each other. This is what allows a thermometer to give a meaningful reading of temperature."],
    ["The first law", "Energy is conserved: the change in internal energy of a closed system equals the heat added to the system minus the work done by the system, written as dU = dQ - dW."],
    ["Work and heat", "Work and heat are both ways of transferring energy across a boundary. Neither is a property of the system; they depend on the path the process follows, not only on the end states."],
    ["Enthalpy", "Enthalpy H = U + pV is convenient for processes at constant pressure, where the heat transferred equals the change in enthalpy. Steam tables list specific enthalpy for water at many states."],
    ["The second law", "Heat does not flow spontaneously from a colder body to a hotter one. Equivalently, no cyclic engine can convert all the heat it absorbs into work; some heat must be rejected to a cold reservoir."],
    ["The Carnot cycle", "The Carnot cycle has two reversible isothermal and two reversible adiabatic steps. Its efficiency, 1 - Tc/Th, is the highest any engine can reach between the same two temperatures."],
    ["Entropy", "Entropy is a property defined by dS = dQrev/T. For an isolated system entropy never decreases, which gives the second law a precise mathematical form."],
    ["Ideal gas processes", "For an ideal gas pV = nRT. Isothermal, isobaric, isochoric and adiabatic processes each have simple relations; for a reversible adiabatic process pV^gamma stays constant."],
    ["Refrigerators and heat pumps", "A refrigerator uses work to move heat from a cold space to a warm one. Its performance is measured by the coefficient of performance, the heat removed divided by the work input."],
  ];
  /* a figure image, so compression has something to shrink */
  const c = document.createElement("canvas"); c.width = 900; c.height = 520;
  const x = c.getContext("2d");
  const grd = x.createLinearGradient(0, 0, 900, 520); grd.addColorStop(0, "#fff4e8"); grd.addColorStop(1, "#e8f0ff");
  x.fillStyle = grd; x.fillRect(0, 0, 900, 520);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${120 + Math.random() * 100},${120 + Math.random() * 100},${160 + Math.random() * 90},0.08)`; x.fillRect(Math.random() * 900, Math.random() * 520, 3, 3); }
  x.strokeStyle = "#333"; x.lineWidth = 2; x.beginPath(); x.moveTo(80, 40); x.lineTo(80, 460); x.lineTo(860, 460); x.stroke();
  x.font = "22px sans-serif"; x.fillStyle = "#333"; x.fillText("p", 50, 60); x.fillText("V", 860, 495);
  x.strokeStyle = "#d13b2e"; x.lineWidth = 4; x.beginPath();
  x.moveTo(200, 120); x.bezierCurveTo(330, 170, 480, 200, 620, 230); x.bezierCurveTo(680, 300, 720, 350, 760, 390);
  x.bezierCurveTo(620, 380, 470, 360, 330, 330); x.bezierCurveTo(290, 260, 240, 190, 200, 120); x.stroke();
  x.fillStyle = "#d13b2e"; x.font = "bold 22px sans-serif"; x.fillText("Carnot cycle", 420, 290);
  const fig = await doc.embedJpg(dataURLBytes(c.toDataURL("image/jpeg", 0.95)));

  const wrap = (txt, font, size, max) => {
    const words = txt.split(" "), lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (font.widthOfTextAtSize(t, size) > max) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  };
  for (let p = 1; p <= 50; p++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    const W = 595.28, M = 60; let y = 780;
    page.drawText("Thermodynamics · Semester 4", { x: M, y: 805, size: 9, font: F, color: grey });
    page.drawText("SAMPLE DOCUMENT", { x: W - M - F.widthOfTextAtSize("SAMPLE DOCUMENT", 9), y: 805, size: 9, font: FB, color: red });
    page.drawLine({ start: { x: M, y: 798 }, end: { x: W - M, y: 798 }, thickness: 0.6, color: grey });
    if (p === 1) {
      page.drawText("Thermodynamics", { x: M, y: 640, size: 40, font: FB, color: ink });
      page.drawText("Semester 4 · Lecture notes", { x: M, y: 600, size: 18, font: F, color: grey });
      page.drawText("Prepared by R. Sharma · Sample file for testing PDF Studio", { x: M, y: 560, size: 11, font: F, color: grey });
      page.drawImage(fig, { x: M, y: 230, width: W - 2 * M, height: (W - 2 * M) * 520 / 900 });
      continue;
    }
    if (p === 2) {
      page.drawText("Exam registration form", { x: M, y: 740, size: 22, font: FB, color: ink });
      page.drawText("Fill this in with the Fill forms tool (Edit group).", { x: M, y: 716, size: 11, font: F, color: grey });
      const form = doc.getForm();
      const label = (t, yy) => page.drawText(t, { x: M, y: yy, size: 11, font: FB, color: ink });
      label("Full name", 670); const nm = form.createTextField("student.name"); nm.addToPage(page, { x: M, y: 640, width: 300, height: 22, font: F });
      label("Roll number", 610); const rl = form.createTextField("student.roll"); rl.addToPage(page, { x: M, y: 580, width: 160, height: 22, font: F });
      label("Branch", 550); const br = form.createDropdown("student.branch"); br.addOptions(["Mechanical", "Electrical", "Computer Science", "Civil", "Aerospace"]); br.addToPage(page, { x: M, y: 520, width: 200, height: 22, font: F });
      label("Semester", 490); const sm = form.createRadioGroup("student.semester");
      ["3", "4", "5"].forEach((s, i) => { sm.addOptionToPage(s, page, { x: M + i * 70, y: 462, width: 16, height: 16 }); page.drawText("Sem " + s, { x: M + 22 + i * 70, y: 466, size: 10, font: F, color: ink }); });
      label("I confirm the details above are correct", 420); const ok = form.createCheckBox("student.confirm"); ok.addToPage(page, { x: M + 240, y: 416, width: 16, height: 16 });
      page.drawText("Office use only", { x: M, y: 360, size: 9, font: FB, color: grey });
      page.drawRectangle({ x: M, y: 250, width: W - 2 * M, height: 100, borderColor: grey, borderWidth: 0.6 });
      continue;
    }
    const [title, body] = topics[(p - 3) % topics.length];
    const ch = Math.floor((p - 3) / 5) + 1;
    page.drawText(`Chapter ${ch} · ${title}`, { x: M, y: y - 10, size: 20, font: FB, color: ink }); y -= 50;
    const paras = [body, `Example ${p}: ${body.split(".")[0].toLowerCase()}. Work the numbers out step by step and check the units at every line.`, "Key idea: write down the system boundary first, then list every heat and work interaction before using any equation.", body];
    for (const para of paras) { for (const l of wrap(para, FT, 12.5, W - 2 * M)) { page.drawText(l, { x: M, y, size: 12.5, font: FT, color: ink }); y -= 18; } y -= 10; }
    if (p === 3) { page.drawText("Student ID: BSERC-2026-0417  ·  Phone: 98765 43210", { x: M, y, size: 12, font: FB, color: ink }); y -= 16; page.drawText("(Sample personal details: try the Redact tool on this line.)", { x: M, y, size: 10, font: F, color: grey }); y -= 26; }
    if (p % 5 === 0) { const h = (W - 2 * M) * 520 / 900 * 0.8; page.drawImage(fig, { x: M + (W - 2 * M) * 0.1, y: y - h, width: (W - 2 * M) * 0.8, height: h }); y -= h + 10; }
    page.drawText(`Summary ${p}: ${title} links directly to the laws above. Revise the definitions before the examples.`, { x: M, y: Math.max(y - 10, 70), size: 10.5, font: F, color: grey });
  }
  return await doc.save();
}
