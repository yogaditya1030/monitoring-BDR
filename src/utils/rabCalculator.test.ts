import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhaseSlashSvg,
  calculateGeodesicDistanceMeters,
  calculateOffsetLineCoords,
  calculatePoleCalloutOffset,
  calculateRabRowBreakdown,
  calculateRabSummary,
  formatPoleCalloutLines,
  generateRabItemsFromSurvey,
  getCableVisualStyle,
  getConstructionAssignmentBreakdown,
  getEffectiveSpanCables,
  getPhaseSlashSymbol,
  getPoleKhsMaterialBreakdown,
  getStaggeredPhaseTickRatio,
  inferPhaseCountFromConductor,
  numberToTerbilangRupiah,
  updateRabPackageHeaderVolume,
  computeEtiketCalloutLayout,
  isCableMarkedBongkar,
  isSpanMarkedBongkar,
  rectsOverlap,
  normalizeRabPackageItems,
  buildConnectedEtiketRoadNetwork,
} from './rabCalculator';
import {
  PRESET_SMPN3_PABELAN_NODES,
  PRESET_SMPN3_PABELAN_SPANS,
  CONSTRUCTION_PACKAGES_CATALOG,
  KHS_MASTER_CATALOG,
} from '../data/khsAndConstructionCatalog';

test('calculateGeodesicDistanceMeters calculates ~40m between adjacent Pabelan poles', () => {
  const dist = calculateGeodesicDistanceMeters(
    -7.5818,
    110.25716,
    -7.58144,
    110.25716
  );
  assert.ok(dist >= 38 && dist <= 42, `Expected ~40m, got ${dist}m`);
});

test('formatPoleCalloutLines formats construction codes matching PLN survey drawing', () => {
  const node = PRESET_SMPN3_PABELAN_NODES.find(
    (n) => n.kodeTiang === 'SA4-20/5'
  )!;
  const lines = formatPoleCalloutLines(node);
  assert.deepEqual(lines, [
    '1 C9-200',
    '1 SJ6',
    '1 MJ6-T',
    '1 SE1-2',
    '1 F1-2',
    '1 CM2-12',
    '1 CM2-12A',
  ]);
});

test('getCableVisualStyle differentiates JTM, JTR, and SR with distinct colors and dash patterns', () => {
  const jtmStyle = getCableVisualStyle('JTM', 'RENCANA');
  const jtrStyle = getCableVisualStyle('JTR', 'RENCANA');
  const srStyle = getCableVisualStyle('SR', 'RENCANA');

  assert.notEqual(jtmStyle.strokeColor, jtrStyle.strokeColor);
  assert.notEqual(jtrStyle.strokeColor, srStyle.strokeColor);
  assert.notEqual(jtmStyle.strokeColor, srStyle.strokeColor);
  assert.equal(jtmStyle.strokeColor, '#dc2626'); // Red for JTM 20kV
  assert.equal(jtrStyle.strokeColor, '#0284c7'); // Blue/Cyan for JTR LVTC
  assert.equal(srStyle.strokeColor, '#d97706'); // Amber for SR
  assert.ok(srStyle.dashArray, 'SR cable should use dashed line pattern');
});

test('1-Phase (/) vs 3-Phase (///) cable slash marks and phase-aware RAB calculation for JTM & JTR', () => {
  assert.equal(inferPhaseCountFromConductor('NFA2X-T 3x70+1x70'), 3);
  assert.equal(inferPhaseCountFromConductor('NFA2X-T 2x70'), 1);
  assert.equal(inferPhaseCountFromConductor('AAAC 70', 1), 1);
  assert.equal(inferPhaseCountFromConductor('AAAC 70', 3), 3);

  assert.equal(getPhaseSlashSymbol(1), '/');
  assert.equal(getPhaseSlashSymbol(3), '///');

  const svg1Phase = buildPhaseSlashSvg(1, '#dc2626', 0);
  const svg3Phase = buildPhaseSlashSvg(3, '#dc2626', 0);
  // 1-Phase has 2 <line> elements (1 halo + 1 stroke); 3-Phase has 6 <line> elements (3 halos + 3 strokes)
  assert.equal((svg1Phase.match(/<line /g) || []).length, 2);
  assert.equal((svg3Phase.match(/<line /g) || []).length, 6);

  // Verify 1-Phase JTM AAAC 70 uses 1 wire (50m * 1 * 1.03 = 52m) vs 3-Phase (50m * 3 * 1.03 = 155m)
  const items1PhaseJtm = generateRabItemsFromSurvey({
    nodes: PRESET_SMPN3_PABELAN_NODES.slice(0, 2),
    spans: [
      {
        id: 'sp-1p',
        fromNodeId: 'node-ext-19',
        toNodeId: 'node-ext-20',
        statusJaringan: 'RENCANA',
        jenisJaringan: 'JTM',
        conductorType: 'AAAC 70',
        phaseCount: 1,
        distanceMeters: 50,
      },
    ],
    includePembetonanTiang: false,
    transportasiRit: 0,
  });
  const aaac1P = items1PhaseJtm.find((i) => i.uraian.includes('AAAC 70'));
  assert.ok(aaac1P);
  assert.equal(aaac1P.volume, 52);
});

test('calculateOffsetLineCoords generates distinct parallel coordinates when a span has >1 cable', () => {
  const line0 = calculateOffsetLineCoords(-7.5818, 110.257, -7.5814, 110.257, 0, 2);
  const line1 = calculateOffsetLineCoords(-7.5818, 110.257, -7.5814, 110.257, 1, 2);
  assert.notDeepEqual(line0, line1, 'Parallel cables in the same span must not overlap');
});

test('getPoleKhsMaterialBreakdown expands Standar Konstruksi into exact KHS unit prices', () => {
  const pole1 = PRESET_SMPN3_PABELAN_NODES.find((n) => n.kodeTiang === 'SA4-20/1')!;
  const breakdown = getPoleKhsMaterialBreakdown(pole1);
  assert.ok(breakdown.rows.length >= 6, 'Should expand C9-200, SJ5, and CM2-12 components');
  assert.ok(breakdown.totalHardware > 0);
  assert.ok(breakdown.totalJasa > 0);
  assert.equal(
    breakdown.totalBiayaTitik,
    breakdown.totalMdu + breakdown.totalHardware + breakdown.totalJasa
  );
  const offset = calculatePoleCalloutOffset(
    pole1,
    PRESET_SMPN3_PABELAN_NODES,
    PRESET_SMPN3_PABELAN_SPANS,
    2
  );
  assert.ok(Math.abs(offset.dx) >= 40, 'Callout offset must clear pole and cable geometry');
});

test('generateRabItemsFromSurvey supports multi-cable spans (e.g. JTM + JTR + SR on the same gawang)', () => {
  const multiCableSpan = {
    id: 'span-multi-1',
    fromNodeId: 'node-ext-20',
    toNodeId: 'node-plan-1',
    statusJaringan: 'RENCANA' as const,
    jenisJaringan: 'JTM' as const,
    conductorType: 'AAAC 70' as const,
    distanceMeters: 50,
    cables: [
      {
        id: 'c1',
        statusJaringan: 'RENCANA' as const,
        jenisJaringan: 'JTM' as const,
        conductorType: 'AAAC 70' as const,
        phaseCount: 3 as const,
        circuitCount: 1,
      },
      {
        id: 'c2',
        statusJaringan: 'RENCANA' as const,
        jenisJaringan: 'JTR' as const,
        conductorType: 'NFA2X-T 3x70+1x70' as const,
        phaseCount: 3 as const,
        circuitCount: 1,
      },
      {
        id: 'c3',
        statusJaringan: 'RENCANA' as const,
        jenisJaringan: 'SR' as const,
        conductorType: 'NFA2X 2x16' as const,
        phaseCount: 1 as const,
        circuitCount: 2,
      },
    ],
  };

  assert.equal(getEffectiveSpanCables(multiCableSpan).length, 3);

  const items = generateRabItemsFromSurvey({
    nodes: PRESET_SMPN3_PABELAN_NODES.slice(0, 3),
    spans: [multiCableSpan],
    includePembetonanTiang: false,
    transportasiRit: 0,
  });

  // 1. Check JTM AAAC 70 (50m * 3 phases * 1.03 = 155m)
  const aaacItem = items.find((i) => i.uraian.includes('AAAC 70'));
  assert.ok(aaacItem, 'Should include AAAC 70 from multi-cable span');
  assert.equal(aaacItem.volume, 155);

  // 2. Check JTR LVTC 3x70+1x70 (50m * 1 * 1.02 = 51m)
  const lvtcItem = items.find((i) => i.uraian.includes('NFA2X-T 3x70 + 1x70'));
  assert.ok(lvtcItem, 'Should include LVTC 3x70+1x70 from multi-cable span');
  assert.equal(lvtcItem.volume, 51);

  // 3. Check SR 2x16 (50m * 2 circuits * 1.05 = 105m)
  const srItem = items.find((i) => i.uraian.includes('2x16'));
  assert.ok(srItem, 'Should include SR 2x16 from multi-cable span');
  assert.equal(srItem.volume, 105);
});

test('calculateRabRowBreakdown splits MDU-KD, HDW, and JASA accurately', () => {
  const mduRow = calculateRabRowBreakdown({
    gol: 'MDU-KD',
    volume: 100,
    hargaSatuan: 46900,
  });
  assert.deepEqual(mduRow, {
    mdu: 4690000,
    hardware: 0,
    jasa: 0,
    jumlah: 4690000,
  });

  const hdwRow = calculateRabRowBreakdown({
    gol: 'HDW',
    volume: 5,
    hargaSatuan: 2820850,
  });
  assert.deepEqual(hdwRow, {
    mdu: 0,
    hardware: 14104250,
    jasa: 0,
    jumlah: 14104250,
  });

  const jasaRow = calculateRabRowBreakdown({
    gol: 'JASA',
    volume: 5,
    hargaSatuan: 204691,
  });
  assert.deepEqual(jasaRow, {
    mdu: 0,
    hardware: 0,
    jasa: 1023455,
    jumlah: 1023455,
  });
});

test('generateRabItemsFromSurvey expands SMP N 3 Pabelan 5 planned poles and 200m LVTC into official RAB sections', () => {
  const items = generateRabItemsFromSurvey({
    nodes: PRESET_SMPN3_PABELAN_NODES,
    spans: PRESET_SMPN3_PABELAN_SPANS,
    includePembetonanTiang: true,
    transportasiRit: 1,
  });

  // Check Section I: 5x Tiang Beton 9m-200 daN+E
  const tiangItem = items.find(
    (i) => i.section === 'I' && i.uraian.includes('Tiang Beton 9m-200')
  );
  assert.ok(tiangItem, 'Should include Tiang Beton 9m-200 daN+E');
  assert.equal(tiangItem.volume, 5);
  assert.equal(tiangItem.gol, 'HDW');

  // Check Section VIII: Skur & Anchor from pole SA4-20/5 (SE1-2 & F1-2)
  const skurWire = items.find(
    (i) => i.section === 'VIII' && i.uraian.includes('Steel Wire 35')
  );
  assert.ok(skurWire, 'Should include Steel Wire 35 mm² for SE1-2');
  assert.equal(skurWire.volume, 12);

  // Check Section IX: 5x Ground Rod from 5x CM2-12
  const groundRod = items.find(
    (i) => i.section === 'IX' && i.uraian.includes('Ground Rod')
  );
  assert.ok(groundRod, 'Should include 5 sets of Ground Rod');
  assert.equal(groundRod.volume, 5);

  // Check Section X: 4x Suspension Assembly (SJ5) and 1x Fixed Dead End (SJ6)
  const sj5Item = items.find(
    (i) => i.section === 'X' && i.uraian.includes('Suspension Assembly')
  );
  assert.ok(sj5Item);
  assert.equal(sj5Item.volume, 4);

  const sj6Item = items.find(
    (i) => i.section === 'X' && i.uraian.includes('Fixed Dead End')
  );
  assert.ok(sj6Item);
  assert.equal(sj6Item.volume, 1);

  // Check Section XI: 5 planned spans @ 40m = 200m * 1.02 andongan = 204m LVTC 3x70+1x70
  const lvtcItem = items.find(
    (i) => i.section === 'XI' && i.uraian.includes('NFA2X-T 3x70 + 1x70')
  );
  assert.ok(lvtcItem);
  assert.equal(lvtcItem.volume, 204);
  assert.equal(lvtcItem.gol, 'MDU-KD');

  const summary = calculateRabSummary(items, 10);
  assert.ok(summary.subTotalMdu > 0);
  assert.ok(summary.subTotalHardware > 0);
  assert.ok(summary.subTotalJasa > 0);
  assert.equal(
    summary.subTotalJumlah,
    summary.subTotalMdu + summary.subTotalHardware + summary.subTotalJasa
  );
  assert.equal(summary.grandTotal, summary.subTotalJumlah + summary.ppnAmount);
  assert.ok(summary.terbilang.endsWith('Rupiah'));
});

test('numberToTerbilangRupiah converts numbers to exact Indonesian words', () => {
  assert.equal(
    numberToTerbilangRupiah(30016107),
    'Tiga Puluh Juta Enam Belas Ribu Seratus Tujuh Rupiah'
  );
  assert.equal(numberToTerbilangRupiah(1050000), 'Satu Juta Lima Puluh Ribu Rupiah');
  assert.equal(numberToTerbilangRupiah(0), 'Nol Rupiah');
});

test('getStaggeredPhaseTickRatio staggers longitudinal tick positions so parallel cable phase slashes never stack', () => {
  assert.equal(getStaggeredPhaseTickRatio(0, 1), 0.28);
  const ratio2_0 = getStaggeredPhaseTickRatio(0, 2);
  const ratio2_1 = getStaggeredPhaseTickRatio(1, 2);
  assert.notEqual(ratio2_0, ratio2_1);
  assert.ok(Math.abs(ratio2_1 - ratio2_0) >= 0.35, 'Two parallel cables must have widely separated phase ticks');

  const ratio3_0 = getStaggeredPhaseTickRatio(0, 3);
  const ratio3_1 = getStaggeredPhaseTickRatio(1, 3);
  const ratio3_2 = getStaggeredPhaseTickRatio(2, 3);
  assert.notEqual(ratio3_0, ratio3_1);
  assert.notEqual(ratio3_1, ratio3_2);
});

test('getConstructionAssignmentBreakdown and generateRabItemsFromSurvey respect disabledKhsIds and customComponentQty', () => {
  const fullBreakdown = getConstructionAssignmentBreakdown({
    code: 'SJ8',
    qty: 1,
  });
  assert.ok(fullBreakdown.rows.length >= 2);
  assert.ok(fullBreakdown.totalActivePrice > 0);

  const firstKhsId = fullBreakdown.rows[0].khsId;
  const partialBreakdown = getConstructionAssignmentBreakdown({
    code: 'SJ8',
    qty: 1,
    disabledKhsIds: [firstKhsId],
  });
  assert.ok(
    partialBreakdown.totalActivePrice < fullBreakdown.totalActivePrice,
    'Disabling a KHS component must reduce construction cost'
  );
  const disabledRow = partialBreakdown.rows.find((r) => r.khsId === firstKhsId)!;
  assert.equal(disabledRow.enabled, false);
  assert.equal(disabledRow.jumlahHarga, 0);
});

test('generateRabItemsFromSurvey expands GARDU_RENCANA constructions into RAB items', () => {
  const items = generateRabItemsFromSurvey({
    nodes: [
      {
        id: 'node-gardu-rencana-1',
        kodeTiang: 'GD-BBD-R01',
        kind: 'GARDU_RENCANA',
        lat: -7.5818,
        lng: 110.25716,
        constructions: [
          { code: 'C12-350', qty: 2 },
          { code: 'CG-135 (50kVA)', qty: 1 },
        ],
      },
    ],
    spans: [],
    includePembetonanTiang: false,
    transportasiRit: 0,
  });

  assert.ok(items.length > 0, 'GARDU_RENCANA node should produce RAB items');
  const summary = calculateRabSummary(items, 11);
  assert.ok(summary.grandTotal > 0, 'GARDU_RENCANA should contribute to RAB grandTotal');
});

test('generateRabItemsFromSurvey emits hierarchical package header row (+ | MJ6-T | Unit | Vol) followed by its detail materials', () => {
  const items = generateRabItemsFromSurvey({
    nodes: PRESET_SMPN3_PABELAN_NODES,
    spans: PRESET_SMPN3_PABELAN_SPANS,
    includePembetonanTiang: true,
    transportasiRit: 1,
  });

  const mj6HeaderIdx = items.findIndex(
    (i) => i.isPackageHeader && i.uraian === 'MJ6-T' && i.section === 'X'
  );
  assert.ok(
    mj6HeaderIdx >= 0,
    'Should include package header row (+ | MJ6-T | Unit | 1) in Section X'
  );
  const mj6Header = items[mj6HeaderIdx];
  assert.equal(mj6Header.satuan, 'Unit');
  assert.equal(mj6Header.volume, 1);
  assert.deepEqual(calculateRabRowBreakdown(mj6Header), {
    mdu: 0,
    hardware: 0,
    jasa: 0,
    jumlah: 0,
  });

  // Immediately after MJ6-T header should be its 5 official detail rows numbered 1..5
  const mj6Children = items.slice(mj6HeaderIdx + 1, mj6HeaderIdx + 6);
  assert.equal(mj6Children.length, 5);
  assert.equal(mj6Children[0].itemNo, 1);
  assert.ok(mj6Children[0].uraian.includes('Insulating Tape'));
  assert.ok(mj6Children[1].uraian.includes('Split Plastic Sleve'));
  assert.ok(mj6Children[2].uraian.includes('Stainless Steel Strap'));
  assert.ok(mj6Children[3].uraian.includes('Stopping Buckle'));
  assert.ok(mj6Children[4].uraian.includes('Upah Pasang Konst. JTR MJ6-T'));
});

test('Marking a pole or construction as BONGKAR generates Jasa Pembongkaran in Section XV', () => {
  const items = generateRabItemsFromSurvey({
    nodes: [
      {
        id: 'node-bongkar-1',
        kodeTiang: 'SA4-637/174/20',
        kind: 'TIANG_EKSISTING',
        isBongkar: true,
        lat: -7.5818,
        lng: 110.25716,
        constructions: [
          { code: 'C9-200', qty: 1, actionType: 'BONGKAR' },
          { code: 'SJ6', qty: 1, actionType: 'BONGKAR' },
        ],
      },
    ],
    spans: [],
    includePembetonanTiang: false,
    transportasiRit: 0,
  });

  const bongkarTiang = items.find(
    (i) => i.section === 'XV' && i.uraian.includes('Upah Bongkar Tiang Beton')
  );
  assert.ok(bongkarTiang, 'Should include Upah Bongkar Tiang Beton in Section XV');
  assert.equal(bongkarTiang.volume, 1);
  assert.equal(bongkarTiang.gol, 'JASA');

  const bongkarJtr = items.find(
    (i) => i.section === 'XV' && i.uraian.includes('Upah Bongkar Konst. JTR')
  );
  assert.ok(bongkarJtr, 'Should include Upah Bongkar Konst. JTR in Section XV');
  assert.equal(bongkarJtr.volume, 1);
});

test('updateRabPackageHeaderVolume multiplies SJ6 detail materials when changing from 1 -> 0 (backspace) -> 3 and CM2-12 canvas breakdown multiplies by 3', () => {
  const items = generateRabItemsFromSurvey({
    nodes: PRESET_SMPN3_PABELAN_NODES,
    spans: PRESET_SMPN3_PABELAN_SPANS,
    includePembetonanTiang: true,
    transportasiRit: 1,
  });

  const sj6Header = items.find((i) => i.isPackageHeader && i.uraian === 'SJ6')!;
  assert.ok(sj6Header);
  assert.equal(sj6Header.volume, 1);

  // Step 1: User presses Backspace in the input (volume becomes 0)
  const afterBackspace = updateRabPackageHeaderVolume(items, sj6Header.id, 0);
  const sj6ChildrenZero = afterBackspace.filter((i) => i.parentPackageCode === 'SJ6');
  assert.ok(sj6ChildrenZero.every((r) => r.volume === 0));

  // Step 2: User types '3' (volume becomes 3) -> all detail materials must multiply by 3 (not stay 0!)
  const afterType3 = updateRabPackageHeaderVolume(afterBackspace, sj6Header.id, 3);
  const sj6ChildrenThree = afterType3.filter((i) => i.parentPackageCode === 'SJ6');
  // SJ6 base quantities: [1, 1, 2.5, 2, 3, 1] -> x3 = [3, 3, 7.5, 6, 9, 3]
  assert.deepEqual(
    sj6ChildrenThree.map((r) => r.volume),
    [3, 3, 7.5, 6, 9, 3]
  );

  // Also verify Canvas breakdown for 3x CM2-12 multiplies volumes to 3, 9, 3, 3
  const cm2Breakdown = getConstructionAssignmentBreakdown({
    code: 'CM2-12',
    qty: 3,
  });
  assert.deepEqual(
    cm2Breakdown.rows.map((r) => r.volume),
    [3, 9, 3, 3]
  );
});

test('computeEtiketCalloutLayout places 8 curved-road poles, span badges, and road labels with zero bounding-box overlap', () => {
  // Replicate the 8-pole curved road geometry from the user screenshot (SA4-20/1..8)
  const nodes = [
    { id: 'p1', kodeTiang: 'SA4-20/1', kind: 'TIANG_RENCANA' as const, x: 255, y: 375, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    { id: 'p2', kodeTiang: 'SA4-20/2', kind: 'TIANG_RENCANA' as const, x: 252, y: 295, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    { id: 'p3', kodeTiang: 'SA4-20/3', kind: 'TIANG_RENCANA' as const, x: 258, y: 215, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    { id: 'p4', kodeTiang: 'SA4-20/4', kind: 'TIANG_RENCANA' as const, x: 272, y: 140, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    // SA4-20/5 and SA4-20/6 sit close together near the top bend
    { id: 'p5', kodeTiang: 'SA4-20/5', kind: 'TIANG_RENCANA' as const, x: 392, y: 105, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    { id: 'p6', kodeTiang: 'SA4-20/6', kind: 'TIANG_RENCANA' as const, x: 325, y: 112, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    { id: 'p7', kodeTiang: 'SA4-20/7', kind: 'TIANG_RENCANA' as const, x: 595, y: 125, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
    // SA4-20/8 sits right near the default simpang road label
    { id: 'p8', kodeTiang: 'SA4-20/8', kind: 'TIANG_RENCANA' as const, x: 595, y: 205, lines: ['1 C9-200', '1 SJ5', '1 CM2-12'] },
  ];

  const spans = [
    { id: 's1', x1: 255, y1: 375, x2: 252, y2: 295, badgeText: '23m (JTR ///)', badgeW: 84 },
    { id: 's2', x1: 252, y1: 295, x2: 258, y2: 215, badgeText: '22m (JTR ///)', badgeW: 84 },
    { id: 's3', x1: 258, y1: 215, x2: 272, y2: 140, badgeText: '22m (JTR ///)', badgeW: 84 },
    { id: 's4', x1: 392, y1: 105, x2: 595, y2: 125, badgeText: '46m (JTR ///)', badgeW: 84 },
    { id: 's5', x1: 595, y1: 125, x2: 595, y2: 205, badgeText: '25m (JTR ///)', badgeW: 84 },
  ];

  const layout = computeEtiketCalloutLayout({
    nodes,
    spans,
    defaultMainRoadCenter: { x: 290, y: 415 },
    defaultSimpangRoadCenter: { x: 420, y: 185 },
    showRoadSketch: true,
  });

  assert.equal(layout.nodePlacements.length, 8);
  assert.equal(layout.spanBadges.length, 5);

  // Verify no two callout boxes overlap each other
  for (let i = 0; i < layout.nodePlacements.length; i++) {
    for (let j = i + 1; j < layout.nodePlacements.length; j++) {
      const a = layout.nodePlacements[i];
      const b = layout.nodePlacements[j];
      const overlap = rectsOverlap(
        { x: a.boxX, y: a.boxY, w: a.boxWidth, h: a.boxHeight },
        { x: b.boxX, y: b.boxY, w: b.boxWidth, h: b.boxHeight },
        2
      );
      assert.equal(
        overlap,
        false,
        `Callout box ${a.id} (${a.boxX},${a.boxY}) must not overlap ${b.id} (${b.boxX},${b.boxY})`
      );
    }
  }

  // Verify no callout box overlaps any pole circle
  for (const callout of layout.nodePlacements) {
    for (const pole of nodes) {
      const overlap = rectsOverlap(
        { x: callout.boxX, y: callout.boxY, w: callout.boxWidth, h: callout.boxHeight },
        { x: pole.x - 10, y: pole.y - 10, w: 20, h: 20 },
        2
      );
      assert.equal(
        overlap,
        false,
        `Callout box ${callout.id} must not cover pole symbol ${pole.id}`
      );
    }
  }

  // Verify simpang road label does not overlap any callout box
  const simpangRect = {
    x: layout.simpangRoadLabelCenter.x - 72,
    y: layout.simpangRoadLabelCenter.y - 8,
    w: 144,
    h: 16,
  };
  for (const callout of layout.nodePlacements) {
    const overlap = rectsOverlap(
      simpangRect,
      { x: callout.boxX, y: callout.boxY, w: callout.boxWidth, h: callout.boxHeight },
      2
    );
    assert.equal(
      overlap,
      false,
      `Simpang road label must not overlap callout box ${callout.id}`
    );
  }
});

test('isSpanMarkedBongkar and generateRabItemsFromSurvey handle dismantled cables (Bongkar) without deleting the span and add Jasa Bongkar to Section XV', () => {
  const nodes = [
    {
      id: 'n1',
      kodeTiang: 'SA4-20/4',
      kind: 'TIANG_RENCANA' as const,
      lat: -7.6095,
      lng: 110.2089,
      constructions: [{ code: 'C9-200', qty: 1 }],
    },
    {
      id: 'n2',
      kodeTiang: 'SA4-20/5',
      kind: 'TIANG_RENCANA' as const,
      lat: -7.60925,
      lng: 110.20898,
      isBongkar: true,
      constructions: [{ code: 'C9-200', qty: 1, actionType: 'BONGKAR' as const }],
    },
  ];

  const dismantledSpan = {
    id: 'sp-bongkar-1',
    fromNodeId: 'n1',
    toNodeId: 'n2',
    statusJaringan: 'RENCANA' as const,
    jenisJaringan: 'JTR' as const,
    conductorType: 'NFA2X-T 3x70+1x70' as const,
    phaseCount: 3 as const,
    isBongkar: true,
    actionType: 'BONGKAR' as const,
    distanceMeters: 27,
  };

  assert.equal(isSpanMarkedBongkar(dismantledSpan), true);
  const effCables = getEffectiveSpanCables(dismantledSpan);
  assert.equal(effCables.length, 1);
  assert.equal(isCableMarkedBongkar(effCables[0], dismantledSpan), true);

  const items = generateRabItemsFromSurvey({
    nodes,
    spans: [dismantledSpan],
    includePembetonanTiang: false,
    transportasiRit: 0,
  });

  // Should NOT charge new MDU LVTC conductor for a dismantled cable
  const newLvtcMdu = items.find((i) => i.section === 'XI' && i.gol === 'MDU-KD');
  assert.equal(newLvtcMdu, undefined);

  // Should include Upah Bongkar Penghantar TR LVTC in Section XV
  const bongkarCableJasa = items.find(
    (i) => i.section === 'XV' && i.uraian.includes('Upah Bongkar Penghantar TR LVTC')
  );
  assert.ok(bongkarCableJasa, 'Should include Upah Bongkar Penghantar TR LVTC in Section XV');
  assert.equal(bongkarCableJasa.volume, 1);
  assert.equal(bongkarCableJasa.gol, 'JASA');
});

test('all non-BONGKAR packages in CONSTRUCTION_PACKAGES_CATALOG (including P12, P12C-1, P12C-2, CM5-3) include Upah Pasang JASA and never include JASA_BONGKAR in PASANG mode', () => {
  const nonBongkarPackages = CONSTRUCTION_PACKAGES_CATALOG.filter(
    (pkg) => pkg.category !== 'BONGKAR'
  );
  assert.ok(nonBongkarPackages.length > 50);

  for (const pkg of nonBongkarPackages) {
    // 1. None of the PASANG components may be a JASA_BONGKAR item
    for (const comp of pkg.components) {
      const khs = KHS_MASTER_CATALOG[comp.khsId];
      assert.ok(khs, `Missing KHS definition ${comp.khsId} in package ${pkg.code}`);
      assert.equal(
        comp.khsId.startsWith('JASA_BONGKAR_'),
        false,
        `Package ${pkg.code} (${pkg.category}) must not contain dismantling labor ${comp.khsId} (${khs.uraian}) in PASANG components`
      );
      assert.equal(
        khs.uraian.toLowerCase().includes('upah bongkar'),
        false,
        `Package ${pkg.code} must not contain 'Upah Bongkar' item (${khs.uraian}) in PASANG components`
      );
    }

    // 2. Every installation package must have at least one JASA (installation labor) component
    const hasPasangJasa = pkg.components.some((comp) => {
      const khs = KHS_MASTER_CATALOG[comp.khsId];
      return khs && khs.gol === 'JASA';
    });
    assert.equal(
      hasPasangJasa,
      true,
      `Package ${pkg.code} (${pkg.name}) must include an installation JASA component`
    );
  }

  // Specifically verify P12, P12C-1, P12C-2 in generateRabItemsFromSurvey
  const rabForP12 = generateRabItemsFromSurvey({
    nodes: [
      {
        id: 'pole-p12',
        kodeTiang: 'SA4-20/1',
        kind: 'TIANG_RENCANA',
        lat: -7.605,
        lng: 110.205,
        constructions: [
          { code: 'P12C-1', qty: 1, actionType: 'PASANG' },
          { code: 'P12C-2', qty: 2, actionType: 'PASANG' },
        ],
      },
    ],
    spans: [],
    includePembetonanTiang: false,
    transportasiRit: 0,
  });

  const p12c1Jasa = rabForP12.find(
    (i) => i.parentPackageCode === 'P12C-1' && i.gol === 'JASA'
  );
  assert.ok(p12c1Jasa, 'P12C-1 must have a JASA row in RAB');
  assert.ok(
    p12c1Jasa.uraian.includes('Upah Pasang'),
    `Expected Upah Pasang for P12C-1, got: ${p12c1Jasa.uraian}`
  );
  assert.equal(p12c1Jasa.volume, 1);

  const p12c2Jasa = rabForP12.find(
    (i) => i.parentPackageCode === 'P12C-2' && i.gol === 'JASA'
  );
  assert.ok(p12c2Jasa, 'P12C-2 must have a JASA row in RAB');
  assert.ok(
    p12c2Jasa.uraian.includes('Upah Pasang'),
    `Expected Upah Pasang for P12C-2, got: ${p12c2Jasa.uraian}`
  );
  assert.equal(p12c2Jasa.volume, 2);
});

test('normalizeRabPackageItems repairs 0-volume detail rows under SJ6 and SJ5 headers and upgrades stale JASA_BONGKAR in P12C-1', () => {
  const brokenItems = [
    {
      id: 'rab-pkg-header-X-SJ6',
      section: 'X' as const,
      uraian: 'SJ6',
      gol: 'HDW' as const,
      satuan: 'Unit',
      volume: 1,
      hargaSatuan: 0,
      isPackageHeader: true,
      parentPackageCode: 'SJ6',
    },
    {
      id: 'rab-pkg-item-X-SJ6-1',
      section: 'X' as const,
      uraian: 'Fixed Dead End Assembly + Bracket (Tarik Akhir LVTC)',
      gol: 'HDW' as const,
      satuan: 'Set',
      volume: 0,
      hargaSatuan: 63600,
      khsId: 'HDW_FIXED_DEAD_END_TR',
      parentPackageCode: 'SJ6',
    },
    {
      id: 'rab-pkg-header-X-SJ5',
      section: 'X' as const,
      uraian: 'SJ5',
      gol: 'HDW' as const,
      satuan: 'Unit',
      volume: 3,
      hargaSatuan: 0,
      isPackageHeader: true,
      parentPackageCode: 'SJ5',
    },
    {
      id: 'rab-pkg-item-X-SJ5-1',
      section: 'X' as const,
      uraian: 'Suspension Assembly + Bracket (Small Angle LVTC)',
      gol: 'HDW' as const,
      satuan: 'Set',
      volume: 0,
      hargaSatuan: 44100,
      khsId: 'HDW_SUSPENSION_ASSEMBLY_TR',
      parentPackageCode: 'SJ5',
    },
    {
      id: 'rab-pkg-item-X-SJ5-2',
      section: 'X' as const,
      uraian: 'Stainless Steel Strip 20 x 0.7 mm',
      gol: 'HDW' as const,
      satuan: 'Mtr',
      volume: 0,
      hargaSatuan: 9900,
      khsId: 'HDW_STAINLESS_STEEL_STRIP',
      parentPackageCode: 'SJ5',
    },
  ];

  const repaired = normalizeRabPackageItems(brokenItems);
  const sj6Detail = repaired.find((r) => r.id === 'rab-pkg-item-X-SJ6-1');
  const sj5Detail1 = repaired.find((r) => r.id === 'rab-pkg-item-X-SJ5-1');
  const sj5Detail2 = repaired.find((r) => r.id === 'rab-pkg-item-X-SJ5-2');

  assert.equal(sj6Detail?.volume, 1);
  assert.equal(sj5Detail1?.volume, 3);
  assert.equal(sj5Detail2?.volume, 7.5);
});

test('buildConnectedEtiketRoadNetwork creates a continuous main road through an intersection and connects branching roads at the junction point', () => {
  // Replicate SA4-20/1 -> SA4-20/2 (main road) and SA4-20/2 -> SA4-20/3 (branch turning ~90 degrees)
  const roadNet = buildConnectedEtiketRoadNetwork({
    projectedNodes: [
      { id: 'n1', x: 640, y: 150 },
      { id: 'n2', x: 420, y: 310 },
      { id: 'n3', x: 280, y: 170 },
    ],
    spans: [
      { fromNodeId: 'n1', toNodeId: 'n2' },
      { fromNodeId: 'n2', toNodeId: 'n3' },
    ],
  });

  // Main road must have at least 4 points (extended start, n1, n2, extended end continuing straight past n2)
  assert.ok(roadNet.mainRoadPoints.length >= 4);
  // Branch road must exist and start at the exact junction point on the main road (n2 + road offset)
  assert.equal(roadNet.branchRoadPolylines.length, 1);
  const branch = roadNet.branchRoadPolylines[0];
  assert.ok(branch.length >= 3);
  const junctionPt = roadNet.intersectionPoints[0];
  assert.ok(junctionPt);
  assert.equal(branch[0].x, junctionPt.x);
  assert.equal(branch[0].y, junctionPt.y);

  // Verify the junction point also exists in mainRoadPoints so the intersection is 100% connected (menyambung)
  const onMainRoad = roadNet.mainRoadPoints.some(
    (p) => Math.hypot(p.x - junctionPt.x, p.y - junctionPt.y) < 0.5
  );
  assert.equal(onMainRoad, true, 'Branch road start must lie directly on a main road vertex');
});


