import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';

const PORT = Number(process.env.PORT) || 3000;

async function getGeminiClient() {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Healthcheck endpoint for instant readiness probing
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Multi-turn Gemini AI Chatbot & Report Generator endpoint
  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const { message, history = [], dataContext = '', modelMode = 'general', roleContext = 'all' } = req.body || {};

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Pesan atau instruksi laporan tidak boleh kosong.' });
        return;
      }

      const selectedModel =
        modelMode === 'fast'
          ? 'gemini-3.1-flash-lite'
          : modelMode === 'complex'
          ? 'gemini-4-argon'
          : 'gemini-3.8-flash';

      const systemInstruction = `Anda adalah Asisten AI Analis & Generator Laporan Resmi untuk Sistem Monitoring PBPD (Pasang Baru & Perubahan Daya) dan PFK PT PLN (Persero) ULP Borobudur, UP3 Magelang, UID Jawa Tengah.

Peran & Tugas Utama Anda:
1. Menjawab pertanyaan pengguna secara akurat berdasarkan data real-time permohonan pelanggan yang disertakan di bawah.
2. Menyusun dan men-generate laporan resmi sesuai permintaan pengguna (misalnya: Laporan Eksekutif Harian/Mingguan, Laporan Permohonan Sudah Survei tapi Belum Dibuat RAB, Laporan Khusus Antrean PFK, Laporan Bottleneck Tahapan, Laporan Kesiapan Working Permit K3L, atau Laporan Kelengkapan Berkas TE untuk PDL).
3. Memahami aturan bisnis PLN ULP Borobudur:
   - Status permohonan terdiri dari: MOHON (Verifikasi PP), SURVEI (Inspeksi Lapangan Teknik), RAB (Penyusunan Rencana Anggaran Biaya Teknik), TANPA PERLUASAN, BAYAR (Pelunasan BP/UJL), KERJA (Eksekusi Konstruksi & Working Permit K3L), NYALA (Komisioning & Segel TE), dan PDL (Selesai Administrasi PP).
   - Status SURVEI dan RAB dipisahkan: permohonan berstatus SURVEI dengan RAB Rp 0 berarti sudah disurvei di lapangan namun belum dibuatkan RAB-nya oleh Tim Teknik.
   - Permohonan PFK (Konstruksi maupun Meter) langsung terhubung ke Tim Teknik untuk survei lapangan.
   - Untuk naik ke status PDL, Tim Transaksi Energi (TE) wajib melengkapi 3 syarat: Foto Meter Sebelum, Foto Meter Sesudah, dan IDPEL Tetangga.
4. Gunakan Bahasa Indonesia yang profesional, terstruktur, rapi, dan mudah dibaca (gunakan penomoran, poin-poin, dan ringkasan eksekutif serta rekomendasi tindak lanjut untuk bagian terkait).
5. Konteks Peran Pengguna Saat Ini: ${String(roleContext).toUpperCase()}.

DATA REAL-TIME MONITORING PLN ULP BOROBUDUR SAAT INI:
${dataContext}`;

      const formattedHistory = Array.isArray(history)
        ? (history as ChatHistoryItem[])
            .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim() !== '')
            .map((h) => ({
              role: h.role,
              parts: [{ text: h.text }],
            }))
        : [];

      const ai = await getGeminiClient();
      const chat = ai.chats.create({
        model: selectedModel,
        history: formattedHistory,
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({
        message,
      });

      res.json({
        reply: response.text || 'Laporan berhasil disusun.',
        model: selectedModel,
      });
    } catch (error: unknown) {
      console.error('Gemini API Chat Error:', error);
      const errObj = error as { status?: number; message?: string };
      const status = errObj?.status || 500;
      res.status(status).json({
        error:
          errObj?.message ||
          'Terjadi kesalahan saat menghubungi layanan Gemini AI. Pastikan konfigurasi API Key di Settings > Secrets sudah aktif.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = import('vite').then(({ createServer }) =>
      createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  });
}

startServer();

