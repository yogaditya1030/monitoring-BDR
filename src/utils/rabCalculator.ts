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
    return span.cables.map((c) => ({
      ...c,
      jenisJaringan:
        c.jenisJaringan || inferNetworkCategoryFromConductor(c.conductorType),
      phaseCount: inferPhaseCountFromConductor(
        c.conductorType,
        c.phaseCount ?? span.phaseCount
      ),
      circuitCount: Math.max(1, c.circuitCount || 1),
    }));
  }
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
 * Mengekspansi rincian komponen material & jasa KHS untuk 1 item konstruksi pada tiang,
 * mendukung pemilihan riil (centang aktif/nonaktif & ubah volume per komponen).
 */
export function getConstructionAssignmentBreakdown(
  assign: SurveyPoleConstructionAssignment
): {
  rows: PoleMaterialBreakdownRow[];
  totalActivePrice: number;
} {
  const pkg = CONSTRUCTION_PACKAGES_CATALOG.find(
    (p) => p.code.toUpperCase() === assign.code.toUpperCase()
  );
  if (!pkg || assign.qty <= 0) {
    return { rows: [], totalActivePrice: 0 };
  }

  const disabledSet = new Set(assign.disabledKhsIds || []);
  const customQtyMap = assign.customComponentQty || {};
  const rows: PoleMaterialBreakdownRow[] = [];
  let totalActivePrice = 0;

  pkg.components.forEach((comp) => {
    const khs = KHS_MASTER_CATALOG[comp.khsId];
    if (!khs) return;
    const enabled = !disabledSet.has(comp.khsId);
    const unitQty =
      customQtyMap[comp.khsId] !== undefined
        ? Math.max(0, Number(customQtyMap[comp.khsId]))
        : comp.qty;
    const vol = enabled ? Math.round(unitQty * assign.qty * 100) / 100 : 0;
    const jumlahHarga = enabled ? Math.round(vol * khs.hargaSatuan) : 0;

    if (enabled) {
      totalActivePrice += jumlahHarga;
    }

    rows.push({
      packageCode: pkg.code,
      packageQty: assign.qty,
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
    const { rows: assignRows } = getConstructionAssignmentBreakdown(assign);
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
 */
export function formatPoleCalloutLines(node: SurveyPoleNode): string[] {
  if (!node.constructions || node.constructions.length === 0) {
    return [];
  }
  return node.constructions
    .filter((c) => c.qty > 0 && c.code.trim() !== '')
    .map((c) => `${c.qty} ${c.code}`);
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
 * berdasarkan Standar Konstruksi PRK 2019 & Acuan Harga KHS HSS 2020 PT. PLN (PERSERO) UID JAWA TENGAH
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

  // Map akumulator volume per KHS ID
  const khsVolumeMap = new Map<
    string,
    { volume: number; sources: Set<string> }
  >();

  const addKhsVolume = (khsId: string, qty: number, sourceLabel: string) => {
    if (qty <= 0) return;
    if (!KHS_MASTER_CATALOG[khsId]) return;
    const existing = khsVolumeMap.get(khsId);
    if (existing) {
      existing.volume = Math.round((existing.volume + qty) * 100) / 100;
      existing.sources.add(sourceLabel);
    } else {
      khsVolumeMap.set(khsId, {
        volume: Math.round(qty * 100) / 100,
        sources: new Set([sourceLabel]),
      });
    }
  };

  let plannedPoleCount = 0;

  // 1. Ekspansi konstruksi pada Tiang Rencana & Titik Konstruksi Baru (TIANG_RENCANA & TITIK_APP)
  nodes.forEach((node) => {
    if (node.kind !== 'TIANG_RENCANA' && node.kind !== 'TITIK_APP') {
      return;
    }

    node.constructions.forEach((assignment) => {
      if (assignment.qty <= 0) return;
      const pkg = CONSTRUCTION_PACKAGES_CATALOG.find(
        (p) => p.code.toUpperCase() === assignment.code.toUpperCase()
      );
      if (!pkg) return;

      const disabledSet = new Set(assignment.disabledKhsIds || []);
      const customQtyMap = assignment.customComponentQty || {};

      if (pkg.category === 'TIANG') {
        plannedPoleCount += assignment.qty;
      }

      pkg.components.forEach((comp) => {
        if (disabledSet.has(comp.khsId)) return;
        const unitQty =
          customQtyMap[comp.khsId] !== undefined
            ? Math.max(0, Number(customQtyMap[comp.khsId]))
            : comp.qty;
        if (unitQty <= 0) return;
        addKhsVolume(
          comp.khsId,
          unitQty * assignment.qty,
          `${node.kodeTiang} (${assignment.qty}x ${pkg.code})`
        );
      });
    });
  });

  // Tambahkan Pembetonan Tiang Rencana bila diaktifkan
  if (includePembetonanTiang && plannedPoleCount > 0) {
    addKhsVolume(
      'JASA_PEMBETONAN_TIANG',
      plannedPoleCount,
      `Pondasi ${plannedPoleCount} Tiang Rencana`
    );
  }

  // 2. Ekspansi tarikan kabel / penghantar dari seluruh kabel berstatus RENCANA di setiap Gawang (mendukung >1 kabel per gawang)
  const conductorLengthTotals = new Map<
    string,
    { rawMeters: number; wireWeightedMeters: number; spanCount: number }
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
      if (cable.statusJaringan !== 'RENCANA') return;
      const circuits = Math.max(1, cable.circuitCount || 1);
      const mapping =
        CONDUCTOR_KHS_MAPPING[
          cable.conductorType as keyof typeof CONDUCTOR_KHS_MAPPING
        ];
      const phaseCount = inferPhaseCountFromConductor(
        cable.conductorType,
        cable.phaseCount
      );

      // Untuk kawat JTM terbuka (AAAC / AAAC-S dengan phaseMultiplier default 3),
      // bila dipilih 1 Phase maka menggunakan 1 kawat penghantar, bila 3 Phase menggunakan 3 kawat penghantar.
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

  conductorLengthTotals.forEach((totals, conductorType) => {
    const mapping =
      CONDUCTOR_KHS_MAPPING[conductorType as keyof typeof CONDUCTOR_KHS_MAPPING];
    if (!mapping) return;

    // Panjang total termasuk faktor andongan (sag/waste) & pengali fasa (1 fasa vs 3 fasa)
    const totalLengthWithAndongan = Math.ceil(
      totals.wireWeightedMeters * mapping.andonganFactor
    );

    addKhsVolume(
      mapping.mduKhsId,
      totalLengthWithAndongan,
      `${totals.spanCount} Gawang (${totals.rawMeters}m + andongan)`
    );

    // Jasa penarikan penghantar (per gawang / per 50m)
    const gawangVolume = Math.max(
      totals.spanCount,
      Math.ceil(totals.rawMeters / 50)
    );
    addKhsVolume(
      mapping.jasaKhsId,
      gawangVolume,
      `Tarik ${totals.spanCount} Gawang (${totals.rawMeters}m)`
    );
  });

  // 3. Tambahkan Transportasi Material jika ada pekerjaan rencana
  if (transportasiRit > 0 && khsVolumeMap.size > 0) {
    addKhsVolume(
      'JASA_TRANSPORTASI_MATERIAL',
      transportasiRit,
      'Angkutan Material & Tiang'
    );
  }

  // 4. Konversi ke array RabLineItem terurut sesuai Seksi Romawi I s/d XVI
  const sectionOrder = RAB_ROMAN_SECTIONS.map((s) => s.code);
  const generatedItems: RabLineItem[] = [];

  Array.from(khsVolumeMap.entries()).forEach(([khsId, data], idx) => {
    const khs = KHS_MASTER_CATALOG[khsId];
    if (!khs) return;
    generatedItems.push({
      id: `rab-auto-${khsId}-${idx}`,
      section: khs.section,
      uraian: khs.uraian,
      gol: khs.gol,
      satuan: khs.satuan,
      volume: data.volume,
      hargaSatuan: khs.hargaSatuan,
      sourceInfo: Array.from(data.sources).slice(0, 3).join(', '),
    });
  });

  generatedItems.sort((a, b) => {
    const secDiff =
      sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
    if (secDiff !== 0) return secDiff;
    // Urutkan MDU-KD -> HDW -> JASA di dalam seksi yang sama
    const golOrder = { 'MDU-KD': 1, HDW: 2, JASA: 3 };
    return golOrder[a.gol] - golOrder[b.gol];
  });

  return generatedItems;
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
  item: Pick<RabLineItem, 'gol' | 'volume' | 'hargaSatuan'>
): RabRowCostBreakdown {
  const total = Math.round((Number(item.volume) || 0) * (Number(item.hargaSatuan) || 0));
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
