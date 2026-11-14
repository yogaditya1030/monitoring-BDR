import React, { useState, useEffect } from 'react';
import { PermohonanItem, UserRole, GoogleSheetSyncState } from './types';
import { INITIAL_PLN_RECORDS } from './data/initialRecords';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { QuickIntakeModal } from './components/QuickIntakeModal';
import { DepartmentWorkflowModal } from './components/DepartmentWorkflowModal';
import { GoogleSheetsIntegrationModal } from './components/GoogleSheetsIntegrationModal';
import { PermohonanDetailModal } from './components/PermohonanDetailModal';
import { AiReportChatbotModal } from './components/AiReportChatbotModal';
import {
  initAuth,
  appendRowToGoogleSheet,
  syncAllRecordsToGoogleSheet,
} from './services/googleSheetsService';
import {
  buildTeknikWaNotification,
  TeknikWaNotificationPayload,
  TEKNIK_WA_CONTACTS,
} from './utils/plnValidation';
import {
  CheckCircle2,
  AlertCircle,
  Send,
  Phone,
  MapPin,
  Copy,
  ExternalLink,
  X,
} from 'lucide-react';

const STORAGE_KEY = 'PLN_PBPD_PFK_RECORDS_V6';

export default function App() {
  const [records, setRecords] = useState<PermohonanItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: any) => ({
            ...r,
            status:
              r.status === 'SURVEI/RAB'
                ? r.rab && r.rab > 0
                  ? 'RAB'
                  : 'SURVEI'
                : r.status,
            keteranganStatus:
              typeof r.keteranganStatus === 'string'
                ? r.keteranganStatus.replace(/Jalur\s+(Kilat|Cepat)\s*/gi, 'Permohonan ')
                : r.keteranganStatus,
            historyLogs: Array.isArray(r.historyLogs)
              ? r.historyLogs.map((log: any) => ({
                  ...log,
                  action: typeof log.action === 'string' ? log.action.replace(/Jalur\s+(Kilat|Cepat)\s*/gi, '') : log.action,
                  notes: typeof log.notes === 'string' ? log.notes.replace(/Jalur\s+(Kilat|Cepat)\s*/gi, '') : log.notes,
                }))
              : [],
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to load records from storage, using initial data', e);
    }
    return INITIAL_PLN_RECORDS;
  });

  const [currentRole, setCurrentRole] = useState<UserRole>('all');
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<PermohonanItem | null>(null);
  const [selectedRecordForWorkflow, setSelectedRecordForWorkflow] = useState<PermohonanItem | null>(null);
  const [isQuickIntakeOpen, setIsQuickIntakeOpen] = useState(false);
  const [isGoogleSheetsOpen, setIsGoogleSheetsOpen] = useState(false);
  const [isAiChatbotOpen, setIsAiChatbotOpen] = useState(false);
  const [activeWaNotification, setActiveWaNotification] = useState<{
    record: PermohonanItem;
    payload: TeknikWaNotificationPayload;
  } | null>(null);
  const [waCopied, setWaCopied] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Google Sheets state
  const [sheetsState, setSheetsState] = useState<GoogleSheetSyncState>({
    isConnected: false,
    userEmail: null,
    spreadsheetId: null,
    spreadsheetTitle: null,
    spreadsheetUrl: null,
    lastSyncedAt: null,
    autoSync: true,
    syncInProgress: false,
  });

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }, [records]);

  // Init Google Auth listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setSheetsState((prev) => ({
          ...prev,
          isConnected: true,
          userEmail: user.email,
        }));
      },
      () => {
        setSheetsState((prev) => ({
          ...prev,
          isConnected: false,
          userEmail: null,
        }));
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handle new record creation from Quick Intake (otomatis kirim ke 3 personil Tim Teknik & otomatis sinkron)
  const handleAddNewRecord = async (
    newRecord: PermohonanItem,
    shouldSyncToSheet: boolean = true,
    _waOptions?: { sendToTeknik: boolean; teknikPhone: string }
  ) => {
    setRecords((prev) => [newRecord, ...prev]);

    const allTeknikSummary = TEKNIK_WA_CONTACTS.map(
      (c) => `${c.name} (${c.phone})`
    ).join(', ');

    const isPfk = newRecord.transaksi === 'PFK';
    showToast(
      isPfk
        ? `⚡ Permohonan PFK "${newRecord.projectName}" disimpan, otomatis dikirim ke 3 personil Tim Teknik (${allTeknikSummary}) & otomatis tersinkron!`
        : `Permohonan ${newRecord.transaksi} "${newRecord.projectName}" disimpan, otomatis dikirim ke 3 personil Tim Teknik (${allTeknikSummary}) & otomatis tersinkron!`,
      isPfk ? 'info' : 'success'
    );

    // Auto-sync row to Google Sheets whenever connected
    if (shouldSyncToSheet !== false && sheetsState.isConnected && sheetsState.spreadsheetId) {
      try {
        await appendRowToGoogleSheet(sheetsState.spreadsheetId, newRecord);
        showToast('Data berhasil disinkronkan secara otomatis ke Google Spreadsheet!', 'success');
      } catch (err) {
        console.error('Failed to append row to Google Sheet', err);
      }
    }
  };

  // Handle record updates from Department Workflow
  const handleUpdateRecord = async (updatedRecord: PermohonanItem) => {
    setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
    showToast(`Data permohonan "${updatedRecord.projectName}" (Gambar & RAB) berhasil disimpan.`);

    // Keep open modals synchronized with the latest saved record
    setSelectedRecordForDetail((prev) => (prev?.id === updatedRecord.id ? updatedRecord : prev));
    setSelectedRecordForWorkflow((prev) => (prev?.id === updatedRecord.id ? updatedRecord : prev));

    // Auto-sync full list if connected
    if (sheetsState.autoSync && sheetsState.isConnected && sheetsState.spreadsheetId) {
      try {
        const nextList = records.map((r) => (r.id === updatedRecord.id ? updatedRecord : r));
        await syncAllRecordsToGoogleSheet(sheetsState.spreadsheetId, nextList);
      } catch (err) {
        console.error('Background sync failed', err);
      }
    }
  };

  // Trigger manual sync
  const handleTriggerSync = async () => {
    if (!sheetsState.spreadsheetId) {
      setIsGoogleSheetsOpen(true);
      return;
    }

    setSheetsState((prev) => ({ ...prev, syncInProgress: true }));
    try {
      const ok = await syncAllRecordsToGoogleSheet(sheetsState.spreadsheetId, records);
      if (ok) {
        setSheetsState((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toLocaleTimeString('id-ID'),
          syncInProgress: false,
        }));
        showToast(`Berhasil menyinkronkan seluruh ${records.length} data ke Google Sheets.`);
      } else {
        throw new Error('Gagal menyinkronkan.');
      }
    } catch (e: any) {
      setSheetsState((prev) => ({ ...prev, syncInProgress: false }));
      showToast(e.message || 'Gagal menyinkronkan ke Google Sheets', 'error');
    }
  };

  const pendingPfkCount = records.filter(
    (r) => r.transaksi === 'PFK' && (r.status === 'SURVEI' || r.status === 'RAB')
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Notification Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 border ${
              toast.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-900'
                : toast.type === 'info'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        onOpenQuickIntake={() => setIsQuickIntakeOpen(true)}
        onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
        onOpenAiChatbot={() => setIsAiChatbotOpen(true)}
        sheetsState={sheetsState}
        onTriggerSync={handleTriggerSync}
        totalRecords={records.length}
        pendingPfkCount={pendingPfkCount}
      />

      {/* Main Content Area */}
      <main className="w-full px-3 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-5 flex-1">
        <DashboardOverview
          records={records}
          currentRole={currentRole}
          onSelectRecord={(rec) => setSelectedRecordForDetail(rec)}
          onOpenWorkflowAction={(rec) => setSelectedRecordForWorkflow(rec)}
          onOpenQuickIntake={() => setIsQuickIntakeOpen(true)}
          onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
        />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 text-center text-xs text-slate-500">
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} PT PLN (Persero) ULP Borobudur, UP3 Magelang, UID Jawa Tengah • Sistem Monitoring PBPD & PFK
          </span>
          <span className="flex items-center gap-2 text-[11px] text-slate-400">
            Aditya Yoga P.N
          </span>
        </div>
      </footer>

      {/* Modals */}
      <QuickIntakeModal
        isOpen={isQuickIntakeOpen}
        onClose={() => setIsQuickIntakeOpen(false)}
        onSubmit={handleAddNewRecord}
        isSheetsConnected={sheetsState.isConnected}
      />

      {selectedRecordForWorkflow && (
        <DepartmentWorkflowModal
          item={selectedRecordForWorkflow}
          currentRole={currentRole}
          isOpen={!!selectedRecordForWorkflow}
          onClose={() => setSelectedRecordForWorkflow(null)}
          onSave={handleUpdateRecord}
        />
      )}

      {selectedRecordForDetail && (
        <PermohonanDetailModal
          item={selectedRecordForDetail}
          currentRole={currentRole}
          isOpen={!!selectedRecordForDetail}
          onClose={() => setSelectedRecordForDetail(null)}
          onOpenWorkflowAction={(item) => setSelectedRecordForWorkflow(item)}
          onSave={handleUpdateRecord}
        />
      )}

      <GoogleSheetsIntegrationModal
        isOpen={isGoogleSheetsOpen}
        onClose={() => setIsGoogleSheetsOpen(false)}
        sheetsState={sheetsState}
        onUpdateState={(next) => setSheetsState((prev) => ({ ...prev, ...next }))}
        records={records}
      />

      <AiReportChatbotModal
        isOpen={isAiChatbotOpen}
        onClose={() => setIsAiChatbotOpen(false)}
        records={records}
        currentRole={currentRole}
      />

      {/* WhatsApp Notification Dispatch Modal for Tim Teknik */}
      {activeWaNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-400 text-slate-950 rounded-lg font-bold">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold">
                    Notifikasi WA ke Tim Teknik
                  </h3>
                  <p className="text-[11px] text-emerald-100">
                    Informasi Pelanggan, No. HP &amp; Titik Google Maps Survei
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveWaNotification(null)}
                className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Summary Highlights: Customer Info, Phone, Maps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">
                    Pelanggan &amp; Permohonan
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {activeWaNotification.record.projectName}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {activeWaNotification.record.transaksi}
                    {activeWaNotification.record.kategoriPfk
                      ? ` (${activeWaNotification.record.kategoriPfk})`
                      : ''}{' '}
                    • {activeWaNotification.record.dayaBaru.toLocaleString('id-ID')} VA
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-semibold text-emerald-800 uppercase flex items-center gap-1">
                    <Phone className="w-3 h-3" /> No. HP / WA Pelanggan
                  </div>
                  <div className="font-bold font-mono text-emerald-950 mt-0.5">
                    {activeWaNotification.payload.customerPhone}
                  </div>
                  <div className="text-[10px] text-emerald-700">
                    Tujuan WA Teknik: {activeWaNotification.payload.recipientName} ({activeWaNotification.payload.recipientPhone})
                  </div>
                </div>
              </div>

              {/* Daftar Kontak Tim Teknik */}
              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                  Pilih / Kirim Langsung ke Kontak Tim Teknik:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {activeWaNotification.payload.contactLinks.map((contact) => {
                    const isSelected =
                      activeWaNotification.payload.normalizedPhone === contact.normalizedPhone;
                    return (
                      <a
                        key={contact.phone}
                        href={contact.waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          setActiveWaNotification((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  payload: buildTeknikWaNotification(prev.record, contact.phone),
                                }
                              : null
                          );
                        }}
                        className={`p-2 rounded-lg border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                            : 'bg-white text-slate-800 border-emerald-200 hover:bg-emerald-100/70'
                        }`}
                      >
                        <div className="text-[11px] font-bold flex items-center justify-between gap-1">
                          <span className="truncate">{contact.name}</span>
                          <Send className="w-3 h-3 shrink-0" />
                        </div>
                        <div
                          className={`text-[10px] font-mono mt-0.5 ${
                            isSelected ? 'text-emerald-100' : 'text-slate-500'
                          }`}
                        >
                          {contact.phone}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-sky-800 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-rose-600" /> Link Google Maps Lokasi Survei
                  </div>
                  <div className="font-mono text-[11px] text-sky-950 truncate mt-0.5">
                    {activeWaNotification.payload.mapsUrl}
                  </div>
                </div>
                <a
                  href={activeWaNotification.payload.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-2.5 py-1.5 rounded-md bg-white border border-sky-300 text-sky-800 hover:bg-sky-100 text-[11px] font-semibold flex items-center gap-1"
                >
                  <span>Buka Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Full Formatted WA Message */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-700">
                    Isi Pesan WhatsApp untuk Tim Teknik:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeWaNotification.payload.message);
                      setWaCopied(true);
                      showToast('Pesan WA Tim Teknik berhasil disalin!', 'success');
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{waCopied ? 'Tersalin!' : 'Salin Pesan'}</span>
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 text-emerald-100 font-mono text-[11px] whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-700">
                  {activeWaNotification.payload.message}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveWaNotification(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Selesai
                </button>
                <a
                  href={activeWaNotification.payload.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    Kirim via WhatsApp ke {activeWaNotification.payload.recipientName}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

