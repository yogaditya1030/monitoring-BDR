import React, { useState } from 'react';
import { PermohonanItem, SurveyRabDesign, UserRole } from '../types';
import { StatusWorkflowBadge, TransaksiBadge } from './StatusWorkflowBadge';
import { TeknikSurveyRabStudio } from './TeknikSurveyRabStudio';
import { formatRupiah, formatPowerVA, formatTeStandSummary, calculateDaysSinceInput } from '../utils/plnValidation';
import {
  X,
  MapPin,
  Calendar,
  User,
  Phone,
  FileText,
  Clock,
  Wrench,
  HardHat,
  Zap,
  Users,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  Printer,
  ChevronRight,
} from 'lucide-react';

interface DetailModalProps {
  item: PermohonanItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkflowAction: (item: PermohonanItem) => void;
  onSave?: (updatedItem: PermohonanItem) => void;
  currentRole: UserRole;
}

export const PermohonanDetailModal: React.FC<DetailModalProps> = ({
  item,
  isOpen,
  onClose,
  onOpenWorkflowAction,
  onSave,
  currentRole,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ringkasan' | 'sketsa' | 'rab' | 'bundel'>('ringkasan');

  if (!isOpen || !item) return null;

  const dayInfo = calculateDaysSinceInput(item);
  const dayBadgeClass =
    dayInfo.urgency === 'completed'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
      : dayInfo.urgency === 'overdue'
      ? 'bg-rose-50 text-rose-800 border-rose-300'
      : dayInfo.urgency === 'warning'
      ? 'bg-amber-50 text-amber-900 border-amber-300'
      : 'bg-sky-50 text-sky-900 border-sky-300';

  const milestoneSteps = [
    { label: 'Registrasi Permohonan', date: item.tglSurat || item.createdAt.split('T')[0], done: true },
    {
      label: 'Survei Lapangan',
      date: item.tglSurvei,
      done:
        Boolean(item.tglSurvei || item.nomorTiang || item.nomorGardu || (item.surveyRabDesign?.nodes?.length ?? 0) > 0) ||
        ['RAB', 'TANPA PERLUASAN', 'BAYAR', 'KERJA', 'NYALA', 'PDL'].includes(item.status),
    },
    {
      label: 'Penyusunan RAB',
      date: item.tglRab || (item.rab > 0 ? item.tglSurvei : ''),
      done:
        (item.rab > 0 && item.status !== 'SURVEI' && item.status !== 'MOHON') ||
        ['TANPA PERLUASAN', 'BAYAR', 'KERJA', 'NYALA', 'PDL'].includes(item.status),
    },
    { label: 'Pembayaran BP / SIP', date: item.tglBayarBp, done: !!item.tglBayarBp || ['KERJA', 'NYALA', 'PDL'].includes(item.status) },
    { label: 'Working Permit & Eksekusi', date: item.tglWorkingPermit || item.tglKerja, done: !!item.workingPermit || ['NYALA', 'PDL'].includes(item.status) },
    { label: 'Komisioning TE & Nyala', date: item.tglPenyalaan, done: !!item.tglPenyalaan || item.status === 'PDL' },
    { label: 'Penyelesaian PDL Akhir', date: item.tglPdlUpdate, done: item.status === 'PDL' },
  ];

  const design = item.surveyRabDesign;

  const handleSaveDesignFromDetail = (
    nextDesign: SurveyRabDesign,
    grandTotalRab: number,
    summaryNotes?: string
  ) => {
    if (!onSave) return;
    const nextSt = grandTotalRab > 0 && item.status === 'SURVEI' ? 'RAB' : item.status;
    const updated: PermohonanItem = {
      ...item,
      status: nextSt,
      petugasSurvei: item.petugasSurvei || nextDesign.digambarOleh,
      rab: Number(grandTotalRab),
      keteranganPekerjaan: summaryNotes || item.keteranganPekerjaan,
      surveyRabDesign: nextDesign,
      suratPermohonanPages:
        nextDesign.suratPermohonanPages && nextDesign.suratPermohonanPages.length > 0
          ? nextDesign.suratPermohonanPages
          : item.suratPermohonanPages,
      suratPermohonanDataUrl:
        nextDesign.suratPermohonanPages?.[0] || item.suratPermohonanDataUrl,
      tglSurvei: item.tglSurvei || new Date().toISOString().split('T')[0],
      tglRab: grandTotalRab > 0 ? item.tglRab || new Date().toISOString().split('T')[0] : item.tglRab,
      updatedAt: new Date().toISOString(),
    };
    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div
        className={`bg-white rounded-xl shadow-2xl border border-slate-200 w-full ${
          activeSubTab === 'ringkasan' ? 'max-w-4xl' : 'max-w-6xl'
        } my-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-all`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-800 to-sky-950 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <TransaksiBadge transaksi={item.transaksi} />
              <h2 className="text-base sm:text-lg font-bold">{item.projectName}</h2>
            </div>
            <p className="text-xs text-sky-200 mt-1">
              No Nodin: <span className="font-mono font-bold text-amber-300">{item.noNodin}</span> | ID: {item.id}
            </p>
          </div>
          <button onClick={onClose} className="text-sky-200 hover:text-white p-1 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tab Navigation inside Dossier Detail */}
        <div className="bg-slate-100 px-6 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSubTab('ringkasan')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'ringkasan'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>1. Ringkasan &amp; Berkas</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('sketsa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'sketsa'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>
                2. Sketsa Gambar Jaringan{' '}
                {design?.nodes?.length ? `(${design.nodes.length} Titik)` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('rab')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'rab'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                3. Tabel RAB Resmi PLN{' '}
                {item.rab > 0 ? `(${formatRupiah(item.rab)})` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('bundel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'bundel'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>4. Bundel Surat, RAB &amp; Gambar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenWorkflowAction(item);
            }}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold shadow-xs transition cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Buka / Edit di Studio Survei</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {activeSubTab === 'ringkasan' && (
            <>
              {/* Status & Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <div className="text-xs text-slate-500 font-semibold mb-1">Status Progres Saat Ini:</div>
                    <StatusWorkflowBadge status={item.status} showRoleInfo={true} />
                  </div>
                  <div className="sm:border-l sm:border-slate-200 sm:pl-4">
                    <div className="text-xs text-slate-500 font-semibold mb-1">Counter Hari Sejak Input Surat:</div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold ${dayBadgeClass}`}>
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{dayInfo.fullLabel}</span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenWorkflowAction(item);
                  }}
                  className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Proses Tahap Selanjutnya ({currentRole.toUpperCase()})</span>
                </button>
              </div>

              {/* Workflow Progress Timeline */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  Tahapan Pekerjaan Terpadu (Survei &amp; RAB Terpisah)
                </h3>
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
              {milestoneSteps.map((st, i) => (
                <div
                  key={st.label}
                  className={`p-2.5 rounded-lg border text-center text-xs flex flex-col justify-between ${
                    st.done
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    {st.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-300 text-[10px] flex items-center justify-center">
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-[11px] leading-tight">{st.label}</div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    {st.date || '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grid Information Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: Customer & Contract Data */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs uppercase tracking-wide border-b border-slate-200 pb-2">
                <User className="w-4 h-4 text-sky-700" />
                Data Pelanggan & Layanan
              </h4>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Tgl Input &amp; Durasi:</span>
                <span className="col-span-2 font-mono font-bold text-sky-900">
                  {dayInfo.inputDate} ({dayInfo.shortLabel})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">ID Pelanggan (IDPEL):</span>
                <span className="col-span-2 font-mono font-bold text-slate-900">
                  {item.idPel || '(Belum Ada / Pasang Baru)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">IDPEL Tetangga:</span>
                <span className="col-span-2 font-mono text-slate-700">{item.idPelTetangga || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Nomor KTP (NIK):</span>
                <span className="col-span-2 font-mono font-bold text-slate-900">
                  {item.nomorKtp || '3308123456780001 (Terverifikasi)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Alamat Lokasi:</span>
                <span className="col-span-2 text-slate-800">{item.alamat}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Kontak Person:</span>
                <span className="col-span-2 font-mono text-sky-800 font-semibold">{item.kontakPerson || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Peruntukan:</span>
                <span className="col-span-2 text-slate-800">{item.peruntukan}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Daya & Tarif:</span>
                <span className="col-span-2 font-bold text-slate-900">
                  {formatPowerVA(item.dayaBaru)} ({item.tarif}) - {item.meter}
                </span>
              </div>
              {item.dayaLama > 0 && (
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-500">Daya Lama:</span>
                  <span className="col-span-2 text-slate-700">{formatPowerVA(item.dayaLama)}</span>
                </div>
              )}
            </div>

            {/* Box 2: Technical, Gardu, Pole & Map */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs uppercase tracking-wide border-b border-slate-200 pb-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                Data Survei Lapangan &amp; Penyusunan RAB
              </h4>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Status Survei:</span>
                <span className="col-span-2 font-bold text-amber-900">
                  {item.tglSurvei || item.nomorTiang || item.nomorGardu
                    ? `✓ Sudah Survei (${item.tglSurvei || 'Selesai'})`
                    : '⏳ Menunggu Survei Lapangan'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Petugas Survei:</span>
                <span className="col-span-2 font-medium text-slate-800">{item.petugasSurvei || '(Belum disurvei)'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Nomor Gardu PLN:</span>
                <span className="col-span-2 font-mono font-bold text-amber-950">
                  {item.nomorGardu || '(Belum terdata gardu)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Nomor Tiang PLN:</span>
                <span className="col-span-2 font-mono font-bold text-slate-900">
                  {item.nomorTiang || '(Belum tervalidasi tiang)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Taging Koordinat:</span>
                <span className="col-span-2 font-mono text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-red-500" />
                  {item.tagingLokasi || '-'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Status &amp; Nilai RAB:</span>
                <span className="col-span-2 font-bold">
                  {item.rab && item.rab > 0 ? (
                    <span className="text-emerald-800">✓ {formatRupiah(item.rab)}</span>
                  ) : (
                    <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 text-[11px]">
                      ⚠️ Belum Dibuat RAB (Rp 0)
                    </span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">No. PK Vendor:</span>
                <span className="col-span-2 font-mono text-slate-800">{item.noPkVendor || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Keterangan:</span>
                <span className="col-span-2 text-slate-800">{item.keteranganPekerjaan || '-'}</span>
              </div>
            </div>

            {/* Box 3: K3L Working Permit */}
            <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-lg space-y-2.5 text-xs">
              <h4 className="font-bold text-purple-950 flex items-center gap-1.5 text-xs uppercase tracking-wide border-b border-purple-200 pb-2">
                <HardHat className="w-4 h-4 text-purple-600" />
                Validasi K3L & Working Permit (KAM)
              </h4>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Nomor Working Permit:</span>
                <span className="col-span-2 font-mono font-bold text-purple-900">
                  {item.workingPermit || '(Belum terbit)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Status JSA / APD:</span>
                <span className="col-span-2 text-emerald-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  {item.workingPermit ? 'Sesuai Standar Keselamatan K3L' : 'Menunggu Approval K3L'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Tgl Working Permit:</span>
                <span className="col-span-2 font-mono text-slate-700">{item.tglWorkingPermit || '-'}</span>
              </div>
            </div>

            {/* Box 4: Transaksi Energi (TE) Metering & Segel */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <h4 className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  Data Meter Transaksi &amp; Segel TE
                </h4>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    (item.fotoMeterSebelum || item.fotoKwhMeterLama) &&
                    (item.fotoMeterSesudah || item.fotoKwhMeterBaru) &&
                    item.idPelTetangga
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {(item.fotoMeterSebelum || item.fotoKwhMeterLama) &&
                  (item.fotoMeterSesudah || item.fotoKwhMeterBaru) &&
                  item.idPelTetangga
                    ? '✓ Berkas PDL Lengkap'
                    : '⚠️ Berkas PDL Belum Lengkap'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-500">Nomor kWh Meter:</span>
                  <span className="col-span-2 font-mono font-bold text-emerald-950">
                    {item.nomorKwhBaru || '-'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-500">Merk &amp; Rasio CT:</span>
                  <span className="col-span-2 text-slate-800">
                    {item.merkKwh || '-'} ({item.rasioCt || 'Direct'})
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 sm:col-span-2">
                  <span className="text-slate-500">Stand Meter TE:</span>
                  <span className="col-span-2 font-mono font-bold text-emerald-900">
                    {formatTeStandSummary(item)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-500">Nomor Seri Segel:</span>
                  <span className="col-span-2 font-mono font-bold text-red-700">
                    {item.nomorSeriSegel || item.validasiSegel || '-'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-500">Nomor PDL (PP):</span>
                  <span className="col-span-2 font-mono font-bold text-sky-800">{item.nomorPdl || '-'}</span>
                </div>
              </div>

              {/* Seksi Khusus Berkas TE untuk PDL */}
              <div className="mt-3 pt-3 border-t border-emerald-200/80">
                <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                  <span>Dokumen Lapangan TE (Syarat Penerbitan PDL):</span>
                  <span className="font-mono text-slate-700">
                    IDPEL Tetangga: <strong className="text-sky-900">{item.idPelTetangga || '(Belum terdata)'}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Foto Meter Sebelum */}
                  <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                    <div className="text-[10px] font-bold text-slate-700 mb-1 truncate">
                      1. Foto Meter Sebelum
                    </div>
                    {item.fotoMeterSebelum || item.fotoKwhMeterLama ? (
                      <div className="h-16 rounded overflow-hidden border border-slate-200 bg-slate-50 mb-1">
                        <img
                          src={item.fotoMeterSebelum || item.fotoKwhMeterLama}
                          alt="Meter Sebelum"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-16 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 mb-1">
                        Belum Ada
                      </div>
                    )}
                    <span
                      className={`text-[9px] font-semibold px-1 rounded ${
                        item.fotoMeterSebelum || item.fotoKwhMeterLama
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-amber-700 bg-amber-50'
                      }`}
                    >
                      {item.fotoMeterSebelum || item.fotoKwhMeterLama ? '✓ Terlampir' : 'Wajib TE'}
                    </span>
                  </div>

                  {/* Foto Meter Sesudah */}
                  <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                    <div className="text-[10px] font-bold text-slate-700 mb-1 truncate">
                      2. Foto Meter Sesudah
                    </div>
                    {item.fotoMeterSesudah || item.fotoKwhMeterBaru ? (
                      <div className="h-16 rounded overflow-hidden border border-slate-200 bg-slate-50 mb-1">
                        <img
                          src={item.fotoMeterSesudah || item.fotoKwhMeterBaru}
                          alt="Meter Sesudah"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-16 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 mb-1">
                        Belum Ada
                      </div>
                    )}
                    <span
                      className={`text-[9px] font-semibold px-1 rounded ${
                        item.fotoMeterSesudah || item.fotoKwhMeterBaru
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-red-700 bg-red-50'
                      }`}
                    >
                      {item.fotoMeterSesudah || item.fotoKwhMeterBaru ? '✓ Terlampir' : 'Wajib TE'}
                    </span>
                  </div>

                  {/* IDPEL Tetangga Foto */}
                  <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                    <div className="text-[10px] font-bold text-slate-700 mb-1 truncate">
                      3. Foto IDPEL Tetangga
                    </div>
                    {item.fotoIdpelTetangga ? (
                      <div className="h-16 rounded overflow-hidden border border-slate-200 bg-slate-50 mb-1">
                        <img
                          src={item.fotoIdpelTetangga}
                          alt="IDPEL Tetangga"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-16 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 mb-1">
                        {item.idPelTetangga ? item.idPelTetangga : 'Belum Ada'}
                      </div>
                    )}
                    <span
                      className={`text-[9px] font-semibold px-1 rounded ${
                        item.idPelTetangga ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                      }`}
                    >
                      {item.idPelTetangga ? '✓ Terverifikasi' : 'Wajib TE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

            </>
          )}

          {/* TAB 2, 3, 4: STUDIO GAMBAR SKETSA, TABEL RAB RESMI PLN & BUNDEL DOKUMEN */}
          {(activeSubTab === 'sketsa' || activeSubTab === 'rab' || activeSubTab === 'bundel') && (
            <div className="space-y-4">
              <TeknikSurveyRabStudio
                key={`detail-studio-${item.id}-${activeSubTab}`}
                item={item}
                petugasSurvei={item.petugasSurvei || design?.digambarOleh || 'Barep Ariyanto'}
                tagingLokasi={item.tagingLokasi || '-7.6079, 110.2038'}
                nomorGardu={item.nomorGardu || ''}
                nomorTiang={item.nomorTiang || ''}
                initialDesign={design}
                defaultViewTab={
                  activeSubTab === 'sketsa'
                    ? 'etiket'
                    : activeSubTab === 'rab'
                    ? 'rab'
                    : 'pdf3hal'
                }
                onApplyRabDesign={(nextDesign, grandTotalRab, summaryNotes) => {
                  handleSaveDesignFromDetail(nextDesign, grandTotalRab, summaryNotes);
                }}
                onDirectSave={(nextDesign, grandTotalRab, summaryNotes) => {
                  handleSaveDesignFromDetail(nextDesign, grandTotalRab, summaryNotes);
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Terakhir diupdate: {new Date(item.updatedAt).toLocaleString('id-ID')}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
