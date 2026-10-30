import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIdPel,
  validateNikKtp,
  calculateBiayaPenyambungan,
  determineInitialWorkflow,
  canTransitionStatus,
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

test('determineInitialWorkflow routes PFK directly to Teknik survey', () => {
  const pfkRoute = determineInitialWorkflow('PFK');
  assert.equal(pfkRoute.initialStatus, 'SURVEI/RAB');
  assert.equal(pfkRoute.assignedRole, 'teknik');
  assert.equal(pfkRoute.priority, 'SANGAT SEGERA');

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

test('canTransitionStatus gates roles appropriately', () => {
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
