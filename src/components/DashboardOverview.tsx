import React, { useState, useMemo } from 'react';
import { PermohonanItem, StatusPermohonan, TransaksiType, UserRole } from '../types';
import { StatusWorkflowBadge, TransaksiBadge } from './StatusWorkflowBadge';
import { formatPowerVA, formatRupiah } from '../utils/plnValidation';
import {
  Search,
  Filter,
  Download,
  LayoutGrid,
  List,
  MapPin,
  Clock,
  ArrowRight,
  Eye,
  Wrench,
  Zap,
  HardHat,
  Users,
  Shield,
  FileSpreadsheet,
  AlertTriangle,
  ChevronRight,
  Calendar,
  X,
  RotateCcw,
  SlidersHorizontal,
  Hash,
  ArrowUpDown,
  Tag,
} from 'lucide-react';
import { GisSurveyorMap } from './GisSurveyorMap';

interface DashboardOverviewProps {
  records: PermohonanItem[];
  currentRole: UserRole;
  onSelectRecord: (record: PermohonanItem) => void;
  onOpenWorkflowAction: (record: PermohonanItem) => void;
  onOpenQuickIntake: () => void;
  onOpenGoogleSheets: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  records,
  currentRole,
  onSelectRecord,
  onOpenWorkflowAction,
  onOpenQuickIntake,
  onOpenGoogleSheets,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterTransaksi, setFilterTransaksi] = useState<string>('ALL');
  const [filterIdPelPresence, setFilterIdPelPresence] = useState<'ALL' | 'WITH_IDPEL' | 'WITHOUT_IDPEL'>('ALL');
  const [sortBy, setSortBy] = useState<'date_desc' | 'name_asc' | 'idpel_asc' | 'daya_desc' | 'rab_desc'>('date_desc');
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'map'>('table');

  // Counts for filter dropdown options
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      MOHON: 0,
      'SURVEI/RAB': 0,
      'TANPA PERLUASAN': 0,
      BAYAR: 0,
      KERJA: 0,
      NYALA: 0,
      PDL: 0,
    };
    records.forEach((r) => {
      if (counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    });
    return counts;
  }, [records]);

  const transaksiCounts = useMemo(() => {
    const counts = { PB: 0, PD: 0, PFK: 0 };
    records.forEach((r) => {
      if (r.transaksi === 'PB') counts.PB++;
      else if (r.transaksi === 'PD') counts.PD++;
      else if (r.transaksi === 'PFK') counts.PFK++;
    });
    return counts;
  }, [records]);

  const idpelCounts = useMemo(() => {
    let withIdpel = 0;
    let withoutIdpel = 0;
    records.forEach((r) => {
      if (r.idPel && r.idPel.trim() !== '') withIdpel++;
      else withoutIdpel++;
    });
    return { withIdpel, withoutIdpel };
  }, [records]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    const list = records.filter((r) => {
      // Role-specific scoping if desired
      if (currentRole === 'teknik' && filterStatus === 'ROLE_DEFAULT') {
        if (r.status !== 'SURVEI/RAB' && r.transaksi !== 'PFK') return false;
      }

      if (filterStatus !== 'ALL' && filterStatus !== 'ROLE_DEFAULT' && r.status !== filterStatus) {
        return false;
      }

      if (filterTransaksi !== 'ALL' && r.transaksi !== filterTransaksi) {
        return false;
      }

      if (filterIdPelPresence === 'WITH_IDPEL' && (!r.idPel || r.idPel.trim() === '')) {
        return false;
      }
      if (filterIdPelPresence === 'WITHOUT_IDPEL' && r.idPel && r.idPel.trim() !== '') {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        // Priority search fields: Project Name, IDPEL, and Current Status
        const matchesName = r.projectName ? r.projectName.toLowerCase().includes(q) : false;
        const matchesIdPel = r.idPel ? r.idPel.toLowerCase().includes(q) : false;
        const matchesStatus = r.status ? r.status.toLowerCase().includes(q) : false;
        // Secondary PLN operational identifiers
        const matchesNodin = r.noNodin ? r.noNodin.toLowerCase().includes(q) : false;
        const matchesTransaksi = r.transaksi ? r.transaksi.toLowerCase().includes(q) : false;
        const matchesAlamat = r.alamat ? r.alamat.toLowerCase().includes(q) : false;
        const matchesPeruntukan = r.peruntukan ? r.peruntukan.toLowerCase().includes(q) : false;
        const matchesTiang = r.nomorTiang ? r.nomorTiang.toLowerCase().includes(q) : false;
        const matchesKontak = r.kontakPerson ? r.kontakPerson.toLowerCase().includes(q) : false;
        const matchesSurat = r.suratPermohonan ? r.suratPermohonan.toLowerCase().includes(q) : false;
        const matchesId = r.id ? r.id.toLowerCase().includes(q) : false;

        return (
          matchesName ||
          matchesIdPel ||
          matchesStatus ||
          matchesNodin ||
          matchesTransaksi ||
          matchesAlamat ||
          matchesPeruntukan ||
          matchesTiang ||
          matchesKontak ||
          matchesSurat ||
          matchesId
        );
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.projectName.localeCompare(b.projectName);
      }
      if (sortBy === 'idpel_asc') {
        return (a.idPel || 'ZZZZ').localeCompare(b.idPel || 'ZZZZ');
      }
      if (sortBy === 'daya_desc') {
        return (b.dayaBaru || 0) - (a.dayaBaru || 0);
      }
      if (sortBy === 'rab_desc') {
        return (b.rab || 0) - (a.rab || 0);
      }
      // date_desc (default)
      return (b.tglSurat || '').localeCompare(a.tglSurat || '');
    });

    return list;
  }, [records, searchTerm, filterStatus, filterTransaksi, filterIdPelPresence, sortBy, currentRole]);

  // Check if any filter is actively applied
  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      filterStatus !== 'ALL' ||
      filterTransaksi !== 'ALL' ||
      filterIdPelPresence !== 'ALL' ||
      sortBy !== 'date_desc'
  );

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterStatus('ALL');
    setFilterTransaksi('ALL');
    setFilterIdPelPresence('ALL');
    setSortBy('date_desc');
  };

  // Helper for highlighting matching search text
  const highlightMatch = (text: string | undefined | null, query: string) => {
    if (!text) return text || '';
    if (!query.trim()) return text;
    const q = query.trim().toLowerCase();
    const lower = text.toLowerCase();
    const index = lower.indexOf(q);
    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + q.length);
    const after = text.substring(index + q.length);

    return (
      <>
        {before}
        <mark className="bg-amber-200 text-amber-950 font-bold px-0.5 rounded shadow-2xs">
          {match}
        </mark>
        {after}
      </>
    );
  };

  // Executive Metrics
  const metrics = useMemo(() => {
    const total = records.length;
    const pfkPending = records.filter((r) => r.transaksi === 'PFK' && r.status === 'SURVEI/RAB').length;
    const mohonPp = records.filter((r) => r.status === 'MOHON').length;
    const surveyTeknik = records.filter((r) => r.status === 'SURVEI/RAB').length;
    const bayar = records.filter((r) => r.status === 'BAYAR').length;
    const kerjaK3l = records.filter((r) => r.status === 'KERJA').length;
    const nyalaTe = records.filter((r) => r.status === 'NYALA').length;
    const selesaiPdl = records.filter((r) => r.status === 'PDL').length;
    const totalDayaKva = records.reduce((acc, curr) => acc + (curr.dayaBaru || 0), 0) / 1000;

    return {
      total,
      pfkPending,
      mohonPp,
      surveyTeknik,
      bayar,
      kerjaK3l,
      nyalaTe,
      selesaiPdl,
      totalDayaKva,
    };
  }, [records]);

  // Export XLS (Microsoft Excel)
  const handleExportXls = () => {
    const today = new Date().toISOString().slice(0, 10);
    const fileName = `PLN_Monitoring_PBPD_PFK_ULP_Borobudur_${today}.xls`;

    const escapeXml = (unsafe: string | number | undefined | null) => {
      if (unsafe === undefined || unsafe === null) return '';
      return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const headers = [
      'No Nodin',
      'ID Permohonan',
      'Status Progres',
      'Transaksi',
      'Kategori PFK',
      'Nama Pemohon / Proyek',
      'Nomor KTP (NIK)',
      'No WhatsApp / Kontak',
      'Alamat Lokasi',
      'Peruntukan Bangunan',
      'Daya Lama (VA)',
      'Daya Baru (VA)',
      'Golongan Tarif',
      'Tipe Meter',
      'ID Pelanggan (IDPEL)',
      'No Seri Meter Eksisting',
      'Nomor Tiang',
      'Petugas Survei',
      'Estimasi RAB (Rp)',
      'Biaya BP (Rp)',
      'Biaya UJL (Rp)',
      'No PK Vendor',
      'Working Permit (K3L)',
      'kWh Meter Baru (TE)',
      'No Seri Segel (TE)',
      'IDPEL Tetangga (Wajib PDL)',
      'Foto Meter Sebelum (TE)',
      'Foto Meter Sesudah (TE)',
      'Foto IDPEL Tetangga (TE)',
      'Titik Koordinat GPS',
      'Tgl Permohonan',
      'Keterangan Pekerjaan',
      'Keterangan Status',
      'Keterangan Kendala',
    ];

    const rowsHtml = filteredRecords
      .map((r) => {
        const hasFotoSebelum = Boolean(r.fotoMeterSebelum || r.fotoKwhMeterLama);
        const hasFotoSesudah = Boolean(r.fotoMeterSesudah || r.fotoKwhMeterBaru);
        const hasFotoIdpelTet = Boolean(r.fotoIdpelTetangga);

        return `<tr>
          <td style="mso-number-format:'\\@'; font-weight:bold;">${escapeXml(r.noNodin)}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.id)}</td>
          <td style="text-align:center;">${escapeXml(r.status)}</td>
          <td style="text-align:center; font-weight:bold;">${escapeXml(r.transaksi)}</td>
          <td style="text-align:center;">${escapeXml(r.kategoriPfk || '-')}</td>
          <td>${escapeXml(r.projectName)}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.nomorKtp || '-')}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.kontakPerson)}</td>
          <td>${escapeXml(r.alamat)}</td>
          <td>${escapeXml(r.peruntukan)}</td>
          <td style="text-align:right;">${r.dayaLama || 0}</td>
          <td style="text-align:right; font-weight:bold;">${r.dayaBaru}</td>
          <td style="text-align:center;">${escapeXml(r.tarif)}</td>
          <td style="text-align:center;">${escapeXml(r.meter)}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.idPel || '-')}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.nomorMeterEksisting || '-')}</td>
          <td>${escapeXml(r.nomorTiang || '-')}</td>
          <td>${escapeXml(r.petugasSurvei || '-')}</td>
          <td style="text-align:right;">${r.rab || 0}</td>
          <td style="text-align:right;">${r.biayaBp || 0}</td>
          <td style="text-align:right;">${r.biayaUjl || 0}</td>
          <td>${escapeXml(r.noPkVendor || '-')}</td>
          <td>${escapeXml(r.workingPermit || '-')}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.nomorKwhBaru || '-')}</td>
          <td style="mso-number-format:'\\@';">${escapeXml(r.nomorSeriSegel || '-')}</td>
          <td style="mso-number-format:'\\@'; font-weight:bold;">${escapeXml(r.idPelTetangga || '-')}</td>
          <td style="text-align:center;">${hasFotoSebelum ? 'TERLAMPIR' : 'BELUM ADA'}</td>
          <td style="text-align:center;">${hasFotoSesudah ? 'TERLAMPIR' : 'BELUM ADA'}</td>
          <td style="text-align:center;">${hasFotoIdpelTet ? 'TERLAMPIR' : 'BELUM ADA'}</td>
          <td>${escapeXml(r.tagingLokasi || '-')}</td>
          <td style="text-align:center;">${escapeXml(r.tglSurat || '')}</td>
          <td>${escapeXml(r.keteranganPekerjaan || '')}</td>
          <td>${escapeXml(r.keteranganStatus || '')}</td>
          <td>${escapeXml(r.keteranganKendala || '-')}</td>
        </tr>`;
      })
      .join('\n');

    const xlsTemplate = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>Monitoring PBPD &amp; PFK</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; }
  .title-main { font-size: 14pt; font-weight: bold; color: #005B94; }
  .title-sub { font-size: 10pt; color: #4B5563; }
  th { background-color: #0072BC; color: #FFFFFF; font-weight: bold; border: 1px solid #005B94; padding: 8px 10px; font-size: 10pt; }
  td { border: 1px solid #E5E7EB; padding: 6px 8px; font-size: 9.5pt; vertical-align: middle; }
</style>
</head>
<body>
  <table>
    <tr><td colspan="10" class="title-main">PT PLN (PERSERO) - MONITORING PROGRES PBPD &amp; PFK TERPADU</td></tr>
    <tr><td colspan="10" class="title-sub">ULP Borobudur, UP3 Magelang, UID Jawa Tengah • Data Export Tanggal: ${today} • Total: ${filteredRecords.length} Permohonan</td></tr>
    <tr></tr>
    <thead>
      <tr>
        ${headers.map((h) => `<th>${escapeXml(h)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([xlsTemplate], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const kanbanColumns: StatusPermohonan[] = [
    'MOHON',
    'SURVEI/RAB',
    'TANPA PERLUASAN',
    'BAYAR',
    'KERJA',
    'NYALA',
    'PDL',
  ];

  return (
    <div className="space-y-6">
      {/* Role Notice & Focus Guide */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-700 text-white rounded-lg">
            {currentRole === 'security' && <Shield className="w-5 h-5" />}
            {currentRole === 'pp' && <Users className="w-5 h-5" />}
            {currentRole === 'teknik' && <Wrench className="w-5 h-5" />}
            {currentRole === 'k3l' && <HardHat className="w-5 h-5" />}
            {currentRole === 'te' && <Zap className="w-5 h-5" />}
            {currentRole === 'all' && <LayoutGrid className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-xs font-bold text-sky-950 uppercase tracking-wide">
              Mode Bagian: {currentRole === 'all' ? 'Tinjauan Seluruh Bagian' : currentRole.toUpperCase()}
            </div>
            <div className="text-xs text-sky-800">
              {currentRole === 'security' &&
                'Pos Security / Front Desk: Pendaftaran cepat pemohon, verifikasi awal identitas & auto-routing PFK/PBPD.'}
              {currentRole === 'pp' &&
                'Pelayanan Pelanggan (PP): Verifikasi berkas, persetujuan daya, monitoring bayar BP & penerbitan PDL akhir.'}
              {currentRole === 'teknik' &&
                'Teknik: Survei tiang & jaringan, taging GPS, penyusunan RAB & pengawasan vendor pekerjaan.'}
              {currentRole === 'k3l' &&
                'K3L: Penerbitan Working Permit (WP), validasi JSA & checklist kepatuhan keselamatan kerja.'}
              {currentRole === 'te' &&
                'Transaksi Energi (TE): Komisioning uji teknis, pendataan kWh meter transaksi, rasio CT & segel resmi PLN.'}
              {currentRole === 'all' &&
                'Monitoring menyeluruh alur permohonan pasang baru, perubahan daya, dan PFK.'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {metrics.pfkPending > 0 && (
            <button
              onClick={() => {
                setFilterTransaksi('PFK');
                setFilterStatus('SURVEI/RAB');
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs animate-pulse flex items-center gap-1.5"
            >
              <span>⚡ {metrics.pfkPending} Antrean PFK Segera</span>
            </button>
          )}

          <button
            onClick={onOpenQuickIntake}
            className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold shadow-xs"
          >
            + Input Permohonan
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => {
            setFilterStatus('ALL');
            setFilterTransaksi('ALL');
          }}
          className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs cursor-pointer hover:border-sky-400 transition"
        >
          <div className="text-[11px] font-semibold text-slate-500">Total Permohonan</div>
          <div className="text-xl font-black text-slate-900 mt-1">{metrics.total}</div>
          <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
            {metrics.totalDayaKva.toLocaleString('id-ID')} kVA Terdaftar
          </div>
        </div>

        <div
          onClick={() => {
            setFilterStatus('SURVEI/RAB');
            setFilterTransaksi('PFK');
          }}
          className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl shadow-xs cursor-pointer hover:border-amber-500 transition"
        >
          <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
            <span>⚡ PFK Segera</span>
          </div>
          <div className="text-xl font-black text-amber-950 mt-1">{metrics.pfkPending}</div>
          <div className="text-[10px] text-amber-800 font-medium mt-0.5">Survei Lapangan Cepat</div>
        </div>

        <div
          onClick={() => setFilterStatus('MOHON')}
          className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl shadow-xs cursor-pointer hover:border-blue-400 transition"
        >
          <div className="text-[11px] font-semibold text-blue-900">1. Mohon (PP)</div>
          <div className="text-xl font-black text-blue-950 mt-1">{metrics.mohonPp}</div>
          <div className="text-[10px] text-blue-700 mt-0.5">Verifikasi Berkas</div>
        </div>

        <div
          onClick={() => setFilterStatus('SURVEI/RAB')}
          className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl shadow-xs cursor-pointer hover:border-amber-400 transition"
        >
          <div className="text-[11px] font-semibold text-amber-900">2. Survei / RAB</div>
          <div className="text-xl font-black text-amber-950 mt-1">{metrics.surveyTeknik}</div>
          <div className="text-[10px] text-amber-700 mt-0.5">Tiang & Gambar</div>
        </div>

        <div
          onClick={() => setFilterStatus('KERJA')}
          className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl shadow-xs cursor-pointer hover:border-purple-400 transition"
        >
          <div className="text-[11px] font-semibold text-purple-900">3. Kerja & K3L</div>
          <div className="text-xl font-black text-purple-950 mt-1">{metrics.kerjaK3l}</div>
          <div className="text-[10px] text-purple-700 mt-0.5">Working Permit</div>
        </div>

        <div
          onClick={() => setFilterStatus('NYALA')}
          className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl shadow-xs cursor-pointer hover:border-emerald-400 transition"
        >
          <div className="text-[11px] font-semibold text-emerald-900">4. Nyala (TE)</div>
          <div className="text-xl font-black text-emerald-950 mt-1">{metrics.nyalaTe}</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">Komisioning & Segel</div>
        </div>
      </div>

      {/* Toolbar: Search, Filters, View Modes & Export */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        {/* Main Controls Row: Search Bar & Filter Dropdowns */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* 1. Search Bar */}
          <div className="relative flex-1 min-w-[280px] w-full">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-sky-600 z-10 flex items-center">
              <Search className="w-4 h-4 shrink-0" />
            </div>
            <input
              type="text"
              aria-label="Cari permohonan"
              placeholder="Cari Nama Proyek/Pemohon, IDPEL (mis: 52101...), No Nodin, Status (MOHON, SURVEI, BAYAR, PDL)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:outline-hidden transition shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 flex items-center text-slate-400 hover:text-rose-600 transition z-10"
                title="Hapus pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 2. Filter Dropdowns Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Dropdown */}
            <div className="relative flex items-center">
              <label htmlFor="filter-status-select" className="sr-only">
                Filter Status Permohonan
              </label>
              <div className="absolute left-2.5 pointer-events-none text-slate-400">
                <Filter className="w-3.5 h-3.5 text-sky-700" />
              </div>
              <select
                id="filter-status-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`pl-8 pr-7 py-2 border rounded-lg text-xs font-semibold appearance-none bg-white transition cursor-pointer shadow-xs ${
                  filterStatus !== 'ALL'
                    ? 'border-sky-500 bg-sky-50 text-sky-950 ring-1 ring-sky-400'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                <option value="ALL">Status: Semua ({records.length})</option>
                <option value="MOHON">1. MOHON ({statusCounts['MOHON']})</option>
                <option value="SURVEI/RAB">2. SURVEI/RAB ({statusCounts['SURVEI/RAB']})</option>
                <option value="TANPA PERLUASAN">TANPA PERLUASAN ({statusCounts['TANPA PERLUASAN']})</option>
                <option value="BAYAR">3. BAYAR ({statusCounts['BAYAR']})</option>
                <option value="KERJA">4. KERJA ({statusCounts['KERJA']})</option>
                <option value="NYALA">5. NYALA ({statusCounts['NYALA']})</option>
                <option value="PDL">6. PDL Selesai ({statusCounts['PDL']})</option>
              </select>
              <div className="absolute right-2 pointer-events-none text-slate-400 text-[10px]">▼</div>
            </div>

            {/* Transaksi Dropdown */}
            <div className="relative flex items-center">
              <label htmlFor="filter-transaksi-select" className="sr-only">
                Filter Jenis Transaksi
              </label>
              <div className="absolute left-2.5 pointer-events-none text-slate-400">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <select
                id="filter-transaksi-select"
                value={filterTransaksi}
                onChange={(e) => setFilterTransaksi(e.target.value)}
                className={`pl-8 pr-7 py-2 border rounded-lg text-xs font-semibold appearance-none bg-white transition cursor-pointer shadow-xs ${
                  filterTransaksi !== 'ALL'
                    ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-400'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                <option value="ALL">Transaksi: Semua ({records.length})</option>
                <option value="PB">Pasang Baru (PB) ({transaksiCounts.PB})</option>
                <option value="PD">Perubahan Daya (PD) ({transaksiCounts.PD})</option>
                <option value="PFK">⚡ Khusus PFK ({transaksiCounts.PFK})</option>
              </select>
              <div className="absolute right-2 pointer-events-none text-slate-400 text-[10px]">▼</div>
            </div>

            {/* IDPEL Filter Dropdown */}
            <div className="relative flex items-center">
              <label htmlFor="filter-idpel-select" className="sr-only">
                Filter Status IDPEL
              </label>
              <div className="absolute left-2.5 pointer-events-none text-slate-400">
                <Hash className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <select
                id="filter-idpel-select"
                value={filterIdPelPresence}
                onChange={(e) => setFilterIdPelPresence(e.target.value as any)}
                className={`pl-8 pr-7 py-2 border rounded-lg text-xs font-semibold appearance-none bg-white transition cursor-pointer shadow-xs ${
                  filterIdPelPresence !== 'ALL'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-400'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                <option value="ALL">IDPEL: Semua Pelanggan</option>
                <option value="WITH_IDPEL">Sudah Ada IDPEL ({idpelCounts.withIdpel})</option>
                <option value="WITHOUT_IDPEL">Belum Ada IDPEL ({idpelCounts.withoutIdpel})</option>
              </select>
              <div className="absolute right-2 pointer-events-none text-slate-400 text-[10px]">▼</div>
            </div>

            {/* Sort Dropdown */}
            <div className="relative flex items-center">
              <label htmlFor="filter-sort-select" className="sr-only">
                Urutkan Permohonan
              </label>
              <div className="absolute left-2.5 pointer-events-none text-slate-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <select
                id="filter-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className={`pl-8 pr-7 py-2 border rounded-lg text-xs font-semibold appearance-none bg-white transition cursor-pointer shadow-xs ${
                  sortBy !== 'date_desc'
                    ? 'border-slate-600 bg-slate-100 text-slate-900 font-bold'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                <option value="date_desc">Urut: Tgl Terbaru</option>
                <option value="name_asc">Nama Proyek (A - Z)</option>
                <option value="idpel_asc">Nomor IDPEL</option>
                <option value="daya_desc">Daya Terbesar (kVA)</option>
                <option value="rab_desc">Nilai RAB Terbesar</option>
              </select>
              <div className="absolute right-2 pointer-events-none text-slate-400 text-[10px]">▼</div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-100 p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded text-xs font-semibold flex items-center gap-1 ${
                  viewMode === 'table' ? 'bg-white text-sky-800 shadow-xs' : 'text-slate-600'
                }`}
                title="Tampilan Tabel Master"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel</span>
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded text-xs font-semibold flex items-center gap-1 ${
                  viewMode === 'kanban' ? 'bg-white text-sky-800 shadow-xs' : 'text-slate-600'
                }`}
                title="Tampilan Kanban Workflow"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`p-1.5 rounded text-xs font-semibold flex items-center gap-1 ${
                  viewMode === 'map' ? 'bg-white text-sky-800 shadow-xs' : 'text-slate-600'
                }`}
                title="Tampilan Peta Titik Tiang PLN"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Peta GIS</span>
              </button>
            </div>

            {/* Export XLS */}
            <button
              onClick={handleExportXls}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 shadow-xs transition hover:border-emerald-500 hover:text-emerald-800"
              title="Unduh Data Format Microsoft Excel (.xls)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden md:inline">Export XLS</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Presets Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Filter Cepat:
            </span>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('ALL');
                setFilterTransaksi('ALL');
                setFilterIdPelPresence('ALL');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                filterStatus === 'ALL' && filterTransaksi === 'ALL' && filterIdPelPresence === 'ALL'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({records.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('SURVEI/RAB');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                filterStatus === 'SURVEI/RAB'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              Survei / RAB ({statusCounts['SURVEI/RAB']})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterTransaksi('PFK');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                filterTransaksi === 'PFK'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              ⚡ PFK ({transaksiCounts.PFK})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('NYALA');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                filterStatus === 'NYALA'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              Nyala TE ({statusCounts['NYALA']})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('PDL');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                filterStatus === 'PDL'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              Selesai PDL ({statusCounts['PDL']})
            </button>
          </div>

          {/* Result Counter & Reset Button */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Menampilkan <strong className="text-slate-900 font-bold">{filteredRecords.length}</strong> dari{' '}
              {records.length} data
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 transition"
                title="Reset semua filter dan pencarian"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-[11px] text-slate-400 font-medium">Filter aktif:</span>
            {searchTerm.trim() && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 font-semibold text-xs border border-sky-200">
                <span>Pencarian: <strong>&ldquo;{searchTerm}&rdquo;</strong></span>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="hover:text-rose-700"
                  title="Hapus pencarian ini"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterStatus !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 font-semibold text-xs border border-amber-200">
                <span>Status: <strong>{filterStatus}</strong></span>
                <button
                  type="button"
                  onClick={() => setFilterStatus('ALL')}
                  className="hover:text-rose-700"
                  title="Hapus filter status"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterTransaksi !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-950 font-semibold text-xs border border-rose-200">
                <span>Transaksi: <strong>{filterTransaksi}</strong></span>
                <button
                  type="button"
                  onClick={() => setFilterTransaksi('ALL')}
                  className="hover:text-rose-700"
                  title="Hapus filter transaksi"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterIdPelPresence !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-950 font-semibold text-xs border border-indigo-200">
                <span>IDPEL: <strong>{filterIdPelPresence === 'WITH_IDPEL' ? 'Sudah Ada IDPEL' : 'Belum Ada IDPEL'}</strong></span>
                <button
                  type="button"
                  onClick={() => setFilterIdPelPresence('ALL')}
                  className="hover:text-rose-700"
                  title="Hapus filter IDPEL"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {sortBy !== 'date_desc' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-850 font-semibold text-xs border border-slate-300">
                <span>Urutan: <strong>{sortBy}</strong></span>
                <button
                  type="button"
                  onClick={() => setSortBy('date_desc')}
                  className="hover:text-rose-700"
                  title="Kembalikan urutan default"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* VIEW 1: MASTER DATA TABLE */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase tracking-wider text-[11px] font-bold">
                  <th className="py-3 px-3">No Nodin & ID</th>
                  <th className="py-3 px-3">Status Progres</th>
                  <th className="py-3 px-3">Nama Pemohon & Alamat</th>
                  <th className="py-3 px-3">Transaksi</th>
                  <th className="py-3 px-3">Daya & Tarif</th>
                  <th className="py-3 px-3">IDPEL / Tiang</th>
                  <th className="py-3 px-3">RAB (Rp)</th>
                  <th className="py-3 px-3">K3L & TE</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-14 text-center text-slate-500">
                      <div className="max-w-md mx-auto space-y-2">
                        <div className="w-12 h-12 mx-auto bg-slate-100 text-slate-400 rounded-full flex items-center justify-center">
                          <Search className="w-6 h-6 text-slate-400" />
                        </div>
                        <div className="font-bold text-slate-800 text-sm">Tidak ada permohonan yang sesuai</div>
                        <div className="text-xs text-slate-500">
                          {searchTerm.trim() ? (
                            <>
                              Tidak ditemukan permohonan dengan kata kunci{' '}
                              <span className="font-semibold text-slate-800">&ldquo;{searchTerm}&rdquo;</span>.
                            </>
                          ) : (
                            'Tidak ada permohonan yang cocok dengan kombinasi filter yang dipilih.'
                          )}
                        </div>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset Semua Filter &amp; Pencarian</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item) => {
                    const isPfk = item.transaksi === 'PFK';
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-sky-50/60 transition ${
                          isPfk ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-mono">
                          <div className="font-bold text-slate-900">{highlightMatch(item.noNodin, searchTerm)}</div>
                          <div className="text-[10px] text-slate-400">ID: {item.id}</div>
                        </td>

                        <td className="py-3 px-3">
                          <StatusWorkflowBadge status={item.status} />
                        </td>

                        <td className="py-3 px-3 max-w-xs md:max-w-sm xl:max-w-md">
                          <div className="font-bold text-slate-900 line-clamp-1">{highlightMatch(item.projectName, searchTerm)}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            {item.alamat}
                          </div>
                          <div className="text-[10px] text-sky-800 font-medium">{item.peruntukan}</div>
                        </td>

                        <td className="py-3 px-3">
                          <TransaksiBadge transaksi={item.transaksi} />
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            {formatPowerVA(item.dayaBaru)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {item.tarif} • {item.meter}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono">
                          <div className="text-slate-900 font-semibold">{highlightMatch(item.idPel || '-', searchTerm)}</div>
                          <div className="text-[10px] text-sky-800">
                            Tiang: {item.nomorTiang || '(Belum disurvei)'}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-semibold text-slate-800">
                          {formatRupiah(item.rab)}
                        </td>

                        <td className="py-3 px-3 text-[11px]">
                          <div className="truncate text-purple-900 font-medium">
                            WP: {item.workingPermit ? '✓ Terbit' : '-'}
                          </div>
                          <div className="truncate text-emerald-900 font-medium">
                            Segel: {item.nomorSeriSegel || item.validasiSegel ? '✓ Terpasang' : '-'}
                          </div>
                          <div className="truncate text-[10px] font-semibold mt-0.5">
                            {(item.fotoMeterSebelum || item.fotoKwhMeterLama) &&
                            (item.fotoMeterSesudah || item.fotoKwhMeterBaru) &&
                            item.idPelTetangga ? (
                              <span className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                                PDL: Berkas Lengkap
                              </span>
                            ) : item.status === 'NYALA' ? (
                              <span className="text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                PDL: Menunggu Foto TE
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onSelectRecord(item)}
                              className="p-1.5 text-slate-600 hover:text-sky-800 hover:bg-slate-100 rounded-md transition"
                              title="Lihat Detail Dossier"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onOpenWorkflowAction(item)}
                              className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-md text-[11px] font-bold shadow-xs transition flex items-center gap-1"
                              title="Update Tahapan"
                            >
                              <span>Proses</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: KANBAN WORKFLOW BOARD */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 overflow-x-auto pb-4">
          {kanbanColumns.map((colStatus) => {
            const colItems = filteredRecords.filter((r) => r.status === colStatus);
            return (
              <div
                key={colStatus}
                className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 flex flex-col min-w-[240px] max-h-[750px]"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-800">{colStatus}</span>
                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-700">
                    {colItems.length}
                  </span>
                </div>

                <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                  {colItems.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 italic">Kosong</div>
                  ) : (
                    colItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onSelectRecord(item)}
                        className="p-3 bg-white border border-slate-200 hover:border-sky-400 rounded-lg shadow-xs cursor-pointer hover:shadow-sm transition space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <TransaksiBadge transaksi={item.transaksi} />
                          <span className="text-[10px] font-mono text-slate-400">{item.id}</span>
                        </div>

                        <div>
                          <div className="font-bold text-xs text-slate-900 line-clamp-2">
                            {item.projectName}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                            {item.alamat}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                          <span className="font-bold text-sky-900">{formatPowerVA(item.dayaBaru)}</span>
                          <span className="text-slate-600 font-mono text-[10px]">{item.tarif}</span>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[10px]">
                          <span className="text-slate-500">
                            Tiang: {item.nomorTiang ? item.nomorTiang.split('/')[0] : '-'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkflowAction(item);
                            }}
                            className="text-sky-700 hover:underline font-bold flex items-center"
                          >
                            Proses &gt;
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 3: GIS MAP VIEW */}
      {viewMode === 'map' && (
        <GisSurveyorMap
          records={hasActiveFilters ? filteredRecords : records}
          onSelectRecord={onSelectRecord}
          onOpenWorkflowAction={onOpenWorkflowAction}
        />
      )}
    </div>
  );
};
