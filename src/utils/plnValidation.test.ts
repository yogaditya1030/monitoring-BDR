import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIdPel,
  validateNikKtp,
  calculateBiayaPenyambungan,
  determineInitialWorkflow,
  canTransitionStatus,
  summarizePipelineByStatus,
  buildPlnAiDataContext,
  isTarifIndustri,
  getTeStandFormConfig,
  formatTeStandSummary,
  calculateDaysSinceInput,
  buildTeknikWaNotification,
  normalizePhoneToWa,
  parseCoordinate,
  TEKNIK_WA_CONTACTS,
} from './plnValidation.ts';
import { PermohonanItem } from '../types';

test('validateNikKtp validates 16 digits NIK correctly', () => {
  const empty = validateNikKtp('');
  assert.equal(empty.isValid, false);

  const shortNik = validateNikKtp('3308123456');
  assert.equal(shortNik.isValid, false);
  assert.match(shortNik.message, /16 digit/);

  const nonNum = validateNikKtp('330812345678000A');
  assert.equal(nonNum.isValid, false);

  const validNik = validateNikKtp('3308123456780001');
  assert.equal(validNik.isValid, true);
});

test('validateIdPel handles empty input based on transaction type', () => {
  const resultPb = validateIdPel('', false);
  assert.equal(resultPb.isValid, true);

  const resultPd = validateIdPel('', true);
  assert.equal(resultPd.isValid, false);
  assert.match(resultPd.message, /wajib diisi untuk permohonan Perubahan Daya/i);
});

test('validateIdPel enforces 12 digits numeric rule', () => {
  const shortId = validateIdPel('521541550', false);
  assert.equal(shortId.isValid, false);
  assert.match(shortId.message, /12 digit/i);

  const nonNumeric = validateIdPel('52154155055A', false);
  assert.equal(nonNumeric.isValid, false);
  assert.match(nonNumeric.message, /harus berupa angka/i);

  const validId = validateIdPel('521541550555', false);
  assert.equal(validId.isValid, true);
});

test('determineInitialWorkflow routes PFK directly to Teknik survey without Jalur Kilat text', () => {
  const pfkRoute = determineInitialWorkflow('PFK');
  assert.equal(pfkRoute.initialStatus, 'SURVEI');
  assert.equal(pfkRoute.assignedRole, 'teknik');
  assert.equal(pfkRoute.priority, 'SANGAT SEGERA');
  assert.doesNotMatch(pfkRoute.routingSummary, /jalur kilat/i);

  const pbRoute = determineInitialWorkflow('PB');
  assert.equal(pbRoute.initialStatus, 'MOHON');
  assert.equal(pbRoute.assignedRole, 'pp');

  const pdRoute = determineInitialWorkflow('PD');
  assert.equal(pdRoute.initialStatus, 'MOHON');
  assert.equal(pdRoute.assignedRole, 'pp');
});

test('calculateBiayaPenyambungan computes accurate BP rates', () => {
  // PB 900 VA standard
  const calc900 = calculateBiayaPenyambungan('PB', 0, 900, 'R-1/TR', 'PRABAYAR');
  assert.equal(calc900.biayaPenyambungan, 843000);
  assert.equal(calc900.ujlToken, 50000);
  assert.equal(calc900.totalEstimasi, 893000);

  // PD 1300 to 23000 VA
  const calcPd = calculateBiayaPenyambungan('PD', 1300, 23000, 'B-2/TR', 'PASKA BAYAR');
  assert.equal(calcPd.biayaPenyambungan, (23000 - 1300) * 969);
  assert.ok(calcPd.ujlToken > 0);
});

test('canTransitionStatus gates roles appropriately including separate SURVEI and RAB stages', () => {
  const dummyItem: PermohonanItem = {
    id: 'test-1',
    noNodin: 'NODIN-001',
    status: 'MOHON',
    tahun: 2026,
    projectName: 'PT Test Proyek',
    alamat: 'Muntilan',
    peruntukan: 'Bisnis',
    transaksi: 'PB',
    dayaLama: 0,
    dayaBaru: 11000,
    tarif: 'B-2/TR',
    meter: 'PASKA BAYAR',
    kontakPerson: '08123456789',
    suratPermohonan: 'test.pdf',
    tglSurat: '2026-10-28',
    petugasSurvei: '',
    tagingLokasi: '',
    nomorTiang: '',
    idPel: '',
    idPelTetangga: '',
    keteranganPekerjaan: '',
    keteranganStatus: '',
    keteranganKendala: '',
    linkMap: '',
    tglSurvei: '',
    rab: 0,
    noPkVendor: '',
    workingPermit: '',
    validasiSegel: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    historyLogs: [],
  };

  // PP and Teknik can move to SURVEI, TE cannot
  assert.equal(canTransitionStatus(dummyItem, 'SURVEI', 'pp').allowed, true);
  assert.equal(canTransitionStatus(dummyItem, 'SURVEI', 'teknik').allowed, true);
  assert.equal(canTransitionStatus(dummyItem, 'SURVEI', 'te').allowed, false);

  // Teknik and PP can move from SURVEI to RAB, K3L cannot
  dummyItem.status = 'SURVEI';
  assert.equal(canTransitionStatus(dummyItem, 'RAB', 'teknik').allowed, true);
  assert.equal(canTransitionStatus(dummyItem, 'RAB', 'pp').allowed, true);
  assert.equal(canTransitionStatus(dummyItem, 'RAB', 'k3l').allowed, false);

  // K3L cannot directly activate NYALA (TE's job)
  const nyalaByK3l = canTransitionStatus(dummyItem, 'NYALA', 'k3l');
  assert.equal(nyalaByK3l.allowed, false);

  // TE can activate NYALA
  const nyalaByTe = canTransitionStatus(dummyItem, 'NYALA', 'te');
  assert.equal(nyalaByTe.allowed, true);

  // Teknik cannot do KERJA without working permit
  const kerjaByTeknikNoWp = canTransitionStatus(dummyItem, 'KERJA', 'teknik');
  assert.equal(kerjaByTeknikNoWp.allowed, false);

  // With WP it is allowed
  dummyItem.workingPermit = 'WP-2026-K3L-042';
  const kerjaByTeknikWithWp = canTransitionStatus(dummyItem, 'KERJA', 'teknik');
  assert.equal(kerjaByTeknikWithWp.allowed, true);

  // PDL transition requires TE files: Foto Meter Sebelum, Sesudah, IDPEL Tetangga
  const pdlIncomplete = canTransitionStatus(dummyItem, 'PDL', 'pp');
  assert.equal(pdlIncomplete.allowed, false);
  assert.match(pdlIncomplete.reason || '', /belum lengkap/i);

  // Fulfilling TE requirements enables PDL
  dummyItem.fotoMeterSebelum = 'data:image/svg+xml;base64,meter-sebelum';
  dummyItem.fotoMeterSesudah = 'data:image/svg+xml;base64,meter-sesudah';
  dummyItem.idPelTetangga = '521541882901';
  const pdlComplete = canTransitionStatus(dummyItem, 'PDL', 'pp');
  assert.equal(pdlComplete.allowed, true);
});

test('summarizePipelineByStatus groups records by status and detects bottlenecks', () => {
  const baseItem: PermohonanItem = {
    id: 'rec-1',
    noNodin: 'NODIN-1',
    status: 'SURVEI',
    tahun: 2026,
    projectName: 'Pelanggan Survei 1',
    alamat: 'Borobudur',
    peruntukan: 'Bisnis',
    transaksi: 'PB',
    dayaLama: 0,
    dayaBaru: 11000,
    tarif: 'B-2/TR',
    meter: 'PASKA BAYAR',
    kontakPerson: '08111',
    suratPermohonan: 'doc.pdf',
    tglSurat: '2026-01-10',
    petugasSurvei: 'Bambang',
    tagingLokasi: '-7.58, 110.23',
    nomorGardu: 'GD-BBD-018',
    nomorTiang: 'BBD-01',
    idPel: '',
    idPelTetangga: '',
    keteranganPekerjaan: '',
    keteranganStatus: '',
    keteranganKendala: '',
    linkMap: '',
    tglSurvei: '2026-01-11',
    rab: 0,
    noPkVendor: '',
    workingPermit: '',
    validasiSegel: '',
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-11T00:00:00Z',
    historyLogs: [],
  };

  const sampleRecords: PermohonanItem[] = [
    baseItem,
    { ...baseItem, id: 'rec-2', status: 'SURVEI', transaksi: 'PFK', dayaBaru: 5500, rab: 0 },
    { ...baseItem, id: 'rec-3', status: 'RAB', transaksi: 'PFK', dayaBaru: 200000, rab: 145000000 },
    { ...baseItem, id: 'rec-4', status: 'KERJA', transaksi: 'PB', dayaBaru: 11000, rab: 11200000 },
    { ...baseItem, id: 'rec-5', status: 'PDL', transaksi: 'PB', dayaBaru: 23000, rab: 22287000 },
  ];

  const summary = summarizePipelineByStatus(sampleRecords);
  assert.equal(summary.totalRecords, 5);
  assert.equal(summary.activeBacklogCount, 4);
  assert.equal(summary.completedPdlCount, 1);
  assert.equal(summary.surveyedWithoutRabCount, 2);
  assert.ok(summary.topBottleneck);
  assert.equal(summary.topBottleneck?.status, 'SURVEI');
  assert.equal(summary.topBottleneck?.count, 2);

  const rabStage = summary.stages.find((s) => s.status === 'RAB');
  assert.equal(rabStage?.count, 1);
  assert.equal(rabStage?.totalRab, 145000000);

  const aiContext = buildPlnAiDataContext(sampleRecords);
  assert.match(aiContext, /RINGKASAN EKSEKUTIF PLN ULP BOROBUDUR/);
  assert.match(aiContext, /Sudah Survei tapi Belum Dibuat RAB: 2 data/);
  assert.match(aiContext, /Gardu: GD-BBD-018/);
});

test('getTeStandFormConfig enforces Stand Pasang only for PB, Stand Bongkar + Pasang for PD, and WBP/LWBP/kVar for Tarif Industri', () => {
  assert.equal(isTarifIndustri('I-2/TR'), true);
  assert.equal(isTarifIndustri('I-3/TM'), true);
  assert.equal(isTarifIndustri('B-2/TR'), false);
  assert.equal(isTarifIndustri('R-1/TR'), false);

  // 1. Pasang Baru (PB) Non-Industri -> Hanya Stand Pasang (kWh)
  const pbReguler = getTeStandFormConfig('PB', 'B-2/TR');
  assert.equal(pbReguler.showStandBongkar, false);
  assert.equal(pbReguler.showStandPasang, true);
  assert.equal(pbReguler.isIndustri, false);
  assert.deepEqual(pbReguler.standParameters, ['kWh']);

  // 2. Perubahan Daya (PD) Non-Industri -> Stand Bongkar & Stand Pasang (kWh)
  const pdReguler = getTeStandFormConfig('PD', 'B-2/TR');
  assert.equal(pdReguler.showStandBongkar, true);
  assert.equal(pdReguler.showStandPasang, true);
  assert.equal(pdReguler.isIndustri, false);
  assert.deepEqual(pdReguler.standParameters, ['kWh']);

  // 3. Pasang Baru (PB) Industri -> Hanya Stand Pasang (WBP, LWBP, kVar)
  const pbIndustri = getTeStandFormConfig('PB', 'I-2/TR');
  assert.equal(pbIndustri.showStandBongkar, false);
  assert.equal(pbIndustri.showStandPasang, true);
  assert.equal(pbIndustri.isIndustri, true);
  assert.deepEqual(pbIndustri.standParameters, ['WBP', 'LWBP', 'kVar']);

  // 4. Perubahan Daya (PD) Industri -> Stand Bongkar & Stand Pasang (WBP, LWBP, kVar)
  const pdIndustri = getTeStandFormConfig('PD', 'I-3/TM');
  assert.equal(pdIndustri.showStandBongkar, true);
  assert.equal(pdIndustri.showStandPasang, true);
  assert.equal(pdIndustri.isIndustri, true);
  assert.deepEqual(pdIndustri.standParameters, ['WBP', 'LWBP', 'kVar']);
});

test('calculateDaysSinceInput accurately counts elapsed days from surat permohonan input date', () => {
  const refDate = '2026-10-31';

  // Same day input (0 days)
  const sameDay = calculateDaysSinceInput(
    {
      tglSurat: '2026-10-31',
      createdAt: '2026-10-31T08:00:00Z',
      status: 'MOHON',
      updatedAt: '2026-10-31T08:00:00Z',
    },
    refDate
  );
  assert.equal(sameDay.days, 0);
  assert.equal(sameDay.urgency, 'normal');
  assert.match(sameDay.shortLabel, /Hari Ini/i);

  // 5 days elapsed (normal)
  const fiveDays = calculateDaysSinceInput(
    {
      tglSurat: '2026-10-26',
      createdAt: '2026-10-26T08:00:00Z',
      status: 'SURVEI',
      updatedAt: '2026-10-27T08:00:00Z',
    },
    refDate
  );
  assert.equal(fiveDays.days, 5);
  assert.equal(fiveDays.urgency, 'normal');
  assert.equal(fiveDays.shortLabel, '5 Hari');

  // 12 days elapsed (warning)
  const twelveDays = calculateDaysSinceInput(
    {
      tglSurat: '2026-10-19',
      createdAt: '2026-10-19T08:00:00Z',
      status: 'RAB',
      updatedAt: '2026-10-22T08:00:00Z',
    },
    refDate
  );
  assert.equal(twelveDays.days, 12);
  assert.equal(twelveDays.urgency, 'warning');
  assert.equal(twelveDays.shortLabel, '12 Hari');

  // 20 days elapsed (overdue)
  const twentyDays = calculateDaysSinceInput(
    {
      tglSurat: '2026-10-11',
      createdAt: '2026-10-11T08:00:00Z',
      status: 'BAYAR',
      updatedAt: '2026-10-15T08:00:00Z',
    },
    refDate
  );
  assert.equal(twentyDays.days, 20);
  assert.equal(twentyDays.urgency, 'overdue');
  assert.equal(twentyDays.shortLabel, '20 Hari');

  // Completed PDL record (calculates duration to PDL completion)
  const completedPdl = calculateDaysSinceInput(
    {
      tglSurat: '2026-10-01',
      createdAt: '2026-10-01T08:00:00Z',
      status: 'PDL',
      tglPdlUpdate: '2026-10-11',
      updatedAt: '2026-10-11T16:00:00Z',
    },
    refDate
  );
  assert.equal(completedPdl.isCompleted, true);
  assert.equal(completedPdl.days, 10);
  assert.equal(completedPdl.urgency, 'completed');
  assert.equal(completedPdl.shortLabel, 'Selesai 10 Hari');
});

test('buildTeknikWaNotification includes customer info, phone number, coordinates, and Google Maps link for Tim Teknik', () => {
  assert.equal(normalizePhoneToWa('0812-3456-7890'), '6281234567890');
  assert.equal(normalizePhoneToWa('+62 811 2500 123'), '628112500123');

  const payload = buildTeknikWaNotification(
    {
      noNodin: 'NODIN-2026-BBD1',
      transaksi: 'PB',
      status: 'MOHON',
      projectName: 'Homestay Candi Pawon',
      kontakPerson: '081328990011',
      nomorKtp: '3308012345670001',
      idPel: '',
      dayaLama: 0,
      dayaBaru: 5500,
      tarif: 'B-1/TR',
      meter: 'PRABAYAR',
      peruntukan: 'Usaha / Bisnis / Toko / Homestay',
      alamat: 'Dusun Brojonalan, Desa Wanurejo, Kec. Borobudur',
      tagingLokasi: '-7.6062, 110.2195',
      linkMap: 'https://www.google.com/maps?q=-7.6062,110.2195',
      tglSurat: '2026-10-31',
      keteranganPekerjaan: 'PB daya 5.500 VA',
    },
    '08112500123'
  );

  assert.equal(payload.normalizedPhone, '628112500123');
  assert.equal(payload.customerName, 'Homestay Candi Pawon');
  assert.equal(payload.customerPhone, '081328990011');
  assert.equal(payload.mapsUrl, 'https://www.google.com/maps?q=-7.6062,110.2195');
  assert.match(payload.message, /Homestay Candi Pawon/);
  assert.match(payload.message, /081328990011/);
  assert.match(payload.message, /-7\.6062, 110\.2195/);
  assert.match(payload.message, /https:\/\/www\.google\.com\/maps\?q=-7\.6062,110\.2195/);
  assert.ok(payload.waUrl.startsWith('https://wa.me/628112500123?text='));
  assert.equal(TEKNIK_WA_CONTACTS.length, 3);
  assert.equal(TEKNIK_WA_CONTACTS[0].label, 'Barep Ariyanto (+62852450477831)');
  assert.equal(TEKNIK_WA_CONTACTS[1].label, 'Bagus (+6285878315131)');
  assert.equal(TEKNIK_WA_CONTACTS[2].label, 'Ari K (+628562670122)');
  assert.equal(payload.contactLinks.length, 3);
  assert.ok(payload.contactLinks[0].waUrl.startsWith('https://wa.me/62852450477831?text='));
  assert.ok(payload.contactLinks[1].waUrl.startsWith('https://wa.me/6285878315131?text='));
  assert.ok(payload.contactLinks[2].waUrl.startsWith('https://wa.me/628562670122?text='));
});

test('INITIAL_PLN_RECORDS has empty petugasSurvei, nomorGardu, and nomorTiang by default', async () => {
  const { INITIAL_PLN_RECORDS } = await import('../data/initialRecords.ts');
  for (const rec of INITIAL_PLN_RECORDS) {
    assert.equal(rec.petugasSurvei, '', `Record ${rec.id} should have empty petugasSurvei`);
    assert.equal(rec.nomorGardu || '', '', `Record ${rec.id} should have empty nomorGardu`);
    assert.equal(rec.nomorTiang, '', `Record ${rec.id} should have empty nomorTiang`);
  }
});

test('parseCoordinate parses comma-separated, space-separated, and Google Maps URL coordinates', () => {
  assert.deepEqual(parseCoordinate('-7.592500, 110.215400'), { lat: -7.5925, lng: 110.2154 });
  assert.deepEqual(parseCoordinate('-7.6079 110.2038'), { lat: -7.6079, lng: 110.2038 });
  assert.deepEqual(
    parseCoordinate('https://www.google.com/maps?q=-7.6105,110.2180'),
    { lat: -7.6105, lng: 110.218 }
  );
  assert.deepEqual(
    parseCoordinate('https://www.google.com/maps/place/Borobudur/@-7.6079,110.2038,17z'),
    { lat: -7.6079, lng: 110.2038 }
  );
  assert.equal(parseCoordinate('invalid-coord'), null);
});



