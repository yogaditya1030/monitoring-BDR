import React, { useState } from 'react';
import { GoogleSheetSyncState, PermohonanItem } from '../types';
import {
  googleSignIn,
  logoutGoogle,
  createMonitoringSpreadsheet,
  syncAllRecordsToGoogleSheet,
  SPREADSHEET_COLUMNS,
} from '../services/googleSheetsService';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Plus,
  Link as LinkIcon,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetsState: GoogleSheetSyncState;
  onUpdateState: (newState: Partial<GoogleSheetSyncState>) => void;
  records: PermohonanItem[];
}

export const GoogleSheetsIntegrationModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  sheetsState,
  onUpdateState,
  records,
}) => {
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [customSheetId, setCustomSheetId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setErrorMsg('');
    try {
      const res = await googleSignIn();
      if (res) {
        onUpdateState({
          isConnected: true,
          userEmail: res.user.email,
        });
        setSuccessMsg(`Berhasil terhubung dengan akun Google: ${res.user.email}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal login dengan akun Google');
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    onUpdateState({
      isConnected: false,
      userEmail: null,
      spreadsheetId: null,
      spreadsheetUrl: null,
    });
    setSuccessMsg('Telah keluar dari akun Google');
  };

  const handleCreateNewSheet = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsCreatingSheet(true);

    try {
      const title = `PLN PBPD & PFK Monitoring - ULP Borobudur, UP3 Magelang, UID Jawa Tengah (${new Date().toLocaleDateString('id-ID')})`;
      const result = await createMonitoringSpreadsheet(title, records);
      onUpdateState({
        spreadsheetId: result.spreadsheetId,
        spreadsheetTitle: title,
        spreadsheetUrl: result.spreadsheetUrl,
        lastSyncedAt: new Date().toLocaleTimeString('id-ID'),
      });
      setSuccessMsg('Google Spreadsheet monitoring berhasil dibuat dan disinkronkan!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat Google Spreadsheet baru');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleLinkExistingSheet = () => {
    if (!customSheetId.trim()) return;

    let cleanId = customSheetId.trim();
    // if full url is pasted: extract ID
    const urlMatch = cleanId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      cleanId = urlMatch[1];
    }

    onUpdateState({
      spreadsheetId: cleanId,
      spreadsheetTitle: `Spreadsheet Terhubung (${cleanId.slice(0, 8)}...)`,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
      lastSyncedAt: null,
    });
    setSuccessMsg('ID Google Spreadsheet berhasil ditautkan.');
  };

  const handleTriggerSync = async () => {
    if (!sheetsState.spreadsheetId) return;

    // MANDATORY confirmation per workspace-integration rules before writing
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menyinkronkan seluruh ${records.length} data permohonan ke Google Spreadsheet? Baris lama pada sheet akan diperbarui dengan data termutakhir.`
    );
    if (!confirmed) return;

    setIsSyncing(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const ok = await syncAllRecordsToGoogleSheet(sheetsState.spreadsheetId, records);
      if (ok) {
        onUpdateState({
          lastSyncedAt: new Date().toLocaleTimeString('id-ID'),
        });
        setSuccessMsg(`Berhasil menyinkronkan ${records.length} baris data ke Google Spreadsheet!`);
      } else {
        throw new Error('Gagal menyinkronkan data.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat menyinkronkan ke Google Sheets.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-400 text-slate-900 rounded-lg">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Integrasi Otomatis Google Sheets
              </h2>
              <p className="text-xs text-emerald-200">
                Sinkronisasi data permohonan PBPD & PFK langsung ke lembar kerja spreadsheet cloud
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-emerald-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Google Account Connection */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              1. Status Autentikasi Google Workspace
            </h3>

            {!sheetsState.isConnected ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Belum Terhubung dengan Akun Google
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Masuk dengan akun Google untuk mengaktifkan sinkronisasi otomatis ke Google Drive & Sheets Anda.
                  </div>
                </div>

                {/* Official Google Sign-in Button */}
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="flex items-center gap-3 px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      Terhubung: {sheetsState.userEmail}
                    </div>
                    <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Akses Izin Google Sheets & Drive File Aktif
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Spreadsheet Selection / Creation */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Google Spreadsheet Tujuan Sinkronisasi
            </h3>

            {sheetsState.spreadsheetUrl ? (
              <div className="p-4 bg-emerald-50/60 border border-emerald-300 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    {sheetsState.spreadsheetTitle || 'Lembar Kerja Monitoring PLN'}
                  </div>
                  <div className="text-[11px] text-emerald-800 font-mono mt-0.5">
                    ID: {sheetsState.spreadsheetId}
                  </div>
                  {sheetsState.lastSyncedAt && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      Terakhir disinkronkan: <strong>{sheetsState.lastSyncedAt}</strong>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={sheetsState.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition shadow-xs"
                  >
                    <span>Buka Spreadsheet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={handleTriggerSync}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkron Sekarang'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option A: Create New Sheet */}
                <div className="p-4 border border-dashed border-emerald-400 bg-emerald-50/30 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-700" />
                      Buat Google Spreadsheet Otomatis
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Sistem akan membuat file spreadsheet baru di Google Drive Anda dengan 33 kolom lengkap sesuai standar data PLN.
                    </div>
                  </div>
                  <button
                    onClick={handleCreateNewSheet}
                    disabled={!sheetsState.isConnected || isCreatingSheet}
                    className="mt-4 w-full py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{isCreatingSheet ? 'Membuat Spreadsheet...' : 'Buat Spreadsheet Baru'}</span>
                  </button>
                </div>

                {/* Option B: Link Existing Sheet */}
                <div className="p-4 border border-slate-200 bg-slate-50 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <LinkIcon className="w-4 h-4 text-slate-600" />
                      Tautkan Spreadsheet yang Sudah Ada
                    </div>
                    <div className="text-xs text-slate-600 mt-1 mb-2">
                      Masukkan ID atau URL Google Spreadsheet yang ingin Anda gunakan.
                    </div>
                    <input
                      type="text"
                      placeholder="Tempel URL atau ID Spreadsheet"
                      value={customSheetId}
                      onChange={(e) => setCustomSheetId(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    />
                  </div>
                  <button
                    onClick={handleLinkExistingSheet}
                    disabled={!sheetsState.isConnected || !customSheetId.trim()}
                    className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold shadow-xs transition"
                  >
                    Tautkan Spreadsheet
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Column Mapping & Live Preview */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              3. Struktur Kolom Data Monitoring (33 Kolom Sesuai PDF PLN)
            </h3>
            <div className="p-3 bg-slate-100 rounded-lg max-h-36 overflow-y-auto text-[11px] font-mono text-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-1">
              {SPREADSHEET_COLUMNS.map((col, idx) => (
                <div key={col} className="truncate">
                  <span className="text-slate-400 font-semibold">{idx + 1}.</span> {col}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
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
