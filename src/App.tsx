import React, { useState, useEffect } from 'react';
import { PermohonanItem, UserRole, GoogleSheetSyncState } from './types';
import { INITIAL_PLN_RECORDS } from './data/initialRecords';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { QuickIntakeModal } from './components/QuickIntakeModal';
import { DepartmentWorkflowModal } from './components/DepartmentWorkflowModal';
import { GoogleSheetsIntegrationModal } from './components/GoogleSheetsIntegrationModal';
import { PermohonanDetailModal } from './components/PermohonanDetailModal';
import {
  initAuth,
  appendRowToGoogleSheet,
  syncAllRecordsToGoogleSheet,
} from './services/googleSheetsService';
import { CheckCircle2, AlertCircle, Bell } from 'lucide-react';

const STORAGE_KEY = 'PLN_PBPD_PFK_RECORDS_V1';

export default function App() {
  const [records, setRecords] = useState<PermohonanItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  // Handle new record creation from Quick Intake
  const handleAddNewRecord = async (newRecord: PermohonanItem, shouldSyncToSheet: boolean) => {
    setRecords((prev) => [newRecord, ...prev]);

    const isPfk = newRecord.transaksi === 'PFK';
    showToast(
      isPfk
        ? `⚡ Permohonan PFK "${newRecord.projectName}" berhasil dibuat & langsung terhubung ke Tim Teknik!`
        : `Permohonan ${newRecord.transaksi} "${newRecord.projectName}" berhasil didaftarkan (Tahap Verifikasi PP).`,
      isPfk ? 'info' : 'success'
    );

    // Auto-sync row to Google Sheets if connected and requested
    if (shouldSyncToSheet && sheetsState.isConnected && sheetsState.spreadsheetId) {
      try {
        await appendRowToGoogleSheet(sheetsState.spreadsheetId, newRecord);
        showToast('Data berhasil ditambahkan ke Google Spreadsheet secara realtime!', 'success');
      } catch (err) {
        console.error('Failed to append row to Google Sheet', err);
      }
    }
  };

  // Handle record updates from Department Workflow
  const handleUpdateRecord = async (updatedRecord: PermohonanItem) => {
    setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
    showToast(`Data permohonan "${updatedRecord.projectName}" berhasil diperbarui.`);

    // If detail modal is open for this item, keep it updated
    if (selectedRecordForDetail?.id === updatedRecord.id) {
      setSelectedRecordForDetail(updatedRecord);
    }

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
    (r) => r.transaksi === 'PFK' && r.status === 'SURVEI/RAB'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
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
        sheetsState={sheetsState}
        onTriggerSync={handleTriggerSync}
        totalRecords={records.length}
        pendingPfkCount={pendingPfkCount}
      />

      {/* Main Content Area */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 flex-1">
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
            Terintegrasi dengan Google Sheets API • K3L • Teknik • TE • PP
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
        />
      )}

      <GoogleSheetsIntegrationModal
        isOpen={isGoogleSheetsOpen}
        onClose={() => setIsGoogleSheetsOpen(false)}
        sheetsState={sheetsState}
        onUpdateState={(next) => setSheetsState((prev) => ({ ...prev, ...next }))}
        records={records}
      />
    </div>
  );
}
