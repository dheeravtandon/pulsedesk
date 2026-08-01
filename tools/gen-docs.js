'use strict';

/** Builds the controlled document set (5 xlsx + 4 docx) into docs/ from tools/docs/content.js. */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle
} = require('docx');

const C = require('./docs/content');
const OUT = path.join(__dirname, '..', 'docs');
const { META } = C;
const V = META.version;

const INK = 'FF10152B';
const ACCENT = 'FF3B2E7E';
const BAND = 'FFF2F4FB';

/* ------------------------------- xlsx helpers ------------------------------- */

function cover(wb, id, title, related, status) {
  const ws = wb.addWorksheet('Cover');
  ws.columns = [{ width: 26 }, { width: 92 }];
  ws.mergeCells('A1:B1');
  const t = ws.getCell('A1');
  t.value = `${META.project} — ${title}`;
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
  t.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 30;

  const rows = [
    ['Document ID', id],
    ['Version', V],
    ['Date', META.date],
    ['Prepared by', META.author],
    ['Status', status],
    ['Related documents', related],
    ['Classification', META.classification],
    ['Revision note', `v${V} — initial baseline issued with the first working build.`]
  ];
  rows.forEach(([k, v]) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: INK } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  ws.addRow([]);
  return ws;
}

function legend(wb, blocks) {
  const ws = wb.addWorksheet('Legend');
  ws.columns = [{ width: 22 }, { width: 24 }, { width: 84 }];
  blocks.forEach(({ title, items }) => {
    const h = ws.addRow([title]);
    h.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    items.forEach(([k, v]) => {
      const r = ws.addRow(['', k, v]);
      r.getCell(2).font = { bold: true };
      r.getCell(3).alignment = { wrapText: true };
    });
    ws.addRow([]);
  });
  return ws;
}

function table(wb, name, headers, rows, widths) {
  const ws = wb.addWorksheet(name);
  ws.columns = headers.map((h, i) => ({ header: h, key: `c${i}`, width: widths[i] }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  rows.forEach((r) => ws.addRow(r));
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

function summary(wb, lines) {
  const ws = wb.addWorksheet('Summary');
  ws.columns = [{ width: 42 }, { width: 22 }];
  const h = ws.addRow(['Metric', 'Value']);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
  lines.forEach(([label, formula]) => {
    const r = ws.addRow([label, null]);
    r.getCell(2).value = { formula, result: undefined };
    r.getCell(2).font = { bold: true };
  });
  return ws;
}

const RTM_HEADERS = ['Req ID', 'Module', 'Description', 'User Role', 'Pri', 'Type', 'Source', 'Design Ref', 'Test Ref', 'Compliance Tag', 'Status'];
const RTM_WIDTHS = [11, 14, 74, 15, 6, 7, 16, 15, 12, 15, 12];

/* --------------------------------- workbooks -------------------------------- */

async function rtm() {
  const wb = new ExcelJS.Workbook();
  cover(wb, 'PD-RTM-001', 'Requirements Traceability Matrix', 'PD-CHR-001, PD-SDD-001, PD-CR-001, PD-PMP-001', 'Baselined');
  legend(wb, [
    { title: 'Priority (MoSCoW)', items: [['M', 'Must have — the build is not acceptable without it'], ['S', 'Should have — important but not fatal at release'], ['C', 'Could have — included when effort allows'], ['W', "Won't have this release"]] },
    { title: 'Type', items: [['FUN', 'Functional'], ['SEC', 'Security'], ['CMP', 'Compliance'], ['NFR', 'Non-functional'], ['INT', 'Integration'], ['RPT', 'Reporting']] },
    { title: 'Status', items: [['Proposed', 'Raised, not yet agreed'], ['Approved', 'Agreed for the release'], ['In Design', 'Being designed in the SDD'], ['Developed', 'Code written'], ['Tested', 'Exercised against live data'], ['Verified', 'Confirmed working in the running app']] },
    { title: 'Conventions', items: [['Design Ref', 'Section of PD-SDD-001 that realises the requirement'], ['Deprecated rows', 'Kept in place with a [DEPRECATED — reason] prefix, never deleted']] }
  ]);
  table(wb, 'Functional RTM', RTM_HEADERS, C.RTM_FUNCTIONAL, RTM_WIDTHS);
  table(wb, 'Security RTM', RTM_HEADERS, C.RTM_SECURITY, RTM_WIDTHS);
  table(wb, 'NFR RTM', RTM_HEADERS, C.RTM_NFR, RTM_WIDTHS);
  table(wb, 'Role Ref', ['Role', 'Description'], [
    ['Investor', 'Primary user tracking a personal portfolio and the market tape'],
    ['Crypto watcher', 'User focused on short-horizon crypto momentum'],
    ['Desk operator', 'User who needs session state and clocks at a glance'],
    ['Developer', 'Maintainer working on the codebase'],
    ['Owner', 'TandSol — accountable for scope, risk and releases'],
    ['System', 'Behaviour with no direct user interaction']
  ], [20, 90]);
  summary(wb, [
    ['Functional requirements', "COUNTA('Functional RTM'!A2:A200)"],
    ['Security requirements', "COUNTA('Security RTM'!A2:A200)"],
    ['NFR requirements', "COUNTA('NFR RTM'!A2:A200)"],
    ['Total requirements', "COUNTA('Functional RTM'!A2:A200)+COUNTA('Security RTM'!A2:A200)+COUNTA('NFR RTM'!A2:A200)"],
    ['Must-have count', "COUNTIF('Functional RTM'!E2:E200,\"M\")+COUNTIF('Security RTM'!E2:E200,\"M\")+COUNTIF('NFR RTM'!E2:E200,\"M\")"],
    ['Verified', "COUNTIF('Functional RTM'!K2:K200,\"Verified\")+COUNTIF('Security RTM'!K2:K200,\"Verified\")+COUNTIF('NFR RTM'!K2:K200,\"Verified\")"],
    ['Developed (not yet verified)', "COUNTIF('Functional RTM'!K2:K200,\"Developed\")+COUNTIF('Security RTM'!K2:K200,\"Developed\")+COUNTIF('NFR RTM'!K2:K200,\"Developed\")"],
    ['Percent verified', "ROUND((COUNTIF('Functional RTM'!K2:K200,\"Verified\")+COUNTIF('Security RTM'!K2:K200,\"Verified\")+COUNTIF('NFR RTM'!K2:K200,\"Verified\"))/(COUNTA('Functional RTM'!A2:A200)+COUNTA('Security RTM'!A2:A200)+COUNTA('NFR RTM'!A2:A200))*100,1)"]
  ]);
  await wb.xlsx.writeFile(path.join(OUT, `PD_RTM_v${V}.xlsx`));
}

async function codeRegister() {
  const wb = new ExcelJS.Workbook();
  cover(wb, 'PD-CR-001', 'Code Register', 'PD-RTM-001, PD-SDD-001', 'Living');
  legend(wb, [
    { title: 'Layer', items: [['Main process', 'Runs in Electron main — has Node and OS access'], ['Bridge', 'contextBridge surface between main and renderer'], ['Service', 'Data acquisition and computation modules'], ['Renderer', 'Sandboxed UI'], ['Tooling', 'Developer utilities, not shipped in the packaged app'], ['Config', 'Manifests and launch configuration'], ['Docs', 'Documentation artefacts']] },
    { title: 'Status', items: [['Done', 'Implemented and verified against live data'], ['WIP', 'In progress'], ['Planned', 'Designed, not yet written']] },
    { title: 'Rule', items: [['Order of work', 'Check this register before opening source files'], ['Update cadence', 'A row is added or amended in the same turn as the file it describes']] }
  ]);
  table(wb, 'Code Register',
    ['File Path', 'Layer', 'Purpose', 'Route/Policy', 'Key Data Stores', 'RTM Req ID', 'Design Ref (SDD §)', 'Status'],
    C.CODE_REGISTER, [30, 15, 68, 30, 26, 40, 18, 10]);
  summary(wb, [
    ['Files registered', "COUNTA('Code Register'!A2:A400)"],
    ['Service modules', "COUNTIF('Code Register'!B2:B400,\"Service\")"],
    ['Renderer files', "COUNTIF('Code Register'!B2:B400,\"Renderer\")"],
    ['Tooling files', "COUNTIF('Code Register'!B2:B400,\"Tooling\")"],
    ['Files complete', "COUNTIF('Code Register'!H2:H400,\"Done\")"],
    ['Percent complete', "ROUND(COUNTIF('Code Register'!H2:H400,\"Done\")/COUNTA('Code Register'!A2:A400)*100,1)"]
  ]);
  await wb.xlsx.writeFile(path.join(OUT, `PD_Code_Register_v${V}.xlsx`));
}

async function riskRegister() {
  const wb = new ExcelJS.Workbook();
  cover(wb, 'PD-RSK-001', 'Risk Register', 'PD-CHR-001, PD-PMP-001, PD-RTM-001', 'Living');
  legend(wb, [
    { title: 'Scoring key', items: [['Score', 'Likelihood × Impact, computed by formula'], ['High', 'Score 15 or above — needs an owner and a dated action'], ['Medium', 'Score 8 to 14 — mitigate and monitor'], ['Low', 'Score 1 to 7 — accept and review at the next cycle']] },
    { title: 'Likelihood', items: [['1', 'Rare'], ['2', 'Unlikely'], ['3', 'Possible'], ['4', 'Likely'], ['5', 'Almost certain']] },
    { title: 'Impact', items: [['1', 'Negligible'], ['2', 'Minor'], ['3', 'Moderate'], ['4', 'Major'], ['5', 'Severe']] },
    { title: 'Response', items: [['Avoid', 'Remove the exposure'], ['Mitigate', 'Reduce likelihood or impact'], ['Transfer', 'Shift to another party'], ['Accept', 'Tolerate with monitoring']] }
  ]);
  const ws = table(wb, 'Risk Register',
    ['Risk ID', 'Category', 'Description', 'Cause/Trigger', 'Impact', 'Likelihood (1-5)', 'Impact (1-5)', 'Score', 'Severity', 'Response', 'Mitigation', 'Owner', 'Status', 'Target Date'],
    C.RISKS.map((r) => [...r.slice(0, 7), null, null, ...r.slice(7)]),
    [10, 14, 62, 30, 42, 12, 10, 8, 11, 11, 74, 10, 10, 13]);

  // Score and severity are live formulas, never pasted values.
  for (let i = 2; i <= C.RISKS.length + 1; i++) {
    ws.getCell(`H${i}`).value = { formula: `F${i}*G${i}` };
    ws.getCell(`I${i}`).value = { formula: `IF(H${i}>=15,"High",IF(H${i}>=8,"Medium","Low"))` };
    ws.getCell(`H${i}`).font = { bold: true };
    ws.getCell(`I${i}`).font = { bold: true };
  }

  summary(wb, [
    ['Total risks', "COUNTA('Risk Register'!A2:A200)"],
    ['High severity', "COUNTIF('Risk Register'!I2:I200,\"High\")"],
    ['Medium severity', "COUNTIF('Risk Register'!I2:I200,\"Medium\")"],
    ['Low severity', "COUNTIF('Risk Register'!I2:I200,\"Low\")"],
    ['Open', "COUNTIF('Risk Register'!M2:M200,\"Open\")"],
    ['Closed', "COUNTIF('Risk Register'!M2:M200,\"Closed\")"],
    ['Average score', "ROUND(AVERAGE('Risk Register'!H2:H200),2)"],
    ['Highest score', "MAX('Risk Register'!H2:H200)"]
  ]);
  await wb.xlsx.writeFile(path.join(OUT, `PD_Risk_Register_v${V}.xlsx`));
}

async function timeline() {
  const wb = new ExcelJS.Workbook();
  cover(wb, 'PD-TL-001', 'Project Timeline', 'PD-PMP-001, PD-CHR-001', 'Living');
  table(wb, 'Timeline',
    ['Phase', 'Name', 'Activities', 'Start', 'End', 'Duration', 'Owner', 'Parallel/Sequential'],
    C.TIMELINE, [10, 18, 76, 13, 13, 12, 10, 20]);

  const gws = wb.addWorksheet('Gantt');
  const weeks = 14;
  gws.columns = [{ header: 'Phase', width: 20 }, ...Array.from({ length: weeks }, (_, i) => ({ header: `W${i + 1}`, width: 5 }))];
  const head = gws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
  // Phases 1-7 all landed inside build week 1; phase 8 is the roadmap tail.
  const spans = [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [2, 14]];
  C.TIMELINE.forEach((p, i) => {
    const row = gws.addRow([`${p[0]} ${p[1]}`, ...Array(weeks).fill('')]);
    const [s, e] = spans[i];
    for (let w = s; w <= e; w++) {
      row.getCell(w + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 7 ? 'FFB9C4E8' : 'FF6C5CE7' } };
    }
  });
  summary(wb, [
    ['Phases', "COUNTA(Timeline!A2:A100)"],
    ['Parallel phases', "COUNTIF(Timeline!H2:H100,\"Parallel\")"],
    ['Sequential phases', "COUNTIF(Timeline!H2:H100,\"Sequential\")"],
    ['Build completed on', "Timeline!E7"],
    ['Roadmap ends', "Timeline!E9"]
  ]);
  await wb.xlsx.writeFile(path.join(OUT, `PD_Project_Timeline_v${V}.xlsx`));
}

async function dpdp() {
  const wb = new ExcelJS.Workbook();
  cover(wb, 'PD-DPDP-001', 'DPDP Compliance Tracker', 'PD-DRP-001, PD-RTM-001, PD-SDD-001', 'Living');
  legend(wb, [
    { title: 'Status', items: [['Done', 'Control in place with cited evidence'], ['Partial', 'Partly addressed, gap recorded in Notes'], ['Not Started', 'No action taken — usually because the section does not apply today']] },
    { title: 'Applicability', items: [['Applicable', 'The section governs this app as built'], ['Partially applicable', 'Governs only a future hosted component'], ['Not applicable', 'Out of scope for a local-only, account-free app']] },
    { title: 'Frameworks', items: [['DPDP', 'Digital Personal Data Protection Act, 2023'], ['CERT-In', 'CERT-In Directions, 28 April 2022'], ['GIGW', 'GIGW 3.0 / WCAG 2.1 AA']] }
  ]);
  table(wb, 'DPDP Tracker',
    ['Ref', 'Section', 'Requirement', 'Applicability', 'Status', 'Evidence', 'Owner', 'Next Review', 'Notes'],
    C.DPDP, [8, 26, 56, 20, 12, 74, 10, 13, 40]);
  summary(wb, [
    ['Sections tracked', "COUNTA('DPDP Tracker'!A2:A200)"],
    ['Done', "COUNTIF('DPDP Tracker'!E2:E200,\"Done\")"],
    ['Partial', "COUNTIF('DPDP Tracker'!E2:E200,\"Partial\")"],
    ['Not started', "COUNTIF('DPDP Tracker'!E2:E200,\"Not Started\")"],
    ['Applicable sections', "COUNTIF('DPDP Tracker'!D2:D200,\"Applicable\")"],
    ['Percent complete', "ROUND(COUNTIF('DPDP Tracker'!E2:E200,\"Done\")/COUNTA('DPDP Tracker'!A2:A200)*100,1)"]
  ]);
  await wb.xlsx.writeFile(path.join(OUT, `PD_DPDP_Compliance_Tracker_v${V}.xlsx`));
}

/* --------------------------------- documents -------------------------------- */

const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...opts.run })], spacing: { after: 120 }, ...opts.para });
const H = (text, level) => new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
const BULLET = (text) => new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });

const NO_BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'D8DEF0' };

function docTable(headers, rows, widths) {
  const cell = (text, bold, shade) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(text), bold, size: 18, color: bold ? 'FFFFFF' : '1B2138' })] })],
      shading: shade ? { fill: shade } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 }
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true, '3B2E7E')) }),
      ...rows.map((r, i) => new TableRow({ children: r.map((c) => cell(c, false, i % 2 ? 'F2F4FB' : undefined)) }))
    ]
  });
}

function coverBlock(id, title, related, status) {
  return [
    new Paragraph({
      children: [new TextRun({ text: `${META.project} — ${title}`, bold: true, size: 40, color: '3B2E7E' })],
      spacing: { after: 200 }
    }),
    docTable(['Field', 'Value'], [
      ['Document ID', id],
      ['Version', V],
      ['Date', META.date],
      ['Prepared by', META.author],
      ['Status', status],
      ['Related documents', related],
      ['Classification', META.classification],
      ['Revision note', `v${V} — initial baseline issued with the first working build.`]
    ], [2200, 7400]),
    new Paragraph({ text: '', spacing: { after: 240 } })
  ];
}

const footer = () =>
  new Paragraph({
    children: [new TextRun({ text: `${META.project} · ${META.author} · v${V} · ${META.date}`, italics: true, size: 16, color: '6B7391' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 }
  });

async function writeDoc(file, children) {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Segoe UI', size: 20, color: '1B2138' } },
        heading1: { run: { font: 'Segoe UI', size: 30, bold: true, color: '3B2E7E' } },
        heading2: { run: { font: 'Segoe UI', size: 24, bold: true, color: '1B2138' } }
      }
    },
    sections: [{ properties: {}, children: [...children, footer()] }]
  });
  fs.writeFileSync(path.join(OUT, file), await Packer.toBuffer(doc));
}

async function charter() {
  await writeDoc(`PD_Project_Charter_v${V}.docx`, [
    ...coverBlock('PD-CHR-001', 'Project Charter', 'PD-HB-001, PD-PMP-001, PD-RTM-001', 'Baselined'),

    H('1. Purpose', HeadingLevel.HEADING_1),
    P('PulseDesk exists to put one screen of live market context permanently in front of a retail investor. Today that context is scattered across a broker app, two news sites, a crypto exchange and a weather widget, and the cost of switching between them is the reason people miss moves. The project collapses that surface into a single always-on-top desktop widget built entirely on free, keyless public APIs.'),

    H('2. Objectives and constraints', HeadingLevel.HEADING_1),
    BULLET('Deliver a Windows desktop application, not a browser tab, so the dashboard can float above whatever the user is working on.'),
    BULLET('Operate at zero running cost — no paid data feeds, no API keys, no subscriptions.'),
    BULLET('Keep all user financial data on the user machine; the app has no backend and no account.'),
    BULLET('Cover Indian and US markets together, since the target user holds both.'),
    BULLET('Stay legible and vibrant at a glance — this is a peripheral-vision instrument, not a research terminal.'),

    H('3. Scope', HeadingLevel.HEADING_1),
    H('3.1 Hype radar', HeadingLevel.HEADING_2),
    P('The five stocks drawing the most attention right now, ranked by a composite of unusual volume, the size of the day move, and how often the ticker appears in current headlines. Satisfies FUN-001 to FUN-003.'),
    H('3.2 Portfolio', HeadingLevel.HEADING_2),
    P('Holdings entry, live valuation, invested capital, unrealised and realised profit and loss, day profit and loss, allocation weights, idle cash and a net-worth trend, all expressed in a base currency of the user choosing. Satisfies FUN-004 to FUN-011 and FUN-030.'),
    H('3.3 News wire', HeadingLevel.HEADING_2),
    P('Fifteen ranked market headlines drawn from eight publishers, each carrying a rise, fall or flat direction call with a confidence figure, the tickers it names, and a link that opens in the system browser. Satisfies FUN-012 to FUN-016.'),
    H('3.4 Crypto momentum', HeadingLevel.HEADING_2),
    P('The ten strongest liquid USDT pairs over an exact trailing five-hour window, with 24-hour context, plus the Fear and Greed index, total market capitalisation and Bitcoin dominance. Satisfies FUN-017 to FUN-019.'),
    H('3.5 Market state', HeadingLevel.HEADING_2),
    P('A scrolling tape of Indian and US indices, commodities, USD/INR and Bitcoin; exchange session clocks with countdowns; and a breadth-derived market pulse score. Satisfies FUN-020 to FUN-022.'),
    H('3.6 Weather', HeadingLevel.HEADING_2),
    P('Current conditions, feels-like temperature, humidity, wind, rain probability, UV, air quality and an eight-hour outlook for the user location, resolvable by IP or by manual coordinates. Satisfies FUN-023 and FUN-024.'),
    H('3.7 Desktop behaviour', HeadingLevel.HEADING_2),
    P('Frameless always-on-top window, optional visibility on every virtual desktop, tray control, global shortcuts, adjustable opacity, click-through widget mode, compact layout, tiered auto-refresh and persistence of window state. Satisfies FUN-025 to FUN-029 and FUN-031.'),

    H('3.8 Free public distribution', HeadingLevel.HEADING_2),
    P('The same dashboard is published as an installable web application so anyone can use it on Android, iPhone or a desktop browser without a store, a fee or an account, alongside a downloadable Windows build. Hosting, delivery, the data relay and the usage counter must all sit inside permanently free tiers. Satisfies FUN-032 to FUN-035, FUN-038 and NFR-011 to NFR-013.'),
    H('3.9 Anonymous usage measurement', HeadingLevel.HEADING_2),
    P('The owner needs to know how many devices are using the app and how many times it is opened each day, without introducing a login and without collecting anything that identifies a person. Counts are surfaced on a private dashboard protected by a shared key. Satisfies FUN-036, FUN-037, SEC-011, SEC-012 and SEC-014.'),
    H('3.10 Attribution', HeadingLevel.HEADING_2),
    P('A subtle, permanent credit to the author appears in the status bar, the tray menu, the web manifest and the packaged application metadata. Satisfies FUN-039.'),

    H('4. Non-functional targets', HeadingLevel.HEADING_1),
    P('Cold start under three seconds; market data never older than sixty seconds while visible; a failing feed degrades that panel only and never blanks the dashboard; outbound calls pooled at eight concurrent requests to stay inside free rate limits; legible from 1240 px down to 620 px with no horizontal scrolling. Detailed in NFR-001 to NFR-010.'),

    H('5. Out of scope for this release', HeadingLevel.HEADING_1),
    BULLET('Order placement or any broker connectivity — the app never touches a trading account.'),
    BULLET('Personalised investment advice or recommendations.'),
    BULLET('Automated broker statement import (roadmap item).'),
    BULLET('Cloud sync, multi-device state or user accounts.'),
    BULLET('macOS and Linux packaging.'),

    H('6. Stakeholders', HeadingLevel.HEADING_1),
    docTable(['Stakeholder', 'Interest', 'Authority'], [
      ['Owner (TandSol)', 'Scope, quality, release, risk acceptance', 'Approves baselines and changes'],
      ['Primary user (investor)', 'Accuracy of P&L, speed of the tape, clarity of the news call', 'Accepts or rejects the build'],
      ['Data publishers', 'Fair, low-volume use of their public endpoints', 'Can withdraw access at any time'],
      ['Maintainer', 'Codebase health, dependency currency', 'Implements approved changes']
    ], [2400, 4600, 2600]),

    H('7. Success criteria', HeadingLevel.HEADING_1),
    BULLET('All seven requested panels render live data on a clean Windows install.'),
    BULLET('Portfolio figures reconcile against the broker statement for a sample of holdings.'),
    BULLET('The window stays above other applications and survives a restart with its position intact.'),
    BULLET('No paid dependency and no API key anywhere in the build.'),
    BULLET('Every requirement in PD-RTM-001 reaches Verified or has a dated action.'),

    H('8. Assumptions', HeadingLevel.HEADING_1),
    BULLET('The machine has a working internet connection during market hours.'),
    BULLET('Public endpoints remain free to use at the volumes this app generates.'),
    BULLET('The user enters holdings accurately, including corporate-action adjustments.'),
    BULLET('The direction call is understood as headline tone, not a price forecast.'),

    H('9. Approval', HeadingLevel.HEADING_1),
    docTable(['Role', 'Name', 'Date', 'Decision'], [
      ['Owner', META.author, META.date, 'Baselined'],
      ['Primary user', 'Pending', '—', 'Pending acceptance']
    ], [2400, 3200, 2000, 2000])
  ]);
}

async function pmp() {
  await writeDoc(`PD_Project_Management_Plan_v${V}.docx`, [
    ...coverBlock('PD-PMP-001', 'Project Management Plan', 'PD-CHR-001, PD-RTM-001, PD-SDD-001, PD-RSK-001, PD-TL-001', 'Baselined'),

    H('1. Delivery approach', HeadingLevel.HEADING_1),
    P('Single-increment delivery by one owner-developer. The seven panels named in the charter were treated as one release rather than a backlog, because each panel is small and the value only appears when the dashboard is complete. Data services were built and smoke-tested against live endpoints before any interface work started, so that layout decisions were made against real values rather than placeholders.'),

    H('2. Governance', HeadingLevel.HEADING_1),
    docTable(['Decision', 'Owner', 'Escalation'], [
      ['Scope change', 'Owner', 'Primary user'],
      ['Risk acceptance', 'Owner', 'Primary user'],
      ['Release approval', 'Owner', '—'],
      ['Data-source substitution', 'Maintainer', 'Owner'],
      ['Document baseline', 'Owner', '—']
    ], [3200, 3200, 3200]),

    H('3. Schedule', HeadingLevel.HEADING_1),
    P('Phases and dates are held in PD-TL-001. Phases 1 to 7 completed on 2026-08-01; phase 8 carries the roadmap items through 2026-10-31. The Gantt tab shows the parallel run of the service and shell phases.'),

    H('4. Scope management', HeadingLevel.HEADING_1),
    P('PD-RTM-001 is the scope baseline. A change is accepted only when it is added there as a new Req ID with a Design Ref pointing at the SDD section that will realise it. Requirements are never deleted — a withdrawn requirement keeps its row with a [DEPRECATED — reason] prefix so the history stays readable. Any scope change triggers a same-day update to the affected documents and a version bump with a dated revision note on the cover.'),

    H('5. Quality management', HeadingLevel.HEADING_1),
    BULLET('Each data service is exercised against its live endpoint before it is wired into the app.'),
    BULLET('Derived numbers are sanity-checked against an independent source — index moves against the exchange site, portfolio P&L against a broker statement.'),
    BULLET('The interface is audited at 1240 px, 760 px and 620 px, checking for clipped cards and horizontal overflow.'),
    BULLET('A security pass covers the Electron hardening checklist before any release.'),
    BULLET('Definition of done: it parses, the happy path and one edge case pass, no injection or secret-handling defects, the app runs, and the Code Register and RTM are updated.'),

    H('6. Risk management', HeadingLevel.HEADING_1),
    P('PD-RSK-001 holds the register. Score is likelihood multiplied by impact, calculated by formula, banded as High at fifteen or above, Medium from eight to fourteen, and Low below that. High risks carry a named owner and a dated action. The register is reviewed whenever a data source changes behaviour and at each release.'),

    H('7. Configuration management', HeadingLevel.HEADING_1),
    P('Git holds every change, one commit per file, with messages in the form feat|fix|refactor|docs|chore: description. Runtime state lives outside the repository in the Electron userData directory so that user data is never committed. Node modules and build output are excluded by .gitignore. Electron and electron-builder versions are pinned in package.json; an upgrade is treated as a change requiring the pinning and transparency smoke test named in RSK-011.'),

    H('8. Communication', HeadingLevel.HEADING_1),
    docTable(['Artefact', 'Audience', 'Frequency'], [
      ['README.md handbook', 'Anyone opening the project', 'Updated on every scope change'],
      ['Risk Register', 'Owner', 'Reviewed per release and on feed failure'],
      ['DPDP tracker', 'Owner', 'Reviewed six-monthly'],
      ['Commit history', 'Maintainer', 'Continuous']
    ], [3200, 3200, 3200]),

    H('9. Release management', HeadingLevel.HEADING_1),
    P('npm run build produces an NSIS installer and a portable executable for Windows. A release is cut only when every Must-have requirement in the RTM reads Verified, the risk register carries no unowned High risk, and the handbook status line reflects the build. Installers are unsigned today; signing is a roadmap item and is tracked as a distribution prerequisite.'),

    H('10. Maintenance', HeadingLevel.HEADING_1),
    P('Third-party feeds are the main maintenance burden. Each has a documented fallback, and the status bar surfaces the failing service name so a break is visible without opening a console. The sentiment lexicon is reviewed quarterly against a sample of recent headlines. The document set is reviewed six-monthly, or immediately when scope changes.')
  ]);
}

async function sdd() {
  await writeDoc(`PD_Design_Document_v${V}.docx`, [
    ...coverBlock('PD-SDD-001', 'Software Design Document', 'PD-RTM-001, PD-CR-001, PD-CHR-001', 'Baselined'),

    H('1. Introduction', HeadingLevel.HEADING_1),
    P('This document describes how PulseDesk realises the requirements baselined in PD-RTM-001. Each section names the Req IDs it satisfies; the Code Register (PD-CR-001) maps those sections onto files.'),

    H('2. Architecture', HeadingLevel.HEADING_1),
    H('2.1 Overview', HeadingLevel.HEADING_2),
    P('Two processes. The Electron main process owns the window, the tray, the timers and every outbound network call; it holds the only copy of the aggregated payload. The renderer is a sandboxed page that receives payload patches over a narrow contextBridge API and draws them. No network call is ever made from the renderer, which keeps CORS irrelevant and keeps the attack surface of untrusted feed content inside a page that has no Node access.'),
    H('2.2 Technology decisions', HeadingLevel.HEADING_2),
    P('Electron was chosen because the requirement is a floating desktop widget, which a browser cannot provide. The renderer is plain HTML, CSS and JavaScript with no framework and no build step, so the shipped code is the code in the repository and can be audited directly; this satisfies NFR-009. Charts are hand-drawn inline SVG rather than a charting library, which keeps the content security policy strict and the bundle small. Storage is plain JSON in the Electron userData directory. Satisfies NFR-005 and NFR-009.'),
    H('2.3 Resilience strategy', HeadingLevel.HEADING_2),
    P('Every primary source has a fallback: Yahoo charts fall back to Stooq CSV, Binance falls back to CoinGecko, IP geolocation falls back through a second provider to a fixed default. Responses are cached with a time-to-live, and a failed refresh serves the last good value rather than clearing the panel. Failures are collected by name and surfaced in the status bar. Satisfies NFR-003 and NFR-010.'),

    H('3. Main process', HeadingLevel.HEADING_1),
    H('3.1 Startup', HeadingLevel.HEADING_2),
    P('A single-instance lock prevents a second copy. On ready the app generates its icon, loads settings, initialises the portfolio store, registers IPC handlers, creates the window and builds the tray. The first refresh of all three tiers is triggered once the renderer reports did-finish-load. Satisfies NFR-001.'),
    H('3.2 Window', HeadingLevel.HEADING_2),
    P('Frameless and transparent with no shadow, minimum size 420 by 320, positioned from saved bounds or against the top-right of the work area. Always-on-top is applied at the screen-saver level so the widget also floats over full-screen applications; visibility on all workspaces and opacity are applied from settings, and click-through mode forwards mouse events to whatever is underneath. Satisfies FUN-025 and FUN-019.'),
    H('3.3 Tray and shortcuts', HeadingLevel.HEADING_2),
    P('The tray icon is generated at runtime by a small PNG encoder rather than shipped as a binary asset, so the repository stays text-only. Its menu toggles visibility, pinning, click-through, all-desktops and opacity, resets the window position, opens the data folder and quits. Ctrl+Alt+P toggles the window and Ctrl+Alt+R forces a refresh. Closing the window leaves the app resident in the tray. Satisfies FUN-026, FUN-027 and NFR-008.'),
    H('3.4 Refresh tiers', HeadingLevel.HEADING_2),
    P('Three intervals match how fast each dataset actually moves: sixty seconds for indices, portfolio valuation, crypto and session state; five minutes for the news wire and the hype ranking, which depends on the news mention counts; thirty minutes for weather. Each tier broadcasts only the keys it refreshed, and the renderer patches only those sections. Satisfies FUN-028 and NFR-002.'),
    H('3.5 External links', HeadingLevel.HEADING_2),
    P('window.open is denied outright and headline links are passed to shell.openExternal after a scheme check that accepts http and https only. Satisfies FUN-016, SEC-004 and SEC-005.'),
    H('3.6 Persistence', HeadingLevel.HEADING_2),
    P('Window bounds are written on move and resize; settings are written on every change. Both live in settings.json in userData, alongside portfolio.json and history.json. Satisfies FUN-029.'),
    H('3.7 Network discipline', HeadingLevel.HEADING_2),
    P('A shared helper wraps fetch with an abort-controller timeout, a browser user-agent, a time-to-live cache that serves stale data on failure, and a pool that caps concurrency at six to eight requests. Satisfies NFR-004 and SEC-009.'),

    H('4. Data services', HeadingLevel.HEADING_1),
    H('4.1 Index tape', HeadingLevel.HEADING_2),
    P('A fixed basket of twelve instruments spanning Indian and US indices, volatility, metals, crude, USD/INR and Bitcoin is fetched as daily candles. Day change is computed from the second-to-last daily close rather than the chart meta previous close, because on a multi-day range that field refers to the close before the whole range. Satisfies FUN-020.'),
    H('4.2 Hype scoring', HeadingLevel.HEADING_2),
    P('Candidates come from Yahoo trending, a curated list of liquid Indian and US names, the user holdings and any ticker named in the current headlines. Each candidate is fetched as one month of daily candles, giving both a twenty-day average volume baseline and the day move. The score weights volume ratio at 0.45, absolute move at 0.35 and news mentions at 0.20, each min-max normalised across the candidate set so the components are comparable, and each card carries the plain-English reason it ranked. Satisfies FUN-001 to FUN-003.'),
    H('4.3 News aggregation', HeadingLevel.HEADING_2),
    P('Eight RSS and Atom feeds are fetched in parallel and parsed without an XML dependency. Entities are decoded twice because publishers frequently double-encode, and a repair pass handles feeds that ship entities with the ampersand already stripped. Headlines are de-duplicated on a normalised nine-word key, scored for tone, scanned for tickers by name, cashtag and alias, then ranked by a blend of tone strength, ticker count and recency. The top fifteen are returned along with the mention counts the hype scorer consumes. Satisfies FUN-012, FUN-014 and FUN-015.'),
    H('4.4 Direction call', HeadingLevel.HEADING_2),
    P('A market-specific lexicon assigns weights to roughly one hundred and fifty bullish and bearish phrases. A negation window before each hit flips and dampens its contribution, hedging language scales the whole score down, and an explicit percentage in the headline adds magnitude in the direction already indicated. The result maps to RISE, FALL or FLAT with a confidence derived from score magnitude and hit count. This is a tone classifier over headline text, not a price model, and the interface labels it as such. Satisfies FUN-013 and mitigates RSK-004.'),
    H('4.5 Portfolio valuation', HeadingLevel.HEADING_2),
    P('Holdings are stored as symbol, quantity, average price and buy date; a repeat buy of the same symbol merges by weighted average rather than creating a second row. Valuation fetches a live quote per holding, resolves each quote currency to the base currency through a live FX cross, and derives invested, current value, unrealised profit and loss, day profit and loss from previous close, and allocation weight. Realised profit and loss comes from the trade log, which is appended when a holding is closed with a sell price. A daily net-worth snapshot is appended to a rolling four-hundred-entry history. Satisfies FUN-004 to FUN-011 and FUN-030.'),
    H('4.6 Crypto momentum', HeadingLevel.HEADING_2),
    P('One call returns all 24-hour tickers; USDT pairs are filtered for liquidity above three million dollars of quote volume with leveraged tokens and stablecoin pairs excluded, and the strongest eighty are re-queried through the rolling-window endpoint with a five-hour window in chunks of forty symbols to stay inside the request-weight cap. The result is the exact five-hour move, not an approximation. If the exchange is unreachable the panel falls back to a one-hour CoinGecko ranking and the interface relabels the window so the user is never shown a five-hour claim built on one-hour data. Satisfies FUN-017 to FUN-019.'),
    H('4.7 Market state', HeadingLevel.HEADING_2),
    P('Session state is computed locally from exchange trading hours using time-zone-aware formatting, with weekend handling and a countdown to the next open or close. Breadth counts advancers against decliners across the tracked universe, and the pulse score blends the advance-decline ratio, average move, the VIX band, the news skew and the crypto Fear and Greed reading into a bounded mood score. Satisfies FUN-021 and FUN-022.'),
    H('4.8 Weather', HeadingLevel.HEADING_2),
    P('Coordinates come from settings when the user has set them, otherwise from an IP lookup with a second provider and a fixed default behind it. Forecast and air-quality calls return current conditions, an eight-hour outlook, daily extremes, UV, sunrise and sunset, and a US AQI band. Manual coordinates keep the location entirely off the network. Satisfies FUN-023, FUN-024 and mitigates RSK-009.'),

    H('5. Renderer', HeadingLevel.HEADING_1),
    H('5.1 Structure', HeadingLevel.HEADING_2),
    P('One page, a draggable title bar, a scrolling index tape, a card grid and a status bar, plus two modal dialogs for adding a holding and for settings. The content security policy is declared in the document head and permits scripts and styles from the page origin only. Satisfies SEC-002.'),
    H('5.2 Layout', HeadingLevel.HEADING_2),
    P('A four-column grid: the hype radar spans the full width, then portfolio and news wire, then crypto and the weather-plus-clocks card. Because cards clip their own overflow, grid rows cannot size themselves from content, so each card declares the height its internal scroll areas are designed around; breakpoints at 980 px and 620 px reduce the grid to two columns and then one, and raise the card heights where the statistics block wraps. Compact mode drops to two columns and hides the allocation donut and the hourly weather strip. Satisfies FUN-031 and NFR-006.'),
    H('5.3 Rendering', HeadingLevel.HEADING_2),
    P('A single render function receives payload patches and calls only the section renderers whose data changed. Sparklines and the allocation donut are built as inline SVG strings with gradient fills; currency formatting is lakh and crore aware for Indian rupees and compact for other currencies; sub-cent crypto prices are shown in full decimals rather than exponent notation. Satisfies FUN-009 and FUN-015.'),
    H('5.4 Accessibility and readability', HeadingLevel.HEADING_2),
    P('Direction is never carried by colour alone — every rise or fall is also marked with an arrow glyph and a signed percentage, and news items carry a written confidence figure alongside the coloured bar. Numeric columns use tabular figures so digits align while values tick. Satisfies NFR-007.'),

    H('6. Security design', HeadingLevel.HEADING_1),
    H('6.1 Process isolation', HeadingLevel.HEADING_2),
    P('The renderer runs with context isolation enabled and node integration disabled, reaching the main process only through the explicit method list exposed by the preload bridge. The content security policy blocks inline and remote scripts. Satisfies SEC-001 and SEC-002.'),
    H('6.2 Untrusted content', HeadingLevel.HEADING_2),
    P('Headlines, coin names and instrument names are third-party strings. Every one passes through an HTML-escaping helper before it reaches the DOM, including inside attribute positions such as link data attributes. Satisfies SEC-003 and mitigates RSK-008.'),
    H('6.3 Navigation', HeadingLevel.HEADING_2),
    P('The window open handler denies in-app navigation and hands the URL to the operating system browser; the IPC endpoint that opens links validates the scheme first. Satisfies SEC-004 and SEC-005.'),
    H('6.4 Secrets', HeadingLevel.HEADING_2),
    P('There are none. Every endpoint used is public and keyless, so there is no credential to leak, rotate or store. Satisfies SEC-006.'),
    H('6.5 Data locality', HeadingLevel.HEADING_2),
    P('Portfolio holdings, cash, settings and the value history never leave the machine. Outbound requests carry ticker symbols and, unless the user has set manual coordinates, an IP-derived coordinate pair — no holding quantities, no prices, no identifiers. Satisfies SEC-007 and SEC-008.'),

    H('7. Tooling', HeadingLevel.HEADING_1),
    H('7.1 Scripts', HeadingLevel.HEADING_2),
    P('npm start runs the app; npm run dev additionally pipes renderer console output to the terminal; npm run build packages an NSIS installer and a portable executable.'),
    H('7.2 Renderer preview', HeadingLevel.HEADING_2),
    P('A localhost static server serves the renderer directory so layout work can be done in a browser without launching Electron. It refuses any path that escapes the renderer root. Satisfies SEC-010.'),
    H('7.3 Document generation', HeadingLevel.HEADING_2),
    P('The controlled document set is generated from a single content module, so a scope change is edited in one place and re-emitted as spreadsheets and documents with consistent cover blocks and live summary formulas.'),

    H('8. Data model', HeadingLevel.HEADING_1),
    docTable(['File', 'Shape', 'Written by'], [
      ['portfolio.json', 'baseCurrency, cash, holdings[symbol, qty, avgPrice, buyDate], trades[symbol, qty, buyPrice, sellPrice, date]', 'Portfolio service'],
      ['history.json', 'Rolling 400 entries of date, timestamp, value, unrealised P&L', 'Portfolio service'],
      ['settings.json', 'bounds, alwaysOnTop, opacity, clickThrough, compact, showOnAllDesktops, hyperMarket, weather coordinates, refresh intervals', 'Main process']
    ], [2200, 5600, 2200]),

    H('10. Web and mobile distribution', HeadingLevel.HEADING_1),
    H('10.1 Edge worker', HeadingLevel.HEADING_2),
    P('A browser cannot call Yahoo Finance, Binance or the publisher feeds directly, because none of them return cross-origin headers. A Cloudflare Worker therefore runs the same service modules the desktop main process runs and answers with CORS enabled. Every route is cached at the edge for the interval that matches how fast the data moves — sixty seconds for indices, crypto and quotes, five minutes for news and the hype ranking, thirty minutes for weather — so ten thousand users cost roughly the same upstream traffic as one. Weather coordinates are rounded to one decimal place before use, which both coarsens the location and raises the cache hit rate. Satisfies FUN-034, NFR-011 and SEC-013.'),
    H('10.2 Web build', HeadingLevel.HEADING_2),
    P('The web application is not a second implementation. A build script takes the same index.html, styles.css and app.js the desktop uses, rewrites the content security policy to permit connections to the worker, injects a browser bridge and a set of phone-specific style overrides, and emits the bundle. The bridge exposes exactly the window.pulse surface the renderer expects, so app.js is unaware of which host it is running in; underneath, market data comes from fetch instead of IPC and the portfolio lives in local storage instead of a JSON file. Holdings never leave the device. Satisfies FUN-032, FUN-035, SEC-015 and NFR-012.'),
    H('10.3 Installability', HeadingLevel.HEADING_2),
    P('A web manifest and a service worker make the app installable from the browser on Android, iOS and desktop, with its own icon and no browser chrome. The service worker precaches the shell so the app opens without a connection, and deliberately never caches market responses, because a stale price is worse than a visible failure. Android and desktop receive the native install prompt; iOS gets an Add to Home Screen hint on first visit. Satisfies FUN-032 and FUN-033.'),
    H('10.4 Continuous delivery', HeadingLevel.HEADING_2),
    P('One workflow builds the web bundle and publishes it to GitHub Pages on every push that touches the renderer or the web sources. A second workflow runs on a version tag, packages the Windows installer and portable executable on a Windows runner, and attaches them to the GitHub release. Icons for packaging are generated at build time from the same PNG encoder used for the tray, so no binary asset is committed. Satisfies FUN-038.'),
    H('10.5 Cost model', HeadingLevel.HEADING_2),
    P('GitHub Pages, GitHub Releases, GitHub Actions on a public repository, Cloudflare Workers and Cloudflare D1 all operate inside permanently free tiers at the scale this application generates. There is no paid dependency anywhere in the delivery chain; the deliberate exclusions — app store listings and code signing — are recorded with their costs in PD-DEP-001. Satisfies NFR-013.'),

    H('11. Usage measurement', HeadingLevel.HEADING_1),
    H('11.1 Counting without accounts', HeadingLevel.HEADING_2),
    P('Each browser generates a random identifier for itself on first run and keeps it in local storage. The app posts one open event when it starts and a heartbeat every few minutes while it is visible; the worker records the identifier, the date, a timestamp, the event kind, the platform and the two-letter country supplied by the edge. No IP address, cookie, email or account is stored, and identifiers are sanitised and length-capped before they reach the database. Rows older than ninety days are deleted opportunistically on write. Satisfies FUN-036, SEC-012 and SEC-014.'),
    H('11.2 Private dashboard', HeadingLevel.HEADING_2),
    P('A static page reads an aggregate endpoint and shows devices active in the last five minutes, opens today, distinct devices today, this week and all time, a thirty-day trend, and a country and platform split. The endpoint is refused without a shared key held as a worker secret, so the dashboard is private without introducing an account for the owner either. The page states plainly that counts are devices rather than people, which is the honest reading of a login-free measure. Satisfies FUN-037 and SEC-011.'),

    H('12. Extension points', HeadingLevel.HEADING_1),
    BULLET('Additional quote providers slot in behind the chart function as further fallbacks.'),
    BULLET('The ticker alias map is data, so covering more scrips is an edit rather than a code change.'),
    BULLET('The sentiment lexicon is a plain weight table and can be retuned or replaced with a model without touching the wire.'),
    BULLET('A broker CSV importer only needs to produce the holdings array shape already accepted by the portfolio import channel.')
  ]);
}

async function retention() {
  await writeDoc(`PD_Data_Retention_Policy_v${V}.docx`, [
    ...coverBlock('PD-DRP-001', 'Data Retention Policy', 'PD-DPDP-001, PD-SDD-001, PD-CHR-001', 'Living'),

    H('1. Purpose and scope', HeadingLevel.HEADING_1),
    P('This policy states what PulseDesk stores, where it stores it, for how long, and how it is erased. It covers everything the application writes to disk on the user machine. It does not cover data held by the third-party services the application reads from, because the application sends them no user data beyond ticker symbols and, unless overridden, an IP-derived coordinate pair.'),

    H('2. Data categories', HeadingLevel.HEADING_1),
    docTable(['Category', 'Examples', 'Retention trigger / period', 'Legal basis'],
      C.RETENTION.map((r) => [r[0], r[1], r[2], r[3]]), [2000, 2800, 2800, 2400]),

    H('3. Storage location', HeadingLevel.HEADING_1),
    P('All application data is written to the Electron userData directory, which on Windows is %APPDATA%\\pulse-desk. Nothing is written to the repository, to a cloud service or to any server. The tray menu offers a direct shortcut to this folder so the user can inspect, back up or delete the files at any time.'),

    H('4. Erasure process', HeadingLevel.HEADING_1),
    BULLET('A single holding is erased by removing it in the portfolio card; the row is deleted from portfolio.json immediately.'),
    BULLET('The entire portfolio is erased by deleting portfolio.json, or by replacing its contents through the import channel.'),
    BULLET('The value history is erased by deleting history.json; the chart simply starts rebuilding from the next snapshot.'),
    BULLET('All application data, including window state and cached Chromium files, is erased by deleting %APPDATA%\\pulse-desk.'),
    BULLET('Uninstalling the packaged application does not remove the data folder — this is deliberate, so an upgrade does not wipe holdings. Users who want a clean removal delete the folder as well.'),

    H('5. Third-party calls', HeadingLevel.HEADING_1),
    P('The application makes outbound requests to Yahoo Finance, Stooq, Binance, CoinGecko, alternative.me, Open-Meteo, the IP geolocation providers and the listed news publishers. These requests carry ticker symbols, currency pairs and coordinates. They do not carry quantities, purchase prices, portfolio totals, a device identifier or an account, because none exists. Setting manual latitude and longitude in settings removes the geolocation lookup entirely and is the recommended configuration for privacy-sensitive users.'),

    H('6. Known gaps', HeadingLevel.HEADING_1),
    BULLET('Data at rest is not encrypted; it relies on the operating system user profile for protection. Appropriate for a single-user desktop, insufficient for a shared machine.'),
    BULLET('There is no scheduled purge of the value history beyond the rolling four-hundred-entry cap.'),
    BULLET('A dedicated grievance contact is not yet published; the repository maintainer is the current contact point. Tracked as DP-09.'),
    BULLET('A formal breach advisory template has not been written. Tracked as DP-07.'),

    H('7. Ownership and review', HeadingLevel.HEADING_1),
    P(`Owned by ${META.author}. Reviewed every six months, or immediately when a new data category is introduced, a new outbound endpoint is added, or a hosted component is proposed. Next scheduled review: 2027-02-01.`)
  ]);
}

/* ----------------------------------- main ----------------------------------- */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await rtm();
  await codeRegister();
  await riskRegister();
  await timeline();
  await dpdp();
  await charter();
  await pmp();
  await sdd();
  await retention();
  console.log('Generated:', fs.readdirSync(OUT).sort().join(', '));
})();
