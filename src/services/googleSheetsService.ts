import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { PermohonanItem } from '../types';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory token caching (per Workspace Integration Skill guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const SPREADSHEET_COLUMNS = [
  'ID',
  'NO NODIN',
  'STATUS',
  'TAHUN',
  'PROJECT NAME',
  'ALAMAT',
  'PERUNTUKAN',
  'TRANSAKSI',
  'DAYA LAMA',
  'DAYA BARU',
  'TARIF',
  'METER',
  'KONTAK PERSON',
  'SURAT PERMOHONAN',
  'TGL SURAT',
  'PETUGAS SURVEI',
  'TAGING LOKASI',
  'NOMOR TIANG',
  'ID PEL',
  'ID PEL TETANGGA',
  'KETERANGAN PEKERJAAN',
  'KETERANGAN STATUS',
  'KETERANGAN KENDALA',
  'TGL SURVEI',
  'RAB',
  'NO. PK VENDOR',
  'WORKING PERMIT',
  'VALIDASI SEGEL',
  'NOMOR KWH BARU',
  'STAND AWAL',
  'NOMOR SERI SEGEL',
  'TGL PENYALAAN',
  'TGL PDL UPDATE',
];

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan access token dari Google OAuth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export function recordToRow(item: PermohonanItem): (string | number)[] {
  return [
    item.id,
    item.noNodin,
    item.status,
    item.tahun,
    item.projectName,
    item.alamat,
    item.peruntukan,
    item.transaksi,
    item.dayaLama,
    item.dayaBaru,
    item.tarif,
    item.meter,
    item.kontakPerson,
    item.suratPermohonan,
    item.tglSurat,
    item.petugasSurvei,
    item.tagingLokasi,
    item.nomorTiang,
    item.idPel,
    item.idPelTetangga,
    item.keteranganPekerjaan,
    item.keteranganStatus,
    item.keteranganKendala,
    item.tglSurvei,
    item.rab,
    item.noPkVendor,
    item.workingPermit,
    item.validasiSegel,
    item.nomorKwhBaru || '',
    item.standKwhAwal !== undefined ? item.standKwhAwal : '',
    item.nomorSeriSegel || '',
    item.tglPenyalaan || '',
    item.tglPdlUpdate || '',
  ];
}

/**
 * Creates a brand-new Google Spreadsheet in the user's Drive, styled and formatted
 * with the exact columns matching the PLN PBPD/PFK monitoring system.
 */
export async function createMonitoringSpreadsheet(
  title: string,
  records: PermohonanItem[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Google terlebih dahulu.');

  const body = {
    properties: {
      title: title || 'PLN PBPD & PFK Monitoring - ULP Borobudur, UP3 Magelang, UID Jawa Tengah',
    },
    sheets: [
      {
        properties: {
          title: 'PBPD_PFK_DATA',
          gridProperties: {
            frozenRowCount: 1,
            rowCount: Math.max(100, records.length + 10),
            columnCount: SPREADSHEET_COLUMNS.length,
          },
        },
      },
    ],
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Gagal membuat Google Spreadsheet baru.');
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Populate header and records
  const allRows = [SPREADSHEET_COLUMNS, ...records.map(recordToRow)];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/PBPD_PFK_DATA!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: allRows,
      }),
    }
  );

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Appends a new permohonan row directly into the user's active Google Sheet
 */
export async function appendRowToGoogleSheet(
  spreadsheetId: string,
  record: PermohonanItem
): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  const rowData = recordToRow(record);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowData],
      }),
    }
  );

  return res.ok;
}

/**
 * Syncs all records into the Google Sheet
 */
export async function syncAllRecordsToGoogleSheet(
  spreadsheetId: string,
  records: PermohonanItem[]
): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  const allRows = [SPREADSHEET_COLUMNS, ...records.map(recordToRow)];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: allRows,
      }),
    }
  );

  return res.ok;
}
