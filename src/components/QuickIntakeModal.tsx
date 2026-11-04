import React, { useState, useEffect } from 'react';
import { PermohonanItem, TransaksiType } from '../types';
import {
  validateIdPel,
  validateNikKtp,
  calculateBiayaPenyambungan,
  determineInitialWorkflow,
  formatRupiah,
  buildTeknikWaNotification,
} from '../utils/plnValidation';
import { queryPlnCentralApi } from '../services/mockApiValidation';
import { MapLocationPicker } from './MapLocationPicker';
import {
  X,
  Zap,
  Shield,
  FileText,
  User,
  Phone,
  MapPin,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Send,
  Upload,
  ArrowRight,
  FileSpreadsheet,
  CreditCard,
  Camera,
  Layers,
  Gauge,
  Info,
} from 'lucide-react';

interface QuickIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    newRecord: PermohonanItem,
    syncToSheets: boolean,
    waOptions?: { sendToTeknik: boolean; teknikPhone: string }
  ) => void;
  isSheetsConnected: boolean;
}

export const QuickIntakeModal: React.FC<QuickIntakeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSheetsConnected,
}) => {
  const [transaksi, setTransaksi] = useState<TransaksiType>('PB');
  const [kategoriPfk, setKategoriPfk] = useState<'Konstruksi' | 'Meter'>('Konstruksi');
  const [projectName, setProjectName] = useState('');
  const [nomorKtp, setNomorKtp] = useState('');
  const [kontakPerson, setKontakPerson] = useState('');
  const [alamat, setAlamat] = useState('');
  const [peruntukan, setPeruntukan] = useState('Rumah Tangga');
  const [dayaLama, setDayaLama] = useState<number>(0);
  const [dayaBaru, setDayaBaru] = useState<number>(2200);
  const [tarif, setTarif] = useState('R-1/TR');
  const [meter, setMeter] = useState<'PRABAYAR' | 'PASKA BAYAR'>('PRABAYAR');
  const [idPel, setIdPel] = useState('');
  const [nomorMeterEksisting, setNomorMeterEksisting] = useState('');
  const [noNodin, setNoNodin] = useState('');
  const [tglSurat, setTglSurat] = useState(() => new Date().toISOString().split('T')[0]);
  const [keterangan, setKeterangan] = useState('');
  const [coordinates, setCoordinates] = useState('-7.6079, 110.2038');
  const [syncToSheets, setSyncToSheets] = useState(true);

  // Validation States
  const [idPelFeedback, setIdPelFeedback] = useState<{ isValid: boolean; message: string }>({
    isValid: true,
    message: '',
  });
  const [ktpFeedback, setKtpFeedback] = useState<{ isValid: boolean; message: string }>({
    isValid: true,
    message: '',
  });
  const [isQueryingApi, setIsQueryingApi] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState<string>('');
  const [attachedFileDataUrl, setAttachedFileDataUrl] = useState<string>('');
  const [ktpFileName, setKtpFileName] = useState<string>('');
  const [ktpPreviewUrl, setKtpPreviewUrl] = useState<string>('');
  const [showWaPreview, setShowWaPreview] = useState(true);
  const [sendWaToTeknik, setSendWaToTeknik] = useState(true);
  const [teknikWaPhone, setTeknikWaPhone] = useState('08112500123');
  const [formError, setFormError] = useState<string>('');

  // Conditional logic per user requirements:
  // - PB: form input IDPEL dihilangkan
  // - PFK Konstruksi: form input IDPEL dihilangkan
  // - PD: form input IDPEL ditampilkan (wajib)
  // - PFK Meter: form input IDPEL / Nomor Meter ditampilkan (wajib)
  const shouldShowIdPelOrMeter =
    transaksi === 'PD' || (transaksi === 'PFK' && kategoriPfk === 'Meter');

  // Sync default Daya Lama when switching PB vs PD
  useEffect(() => {
    if (transaksi === 'PB') {
      setDayaLama(0);
    } else if (transaksi === 'PD' && dayaLama === 0) {
      setDayaLama(1300);
    }
  }, [transaksi]);

  // Live NIK / KTP validation
  useEffect(() => {
    if (nomorKtp.trim()) {
      setKtpFeedback(validateNikKtp(nomorKtp));
    } else {
      setKtpFeedback({ isValid: true, message: '' });
    }
  }, [nomorKtp]);

  // Live IDPEL Validation & API Query
  useEffect(() => {
    if (!shouldShowIdPelOrMeter) {
      setIdPelFeedback({ isValid: true, message: '' });
      return;
    }

    const isPd = transaksi === 'PD';
    const validation = validateIdPel(idPel, isPd);
    setIdPelFeedback(validation);

    if (idPel.length === 12 && /^\d+$/.test(idPel)) {
      setIsQueryingApi(true);
      queryPlnCentralApi(idPel).then((res) => {
        setIsQueryingApi(false);
        if (res) {
          if (isPd) {
            if (!projectName) setProjectName(res.namaPelanggan);
            if (!alamat) setAlamat(res.alamatTersimpan);
            setDayaLama(res.dayaEksisting);
            setTarif(res.tarifEksisting);
          }
          if (res.nomorMeterEksisting && !nomorMeterEksisting) {
            setNomorMeterEksisting(res.nomorMeterEksisting);
          }
        }
      });
    }
  }, [idPel, transaksi, kategoriPfk, shouldShowIdPelOrMeter]);

  const calculation = calculateBiayaPenyambungan(transaksi, dayaLama, dayaBaru, tarif, meter);
  const workflowRouting = determineInitialWorkflow(transaksi);

  if (!isOpen) return null;

  const handleKtpFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setKtpFileName(file.name);
      const url = URL.createObjectURL(file);
      setKtpPreviewUrl(url);
    }
  };

  const liveMapsUrl = `https://www.google.com/maps?q=${coordinates.replace(/\s/g, '')}`;
  const liveWaPayload = buildTeknikWaNotification(
    {
      noNodin: noNodin.trim() || `NODIN-${new Date().getFullYear()}-AUTO`,
      transaksi,
      kategoriPfk: transaksi === 'PFK' ? kategoriPfk : undefined,
      status: workflowRouting.initialStatus,
      projectName: projectName.trim() || '[Nama Pelanggan]',
      kontakPerson: kontakPerson.trim() || '[No. HP Pelanggan]',
      nomorKtp: nomorKtp.trim() || '-',
      idPel: idPel.trim(),
      dayaLama: transaksi === 'PB' ? 0 : Number(dayaLama),
      dayaBaru: Number(dayaBaru),
      tarif,
      meter,
      peruntukan: peruntukan.trim(),
      alamat: alamat.trim() || '[Alamat Lokasi Pelanggan]',
      tagingLokasi: coordinates.trim(),
      linkMap: liveMapsUrl,
      tglSurat,
      keteranganPekerjaan: keterangan.trim(),
    },
    teknikWaPhone
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!projectName.trim()) {
      setFormError('Nama Pemohon / Proyek wajib diisi.');
      return;
    }
    if (!nomorKtp.trim() || nomorKtp.replace(/\D/g, '').length !== 16) {
      setFormError('Nomor KTP (NIK 16 digit) wajib diisi dengan benar.');
      return;
    }
    if (!kontakPerson.trim()) {
      setFormError('Nomor Kontak / WhatsApp Pelanggan wajib diisi agar Tim Teknik mudah menghubungi saat survei.');
      return;
    }
    if (!alamat.trim()) {
      setFormError('Alamat lokasi wajib diisi.');
      return;
    }

    // Validation for PD
    if (transaksi === 'PD' && !idPelFeedback.isValid) {
      setFormError(idPelFeedback.message);
      return;
    }

    // Validation for PFK Meter
    if (transaksi === 'PFK' && kategoriPfk === 'Meter') {
      if (!idPel.trim() && !nomorMeterEksisting.trim()) {
        setFormError('Untuk permohonan PFK kategori Meter, silakan isi IDPEL atau Nomor Meter.');
        return;
      }
    }

    const randomId = Math.random().toString(16).substring(2, 10);
    const generatedNodin = noNodin.trim() || `NODIN-${new Date().getFullYear()}-${randomId.slice(0, 4).toUpperCase()}`;

    // Clean IDPEL value based on user rule
    const finalIdPel =
      transaksi === 'PB' || (transaksi === 'PFK' && kategoriPfk === 'Konstruksi')
        ? ''
        : idPel.trim();

    const descWork =
      keterangan.trim() ||
      (transaksi === 'PFK'
        ? `PFK ${kategoriPfk}: Permohonan daya ${dayaBaru.toLocaleString('id-ID')} VA (${tarif})`
        : `${transaksi} daya ${dayaBaru.toLocaleString('id-ID')} VA (${tarif})`);

    const mapsLink = `https://www.google.com/maps?q=${coordinates.replace(/\s/g, '')}`;

    const newRecord: PermohonanItem = {
      id: randomId,
      noNodin: generatedNodin,
      status: workflowRouting.initialStatus,
      tahun: new Date().getFullYear(),
      projectName: projectName.trim(),
      alamat: alamat.trim(),
      peruntukan: peruntukan.trim(),
      transaksi,
      kategoriPfk: transaksi === 'PFK' ? kategoriPfk : undefined,
      nomorMeterEksisting: nomorMeterEksisting.trim(),
      dayaLama: transaksi === 'PB' ? 0 : Number(dayaLama),
      dayaBaru: Number(dayaBaru),
      tarif,
      meter,
      kontakPerson: kontakPerson.trim(),
      nomorKtp: nomorKtp.trim(),
      fotoKtpNpwp: ktpFileName || 'KTP_Pelanggan_Terlampir.jpg',
      suratPermohonan: attachedFileName || `Surat_Permohonan_${projectName.replace(/\s+/g, '_')}.pdf`,
      suratPermohonanDataUrl: attachedFileDataUrl || undefined,
      tglSurat: tglSurat || new Date().toISOString().split('T')[0],
      petugasSurvei: '',
      tagingLokasi: coordinates.trim(),
      nomorGardu: '',
      nomorTiang: '',
      idPel: finalIdPel,
      idPelTetangga: '',
      keteranganPekerjaan: descWork,
      keteranganStatus:
        transaksi === 'PFK'
          ? `Permohonan PFK (${kategoriPfk}): Notifikasi WA Survei telah dikirim ke Tim Teknik`
          : 'Notifikasi WA Survei diteruskan ke Tim Teknik & menunggu verifikasi PP',
      keteranganKendala: '-',
      linkMap: mapsLink,
      tglSurvei: '',
      rab: 0,
      biayaBp: transaksi === 'PFK' ? 0 : calculation.biayaPenyambungan,
      biayaUjl: transaksi === 'PFK' ? 0 : calculation.ujlToken,
      noPkVendor: '',
      workingPermit: '',
      validasiSegel: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      historyLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: 'Security / Front Desk',
          role: 'security',
          action: `Pendaftaran Permohonan (${transaksi}${transaksi === 'PFK' ? ` - ${kategoriPfk}` : ''}) & Notifikasi WA Tim Teknik`,
          notes: `${workflowRouting.routingSummary} • WA Tim Teknik (${teknikWaPhone}) berisi No. HP Pelanggan (${kontakPerson.trim()}) & Maps (${mapsLink})`,
        },
      ],
    };

    onSubmit(newRecord, syncToSheets, {
      sendToTeknik: sendWaToTeknik,
      teknikPhone: teknikWaPhone,
    });
    onClose();
  };

  const dayaOptions = [
    450, 900, 1300, 2200, 3500, 4400, 5500, 7700, 10600, 11000, 13200, 13900, 16500, 22000, 23000,
    33000, 41500, 53000, 66000, 82500, 105000, 131000, 147000, 164000, 197000, 200000,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-sky-800 via-sky-900 to-blue-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-400 text-slate-900 rounded-lg font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Input Registrasi Permohonan Pelanggan
              </h2>
              <p className="text-xs text-sky-200">
                ULP Borobudur, UP3 Magelang, UID Jawa Tengah
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sky-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Step 1: Jenis Transaksi (Crucial for PFK vs PBPD Routing) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              1. Pilih Jenis Permohonan Transaksi
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setTransaksi('PB')}
                className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  transaksi === 'PB'
                    ? 'border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-bold text-sm flex items-center justify-between">
                  <span>Pasang Baru (PB)</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-sky-200 text-sky-800 font-semibold">Standar</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Penyambungan instalasi baru untuk bangunan atau lokasi baru (Tanpa IDPEL).
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTransaksi('PD')}
                className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  transaksi === 'PD'
                    ? 'border-teal-600 bg-teal-50 text-teal-950 ring-2 ring-teal-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-bold text-sm flex items-center justify-between">
                  <span>Perubahan Daya (PD)</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-teal-200 text-teal-800 font-semibold">Eksisting</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Penambahan daya pelanggan lama (Wajib isi IDPEL 12 digit).
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTransaksi('PFK')}
                className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  transaksi === 'PFK'
                    ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-bold text-sm flex items-center justify-between">
                  <span className="text-amber-900 font-extrabold flex items-center gap-1">
                    ⚡ PFK
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  <strong>PFK</strong>: Langsung diteruskan ke Tim Teknik untuk survei segera.
                </div>
              </button>
            </div>

            {/* Sub-Kategori PFK: Konstruksi vs Meter (Sesuai Permintaan User) */}
            {transaksi === 'PFK' && (
              <div className="mt-3 p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-lg animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-amber-950 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-700" />
                  Pilih Kategori Permohonan PFK:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setKategoriPfk('Konstruksi')}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition flex items-start gap-3 ${
                      kategoriPfk === 'Konstruksi'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-500'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-amber-50/50'
                    }`}
                  >
                    <div className="text-xl shrink-0 mt-0.5">🏗️</div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm">PFK Konstruksi</div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          kategoriPfk === 'Konstruksi' ? 'text-amber-100' : 'text-slate-500'
                        }`}
                      >
                        Pekerjaan fisik konstruksi jaringan, pergeseran tiang, atau trafo (<strong>Form IDPEL ditiadakan</strong>).
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setKategoriPfk('Meter')}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition flex items-start gap-3 ${
                      kategoriPfk === 'Meter'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-500'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-amber-50/50'
                    }`}
                  >
                    <div className="text-xl shrink-0 mt-0.5">⚡</div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm">PFK Meter</div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          kategoriPfk === 'Meter' ? 'text-amber-100' : 'text-slate-500'
                        }`}
                      >
                        Pemindahan, perbaikan, atau pengujian meter transaksi (<strong>Wajib isi IDPEL / Nomor Meter</strong>).
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Routing Banner Announcement */}
            <div
              className={`mt-3 p-3.5 rounded-lg border flex items-start gap-3 ${
                transaksi === 'PFK'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}
            >
              {transaksi === 'PFK' ? (
                <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <FileText className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <div className="font-bold">
                  {transaksi === 'PFK'
                    ? `ALUR PFK (${kategoriPfk}): Langsung Terhubung ke Tim Teknik ULP Borobudur`
                    : 'ALUR PBPD: Verifikasi Dokumen oleh Pelayanan Pelanggan (PP)'}
                </div>
                <div className="text-slate-600 mt-0.5">{workflowRouting.routingSummary}</div>
              </div>
            </div>
          </div>

          {/* Step 2: Data Identitas & KTP Pemohon */}
          <div className="space-y-4 p-4 bg-slate-50/80 border border-slate-200 rounded-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-sky-700" />
              2. Data Identitas KTP & Kontak Pemohon
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor KTP / NIK Pemohon (16 Digit) *
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={16}
                    placeholder="Contoh: 3308123456780001"
                    value={nomorKtp}
                    onChange={(e) => setNomorKtp(e.target.value.replace(/\D/g, ''))}
                    className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-mono tracking-wider focus:outline-hidden ${
                      nomorKtp && !ktpFeedback.isValid
                        ? 'border-red-400 bg-red-50 text-red-900'
                        : nomorKtp.length === 16
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950'
                        : 'border-slate-300 bg-white focus:ring-2 focus:ring-sky-500'
                    }`}
                  />
                  {nomorKtp.length === 16 && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-3" />
                  )}
                </div>
                {nomorKtp && (
                  <div
                    className={`text-[11px] mt-1 flex items-center gap-1 ${
                      ktpFeedback.isValid ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    <span>{ktpFeedback.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload / Foto KTP Pemohon *
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-lg bg-white cursor-pointer transition text-xs font-medium text-slate-700 hover:text-sky-800">
                    <Camera className="w-4 h-4 text-sky-600" />
                    <span>{ktpFileName ? ktpFileName : 'Ambil Foto / Pilih Berkas KTP'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleKtpFileChange}
                      className="hidden"
                    />
                  </label>
                  {ktpPreviewUrl && (
                    <div className="w-10 h-10 rounded border border-slate-300 overflow-hidden shrink-0 shadow-xs">
                      <img src={ktpPreviewUrl} alt="Preview KTP" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Pemohon / Perusahaan / Proyek *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Bpk. Bambang Setiawan / CV Berkah Borobudur"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Kontak / WhatsApp Aktif *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="Contoh: 081234567890"
                    value={kontakPerson}
                    onChange={(e) => setKontakPerson(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Lengkap Lokasi Penyambungan *
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <textarea
                  required
                  rows={2}
                  placeholder="Nama Jalan/Dusun, RT/RW, Desa (Wanurejo/Majaksingi/Candirejo), Kec. Borobudur, Kab. Magelang..."
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Peruntukan Bangunan
                </label>
                <select
                  value={peruntukan}
                  onChange={(e) => setPeruntukan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                >
                  <option value="Rumah Tangga">Rumah Tangga</option>
                  <option value="Usaha / Bisnis / Toko / Homestay">Usaha / Bisnis / Toko / Homestay</option>
                  <option value="Industri / Pengolahan">Industri / Pengolahan</option>
                  <option value="Kantor Pemerintah / Publik">Kantor Pemerintah / Publik</option>
                  <option value="Sosial / Tempat Ibadah / Pesantren">Sosial / Tempat Ibadah / Pesantren</option>
                  <option value="Tower Telekomunikasi (BTS)">Tower Telekomunikasi (BTS)</option>
                  <option value="SPKLU (Stasiun Pengisian Kendaraan Listrik)">
                    SPKLU (Stasiun Pengisian Kendaraan Listrik)
                  </option>
                  <option value="Pertanian / Peternakan">Pertanian / Peternakan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Input Surat Permohonan *
                </label>
                <input
                  type="date"
                  required
                  value={tglSurat}
                  onChange={(e) => setTglSurat(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden font-mono"
                />
                <span className="text-[10px] text-sky-700 block mt-0.5">
                  ⏱️ Titik awal perhitungan Counter Hari
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Nota Dinas (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 23/04/2026 atau kosongkan utk auto"
                  value={noNodin}
                  onChange={(e) => setNoNodin(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Interactive Maps Location Picker */}
          <div className="p-4 bg-sky-50/50 border-2 border-sky-300 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-600" />
                  3. Peta Lokasi & Titik Koordinat Permohonan (GIS Survei)
                </label>
                <p className="text-[11px] text-sky-800 mt-0.5">
                  Klik atau geser pin langsung pada peta untuk menentukan titik akurat agar Tim Teknik mudah melakukan survei.
                </p>
              </div>
            </div>

            {/* Embedded Real Interactive Map */}
            <MapLocationPicker
              initialCoordinates={coordinates}
              onChange={(newCoords) => setCoordinates(newCoords)}
              height="260px"
            />
          </div>

          {/* Step 4: Validasi IDPEL & Nomor Meter (KONDISIONAL: DIHILANGKAN UTK PB DAN PFK KONSTRUKSI) */}
          {shouldShowIdPelOrMeter && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-teal-700" />
                  {transaksi === 'PD'
                    ? '4. Validasi ID Pelanggan (IDPEL 12 Digit) - Wajib untuk PD'
                    : '4. Data ID Pelanggan / Nomor Meter Eksisting - Wajib untuk PFK Meter'}
                </label>
                {isQueryingApi && (
                  <span className="text-[11px] text-sky-600 flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
                    Mengecek AP2T Pusat PLN...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ID Pelanggan (IDPEL 12 Digit) {transaksi === 'PD' ? '*' : ''}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={12}
                      placeholder="Contoh: 521541550555"
                      value={idPel}
                      onChange={(e) => setIdPel(e.target.value.replace(/\D/g, ''))}
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tracking-widest ${
                        idPel && !idPelFeedback.isValid
                          ? 'border-red-400 bg-red-50 text-red-900'
                          : idPel.length === 12
                          ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950'
                          : 'border-slate-300 bg-white'
                      }`}
                    />
                    {idPel.length === 12 && idPelFeedback.isValid && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-3" />
                    )}
                  </div>
                  {idPel && idPelFeedback.message && (
                    <div
                      className={`text-[11px] mt-1 flex items-center gap-1 ${
                        idPelFeedback.isValid ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      <span>{idPelFeedback.message}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nomor Seri Meter Eksisting (Opsional / Tertera di Kwh)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 14256789012"
                    value={nomorMeterEksisting}
                    onChange={(e) => setNomorMeterEksisting(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Spesifikasi Daya & Simulasi Tarif (SIMULASI BIAYA DIHILANGKAN UTK PFK) */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              5. Spesifikasi Daya & Tarif
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {transaksi === 'PD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daya Lama (VA)
                  </label>
                  <select
                    value={dayaLama}
                    onChange={(e) => setDayaLama(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {dayaOptions.map((d) => (
                      <option key={`lama-${d}`} value={d}>
                        {d.toLocaleString('id-ID')} VA
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={transaksi === 'PD' ? 'col-span-1' : 'col-span-2'}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Daya Baru Diajukan (VA) *
                </label>
                <select
                  value={dayaBaru}
                  onChange={(e) => setDayaBaru(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium"
                >
                  {dayaOptions.map((d) => (
                    <option key={`baru-${d}`} value={d}>
                      {d >= 1000 ? `${d / 1000} kVA (${d.toLocaleString('id-ID')} VA)` : `${d} VA`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Golongan Tarif</label>
                <select
                  value={tarif}
                  onChange={(e) => setTarif(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="R-1/TR">R-1/TR (Rumah Tangga Kecil)</option>
                  <option value="R-2/TR">R-2/TR (Rumah Tangga Sedang)</option>
                  <option value="B-1/TR">B-1/TR (Bisnis Kecil)</option>
                  <option value="B-2/TR">B-2/TR (Bisnis Menengah)</option>
                  <option value="I-1/TR">I-1/TR (Industri Kecil)</option>
                  <option value="I-2/TR">I-2/TR (Industri Menengah)</option>
                  <option value="I-3/TM">I-3/TM (Industri TM)</option>
                  <option value="S-1/TR">S-1/TR (Sosial Murni)</option>
                  <option value="S-2/TR">S-2/TR (Sosial Lembaga)</option>
                  <option value="P-1/TR">P-1/TR (Pemerintah)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Meter</label>
                <select
                  value={meter}
                  onChange={(e) => setMeter(e.target.value as 'PRABAYAR' | 'PASKA BAYAR')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="PRABAYAR">Prabayar (Token Listrik)</option>
                  <option value="PASKA BAYAR">Paska Bayar (Tagihan Bulanan)</option>
                </select>
              </div>
            </div>

            {/* Simulasi Biaya: HILANGKAN UNTUK PFK SESUAI INSTRUKSI USER */}
            {transaksi === 'PFK' ? (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950">
                  <div className="font-bold">
                    Biaya PFK ({kategoriPfk}) Disusun Melalui RAB Lapangan
                  </div>
                  <div className="text-amber-800 mt-0.5">
                    Permohonan PFK tidak menggunakan simulasi Biaya Penyambungan (BP) standar. Biaya akan dihitung secara riil oleh <strong>Tim Teknik ULP Borobudur</strong> melalui survei teknis lapangan dan penyusunan Rencana Anggaran Biaya (RAB).
                  </div>
                </div>
              </div>
            ) : (
              /* Live Fee Breakdown untuk PB dan PD */
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-sky-600" />
                    Estimasi Biaya Penyambungan (BP) Resmi PLN
                  </span>
                  <span className="text-sm font-extrabold text-sky-900">
                    Total: {formatRupiah(calculation.totalEstimasi)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 pt-2 border-t border-sky-200">
                  <div>
                    <div className="text-[10px] text-slate-500">Biaya Penyambungan (BP):</div>
                    <div className="font-semibold text-slate-800">
                      {formatRupiah(calculation.biayaPenyambungan)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">
                      {meter === 'PRABAYAR' ? 'Token Perdana:' : 'Uang Jaminan Langganan:'}
                    </div>
                    <div className="font-semibold text-slate-800">
                      {formatRupiah(calculation.ujlToken)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Materai:</div>
                    <div className="font-semibold text-slate-800">{formatRupiah(calculation.materai)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Metode Bayar:</div>
                    <div className="font-semibold text-sky-700">Virtual Account / Loket PLN</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 6: Upload Surat Permohonan & Opsi Sinkronisasi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Upload Surat Permohonan Pelanggan
              </label>
              <div className="border border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50 hover:bg-slate-100 transition cursor-pointer">
                <input
                  type="file"
                  id="file-upload"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setAttachedFileName(f.name);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        if (typeof reader.result === 'string') {
                          setAttachedFileDataUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                  }}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <span className="text-xs text-sky-700 font-semibold">
                    {attachedFileName ? `File terpilih: ${attachedFileName}` : 'Pilih Surat Permohonan (PDF/Foto)'}
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                6. Integrasi &amp; Notifikasi WhatsApp Tim Teknik
              </label>

              <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-lg">
                <input
                  type="checkbox"
                  checked={sendWaToTeknik}
                  onChange={(e) => setSendWaToTeknik(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 mt-0.5"
                />
                <span className="leading-snug">
                  <strong className="text-emerald-950 block">
                    Kirim Notifikasi WA ke Tim Teknik saat disimpan
                  </strong>
                  <span className="text-[11px] text-emerald-800">
                    Berisi informasi pelanggan, No. HP pelanggan ({kontakPerson || 'belum diisi'}), dan link Google Maps titik survei.
                  </span>
                </span>
              </label>

              {sendWaToTeknik && (
                <div className="space-y-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nomor WhatsApp Tim Teknik / Piket Survei ULP Borobudur:
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-2.5" />
                      <input
                        type="tel"
                        value={teknikWaPhone}
                        onChange={(e) => setTeknikWaPhone(e.target.value)}
                        placeholder="Contoh: 08112500123"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowWaPreview(!showWaPreview)}
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-600" />
                    {showWaPreview
                      ? 'Sembunyikan draf WA Tim Teknik'
                      : 'Lihat draf WA ke Tim Teknik (Info Pelanggan, No. HP & Maps)'}
                  </button>

                  {showWaPreview && (
                    <div className="p-2.5 bg-emerald-950 text-emerald-100 border border-emerald-800 rounded-lg text-[11px] space-y-1 font-mono whitespace-pre-wrap max-h-44 overflow-y-auto">
                      {liveWaPayload.message}
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={syncToSheets}
                  onChange={(e) => setSyncToSheets(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span className="flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Sinkronkan baris ini secara otomatis ke Google Sheets
                </span>
              </label>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              Batal
            </button>

            <button
              type="submit"
              className="px-5 py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Simpan &amp; Kirim WA ke Tim Teknik</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
