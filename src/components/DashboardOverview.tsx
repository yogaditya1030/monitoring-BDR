import React, { useState, useMemo } from 'react';
import { PermohonanItem, StatusPermohonan, TransaksiType, UserRole } from '../types';
import { StatusWorkflowBadge, TransaksiBadge } from './StatusWorkflowBadge';
import { formatPowerVA, formatRupiah, calculateDaysSinceInput } from '../utils/plnValidation';
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
import { DashboardWidget } from './DashboardWidget';

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
  const [sortBy, setSortBy] = useState<'date_desc' | 'days_desc' | 'name_asc' | 'idpel_asc' | 'daya_desc' | 'rab_desc'>('date_desc');
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'map'>('table');

  // Counts for filter dropdown options
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      MOHON: 0,
      SURVEI: 0,
      RAB: 0,
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
        if (r.status !== 'SURVEI' && r.status !== 'RAB' && r.transaksi !== 'PFK') return false;
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
      if (sortBy === 'days_desc') {
        return calculateDaysSinceInput(b).days - calculateDaysSinceInput(a).days;
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
    const pfkPending = records.filter(
      (r) => r.transaksi === 'PFK' && (r.status === 'SURVEI' || r.status === 'RAB')
    ).length;
    const mohonPp = records.filter((r) => r.status === 'MOHON').length;
    const surveyTeknik = records.filter((r) => r.status === 'SURVEI').length;
    const rabTeknik = records.filter((r) => r.status === 'RAB').length;
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
      rabTeknik,
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
      'Tgl Input Surat',
      'Counter Hari (Sejak Input)',
      'Keterangan Pekerjaan',
      'Keterangan Status',
      'Keterangan Kendala',
    ];

    const rowsHtml = filteredRecords
      .map((r) => {
        const hasFotoSebelum = Boolean(r.fotoMeterSebelum || r.fotoKwhMeterLama);
        const hasFotoSesudah = Boolean(r.fotoMeterSesudah || r.fotoKwhMeterBaru);
        const hasFotoIdpelTet = Boolean(r.fotoIdpelTetangga);

        const dayInfo = calculateDaysSinceInput(r);
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
          <td style="text-align:center;">${escapeXml(dayInfo.inputDate)}</td>
          <td style="text-align:center; font-weight:bold;">${escapeXml(dayInfo.shortLabel)}</td>
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

  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const kanbanColumns: StatusPermohonan[] = [
    'MOHON',
    'SURVEI',
    'RAB',
    'TANPA PERLUASAN',
    'BAYAR',
    'KERJA',
    'NYALA',
    'PDL',
  ];

  const activeFilterCount =
    (filterStatus !== 'ALL' ? 1 : 0) +
    (filterTransaksi !== 'ALL' ? 1 : 0) +
    (filterIdPelPresence !== 'ALL' ? 1 : 0) +
    (sortBy !== 'date_desc' ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Compact Role Focus Strip (only shown when a specific department role is active) */}
      {currentRole !== 'all' && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-sky-700 text-white rounded-md shrink-0">
              {currentRole === 'security' && <Shield className="w-4 h-4" />}
              {currentRole === 'pp' && <Users className="w-4 h-4" />}
              {currentRole === 'teknik' && <Wrench className="w-4 h-4" />}
              {currentRole === 'k3l' && <HardHat className="w-4 h-4" />}
              {currentRole === 'te' && <Zap className="w-4 h-4" />}
            </div>
            <div className="text-xs text-sky-950 truncate">
              <strong className="uppercase mr-1.5">Mode {currentRole}:</strong>
              <span className="text-sky-800">
                {currentRole === 'security' && 'Pendaftaran cepat pemohon & routing otomatis PFK/PBPD.'}
                {currentRole === 'pp' && 'Verifikasi berkas permohonan, pelunasan BP & penerbitan PDL.'}
                {currentRole === 'teknik' && 'Input Nomor Gardu, Tiang, Koordinat GPS Survei & penyusunan RAB.'}
                {currentRole === 'k3l' && 'Penerbitan Working Permit (WP), validasi JSA & K3L.'}
                {currentRole === 'te' && 'Komisioning meter, Stand Bongkar/Pasang (WBP/LWBP/kVar) & berkas PDL.'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentRole === 'pp' && (
              <button
                type="button"
                onClick={() => setFilterStatus(filterStatus === 'MOHON' ? 'ALL' : 'MOHON')}
                className="px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-md text-xs font-bold transition cursor-pointer"
              >
                {filterStatus === 'MOHON' ? 'Tampilkan Semua' : 'Fokus Antrean Mohon'}
              </button>
            )}
            {currentRole === 'teknik' && (
              <button
                type="button"
                onClick={() => setFilterStatus(filterStatus === 'SURVEI' ? 'RAB' : 'SURVEI')}
                className="px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-md text-xs font-bold transition cursor-pointer"
              >
                {filterStatus === 'SURVEI' ? 'Fokus Antrean RAB' : 'Fokus Antrean Survei'}
              </button>
            )}
            {currentRole === 'k3l' && (
              <button
                type="button"
                onClick={() => setFilterStatus(filterStatus === 'KERJA' ? 'ALL' : 'KERJA')}
                className="px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-md text-xs font-bold transition cursor-pointer"
              >
                {filterStatus === 'KERJA' ? 'Tampilkan Semua' : 'Fokus Antrean Kerja/WP'}
              </button>
            )}
            {currentRole === 'te' && (
              <button
                type="button"
                onClick={() => setFilterStatus(filterStatus === 'NYALA' ? 'ALL' : 'NYALA')}
                className="px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-md text-xs font-bold transition cursor-pointer"
              >
                {filterStatus === 'NYALA' ? 'Tampilkan Semua' : 'Fokus Antrean Nyala TE'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unified Pipeline Summary & Search/Filter Toolbar */}
      <DashboardWidget
        records={records}
        selectedStatus={filterStatus}
        selectedTransaksi={filterTransaksi}
        onSelectStatus={(status) => setFilterStatus(status)}
        onSelectTransaksi={(tr) => setFilterTransaksi(tr)}
        onSelectRecord={onSelectRecord}
        toolbarSlot={
          <div className="space-y-2">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
              {/* Top Row on Mobile: Search Input + Mobile Filter Button + View Mode Toggle */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="relative flex-1 min-w-0">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-sky-600 z-10 flex items-center">
                    <Search className="w-4 h-4 shrink-0" />
                  </div>
                  <input
                    type="text"
                    aria-label="Cari permohonan"
                    placeholder="Cari Nama Pelanggan, IDPEL, Gardu, Tiang, atau No Nodin..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:outline-hidden transition"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 flex items-center text-slate-400 hover:text-rose-600 transition z-10"
                      title="Hapus pencarian"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Mobile Filter Toggle Button (< lg) */}
                <button
                  type="button"
                  onClick={() => setShowMobileFilters((prev) => !prev)}
                  aria-expanded={showMobileFilters}
                  className={`lg:hidden flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-bold shrink-0 transition cursor-pointer ${
                    showMobileFilters || activeFilterCount > 0
                      ? 'bg-sky-50 border-sky-500 text-sky-900'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-700" />
                  <span>Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-sky-700 text-white text-[10px]">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* View Mode Toggle */}
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-100 p-0.5 shrink-0">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-2 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                      viewMode === 'table' ? 'bg-white text-sky-800 shadow-2xs' : 'text-slate-600'
                    }`}
                    title="Tampilan Daftar / Tabel"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Daftar</span>
                  </button>
                  <button
                    onClick={() => setViewMode('kanban')}
                    className={`px-2 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                      viewMode === 'kanban' ? 'bg-white text-sky-800 shadow-2xs' : 'text-slate-600'
                    }`}
                    title="Tampilan Kanban Workflow"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Kanban</span>
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`px-2 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                      viewMode === 'map' ? 'bg-white text-sky-800 shadow-2xs' : 'text-slate-600'
                    }`}
                    title="Tampilan Peta Titik Tiang PLN"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Peta GIS</span>
                  </button>
                </div>
              </div>

              {/* Filter Dropdowns Group (Always visible on lg+, collapsible on mobile) */}
              <div
                className={`${
                  showMobileFilters ? 'flex' : 'hidden lg:flex'
                } flex-wrap items-center gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/80 shrink-0`}
              >
                {/* Status Dropdown */}
                <div className="relative flex items-center">
                  <label htmlFor="filter-status-select" className="sr-only">
                    Filter Status Permohonan
                  </label>
                  <div className="absolute left-2 pointer-events-none text-slate-400">
                    <Filter className="w-3.5 h-3.5 text-sky-700" />
                  </div>
                  <select
                    id="filter-status-select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={`pl-6.5 pr-4.5 py-1.5 h-9 border rounded-lg text-[11px] font-semibold appearance-none bg-white transition cursor-pointer ${
                      filterStatus !== 'ALL'
                        ? 'border-sky-500 bg-sky-50 text-sky-950 ring-1 ring-sky-400'
                        : 'border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <option value="ALL">Status: Semua ({records.length})</option>
                    <option value="MOHON">1. MOHON ({statusCounts['MOHON']})</option>
                    <option value="SURVEI">2. SURVEI ({statusCounts['SURVEI']})</option>
                    <option value="RAB">3. RAB ({statusCounts['RAB']})</option>
                    <option value="TANPA PERLUASAN">TANPA PERLUASAN ({statusCounts['TANPA PERLUASAN']})</option>
                    <option value="BAYAR">4. BAYAR ({statusCounts['BAYAR']})</option>
                    <option value="KERJA">5. KERJA ({statusCounts['KERJA']})</option>
                    <option value="NYALA">6. NYALA ({statusCounts['NYALA']})</option>
                    <option value="PDL">7. PDL Selesai ({statusCounts['PDL']})</option>
                  </select>
                  <div className="absolute right-1.5 pointer-events-none text-slate-400 text-[9px]">▼</div>
                </div>

                {/* Transaksi Dropdown */}
                <div className="relative flex items-center">
                  <label htmlFor="filter-transaksi-select" className="sr-only">
                    Filter Jenis Transaksi
                  </label>
                  <div className="absolute left-2 pointer-events-none text-slate-400">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <select
                    id="filter-transaksi-select"
                    value={filterTransaksi}
                    onChange={(e) => setFilterTransaksi(e.target.value)}
                    className={`pl-6.5 pr-4.5 py-1.5 h-9 border rounded-lg text-[11px] font-semibold appearance-none bg-white transition cursor-pointer ${
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
                  <div className="absolute right-1.5 pointer-events-none text-slate-400 text-[9px]">▼</div>
                </div>

                {/* IDPEL Filter Dropdown */}
                <div className="relative flex items-center">
                  <label htmlFor="filter-idpel-select" className="sr-only">
                    Filter Status IDPEL
                  </label>
                  <div className="absolute left-2 pointer-events-none text-slate-400">
                    <Hash className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <select
                    id="filter-idpel-select"
                    value={filterIdPelPresence}
                    onChange={(e) => setFilterIdPelPresence(e.target.value as any)}
                    className={`pl-6.5 pr-4.5 py-1.5 h-9 border rounded-lg text-[11px] font-semibold appearance-none bg-white transition cursor-pointer ${
                      filterIdPelPresence !== 'ALL'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-400'
                        : 'border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <option value="ALL">IDPEL: Semua</option>
                    <option value="WITH_IDPEL">Ada IDPEL ({idpelCounts.withIdpel})</option>
                    <option value="WITHOUT_IDPEL">Belum IDPEL ({idpelCounts.withoutIdpel})</option>
                  </select>
                  <div className="absolute right-1.5 pointer-events-none text-slate-400 text-[9px]">▼</div>
                </div>

                {/* Sort Dropdown */}
                <div className="relative flex items-center">
                  <label htmlFor="filter-sort-select" className="sr-only">
                    Urutkan Permohonan
                  </label>
                  <div className="absolute left-2 pointer-events-none text-slate-400">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <select
                    id="filter-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className={`pl-6.5 pr-4.5 py-1.5 h-9 border rounded-lg text-[11px] font-semibold appearance-none bg-white transition cursor-pointer ${
                      sortBy !== 'date_desc'
                        ? 'border-slate-600 bg-slate-100 text-slate-900 font-bold'
                        : 'border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <option value="date_desc">Urut: Terbaru</option>
                    <option value="days_desc">Durasi Hari Terlama</option>
                    <option value="name_asc">Nama (A - Z)</option>
                    <option value="idpel_asc">Nomor IDPEL</option>
                    <option value="daya_desc">Daya Terbesar</option>
                    <option value="rab_desc">RAB Terbesar</option>
                  </select>
                  <div className="absolute right-1.5 pointer-events-none text-slate-400 text-[9px]">▼</div>
                </div>

                {/* Export XLS */}
                <button
                  onClick={handleExportXls}
                  className="flex items-center gap-1 px-2.5 h-9 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 transition hover:border-emerald-500 hover:text-emerald-800 cursor-pointer"
                  title="Unduh Data Format Microsoft Excel (.xls)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export XLS</span>
                </button>
              </div>
            </div>

            {/* Compact Active Filter Summary Row (Only shown when filters/search are active) */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/80 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">
                    Menampilkan <strong className="text-slate-900">{filteredRecords.length}</strong> dari {records.length} data:
                  </span>
                  {searchTerm.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-900 font-semibold text-[11px] border border-sky-200 hover:bg-sky-100 cursor-pointer"
                    >
                      <span>Cari: &ldquo;{searchTerm}&rdquo;</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {filterStatus !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setFilterStatus('ALL')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-950 font-semibold text-[11px] border border-amber-200 hover:bg-amber-100 cursor-pointer"
                    >
                      <span>Status: {filterStatus}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {filterTransaksi !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setFilterTransaksi('ALL')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-950 font-semibold text-[11px] border border-rose-200 hover:bg-rose-100 cursor-pointer"
                    >
                      <span>Transaksi: {filterTransaksi}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filter</span>
                </button>
              </div>
            )}
          </div>
        }
      />

      {/* VIEW 1: MASTER DATA (MOBILE CARD VIEW + DESKTOP TABLE) */}
      {viewMode === 'table' && (
        <>
          {/* A. MOBILE CARD LIST (< md) — Thumb-friendly for field officers */}
          <div className="md:hidden space-y-2.5">
            {filteredRecords.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <div className="font-bold text-slate-800 text-sm">Tidak ada permohonan yang sesuai</div>
                <p className="text-xs text-slate-500">
                  Coba ubah kata kunci pencarian atau reset filter yang aktif.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 text-white rounded-lg text-xs font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              </div>
            ) : (
              filteredRecords.map((item) => {
                const isPfk = item.transaksi === 'PFK';
                const dayInfo = calculateDaysSinceInput(item);
                const dayBadgeClass =
                  dayInfo.urgency === 'completed'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : dayInfo.urgency === 'overdue'
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : dayInfo.urgency === 'warning'
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-sky-50 text-sky-900 border-sky-200';

                return (
                  <div
                    key={`mobile-${item.id}`}
                    className={`bg-white border rounded-xl p-3.5 shadow-xs space-y-2.5 ${
                      isPfk ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                    }`}
                  >
                    {/* Row 1: Transaksi + No Nodin + Day Counter + Status */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TransaksiBadge transaksi={item.transaksi} />
                        <span className="font-mono text-[11px] font-bold text-slate-700 truncate">
                          {highlightMatch(item.noNodin, searchTerm)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${dayBadgeClass}`}
                          title={dayInfo.fullLabel}
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{dayInfo.shortLabel}</span>
                        </span>
                        <StatusWorkflowBadge status={item.status} />
                      </div>
                    </div>

                    {/* Row 2: Project Name & Address */}
                    <div>
                      <div className="font-bold text-sm text-slate-900 leading-snug">
                        {highlightMatch(item.projectName, searchTerm)}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 line-clamp-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{item.alamat}</span>
                      </div>
                    </div>

                    {/* Row 3: Compact 2-Column Field Data */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Daya &amp; Tarif</span>
                        <span className="font-bold text-slate-900">{formatPowerVA(item.dayaBaru)}</span>
                        <span className="text-[11px] text-slate-500 block">{item.tarif} • {item.meter}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Gardu / Tiang / IDPEL</span>
                        <span className="font-mono font-semibold text-slate-800 block truncate">
                          {item.nomorGardu ? `Gardu: ${item.nomorGardu}` : `IDPEL: ${item.idPel || '-'}`}
                        </span>
                        <span className="font-mono text-[11px] text-sky-800 block truncate">
                          Tiang: {item.nomorTiang || 'Belum survei'}
                        </span>
                      </div>
                    </div>

                    {/* Row 4: RAB Status & Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="text-xs">
                        <span className="text-[10px] text-slate-400 block">Nilai RAB</span>
                        {item.rab && item.rab > 0 ? (
                          <span className="font-bold text-slate-900">{formatRupiah(item.rab)}</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-800">
                            {item.status === 'SURVEI' ? 'Belum Buat RAB' : 'Rp 0'}
                          </span>
                        )}
                        {item.surveyRabDesign && (item.surveyRabDesign.nodes?.length || 0) > 0 && (
                          <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 mt-0.5">
                            ✓ Sketsa ({item.surveyRabDesign.nodes.length} Titik)
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectRecord(item)}
                          className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detail</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenWorkflowAction(item)}
                          className="px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <span>Proses</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* B. DESKTOP TABLE VIEW (md+) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase tracking-wider text-[11px] font-bold">
                    <th className="py-3 px-3">No Nodin &amp; Durasi Hari</th>
                    <th className="py-3 px-3">Status Progres</th>
                    <th className="py-3 px-3">Nama Pemohon &amp; Alamat</th>
                    <th className="py-3 px-3">Transaksi</th>
                    <th className="py-3 px-3">Daya &amp; Tarif</th>
                    <th className="py-3 px-3">IDPEL / Tiang</th>
                    <th className="py-3 px-3">RAB (Rp)</th>
                    <th className="py-3 px-3">K3L &amp; TE</th>
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
                      const dayInfo = calculateDaysSinceInput(item);
                      const dayBadgeClass =
                        dayInfo.urgency === 'completed'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : dayInfo.urgency === 'overdue'
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : dayInfo.urgency === 'warning'
                          ? 'bg-amber-50 text-amber-900 border-amber-300'
                          : 'bg-sky-50 text-sky-900 border-sky-200';

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-sky-50/60 transition ${
                            isPfk ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-slate-900">{highlightMatch(item.noNodin, searchTerm)}</div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${dayBadgeClass}`}
                                title={dayInfo.fullLabel}
                              >
                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                <span>{dayInfo.shortLabel}</span>
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Input: {dayInfo.inputDate}
                            </div>
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
                            {item.nomorGardu && (
                              <div className="text-[10px] font-bold text-amber-800">
                                Gardu: {highlightMatch(item.nomorGardu, searchTerm)}
                              </div>
                            )}
                            <div className="text-[10px] text-sky-800">
                              Tiang: {item.nomorTiang || '(Belum disurvei)'}
                            </div>
                          </td>

                          <td className="py-3 px-3 font-semibold text-slate-800">
                            <div>{formatRupiah(item.rab)}</div>
                            {item.surveyRabDesign && (item.surveyRabDesign.nodes?.length || 0) > 0 ? (
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                                ✓ Sketsa &amp; RAB ({item.surveyRabDesign.nodes.length} Titik)
                              </div>
                            ) : (!item.rab || item.rab === 0) ? (
                              <div className="text-[10px] font-semibold text-amber-800 mt-0.5">
                                {item.status === 'SURVEI' ? '⏳ Menunggu Data Survei' : 'Belum Ada RAB'}
                              </div>
                            ) : null}
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
                                <span className="text-emerald-700">
                                  PDL: Berkas Lengkap
                                </span>
                              ) : item.status === 'NYALA' ? (
                                <span className="text-amber-800">
                                  PDL: Menunggu Foto TE
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => onSelectRecord(item)}
                                className="p-1.5 text-slate-600 hover:text-sky-800 hover:bg-slate-100 rounded-md transition cursor-pointer"
                                title="Lihat Detail Dossier"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onOpenWorkflowAction(item)}
                                className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-md text-[11px] font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
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
        </>
      )}

      {/* VIEW 2: KANBAN WORKFLOW BOARD */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-3 overflow-x-auto pb-4">
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
                    colItems.map((item) => {
                      const dayInfo = calculateDaysSinceInput(item);
                      return (
                        <div
                          key={item.id}
                          onClick={() => onSelectRecord(item)}
                          className="p-3 bg-white border border-slate-200 hover:border-sky-400 rounded-lg shadow-xs cursor-pointer hover:shadow-sm transition space-y-2"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <TransaksiBadge transaksi={item.transaksi} />
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                dayInfo.urgency === 'completed'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : dayInfo.urgency === 'overdue'
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : dayInfo.urgency === 'warning'
                                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                                  : 'bg-sky-50 text-sky-900 border-sky-200'
                              }`}
                              title={dayInfo.fullLabel}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{dayInfo.shortLabel}</span>
                            </span>
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
                      );
                    })
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
