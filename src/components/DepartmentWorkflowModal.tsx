import React, { useState } from 'react';
import { PermohonanItem, StatusPermohonan, SurveyRabDesign, UserRole } from '../types';
import { getTeStandFormConfig } from '../utils/plnValidation';
import { TeknikSurveyRabStudio } from './TeknikSurveyRabStudio';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  HardHat,
  Wrench,
  Zap,
  Users,
  MapPin,
  Camera,
  FileCheck,
  ShieldCheck,
  ArrowRight,
  Upload,
  Trash2,
  Gauge,
} from 'lucide-react';

interface DepartmentWorkflowModalProps {
  item: PermohonanItem;
  currentRole: UserRole;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: PermohonanItem) => void;
}

export const DepartmentWorkflowModal: React.FC<DepartmentWorkflowModalProps> = ({
  item,
  currentRole,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  // Active sub-tab depending on role or item status
  const defaultTab =
    currentRole === 'teknik'
      ? 'teknik'
      : currentRole === 'k3l'
      ? 'k3l'
      : currentRole === 'te'
      ? 'te'
      : currentRole === 'pp'
      ? 'pp'
      : item.status === 'MOHON'
      ? 'pp'
      : item.status === 'SURVEI' || item.status === 'RAB'
      ? 'teknik'
      : item.status === 'BAYAR' || item.status === 'KERJA'
      ? 'k3l'
      : item.status === 'NYALA'
      ? 'te'
      : 'pp';

  const [activeTab, setActiveTab] = useState<'pp' | 'teknik' | 'k3l' | 'te'>(defaultTab as any);

  // Form State - Teknik
  const [petugasSurvei, setPetugasSurvei] = useState(item.petugasSurvei || '');
  const [nomorGardu, setNomorGardu] = useState(item.nomorGardu || '');
  const [nomorTiang, setNomorTiang] = useState(item.nomorTiang || '');
  const [tagingLokasi, setTagingLokasi] = useState(item.tagingLokasi || '-7.6079, 110.2038');
  const [rab, setRab] = useState(item.rab || 0);
  const [noPkVendor, setNoPkVendor] = useState(item.noPkVendor || '');
  const [keteranganPekerjaan, setKeteranganPekerjaan] = useState(item.keteranganPekerjaan || '');
  const [surveyRabDesign, setSurveyRabDesign] = useState<SurveyRabDesign | undefined>(item.surveyRabDesign);

  React.useEffect(() => {
    setPetugasSurvei(item.petugasSurvei || '');
    setNomorGardu(item.nomorGardu || '');
    setNomorTiang(item.nomorTiang || '');
    setTagingLokasi(item.tagingLokasi || '-7.6079, 110.2038');
    setRab(item.rab || 0);
    setNoPkVendor(item.noPkVendor || '');
    setKeteranganPekerjaan(item.keteranganPekerjaan || '');
    setSurveyRabDesign(item.surveyRabDesign);
    setNextStatus(item.status);
  }, [item.id, item.tagingLokasi]);

  // Form State - K3L
  const [workingPermit, setWorkingPermit] = useState(item.workingPermit || `WP-K3L-${new Date().getFullYear()}-${item.id.slice(0, 4).toUpperCase()}`);
  const [apdChecklist, setApdChecklist] = useState({
    helm: true,
    sarungTangan: true,
    sepatuIsolasi: true,
    fullBodyHarness: true,
    safetyCone: true,
  });

  // Form State - Transaksi Energi (TE)
  const [tarif, setTarif] = useState(item.tarif || 'B-2/TR');
  const [nomorKwhBaru, setNomorKwhBaru] = useState(item.nomorKwhBaru || `0142${Math.floor(1000000 + Math.random() * 9000000)}`);
  const [merkKwh, setMerkKwh] = useState(item.merkKwh || 'ITRON 3P ELECT');
  const [rasioCt, setRasioCt] = useState(item.rasioCt || 'Langsung (Direct)');
  const [nomorSeriSegel, setNomorSeriSegel] = useState(item.nomorSeriSegel || `PLN-TE-JTG-${Math.floor(10000 + Math.random() * 90000)}`);

  // Stand Bongkar (Khusus Perubahan Daya / PD)
  const [standBongkar, setStandBongkar] = useState<number>(item.standBongkar ?? 0);
  const [standBongkarWbp, setStandBongkarWbp] = useState<number>(item.standBongkarWbp ?? 0);
  const [standBongkarLwbp, setStandBongkarLwbp] = useState<number>(item.standBongkarLwbp ?? 0);
  const [standBongkarKvar, setStandBongkarKvar] = useState<number>(item.standBongkarKvar ?? 0);

  // Stand Pasang (Untuk Pasang Baru / PB & Perubahan Daya / PD)
  const [standPasang, setStandPasang] = useState<number>(
    item.standPasang !== undefined ? item.standPasang : item.standKwhAwal !== undefined ? item.standKwhAwal : 0
  );
  const [standPasangWbp, setStandPasangWbp] = useState<number>(item.standPasangWbp ?? 0);
  const [standPasangLwbp, setStandPasangLwbp] = useState<number>(item.standPasangLwbp ?? 0);
  const [standPasangKvar, setStandPasangKvar] = useState<number>(item.standPasangKvar ?? 0);

  const teStandConfig = getTeStandFormConfig(item.transaksi, tarif);

  // Syarat PDL dari Tim TE: Foto Meter Sebelum, Foto Meter Sesudah, dan IDPEL Tetangga
  const [idPelTetangga, setIdPelTetangga] = useState(item.idPelTetangga || '');
  const [fotoMeterSebelum, setFotoMeterSebelum] = useState(item.fotoMeterSebelum || item.fotoKwhMeterLama || '');
  const [fotoMeterSesudah, setFotoMeterSesudah] = useState(item.fotoMeterSesudah || item.fotoKwhMeterBaru || '');
  const [fotoIdpelTetangga, setFotoIdpelTetangga] = useState(item.fotoIdpelTetangga || '');

  // Form State - PP
  const [nomorPdl, setNomorPdl] = useState(item.nomorPdl || `PDL-5215-${new Date().getFullYear()}-${item.id.slice(0, 4).toUpperCase()}`);
  const [statusBayar, setStatusBayar] = useState(!!item.tglBayarBp);

  // Target Status Selector
  const [nextStatus, setNextStatus] = useState<StatusPermohonan>(item.status);
  const [actionNotes, setActionNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Mock SVGs for demo testing
  const MOCK_METER_SEBELUM = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23f1f5f9"/><rect x="40" y="30" width="220" height="140" rx="8" fill="%23334155"/><rect x="70" y="55" width="160" height="50" rx="4" fill="%231e293b"/><text x="150" y="86" fill="%2338bdf8" font-family="monospace" font-size="20" font-weight="bold" text-anchor="middle">04891.2 kWh</text><text x="150" y="145" fill="%2394a3b8" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">FOTO METER SEBELUM (EKSISTING)</text></svg>';
  const MOCK_METER_SESUDAH = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23ecfdf5"/><rect x="40" y="30" width="220" height="140" rx="8" fill="%23065f46"/><rect x="70" y="55" width="160" height="50" rx="4" fill="%23047857"/><text x="150" y="86" fill="%2334d399" font-family="monospace" font-size="20" font-weight="bold" text-anchor="middle">00000.0 kWh</text><circle cx="215" cy="140" r="10" fill="%23dc2626"/><text x="135" y="145" fill="%23d1fae5" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">METER SESUDAH (TERSEGEL TE)</text></svg>';
  const MOCK_IDPEL_TETANGGA = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23eff6ff"/><rect x="40" y="30" width="220" height="140" rx="8" fill="%231e3a8a"/><rect x="60" y="55" width="180" height="60" rx="4" fill="%23ffffff"/><text x="150" y="80" fill="%231e40af" font-family="monospace" font-size="15" font-weight="bold" text-anchor="middle">IDPEL TETANGGA</text><text x="150" y="102" fill="%231e40af" font-family="monospace" font-size="14" font-weight="bold" text-anchor="middle">5215 4188 9010</text><text x="150" y="148" fill="%2393c5fd" font-family="sans-serif" font-size="10" text-anchor="middle">VERIFIKASI TOPOLOGI GARDU</text></svg>';

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyAction = () => {
    setValidationError(null);

    const updated: PermohonanItem = {
      ...item,
      status: nextStatus,
      tarif,
      petugasSurvei,
      nomorGardu: nomorGardu.trim(),
      nomorTiang: nomorTiang.trim(),
      tagingLokasi,
      rab: Number(rab),
      noPkVendor,
      keteranganPekerjaan,
      surveyRabDesign,
      workingPermit: activeTab === 'k3l' ? workingPermit : item.workingPermit,
      nomorKwhBaru,
      merkKwh,
      standKwhAwal: teStandConfig.isIndustri
        ? Number(standPasangWbp) + Number(standPasangLwbp)
        : Number(standPasang),
      standBongkar: teStandConfig.showStandBongkar ? Number(standBongkar) : undefined,
      standBongkarWbp: teStandConfig.showStandBongkar && teStandConfig.isIndustri ? Number(standBongkarWbp) : undefined,
      standBongkarLwbp: teStandConfig.showStandBongkar && teStandConfig.isIndustri ? Number(standBongkarLwbp) : undefined,
      standBongkarKvar: teStandConfig.showStandBongkar && teStandConfig.isIndustri ? Number(standBongkarKvar) : undefined,
      standPasang: Number(standPasang),
      standPasangWbp: teStandConfig.isIndustri ? Number(standPasangWbp) : undefined,
      standPasangLwbp: teStandConfig.isIndustri ? Number(standPasangLwbp) : undefined,
      standPasangKvar: teStandConfig.isIndustri ? Number(standPasangKvar) : undefined,
      rasioCt,
      nomorSeriSegel,
      validasiSegel: nomorSeriSegel ? 'TERSEGEL RESMI TE' : item.validasiSegel,
      // Syarat PDL
      idPelTetangga: idPelTetangga.trim(),
      fotoMeterSebelum,
      fotoMeterSesudah,
      fotoIdpelTetangga,
      fotoKwhMeterLama: fotoMeterSebelum,
      fotoKwhMeterBaru: fotoMeterSesudah,
      nomorPdl,
      tglBayarBp: statusBayar ? item.tglBayarBp || new Date().toISOString().split('T')[0] : item.tglBayarBp,
      tglSurvei:
        activeTab === 'teknik' && (nextStatus === 'SURVEI' || nextStatus === 'RAB' || petugasSurvei || nomorTiang || nomorGardu)
          ? item.tglSurvei || new Date().toISOString().split('T')[0]
          : item.tglSurvei,
      tglRab:
        activeTab === 'teknik' && (nextStatus === 'RAB' || Number(rab) > 0)
          ? item.tglRab || new Date().toISOString().split('T')[0]
          : item.tglRab,
      tglWorkingPermit: activeTab === 'k3l' ? new Date().toISOString().split('T')[0] : item.tglWorkingPermit,
      tglPenyalaan: nextStatus === 'NYALA' ? new Date().toISOString().split('T')[0] : item.tglPenyalaan,
      tglPdlUpdate: nextStatus === 'PDL' ? new Date().toISOString().split('T')[0] : item.tglPdlUpdate,
      updatedAt: new Date().toISOString(),
      historyLogs: [
        ...item.historyLogs,
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: `Petugas Bagian ${activeTab.toUpperCase()}`,
          role: activeTab as UserRole,
          action: `Pembaruan Tahap (${activeTab.toUpperCase()}) -> Status ${nextStatus}`,
          notes: actionNotes || `Update data teknis & validasi kelengkapan berkas TE ${activeTab.toUpperCase()}`,
        },
      ],
    };

    // Validasi aturan SOP PDL jika status diarahkan ke PDL
    if (nextStatus === 'PDL') {
      const hasSebelum = Boolean(updated.fotoMeterSebelum);
      const hasSesudah = Boolean(updated.fotoMeterSesudah);
      const hasIdpelTet = Boolean(updated.idPelTetangga && updated.idPelTetangga.trim() !== '');

      if (!hasSebelum || !hasSesudah || !hasIdpelTet) {
        const missing: string[] = [];
        if (!hasSebelum) missing.push('Foto Meter Sebelum');
        if (!hasSesudah) missing.push('Foto Meter Sesudah');
        if (!hasIdpelTet) missing.push('IDPEL Tetangga');
        setValidationError(
          `Untuk keperluan PDL, tim Transaksi Energi (TE) wajib mengirimkan: ${missing.join(', ')}. Silakan lengkapi pada tab Transaksi Energi (TE) terlebih dahulu.`
        );
        return;
      }
    }

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 bg-slate-950/60 backdrop-blur-xs overflow-hidden">
      <div
        className={`bg-white rounded-xl shadow-2xl border border-slate-200 w-full ${
          activeTab === 'teknik' ? 'max-w-6xl' : 'max-w-4xl'
        } max-h-[96vh] sm:max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-all`}
      >
        {/* Header */}
        <div className="shrink-0 bg-sky-900 text-white px-3.5 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold uppercase shrink-0">
                {item.transaksi}
              </span>
              <h2 className="text-sm sm:text-lg font-bold truncate">{item.projectName}</h2>
            </div>
            <p className="text-[11px] sm:text-xs text-sky-200 mt-0.5 truncate">
              No Nodin: {item.noNodin} | Daya: {item.dayaBaru.toLocaleString('id-ID')} VA ({tarif}) | Status Saat Ini: {item.status}
            </p>
          </div>
          <button onClick={onClose} className="text-sky-200 hover:text-white p-1.5 rounded-lg shrink-0 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Department Tabs */}
        <div className="shrink-0 flex border-b border-slate-200 bg-slate-50 px-2.5 sm:px-6 pt-2 gap-1.5 overflow-x-auto flex-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab('pp')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'pp'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Pelayanan Pelanggan (PP)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('teknik')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'teknik'
                ? 'border-amber-600 text-amber-800 bg-white rounded-t-lg shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>2. Teknik (Survei Peta GIS &amp; RAB)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('k3l')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'k3l'
                ? 'border-purple-600 text-purple-800 bg-white rounded-t-lg shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HardHat className="w-3.5 h-3.5" />
            <span>3. K3L (Working Permit)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('te')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'te'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>4. Transaksi Energi (TE)</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 p-2.5 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4">
          {/* TAB 1: PP */}
          {activeTab === 'pp' && (
            <div className="space-y-4">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
                <strong>Tugas Pelayanan Pelanggan (PP):</strong> Verifikasi berkas permohonan, cek kelayakan tarif, penyesuaian biaya BP/UJL, monitoring pembayaran, dan penerbitan nomor PDL (Perubahan Data Langganan).
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor PDL (Perubahan Data Langganan)
                  </label>
                  <input
                    type="text"
                    value={nomorPdl}
                    onChange={(e) => setNomorPdl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    placeholder="PDL-5215-..."
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={statusBayar}
                      onChange={(e) => setStatusBayar(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600"
                    />
                    <span>Biaya Penyambungan (BP) Telah Lunas Diterima</span>
                  </label>
                </div>
              </div>

              {/* Status Berkas TE untuk Keperluan PDL */}
              <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-sky-950">
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-sky-700" />
                    Status Kelengkapan Berkas TE untuk Penerbitan PDL:
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      fotoMeterSebelum && fotoMeterSesudah && idPelTetangga
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {fotoMeterSebelum && fotoMeterSesudah && idPelTetangga
                      ? '✓ Siap Terbit PDL'
                      : '⚠️ Belum Lengkap Dari TE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                  <div
                    className={`p-2 rounded border flex items-center gap-1.5 ${
                      fotoMeterSebelum
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className={fotoMeterSebelum ? 'text-emerald-600 font-bold' : ''}>
                      {fotoMeterSebelum ? '✓' : '•'}
                    </span>
                    <span>Foto Meter Sebelum</span>
                  </div>

                  <div
                    className={`p-2 rounded border flex items-center gap-1.5 ${
                      fotoMeterSesudah
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className={fotoMeterSesudah ? 'text-emerald-600 font-bold' : ''}>
                      {fotoMeterSesudah ? '✓' : '•'}
                    </span>
                    <span>Foto Meter Sesudah</span>
                  </div>

                  <div
                    className={`p-2 rounded border flex items-center gap-1.5 ${
                      idPelTetangga
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className={idPelTetangga ? 'text-emerald-600 font-bold' : ''}>
                      {idPelTetangga ? '✓' : '•'}
                    </span>
                    <span className="truncate">
                      {idPelTetangga ? `IDPEL Tetangga: ${idPelTetangga}` : 'IDPEL Tetangga'}
                    </span>
                  </div>
                </div>

                {!(fotoMeterSebelum && fotoMeterSesudah && idPelTetangga) && (
                  <p className="text-[11px] text-amber-800 italic pt-1">
                    * Catatan: Sesuai SOP, PDL hanya dapat diterbitkan setelah Tim Transaksi Energi (TE) mengirimkan Foto Meter Sebelum, Sesudah, dan IDPEL Tetangga.
                  </p>
                )}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div><strong>Berkas Surat Permohonan:</strong> {item.suratPermohonan || 'Tersimpan'}</div>
                <div><strong>ID Pelanggan (IDPEL):</strong> {item.idPel || '(Belum Ada - Pasang Baru)'}</div>
                <div><strong>Tarif & Daya:</strong> {tarif} - {item.dayaBaru.toLocaleString('id-ID')} VA</div>
              </div>
            </div>
          )}

          {/* TAB 2: TEKNIK (SURVEI & RAB DIPISAH + FORM NOMOR GARDU) */}
          {activeTab === 'teknik' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>Alur Teknik (PBPD &amp; PFK):</strong> Proses <strong>Survei Lapangan</strong> dan <strong>Penyusunan RAB</strong> dipisahkan agar permohonan yang sudah disurvei namun belum dibuat RAB-nya tercatat akurat.
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNextStatus('SURVEI')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold border transition cursor-pointer ${
                      nextStatus === 'SURVEI'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    📐 Set Tahap: SURVEI
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextStatus('RAB')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold border transition cursor-pointer ${
                      nextStatus === 'RAB'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-white text-indigo-900 border-indigo-300 hover:bg-indigo-100'
                    }`}
                  >
                    🧮 Set Tahap: RAB
                  </button>
                </div>
              </div>

              {/* Data Survei Lapangan Teknik */}
              <div className="p-3.5 bg-amber-50/40 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                    <span>📐 Data Survei Lapangan Teknik (Status: SURVEI)</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    {nomorGardu && nomorTiang && petugasSurvei ? '✓ Sudah Survei Lengkap' : '⏳ Menunggu Data Survei'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Petugas Survei Teknik *
                    </label>
                    <input
                      type="text"
                      required
                      value={petugasSurvei}
                      onChange={(e) => setPetugasSurvei(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                      placeholder="Contoh: Bambang Kusuma"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Gardu Distribusi PLN *
                    </label>
                    <input
                      type="text"
                      required
                      value={nomorGardu}
                      onChange={(e) => setNomorGardu(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-amber-400 focus:border-amber-600 rounded-lg text-sm font-mono font-bold text-amber-950"
                      placeholder="Contoh: GD-BBD-018 / GD-MKD-042"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Tiang Distribusi Terdekat *
                    </label>
                    <input
                      type="text"
                      required
                      value={nomorTiang}
                      onChange={(e) => setNomorTiang(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono"
                      placeholder="Contoh: MKD-TR-042/12"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Taging Koordinat GPS (Latitude, Longitude)
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={tagingLokasi}
                        onChange={(e) => setTagingLokasi(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono"
                        placeholder="-7.5812, 110.2319"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hasil Survei / Keterangan Pekerjaan Lapangan
                    </label>
                    <input
                      type="text"
                      value={keteranganPekerjaan}
                      onChange={(e) => setKeteranganPekerjaan(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                      placeholder="Penarikan SR 3 Phasa, pasang trafo sisip..."
                    />
                  </div>
                </div>
              </div>

              {/* Studio Gambar Survei Peta GIS & Generator RAB Otomatis */}
              <TeknikSurveyRabStudio
                item={item}
                petugasSurvei={petugasSurvei}
                onUpdatePetugasSurvei={(name) => setPetugasSurvei(name)}
                tagingLokasi={tagingLokasi}
                nomorGardu={nomorGardu}
                nomorTiang={nomorTiang}
                initialDesign={surveyRabDesign}
                onApplyRabDesign={(design, grandTotalRab, summaryNotes) => {
                  setSurveyRabDesign(design);
                  setRab(grandTotalRab);
                  if (grandTotalRab > 0) {
                    setNextStatus('RAB');
                  }
                  if (!keteranganPekerjaan || keteranganPekerjaan.includes('Survei Google Maps:')) {
                    setKeteranganPekerjaan(summaryNotes);
                  }
                  setActionNotes(summaryNotes);
                }}
              />
            </div>
          )}

          {/* TAB 3: K3L */}
          {activeTab === 'k3l' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900">
                <strong>Tugas K3L:</strong> Melakukan verifikasi keselamatan kerja (Job Safety Analysis), penerbitan Working Permit (WP), inspeksi kelengkapan APD Vendor sebelum pekerjaan fisik lapangan dapat dimulai.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Working Permit (WP) Resmi K3L *
                </label>
                <input
                  type="text"
                  required
                  value={workingPermit}
                  onChange={(e) => setWorkingPermit(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-purple-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Checklist Keselamatan Kerja & APD Wajib:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {Object.entries(apdChecklist).map(([key, checked]) => (
                    <label key={key} className="flex items-center gap-2 p-2 rounded bg-slate-50 border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setApdChecklist({ ...apdChecklist, [key]: e.target.checked })
                        }
                        className="rounded text-purple-600"
                      />
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs flex items-center gap-2 text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Job Safety Analysis (JSA) tervalidasi memenuhi regulasi Keselamatan Ketenagalistrikan PLN.</span>
              </div>
            </div>
          )}

          {/* TAB 4: TE (TRANSAKSI ENERGI) */}
          {activeTab === 'te' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                <strong>Tugas Tim Transaksi Energi (TE):</strong> Melakukan komisioning akhir, instalasi &amp; pendataan kWh meter transaksi, pengisian <strong>Stand Bongkar &amp; Stand Pasang</strong> sesuai jenis pekerjaan &amp; golongan tarif, pemasangan nomor segel PLN, dan validasi berkas PDL.
              </div>

              {/* Spesifikasi Meter, CT, Segel & Golongan Tarif */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor kWh Meter Baru *
                  </label>
                  <input
                    type="text"
                    required
                    value={nomorKwhBaru}
                    onChange={(e) => setNomorKwhBaru(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-emerald-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Merk &amp; Tipe kWh Meter
                  </label>
                  <input
                    type="text"
                    value={merkKwh}
                    onChange={(e) => setMerkKwh(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rasio CT (Current Transformer)
                  </label>
                  <input
                    type="text"
                    value={rasioCt}
                    onChange={(e) => setRasioCt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Direct atau misal 100/5A"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Seri Segel Resmi PLN *
                  </label>
                  <input
                    type="text"
                    required
                    value={nomorSeriSegel}
                    onChange={(e) => setNomorSeriSegel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-red-700"
                    placeholder="PLN-TE-..."
                  />
                </div>
              </div>

              {/* SEKSI KHUSUS STAND METER TE: STAND BONGKAR & STAND PASANG + TARIF INDUSTRI (WBP, LWBP, kVar) */}
              <div className="p-4 bg-slate-50 border-2 border-sky-200 rounded-xl space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <h5 className="font-extrabold text-xs uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-sky-700" />
                      <span>Form Stand Meter Transaksi Energi (TE)</span>
                    </h5>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {teStandConfig.ruleSummary}
                    </p>
                  </div>

                  {/* Golongan Tarif Selector (Memudahkan Verifikasi Tarif Reguler vs Industri WBP/LWBP/kVar) */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="te-tarif-select" className="text-[11px] font-bold text-slate-700">
                      Golongan Tarif:
                    </label>
                    <select
                      id="te-tarif-select"
                      value={tarif}
                      onChange={(e) => setTarif(e.target.value)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer ${
                        teStandConfig.isIndustri
                          ? 'bg-amber-100 border-amber-400 text-amber-950'
                          : 'bg-white border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="R-1/TR">R-1/TR (Rumah Tangga)</option>
                      <option value="R-2/TR">R-2/TR (Rumah Tangga)</option>
                      <option value="B-1/TR">B-1/TR (Bisnis Kecil)</option>
                      <option value="B-2/TR">B-2/TR (Bisnis Menengah)</option>
                      <option value="I-1/TR">I-1/TR (Industri Kecil - WBP/LWBP/kVar)</option>
                      <option value="I-2/TR">I-2/TR (Industri Menengah - WBP/LWBP/kVar)</option>
                      <option value="I-3/TM">I-3/TM (Industri TM - WBP/LWBP/kVar)</option>
                      <option value="S-2/TR">S-2/TR (Sosial)</option>
                      <option value="P-1/TR">P-1/TR (Pemerintah)</option>
                    </select>
                  </div>
                </div>

                {/* Info Pills: Jenis Transaksi & Parameter Tarif */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className={`px-2.5 py-1 rounded-md font-bold border ${
                      item.transaksi === 'PB'
                        ? 'bg-sky-100 text-sky-900 border-sky-300'
                        : 'bg-teal-100 text-teal-900 border-teal-300'
                    }`}
                  >
                    {item.transaksi === 'PB'
                      ? '🔹 Pekerjaan Pasang Baru (PB): Hanya Stand Pasang'
                      : `🔸 Pekerjaan ${item.transaksi === 'PD' ? 'Perubahan Daya (PD)' : 'PFK'}: Stand Bongkar & Stand Pasang`}
                  </span>

                  <span
                    className={`px-2.5 py-1 rounded-md font-bold border ${
                      teStandConfig.isIndustri
                        ? 'bg-amber-100 text-amber-950 border-amber-400'
                        : 'bg-slate-200 text-slate-800 border-slate-300'
                    }`}
                  >
                    {teStandConfig.isIndustri
                      ? `🏭 Tarif Industri (${tarif}): Stand WBP, LWBP & kVar`
                      : `⚡ Tarif Non-Industri (${tarif}): Stand kWh Tunggal`}
                  </span>
                </div>

                <div
                  className={`grid grid-cols-1 ${
                    teStandConfig.showStandBongkar ? 'md:grid-cols-2' : 'md:grid-cols-1'
                  } gap-3`}
                >
                  {/* 1. STAND BONGKAR (Hanya tampil untuk Perubahan Daya / PD atau PFK, TIDAK tampil untuk Pasang Baru / PB) */}
                  {teStandConfig.showStandBongkar && (
                    <div className="p-3.5 bg-amber-50/70 border border-amber-300 rounded-lg space-y-2.5">
                      <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
                        <span className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                          1. Stand Bongkar (Meter Lama / Eksisting)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                          Wajib {item.transaksi}
                        </span>
                      </div>

                      {teStandConfig.isIndustri ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-amber-950 mb-1">
                              Stand Bongkar WBP (kWh)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={standBongkarWbp}
                              onChange={(e) => setStandBongkarWbp(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-md text-sm font-mono font-bold text-slate-900"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-amber-950 mb-1">
                              Stand Bongkar LWBP (kWh)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={standBongkarLwbp}
                              onChange={(e) => setStandBongkarLwbp(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-md text-sm font-mono font-bold text-slate-900"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-amber-950 mb-1">
                              Stand Bongkar kVar (kVArh)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={standBongkarKvar}
                              onChange={(e) => setStandBongkarKvar(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-md text-sm font-mono font-bold text-slate-900"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold text-amber-950 mb-1">
                            Stand Bongkar Meter Lama (kWh) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={standBongkar}
                            onChange={(e) => setStandBongkar(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm font-mono font-bold text-slate-900"
                            placeholder="Masukkan angka stand cabut/bongkar kWh meter lama"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. STAND PASANG (Tampil untuk Pasang Baru / PB maupun Perubahan Daya / PD) */}
                  {teStandConfig.showStandPasang && (
                    <div className="p-3.5 bg-emerald-50/70 border border-emerald-300 rounded-lg space-y-2.5">
                      <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5">
                        <span className="text-xs font-extrabold text-emerald-950 uppercase tracking-wide">
                          {teStandConfig.showStandBongkar
                            ? '2. Stand Pasang (Meter Baru)'
                            : 'Stand Pasang (Meter Baru — Pasang Baru)'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200 text-emerald-950">
                          Wajib {item.transaksi}
                        </span>
                      </div>

                      {teStandConfig.isIndustri ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                              Stand Pasang WBP (kWh)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={standPasangWbp}
                              onChange={(e) => setStandPasangWbp(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-md text-sm font-mono font-bold text-emerald-950"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                              Stand Pasang LWBP (kWh)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={standPasangLwbp}
                              onChange={(e) => setStandPasangLwbp(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-md text-sm font-mono font-bold text-emerald-950"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                              Stand Pasang kVar (kVArh)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={standPasangKvar}
                              onChange={(e) => setStandPasangKvar(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-md text-sm font-mono font-bold text-emerald-950"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold text-emerald-950 mb-1">
                            Stand Pasang Meter Baru (kWh) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={standPasang}
                            onChange={(e) => setStandPasang(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm font-mono font-bold text-emerald-950"
                            placeholder="Masukkan angka stand awal pasang kWh meter baru"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SEKSI KHUSUS KEPERLUAN PDL: FOTO METER SEBELUM, SESUDAH, DAN IDPEL TETANGGA */}
              <div className="mt-4 p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 border-2 border-emerald-300 rounded-xl space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-2.5">
                  <div>
                    <h5 className="font-bold text-xs uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-emerald-700" />
                      Dokumen Lapangan TE (Wajib untuk Keperluan PDL)
                    </h5>
                    <p className="text-[11px] text-slate-600">
                      Sesuai SOP, untuk keperluan PDL tim TE wajib mengirimkan foto meter sebelum, sesudah, dan IDPEL tetangga.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFotoMeterSebelum(MOCK_METER_SEBELUM);
                      setFotoMeterSesudah(MOCK_METER_SESUDAH);
                      setFotoIdpelTetangga(MOCK_IDPEL_TETANGGA);
                      if (!idPelTetangga) setIdPelTetangga('521541889010');
                    }}
                    className="text-[11px] font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md shadow-2xs transition"
                  >
                    + Pasang Foto Sampel TE
                  </button>
                </div>

                {/* 3 Upload Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Card 1: Foto Meter Sebelum */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800">1. Foto Meter Sebelum</span>
                        {fotoMeterSebelum ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            ✓ Terlampir
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                            * Wajib
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2">
                        Foto meter eksisting sebelum dibongkar (tampak stand kWh & nomor seri).
                      </p>

                      {fotoMeterSebelum ? (
                        <div className="relative group rounded-md overflow-hidden border border-slate-200 mb-2 bg-slate-100">
                          <img
                            src={fotoMeterSebelum}
                            alt="Meter Sebelum"
                            className="w-full h-24 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setFotoMeterSebelum('')}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded hover:bg-red-700 shadow-xs"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded-md p-3 text-center mb-2 bg-slate-50">
                          <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                          <span className="text-[11px] text-slate-500 block">Belum ada foto</span>
                        </div>
                      )}
                    </div>

                    <label className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{fotoMeterSebelum ? 'Ganti Foto' : 'Unggah Foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setFotoMeterSebelum)}
                      />
                    </label>
                  </div>

                  {/* Card 2: Foto Meter Sesudah */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800">2. Foto Meter Sesudah</span>
                        {fotoMeterSesudah ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            ✓ Terlampir
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                            * Wajib
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2">
                        Foto meter baru setelah dinyalakan & dipasang segel resmi TE.
                      </p>

                      {fotoMeterSesudah ? (
                        <div className="relative group rounded-md overflow-hidden border border-slate-200 mb-2 bg-slate-100">
                          <img
                            src={fotoMeterSesudah}
                            alt="Meter Sesudah"
                            className="w-full h-24 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setFotoMeterSesudah('')}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded hover:bg-red-700 shadow-xs"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded-md p-3 text-center mb-2 bg-slate-50">
                          <Zap className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                          <span className="text-[11px] text-slate-500 block">Belum ada foto</span>
                        </div>
                      )}
                    </div>

                    <label className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{fotoMeterSesudah ? 'Ganti Foto' : 'Unggah Foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setFotoMeterSesudah)}
                      />
                    </label>
                  </div>

                  {/* Card 3: IDPEL Tetangga & Foto kWh Tetangga */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800">3. IDPEL Tetangga</span>
                        {idPelTetangga ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            ✓ Terisi
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                            * Wajib
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2">
                        Nomor ID Pelanggan tetangga untuk verifikasi topologi gardu & tiang.
                      </p>

                      <input
                        type="text"
                        maxLength={12}
                        value={idPelTetangga}
                        onChange={(e) => setIdPelTetangga(e.target.value.replace(/\D/g, ''))}
                        placeholder="Contoh: 521541889010"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-sky-950 mb-2"
                      />

                      {fotoIdpelTetangga ? (
                        <div className="relative group rounded-md overflow-hidden border border-slate-200 mb-2 bg-slate-100">
                          <img
                            src={fotoIdpelTetangga}
                            alt="IDPEL Tetangga"
                            className="w-full h-16 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setFotoIdpelTetangga('')}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded hover:bg-red-700 shadow-xs"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 block mb-2 italic">
                          Opsional: Lampirkan foto meter / barcode tetangga
                        </span>
                      )}
                    </div>

                    <label className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold cursor-pointer transition">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{fotoIdpelTetangga ? 'Ganti Foto' : 'Unggah Foto Tetangga'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setFotoIdpelTetangga)}
                      />
                    </label>
                  </div>
                </div>

                {/* Status Ringkasan Kelengkapan TE */}
                <div
                  className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-semibold ${
                    fotoMeterSebelum && fotoMeterSesudah && idPelTetangga
                      ? 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                      : 'bg-amber-100/90 border-amber-300 text-amber-950'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {fotoMeterSebelum && fotoMeterSesudah && idPelTetangga ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>
                      {fotoMeterSebelum && fotoMeterSesudah && idPelTetangga
                        ? 'Kelengkapan berkas TE telah memenuhi syarat untuk penerbitan PDL.'
                        : 'SOP PDL: Foto Meter Sebelum, Sesudah, dan IDPEL Tetangga wajib dikirimkan TE.'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg text-xs text-red-900 flex items-start gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-950">Validasi SOP PDL Belum Terpenuhi:</div>
                <div className="mt-0.5">{validationError}</div>
              </div>
            </div>
          )}

          {/* Bottom Stage Transition Selector */}
          <div className="pt-4 border-t border-slate-200">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
              Perbarui Status Tahapan Permohonan
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['MOHON', 'SURVEI', 'RAB', 'TANPA PERLUASAN', 'BAYAR', 'KERJA', 'NYALA', 'PDL'] as StatusPermohonan[]).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setNextStatus(st);
                      setValidationError(null);
                    }}
                    className={`py-1.5 px-2.5 rounded text-xs font-bold border transition ${
                      nextStatus === st
                        ? 'bg-sky-700 text-white border-sky-800 shadow-xs'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Pekerjaan / Tindak Lanjut
              </label>
              <input
                type="text"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Tuliskan catatan progres atau verifikasi..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 bg-slate-100 px-3.5 sm:px-6 py-2.5 sm:py-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="px-3.5 sm:px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white transition cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleApplyAction}
            className="px-4 sm:px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs shadow-md flex items-center gap-1.5 sm:gap-2 transition cursor-pointer"
          >
            <span>Simpan Perubahan &amp; Audit Log</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
