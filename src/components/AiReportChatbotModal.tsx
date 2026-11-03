import React, { useState, useRef, useEffect } from 'react';
import { PermohonanItem, UserRole } from '../types';
import { buildPlnAiDataContext } from '../utils/plnValidation';
import {
  Bot,
  X,
  Send,
  Sparkles,
  FileText,
  Copy,
  Check,
  Download,
  RotateCcw,
  Zap,
  AlertTriangle,
  Compass,
  Calculator,
  ShieldCheck,
  Loader2,
  User,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  isError?: boolean;
}

interface AiReportChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: PermohonanItem[];
  currentRole: UserRole;
}

interface QuickPromptTemplate {
  id: string;
  label: string;
  badge: string;
  icon: React.ReactNode;
  prompt: string;
}

const QUICK_REPORT_TEMPLATES: QuickPromptTemplate[] = [
  {
    id: 'exec-summary',
    label: 'Laporan Eksekutif Semua Permohonan',
    badge: 'Executive Report',
    icon: <FileText className="w-3.5 h-3.5 text-sky-400" />,
    prompt:
      'Buatkan Laporan Eksekutif Monitoring Permohonan PBPD & PFK PLN ULP Borobudur secara lengkap, mencakup ringkasan statistik, rincian per tahapan status, total potensi RAB dan BP, serta rekomendasi prioritas tindak lanjut untuk manajemen.',
  },
  {
    id: 'survei-no-rab',
    label: 'Laporan Sudah Survei Belum Buat RAB',
    badge: 'Fokus Survei vs RAB',
    icon: <Calculator className="w-3.5 h-3.5 text-amber-400" />,
    prompt:
      'Buatkan laporan khusus daftar permohonan PBPD maupun PFK yang sudah selesai tahap Survei Lapangan atau sedang di tahap Penyusunan RAB tetapi nilai RAB-nya masih Rp 0 (belum dibuat RAB), lengkap dengan No Agenda, Nama Pelanggan, Petugas Surveyor, dan rekomendasi percepatannya.',
  },
  {
    id: 'pfk-report',
    label: 'Laporan Khusus Permohonan PFK',
    badge: 'Monitoring PFK',
    icon: <Zap className="w-3.5 h-3.5 text-purple-400" />,
    prompt:
      'Buatkan laporan monitoring khusus untuk seluruh permohonan PFK (Pekerjaan Fungsi Ketenagalistrikan), status progresnya saat ini (Survei, RAB, Konstruksi, Nyala), nilai RAB, serta status keselamatan K3L Working Permit-nya.',
  },
  {
    id: 'bottleneck-k3l-te',
    label: 'Evaluasi Bottleneck, K3L & Berkas PDL TE',
    badge: 'Audit Kepatuhan',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
    prompt:
      'Analisis titik penumpukan (bottleneck) tahapan permohonan saat ini, identifikasi pekerjaan Konstruksi yang perlu perhatian Working Permit K3L, serta evaluasi kelengkapan berkas PDL (SLO, Gambar Teknik, BA) untuk bagian Transaksi Energi (TE).',
  },
];

export const AiReportChatbotModal: React.FC<AiReportChatbotModalProps> = ({
  isOpen,
  onClose,
  records,
  currentRole,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      text: `Halo! Saya **Asisten AI Analis & Generator Laporan PLN ULP Borobudur**.\n\nSaya terhubung langsung dengan **${records.length} data permohonan PBPD & PFK** secara real-time (termasuk pemisahan tahapan **Survei Lapangan** dan **Penyusunan RAB**).\n\nSilakan pilih **Template Laporan Cepat** di bawah atau ketik pertanyaan maupun format laporan yang Anda butuhkan!`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.8-flash',
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [modelMode, setModelMode] = useState<'general' | 'fast'>('general');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    const historyForApi = messages
      .filter((m) => m.id !== 'welcome-msg' && !m.isError)
      .map((m) => ({
        role: m.role,
        text: m.text,
      }));

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const dataContext = buildPlnAiDataContext(records);
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi,
          dataContext,
          modelMode,
          roleContext: currentRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Gagal mendapatkan respons dari server AI.');
      }

      const aiMessage: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: data.reply || 'Maaf, tidak ada teks laporan yang dihasilkan.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || (modelMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash'),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Terjadi kesalahan jaringan saat menghubungi AI.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text: `⚠️ **Gagal Memproses Permintaan AI**\n${errMsg}`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(inputPrompt);
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback copy ignore
    }
  };

  const handleDownloadReport = (text: string, msgId: string) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const header = `====================================================================\nLAPORAN MONITORING PBPD & PFK - PT PLN (PERSERO) ULP BOROBUDUR\nUP3 MAGELANG - UID JAWA TENGAH & D.I. YOGYAKARTA\nTanggal Cetak: ${new Date().toLocaleString('id-ID')}\n====================================================================\n\n`;
    const blob = new Blob([header + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_PLN_ULP_Borobudur_${dateStr}_${msgId.slice(-4)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome-msg',
        role: 'model',
        text: `Percakapan telah direset. Saya siap menganalisis **${records.length} data permohonan PBPD & PFK** terbaru dan membuatkan laporan sesuai instruksi Anda.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: modelMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash',
      },
    ]);
  };

  // Count quick stats to show in header bar
  const surveiCount = records.filter((r) => r.status === 'SURVEI').length;
  const rabCount = records.filter((r) => r.status === 'RAB').length;
  const unpricedRabCount = records.filter(
    (r) => (r.status === 'SURVEI' || r.status === 'RAB') && (!r.rab || r.rab === 0)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/80 animate-fadeIn">
      <div className="relative w-full max-w-3xl h-full bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-[#062135] via-[#0A3556] to-[#0D4671] px-5 py-4 border-b border-sky-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00A2E9]/20 border border-[#FFF200]/60 flex items-center justify-center shadow-inner">
              <Bot className="w-5 h-5 text-[#FFF200]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  PLN AI Chatbot & Report Generator
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#FFF200] text-slate-950 rounded-md">
                  Real-time Data
                </span>
              </div>
              <p className="text-xs text-sky-200/90 mt-0.5">
                Tanya jawab interaktif & pembuatan laporan otomatis berbasis data PBPD & PFK ULP Borobudur
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetChat}
              title="Reset Percakapan"
              className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/60 transition text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Tutup Chatbot AI"
              className="p-2 rounded-lg bg-slate-800/70 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-600/60 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Context Bar & Model Mode Selector */}
        <div className="bg-slate-950/90 px-5 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Konteks Data: <strong className="text-white">{records.length} Permohonan</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-indigo-300">
              <Compass className="w-3.5 h-3.5" />
              Survei: <strong>{surveiCount}</strong>
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <Calculator className="w-3.5 h-3.5" />
              Tahap RAB: <strong>{rabCount}</strong>
            </span>
            <span className="flex items-center gap-1 text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" />
              Belum Ada Nilai RAB: <strong>{unpricedRabCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setModelMode('general')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                modelMode === 'general'
                  ? 'bg-[#00A2E9] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Laporan Detail (Pro)
            </button>
            <button
              type="button"
              onClick={() => setModelMode('fast')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                modelMode === 'fast'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Respons Cepat
            </button>
          </div>
        </div>

        {/* Quick Report Templates Bar */}
        <div className="bg-slate-900/95 px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#FFF200]" />
              Generator Laporan Cepat (1-Klik)
            </span>
            <span className="text-[11px] text-slate-500">
              Klik template untuk langsung men-generate laporan
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_REPORT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={isLoading}
                onClick={() => sendPrompt(tpl.prompt)}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/70 hover:border-sky-500/50 text-left transition group disabled:opacity-50 cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-md bg-slate-900/90 border border-slate-700 shrink-0">
                    {tpl.icon}
                  </div>
                  <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                    {tpl.label}
                  </span>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-700 shrink-0">
                  {tpl.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Chat Thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-950/50">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-[#00A2E9]/20 border border-sky-500/40 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-[#00A2E9]" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-xl px-4 py-3 shadow-md ${
                    isUser
                      ? 'bg-[#00A2E9] text-white rounded-br-none'
                      : msg.isError
                      ? 'bg-red-950/70 border border-red-500/40 text-red-100 rounded-bl-none'
                      : 'bg-slate-800/90 border border-slate-700/80 text-slate-100 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5 pb-1 border-b border-white/10 text-[11px]">
                    <span className="font-semibold flex items-center gap-1.5">
                      {isUser ? (
                        <>
                          <User className="w-3 h-3" /> Anda
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-[#FFF200]" /> Asisten AI PLN
                        </>
                      )}
                    </span>
                    <span className="opacity-75">{msg.timestamp}</span>
                  </div>

                  <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.text}
                  </div>

                  {/* Action Toolbar for AI responses */}
                  {!isUser && !msg.isError && msg.id !== 'welcome-msg' && (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">
                        Model: <code className="text-sky-300">{msg.modelUsed}</code>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.text)}
                          className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-sky-400" />
                              <span>Salin Laporan</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadReport(msg.text, msg.id)}
                          className="px-2.5 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 border border-sky-500/40 text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-sky-400" />
                          <span>Unduh Laporan (.txt)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#00A2E9]/20 border border-sky-500/40 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-[#00A2E9] animate-spin" />
              </div>
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl rounded-bl-none px-4 py-3 text-xs text-slate-300 flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 text-[#FFF200] animate-spin" />
                <span>
                  Sedang menganalisis <strong>{records.length} permohonan</strong> & menyusun laporan...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Box */}
        <div className="bg-slate-900 p-4 border-t border-slate-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendPrompt(inputPrompt);
            }}
            className="flex flex-col gap-2"
          >
            <div className="relative flex items-end gap-2">
              <textarea
                ref={textareaRef}
                rows={2}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tanyakan sesuatu atau minta buatkan laporan (misal: 'Buatkan laporan proyek yang sudah survei tapi belum dibuat RAB beserta nama surveyornya')..."
                className="w-full rounded-xl bg-slate-950 border border-slate-700 focus:border-[#00A2E9] focus:outline-none px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 resize-none"
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                className="h-11 px-4 rounded-xl bg-[#00A2E9] hover:bg-sky-500 disabled:opacity-40 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition shrink-0 cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Kirim</span>
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>Tekan Enter untuk mengirim, Shift+Enter untuk baris baru</span>
              <span>Data disinkronkan otomatis dari tabel permohonan aktif</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
