import React from 'react';
import { PermohonanItem, UserRole } from '../types';
import { StatusWorkflowBadge, TransaksiBadge } from './StatusWorkflowBadge';
import { formatRupiah, formatPowerVA } from '../utils/plnValidation';
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
} from 'lucide-react';

interface DetailModalProps {
  item: PermohonanItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkflowAction: (item: PermohonanItem) => void;
  currentRole: UserRole;
}

export const PermohonanDetailModal: React.FC<DetailModalProps> = ({
  item,
  isOpen,
  onClose,
  onOpenWorkflowAction,
  currentRole,
}) => {
  if (!isOpen || !item) return null;

  const milestoneSteps = [
    { label: 'Registrasi Permohonan', date: item.tglSurat || item.createdAt.split('T')[0], done: true },
    { label: 'Survei Teknik & RAB', date: item.tglSurvei, done: !!item.tglSurvei || item.status !== 'MOHON' },
    { label: 'Pembayaran BP / SIP', date: item.tglBayarBp, done: !!item.tglBayarBp || ['KERJA', 'NYALA', 'PDL'].includes(item.status) },
    { label: 'Working Permit & Eksekusi', date: item.tglWorkingPermit || item.tglKerja, done: !!item.workingPermit || ['NYALA', 'PDL'].includes(item.status) },
    { label: 'Komisioning TE & Nyala', date: item.tglPenyalaan, done: !!item.tglPenyalaan || item.status === 'PDL' },
    { label: 'Penyelesaian PDL Akhir', date: item.tglPdlUpdate, done: item.status === 'PDL' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
          <button onClick={onClose} className="text-sky-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Status & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <div className="text-xs text-slate-500 font-semibold mb-1">Status Progres Saat Ini:</div>
              <StatusWorkflowBadge status={item.status} showRoleInfo={true} />
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
              Tahapan Pekerjaan Terpadu (SLA Monitoring)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
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

            {/* Box 2: Technical, Pole & Map */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs uppercase tracking-wide border-b border-slate-200 pb-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                Data Teknis & Jaringan Distribusi
              </h4>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Petugas Survei:</span>
                <span className="col-span-2 font-medium text-slate-800">{item.petugasSurvei || '(Belum disurvei)'}</span>
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
                <span className="text-slate-500">Nilai RAB:</span>
                <span className="col-span-2 font-bold text-emerald-800">
                  {formatRupiah(item.rab)}
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
                  <span className="text-slate-500">Merk / Stand:</span>
                  <span className="col-span-2 text-slate-800">
                    {item.merkKwh || '-'} (Stand: {item.standKwhAwal ?? 0} kWh)
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

          {/* Historical Audit Trail */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              Riwayat Perubahan & Audit Log
            </h3>
            <div className="space-y-2">
              {item.historyLogs && item.historyLogs.length > 0 ? (
                item.historyLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                      <span className="font-semibold text-slate-800">{log.actor} ({log.role.toUpperCase()})</span>
                      <span>{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="font-medium text-slate-900">{log.action}</div>
                    {log.notes && <div className="text-slate-600 text-[11px] mt-0.5">{log.notes}</div>}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded">
                  Belum ada log pergerakan tambahan.
                </div>
              )}
            </div>
          </div>
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
