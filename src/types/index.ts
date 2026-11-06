export type TransaksiType = 'PB' | 'PD' | 'PFK';

export type StatusPermohonan =
  | 'MOHON'
  | 'SURVEI'
  | 'RAB'
  | 'TANPA PERLUASAN'
  | 'BAYAR'
  | 'KERJA'
  | 'NYALA'
  | 'PDL';

export type UserRole = 'all' | 'security' | 'pp' | 'teknik' | 'k3l' | 'te';

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: UserRole;
  action: string;
  notes?: string;
}

export interface PermohonanItem {
  id: string;
  noNodin: string;
  status: StatusPermohonan;
  tahun: number;
  projectName: string;
  alamat: string;
  peruntukan: string;
  transaksi: TransaksiType;
  kategoriPfk?: 'Konstruksi' | 'Meter';
  nomorMeterEksisting?: string;
  dayaLama: number; // VA
  dayaBaru: number; // VA
  tarif: string;
  meter: 'PRABAYAR' | 'PASKA BAYAR';
  kontakPerson: string;
  suratPermohonan: string;
  suratPermohonanDataUrl?: string; // Data URL (PDF/Gambar) berkas Surat Permohonan yang diunggah Security
  suratPermohonanPages?: string[]; // Array multi-halaman berkas surat permohonan
  tglSurat: string;
  petugasSurvei: string;
  tagingLokasi: string; // "Lat, Long"
  nomorGardu?: string; // Nomor Gardu Distribusi PLN (Form Teknik)
  nomorTiang: string;
  idPel: string; // 12 digits
  idPelTetangga: string;
  fotoMeterSebelum?: string; // Foto meter eksisting / sebelum pekerjaan komisioning TE (Wajib PDL)
  fotoMeterSesudah?: string; // Foto meter baru / pasca penyalaan & segel TE (Wajib PDL)
  fotoIdpelTetangga?: string; // Foto kWh meter / struk IDPEL tetangga (Wajib PDL)
  pdlDocsVerified?: boolean; // Status verifikasi kelengkapan berkas TE untuk PDL
  surveyFotoJaringan?: string;
  surveyFotoLokasi?: string;
  surveyTeknikJaringan?: string;
  surveyTeknikLokasi?: string;
  fotoKwhMeterLama?: string;
  fotoKwhMeterBaru?: string;
  fotoCt?: string;
  fotoSegel?: string;
  fotoPekerjaan?: string;
  keteranganPekerjaan: string;
  keteranganStatus: string;
  keteranganKendala: string;
  gambarTeknik?: string;
  linkMap: string;
  tglSurvei: string;
  tglRab?: string;
  rab: number; // Nilai RAB in Rupiah
  fotoMom?: string;
  dokumenMom?: string;
  nomorKtp?: string; // NIK 16 digit
  fotoKtpNpwp?: string;
  fotoSlo?: string;
  buktiBayar?: string;
  lampiranNodinUp3?: string;
  noPkVendor: string;
  lampiranPk?: string;
  workingPermit: string;
  linkWp?: string;
  ttdBa?: string;
  validasiSegel: string;
  
  // Transaksi Energi (TE) Details
  nomorKwhBaru?: string;
  standKwhAwal?: number;
  // Stand Bongkar (Khusus Perubahan Daya / PD)
  standBongkar?: number;
  standBongkarWbp?: number;
  standBongkarLwbp?: number;
  standBongkarKvar?: number;
  // Stand Pasang (Untuk Pasang Baru / PB maupun Perubahan Daya / PD)
  standPasang?: number;
  standPasangWbp?: number;
  standPasangLwbp?: number;
  standPasangKvar?: number;
  merkKwh?: string;
  rasioCt?: string;
  nomorSeriSegel?: string;
  
  // Pelayanan Pelanggan (PP) Details
  nomorPdl?: string;
  biayaBp?: number;
  biayaUjl?: number;
  tglBayar?: string;

  // Data Gambar Survei Google Maps & RAB Teknik
  surveyRabDesign?: SurveyRabDesign;
  
  // Milestone Dates
  tglNotaDinasUlp?: string;
  tglUp3Ok?: string;
  tglMom?: string;
  tglBayarBp?: string;
  tglKerja?: string;
  tglWorkingPermit?: string;
  tglTtdBa?: string;
  tglValidasiSegel?: string;
  tglPenyalaan?: string;
  tglPdlUpdate?: string;
  
  createdAt: string;
  updatedAt: string;
  historyLogs: AuditLog[];
}

export type SurveyNodeKind =
  | 'TIANG_EKSISTING'
  | 'TIANG_RENCANA'
  | 'GARDU_RENCANA'
  | 'GARDU_TRAFO'
  | 'TITIK_APP';

export type ConstructionActionType = 'PASANG' | 'BONGKAR' | 'BONGKAR_PASANG';

export type ConstructionCategory =
  | 'TIANG'
  | 'SKUTR'
  | 'JTR'
  | 'JTM'
  | 'SKUTM'
  | 'GARDU'
  | 'SWITCHING'
  | 'SKUR'
  | 'ANCHOR'
  | 'GROUNDING'
  | 'SR'
  | 'BONGKAR';

export interface SurveyPoleConstructionAssignment {
  code: string; // e.g. 'C9-200', 'SJ5', 'CM2-12', 'SE1-2', 'F1-2', 'MJ6-T'
  qty: number;
  actionType?: ConstructionActionType; // 'PASANG' (default) | 'BONGKAR' (simbol X merah) | 'BONGKAR_PASANG'
  disabledKhsIds?: string[]; // ID material/jasa KHS yang tidak dipasang pada titik ini
  customComponentQty?: Record<string, number>; // Volume kustom per 1 set konstruksi pada titik ini
}

export interface SurveyPoleNode {
  id: string;
  kodeTiang: string; // e.g. 'SA4-20/1' or 'SA4-637/174/20'
  kind: SurveyNodeKind;
  lat: number;
  lng: number;
  constructions: SurveyPoleConstructionAssignment[];
  isBongkar?: boolean; // Menandai bahwa titik/konstruksi ini akan dibongkar (Simbol X Merah di Peta)
  catatan?: string;
}

export type SurveySpanConductorType =
  | 'NFA2X-T 3x70+1x70'
  | 'NFA2X-T 3x70+1x50'
  | 'NFA2X-T 3x35+1x35'
  | 'NFA2X-T 2x70'
  | 'NFA2X-T 2x35'
  | 'NFA2X 2x16'
  | 'NFA2X 4x16'
  | 'AAAC 70'
  | 'AAAC 150'
  | 'AAAC 240'
  | 'AAAC/S 70'
  | 'AAAC/S 150'
  | 'AAAC/S 240'
  | 'MVTIC 3x240+N95';

export type NetworkCategory = 'JTM' | 'JTR' | 'SR';

export type CablePhaseCount = 1 | 3;

export interface SpanCableItem {
  id: string;
  statusJaringan: 'EKSISTING' | 'RENCANA';
  jenisJaringan: NetworkCategory;
  conductorType: SurveySpanConductorType;
  phaseCount?: CablePhaseCount; // 1 = 1 Phase (1 garis /), 3 = 3 Phase (3 garis ///)
  circuitCount?: number; // Jumlah sirkuit / jalur paralel pada gawang ini (default 1)
  /** Menandai bahwa kabel/penghantar ini dibongkar (tetap tampil di gambar dengan simbol X merah & masuk Jasa Bongkar RAB) */
  isBongkar?: boolean;
  actionType?: ConstructionActionType;
}

export interface SurveySpanEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  statusJaringan: 'EKSISTING' | 'RENCANA';
  jenisJaringan: NetworkCategory;
  conductorType: SurveySpanConductorType;
  phaseCount?: CablePhaseCount; // 1 = 1 Phase (/), 3 = 3 Phase (///)
  /** Menandai bahwa bentangan kabel pada gawang ini dibongkar (tetap tampil di gambar dengan simbol X merah) */
  isBongkar?: boolean;
  actionType?: ConstructionActionType;
  cables?: SpanCableItem[]; // Mendukung >1 jenis kabel dalam 1 gawang / antar tiang (misal Underbuilt JTM + JTR + SR)
  distanceMeters: number; // Automatically calculated from GPS coordinates (or overridden)
  manualDistanceOverride?: number;
}

export type RabGolongan = 'MDU-KD' | 'HDW' | 'JASA';

export type RabRomanSection =
  | 'I'
  | 'II'
  | 'III'
  | 'IV'
  | 'V'
  | 'VI'
  | 'VII'
  | 'VIII'
  | 'IX'
  | 'X'
  | 'XI'
  | 'XII'
  | 'XIII'
  | 'XIV'
  | 'XV'
  | 'XVI';

export interface RabLineItem {
  id: string;
  section: RabRomanSection;
  uraian: string;
  gol: RabGolongan;
  satuan: string;
  volume: number;
  hargaSatuan: number;
  khsId?: string; // ID item KHS acuan
  sourceInfo?: string; // e.g. 'Otomatis dari 5 Tiang Rencana'
  isPackageHeader?: boolean; // Baris "+" judul paket konstruksi (misal: "+ | MJ6-T | | Unit | 1") sesuai Contoh Format RAB
  parentPackageCode?: string; // Kode konstruksi induk untuk penomoran detail material 1..N di bawahnya
  unitQtyPerPackage?: number; // Volume dasar per 1 unit paket konstruksi agar saat jumlah set utama diubah (1 -> 3) detail material otomatis dikalikan
  itemNo?: number; // Nomor urut lokal (1, 2, 3...) di bawah paket konstruksi atau seksi
}

export interface RabOfficialHeader {
  pekerjaan: string;
  lokasi: string;
  pelaksana: string;
  anggaran: string;
  nomorPrk: string;
}

export interface SurveyRabDesign {
  judulGambar: string;
  lokasiPekerjaan: string;
  rayonUlp: string;
  unitUlp?: string;
  rabHeader?: RabOfficialHeader;
  digambarOleh: string;
  direncanakanOleh: string;
  diperiksaOleh: string;
  disetujuiOleh: string;
  nodes: SurveyPoleNode[];
  spans: SurveySpanEdge[];
  rabItems: RabLineItem[];
  ppnPercent: number; // 10 or 11
  includePembetonanTiang: boolean;
  transportasiRit: number;
  updatedAt: string;
}

export interface TariffBpCalculation {
  biayaPenyambungan: number;
  ujlToken: number;
  materai: number;
  totalEstimasi: number;
  penjelasan: string;
}

export interface IdPelValidationResult {
  isValid: boolean;
  message: string;
  customerData?: {
    nama: string;
    tarif: string;
    daya: number;
    gardu: string;
    status: string;
  };
}

export interface GoogleSheetSyncState {
  isConnected: boolean;
  userEmail: string | null;
  spreadsheetId: string | null;
  spreadsheetTitle: string | null;
  spreadsheetUrl: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  syncInProgress: boolean;
}

