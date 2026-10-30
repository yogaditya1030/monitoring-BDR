import React from 'react';
import { UserRole, GoogleSheetSyncState } from '../types';
import {
  FileSpreadsheet,
  PlusCircle,
  Shield,
  Wrench,
  HardHat,
  Zap,
  Users,
  Layers,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface NavbarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onOpenQuickIntake: () => void;
  onOpenGoogleSheets: () => void;
  sheetsState: GoogleSheetSyncState;
  onTriggerSync: () => void;
  totalRecords: number;
  pendingPfkCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onRoleChange,
  onOpenQuickIntake,
  onOpenGoogleSheets,
  sheetsState,
  onTriggerSync,
  totalRecords,
  pendingPfkCount,
}) => {
  const roles: { id: UserRole; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'all', label: 'Semua Bagian (All)', icon: <Layers className="w-4 h-4" />, color: 'hover:bg-slate-100' },
    { id: 'security', label: 'Security / Front Desk', icon: <Shield className="w-4 h-4" />, color: 'hover:bg-blue-50' },
    { id: 'pp', label: 'Pelayanan Pelanggan (PP)', icon: <Users className="w-4 h-4" />, color: 'hover:bg-teal-50' },
    { id: 'teknik', label: 'Teknik', icon: <Wrench className="w-4 h-4" />, color: 'hover:bg-amber-50' },
    { id: 'k3l', label: 'K3L', icon: <HardHat className="w-4 h-4" />, color: 'hover:bg-purple-50' },
    { id: 'te', label: 'Transaksi Energi (TE)', icon: <Zap className="w-4 h-4" />, color: 'hover:bg-emerald-50' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner PLN */}
      <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-blue-900 text-white px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-2.5">
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Authentic Official PLN Emblem Logo */}
            <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg shadow-xs border border-slate-100">
              <svg
                viewBox="0 0 100 130"
                className="w-7 h-9 shrink-0 drop-shadow-xs"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Lambang Resmi PT PLN (Persero)"
              >
                {/* Dasar Persegi Kuning Keemasan PLN */}
                <rect
                  x="4"
                  y="4"
                  width="92"
                  height="122"
                  rx="8"
                  fill="#FFCC00"
                  stroke="#005B94"
                  strokeWidth="5"
                />

                {/* Tiga Gelombang Biru Sejajar (Tenaga Listrik & Tri Dharma) */}
                <path
                  d="M16 50 C28 41, 40 59, 52 50 C64 41, 74 48, 84 50"
                  stroke="#0072BC"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M16 70 C28 61, 40 79, 52 70 C64 61, 74 68, 84 70"
                  stroke="#0072BC"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M16 90 C28 81, 40 99, 52 90 C64 81, 74 88, 84 90"
                  stroke="#0072BC"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Petir / Kilat Merah Tajam Khas PLN */}
                <path
                  d="M72 16 L30 63 L54 63 L24 114 L76 55 L50 55 Z"
                  fill="#E60000"
                  stroke="#A80000"
                  strokeWidth="1.5"
                  strokeLinejoin="miter"
                />
              </svg>
              <div className="leading-tight text-sky-950">
                <div className="font-extrabold tracking-wide text-xs">ULP Borobudur</div>
                <div className="text-[10px] font-bold text-sky-800">UP3 Magelang</div>
              </div>
            </div>

            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Monitoring Progres PBPD & PFK Terpadu
              </h1>
              <p className="text-xs text-sky-200 hidden sm:block">
                Sistem Monitoring Pelayanan Pasang Baru, Perubahan Daya & PFK
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Google Sheets Connection Pill */}
            <button
              onClick={onOpenGoogleSheets}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                sheetsState.isConnected
                  ? 'bg-emerald-900/60 border-emerald-400 text-emerald-200 hover:bg-emerald-800'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
              title="Kelola Integrasi Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
              <span className="hidden md:inline">
                {sheetsState.isConnected
                  ? sheetsState.spreadsheetTitle || 'Google Sheets Terhubung'
                  : 'Hubungkan Google Sheets'}
              </span>
              {sheetsState.isConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>

            {sheetsState.isConnected && (
              <button
                onClick={onTriggerSync}
                disabled={sheetsState.syncInProgress}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                title="Sinkronisasi Data ke Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sheetsState.syncInProgress ? 'animate-spin' : ''}`} />
              </button>
            )}

            {/* Quick Intake Button for Customer Intake / Security */}
            <button
              onClick={onOpenQuickIntake}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-md transition transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4 text-slate-900" />
              <span>Input Permohonan Baru</span>
              {pendingPfkCount > 0 && (
                <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.2 rounded-full ml-1 animate-pulse">
                  {pendingPfkCount} PFK
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Role Navigation Bar */}
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-2 flex items-center justify-between overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-xs font-semibold text-slate-500 mr-1 hidden lg:inline">Peran / Bagian:</span>
          {roles.map((r) => {
            const isActive = currentRole === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onRoleChange(r.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                {r.icon}
                <span>{r.label}</span>
                {r.id === 'teknik' && pendingPfkCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                    {pendingPfkCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Total: <strong className="text-slate-800">{totalRecords}</strong> data permohonan
          </span>
        </div>
      </div>
    </header>
  );
};
