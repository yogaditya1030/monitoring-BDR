import React, { useMemo, useState } from 'react';
import { PermohonanItem, StatusPermohonan } from '../types';
import {
  summarizePipelineByStatus,
  formatRupiah,
  PipelineStageSummary,
} from '../utils/plnValidation';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Layers,
  RotateCcw,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface DashboardWidgetProps {
  records: PermohonanItem[];
  selectedStatus: string;
  selectedTransaksi?: string;
  onSelectStatus: (status: string) => void;
  onSelectTransaksi?: (transaksi: string) => void;
  onSelectRecord?: (record: PermohonanItem) => void;
}

const STAGE_STYLES: Record<
  StatusPermohonan,
  {
    bg: string;
    activeBg: string;
    border: string;
    activeBorder: string;
    barColor: string;
    badgeBg: string;
    badgeText: string;
    icon: string;
  }
> = {
  MOHON: {
    bg: 'bg-blue-50/60 hover:bg-blue-50',
    activeBg: 'bg-blue-100/90 ring-2 ring-blue-500',
    border: 'border-blue-200',
    activeBorder: 'border-blue-600',
    barColor: 'bg-blue-600',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-900',
    icon: '📋',
  },
  SURVEI: {
    bg: 'bg-amber-50/70 hover:bg-amber-50',
    activeBg: 'bg-amber-100/90 ring-2 ring-amber-500',
    border: 'border-amber-300',
    activeBorder: 'border-amber-600',
    barColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-950',
    icon: '📐',
  },
  RAB: {
    bg: 'bg-indigo-50/70 hover:bg-indigo-50',
    activeBg: 'bg-indigo-100/90 ring-2 ring-indigo-500',
    border: 'border-indigo-200',
    activeBorder: 'border-indigo-600',
    barColor: 'bg-indigo-600',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-950',
    icon: '🧮',
  },
  'TANPA PERLUASAN': {
    bg: 'bg-cyan-50/60 hover:bg-cyan-50',
    activeBg: 'bg-cyan-100/90 ring-2 ring-cyan-500',
    border: 'border-cyan-200',
    activeBorder: 'border-cyan-600',
    barColor: 'bg-cyan-600',
    badgeBg: 'bg-cyan-100',
    badgeText: 'text-cyan-950',
    icon: '⚡',
  },
  BAYAR: {
    bg: 'bg-orange-50/70 hover:bg-orange-50',
    activeBg: 'bg-orange-100/90 ring-2 ring-orange-500',
    border: 'border-orange-200',
    activeBorder: 'border-orange-600',
    barColor: 'bg-orange-500',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-950',
    icon: '💳',
  },
  KERJA: {
    bg: 'bg-purple-50/70 hover:bg-purple-50',
    activeBg: 'bg-purple-100/90 ring-2 ring-purple-500',
    border: 'border-purple-200',
    activeBorder: 'border-purple-600',
    barColor: 'bg-purple-600',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-950',
    icon: '👷',
  },
  NYALA: {
    bg: 'bg-emerald-50/70 hover:bg-emerald-50',
    activeBg: 'bg-emerald-100/90 ring-2 ring-emerald-500',
    border: 'border-emerald-200',
    activeBorder: 'border-emerald-600',
    barColor: 'bg-emerald-600',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-950',
    icon: '💡',
  },
  PDL: {
    bg: 'bg-slate-50 hover:bg-slate-100/80',
    activeBg: 'bg-slate-200/80 ring-2 ring-slate-600',
    border: 'border-slate-200',
    activeBorder: 'border-slate-600',
    barColor: 'bg-slate-600',
    badgeBg: 'bg-slate-200',
    badgeText: 'text-slate-900',
    icon: '✅',
  },
};

export const DashboardWidget: React.FC<DashboardWidgetProps> = ({
  records,
  selectedStatus,
  selectedTransaksi = 'ALL',
  onSelectStatus,
  onSelectTransaksi,
  onSelectRecord,
}) => {
  // Default collapsed so the primary work table is immediately visible above the fold
  const [isExpanded, setIsExpanded] = useState(false);

  const summary = useMemo(() => summarizePipelineByStatus(records), [records]);

  const totalDayaKva = useMemo(
    () => records.reduce((acc, curr) => acc + (curr.dayaBaru || 0), 0) / 1000,
    [records]
  );

  const pfkCount = useMemo(
    () => records.filter((r) => r.transaksi === 'PFK').length,
    [records]
  );

  // Display primary stages (always show main 7 stages, plus TANPA PERLUASAN if it has records)
  const visibleStages = useMemo(() => {
    return summary.stages.filter(
      (s) => s.status !== 'TANPA PERLUASAN' || s.count > 0 || selectedStatus === 'TANPA PERLUASAN'
    );
  }, [summary.stages, selectedStatus]);

  const handleStageClick = (status: StatusPermohonan) => {
    if (selectedStatus === status) {
      onSelectStatus('ALL');
    } else {
      onSelectStatus(status);
    }
  };

  return (
    <section
      aria-label="Ringkasan Pipeline & Deteksi Bottleneck Status"
      className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
    >
      {/* Compact Header & Key Summary Bar */}
      <div className="px-3.5 sm:px-4 py-2.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-400 text-slate-950 rounded-md">
              <Activity className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <h2 className="text-xs sm:text-sm font-bold tracking-tight">
              Ringkasan Tahapan &amp; Pipeline
            </h2>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-white">{summary.totalRecords}</strong> Total ({totalDayaKva.toLocaleString('id-ID')} kVA)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-amber-300">{summary.activeBacklogCount}</strong> Aktif
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-emerald-300">{summary.completedPdlCount}</strong> Selesai PDL
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Bottleneck Callout Button */}
          {summary.topBottleneck && (
            <button
              type="button"
              onClick={() => onSelectStatus(summary.topBottleneck!.status)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-bold transition cursor-pointer"
              title={`Filter langsung ke bottleneck tertinggi: ${summary.topBottleneck.shortLabel}`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-700 shrink-0" />
              <span className="hidden md:inline">Bottleneck:</span>
              <span>
                {summary.topBottleneck.shortLabel} ({summary.topBottleneck.count})
              </span>
            </button>
          )}

          {summary.surveyedWithoutRabCount > 0 && (
            <button
              type="button"
              onClick={() => onSelectStatus('SURVEI')}
              className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-semibold transition cursor-pointer"
              title="Permohonan sudah disurvei namun belum dibuatkan RAB"
            >
              <span>⚠️ {summary.surveyedWithoutRabCount} Belum Buat RAB</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Sembunyikan detail pipeline' : 'Tampilkan detail pipeline'}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-semibold transition cursor-pointer"
          >
            <span>{isExpanded ? 'Tutup Detail' : 'Detail Analitik'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Unified Single-Line Interactive Stage Filter Strip + Thin Progress Bar */}
      <div className="px-3.5 sm:px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {/* All Button */}
          <button
            type="button"
            onClick={() => {
              onSelectStatus('ALL');
              if (onSelectTransaksi) onSelectTransaksi('ALL');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 border ${
              selectedStatus === 'ALL' && selectedTransaksi === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>Semua</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded ${
                selectedStatus === 'ALL' && selectedTransaksi === 'ALL'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {records.length}
            </span>
          </button>

          {/* PFK Quick Filter Button */}
          {onSelectTransaksi && (
            <button
              type="button"
              onClick={() => {
                if (selectedTransaksi === 'PFK') {
                  onSelectTransaksi('ALL');
                } else {
                  onSelectTransaksi('PFK');
                  onSelectStatus('ALL');
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                selectedTransaksi === 'PFK'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                  : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
              }`}
            >
              <span>⚡ PFK</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded font-extrabold ${
                  selectedTransaksi === 'PFK'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-200/80 text-amber-950'
                }`}
              >
                {pfkCount}
              </span>
            </button>
          )}

          {/* Stage Buttons */}
          {visibleStages.map((stage) => {
            const isSelected = selectedStatus === stage.status;
            const style = STAGE_STYLES[stage.status];
            const compactLabel =
              stage.status === 'MOHON'
                ? '1. Mohon'
                : stage.status === 'SURVEI'
                ? '2. Survei'
                : stage.status === 'RAB'
                ? '3. RAB'
                : stage.status === 'BAYAR'
                ? '4. Bayar'
                : stage.status === 'KERJA'
                ? '5. Kerja & K3L'
                : stage.status === 'NYALA'
                ? '6. Nyala TE'
                : stage.status === 'PDL'
                ? '7. Selesai PDL'
                : stage.shortLabel;

            return (
              <button
                key={`chip-${stage.status}`}
                type="button"
                onClick={() => handleStageClick(stage.status)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? `${style.activeBg} ${style.activeBorder} text-slate-950 font-bold`
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{style.icon}</span>
                <span>{compactLabel}</span>
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${style.badgeBg} ${style.badgeText}`}
                >
                  {stage.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Thin Segmented Progress Bar */}
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex gap-0.5">
          {summary.stages.map((st) => {
            if (st.count === 0) return null;
            const style = STAGE_STYLES[st.status];
            return (
              <div
                key={`bar-${st.status}`}
                onClick={() => handleStageClick(st.status)}
                style={{ width: `${Math.max(st.percentage, 5)}%` }}
                title={`${st.shortLabel}: ${st.count} permohonan (${st.percentage}%)`}
                className={`h-full first:rounded-l-full last:rounded-r-full transition-all cursor-pointer hover:opacity-85 ${style.barColor}`}
              />
            );
          })}
        </div>
      </div>

      {/* Expandable Detailed Stage Cards Grid (On-Demand) */}
      {isExpanded && (
        <div className="p-4 space-y-3 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
            {visibleStages.map((stage: PipelineStageSummary) => {
              const style = STAGE_STYLES[stage.status];
              const isSelected = selectedStatus === stage.status;
              const kvaTotal = stage.totalDayaVa / 1000;

              return (
                <button
                  key={stage.status}
                  type="button"
                  onClick={() => handleStageClick(stage.status)}
                  aria-pressed={isSelected}
                  className={`text-left p-3 rounded-xl border transition flex flex-col justify-between cursor-pointer relative ${
                    isSelected
                      ? `${style.activeBg} ${style.activeBorder} shadow-sm`
                      : `${style.bg} ${style.border}`
                  }`}
                >
                  {/* Top Row: Stage Icon, Title & Bottleneck Tag */}
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] font-extrabold text-slate-900 leading-tight flex items-center gap-1">
                        <span>{style.icon}</span>
                        <span>{stage.shortLabel}</span>
                      </span>
                      {stage.isBottleneck && (
                        <span
                          title="Tahap dengan antrean aktif terbanyak"
                          className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider shrink-0"
                        >
                          Bottleneck
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      PJ: {stage.department}
                    </div>

                    {/* Count & Share */}
                    <div className="flex items-baseline justify-between mt-2">
                      <div className="text-2xl font-black text-slate-950 leading-none">
                        {stage.count}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.badgeText}`}
                      >
                        {stage.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Middle Breakdown: PB / PD / PFK */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/80 space-y-1 text-[10px]">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>PB: <strong>{stage.pbCount}</strong></span>
                      <span>PD: <strong>{stage.pdCount}</strong></span>
                      {stage.pfkCount > 0 && (
                        <span className="text-amber-900 font-bold">⚡ PFK: {stage.pfkCount}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-slate-600 font-medium pt-0.5">
                      <span>Daya:</span>
                      <span className="font-bold text-slate-900">
                        {kvaTotal.toLocaleString('id-ID')} kVA
                      </span>
                    </div>

                    {stage.status === 'SURVEI' && stage.awaitingRabCount > 0 ? (
                      <div className="text-[10px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300 rounded px-1.5 py-0.5 text-center mt-1">
                        {stage.awaitingRabCount} Belum Buat RAB
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-slate-600 font-medium">
                        <span>RAB:</span>
                        <span className="font-mono font-semibold text-slate-800 truncate max-w-[95px]">
                          {stage.totalRab > 0 ? formatRupiah(stage.totalRab) : '-'}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Stage Quick Preview List (when a stage filter is active) */}
          {selectedStatus !== 'ALL' && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Filter className="w-3.5 h-3.5 text-sky-700" />
                <span>
                  Menampilkan khusus tahap <strong>{selectedStatus}</strong>:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {records
                    .filter((r) => r.status === selectedStatus)
                    .slice(0, 4)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectRecord && onSelectRecord(item)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-sky-100 text-slate-800 hover:text-sky-900 border border-slate-200 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>{item.projectName}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
