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
 * - If PFK: directly connected to Teknik for urgent field survey (Status 'SURVEI')
 * - If PBPD: document verification required before survey & RAB (Status 'MOHON')
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
      initialStatus: 'SURVEI',
      assignedRole: 'teknik',
      routingSummary: 'Alur PFK: Langsung terhubung ke Tim Teknik untuk survei lapangan segera (dilanjutkan penyusunan RAB).',
      badgeColor: 'border-amber-500 bg-amber-500/10 text-amber-500',
      priority: 'SANGAT SEGERA',
    };
  }

  return {
    initialStatus: 'MOHON',
    assignedRole: 'pp',
    routingSummary: 'Alur Standar PBPD: Verifikasi dokumen oleh Pelayanan Pelanggan (PP) sebelum tahap Survei & penyusunan RAB.',
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
    case 'SURVEI':
      if (role !== 'pp' && role !== 'teknik' && role !== 'security') {
        return { allowed: false, reason: 'Hanya tim PP atau Teknik yang dapat memajukan ke tahap Survei.' };
      }
      return { allowed: true };

    case 'RAB':
      if (role !== 'teknik' && role !== 'pp') {
        return { allowed: false, reason: 'Hanya tim Teknik (setelah survei lapangan) atau PP yang dapat memajukan ke tahap penyusunan RAB.' };
      }
      return { allowed: true };

    case 'TANPA PERLUASAN':
    case 'BAYAR':
      if (role !== 'teknik' && role !== 'pp') {
        return { allowed: false, reason: 'Hanya tim Teknik (setelah hasil survei & RAB) atau PP yang dapat menetapkan status Bayar.' };
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

export interface PipelineStageSummary {
  status: StatusPermohonan;
  label: string;
  shortLabel: string;
  department: string;
  count: number;
  percentage: number;
  pbCount: number;
  pdCount: number;
  pfkCount: number;
  totalDayaVa: number;
  totalRab: number;
  awaitingRabCount: number;
  isBottleneck: boolean;
  records: PermohonanItem[];
}

export interface PipelineSummaryResult {
  stages: PipelineStageSummary[];
  totalRecords: number;
  activeBacklogCount: number;
  completedPdlCount: number;
  surveyedWithoutRabCount: number;
  topBottleneck: PipelineStageSummary | null;
}

const PIPELINE_STAGE_META: {
  status: StatusPermohonan;
  label: string;
  shortLabel: string;
  department: string;
}[] = [
  {
    status: 'MOHON',
    label: '1. Verifikasi Permohonan (Mohon)',
    shortLabel: 'Mohon (PP)',
    department: 'Pelayanan Pelanggan (PP)',
  },
  {
    status: 'SURVEI',
    label: '2. Survei Lapangan (Survey)',
    shortLabel: 'Survei Lapangan',
    department: 'Teknik (Surveyor)',
  },
  {
    status: 'RAB',
    label: '3. Penyusunan Anggaran (RAB)',
    shortLabel: 'Penyusunan RAB',
    department: 'Teknik (Perencanaan RAB)',
  },
  {
    status: 'TANPA PERLUASAN',
    label: 'Tanpa Perluasan Jaringan',
    shortLabel: 'Tanpa Perluasan',
    department: 'Teknik / PP',
  },
  {
    status: 'BAYAR',
    label: '4. Pelunasan BP / UJL (Bayar)',
    shortLabel: 'Menunggu Bayar',
    department: 'Pelayanan Pelanggan (PP)',
  },
  {
    status: 'KERJA',
    label: '5. Konstruksi & Permit (Kerja)',
    shortLabel: 'Konstruksi / Kerja',
    department: 'K3L & Vendor Konstruksi',
  },
  {
    status: 'NYALA',
    label: '6. Komisioning & Segel (Nyala)',
    shortLabel: 'Komisioning (Nyala)',
    department: 'Transaksi Energi (TE)',
  },
  {
    status: 'PDL',
    label: '7. Selesai Administrasi (PDL)',
    shortLabel: 'Selesai (PDL)',
    department: 'Pelayanan Pelanggan (PP)',
  },
];

/**
 * Aggregates records by workflow status and identifies pipeline bottlenecks.
 */
export function summarizePipelineByStatus(records: PermohonanItem[]): PipelineSummaryResult {
  const totalRecords = records.length;

  const stages: PipelineStageSummary[] = PIPELINE_STAGE_META.map((meta) => {
    const items = records.filter((r) => r.status === meta.status);
    const count = items.length;
    const percentage = totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0;
    const pbCount = items.filter((r) => r.transaksi === 'PB').length;
    const pdCount = items.filter((r) => r.transaksi === 'PD').length;
    const pfkCount = items.filter((r) => r.transaksi === 'PFK').length;
    const totalDayaVa = items.reduce((sum, r) => sum + (r.dayaBaru || 0), 0);
    const totalRab = items.reduce((sum, r) => sum + (r.rab || 0), 0);
    const awaitingRabCount = items.filter((r) => !r.rab || r.rab === 0).length;

    return {
      ...meta,
      count,
      percentage,
      pbCount,
      pdCount,
      pfkCount,
      totalDayaVa,
      totalRab,
      awaitingRabCount,
      isBottleneck: false,
      records: items,
    };
  });

  // Identify top bottleneck among active (non-PDL) stages
  const activeStages = stages.filter((s) => s.status !== 'PDL' && s.count > 0);
  let topBottleneck: PipelineStageSummary | null = null;

  if (activeStages.length > 0) {
    // Sort by highest count, breaking ties by PFK urgency then total Daya VA
    const sorted = [...activeStages].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.pfkCount !== a.pfkCount) return b.pfkCount - a.pfkCount;
      return b.totalDayaVa - a.totalDayaVa;
    });
    topBottleneck = sorted[0];
    const targetStage = stages.find((s) => s.status === topBottleneck!.status);
    if (targetStage) {
      targetStage.isBottleneck = true;
    }
  }

  const completedPdlCount = records.filter((r) => r.status === 'PDL').length;
  const activeBacklogCount = totalRecords - completedPdlCount;
  const surveyedWithoutRabCount = records.filter(
    (r) => r.status === 'SURVEI' && (!r.rab || r.rab === 0)
  ).length;

  return {
    stages,
    totalRecords,
    activeBacklogCount,
    completedPdlCount,
    surveyedWithoutRabCount,
    topBottleneck,
  };
}

export interface TeStandFormConfig {
  isIndustri: boolean;
  showStandBongkar: boolean;
  showStandPasang: boolean;
  standParameters: ('WBP' | 'LWBP' | 'kVar')[] | ('kWh')[];
  ruleSummary: string;
}

/**
 * Checks whether a PLN tariff code is an Industrial tariff (e.g. I-1/TR, I-2/TR, I-3/TM, I-4/TT).
 */
export function isTarifIndustri(tarif: string): boolean {
  const clean = (tarif || '').trim().toUpperCase();
  return clean.startsWith('I-') || clean.startsWith('I/') || clean.includes('INDUSTRI');
}

/**
 * Determines which Stand Meter fields to display in the Transaksi Energi (TE) form:
 * - Perubahan Daya (PD): Stand Bongkar (Meter Lama) & Stand Pasang (Meter Baru)
 * - Pasang Baru (PB): Hanya Stand Pasang (Meter Baru)
 * - Tarif Industri (I-1, I-2, I-3, I-4): Stand terdiri dari WBP, LWBP, dan kVar
 */
export function getTeStandFormConfig(
  transaksi: TransaksiType,
  tarif: string
): TeStandFormConfig {
  const isIndustri = isTarifIndustri(tarif);
  // Perubahan Daya (PD) requires both Stand Bongkar & Stand Pasang; Pasang Baru (PB) only requires Stand Pasang
  const showStandBongkar = transaksi === 'PD' || transaksi === 'PFK';
  const showStandPasang = true;
  const standParameters: ('WBP' | 'LWBP' | 'kVar')[] | ('kWh')[] = isIndustri
    ? ['WBP', 'LWBP', 'kVar']
    : ['kWh'];

  let ruleSummary = '';
  if (transaksi === 'PB') {
    ruleSummary = isIndustri
      ? `Pasang Baru (PB) • Tarif Industri (${tarif}): Hanya Stand Pasang dengan parameter WBP, LWBP, dan kVar.`
      : `Pasang Baru (PB) • Tarif ${tarif}: Hanya Stand Pasang (kWh) tanpa Stand Bongkar.`;
  } else if (transaksi === 'PD') {
    ruleSummary = isIndustri
      ? `Perubahan Daya (PD) • Tarif Industri (${tarif}): Wajib Stand Bongkar & Stand Pasang dengan parameter WBP, LWBP, dan kVar.`
      : `Perubahan Daya (PD) • Tarif ${tarif}: Wajib Stand Bongkar (Meter Lama) & Stand Pasang (Meter Baru).`;
  } else {
    ruleSummary = isIndustri
      ? `Pekerjaan PFK • Tarif Industri (${tarif}): Stand Bongkar & Stand Pasang dengan parameter WBP, LWBP, dan kVar.`
      : `Pekerjaan PFK • Tarif ${tarif}: Stand Bongkar & Stand Pasang (kWh).`;
  }

  return {
    isIndustri,
    showStandBongkar,
    showStandPasang,
    standParameters,
    ruleSummary,
  };
}

/**
 * Formats a concise human-readable summary of TE Stand Bongkar & Stand Pasang for Detail Modal, Table, and AI Reports.
 */
export function formatTeStandSummary(item: PermohonanItem): string {
  const cfg = getTeStandFormConfig(item.transaksi, item.tarif);

  if (cfg.isIndustri) {
    const pasangStr = `Pasang [WBP: ${item.standPasangWbp ?? 0}, LWBP: ${
      item.standPasangLwbp ?? 0
    }, kVar: ${item.standPasangKvar ?? 0}]`;
    if (cfg.showStandBongkar) {
      const bongkarStr = `Bongkar [WBP: ${item.standBongkarWbp ?? 0}, LWBP: ${
        item.standBongkarLwbp ?? 0
      }, kVar: ${item.standBongkarKvar ?? 0}]`;
      return `${bongkarStr} • ${pasangStr}`;
    }
    return pasangStr;
  }

  const pasangVal = item.standPasang ?? item.standKwhAwal ?? 0;
  if (cfg.showStandBongkar) {
    const bongkarVal = item.standBongkar ?? 0;
    return `Bongkar: ${bongkarVal} kWh • Pasang: ${pasangVal} kWh`;
  }
  return `Pasang: ${pasangVal} kWh`;
}

export interface DayCounterInfo {
  days: number;
  calendarDaysSinceInput: number;
  inputDate: string;
  isCompleted: boolean;
  urgency: 'normal' | 'warning' | 'overdue' | 'completed';
  shortLabel: string;
  fullLabel: string;
}

/**
 * Menghitung counter hari mulai dari surat permohonan diinput ke aplikasi (tglSurat / createdAt).
 * - Jika permohonan masih berjalan (status !== 'PDL'), dihitung dari tanggal input s/d hari ini (referenceDate).
 * - Jika permohonan sudah selesai (status === 'PDL'), menampilkan durasi hari penyelesaian (s/d tglPdlUpdate / updatedAt)
 *   serta total hari sejak diinput.
 */
export function calculateDaysSinceInput(
  item: Pick<PermohonanItem, 'tglSurat' | 'createdAt' | 'status' | 'tglPdlUpdate' | 'updatedAt'>,
  referenceDate: Date | string = new Date()
): DayCounterInfo {
  const rawInputDate = (item.tglSurat || item.createdAt || '').trim();
  const inputDateStr = rawInputDate ? rawInputDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const parseYmdToUtcMs = (ymd: string): number => {
    const clean = ymd.slice(0, 10);
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return Date.UTC(parts[0], parts[1] - 1, parts[2]);
    }
    const parsed = new Date(ymd).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  };

  const refIso =
    typeof referenceDate === 'string'
      ? referenceDate.slice(0, 10)
      : referenceDate.toISOString().slice(0, 10);

  const startMs = parseYmdToUtcMs(inputDateStr);
  const nowMs = parseYmdToUtcMs(refIso);
  const msPerDay = 1000 * 60 * 60 * 24;

  const calendarDaysSinceInput = Math.max(0, Math.floor((nowMs - startMs) / msPerDay));
  const isCompleted = item.status === 'PDL';

  if (isCompleted) {
    const endRaw = (item.tglPdlUpdate || item.updatedAt || refIso).slice(0, 10);
    const endMs = parseYmdToUtcMs(endRaw);
    const durationDays = Math.max(1, Math.floor((endMs - startMs) / msPerDay));
    return {
      days: durationDays,
      calendarDaysSinceInput,
      inputDate: inputDateStr,
      isCompleted: true,
      urgency: 'completed',
      shortLabel: `Selesai ${durationDays} Hari`,
      fullLabel: `Selesai PDL dalam ${durationDays} Hari (Input: ${inputDateStr})`,
    };
  }

  const days = calendarDaysSinceInput;
  const urgency: 'normal' | 'warning' | 'overdue' =
    days <= 7 ? 'normal' : days <= 14 ? 'warning' : 'overdue';

  const shortLabel = days === 0 ? 'Hari Ini (0 Hari)' : `${days} Hari`;
  const fullLabel =
    days === 0
      ? `Baru diinput hari ini (${inputDateStr})`
      : `${days} Hari sejak surat diinput (${inputDateStr})`;

  return {
    days,
    calendarDaysSinceInput,
    inputDate: inputDateStr,
    isCompleted: false,
    urgency,
    shortLabel,
    fullLabel,
  };
}

/**
 * Builds a structured context string of all current PLN PBPD & PFK records and pipeline metrics
 * so the Gemini AI assistant can answer questions and generate custom reports accurately.
 */
export function buildPlnAiDataContext(records: PermohonanItem[]): string {
  const summary = summarizePipelineByStatus(records);
  const totalDayaKva = records.reduce((acc, r) => acc + (r.dayaBaru || 0), 0) / 1000;
  const totalRab = records.reduce((acc, r) => acc + (r.rab || 0), 0);

  const stageLines = summary.stages
    .map(
      (s) =>
        `- ${s.status} (${s.shortLabel}): ${s.count} permohonan (${s.percentage}%), PB=${s.pbCount}, PD=${s.pdCount}, PFK=${s.pfkCount}, Total Daya=${(
          s.totalDayaVa / 1000
        ).toLocaleString('id-ID')} kVA, Total RAB=${formatRupiah(s.totalRab)}${
          s.status === 'SURVEI' && s.awaitingRabCount > 0
            ? ` [${s.awaitingRabCount} belum dibuat RAB]`
            : ''
        }${s.isBottleneck ? ' [BOTTLENECK UTAMA]' : ''}`
    )
    .join('\n');

  const recordLines = records
    .map((r, idx) => {
      const pdlCheck = checkPdlCompleteness(r);
      const standInfo = formatTeStandSummary(r);
      const dayCounter = calculateDaysSinceInput(r);
      return `${idx + 1}. [${r.noNodin}] ${r.projectName} | ID: ${r.id} | Tgl Input Surat: ${
        dayCounter.inputDate
      } | Counter Hari: ${dayCounter.shortLabel} | Transaksi: ${r.transaksi}${
        r.kategoriPfk ? ` (${r.kategoriPfk})` : ''
      } | Status: ${r.status} | Daya: ${formatPowerVA(r.dayaBaru)} (${r.tarif}, ${
        r.meter
      }) | Alamat: ${r.alamat} | Peruntukan: ${r.peruntukan} | Gardu: ${
        r.nomorGardu || 'Belum didata'
      } | Tiang: ${
        r.nomorTiang || 'Belum disurvei'
      } | Petugas Survei: ${r.petugasSurvei || '-'} | Tgl Survei: ${
        r.tglSurvei || '-'
      } | RAB: ${
        r.rab > 0 ? formatRupiah(r.rab) : 'Rp 0 (Belum dibuat RAB)'
      } | No PK: ${r.noPkVendor || '-'} | WP K3L: ${
        r.workingPermit || 'Belum terbit'
      } | Stand TE: ${standInfo} | Segel TE: ${
        r.nomorSeriSegel || r.validasiSegel || '-'
      } | Berkas PDL TE: ${
        pdlCheck.isComplete ? 'Lengkap' : `Belum lengkap (${pdlCheck.missingItems.join(', ')})`
      } | Ket Status: ${r.keteranganStatus || '-'} | Kendala: ${r.keteranganKendala || '-'}`;
    })
    .join('\n');

  return [
    `RINGKASAN EKSEKUTIF PLN ULP BOROBUDUR (UP3 MAGELANG - UID JAWA TENGAH):`,
    `- Total Permohonan: ${summary.totalRecords} data`,
    `- Antrean Aktif (Belum PDL): ${summary.activeBacklogCount} data`,
    `- Selesai Administrasi (PDL): ${summary.completedPdlCount} data`,
    `- Sudah Survei tapi Belum Dibuat RAB: ${summary.surveyedWithoutRabCount} data`,
    `- Bottleneck Tertinggi: ${
      summary.topBottleneck
        ? `${summary.topBottleneck.shortLabel} (${summary.topBottleneck.count} data)`
        : 'Tidak ada'
    }`,
    `- Total Daya Diajukan: ${totalDayaKva.toLocaleString('id-ID')} kVA`,
    `- Total Nilai RAB Terdata: ${formatRupiah(totalRab)}`,
    ``,
    `DISTRIBUSI PER STATUS TAHAPAN:`,
    stageLines,
    ``,
    `DAFTAR DETAIL SELURUH PERMOHONAN (${records.length} DATA):`,
    recordLines,
  ].join('\n');
}

export interface TeknikWaNotificationPayload {
  recipientPhone: string;
  normalizedPhone: string;
  customerName: string;
  customerPhone: string;
  mapsUrl: string;
  coordinates: string;
  message: string;
  waUrl: string;
}

/**
 * Normalizes an Indonesian phone number (e.g. 0812... -> 62812...) for wa.me links.
 */
export function normalizePhoneToWa(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

/**
 * Builds a structured WhatsApp notification message and wa.me URL for Tim Teknik
 * when a new permohonan is inputted, including customer details, customer phone number,
 * coordinates, and Google Maps link to facilitate field survey.
 */
export function buildTeknikWaNotification(
  item: Pick<
    PermohonanItem,
    | 'noNodin'
    | 'transaksi'
    | 'kategoriPfk'
    | 'status'
    | 'projectName'
    | 'kontakPerson'
    | 'nomorKtp'
    | 'idPel'
    | 'dayaLama'
    | 'dayaBaru'
    | 'tarif'
    | 'meter'
    | 'peruntukan'
    | 'alamat'
    | 'tagingLokasi'
    | 'linkMap'
    | 'tglSurat'
    | 'keteranganPekerjaan'
  >,
  teknikPhone: string = '08112500123'
): TeknikWaNotificationPayload {
  const normalizedPhone = normalizePhoneToWa(teknikPhone);
  const cleanCoords = (item.tagingLokasi || '-7.6079, 110.2038').trim();
  const mapsUrl =
    item.linkMap && item.linkMap.trim()
      ? item.linkMap.trim()
      : `https://www.google.com/maps?q=${cleanCoords.replace(/\s/g, '')}`;

  const customerName = (item.projectName || '[Nama Pelanggan]').trim();
  const customerPhone = (item.kontakPerson || '-').trim();

  const jenisStr =
    item.transaksi === 'PFK'
      ? `PFK${item.kategoriPfk ? ` (${item.kategoriPfk})` : ''}`
      : item.transaksi === 'PD'
      ? 'Perubahan Daya (PD)'
      : 'Pasang Baru (PB)';

  const dayaStr =
    item.transaksi === 'PD'
      ? `${(item.dayaLama || 0).toLocaleString('id-ID')} VA -> ${(item.dayaBaru || 0).toLocaleString('id-ID')} VA`
      : `${(item.dayaBaru || 0).toLocaleString('id-ID')} VA`;

  const lines: string[] = [
    `*⚡ NOTIFIKASI SURVEI PERMOHONAN BARU - TIM TEKNIK*`,
    `*PLN ULP Borobudur • UP3 Magelang*`,
    `----------------------------------------`,
    `*No. Nodin / Reg:* ${item.noNodin || '-'}`,
    `*Jenis Permohonan:* ${jenisStr}`,
    `*Status Awal:* ${item.status || 'MOHON'}`,
    `*Tgl Input Surat:* ${item.tglSurat || '-'}`,
    ``,
    `*📋 DATA PELANGGAN:*`,
    `• *Nama Pelanggan:* ${customerName}`,
    `• *No. HP / WA Pelanggan:* ${customerPhone}`,
    `• *NIK KTP:* ${item.nomorKtp || '-'}`,
    ...(item.idPel ? [`• *IDPEL:* ${item.idPel}`] : []),
    `• *Daya & Tarif:* ${dayaStr} (${item.tarif || '-'} / ${item.meter || '-'})`,
    `• *Peruntukan:* ${item.peruntukan || '-'}`,
    `• *Alamat Lokasi:* ${item.alamat || '-'}`,
    ``,
    `*📍 LOKASI & MAPS SURVEI:*`,
    `• *Titik Koordinat:* ${cleanCoords}`,
    `• *Link Google Maps:* ${mapsUrl}`,
    `----------------------------------------`,
    `Mohon Tim Teknik segera menindaklanjuti jadwal survei lapangan menggunakan titik Maps & menghubungi No. HP pelanggan di atas.`,
  ];

  const message = lines.join('\n');
  const waUrl = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return {
    recipientPhone: teknikPhone,
    normalizedPhone,
    customerName,
    customerPhone,
    mapsUrl,
    coordinates: cleanCoords,
    message,
    waUrl,
  };
}
