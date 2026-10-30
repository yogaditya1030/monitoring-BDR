import React from 'react';
import { StatusPermohonan, TransaksiType } from '../types';

interface StatusBadgeProps {
  status: StatusPermohonan;
  showRoleInfo?: boolean;
}

export const StatusWorkflowBadge: React.FC<StatusBadgeProps> = ({ status, showRoleInfo = false }) => {
  const config: Record<
    StatusPermohonan,
    { label: string; bg: string; text: string; border: string; dot: string; role: string; icon: string }
  > = {
    MOHON: {
      label: 'MOHON (Verifikasi Dokumen)',
      bg: 'bg-blue-50/90 hover:bg-blue-100/90',
      text: 'text-blue-950',
      border: 'border-blue-300/90',
      dot: 'bg-blue-600',
      role: 'Pelayanan Pelanggan (PP)',
      icon: '📋',
    },
    'SURVEI/RAB': {
      label: 'SURVEI / RAB',
      bg: 'bg-amber-50/95 hover:bg-amber-100/90',
      text: 'text-amber-950',
      border: 'border-amber-400/90',
      dot: 'bg-amber-500',
      role: 'Teknik',
      icon: '📐',
    },
    'TANPA PERLUASAN': {
      label: 'TANPA PERLUASAN',
      bg: 'bg-cyan-50/90 hover:bg-cyan-100/90',
      text: 'text-cyan-950',
      border: 'border-cyan-300',
      dot: 'bg-cyan-600',
      role: 'Teknik / PP',
      icon: '⚡',
    },
    BAYAR: {
      label: 'BAYAR (Menunggu Pelunasan BP)',
      bg: 'bg-orange-50/95 hover:bg-orange-100/90',
      text: 'text-orange-950',
      border: 'border-orange-400',
      dot: 'bg-orange-600',
      role: 'Pelayanan Pelanggan (PP)',
      icon: '💳',
    },
    KERJA: {
      label: 'KERJA (Eksekusi & Permit)',
      bg: 'bg-purple-50/90 hover:bg-purple-100/90',
      text: 'text-purple-950',
      border: 'border-purple-300',
      dot: 'bg-purple-600',
      role: 'K3L & Vendor Teknik',
      icon: '👷',
    },
    NYALA: {
      label: 'NYALA (Komisioning TE)',
      bg: 'bg-emerald-50/95 hover:bg-emerald-100/90',
      text: 'text-emerald-950',
      border: 'border-emerald-400',
      dot: 'bg-emerald-600',
      role: 'Transaksi Energi (TE)',
      icon: '💡',
    },
    PDL: {
      label: 'PDL (Selesai Administrasi)',
      bg: 'bg-slate-100 hover:bg-slate-200/80',
      text: 'text-slate-900',
      border: 'border-slate-300',
      dot: 'bg-slate-600',
      role: 'Pelayanan Pelanggan (PP)',
      icon: '✅',
    },
  };

  const current = config[status] || {
    label: status,
    bg: 'bg-slate-100',
    text: 'text-slate-800',
    border: 'border-slate-300',
    dot: 'bg-slate-500',
    role: '-',
    icon: '•',
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border shadow-2xs transition-colors ${current.bg} ${current.text} ${current.border}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${current.dot}`} />
        <span className="text-[11px] leading-tight font-bold">{current.label}</span>
      </span>
      {showRoleInfo && (
        <span className="text-[10px] text-slate-500 px-1 font-medium flex items-center gap-1">
          <span>{current.icon}</span>
          <span>PJ: {current.role}</span>
        </span>
      )}
    </div>
  );
};

export const TransaksiBadge: React.FC<{ transaksi: TransaksiType }> = ({ transaksi }) => {
  const styles: Record<
    TransaksiType,
    { code: string; label: string; bg: string; text: string; border: string; tagBg: string; tagText: string; desc: string }
  > = {
    PB: {
      code: 'PB',
      label: 'Pasang Baru',
      bg: 'bg-sky-50/90 hover:bg-sky-100/90',
      text: 'text-sky-950',
      border: 'border-sky-300',
      tagBg: 'bg-sky-600',
      tagText: 'text-white',
      desc: 'Penyambungan pelanggan baru',
    },
    PD: {
      code: 'PD',
      label: 'Perubahan Daya',
      bg: 'bg-indigo-50/90 hover:bg-indigo-100/90',
      text: 'text-indigo-950',
      border: 'border-indigo-300',
      tagBg: 'bg-indigo-600',
      tagText: 'text-white',
      desc: 'Tambah/turun daya pelanggan',
    },
    PFK: {
      code: 'PFK',
      label: 'PFK',
      bg: 'bg-amber-100/90 hover:bg-amber-200/80',
      text: 'text-amber-950',
      border: 'border-amber-400',
      tagBg: 'bg-amber-600',
      tagText: 'text-white',
      desc: 'Permohonan PFK - langsung ke Teknik untuk survei segera',
    },
  };

  const item = styles[transaksi] || styles.PB;

  return (
    <span
      title={item.desc}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border shadow-2xs transition-colors ${item.bg} ${item.text} ${item.border}`}
    >
      <span
        className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold tracking-wide shrink-0 ${item.tagBg} ${item.tagText}`}
      >
        {item.code}
      </span>
      <span className="text-[11px] font-semibold">{item.label}</span>
    </span>
  );
};
