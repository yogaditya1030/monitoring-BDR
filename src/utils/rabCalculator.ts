import {
  CablePhaseCount,
  NetworkCategory,
  RabGolongan,
  RabLineItem,
  RabRomanSection,
  SpanCableItem,
  SurveyPoleConstructionAssignment,
  SurveyPoleNode,
  SurveySpanConductorType,
  SurveySpanEdge,
} from '../types';
import {
  CONDUCTOR_KHS_MAPPING,
  CONSTRUCTION_PACKAGES_CATALOG,
  KHS_MASTER_CATALOG,
  RAB_ROMAN_SECTIONS,
} from '../data/khsAndConstructionCatalog';

/**
 * Menentukan kategori jaringan (JTM / JTR / SR) otomatis dari jenis penghantar KHS
 */
export function inferNetworkCategoryFromConductor(
  conductorType: SurveySpanConductorType
): NetworkCategory {
  const mapped = CONDUCTOR_KHS_MAPPING[conductorType];
  if (mapped?.networkCategory) {
    return mapped.networkCategory;
  }
  if (conductorType.includes('AAAC') || conductorType.includes('MVTIC')) {
    return 'JTM';
  }
  if (conductorType.includes('2x16') || conductorType.includes('4x16')) {
    return 'SR';
  }
  return 'JTR';
}

/**
 * Menentukan jumlah fasa (1 Phase = 1 garis /, 3 Phase = 3 garis ///) dari jenis penghantar atau pilihan eksplisit
 */
export function inferPhaseCountFromConductor(
  conductorType: SurveySpanConductorType,
  explicitPhase?: CablePhaseCount
): CablePhaseCount {
  if (explicitPhase === 1 || explicitPhase === 3) {
    return explicitPhase;
  }
  const mapped = CONDUCTOR_KHS_MAPPING[conductorType];
  if (mapped?.defaultPhase) {
    return mapped.defaultPhase;
  }
  if (
    conductorType.includes('2x16') ||
    conductorType.includes('2x35') ||
    conductorType.includes('2x70')
  ) {
    return 1;
  }
  return 3;
}

/**
 * Memformat simbol garis fasa sesuai standar gambar survei PLN:
 * - 3 Phase: "///" (3 garis miring)
 * - 1 Phase: "/" (1 garis miring)
 */
export function getPhaseSlashSymbol(phaseCount: CablePhaseCount): string {
  return phaseCount === 1 ? '/' : '///';
}

/**
 * Menentukan rasio posisi longitudinal (0..1 sepanjang bentangan gawang)
 * untuk tanda garis fasa (/ atau ///) agar TIDAK PERNAH saling menumpuk
 * ketika terdapat >1 jenis kabel paralel pada gawang yang sama.
 */
export function getStaggeredPhaseTickRatio(
  cableIndex: number,
  totalCables: number
): number {
  if (totalCables <= 1) {
    return 0.28;
  }
  if (totalCables === 2) {
    return cableIndex === 0 ? 0.24 : 0.76;
  }
  const staggeredSlots = [0.2, 0.78, 0.33, 0.66, 0.14, 0.84];
  return staggeredSlots[cableIndex % staggeredSlots.length];
}

/**
 * Menghitung sudut kemiringan layar (derajat) dari titik awal ke titik akhir kabel
 * agar simbol garis fasa (/ atau ///) tegak lurus/miring mengikuti arah bentangan kabel di peta.
 */
export function getCableScreenAngleDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dx = lng2 - lng1;
  const dy = -(lat2 - lat1); // layar y ke bawah adalah -lat
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Normalisasi ke [-90, 90] agar miring slash selalu konsisten terbaca
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return Math.round(deg * 10) / 10;
}

/**
 * Membangun SVG tanda garis fasa (/ untuk 1 Phase, /// untuk 3 Phase)
 * yang memotong garis kabel JTM maupun JTR sesuai Contoh File Gambar Survey.pdf
 */
export function buildPhaseSlashSvg(
  phaseCount: CablePhaseCount,
  strokeColor: string,
  angleDeg: number = 0
): string {
  const slashOffsets = phaseCount === 1 ? [0] : [-5, 0, 5];
  const linesHtml = slashOffsets
    .map(
      (ox) => `
      <line x1="${ox - 3}" y1="7" x2="${ox + 3}" y2="-7" stroke="#ffffff" stroke-width="4" stroke-linecap="round" />
      <line x1="${ox - 3}" y1="7" x2="${ox + 3}" y2="-7" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" />
    `
    )
    .join('');

  return `<svg width="28" height="24" viewBox="-14 -12 28 24" style="overflow:visible; transform: rotate(${angleDeg}deg); pointer-events: none;">
    ${linesHtml}
  </svg>`;
}

/**
 * Mengambil seluruh daftar kabel dalam 1 gawang (mendukung multi-kabel per gawang maupun format lama 1 kabel)
 */
export function getEffectiveSpanCables(span: SurveySpanEdge): SpanCableItem[] {
  if (span.cables && span.cables.length > 0) {
    return span.cables.map((c) => {
      const isBongkar = Boolean(
        c.isBongkar ||
          c.actionType === 'BONGKAR' ||
          span.isBongkar ||
          span.actionType === 'BONGKAR'
      );
      return {
        ...c,
        jenisJaringan:
          c.jenisJaringan || inferNetworkCategoryFromConductor(c.conductorType),
        phaseCount: inferPhaseCountFromConductor(
          c.conductorType,
          c.phaseCount ?? span.phaseCount
        ),
        circuitCount: Math.max(1, c.circuitCount || 1),
        isBongkar,
        actionType: isBongkar ? 'BONGKAR' : c.actionType || 'PASANG',
      };
    });
  }
  const isBongkar = Boolean(
    span.isBongkar || span.actionType === 'BONGKAR'
  );
  return [
    {
      id: `${span.id}-default`,
      statusJaringan: span.statusJaringan,
      jenisJaringan:
        span.jenisJaringan ||
        inferNetworkCategoryFromConductor(span.conductorType),
      conductorType: span.conductorType,
      phaseCount: inferPhaseCountFromConductor(
        span.conductorType,
        span.phaseCount
      ),
      circuitCount: 1,
      isBongkar,
      actionType: isBongkar ? 'BONGKAR' : span.actionType || 'PASANG',
    },
  ];
}

export interface CableVisualStyle {
  jenisJaringan: NetworkCategory;
  statusJaringan: 'RENCANA' | 'EKSISTING';
  strokeColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  weight: number;
  dashArray?: string;
  shortCategoryLabel: string;
}

/**
 * Membedakan warna & corak garis kabel secara tegas antara JTM (20kV), JTR (380/220V), dan SR (Sambungan Rumah)
 * agar tidak semuanya berwarna merah.
 */
export function getCableVisualStyle(
  jenisJaringan: NetworkCategory,
  statusJaringan: 'RENCANA' | 'EKSISTING'
): CableVisualStyle {
  const isRencana = statusJaringan === 'RENCANA';

  if (jenisJaringan === 'JTM') {
    // JTM 20kV: Merah tegas (Rencana) vs Merah Maroon Tua (Eksisting)
    return {
      jenisJaringan: 'JTM',
      statusJaringan,
      strokeColor: isRencana ? '#dc2626' : '#7f1d1d',
      badgeBg: isRencana ? '#dc2626' : '#450a0a',
      badgeBorder: isRencana ? '#fecaca' : '#f87171',
      badgeText: '#ffffff',
      weight: isRencana ? 4.5 : 3.5,
      dashArray: isRencana ? undefined : '10, 4',
      shortCategoryLabel: 'JTM 20kV',
    };
  }

  if (jenisJaringan === 'SR') {
    // SR (Sambungan Rumah): Oranye/Amber Putus-putus (Rencana) vs Ungu Tua Putus-putus (Eksisting)
    return {
      jenisJaringan: 'SR',
      statusJaringan,
      strokeColor: isRencana ? '#d97706' : '#6b21a8',
      badgeBg: isRencana ? '#d97706' : '#581c87',
      badgeBorder: isRencana ? '#fde68a' : '#d8b4fe',
      badgeText: '#ffffff',
      weight: isRencana ? 3.5 : 2.8,
      dashArray: '5, 5',
      shortCategoryLabel: 'SR Pelanggan',
    };
  }

  // JTR (LVTC 380/220V): Biru Elektrik / Cyan Tegas (Rencana) vs Biru Navy Gelap (Eksisting)
  return {
    jenisJaringan: 'JTR',
    statusJaringan,
    strokeColor: isRencana ? '#0284c7' : '#1e3a8a',
    badgeBg: isRencana ? '#0284c7' : '#172554',
    badgeBorder: isRencana ? '#bae6fd' : '#93c5fd',
    badgeText: '#ffffff',
    weight: isRencana ? 4 : 3.2,
    dashArray: isRencana ? undefined : '8, 4',
    shortCategoryLabel: 'JTR LVTC',
  };
}

/**
 * Menghitung koordinat garis paralel (offset) apabila dalam 1 gawang terdapat > 1 jenis kabel
 * sehingga kabel JTM, JTR, dan SR terlihat berdampingan dan tidak saling menumpuk.
 */
export function calculateOffsetLineCoords(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  cableIndex: number,
  totalCables: number,
  offsetStepDegrees: number = 0.000028
): [[number, number], [number, number]] {
  if (totalCables <= 1) {
    return [
      [lat1, lng1],
      [lat2, lng2],
    ];
  }
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const len = Math.sqrt(dLat * dLat + dLng * dLng);
  if (len < 1e-9) {
    return [
      [lat1, lng1],
      [lat2, lng2],
    ];
  }
  // Vektor normal tegak lurus terhadap arah bentangan kabel
  const nLat = -dLng / len;
  const nLng = dLat / len;
  const centeredIdx = cableIndex - (totalCables - 1) / 2;
  const offsetLat = nLat * centeredIdx * offsetStepDegrees;
  const offsetLng = nLng * centeredIdx * offsetStepDegrees;

  return [
    [lat1 + offsetLat, lng1 + offsetLng],
    [lat2 + offsetLat, lng2 + offsetLng],
  ];
}

/**
 * Menghitung posisi offset kotak callout konstruksi tiang (dx, dy dalam pixel)
 * agar TIDAK PERNAH menutupi simbol tiang, gardu trafo, maupun jalur kabel yang terhubung.
 */
export function calculatePoleCalloutOffset(
  node: SurveyPoleNode,
  allNodes: SurveyPoleNode[],
  allSpans: SurveySpanEdge[],
  nodeIndex: number
): { dx: number; dy: number; anchorSide: 'left' | 'right' } {
  // Cari seluruh vektor arah kabel yang terhubung ke titik ini
  const connectedVectors: Array<{ vx: number; vy: number }> = [];
  allSpans.forEach((sp) => {
    if (sp.fromNodeId === node.id || sp.toNodeId === node.id) {
      const otherId = sp.fromNodeId === node.id ? sp.toNodeId : sp.fromNodeId;
      const other = allNodes.find((n) => n.id === otherId);
      if (other) {
        // Konversi ke arah layar (x ke kanan = +lng, y ke bawah = -lat)
        const vx = other.lng - node.lng;
        const vy = -(other.lat - node.lat);
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > 1e-9) {
          connectedVectors.push({ vx: vx / mag, vy: vy / mag });
        }
      }
    }
  });

  // Pilih sisi offset yang paling jauh dari sudut jalur kabel
  const candidates: Array<{
    dx: number;
    dy: number;
    anchorSide: 'left' | 'right';
  }> = [
    { dx: 44, dy: -28, anchorSide: 'left' },
    { dx: -44, dy: -28, anchorSide: 'right' },
    { dx: 46, dy: 24, anchorSide: 'left' },
    { dx: -46, dy: 24, anchorSide: 'right' },
    { dx: 52, dy: 0, anchorSide: 'left' },
    { dx: -52, dy: 0, anchorSide: 'right' },
  ];

  // Urutan preferensi diselang-seling berdasarkan nodeIndex agar antar tiang bersebelahan tidak saling bertabrakan
  const preferredOrder =
    nodeIndex % 2 === 0
      ? [0, 3, 2, 1, 4, 5]
      : [1, 2, 3, 0, 5, 4];

  if (connectedVectors.length === 0) {
    return candidates[preferredOrder[0]];
  }

  let bestCandidate = candidates[preferredOrder[0]];
  let bestClearanceScore = -Infinity;

  preferredOrder.forEach((candIdx, rank) => {
    const cand = candidates[candIdx];
    const mag = Math.sqrt(cand.dx * cand.dx + cand.dy * cand.dy);
    const ux = cand.dx / mag;
    const uy = cand.dy / mag;

    // Semakin kecil dot product maksimum terhadap kabel terhubung, semakin bebas dari menabrak garis kabel
    let maxCosine = -1;
    connectedVectors.forEach((v) => {
      const dot = ux * v.vx + uy * v.vy;
      if (dot > maxCosine) {
        maxCosine = dot;
      }
    });

    // Skor kebebasan jalur + bonus urutan selang-seling
    const clearanceScore = (1 - maxCosine) * 10 - rank * 0.35;
    if (clearanceScore > bestClearanceScore) {
      bestClearanceScore = clearanceScore;
      bestCandidate = cand;
    }
  });

  return bestCandidate;
}

export interface PoleMaterialBreakdownRow {
  packageCode: string;
  packageQty: number;
  khsId: string;
  uraian: string;
  gol: RabGolongan;
  satuan: string;
  defaultUnitQty: number;
  unitQty: number;
  volume: number;
  hargaSatuan: number;
  jumlahHarga: number;
  enabled: boolean;
}

/**
 * Mengecek apakah suatu titik tiang / gardu memiliki tanda pembongkaran (Simbol X Merah)
 */
export function isNodeMarkedBongkar(node: SurveyPoleNode): boolean {
  if (node.isBongkar) return true;
  return (node.constructions || []).some(
    (c) =>
      c.actionType === 'BONGKAR' ||
      c.actionType === 'BONGKAR_PASANG' ||
      c.code.toUpperCase().startsWith('BONGKAR-')
  );
}

/**
 * Mengecek apakah suatu item kabel dalam gawang ditandai BONGKAR (Simbol X Merah)
 */
export function isCableMarkedBongkar(
  cable: SpanCableItem,
  parentSpan?: SurveySpanEdge
): boolean {
  if (cable.isBongkar || cable.actionType === 'BONGKAR') return true;
  if (parentSpan && (parentSpan.isBongkar || parentSpan.actionType === 'BONGKAR')) {
    return true;
  }
  return false;
}

/**
 * Mengecek apakah suatu bentangan kabel (gawang) memiliki tanda pembongkaran (Simbol X Merah)
 */
export function isSpanMarkedBongkar(span: SurveySpanEdge): boolean {
  if (span.isBongkar || span.actionType === 'BONGKAR') return true;
  return getEffectiveSpanCables(span).some((c) =>
    isCableMarkedBongkar(c, span)
  );
}

/**
 * Membangun SVG simbol X berwarna merah tegas untuk menandai konstruksi/tiang yang dibongkar di Kanvas Peta GIS
 */
export function buildBongkarXSvg(size: number = 28): string {
  const half = size / 2;
  const pad = 4;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" data-testid="pole-bongkar-x-symbol" style="overflow:visible; pointer-events:none;">
    <line x1="${pad}" y1="${pad}" x2="${size - pad}" y2="${size - pad}" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    <line x1="${size - pad}" y1="${pad}" x2="${pad}" y2="${size - pad}" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    <line x1="${pad}" y1="${pad}" x2="${size - pad}" y2="${size - pad}" stroke="#dc2626" stroke-width="3" stroke-linecap="round" />
    <line x1="${size - pad}" y1="${pad}" x2="${pad}" y2="${size - pad}" stroke="#dc2626" stroke-width="3" stroke-linecap="round" />
    <circle cx="${half}" cy="${half}" r="2.2" fill="#dc2626" />
  </svg>`;
}

/**
 * Mengekspansi rincian komponen material & jasa KHS untuk 1 item konstruksi pada tiang,
 * mendukung pemilihan riil (centang aktif/nonaktif & ubah volume per komponen) serta aksi PASANG / BONGKAR / BONGKAR_PASANG.
 */
export function getConstructionAssignmentBreakdown(
  assign: SurveyPoleConstructionAssignment,
  nodeIsBongkar: boolean = false
): {
  rows: PoleMaterialBreakdownRow[];
  totalActivePrice: number;
} {
  const pkg = CONSTRUCTION_PACKAGES_CATALOG.find(
    (p) => p.code.toUpperCase() === assign.code.toUpperCase()
  );
  if (!pkg) {
    return { rows: [], totalActivePrice: 0 };
  }
  const safeAssignQty = Math.max(0, Number(assign.qty) || 0);

  const effectiveAction =
    assign.actionType || (nodeIsBongkar ? 'BONGKAR' : 'PASANG');
  const disabledSet = new Set(assign.disabledKhsIds || []);
  const customQtyMap = assign.customComponentQty || {};
  const rows: PoleMaterialBreakdownRow[] = [];
  let totalActivePrice = 0;

  // Bila aksi adalah BONGKAR murni (dan paket bukan kategori BONGKAR langsung), gunakan jasa pembongkaran (bongkarKhsId)
  if (effectiveAction === 'BONGKAR' && pkg.category !== 'BONGKAR') {
    const bongkarId = pkg.bongkarKhsId || 'JASA_BONGKAR_JTR';
    const khs = KHS_MASTER_CATALOG[bongkarId];
    if (khs) {
      const enabled = !disabledSet.has(khs.id);
      const unitQty =
        customQtyMap[khs.id] !== undefined
          ? Math.max(0, Number(customQtyMap[khs.id]))
          : 1;
      const vol = enabled ? Math.round(unitQty * safeAssignQty * 100) / 100 : 0;
      const jumlahHarga = enabled ? Math.round(vol * khs.hargaSatuan) : 0;
      if (enabled) {
        totalActivePrice += jumlahHarga;
      }
      rows.push({
        packageCode: pkg.code,
        packageQty: safeAssignQty,
        khsId: khs.id,
        uraian: `${khs.uraian} (${pkg.code})`,
        gol: khs.gol,
        satuan: khs.satuan,
        defaultUnitQty: 1,
        unitQty,
        volume: vol,
        hargaSatuan: khs.hargaSatuan,
        jumlahHarga,
        enabled,
      });
    }
    return { rows, totalActivePrice };
  }

  pkg.components.forEach((comp) => {
    const khs = KHS_MASTER_CATALOG[comp.khsId];
    if (!khs) return;
    const enabled = !disabledSet.has(comp.khsId);
    const unitQty =
      customQtyMap[comp.khsId] !== undefined
        ? Math.max(0, Number(customQtyMap[comp.khsId]))
        : comp.qty;
    const vol = enabled ? Math.round(unitQty * safeAssignQty * 100) / 100 : 0;
    const jumlahHarga = enabled ? Math.round(vol * khs.hargaSatuan) : 0;

    if (enabled) {
      totalActivePrice += jumlahHarga;
    }

    rows.push({
      packageCode: pkg.code,
      packageQty: safeAssignQty,
      khsId: khs.id,
      uraian: khs.uraian,
      gol: khs.gol,
      satuan: khs.satuan,
      defaultUnitQty: comp.qty,
      unitQty,
      volume: vol,
      hargaSatuan: khs.hargaSatuan,
      jumlahHarga,
      enabled,
    });
  });

  // Bila BONGKAR_PASANG, tambahkan juga baris jasa pembongkaran
  if (effectiveAction === 'BONGKAR_PASANG' && pkg.bongkarKhsId) {
    const khs = KHS_MASTER_CATALOG[pkg.bongkarKhsId];
    if (khs && !rows.some((r) => r.khsId === khs.id)) {
      const enabled = !disabledSet.has(khs.id);
      const unitQty =
        customQtyMap[khs.id] !== undefined
          ? Math.max(0, Number(customQtyMap[khs.id]))
          : 1;
      const vol = enabled ? Math.round(unitQty * safeAssignQty * 100) / 100 : 0;
      const jumlahHarga = enabled ? Math.round(vol * khs.hargaSatuan) : 0;
      if (enabled) {
        totalActivePrice += jumlahHarga;
      }
      rows.push({
        packageCode: pkg.code,
        packageQty: safeAssignQty,
        khsId: khs.id,
        uraian: khs.uraian,
        gol: khs.gol,
        satuan: khs.satuan,
        defaultUnitQty: 1,
        unitQty,
        volume: vol,
        hargaSatuan: khs.hargaSatuan,
        jumlahHarga,
        enabled,
      });
    }
  }

  return { rows, totalActivePrice };
}

/**
 * Mengekspansi rincian material & jasa KHS untuk 1 titik tiang / gardu / konstruksi
 * berdasarkan file Standar Konstruksi & Acuan Harga KHS PLN (hanya menghitung komponen yang dicentang aktif)
 */
export function getPoleKhsMaterialBreakdown(node: SurveyPoleNode): {
  rows: PoleMaterialBreakdownRow[];
  totalMdu: number;
  totalHardware: number;
  totalJasa: number;
  totalBiayaTitik: number;
} {
  const rows: PoleMaterialBreakdownRow[] = [];
  let totalMdu = 0;
  let totalHardware = 0;
  let totalJasa = 0;

  (node.constructions || []).forEach((assign) => {
    if (assign.qty <= 0) return;
    const { rows: assignRows } = getConstructionAssignmentBreakdown(
      assign,
      Boolean(node.isBongkar)
    );
    assignRows.forEach((row) => {
      if (!row.enabled || row.volume <= 0) return;
      if (row.gol === 'MDU-KD') totalMdu += row.jumlahHarga;
      else if (row.gol === 'HDW') totalHardware += row.jumlahHarga;
      else totalJasa += row.jumlahHarga;
      rows.push(row);
    });
  });

  return {
    rows,
    totalMdu,
    totalHardware,
    totalJasa,
    totalBiayaTitik: totalMdu + totalHardware + totalJasa,
  };
}

/**
 * Menghitung jarak geodesik (Haversine) dalam satuan Meter antar dua koordinat GPS (Lat, Lng)
 */
export function calculateGeodesicDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Radius bumi dalam meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawMeters = R * c;
  return Math.max(1, Math.round(rawMeters));
}

/**
 * Menghitung titik tengah koordinat (midpoint) untuk label meter gawang di Peta GIS
 */
export function getMidpointCoordinate(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { lat: number; lng: number } {
  return {
    lat: (lat1 + lat2) / 2,
    lng: (lng1 + lng2) / 2,
  };
}

/**
 * Memformat baris callout konstruksi tiang sesuai Contoh File Gambar Survey PLN
 * Contoh output: ["1 C9-200", "1 SJ5", "1 CM2-12"]
 * Bila item ditandai BONGKAR, menampilkan tanda ✕ (Bongkar)
 */
export function formatPoleCalloutLines(node: SurveyPoleNode): string[] {
  if (!node.constructions || node.constructions.length === 0) {
    return [];
  }
  return node.constructions
    .filter((c) => c.qty > 0 && c.code.trim() !== '')
    .map((c) => {
      if (c.actionType === 'BONGKAR') {
        return `✕ ${c.qty} ${c.code} (Bongkar)`;
      }
      if (c.actionType === 'BONGKAR_PASANG') {
        return `⇄ ${c.qty} ${c.code} (B/P)`;
      }
      return `${c.qty} ${c.code}`;
    });
}

function getRomanSectionForPackage(
  code: string,
  category: string
): RabRomanSection {
  const upper = code.toUpperCase();
  if (upper.startsWith('P12')) return 'II';
  if (category === 'TIANG') return 'I';
  if (category === 'JTM') return 'II';
  if (category === 'GARDU') return 'III';
  if (category === 'SWITCHING') return 'IV';
  if (category === 'SKUTM') return 'V';
  if (category === 'SKUR' || category === 'ANCHOR') return 'VIII';
  if (category === 'GROUNDING') return 'IX';
  if (category === 'JTR' || category === 'SKUTR' || category === 'SR') {
    return 'X';
  }
  if (category === 'BONGKAR') {
    return upper.includes('BP-') ? 'XIV' : 'XV';
  }
  return 'X';
}

export interface GenerateRabOptions {
  nodes: SurveyPoleNode[];
  spans: SurveySpanEdge[];
  includePembetonanTiang?: boolean;
  transportasiRit?: number;
  includeExistingPoleNewAccessories?: boolean;
}

/**
 * Meng-generate daftar item RAB otomatis dari gambar survei tiang, gardu, titik konstruksi & multi-kabel per gawang
 * berdasarkan Standar Konstruksi PRK 2019 & Acuan Harga KHS HSS 2020 PT. PLN (PERSERO) UID JAWA TENGAH.
 * Mendukung format hierarki sesuai Contoh_Format_RAB.pdf:
 * - Baris Header Konstruksi (`+` | `MJ6-T` | `Unit` | `Vol`) diikuti rincian materialnya (`1, 2, 3...`)
 * - Jasa Pembongkaran otomatis pada Seksi XIV / XV apabila ada tiang/konstruksi yang ditandai BONGKAR (Simbol X Merah).
 */
export function generateRabItemsFromSurvey(
  options: GenerateRabOptions
): RabLineItem[] {
  const {
    nodes,
    spans,
    includePembetonanTiang = true,
    transportasiRit = 1,
  } = options;

  // Map akumulator volume untuk item langsung tanpa header paket (Seksi I Tiang Beton, VI/XI Penghantar, XIV/XV Bongkar, XVI Transportasi)
  const directKhsVolumeMap = new Map<
    string,
    { volume: number; sources: Set<string>; sectionOverride?: RabRomanSection }
  >();

  const addDirectKhsVolume = (
    khsId: string,
    qty: number,
    sourceLabel: string,
    sectionOverride?: RabRomanSection
  ) => {
    if (qty <= 0) return;
    if (!KHS_MASTER_CATALOG[khsId]) return;
    const mapKey = sectionOverride ? `${sectionOverride}::${khsId}` : khsId;
    const existing = directKhsVolumeMap.get(mapKey);
    if (existing) {
      existing.volume = Math.round((existing.volume + qty) * 100) / 100;
      existing.sources.add(sourceLabel);
    } else {
      directKhsVolumeMap.set(mapKey, {
        volume: Math.round(qty * 100) / 100,
        sources: new Set([sourceLabel]),
        sectionOverride,
      });
    }
  };

  // Map akumulator untuk Paket Konstruksi ber-header (+ MJ6-T, + CJ5, + CC1-A, + DB01, dll.) sesuai Contoh_Format_RAB.pdf
  interface GroupedPackageAccumulator {
    code: string;
    section: RabRomanSection;
    totalPkgQty: number;
    sources: Set<string>;
    componentVolumes: Map<string, number>;
  }
  const packageGroupsMap = new Map<string, GroupedPackageAccumulator>();

  let plannedPoleCount = 0;

  // 1. Proses seluruh titik (baik Rencana maupun Eksisting bila ada pembongkaran atau penambahan konstruksi)
  nodes.forEach((node) => {
    const isPlannedNode =
      node.kind === 'TIANG_RENCANA' ||
      node.kind === 'GARDU_RENCANA' ||
      node.kind === 'TITIK_APP';

    node.constructions.forEach((assignment) => {
      if (assignment.qty <= 0) return;
      const pkg = CONSTRUCTION_PACKAGES_CATALOG.find(
        (p) => p.code.toUpperCase() === assignment.code.toUpperCase()
      );
      if (!pkg) return;

      const effectiveAction =
        assignment.actionType ||
        (node.isBongkar ? 'BONGKAR' : isPlannedNode ? 'PASANG' : 'NONE');

      if (effectiveAction === 'NONE' && pkg.category !== 'BONGKAR') {
        return;
      }

      const disabledSet = new Set(assignment.disabledKhsIds || []);
      const customQtyMap = assignment.customComponentQty || {};
      const sourceLabel = `${node.kodeTiang} (${assignment.qty}x ${pkg.code})`;

      // Kasus A: Konstruksi ditandai BONGKAR atau Paket Kategori BONGKAR
      if (effectiveAction === 'BONGKAR' || pkg.category === 'BONGKAR') {
        if (pkg.category === 'BONGKAR') {
          pkg.components.forEach((comp) => {
            if (disabledSet.has(comp.khsId)) return;
            const unitQty =
              customQtyMap[comp.khsId] !== undefined
                ? Math.max(0, Number(customQtyMap[comp.khsId]))
                : comp.qty;
            if (unitQty <= 0) return;
            addDirectKhsVolume(
              comp.khsId,
              unitQty * assignment.qty,
              `${node.kodeTiang} (Bongkar ${pkg.code})`
            );
          });
        } else {
          const bongkarId = pkg.bongkarKhsId || 'JASA_BONGKAR_JTR';
          if (!disabledSet.has(bongkarId)) {
            const unitQty =
              customQtyMap[bongkarId] !== undefined
                ? Math.max(0, Number(customQtyMap[bongkarId]))
                : 1;
            addDirectKhsVolume(
              bongkarId,
              unitQty * assignment.qty,
              `${node.kodeTiang} (Bongkar ${pkg.code})`,
              'XV'
            );
          }
        }
        return;
      }

      // Kasus B: BONGKAR_PASANG -> masukkan jasa bongkar ke Seksi XV (atau XIV) dan lanjutkan pemasangan konstruksi
      if (effectiveAction === 'BONGKAR_PASANG' && pkg.bongkarKhsId) {
        if (!disabledSet.has(pkg.bongkarKhsId)) {
          const unitQty =
            customQtyMap[pkg.bongkarKhsId] !== undefined
              ? Math.max(0, Number(customQtyMap[pkg.bongkarKhsId]))
              : 1;
          addDirectKhsVolume(
            pkg.bongkarKhsId,
            unitQty * assignment.qty,
            `${node.kodeTiang} (Bongkar-Pasang ${pkg.code})`,
            'XV'
          );
        }
      }

      // Kasus C: Pemasangan Tiang Beton (C9-200, C12-350, dll. pada Seksi I. TIANG)
      const isConcretePolePackage =
        pkg.category === 'TIANG' && !pkg.code.toUpperCase().startsWith('P12');

      if (isConcretePolePackage) {
        plannedPoleCount += assignment.qty;
        pkg.components.forEach((comp) => {
          if (disabledSet.has(comp.khsId)) return;
          const unitQty =
            customQtyMap[comp.khsId] !== undefined
              ? Math.max(0, Number(customQtyMap[comp.khsId]))
              : comp.qty;
          if (unitQty <= 0) return;
          addDirectKhsVolume(comp.khsId, unitQty * assignment.qty, sourceLabel, 'I');
        });
        return;
      }

      // Kasus D: Paket Konstruksi Standar (MJ6-T, CJ5, SJ5, SJ6, CC1-A, SE1-2, F1-2, CM2-12, DB01, P12C-2, dll.)
      // Ditampilkan dengan baris Header "+ | <Kode Konstruksi> | Unit | <Vol>" diikuti rincian materialnya 1, 2, 3...
      const pkgSection = getRomanSectionForPackage(pkg.code, pkg.category);
      const existingGrp = packageGroupsMap.get(pkg.code);
      const grp: GroupedPackageAccumulator = existingGrp || {
        code: pkg.code,
        section: pkgSection,
        totalPkgQty: 0,
        sources: new Set<string>(),
        componentVolumes: new Map<string, number>(),
      };

      grp.totalPkgQty = Math.round((grp.totalPkgQty + assignment.qty) * 100) / 100;
      grp.sources.add(sourceLabel);

      pkg.components.forEach((comp) => {
        if (disabledSet.has(comp.khsId)) return;
        const unitQty =
          customQtyMap[comp.khsId] !== undefined
            ? Math.max(0, Number(customQtyMap[comp.khsId]))
            : comp.qty;
        if (unitQty <= 0) return;
        const addedVol = Math.round(unitQty * assignment.qty * 100) / 100;
        const prevVol = grp.componentVolumes.get(comp.khsId) || 0;
        grp.componentVolumes.set(
          comp.khsId,
          Math.round((prevVol + addedVol) * 100) / 100
        );
      });

      if (grp.componentVolumes.size > 0) {
        packageGroupsMap.set(pkg.code, grp);
      }
    });
  });

  // Tambahkan Pembetonan Tiang Rencana bila diaktifkan
  if (includePembetonanTiang && plannedPoleCount > 0) {
    addDirectKhsVolume(
      'JASA_PEMBETONAN_TIANG',
      plannedPoleCount,
      `Pondasi ${plannedPoleCount} Tiang Rencana`,
      'I'
    );
  }

  // 2. Ekspansi tarikan kabel / penghantar dari seluruh kabel di setiap Gawang (Pasang Baru vs Bongkar)
  const conductorLengthTotals = new Map<
    string,
    { rawMeters: number; wireWeightedMeters: number; spanCount: number }
  >();
  const bongkarCableTotals = new Map<
    string,
    { rawMeters: number; spanCount: number; jenisJaringan: NetworkCategory }
  >();

  spans.forEach((span) => {
    const effectiveDistance =
      span.manualDistanceOverride !== undefined &&
      span.manualDistanceOverride > 0
        ? span.manualDistanceOverride
        : span.distanceMeters;

    if (effectiveDistance <= 0) return;

    const spanCables = getEffectiveSpanCables(span);
    spanCables.forEach((cable) => {
      const circuits = Math.max(1, cable.circuitCount || 1);
      // Bila kabel/gawang ditandai BONGKAR (Simbol X Merah), masukkan ke Jasa Pembongkaran Penghantar (Seksi XV)
      if (isCableMarkedBongkar(cable, span)) {
        const netCat =
          cable.jenisJaringan ||
          inferNetworkCategoryFromConductor(cable.conductorType);
        const bongkarKhsId =
          netCat === 'JTM'
            ? 'JASA_BONGKAR_JTM_AAAC_PER_50M'
            : netCat === 'SR'
            ? 'JASA_BONGKAR_SR_1P'
            : 'JASA_BONGKAR_LVTC_PER_50M';
        const curBongkar = bongkarCableTotals.get(bongkarKhsId) || {
          rawMeters: 0,
          spanCount: 0,
          jenisJaringan: netCat,
        };
        curBongkar.rawMeters += effectiveDistance * circuits;
        curBongkar.spanCount += circuits;
        bongkarCableTotals.set(bongkarKhsId, curBongkar);
        return;
      }

      if (cable.statusJaringan !== 'RENCANA') return;
      const mapping =
        CONDUCTOR_KHS_MAPPING[
          cable.conductorType as keyof typeof CONDUCTOR_KHS_MAPPING
        ];
      const phaseCount = inferPhaseCountFromConductor(
        cable.conductorType,
        cable.phaseCount
      );

      const effectiveWireMultiplier =
        mapping && mapping.phaseMultiplier === 3 ? phaseCount : 1;

      const current = conductorLengthTotals.get(cable.conductorType) || {
        rawMeters: 0,
        wireWeightedMeters: 0,
        spanCount: 0,
      };
      current.rawMeters += effectiveDistance * circuits;
      current.wireWeightedMeters +=
        effectiveDistance * circuits * effectiveWireMultiplier;
      current.spanCount += circuits;
      conductorLengthTotals.set(cable.conductorType, current);
    });
  });

  // Masukkan Jasa Pembongkaran Kabel / Penghantar ke Seksi XV
  bongkarCableTotals.forEach((bTotals, bongkarKhsId) => {
    const vol =
      bongkarKhsId === 'JASA_BONGKAR_SR_1P'
        ? Math.max(1, bTotals.spanCount)
        : Math.max(bTotals.spanCount, Math.ceil(bTotals.rawMeters / 50));
    addDirectKhsVolume(
      bongkarKhsId,
      vol,
      `Bongkar ${bTotals.spanCount} Gawang Kabel ${bTotals.jenisJaringan} (${bTotals.rawMeters}m)`,
      'XV'
    );
  });

  conductorLengthTotals.forEach((totals, conductorType) => {
    const mapping =
      CONDUCTOR_KHS_MAPPING[conductorType as keyof typeof CONDUCTOR_KHS_MAPPING];
    if (!mapping) return;

    const totalLengthWithAndongan = Math.ceil(
      totals.wireWeightedMeters * mapping.andonganFactor
    );

    addDirectKhsVolume(
      mapping.mduKhsId,
      totalLengthWithAndongan,
      `${totals.spanCount} Gawang (${totals.rawMeters}m + andongan)`
    );

    const gawangVolume = Math.max(
      totals.spanCount,
      Math.ceil(totals.rawMeters / 50)
    );
    addDirectKhsVolume(
      mapping.jasaKhsId,
      gawangVolume,
      `Tarik ${totals.spanCount} Gawang (${totals.rawMeters}m)`
    );
  });

  // 3. Tambahkan Transportasi Material jika ada pekerjaan rencana / bongkar
  if (
    transportasiRit > 0 &&
    (directKhsVolumeMap.size > 0 || packageGroupsMap.size > 0)
  ) {
    addDirectKhsVolume(
      'JASA_TRANSPORTASI_MATERIAL',
      transportasiRit,
      'Angkutan Material & Tiang',
      'XVI'
    );
  }

  // 4. Susun RabLineItem per Seksi Romawi I s/d XVI sesuai Contoh_Format_RAB.pdf
  const generatedItems: RabLineItem[] = [];
  const golOrder = { 'MDU-KD': 1, HDW: 2, JASA: 3 };

  RAB_ROMAN_SECTIONS.forEach((sec) => {
    // 4a. Masukkan item langsung pada seksi ini (misal: Seksi I Tiang Beton, Seksi VI/XI Penghantar, Seksi XIV/XV Bongkar, Seksi XVI Transportasi)
    const directEntriesForSec: Array<{
      khsId: string;
      volume: number;
      sources: Set<string>;
      section: RabRomanSection;
    }> = [];

    directKhsVolumeMap.forEach((data, mapKey) => {
      const khsId = mapKey.includes('::') ? mapKey.split('::')[1] : mapKey;
      const khs = KHS_MASTER_CATALOG[khsId];
      if (!khs) return;
      const targetSec = data.sectionOverride || khs.section;
      if (targetSec === sec.code) {
        directEntriesForSec.push({
          khsId,
          volume: data.volume,
          sources: data.sources,
          section: targetSec,
        });
      }
    });

    directEntriesForSec.sort((a, b) => {
      const ka = KHS_MASTER_CATALOG[a.khsId];
      const kb = KHS_MASTER_CATALOG[b.khsId];
      return golOrder[ka.gol] - golOrder[kb.gol];
    });

    directEntriesForSec.forEach((entry, idx) => {
      const khs = KHS_MASTER_CATALOG[entry.khsId];
      generatedItems.push({
        id: `rab-auto-${sec.code}-${entry.khsId}-${idx}`,
        section: sec.code,
        uraian: khs.uraian,
        gol: khs.gol,
        satuan: khs.satuan,
        volume: entry.volume,
        hargaSatuan: khs.hargaSatuan,
        itemNo: idx + 1,
        sourceInfo: Array.from(entry.sources).slice(0, 3).join(', '),
      });
    });

    // 4b. Masukkan grup Paket Konstruksi pada seksi ini:
    // Baris Header: NO = "+", URAIAN = "<Kode Konstruksi>" (misal MJ6-T), SAT = "Unit", VOL = <totalPkgQty>
    // Diikuti baris detail komponen 1, 2, 3...
    packageGroupsMap.forEach((grp) => {
      if (grp.section !== sec.code) return;

      generatedItems.push({
        id: `rab-pkg-header-${sec.code}-${grp.code}`,
        section: sec.code,
        uraian: grp.code,
        gol: 'HDW',
        satuan: 'Unit',
        volume: grp.totalPkgQty,
        hargaSatuan: 0,
        isPackageHeader: true,
        parentPackageCode: grp.code,
        sourceInfo: Array.from(grp.sources).slice(0, 3).join(', '),
      });

      let compItemNo = 1;
      const pkgCatalogDef = CONSTRUCTION_PACKAGES_CATALOG.find(
        (p) => p.code.toUpperCase() === grp.code.toUpperCase()
      );
      grp.componentVolumes.forEach((vol, khsId) => {
        const khs = KHS_MASTER_CATALOG[khsId];
        if (!khs || vol <= 0) return;
        const catalogComp = pkgCatalogDef?.components.find(
          (c) => c.khsId === khsId
        );
        const unitQtyPerPackage =
          grp.totalPkgQty > 0
            ? Math.round((vol / grp.totalPkgQty) * 10000) / 10000
            : catalogComp?.qty || 1;

        generatedItems.push({
          id: `rab-pkg-item-${sec.code}-${grp.code}-${khsId}`,
          section: sec.code,
          uraian: khs.uraian,
          gol: khs.gol,
          satuan: khs.satuan,
          volume: vol,
          hargaSatuan: khs.hargaSatuan,
          khsId,
          itemNo: compItemNo++,
          parentPackageCode: grp.code,
          unitQtyPerPackage,
          sourceInfo: `${grp.code} (${grp.totalPkgQty} Unit)`,
        });
      });
    });
  });

  return generatedItems;
}

/**
 * Mengubah volume set utama pada baris Header Paket Konstruksi (+ | SJ6 | Unit | Vol) di Tabel RAB
 * dan secara otomatis mengalikan seluruh volume detail material di bawahnya berdasarkan unitQtyPerPackage
 * (aman terhadap nilai sementara 0 saat pengguna menekan Backspace sebelum mengetik angka baru).
 */
export function updateRabPackageHeaderVolume(
  items: RabLineItem[],
  headerId: string,
  nextPkgVolRaw: number
): RabLineItem[] {
  const headerItem = items.find((r) => r.id === headerId);
  if (!headerItem || !headerItem.isPackageHeader) {
    return items;
  }

  const nextPkgVol = Math.max(0, Number(nextPkgVolRaw) || 0);
  const pkgCode = (
    headerItem.parentPackageCode ||
    headerItem.uraian ||
    ''
  ).toUpperCase();
  const pkgDef = CONSTRUCTION_PACKAGES_CATALOG.find(
    (p) => p.code.toUpperCase() === pkgCode
  );
  const oldPkgVol =
    Number(headerItem.volume) > 0 ? Number(headerItem.volume) : 1;

  return items.map((row) => {
    if (row.id === headerId) {
      return {
        ...row,
        volume: nextPkgVol,
      };
    }

    if (
      !row.isPackageHeader &&
      row.parentPackageCode &&
      row.parentPackageCode.toUpperCase() === pkgCode &&
      row.section === headerItem.section
    ) {
      let baseUnitQty = row.unitQtyPerPackage;
      if (baseUnitQty === undefined || baseUnitQty <= 0) {
        const matchedComp = pkgDef?.components.find((comp) => {
          if (row.khsId && comp.khsId === row.khsId) return true;
          const khs = KHS_MASTER_CATALOG[comp.khsId];
          return khs && khs.uraian === row.uraian;
        });
        if (matchedComp) {
          baseUnitQty = matchedComp.qty;
        } else if (row.volume > 0 && oldPkgVol > 0) {
          baseUnitQty = Math.round((row.volume / oldPkgVol) * 10000) / 10000;
        } else {
          baseUnitQty = 1;
        }
      }

      return {
        ...row,
        unitQtyPerPackage: baseUnitQty,
        volume: Math.round(baseUnitQty * nextPkgVol * 100) / 100,
      };
    }

    return row;
  });
}

export interface RabRowCostBreakdown {
  mdu: number;
  hardware: number;
  jasa: number;
  jumlah: number;
}

/**
 * Menghitung rincian biaya 1 baris RAB ke kolom MDU, HARDWARE, JASA, dan JUMLAH
 * sesuai format resmi RAB PT. PLN (PERSERO) UID JAWA TENGAH
 */
export function calculateRabRowBreakdown(
  item: Pick<RabLineItem, 'gol' | 'volume' | 'hargaSatuan' | 'isPackageHeader'>
): RabRowCostBreakdown {
  if (item.isPackageHeader) {
    return { mdu: 0, hardware: 0, jasa: 0, jumlah: 0 };
  }
  const total = Math.round(
    (Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0)
  );
  if (item.gol === 'MDU-KD') {
    return { mdu: total, hardware: 0, jasa: 0, jumlah: total };
  }
  if (item.gol === 'HDW') {
    return { mdu: 0, hardware: total, jasa: 0, jumlah: total };
  }
  return { mdu: 0, hardware: 0, jasa: total, jumlah: total };
}

export interface RabSummaryResult {
  subTotalMdu: number;
  subTotalHardware: number;
  subTotalJasa: number;
  subTotalJumlah: number;
  ppnPercent: number;
  ppnAmount: number;
  grandTotal: number;
  terbilang: string;
}

/**
 * Menghitung rekapitulasi total RAB (Sub-Total MDU, Hardware, Jasa, Jumlah, PPN, Grand Total & Terbilang)
 */
export function calculateRabSummary(
  items: RabLineItem[],
  ppnPercent: number = 10
): RabSummaryResult {
  let subTotalMdu = 0;
  let subTotalHardware = 0;
  let subTotalJasa = 0;

  items.forEach((item) => {
    if (item.isPackageHeader) return;
    const row = calculateRabRowBreakdown(item);
    subTotalMdu += row.mdu;
    subTotalHardware += row.hardware;
    subTotalJasa += row.jasa;
  });

  const subTotalJumlah = subTotalMdu + subTotalHardware + subTotalJasa;
  const ppnAmount = Math.round(subTotalJumlah * (ppnPercent / 100));
  const grandTotal = subTotalJumlah + ppnAmount;

  return {
    subTotalMdu,
    subTotalHardware,
    subTotalJasa,
    subTotalJumlah,
    ppnPercent,
    ppnAmount,
    grandTotal,
    terbilang: numberToTerbilangRupiah(grandTotal),
  };
}

/**
 * Mengelompokkan baris RAB ke dalam 16 seksi Romawi (I. TIANG s/d XVI. TRANSPORTASI)
 */
export function groupRabItemsByRomanSection(items: RabLineItem[]): Array<{
  code: RabRomanSection;
  roman: string;
  title: string;
  fullLabel: string;
  items: RabLineItem[];
}> {
  return RAB_ROMAN_SECTIONS.map((sec) => ({
    ...sec,
    items: items.filter((item) => item.section === sec.code),
  }));
}

const SATUAN_WORDS = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

function convertNumberToWordsId(n: number): string {
  const num = Math.floor(Math.abs(n));
  if (num === 0) return '';
  if (num < 12) return SATUAN_WORDS[num];
  if (num < 20) return `${convertNumberToWordsId(num - 10)} Belas`.trim();
  if (num < 100) {
    const puluh = Math.floor(num / 10);
    const sisa = num % 10;
    return `${SATUAN_WORDS[puluh]} Puluh ${convertNumberToWordsId(sisa)}`.trim();
  }
  if (num < 200) {
    return `Seratus ${convertNumberToWordsId(num - 100)}`.trim();
  }
  if (num < 1000) {
    const ratus = Math.floor(num / 100);
    const sisa = num % 100;
    return `${SATUAN_WORDS[ratus]} Ratus ${convertNumberToWordsId(sisa)}`.trim();
  }
  if (num < 2000) {
    return `Seribu ${convertNumberToWordsId(num - 1000)}`.trim();
  }
  if (num < 1000000) {
    const ribu = Math.floor(num / 1000);
    const sisa = num % 1000;
    return `${convertNumberToWordsId(ribu)} Ribu ${convertNumberToWordsId(sisa)}`.trim();
  }
  if (num < 1000000000) {
    const juta = Math.floor(num / 1000000);
    const sisa = num % 1000000;
    return `${convertNumberToWordsId(juta)} Juta ${convertNumberToWordsId(sisa)}`.trim();
  }
  if (num < 1000000000000) {
    const miliar = Math.floor(num / 1000000000);
    const sisa = num % 1000000000;
    return `${convertNumberToWordsId(miliar)} Miliar ${convertNumberToWordsId(sisa)}`.trim();
  }
  const triliun = Math.floor(num / 1000000000000);
  const sisa = num % 1000000000000;
  return `${convertNumberToWordsId(triliun)} Triliun ${convertNumberToWordsId(sisa)}`.trim();
}

/**
 * Mengubah nominal angka Rupiah menjadi kalimat Terbilang resmi Bahasa Indonesia
 * Contoh: 30016107 -> "Tiga Puluh Juta Enam Belas Ribu Seratus Tujuh Rupiah"
 */
export function numberToTerbilangRupiah(amount: number): string {
  const rounded = Math.round(amount || 0);
  if (rounded <= 0) return 'Nol Rupiah';
  const words = convertNumberToWordsId(rounded).replace(/\s+/g, ' ').trim();
  return `${words} Rupiah`;
}

export interface EtiketRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EtiketProjectedNodeInput {
  id: string;
  kodeTiang: string;
  kind: SurveyPoleNode['kind'];
  x: number;
  y: number;
  lines: string[];
}

export interface EtiketProjectedSpanInput {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  badgeText: string;
  badgeW: number;
  badgeH?: number;
}

export interface EtiketPlacedNodeCallout {
  id: string;
  pt: { x: number; y: number };
  lines: string[];
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  anchorX: number;
  anchorY: number;
  placeRight: boolean;
}

export interface EtiketPlacedSpanBadge {
  id: string;
  centerX: number;
  centerY: number;
  boxX: number;
  boxY: number;
  badgeW: number;
  badgeH: number;
}

export interface EtiketLayoutResult {
  nodePlacements: EtiketPlacedNodeCallout[];
  spanBadges: EtiketPlacedSpanBadge[];
  mainRoadLabelCenter: { x: number; y: number };
  simpangRoadLabelCenter: { x: number; y: number };
  allPlacedRects: EtiketRect[];
}

/**
 * Mengecek apakah dua kotak (bounding box) saling bertabrakan/menumpuk dengan margin `pad`
 */
export function rectsOverlap(
  a: EtiketRect,
  b: EtiketRect,
  pad: number = 4
): boolean {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

function ccw(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): boolean {
  return (
    ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
    ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
  );
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: EtiketRect,
  pad: number = 2
): boolean {
  const rx = r.x - pad;
  const ry = r.y - pad;
  const rw = r.w + pad * 2;
  const rh = r.h + pad * 2;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) {
    return false;
  }
  if (
    (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) ||
    (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh)
  ) {
    return true;
  }
  return (
    segmentsIntersect(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
    segmentsIntersect(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
    segmentsIntersect(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh) ||
    segmentsIntersect(x1, y1, x2, y2, rx, ry, rx, ry + rh)
  );
}

/**
 * Menghitung tata letak (layout) 2D bebas tumpukan (zero-overlap) untuk seluruh elemen Gambar Sketsa Etiket PLN:
 * - Kotak keterangan konstruksi tiang (SA4-20/1..N)
 * - Label jarak & kabel gawang (`25m (JTR ///)`)
 * - Label Nama Jalan Utama & Simpang Jalan Desa
 * Menjamin tidak ada kotak callout, simbol tiang, badge gawang, maupun label jalan yang saling menumpuk.
 */
export function computeEtiketCalloutLayout(params: {
  nodes: EtiketProjectedNodeInput[];
  spans: EtiketProjectedSpanInput[];
  defaultMainRoadCenter: { x: number; y: number };
  defaultSimpangRoadCenter: { x: number; y: number };
  showRoadSketch?: boolean;
}): EtiketLayoutResult {
  const {
    nodes,
    spans,
    defaultMainRoadCenter,
    defaultSimpangRoadCenter,
    showRoadSketch = true,
  } = params;

  const SVG_MIN_X = 10;
  const SVG_MAX_X = 910;
  const SVG_MIN_Y = 10;
  const SVG_MAX_Y = 450;

  // Obstacle list: starts with North Arrow (U) and all Pole Symbols
  const obstacles: EtiketRect[] = [
    // North Arrow at (55, 55), radius 28
    { x: 24, y: 24, w: 62, h: 62 },
  ];

  const poleRects: EtiketRect[] = nodes.map((n) => ({
    x: n.x - 13,
    y: n.y - 13,
    w: 26,
    h: 26,
  }));
  obstacles.push(...poleRects);

  // 1. Place Span Midpoint Badges without overlapping poles or other span badges
  const spanBadges: EtiketPlacedSpanBadge[] = spans.map((sp) => {
    const badgeW = sp.badgeW;
    const badgeH = sp.badgeH ?? 16;
    const midX = (sp.x1 + sp.x2) / 2;
    const midY = (sp.y1 + sp.y2) / 2;
    const dx = sp.x2 - sp.x1;
    const dy = sp.y2 - sp.y1;
    const segLen = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / segLen;
    const ny = dx / segLen;
    const tx = dx / segLen;
    const ty = dy / segLen;

    const offsets: Array<[number, number]> = [
      [0, 0],
      [16, 0],
      [-16, 0],
      [0, 12],
      [0, -12],
      [26, 0],
      [-26, 0],
      [20, 12],
      [-20, -12],
      [36, 0],
      [-36, 0],
    ];

    let chosenCenter = { x: midX, y: midY };
    for (const [dn, dt] of offsets) {
      const cx = Math.max(
        SVG_MIN_X + badgeW / 2,
        Math.min(SVG_MAX_X - badgeW / 2, midX + nx * dn + tx * dt)
      );
      const cy = Math.max(
        SVG_MIN_Y + badgeH / 2,
        Math.min(SVG_MAX_Y - badgeH / 2, midY + ny * dn + ty * dt)
      );
      const candidateRect: EtiketRect = {
        x: cx - badgeW / 2,
        y: cy - badgeH / 2,
        w: badgeW,
        h: badgeH,
      };
      const hasCollision = obstacles.some((obs) =>
        rectsOverlap(candidateRect, obs, 3)
      );
      if (!hasCollision) {
        chosenCenter = { x: cx, y: cy };
        break;
      }
    }

    const finalRect: EtiketRect = {
      x: chosenCenter.x - badgeW / 2,
      y: chosenCenter.y - badgeH / 2,
      w: badgeW,
      h: badgeH,
    };
    obstacles.push(finalRect);

    return {
      id: sp.id,
      centerX: chosenCenter.x,
      centerY: chosenCenter.y,
      boxX: finalRect.x,
      boxY: finalRect.y,
      badgeW,
      badgeH,
    };
  });

  // 2. Place Pole Callout Boxes with 2D directional candidates + grid fallback
  const placedCalloutRects: EtiketRect[] = [];
  const placedLeaders: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  const nodePlacements: EtiketPlacedNodeCallout[] = nodes.map((n, idx) => {
    const boxWidth = 124;
    const boxHeight = Math.max(26, 15 + n.lines.length * 10);

    const preferRight =
      n.kind === 'GARDU_TRAFO' || n.kind === 'GARDU_RENCANA'
        ? false
        : idx % 2 === 0;

    const candidatePositions: Array<{ x: number; y: number; preferred: boolean }> = [];
    const radii = [32, 54, 78, 106, 138];

    radii.forEach((r) => {
      const yOffsets = [
        -boxHeight / 2,
        -boxHeight + 8,
        -6,
        -boxHeight - 10,
        12,
        -boxHeight - 28,
        28,
      ];
      const rightX = n.x + r;
      const leftX = n.x - boxWidth - r;

      const sidePairs = preferRight
        ? [
            { x: rightX, pref: true },
            { x: leftX, pref: false },
          ]
        : [
            { x: leftX, pref: true },
            { x: rightX, pref: false },
          ];

      sidePairs.forEach((side) => {
        yOffsets.forEach((yo) => {
          candidatePositions.push({
            x: side.x,
            y: n.y + yo,
            preferred: side.pref,
          });
        });
      });

      // Above and below candidates (especially helpful at the top or bottom of a road curve)
      const xOffsets = [
        -boxWidth / 2,
        12,
        -boxWidth - 12,
        -boxWidth * 0.25,
        -boxWidth * 0.75,
        36,
        -boxWidth - 36,
      ];
      xOffsets.forEach((xo) => {
        candidatePositions.push({
          x: n.x + xo,
          y: n.y - boxHeight - r * 0.75,
          preferred: false,
        });
        candidatePositions.push({
          x: n.x + xo,
          y: n.y + r * 0.75,
          preferred: false,
        });
      });
    });

    // Add full 2D canvas grid fallback sorted by distance to pole (n.x, n.y)
    const gridCandidates: Array<{ x: number; y: number; dist: number }> = [];
    for (let gx = SVG_MIN_X; gx <= SVG_MAX_X - boxWidth; gx += 26) {
      for (let gy = SVG_MIN_Y; gy <= SVG_MAX_Y - boxHeight; gy += 20) {
        const cx = gx + boxWidth / 2;
        const cy = gy + boxHeight / 2;
        gridCandidates.push({
          x: gx,
          y: gy,
          dist: Math.hypot(cx - n.x, cy - n.y),
        });
      }
    }
    gridCandidates.sort((a, b) => a.dist - b.dist);
    gridCandidates.forEach((gc) => {
      candidatePositions.push({ x: gc.x, y: gc.y, preferred: false });
    });

    let bestX = Math.max(
      SVG_MIN_X,
      Math.min(SVG_MAX_X - boxWidth, preferRight ? n.x + 34 : n.x - boxWidth - 34)
    );
    let bestY = Math.max(
      SVG_MIN_Y,
      Math.min(SVG_MAX_Y - boxHeight, n.y - boxHeight / 2)
    );
    let bestScore = Infinity;

    for (const cand of candidatePositions) {
      if (
        cand.x < SVG_MIN_X ||
        cand.x + boxWidth > SVG_MAX_X ||
        cand.y < SVG_MIN_Y ||
        cand.y + boxHeight > SVG_MAX_Y
      ) {
        continue;
      }

      const candRect: EtiketRect = {
        x: cand.x,
        y: cand.y,
        w: boxWidth,
        h: boxHeight,
      };

      // Hard check: must NOT overlap any obstacle (other callouts, pole circles, span badges, North arrow)
      if (obstacles.some((obs) => rectsOverlap(candRect, obs, 5))) {
        continue;
      }

      const anchorX = Math.max(cand.x, Math.min(cand.x + boxWidth, n.x));
      const anchorY = Math.max(cand.y, Math.min(cand.y + boxHeight, n.y));
      const dist = Math.hypot(anchorX - n.x, anchorY - n.y);

      let penalty = dist;
      if (cand.preferred) {
        penalty -= 14;
      }

      // Penalize if this pole's leader line cuts through any already-placed callout box
      for (const prevBox of placedCalloutRects) {
        if (segmentIntersectsRect(n.x, n.y, anchorX, anchorY, prevBox, 3)) {
          penalty += 500;
        }
      }

      // Penalize if any previous pole's leader line cuts through this candidate callout box
      for (const prevLeader of placedLeaders) {
        if (
          segmentIntersectsRect(
            prevLeader.x1,
            prevLeader.y1,
            prevLeader.x2,
            prevLeader.y2,
            candRect,
            3
          )
        ) {
          penalty += 500;
        }
        if (
          segmentsIntersect(
            n.x,
            n.y,
            anchorX,
            anchorY,
            prevLeader.x1,
            prevLeader.y1,
            prevLeader.x2,
            prevLeader.y2
          )
        ) {
          penalty += 250;
        }
      }

      // Penalize if the callout box sits directly on top of a span cable line
      for (const sp of spans) {
        if (segmentIntersectsRect(sp.x1, sp.y1, sp.x2, sp.y2, candRect, 2)) {
          penalty += 90;
        }
      }

      if (penalty < bestScore) {
        bestScore = penalty;
        bestX = Math.round(cand.x * 10) / 10;
        bestY = Math.round(cand.y * 10) / 10;
        // Early exit if we found an ideal close candidate with zero leader/span crossings
        if (penalty < 55) {
          break;
        }
      }
    }

    const finalRect: EtiketRect = {
      x: bestX,
      y: bestY,
      w: boxWidth,
      h: boxHeight,
    };
    obstacles.push(finalRect);
    placedCalloutRects.push(finalRect);

    const anchorX = Math.max(bestX, Math.min(bestX + boxWidth, n.x));
    const anchorY = Math.max(bestY, Math.min(bestY + boxHeight, n.y));
    placedLeaders.push({ x1: n.x, y1: n.y, x2: anchorX, y2: anchorY });

    const placeRight = bestX + boxWidth / 2 >= n.x;

    return {
      id: n.id,
      pt: { x: n.x, y: n.y },
      lines: n.lines,
      boxX: bestX,
      boxY: bestY,
      boxWidth,
      boxHeight,
      anchorX,
      anchorY,
      placeRight,
    };
  });

  // 3. Place Road Labels (Main Road & Simpang Road) so they NEVER overlap any callout box, pole, or span badge
  const findNonOverlappingLabelCenter = (
    defaultCenter: { x: number; y: number },
    labelW: number,
    labelH: number
  ): { x: number; y: number } => {
    const candidateOffsets: Array<[number, number]> = [
      [0, 0],
      [0, 22],
      [0, -22],
      [45, 18],
      [-45, 18],
      [45, -18],
      [-45, -18],
      [85, 24],
      [-85, 24],
      [0, 42],
      [0, -42],
      [120, 0],
      [-120, 0],
      [140, 32],
      [-140, 32],
    ];

    for (const [dx, dy] of candidateOffsets) {
      const cx = defaultCenter.x + dx;
      const cy = defaultCenter.y + dy;
      if (
        cx - labelW / 2 < SVG_MIN_X ||
        cx + labelW / 2 > SVG_MAX_X ||
        cy - labelH / 2 < SVG_MIN_Y ||
        cy + labelH / 2 > SVG_MAX_Y
      ) {
        continue;
      }
      const rect: EtiketRect = {
        x: cx - labelW / 2,
        y: cy - labelH / 2,
        w: labelW,
        h: labelH,
      };
      if (!obstacles.some((obs) => rectsOverlap(rect, obs, 5))) {
        obstacles.push(rect);
        return { x: cx, y: cy };
      }
    }

    // Fallback 2D grid scan sorted by distance to defaultCenter
    let bestCenter = defaultCenter;
    let bestDist = Infinity;
    for (
      let gx = SVG_MIN_X + labelW / 2;
      gx <= SVG_MAX_X - labelW / 2;
      gx += 28
    ) {
      for (
        let gy = SVG_MIN_Y + labelH / 2;
        gy <= SVG_MAX_Y - labelH / 2;
        gy += 18
      ) {
        const rect: EtiketRect = {
          x: gx - labelW / 2,
          y: gy - labelH / 2,
          w: labelW,
          h: labelH,
        };
        if (obstacles.some((obs) => rectsOverlap(rect, obs, 5))) {
          continue;
        }
        const d = Math.hypot(gx - defaultCenter.x, gy - defaultCenter.y);
        if (d < bestDist) {
          bestDist = d;
          bestCenter = { x: gx, y: gy };
        }
      }
    }

    obstacles.push({
      x: bestCenter.x - labelW / 2,
      y: bestCenter.y - labelH / 2,
      w: labelW,
      h: labelH,
    });
    return bestCenter;
  };

  const mainRoadLabelCenter = showRoadSketch
    ? findNonOverlappingLabelCenter(defaultMainRoadCenter, 192, 18)
    : defaultMainRoadCenter;

  const simpangRoadLabelCenter = showRoadSketch
    ? findNonOverlappingLabelCenter(defaultSimpangRoadCenter, 144, 16)
    : defaultSimpangRoadCenter;

  return {
    nodePlacements,
    spanBadges,
    mainRoadLabelCenter,
    simpangRoadLabelCenter,
    allPlacedRects: obstacles,
  };
}

