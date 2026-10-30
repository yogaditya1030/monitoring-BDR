import {
  IdPelValidationResult,
  PermohonanItem,
  StatusPermohonan,
  TariffBpCalculation,
  TransaksiType,
  UserRole,
} from '../types';

/**
 * Validates NIK / KTP (16 digits numeric).
 */
export function validateNikKtp(nik: string): { isValid: boolean; message: string } {
  const clean = nik.trim();
  if (!clean) {
    return { isValid: false, message: 'Nomor KTP (NIK 16 Digit) wajib diisi untuk permohonan.' };
  }
  if (!/^\d+$/.test(clean)) {
    return { isValid: false, message: 'Nomor KTP (NIK) harus berupa angka tanpa spasi atau huruf.' };
  }
  if (clean.length !== 16) {
    return { isValid: false, message: `Panjang NIK harus 16 digit (saat ini ${clean.length} digit).` };
  }
  return { isValid: true, message: 'Format Nomor KTP (NIK) valid 16 digit.' };
}

/**
 * Validates a PLN IDPEL (12 digits numeric string).
 * In ULP Borobudur, UP3 Magelang, UID Jawa Tengah,
 * ID Pelanggan standardly starts with 5215, 52151, 52154, 5211, etc.
 */
export function validateIdPel(idpel: string, isPd: boolean = false): IdPelValidationResult {
  const cleanId = idpel.trim();
  
  if (!cleanId) {
    if (isPd) {
      return {
        isValid: false,
        message: 'ID Pelanggan (IDPEL) wajib diisi untuk permohonan Perubahan Daya (PD).',
      };
    }
    return {
      isValid: true,
      message: 'ID Pelanggan kosong (Pasang Baru belum memiliki IDPEL).',
    };
  }

  if (!/^\d+$/.test(cleanId)) {
    return {
      isValid: false,
      message: 'IDPEL harus berupa angka 12 digit tanpa huruf atau simbol.',
    };
  }

  if (cleanId.length !== 12) {
    return {
      isValid: false,
      message: `Panjang IDPEL harus tepat 12 digit (saat ini ${cleanId.length} digit).`,
    };
  }

  // Unit checking simulation (5215 = ULP Borobudur / UP3 Magelang)
  const isBorobudurMagelangArea = cleanId.startsWith('5215') || cleanId.startsWith('5211') || cleanId.startsWith('521');

  return {
    isValid: true,
    message: isBorobudurMagelangArea
      ? 'IDPEL valid terdaftar pada sistem terpusat PLN (ULP Borobudur / UP3 Magelang).'
      : 'IDPEL valid 12 digit.',
    customerData: {
      nama: 'Pelanggan Terverifikasi PLN',
      tarif: 'B-2/TR',
      daya: 11000,
      gardu: 'GD-BBD-012 (Penyulang Mendut / Borobudur)',
      status: 'LANCAR',
    },
  };
}

/**
 * Calculates Biaya Penyambungan (BP) and UJL / Token Perdana according to standard PLN tariffs.
 * Rate for standard TR:
 * 450 VA -> Rp 421.000
 * 900 VA -> Rp 843.000
 * 1.300 VA -> Rp 1.218.000
 * 2.200 VA -> Rp 2.062.000
 * 3.500 VA s/d 200 kVA -> Rp 969 / VA
 */
export function calculateBiayaPenyambungan(
  transaksi: TransaksiType,
  dayaLama: number,
  dayaBaru: number,
  tarif: string,
  meterType: 'PRABAYAR' | 'PASKA BAYAR'
): TariffBpCalculation {
  const standardRates: Record<number, number> = {
    450: 421000,
    900: 843000,
    1300: 1218000,
    2200: 2062000,
  };

  let bp = 0;
  let penjelasan = '';

  if (transaksi === 'PFK') {
    // PFK
    bp = 0;
    penjelasan = 'Biaya PFK ditentukan melalui Rencana Anggaran Biaya (RAB) survei teknis lapangan.';
  } else if (transaksi === 'PB') {
    if (standardRates[dayaBaru]) {
      bp = standardRates[dayaBaru];
    } else {
      // Di atas 2.200 VA dihitung Rp 969 per VA
      bp = Math.round(dayaBaru * 969);
    }
    penjelasan = `Pasang Baru (PB) daya ${dayaBaru.toLocaleString('id-ID')} VA tarif ${tarif}`;
  } else {
    // PD (Perubahan Daya)
    const selisihDaya = Math.max(0, dayaBaru - dayaLama);
    if (dayaLama < 2200 && standardRates[dayaBaru] && standardRates[dayaLama]) {
      bp = Math.max(0, standardRates[dayaBaru] - standardRates[dayaLama]);
    } else {
      bp = Math.round(selisihDaya * 969);
    }
    penjelasan = `Perubahan Daya (PD) dari ${dayaLama.toLocaleString('id-ID')} VA ke ${dayaBaru.toLocaleString('id-ID')} VA (selisih ${selisihDaya.toLocaleString('id-ID')} VA @ Rp 969/VA)`;
  }

  // Token perdana atau Uang Jaminan Langganan (UJL)
  let ujlToken = 0;
  if (meterType === 'PRABAYAR') {
    ujlToken = 50000; // Standar token perdana minimal Rp 50.000
  } else {
    // UJL untuk Paskabayar diperkirakan dari daya (misal Rp 150/VA atau paket standar)
    ujlToken = Math.round((dayaBaru || 1300) * 125);
  }

  const materai = bp + ujlToken >= 5000000 ? 10000 : 0;
  const totalEstimasi = bp + ujlToken + materai;

  return {
    biayaPenyambungan: bp,
    ujlToken,
    materai,
    totalEstimasi,
    penjelasan,
  };
}

/**
 * Determines initial workflow routing based on user requirements:
 * - If PFK: directly connected to Teknik for urgent field survey (Status 'SURVEI/RAB')
 * - If PBPD: document verification required before survey (Status 'MOHON')
 */
export function determineInitialWorkflow(transaksi: TransaksiType): {
  initialStatus: StatusPermohonan;
  assignedRole: UserRole;
  routingSummary: string;
  badgeColor: string;
  priority: 'SANGAT SEGERA' | 'NORMAL';
} {
  if (transaksi === 'PFK') {
    return {
      initialStatus: 'SURVEI/RAB',
      assignedRole: 'teknik',
      routingSummary: 'Jalur Kilat PFK: Langsung terhubung ke Tim Teknik untuk survei lapangan segera.',
      badgeColor: 'border-amber-500 bg-amber-500/10 text-amber-500',
      priority: 'SANGAT SEGERA',
    };
  }

  return {
    initialStatus: 'MOHON',
    assignedRole: 'pp',
    routingSummary: 'Alur Standar PBPD: Verifikasi dokumen oleh Pelayanan Pelanggan (PP) sebelum proses survei.',
    badgeColor: 'border-blue-500 bg-blue-500/10 text-blue-500',
    priority: 'NORMAL',
  };
}

/**
 * Role permissions and required fields for transitioning status
 */
export function canTransitionStatus(
  item: PermohonanItem,
  targetStatus: StatusPermohonan,
  role: UserRole
): { allowed: boolean; reason?: string } {
  if (role === 'all' && targetStatus !== 'PDL') {
    return { allowed: true };
  }

  // Role based checks
  switch (targetStatus) {
    case 'SURVEI/RAB':
      if (role !== 'pp' && role !== 'teknik' && role !== 'security') {
        return { allowed: false, reason: 'Hanya tim PP atau Teknik yang dapat memajukan ke tahap Survei/RAB.' };
      }
      return { allowed: true };

    case 'TANPA PERLUASAN':
    case 'BAYAR':
      if (role !== 'teknik' && role !== 'pp') {
        return { allowed: false, reason: 'Hanya tim Teknik (setelah hasil survei/RAB) atau PP yang dapat menetapkan status Bayar.' };
      }
      return { allowed: true };

    case 'KERJA':
      // Requires Working Permit & Safety Checklist (K3L)
      if (role !== 'k3l' && role !== 'teknik') {
        return { allowed: false, reason: 'Pekerjaan fisik memerlukan validasi Working Permit dari bagian K3L.' };
      }
      if (!item.workingPermit && role === 'teknik') {
        return { allowed: false, reason: 'Nomor Working Permit (WP) dari K3L wajib diterbitkan sebelum pekerjaan dimulai.' };
      }
      return { allowed: true };

    case 'NYALA':
      // Transaksi Energi (TE) commissioning & meter inspection
      if (role !== 'te') {
        return { allowed: false, reason: 'Penyalaan & Komisioning merupakan wewenang Tim Transaksi Energi (TE).' };
      }
      return { allowed: true };

    case 'PDL':
      // Final administration by Pelayanan Pelanggan (PP)
      if (role !== 'pp' && role !== 'all') {
        return { allowed: false, reason: 'Penerbitan dan pembaruan PDL akhir merupakan wewenang Pelayanan Pelanggan (PP).' };
      }
      // Validasi berkas TE: Untuk keperluan PDL, tim TE perlu mengirimkan foto meter sebelum, sesudah, dan idpel tetangga
      const pdlCheck = checkPdlCompleteness(item);
      if (!pdlCheck.isComplete) {
        return {
          allowed: false,
          reason: `Untuk keperluan PDL, berkas dari Tim Transaksi Energi (TE) belum lengkap: ${pdlCheck.missingItems.join(', ')} wajib dilengkapi terlebih dahulu.`,
        };
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/**
 * Memeriksa kelengkapan berkas Transaksi Energi (TE) untuk keperluan PDL
 */
export function checkPdlCompleteness(item: PermohonanItem): {
  isComplete: boolean;
  missingItems: string[];
} {
  const missing: string[] = [];
  const hasFotoSebelum = Boolean(item.fotoMeterSebelum || item.fotoKwhMeterLama);
  const hasFotoSesudah = Boolean(item.fotoMeterSesudah || item.fotoKwhMeterBaru);
  const hasIdpelTetangga = Boolean(item.idPelTetangga && item.idPelTetangga.trim() !== '');

  if (!hasFotoSebelum) missing.push('Foto Meter Sebelum');
  if (!hasFotoSesudah) missing.push('Foto Meter Sesudah');
  if (!hasIdpelTetangga) missing.push('IDPEL Tetangga');

  return {
    isComplete: missing.length === 0,
    missingItems: missing,
  };
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatPowerVA(va: number): string {
  if (!va) return '0 VA';
  if (va >= 1000) {
    return `${(va / 1000).toLocaleString('id-ID')} kVA (${va.toLocaleString('id-ID')} VA)`;
  }
  return `${va.toLocaleString('id-ID')} VA`;
}

export function parseCoordinate(coord: string): { lat: number; lng: number } | null {
  if (!coord) return null;
  const parts = coord.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}
