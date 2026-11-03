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
} from './rabCalculator';
import {
  PRESET_SMPN3_PABELAN_NODES,
  PRESET_SMPN3_PABELAN_SPANS,
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

