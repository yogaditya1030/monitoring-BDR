export type TransaksiType = 'PB' | 'PD' | 'PFK';

export type StatusPermohonan =
  | 'MOHON'
  | 'SURVEI/RAB'
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
  tglSurat: string;
  petugasSurvei: string;
  tagingLokasi: string; // "Lat, Long"
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
  merkKwh?: string;
  rasioCt?: string;
  nomorSeriSegel?: string;
  
  // Pelayanan Pelanggan (PP) Details
  nomorPdl?: string;
  biayaBp?: number;
  biayaUjl?: number;
  tglBayar?: string;
  
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
