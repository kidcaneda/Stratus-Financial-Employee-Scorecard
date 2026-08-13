"use client";

import { ReportModel, STATUS_LABEL, STATUS_HEX, score1 } from "@/lib/report-data";

// ============================================================
// Renders the report model to Excel, PowerPoint and Word. Each library
// is imported dynamically so it only downloads when that format is
// actually requested. PDF is produced by the print view on the Reports
// page (browser → Save as PDF), which needs no library at all.
// ============================================================

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const stamp = (r: ReportModel) =>
  `Stratus-Performance-${r.periodLabel}-${new Date().toISOString().slice(0, 10)}`;

// ---------------------------------------------------------------
// Excel — a workbook an analyst can pivot: summary, departments,
// every employee, and the organisation trend.
// ---------------------------------------------------------------
export async function exportExcel(r: ReportModel) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const summary = [
    ["Stratus Financial — Employee Performance Report"],
    ["Period", r.periodLabel],
    ["Scope", r.scopeLabel],
    ["Generated", r.generatedAt],
    [],
    ["Organization score", Number(r.org.score.toFixed(1))],
    ["Status", STATUS_LABEL[r.org.status]],
    ["Departments", r.org.departments],
    ["Employees", r.org.headcount],
    [],
    ["Departments on track", r.org.green],
    ["Departments at risk", r.org.amber],
    ["Departments off track", r.org.red],
    [],
    ["Scored this month", r.org.scoredThisMonth],
    ["Stale", r.org.stale],
    ["Never scored", r.org.neverScored],
    ["Evaluation coverage %", Number(r.org.coveragePct.toFixed(1))],
    ["Open challenges", r.org.openChallenges],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summary),
    "Summary"
  );

  const deptRows = [
    ["Department", "Manager", "Type", "Score", "Status", "Headcount", "Scored this month"],
    ...r.departments.map((d) => [
      d.name,
      d.managerName,
      d.type === "competency" ? "Competency (1-5)" : "KPI",
      Number(d.score.toFixed(1)),
      STATUS_LABEL[d.status],
      d.headcount,
      d.scoredThisMonth,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(deptRows),
    "Departments"
  );

  const empRows = [
    [
      "Name", "Role", "Department", "Evaluator", "Score", "Status",
      "Coverage", "Last scored", "Months recorded", "Open challenge",
    ],
    ...r.departments.flatMap((d) =>
      d.employees.map((e) => [
        e.name,
        e.role,
        e.departmentName,
        e.evaluatorName,
        Number(e.score.toFixed(1)),
        STATUS_LABEL[e.status],
        e.coverage,
        e.lastScored,
        e.monthsRecorded,
        e.challenged ? "Yes" : "",
      ])
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(empRows), "Employees");

  if (r.trend.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Month", "Average score"],
        ...r.trend.map((t) => [t.label, Number(t.score.toFixed(1))]),
      ]),
      "Trend"
    );
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${stamp(r)}.xlsx`
  );
}

// ---------------------------------------------------------------
// PowerPoint — the executive deck: cover, org summary, department
// ranking, trend, top performers, needs attention, and a slide per
// department.
// ---------------------------------------------------------------
export async function exportPowerPoint(r: ReportModel) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = r.title;

  const INK = "13202E";
  const MUTED = "5A6B7B";
  const ACCENT = "2E6BE6";

  const titleBar = (slide: any, text: string) => {
    slide.addText(text, {
      x: 0.5, y: 0.35, w: 9, h: 0.6,
      fontSize: 24, bold: true, color: INK,
    });
  };

  // Cover
  const cover = pptx.addSlide();
  cover.background = { color: INK };
  cover.addText("Stratus Financial", {
    x: 0.7, y: 2.0, w: 8.6, h: 0.5, fontSize: 20, color: "8FA3B8",
  });
  cover.addText("Employee Performance Report", {
    x: 0.7, y: 2.5, w: 8.6, h: 0.9, fontSize: 40, bold: true, color: "FFFFFF",
  });
  cover.addText(`${r.periodLabel} · ${r.scopeLabel} · ${r.generatedAt}`, {
    x: 0.7, y: 3.5, w: 8.6, h: 0.5, fontSize: 16, color: "8FA3B8",
  });

  // Organisation summary
  const s1 = pptx.addSlide();
  titleBar(s1, "Organization at a glance");
  const tiles: [string, string, string][] = [
    ["Organization score", score1(r.org.score), STATUS_HEX[r.org.status]],
    ["Departments", String(r.org.departments), ACCENT],
    ["Employees", String(r.org.headcount), ACCENT],
    ["Coverage this month", `${score1(r.org.coveragePct)}%`, ACCENT],
  ];
  tiles.forEach(([label, value, color], i) => {
    const x = 0.5 + i * 2.3;
    s1.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.3, w: 2.1, h: 1.5, fill: { color: "F1F5F9" }, line: { color: "E2E8F0" },
    });
    s1.addText(label, { x, y: 1.45, w: 2.1, h: 0.3, fontSize: 11, color: MUTED, align: "center" });
    s1.addText(value, { x, y: 1.8, w: 2.1, h: 0.7, fontSize: 32, bold: true, color, align: "center" });
  });
  s1.addText(
    [
      { text: `${r.org.green} on track   `, options: { color: STATUS_HEX.green, bold: true } },
      { text: `${r.org.amber} at risk   `, options: { color: STATUS_HEX.amber, bold: true } },
      { text: `${r.org.red} off track`, options: { color: STATUS_HEX.red, bold: true } },
    ],
    { x: 0.5, y: 3.0, w: 9, h: 0.4, fontSize: 14 }
  );
  s1.addText(
    `Evaluation coverage: ${r.org.scoredThisMonth} scored this month · ${r.org.stale} stale · ${r.org.neverScored} never scored` +
      (r.org.openChallenges ? ` · ${r.org.openChallenges} open challenge(s)` : ""),
    { x: 0.5, y: 3.5, w: 9, h: 0.4, fontSize: 12, color: MUTED }
  );

  // Department ranking (bar chart + table)
  const ranked = r.departments.filter((d) => d.headcount > 0);
  if (ranked.length) {
    const s2 = pptx.addSlide();
    titleBar(s2, "Department scores");
    s2.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Score",
          labels: ranked.map((d) => d.name),
          values: ranked.map((d) => Number(d.score.toFixed(1))),
        },
      ],
      {
        x: 0.5, y: 1.1, w: 9, h: 4.1,
        barDir: "col",
        chartColors: ranked.map((d) => STATUS_HEX[d.status]),
        showValue: true,
        dataLabelFontSize: 9,
        catAxisLabelFontSize: 9,
        valAxisMaxVal: 100,
        showLegend: false,
      }
    );
  }

  // Trend
  if (r.trend.length > 1) {
    const s3 = pptx.addSlide();
    titleBar(s3, "Performance trend");
    s3.addChart(
      pptx.ChartType.line,
      [
        {
          name: "Average score",
          labels: r.trend.map((t) => t.label),
          values: r.trend.map((t) => Number(t.score.toFixed(1))),
        },
      ],
      {
        x: 0.5, y: 1.1, w: 9, h: 4.1,
        chartColors: [ACCENT],
        showLegend: false,
        valAxisMaxVal: 100,
        catAxisLabelFontSize: 9,
      }
    );
  }

  // Top performers / needs attention
  const people = (
    slide: any,
    heading: string,
    list: typeof r.topPerformers,
    accent: string
  ) => {
    titleBar(slide, heading);
    const rows = [
      [
        { text: "Name", options: { bold: true, color: "FFFFFF", fill: { color: INK } } },
        { text: "Department", options: { bold: true, color: "FFFFFF", fill: { color: INK } } },
        { text: "Score", options: { bold: true, color: "FFFFFF", fill: { color: INK }, align: "right" } },
      ],
      ...list.map((e) => [
        { text: e.name, options: {} },
        { text: e.departmentName, options: { color: MUTED } },
        { text: score1(e.score), options: { align: "right", bold: true, color: accent } },
      ]),
    ];
    slide.addTable(rows as any, {
      x: 0.5, y: 1.15, w: 9, colW: [3.6, 3.6, 1.8],
      fontSize: 12, border: { type: "solid", color: "E2E8F0", pt: 1 },
      rowH: 0.32,
    });
  };
  if (r.topPerformers.length) {
    people(pptx.addSlide(), "Top performers", r.topPerformers, STATUS_HEX.green);
  }
  if (r.needsAttention.length) {
    people(pptx.addSlide(), "Needs attention", r.needsAttention, STATUS_HEX.amber);
  }

  // One slide per department with people
  for (const d of ranked) {
    const s = pptx.addSlide();
    titleBar(s, d.name);
    s.addText(
      `${STATUS_LABEL[d.status]} · score ${score1(d.score)} · ${d.headcount} employee(s) · manager ${d.managerName}`,
      { x: 0.5, y: 0.95, w: 9, h: 0.35, fontSize: 12, color: MUTED }
    );
    const rows = [
      [
        { text: "Employee", options: { bold: true, color: "FFFFFF", fill: { color: INK } } },
        { text: "Role", options: { bold: true, color: "FFFFFF", fill: { color: INK } } },
        { text: "Score", options: { bold: true, color: "FFFFFF", fill: { color: INK }, align: "right" } },
        { text: "Status", options: { bold: true, color: "FFFFFF", fill: { color: INK } } },
      ],
      ...d.employees.slice(0, 12).map((e) => [
        { text: e.name, options: {} },
        { text: e.role, options: { color: MUTED } },
        { text: score1(e.score), options: { align: "right", bold: true } },
        { text: STATUS_LABEL[e.status], options: { color: STATUS_HEX[e.status] } },
      ]),
    ];
    s.addTable(rows as any, {
      x: 0.5, y: 1.4, w: 9, colW: [2.9, 3.2, 1.2, 1.7],
      fontSize: 11, border: { type: "solid", color: "E2E8F0", pt: 1 },
      rowH: 0.3,
    });
  }

  await pptx.writeFile({ fileName: `${stamp(r)}.pptx` });
}

// ---------------------------------------------------------------
// Word — the written report: summary, department tables, appendices.
// ---------------------------------------------------------------
export async function exportWord(r: ReportModel) {
  const {
    Document, Packer, Paragraph, HeadingLevel, TextRun,
    Table, TableRow, TableCell, WidthType, AlignmentType,
  } = await import("docx");

  const cell = (text: string, opts: { bold?: boolean; right?: boolean } = {}) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: opts.bold })],
        }),
      ],
    });

  const table = (header: string[], rows: string[][], rightFrom = 99) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: header.map((h, i) => cell(h, { bold: true, right: i >= rightFrom })),
        }),
        ...rows.map(
          (cells) =>
            new TableRow({
              children: cells.map((c, i) => cell(c, { right: i >= rightFrom })),
            })
        ),
      ],
    });

  const children: any[] = [
    new Paragraph({ text: "Stratus Financial", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: r.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${r.periodLabel} · ${r.scopeLabel} · Generated ${r.generatedAt}`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),

    new Paragraph({ text: "Executive summary", heading: HeadingLevel.HEADING_2 }),
    new Paragraph(
      `The organization scored ${score1(r.org.score)} (${STATUS_LABEL[r.org.status]}) for the ` +
        `${r.periodLabel.toLowerCase()} period across ${r.org.departments} department(s) and ` +
        `${r.org.headcount} employee(s). ${r.org.green} department(s) are on track, ` +
        `${r.org.amber} at risk and ${r.org.red} off track.`
    ),
    new Paragraph(
      `Evaluation coverage stands at ${score1(r.org.coveragePct)}% — ${r.org.scoredThisMonth} ` +
        `employee(s) scored this month, ${r.org.stale} stale and ${r.org.neverScored} never scored` +
        (r.org.openChallenges
          ? `. ${r.org.openChallenges} challenged evaluation(s) remain open.`
          : ".")
    ),
    new Paragraph({ text: "" }),

    new Paragraph({ text: "Department scores", heading: HeadingLevel.HEADING_2 }),
    table(
      ["Department", "Manager", "Score", "Status", "Headcount"],
      r.departments
        .filter((d) => d.headcount > 0)
        .map((d) => [
          d.name,
          d.managerName,
          score1(d.score),
          STATUS_LABEL[d.status],
          String(d.headcount),
        ]),
      2
    ),
    new Paragraph({ text: "" }),
  ];

  if (r.topPerformers.length) {
    children.push(
      new Paragraph({ text: "Top performers", heading: HeadingLevel.HEADING_2 }),
      table(
        ["Name", "Department", "Score"],
        r.topPerformers.map((e) => [e.name, e.departmentName, score1(e.score)]),
        2
      ),
      new Paragraph({ text: "" })
    );
  }
  if (r.needsAttention.length) {
    children.push(
      new Paragraph({ text: "Needs attention", heading: HeadingLevel.HEADING_2 }),
      table(
        ["Name", "Department", "Score", "Status"],
        r.needsAttention.map((e) => [
          e.name,
          e.departmentName,
          score1(e.score),
          STATUS_LABEL[e.status],
        ]),
        2
      ),
      new Paragraph({ text: "" })
    );
  }

  children.push(
    new Paragraph({ text: "Department detail", heading: HeadingLevel.HEADING_2 })
  );
  for (const d of r.departments.filter((x) => x.headcount > 0)) {
    children.push(
      new Paragraph({ text: d.name, heading: HeadingLevel.HEADING_3 }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${STATUS_LABEL[d.status]} · score ${score1(d.score)} · manager ${d.managerName}`,
            italics: true,
          }),
        ],
      }),
      table(
        ["Employee", "Role", "Score", "Status", "Last scored"],
        d.employees.map((e) => [
          e.name,
          e.role,
          score1(e.score),
          STATUS_LABEL[e.status],
          e.lastScored || "—",
        ]),
        2
      ),
      new Paragraph({ text: "" })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  download(blob, `${stamp(r)}.docx`);
}
