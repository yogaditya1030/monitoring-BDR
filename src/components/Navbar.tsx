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
  Bot,
  Sparkles,
} from 'lucide-react';

interface NavbarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onOpenQuickIntake: () => void;
  onOpenGoogleSheets: () => void;
  onOpenAiChatbot: () => void;
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
  onOpenAiChatbot,
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
      <div className="bg-gradient-to-r from-sky-800 via-sky-900 to-slate-900 text-white px-2.5 sm:px-6 lg:px-8 xl:px-10 py-2">
        <div className="w-full flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
            {/* Authentic Official PLN Emblem Logo */}
            <div className="flex items-center gap-2 bg-white px-1.5 sm:px-2 py-1 rounded-lg shadow-xs border border-slate-100 shrink-0">
              <svg
                viewBox="0 0 100 130"
                className="w-5 h-7 sm:w-6 sm:h-8 shrink-0"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Lambang Resmi PT PLN (Persero)"
              >
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
                <path
                  d="M72 16 L30 63 L54 63 L24 114 L76 55 L50 55 Z"
                  fill="#E60000"
                  stroke="#A80000"
                  strokeWidth="1.5"
                  strokeLinejoin="miter"
                />
              </svg>
              <div className="leading-tight text-sky-950 hidden sm:block">
                <div className="font-extrabold tracking-wide text-[11px]">ULP Borobudur</div>
                <div className="text-[9px] font-bold text-sky-800">UP3 Magelang</div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="block text-xs sm:text-base font-bold tracking-tight text-white leading-tight whitespace-nowrap">
                Monitoring PBPD &amp; PFK
              </h1>
              <p className="flex flex-col text-[10px] sm:text-[11px] text-sky-200 leading-tight mt-0.5">
                <span className="font-semibold text-sky-100">ULP Borobudur</span>
                <span className="text-[9px] sm:text-[10px] text-sky-300">UP3 Magelang</span>
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* AI Chatbot & Report Generator Button */}
            <button
              onClick={onOpenAiChatbot}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition border bg-slate-950/75 hover:bg-slate-900 border-[#FFF200]/70 text-white shadow-xs cursor-pointer"
              title="Buka Chatbot AI Analis & Generator Laporan PLN"
            >
              <Bot className="w-3.5 h-3.5 text-[#FFF200] shrink-0" />
              <span className="hidden sm:inline">Chatbot AI &amp; Laporan</span>
              <span className="sm:hidden">AI</span>
            </button>

            {/* Google Sheets Connection Button */}
            <button
              onClick={onOpenGoogleSheets}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                sheetsState.isConnected
                  ? 'bg-emerald-900/60 border-emerald-400 text-emerald-200 hover:bg-emerald-800'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
              title="Kelola Integrasi Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span className="hidden lg:inline">
                {sheetsState.isConnected
                  ? sheetsState.spreadsheetTitle || 'Sheets Terhubung'
                  : 'Google Sheets'}
              </span>
              {sheetsState.isConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>

            {sheetsState.isConnected && (
              <button
                onClick={onTriggerSync}
                disabled={sheetsState.syncInProgress}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition cursor-pointer"
                title="Sinkronisasi Data ke Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sheetsState.syncInProgress ? 'animate-spin' : ''}`} />
              </button>
            )}

            {/* Primary Quick Intake Button */}
            <button
              onClick={onOpenQuickIntake}
              className="flex items-center gap-1 sm:gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-2 sm:px-3.5 py-1.5 rounded-lg text-xs shadow-xs transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-slate-900 shrink-0" />
              <span className="hidden sm:inline">Input Permohonan</span>
              <span className="sm:hidden">Input</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role Navigation Bar */}
      <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-10 py-1.5 flex items-center justify-between overflow-x-auto gap-2 bg-slate-50/70">
        <div className="flex items-center gap-1 min-w-max">
          <span className="text-[11px] font-semibold text-slate-500 mr-1 hidden lg:inline">Bagian:</span>
          {roles.map((r) => {
            const isActive = currentRole === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onRoleChange(r.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                {r.icon}
                <span>{r.label}</span>
                {r.id === 'teknik' && pendingPfkCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-amber-300 text-slate-950' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {pendingPfkCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>
            <strong className="text-slate-800">{totalRecords}</strong> permohonan
          </span>
        </div>
      </div>
    </header>
  );
};
