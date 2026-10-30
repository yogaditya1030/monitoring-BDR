export interface CentralCustomerLookup {
  idPel: string;
  namaPelanggan: string;
  alamatTersimpan: string;
  tarifEksisting: string;
  dayaEksisting: number;
  statusRekening: 'LANCAR' | 'TUNGGAKAN' | 'DIBLOKIR';
  nomorMeterEksisting: string;
  garduDistribusi: string;
  tiangTerdekat: string;
}

export interface GridCapacityCheck {
  isFeasible: boolean;
  garduId: string;
  trafoKva: number;
  bebanSaatIniPersen: number;
  estimasiBebanBaruPersen: number;
  statusKapasitas: 'AMAN' | 'MENDEKATI_OVERLOAD' | 'PERLU_SISIP_TRAFO';
  rekomendasiTeknis: string;
}

export interface K3PermitValidation {
  isValid: boolean;
  nomorIzin: string;
  statusJsa: 'TERVERIFIKASI' | 'BELUM_LENGKAP';
  petugasK3: string;
  catatanKeselamatan: string;
}

/**
 * Real-time API simulation for PLN AP2T (Aplikasi Pelayanan Pelanggan Terpusat)
 */
export async function queryPlnCentralApi(idPel: string): Promise<CentralCustomerLookup | null> {
  // simulate network latency
  await new Promise((r) => setTimeout(r, 450));

  if (!idPel || idPel.length !== 12) return null;

  // Mock lookup based on seed or synthetic response
  return {
    idPel,
    namaPelanggan: 'Pelanggan ULP Muntilan / UP3 Magelang',
    alamatTersimpan: 'Kecamatan Muntilan / Mungkid / Salam, Kab. Magelang',
    tarifEksisting: 'R-1/TR',
    dayaEksisting: 1300,
    statusRekening: 'LANCAR',
    nomorMeterEksisting: `142${idPel.slice(5)}`,
    garduDistribusi: 'GD-MKD-042 (Penyulang Sawangan)',
    tiangTerdekat: 'MKD-TR-042/08',
  };
}

/**
 * Real-time API simulation for Distribution Grid & Trafo Capacity Check
 */
export async function checkDistributionGridCapacity(
  requestedVa: number,
  coordinates?: string
): Promise<GridCapacityCheck> {
  await new Promise((r) => setTimeout(r, 400));

  const trafoKva = requestedVa > 100000 ? 250 : 160;
  const bebanSaatIni = 54; // 54%
  const bebanBaru = bebanSaatIni + (requestedVa / (trafoKva * 1000)) * 100;

  let status: 'AMAN' | 'MENDEKATI_OVERLOAD' | 'PERLU_SISIP_TRAFO' = 'AMAN';
  let rekomendasi = 'Kapasitas trafo distribusi memadai. Dapat disambung langsung via JTR.';

  if (bebanBaru > 85) {
    status = 'PERLU_SISIP_TRAFO';
    rekomendasi = 'Beban trafo melebihi 85%. Disarankan pekerjaan fisik khusus (PFK) trafo sisip.';
  } else if (bebanBaru > 70) {
    status = 'MENDEKATI_OVERLOAD';
    rekomendasi = 'Beban trafo mendekati ambang batas. Pengukuran drop tegangan saat komisioning diwajibkan.';
  }

  return {
    isFeasible: bebanBaru <= 85,
    garduId: 'GD-MKD-088 (Trafo Distribusi 3 Phasa)',
    trafoKva,
    bebanSaatIniPersen: Math.round(bebanSaatIni),
    estimasiBebanBaruPersen: Math.round(bebanBaru),
    statusKapasitas: status,
    rekomendasiTeknis: rekomendasi,
  };
}

/**
 * Real-time validation for K3L Working Permit
 */
export async function validateK3PermitLive(wpNumber: string): Promise<K3PermitValidation> {
  await new Promise((r) => setTimeout(r, 300));
  const isValid = wpNumber.trim().length >= 5;

  return {
    isValid,
    nomorIzin: wpNumber,
    statusJsa: isValid ? 'TERVERIFIKASI' : 'BELUM_LENGKAP',
    petugasK3: 'Surya Prasetyo, S.T. (Ahli K3 Listrik PLN)',
    catatanKeselamatan: isValid
      ? 'Working Permit aktif: JSA, Helm, Rompi, Sepatu Isolasi 20kV, Full Body Harness telah diverifikasi.'
      : 'Nomor Working Permit belum terdaftar pada sistem K3L PLN.',
  };
}
