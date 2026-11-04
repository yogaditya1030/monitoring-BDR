import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CablePhaseCount,
  ConstructionActionType,
  ConstructionCategory,
  NetworkCategory,
  PermohonanItem,
  RabGolongan,
  RabLineItem,
  SpanCableItem,
  SurveyNodeKind,
  SurveyPoleNode,
  SurveyRabDesign,
  SurveySpanConductorType,
  SurveySpanEdge,
} from '../types';
import {
  CONDUCTOR_KHS_MAPPING,
  CONSTRUCTION_CATEGORY_LIST,
  CONSTRUCTION_PACKAGES_CATALOG,
  KHS_MASTER_CATALOG,
  RAB_ROMAN_SECTIONS,
} from '../data/khsAndConstructionCatalog';
import {
  buildBongkarXSvg,
  buildPhaseSlashSvg,
  calculateGeodesicDistanceMeters,
  calculateOffsetLineCoords,
  calculatePoleCalloutOffset,
  calculateRabRowBreakdown,
  calculateRabSummary,
  computeEtiketCalloutLayout,
  formatPoleCalloutLines,
  generateRabItemsFromSurvey,
  getCableScreenAngleDeg,
  getCableVisualStyle,
  getConstructionAssignmentBreakdown,
  getEffectiveSpanCables,
  getMidpointCoordinate,
  getPhaseSlashSymbol,
  getPoleKhsMaterialBreakdown,
  getStaggeredPhaseTickRatio,
  groupRabItemsByRomanSection,
  inferNetworkCategoryFromConductor,
  inferPhaseCountFromConductor,
  isCableMarkedBongkar,
  isNodeMarkedBongkar,
  isSpanMarkedBongkar,
  updateRabPackageHeaderVolume,
} from '../utils/rabCalculator';
import { formatRupiah } from '../utils/plnValidation';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Compass,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from 'lucide-react';

interface TeknikSurveyRabStudioProps {
  item: PermohonanItem;
  petugasSurvei: string;
  onUpdatePetugasSurvei?: (name: string) => void;
  tagingLokasi: string;
  nomorGardu: string;
  nomorTiang: string;
  initialDesign?: SurveyRabDesign;
  onApplyRabDesign: (
    design: SurveyRabDesign,
    grandTotalRab: number,
    summaryNotes: string
  ) => void;
}

type StudioSubTab =
  | 'google_maps'
  | 'sketsa_etiket'
  | 'tabel_rab'
  | 'berkas_survey_pdf';

type DrawingToolMode =
  | 'SELECT_DRAG'
  | 'ADD_TIANG_RENCANA'
  | 'ADD_TIANG_EKSISTING'
  | 'ADD_GARDU_RENCANA'
  | 'ADD_GARDU_TRAFO'
  | 'ADD_TITIK_KONSTRUKSI'
  | 'CONNECT_SPAN'
  | 'MARK_BONGKAR'
  | 'DELETE_ITEM';

interface SurveyHistorySnapshot {
  nodes: SurveyPoleNode[];
  spans: SurveySpanEdge[];
  actionLabel: string;
}

type MapLayerType = 'roadmap' | 'hybrid';

type CalloutDisplayMode = 'offset_leader' | 'compact' | 'hidden';

export const TeknikSurveyRabStudio: React.FC<TeknikSurveyRabStudioProps> = ({
  item,
  petugasSurvei,
  onUpdatePetugasSurvei,
  tagingLokasi,
  nomorGardu,
  nomorTiang,
  initialDesign,
  onApplyRabDesign,
}) => {
  // Parse initial center from tagingLokasi inputted by Security/Front Office or default to ULP Borobudur
  const parsedCenter = useMemo(() => {
    if (tagingLokasi) {
      const parts = tagingLokasi.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { lat: parts[0], lng: parts[1] };
      }
    }
    if (item.tagingLokasi) {
      const fallbackParts = item.tagingLokasi.split(',').map((p) => parseFloat(p.trim()));
      if (fallbackParts.length === 2 && !isNaN(fallbackParts[0]) && !isNaN(fallbackParts[1])) {
        return { lat: fallbackParts[0], lng: fallbackParts[1] };
      }
    }
    return { lat: -7.6079, lng: 110.2038 };
  }, [tagingLokasi, item.tagingLokasi]);

  // Start with an empty drawing canvas unless the record already has saved design nodes
  const defaultInitialNodes = useMemo<SurveyPoleNode[]>(() => {
    if (initialDesign?.nodes && initialDesign.nodes.length > 0) {
      return initialDesign.nodes;
    }
    return [];
  }, [initialDesign]);

  const defaultInitialSpans = useMemo<SurveySpanEdge[]>(() => {
    if (initialDesign?.spans && initialDesign.spans.length > 0) {
      return initialDesign.spans;
    }
    return [];
  }, [initialDesign]);

  const [studioTab, setStudioTab] = useState<StudioSubTab>('google_maps');
  const [toolMode, setToolMode] = useState<DrawingToolMode>('SELECT_DRAG');
  const [tiangKindMode, setTiangKindMode] = useState<'ADD_TIANG_RENCANA' | 'ADD_TIANG_EKSISTING'>('ADD_TIANG_RENCANA');
  const [garduKindMode, setGarduKindMode] = useState<'ADD_GARDU_RENCANA' | 'ADD_GARDU_TRAFO'>('ADD_GARDU_RENCANA');
  const [mapTypeId, setMapTypeId] = useState<MapLayerType>('roadmap');
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const [showLegendOnMap, setShowLegendOnMap] = useState<boolean>(true);
  const [calloutMode, setCalloutMode] = useState<CalloutDisplayMode>('offset_leader');
  const [showCornerMaterialCard, setShowCornerMaterialCard] = useState<boolean>(true);
  const [inspectorMode, setInspectorMode] = useState<'NODE' | 'SPAN'>('NODE');
  const [expandedConstIndex, setExpandedConstIndex] = useState<number | null>(null);

  // Refs for Leaflet Map Canvas
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [judulGambar, setJudulGambar] = useState(
    initialDesign?.judulGambar || `Perluasan / Perbaikan Jaringan ${item.projectName}`
  );
  const [lokasiPekerjaan, setLokasiPekerjaan] = useState(
    initialDesign?.lokasiPekerjaan || item.alamat || 'Wilayah Unit Borobudur'
  );
  // Digambar oleh & Direncanakan oleh otomatis disinkronkan dari form Nama Petugas Survei Teknik
  const [digambarOleh, setDigambarOleh] = useState(
    initialDesign?.digambarOleh || petugasSurvei || item.petugasSurvei || ''
  );
  const effectiveDigambarOleh =
    digambarOleh || petugasSurvei || item.petugasSurvei || '';
  const direncanakanOleh = effectiveDigambarOleh;
  // Diperiksa otomatis isi TL Teknik, Disetujui otomatis isi Manajer
  const [diperiksaOleh, setDiperiksaOleh] = useState(
    initialDesign?.diperiksaOleh && initialDesign.diperiksaOleh !== 'ARIS DWI SS'
      ? initialDesign.diperiksaOleh
      : 'TL Teknik'
  );
  const [disetujuiOleh, setDisetujuiOleh] = useState(
    initialDesign?.disetujuiOleh && initialDesign.disetujuiOleh !== 'ARIF SETYAWAN'
      ? initialDesign.disetujuiOleh
      : 'Manajer'
  );

  // Sinkronkan Digambar & Direncanakan ketika form Nama Petugas Survei Teknik diisi/diubah
  useEffect(() => {
    if (petugasSurvei && petugasSurvei.trim() !== '') {
      setDigambarOleh(petugasSurvei);
    }
  }, [petugasSurvei]);

  // Sketsa Jalan di E-tiket PLN sesuai Google Maps / Lokasi
  const [showRoadSketchOnEtiket, setShowRoadSketchOnEtiket] = useState<boolean>(true);
  const [namaJalanUtama, setNamaJalanUtama] = useState<string>(() => {
    const addr = item.alamat || '';
    const match = addr.match(/(Jl\.?\s+[^,]+|Jalan\s+[^,]+)/i);
    return match ? match[1].toUpperCase() : 'JL. RAYA LOKASI SURVEI (SESUAI PETA)';
  });
  const [namaJalanSimpang, setNamaJalanSimpang] = useState<string>(
    'SIMPANG JALAN DESA / LINGKUNGAN'
  );

  // Header RAB Resmi sesuai Contoh_Format_RAB.pdf
  const [rabPekerjaan, setRabPekerjaan] = useState<string>(
    initialDesign?.rabHeader?.pekerjaan ||
      `Perluasan / Perbaikan Jaringan ${item.projectName}`
  );
  const [rabLokasi, setRabLokasi] = useState<string>(
    initialDesign?.rabHeader?.lokasi || item.alamat || 'Unit Borobudur'
  );
  const [rabPelaksana, setRabPelaksana] = useState<string>(
    initialDesign?.rabHeader?.pelaksana ||
      'PT. PLN (PERSERO) UID JAWA TENGAH - UNIT BOROBUDUR'
  );
  const [rabAnggaran, setRabAnggaran] = useState<string>(
    initialDesign?.rabHeader?.anggaran ||
      `ANGGARAN INVESTASI / OPERASI TAHUN ${item.tahun || new Date().getFullYear()}`
  );
  const [rabNomorPrk, setRabNomorPrk] = useState<string>(
    initialDesign?.rabHeader?.nomorPrk || item.noNodin || '-'
  );

  // Berkas Surat Permohonan Security (Halaman 1 File Survey PDF)
  const [suratPermohonanFileUrl, setSuratPermohonanFileUrl] = useState<string>(
    item.suratPermohonanDataUrl || ''
  );
  const [suratPermohonanFileName, setSuratPermohonanFileName] = useState<string>(
    item.suratPermohonan || `Surat_Permohonan_${item.projectName.replace(/\s+/g, '_')}.pdf`
  );

  const [nodes, setNodes] = useState<SurveyPoleNode[]>(defaultInitialNodes);
  const [spans, setSpans] = useState<SurveySpanEdge[]>(defaultInitialSpans);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    defaultInitialNodes[0]?.id || null
  );
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(
    defaultInitialSpans[0]?.id || null
  );
  const [pendingSpanStartNodeId, setPendingSpanStartNodeId] = useState<string | null>(
    null
  );

  // Default conductor & phase count when drawing a new span or adding cable to a span
  const [activeConductorType, setActiveConductorType] =
    useState<SurveySpanConductorType>('NFA2X-T 3x70+1x70');
  const [activePhaseCount, setActivePhaseCount] = useState<CablePhaseCount>(3);
  const [activeSpanStatus, setActiveSpanStatus] = useState<'RENCANA' | 'EKSISTING'>(
    'RENCANA'
  );
  const [autoConnectNewPoles, setAutoConnectNewPoles] = useState(true);

  // State for adding another cable type into an existing span (gawang)
  const [spanAddConductor, setSpanAddConductor] =
    useState<SurveySpanConductorType>('AAAC 70');
  const [spanAddPhaseCount, setSpanAddPhaseCount] = useState<CablePhaseCount>(3);
  const [spanAddStatus, setSpanAddStatus] = useState<'RENCANA' | 'EKSISTING'>(
    'RENCANA'
  );

  // Undo (Ctrl+Z) & Redo (Ctrl+Y) History Stack
  const [undoStack, setUndoStack] = useState<SurveyHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SurveyHistorySnapshot[]>([]);
  const [undoBannerMessage, setUndoBannerMessage] = useState<string | null>(null);

  const showUndoToast = (msg: string) => {
    setUndoBannerMessage(msg);
    setTimeout(() => {
      setUndoBannerMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const recordHistorySnapshot = (actionLabel: string) => {
    setUndoStack((prev) => [
      ...prev.slice(-39),
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        spans: JSON.parse(JSON.stringify(spans)),
        actionLabel,
      },
    ]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const lastSnapshot = prevUndo[prevUndo.length - 1];
      setRedoStack((prevRedo) => [
        ...prevRedo.slice(-39),
        {
          nodes: JSON.parse(JSON.stringify(nodes)),
          spans: JSON.parse(JSON.stringify(spans)),
          actionLabel: lastSnapshot.actionLabel,
        },
      ]);
      setNodes(lastSnapshot.nodes);
      setSpans(lastSnapshot.spans);
      showUndoToast(`↩ Undo berhasil: ${lastSnapshot.actionLabel}`);
      return prevUndo.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextSnapshot = prevRedo[prevRedo.length - 1];
      setUndoStack((prevUndo) => [
        ...prevUndo.slice(-39),
        {
          nodes: JSON.parse(JSON.stringify(nodes)),
          spans: JSON.parse(JSON.stringify(spans)),
          actionLabel: nextSnapshot.actionLabel,
        },
      ]);
      setNodes(nextSnapshot.nodes);
      setSpans(nextSnapshot.spans);
      showUndoToast(`↪ Redo berhasil: ${nextSnapshot.actionLabel}`);
      return prevRedo.slice(0, -1);
    });
  };

  // Keep latest undo/redo & delete handlers in refs for keyboard shortcut listener (Ctrl+Z / Ctrl+Y / Delete)
  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;
  const handleDeleteKeyboardRef = useRef<() => void>(() => {});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedoRef.current();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteKeyboardRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // RAB Settings & Items
  const [includePembetonanTiang, setIncludePembetonanTiang] = useState(
    initialDesign?.includePembetonanTiang ?? true
  );
  const [transportasiRit, setTransportasiRit] = useState(
    initialDesign?.transportasiRit ?? 1
  );
  const [ppnPercent, setPpnPercent] = useState<number>(
    initialDesign?.ppnPercent ?? 10
  );

  const [rabItems, setRabItems] = useState<RabLineItem[]>(() => {
    if (initialDesign?.rabItems && initialDesign.rabItems.length > 0) {
      return initialDesign.rabItems;
    }
    return generateRabItemsFromSurvey({
      nodes: defaultInitialNodes,
      spans: defaultInitialSpans,
      includePembetonanTiang: true,
      transportasiRit: 1,
    });
  });

  // Automatically sync RAB items whenever map poles, cables, or construction component selections change
  const isFirstRabRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRabRenderRef.current) {
      isFirstRabRenderRef.current = false;
      return;
    }
    const generated = generateRabItemsFromSurvey({
      nodes,
      spans,
      includePembetonanTiang,
      transportasiRit,
    });
    setRabItems((prev) => {
      const manualRows = prev.filter((r) => r.sourceInfo === 'Input Manual KHS');
      return [...generated, ...manualRows];
    });
  }, [nodes, spans, includePembetonanTiang, transportasiRit]);

  // State for filtering & searching Standar Konstruksi code to selected pole
  const [constCategoryFilter, setConstCategoryFilter] = useState<
    ConstructionCategory | 'ALL'
  >('ALL');
  const [constSearchQuery, setConstSearchQuery] = useState<string>('');
  const [newConstCode, setNewConstCode] = useState<string>('SJ5');
  const [newConstQty, setNewConstQty] = useState<number>(1);
  const [newConstAction, setNewConstAction] =
    useState<ConstructionActionType>('PASANG');
  const [showPoleKhsBreakdown, setShowPoleKhsBreakdown] = useState<boolean>(true);

  // State for manually adding a KHS item or Jasa Pembongkaran to RAB
  const [khsSectionFilter, setKhsSectionFilter] = useState<string>('ALL');
  const [khsSearchQuery, setKhsSearchQuery] = useState<string>('');
  const [selectedKhsIdToAdd, setSelectedKhsIdToAdd] = useState<string>('TIANG_9_200');
  const [manualKhsQty, setManualKhsQty] = useState<number>(1);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedSpan = useMemo(
    () => spans.find((s) => s.id === selectedSpanId) || spans[0] || null,
    [spans, selectedSpanId]
  );

  const selectedPoleMaterialBreakdown = useMemo(
    () => (selectedNode ? getPoleKhsMaterialBreakdown(selectedNode) : null),
    [selectedNode]
  );

  const filteredConstructionCatalog = useMemo(() => {
    const q = constSearchQuery.trim().toLowerCase();
    return CONSTRUCTION_PACKAGES_CATALOG.filter((pkg) => {
      if (constCategoryFilter !== 'ALL' && pkg.category !== constCategoryFilter) {
        return false;
      }
      if (!q) return true;
      const inHeader =
        pkg.code.toLowerCase().includes(q) ||
        pkg.name.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.category.toLowerCase().includes(q);
      if (inHeader) return true;
      return pkg.components.some((comp) => {
        const khs = KHS_MASTER_CATALOG[comp.khsId];
        return khs && khs.uraian.toLowerCase().includes(q);
      });
    });
  }, [constCategoryFilter, constSearchQuery]);

  // Keep newConstCode synchronized with the filtered catalog so searching immediately selects the matching construction
  useEffect(() => {
    if (
      filteredConstructionCatalog.length > 0 &&
      !filteredConstructionCatalog.some(
        (p) => p.code.toUpperCase() === newConstCode.toUpperCase()
      )
    ) {
      setNewConstCode(filteredConstructionCatalog[0].code);
    }
  }, [filteredConstructionCatalog, newConstCode]);

  const filteredKhsMasterList = useMemo(() => {
    const q = khsSearchQuery.trim().toLowerCase();
    return Object.values(KHS_MASTER_CATALOG).filter((khs) => {
      if (khsSectionFilter !== 'ALL' && khs.section !== khsSectionFilter) {
        return false;
      }
      if (!q) return true;
      return (
        khs.uraian.toLowerCase().includes(q) ||
        khs.id.toLowerCase().includes(q) ||
        khs.section.toLowerCase().includes(q) ||
        khs.gol.toLowerCase().includes(q)
      );
    });
  }, [khsSectionFilter, khsSearchQuery]);

  useEffect(() => {
    if (
      filteredKhsMasterList.length > 0 &&
      !filteredKhsMasterList.some((k) => k.id === selectedKhsIdToAdd)
    ) {
      setSelectedKhsIdToAdd(filteredKhsMasterList[0].id);
    }
  }, [filteredKhsMasterList, selectedKhsIdToAdd]);

  // Helper to compute total KHS price of a Standar Konstruksi package
  const getPackageTotalKhsPrice = (code: string): number => {
    const pkg = CONSTRUCTION_PACKAGES_CATALOG.find(
      (p) => p.code.toUpperCase() === code.toUpperCase()
    );
    if (!pkg) return 0;
    return pkg.components.reduce((sum, comp) => {
      const khs = KHS_MASTER_CATALOG[comp.khsId];
      return sum + (khs ? Math.round(comp.qty * khs.hargaSatuan) : 0);
    }, 0);
  };

  // Recalculate span geodesic distances whenever node coordinates change
  const updateNodeCoordinates = (
    nodeId: string,
    newLat: number,
    newLng: number,
    recordUndo: boolean = false
  ) => {
    if (recordUndo) {
      const movedNode = nodes.find((n) => n.id === nodeId);
      recordHistorySnapshot(`Geser Titik ${movedNode?.kodeTiang || ''}`);
    }
    const roundedLat = Math.round(newLat * 1000000) / 1000000;
    const roundedLng = Math.round(newLng * 1000000) / 1000000;

    const updatedNodes = nodes.map((n) =>
      n.id === nodeId ? { ...n, lat: roundedLat, lng: roundedLng } : n
    );
    setNodes(updatedNodes);

    setSpans((prevSpans) =>
      prevSpans.map((sp) => {
        if (sp.fromNodeId !== nodeId && sp.toNodeId !== nodeId) return sp;
        const fromN = updatedNodes.find((n) => n.id === sp.fromNodeId);
        const toN = updatedNodes.find((n) => n.id === sp.toNodeId);
        if (!fromN || !toN) return sp;
        return {
          ...sp,
          distanceMeters: calculateGeodesicDistanceMeters(
            fromN.lat,
            fromN.lng,
            toN.lat,
            toN.lng
          ),
        };
      })
    );
  };

  // Delete a pole / gardu / titik konstruksi directly (from map or inspector) with Undo support
  const handleDeleteNodeById = (nodeId: string) => {
    if (nodes.length === 0) return;
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;
    recordHistorySnapshot(`Hapus Titik ${targetNode.kodeTiang}`);
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    setNodes(nextNodes);
    setSpans((prev) =>
      prev.filter((s) => s.fromNodeId !== nodeId && s.toNodeId !== nodeId)
    );
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(nextNodes[0]?.id || null);
    }
    showUndoToast(`🗑️ Titik ${targetNode.kodeTiang} dihapus (Tekan Ctrl+Z untuk Undo)`);
  };

  // Delete an entire gawang / span directly (from map or inspector) with Undo support
  const handleDeleteSpanById = (spanId: string) => {
    const targetSpan = spans.find((s) => s.id === spanId);
    if (!targetSpan) return;
    const fromKode =
      nodes.find((n) => n.id === targetSpan.fromNodeId)?.kodeTiang || '?';
    const toKode =
      nodes.find((n) => n.id === targetSpan.toNodeId)?.kodeTiang || '?';
    recordHistorySnapshot(`Hapus Kabel Gawang ${fromKode} -> ${toKode}`);
    const nextSpans = spans.filter((s) => s.id !== spanId);
    setSpans(nextSpans);
    if (selectedSpanId === spanId) {
      setSelectedSpanId(nextSpans[0]?.id || null);
    }
    if (nextSpans.length === 0) {
      setInspectorMode('NODE');
    }
    showUndoToast(
      `🗑️ Kabel ${fromKode} → ${toKode} (${targetSpan.distanceMeters}m) dihapus (Tekan Ctrl+Z untuk Undo)`
    );
  };

  handleDeleteKeyboardRef.current = () => {
    if (inspectorMode === 'SPAN' && selectedSpan) {
      handleDeleteSpanById(selectedSpan.id);
    } else if (inspectorMode === 'NODE' && selectedNode) {
      handleDeleteNodeById(selectedNode.id);
    } else if (selectedSpan) {
      handleDeleteSpanById(selectedSpan.id);
    }
  };

  // Helper to add a cable between two nodes (if a span already exists between them, append to its multi-cable array!)
  const addOrAppendCableBetweenNodes = (
    fromNode: SurveyPoleNode,
    toNode: SurveyPoleNode,
    conductorType: SurveySpanConductorType,
    statusJaringan: 'RENCANA' | 'EKSISTING',
    phaseCountOverride?: CablePhaseCount,
    skipHistorySnapshot: boolean = false
  ) => {
    if (!skipHistorySnapshot) {
      recordHistorySnapshot(
        `Tarik Kabel ${conductorType} (${fromNode.kodeTiang} -> ${toNode.kodeTiang})`
      );
    }
    const jenisJaringan: NetworkCategory =
      inferNetworkCategoryFromConductor(conductorType);
    const phaseCount: CablePhaseCount = inferPhaseCountFromConductor(
      conductorType,
      phaseCountOverride
    );
    const newCableItem: SpanCableItem = {
      id: `cab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      statusJaringan,
      jenisJaringan,
      conductorType,
      phaseCount,
      circuitCount: 1,
    };

    const existingSpan = spans.find(
      (s) =>
        (s.fromNodeId === fromNode.id && s.toNodeId === toNode.id) ||
        (s.fromNodeId === toNode.id && s.toNodeId === fromNode.id)
    );

    if (existingSpan) {
      setSpans((prev) =>
        prev.map((sp) => {
          if (sp.id !== existingSpan.id) return sp;
          const currentCables = getEffectiveSpanCables(sp);
          const updatedCables = [...currentCables, newCableItem];
          return {
            ...sp,
            statusJaringan: updatedCables.some((c) => c.statusJaringan === 'RENCANA')
              ? 'RENCANA'
              : 'EKSISTING',
            jenisJaringan,
            conductorType,
            phaseCount,
            cables: updatedCables,
          };
        })
      );
      setSelectedSpanId(existingSpan.id);
    } else {
      const dist = calculateGeodesicDistanceMeters(
        fromNode.lat,
        fromNode.lng,
        toNode.lat,
        toNode.lng
      );
      const newSpanId = `span-${Date.now()}`;
      const newSpan: SurveySpanEdge = {
        id: newSpanId,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        statusJaringan,
        jenisJaringan,
        conductorType,
        phaseCount,
        cables: [newCableItem],
        distanceMeters: dist,
      };
      setSpans((prev) => [...prev, newSpan]);
      setSelectedSpanId(newSpanId);
    }
  };

  // Add a pole / gardu / titik konstruksi at given coordinates
  const handleAddPoleAtCoord = (
    lat: number,
    lng: number,
    kind: SurveyNodeKind
  ) => {
    const plannedCount =
      nodes.filter((n) => n.kind === 'TIANG_RENCANA').length + 1;
    const existingCount =
      nodes.filter((n) => n.kind === 'TIANG_EKSISTING').length + 1;
    const garduPlannedCount =
      nodes.filter((n) => n.kind === 'GARDU_RENCANA').length + 1;
    const garduExistingCount =
      nodes.filter((n) => n.kind === 'GARDU_TRAFO').length + 1;
    const appCount = nodes.filter((n) => n.kind === 'TITIK_APP').length + 1;

    const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const defaultKode =
      kind === 'TIANG_RENCANA'
        ? `SA4-20/${plannedCount}`
        : kind === 'GARDU_RENCANA'
        ? `GD-RENC-${garduPlannedCount}`
        : kind === 'GARDU_TRAFO'
        ? nomorGardu || `GD-BBD-${garduExistingCount}`
        : kind === 'TITIK_APP'
        ? `TK-SR/${appCount}`
        : nomorTiang || `SA4-637/174/${20 + existingCount}`;

    recordHistorySnapshot(`Tambah Titik ${defaultKode}`);

    const defaultConstructions =
      kind === 'TIANG_RENCANA'
        ? [
            { code: 'C9-200', qty: 1 },
            { code: 'SJ5', qty: 1 },
            { code: 'CM2-12', qty: 1 },
          ]
        : kind === 'GARDU_RENCANA' || kind === 'GARDU_TRAFO'
        ? [
            { code: 'C12-350', qty: 1 },
            { code: 'CC8-A', qty: 1 },
            { code: 'CG-135 (50kVA)', qty: 1 },
            { code: 'SJ6', qty: 2 },
          ]
        : kind === 'TITIK_APP'
        ? [{ code: 'SR-1P', qty: 1 }]
        : [
            { code: 'C12-350', qty: 1 },
            { code: 'SJ6', qty: 1 },
          ];

    const newNode: SurveyPoleNode = {
      id: newId,
      kodeTiang: defaultKode,
      kind,
      lat: Math.round(lat * 1000000) / 1000000,
      lng: Math.round(lng * 1000000) / 1000000,
      constructions: defaultConstructions,
      catatan:
        kind === 'TIANG_RENCANA'
          ? 'Tiang Rencana Baru (Merah)'
          : kind === 'GARDU_RENCANA'
          ? 'Gardu Distribusi Rencana Baru'
          : kind === 'GARDU_TRAFO'
          ? 'Gardu Distribusi Eksisting'
          : kind === 'TITIK_APP'
          ? 'Titik Konstruksi / Sambungan Rumah (SR)'
          : 'Tiang Eksisting (Hitam)',
    };

    const prevLastNode =
      nodes.find((n) => n.id === selectedNodeId) || nodes[nodes.length - 1];

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setSelectedNodeId(newId);
    setInspectorMode('NODE');
    setShowCornerMaterialCard(true);

    if (autoConnectNewPoles && prevLastNode) {
      const autoConductor: SurveySpanConductorType =
        kind === 'TITIK_APP' ? 'NFA2X 2x16' : activeConductorType;
      const autoPhase: CablePhaseCount =
        kind === 'TITIK_APP' ? 1 : activePhaseCount;
      const autoStatus: 'RENCANA' | 'EKSISTING' =
        kind === 'TIANG_RENCANA' || kind === 'GARDU_RENCANA' || kind === 'TITIK_APP'
          ? 'RENCANA'
          : 'EKSISTING';
      addOrAppendCableBetweenNodes(
        prevLastNode,
        newNode,
        autoConductor,
        autoStatus,
        autoPhase,
        true
      );
    }
  };

  // Quick-add a planned pole 40 meters from the last pole (or at center if canvas is empty)
  const handleQuickAddPlannedPole40m = () => {
    const lastNode =
      nodes.find((n) => n.id === selectedNodeId) || nodes[nodes.length - 1];
    if (!lastNode) {
      handleAddPoleAtCoord(parsedCenter.lat, parsedCenter.lng, 'TIANG_RENCANA');
      return;
    }
    const nextLat = lastNode.lat + 0.00018;
    const nextLng = lastNode.lng + 0.00031;
    handleAddPoleAtCoord(nextLat, nextLng, 'TIANG_RENCANA');
  };

  // Toggle Bongkar (Simbol X Merah + Jasa Pembongkaran) on a pole/gardu node
  const handleToggleNodeBongkar = (nodeId: string) => {
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;
    const nextIsBongkar = !isNodeMarkedBongkar(targetNode);
    recordHistorySnapshot(
      `${nextIsBongkar ? 'Tandai Bongkar (X Merah)' : 'Batal Bongkar'} ${
        targetNode.kodeTiang
      }`
    );
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          isBongkar: nextIsBongkar,
          constructions: n.constructions.map((c) => ({
            ...c,
            actionType: nextIsBongkar ? 'BONGKAR' : 'PASANG',
          })),
        };
      })
    );
    showUndoToast(
      nextIsBongkar
        ? `✕ Titik ${targetNode.kodeTiang} ditandai DIBONGKAR (Simbol X Merah & Jasa Bongkar masuk RAB)`
        : `✓ Tanda Bongkar pada ${targetNode.kodeTiang} dibatalkan`
    );
  };

  // Handle clicking on a marker when in DELETE_ITEM, MARK_BONGKAR, CONNECT_SPAN, or SELECT_DRAG mode
  const handleMarkerClick = (nodeId: string) => {
    if (toolMode === 'DELETE_ITEM') {
      handleDeleteNodeById(nodeId);
      return;
    }
    const connectedSpans = spans.filter(
      (s) => s.fromNodeId === nodeId || s.toNodeId === nodeId
    );
    const nextConnectedSpanId =
      connectedSpans.length > 0
        ? connectedSpans[connectedSpans.length - 1].id
        : selectedSpanId;

    if (toolMode === 'MARK_BONGKAR') {
      handleToggleNodeBongkar(nodeId);
      setSelectedNodeId(nodeId);
      if (nextConnectedSpanId) setSelectedSpanId(nextConnectedSpanId);
      setInspectorMode('NODE');
      setShowCornerMaterialCard(true);
      return;
    }
    if (toolMode === 'CONNECT_SPAN') {
      if (!pendingSpanStartNodeId) {
        setPendingSpanStartNodeId(nodeId);
        setSelectedNodeId(nodeId);
      } else if (pendingSpanStartNodeId !== nodeId) {
        const fromNode = nodes.find((n) => n.id === pendingSpanStartNodeId);
        const toNode = nodes.find((n) => n.id === nodeId);
        if (fromNode && toNode) {
          addOrAppendCableBetweenNodes(
            fromNode,
            toNode,
            activeConductorType,
            activeSpanStatus,
            activePhaseCount
          );
          setInspectorMode('SPAN');
          setShowCornerMaterialCard(true);
        }
        setPendingSpanStartNodeId(null);
        setSelectedNodeId(nodeId);
      }
      return;
    }
    setSelectedNodeId(nodeId);
    if (nextConnectedSpanId) setSelectedSpanId(nextConnectedSpanId);
    setInspectorMode('NODE');
    setShowCornerMaterialCard(true);
  };

  // Add another cable type to an existing span (Multi-cable per gawang)
  const handleAddCableToSpan = (
    spanId: string,
    conductorType: SurveySpanConductorType,
    statusJaringan: 'RENCANA' | 'EKSISTING',
    phaseCount: CablePhaseCount = spanAddPhaseCount
  ) => {
    recordHistorySnapshot(`Tambah Kabel ${conductorType} (${phaseCount} Phase)`);
    const jenisJaringan = inferNetworkCategoryFromConductor(conductorType);
    const newCable: SpanCableItem = {
      id: `cab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      statusJaringan,
      jenisJaringan,
      conductorType,
      phaseCount,
      circuitCount: 1,
    };
    setSpans((prev) =>
      prev.map((sp) => {
        if (sp.id !== spanId) return sp;
        const existingCables = getEffectiveSpanCables(sp);
        const nextCables = [...existingCables, newCable];
        return {
          ...sp,
          statusJaringan: nextCables.some((c) => c.statusJaringan === 'RENCANA')
            ? 'RENCANA'
            : 'EKSISTING',
          cables: nextCables,
        };
      })
    );
  };

  // Toggle 1 Phase (/) <-> 3 Phase (///) on a specific cable in a span
  const handleToggleCablePhase = (spanId: string, cableId: string) => {
    recordHistorySnapshot('Ubah Fasa Kabel (1 Phase / 3 Phase)');
    setSpans((prev) =>
      prev.map((sp) => {
        if (sp.id !== spanId) return sp;
        const existingCables = getEffectiveSpanCables(sp);
        const nextCables = existingCables.map((c) => {
          if (c.id !== cableId) return c;
          const nextPhase: CablePhaseCount = c.phaseCount === 1 ? 3 : 1;
          return { ...c, phaseCount: nextPhase };
        });
        return {
          ...sp,
          phaseCount: nextCables[0]?.phaseCount || 3,
          cables: nextCables,
        };
      })
    );
  };

  // Toggle Bongkar (Simbol X Merah + Jasa Pembongkaran) on an entire cable span (gawang)
  // PENTING: Bongkar TIDAK menghapus kabel dari gambar/kanvas, melainkan memberi tanda X merah pada gambar & memasukkan Jasa Bongkar ke RAB.
  const handleToggleSpanBongkar = (spanId: string) => {
    const targetSpan = spans.find((s) => s.id === spanId);
    if (!targetSpan) return;
    const nextIsBongkar = !isSpanMarkedBongkar(targetSpan);
    recordHistorySnapshot(
      `${
        nextIsBongkar ? 'Tandai Bongkar Kabel (X Merah)' : 'Batal Bongkar Kabel'
      } Gawang ${targetSpan.distanceMeters}m`
    );
    setSpans((prev) =>
      prev.map((sp) => {
        if (sp.id !== spanId) return sp;
        const existingCables = getEffectiveSpanCables(sp);
        const nextCables = existingCables.map((c) => ({
          ...c,
          isBongkar: nextIsBongkar,
          actionType: (nextIsBongkar ? 'BONGKAR' : 'PASANG') as ConstructionActionType,
        }));
        return {
          ...sp,
          isBongkar: nextIsBongkar,
          actionType: nextIsBongkar ? 'BONGKAR' : 'PASANG',
          cables: nextCables,
        };
      })
    );
    showUndoToast(
      nextIsBongkar
        ? `✕ Kabel gawang ${targetSpan.distanceMeters}m ditandai DIBONGKAR (Simbol X Merah tetap di gambar & masuk Jasa Bongkar RAB)`
        : `✓ Tanda Bongkar pada kabel gawang ${targetSpan.distanceMeters}m dibatalkan`
    );
  };

  // Toggle Bongkar (Simbol X Merah) on a specific cable item inside a span
  const handleToggleCableItemBongkar = (spanId: string, cableId: string) => {
    const targetSpan = spans.find((s) => s.id === spanId);
    if (!targetSpan) return;
    const existingCables = getEffectiveSpanCables(targetSpan);
    const targetCable = existingCables.find((c) => c.id === cableId);
    if (!targetCable) return;
    const nextIsBongkar = !isCableMarkedBongkar(targetCable, targetSpan);

    recordHistorySnapshot(
      `${
        nextIsBongkar ? 'Tandai Bongkar Kabel' : 'Batal Bongkar Kabel'
      } ${targetCable.conductorType}`
    );
    setSpans((prev) =>
      prev.map((sp) => {
        if (sp.id !== spanId) return sp;
        const cablesList = getEffectiveSpanCables(sp).map((c) => {
          if (c.id !== cableId) return c;
          return {
            ...c,
            isBongkar: nextIsBongkar,
            actionType: (nextIsBongkar ? 'BONGKAR' : 'PASANG') as ConstructionActionType,
          };
        });
        const anyBongkar = cablesList.some((c) => c.isBongkar);
        return {
          ...sp,
          isBongkar: anyBongkar,
          actionType: anyBongkar ? 'BONGKAR' : 'PASANG',
          cables: cablesList,
        };
      })
    );
    showUndoToast(
      nextIsBongkar
        ? `✕ Kabel ${targetCable.conductorType} ditandai DIBONGKAR (Simbol X Merah tetap di gambar)`
        : `✓ Tanda Bongkar pada kabel ${targetCable.conductorType} dibatalkan`
    );
  };

  // Remove a single cable from a span's multi-cable list (if last cable in span, delete the span)
  const handleRemoveCableFromSpan = (spanId: string, cableId: string) => {
    const targetSpan = spans.find((s) => s.id === spanId);
    if (!targetSpan) return;
    const existingCables = getEffectiveSpanCables(targetSpan);
    const remaining = existingCables.filter((c) => c.id !== cableId);
    if (remaining.length === 0) {
      handleDeleteSpanById(spanId);
      return;
    }
    recordHistorySnapshot('Hapus Jalur Kabel dari Gawang');
    setSpans((prev) =>
      prev.map((sp) => {
        if (sp.id !== spanId) return sp;
        return {
          ...sp,
          statusJaringan: remaining.some((c) => c.statusJaringan === 'RENCANA')
            ? 'RENCANA'
            : 'EKSISTING',
          jenisJaringan: remaining[0].jenisJaringan,
          conductorType: remaining[0].conductorType,
          phaseCount: remaining[0].phaseCount,
          isBongkar: remaining.some((c) => c.isBongkar),
          cables: remaining,
        };
      })
    );
    showUndoToast('🗑️ Jalur kabel dihapus dari gawang (Tekan Ctrl+Z untuk Undo)');
  };

  // Generate RAB from current map state & optionally apply to parent Teknik form
  const handleGenerateRabFromMap = (switchToRabTab: boolean = true) => {
    const generated = generateRabItemsFromSurvey({
      nodes,
      spans,
      includePembetonanTiang,
      transportasiRit,
    });
    setRabItems(generated);
    const summary = calculateRabSummary(generated, ppnPercent);

    const nextDesign: SurveyRabDesign = {
      judulGambar,
      lokasiPekerjaan,
      rayonUlp: 'BOROBUDUR',
      unitUlp: 'BOROBUDUR',
      rabHeader: {
        pekerjaan: rabPekerjaan,
        lokasi: rabLokasi,
        pelaksana: rabPelaksana,
        anggaran: rabAnggaran,
        nomorPrk: rabNomorPrk,
      },
      digambarOleh: effectiveDigambarOleh,
      direncanakanOleh: effectiveDigambarOleh,
      diperiksaOleh,
      disetujuiOleh,
      nodes,
      spans,
      rabItems: generated,
      ppnPercent,
      includePembetonanTiang,
      transportasiRit,
      updatedAt: new Date().toISOString(),
    };

    const plannedPolesCount = nodes.filter(
      (n) => n.kind === 'TIANG_RENCANA'
    ).length;
    const totalPlannedSpanMeters = spans.reduce((acc, s) => {
      const plannedCables = getEffectiveSpanCables(s).filter(
        (c) => c.statusJaringan === 'RENCANA'
      );
      return (
        acc +
        plannedCables.reduce(
          (sum, c) => sum + s.distanceMeters * (c.circuitCount || 1),
          0
        )
      );
    }, 0);

    onApplyRabDesign(
      nextDesign,
      summary.grandTotal,
      `Survei Peta GIS: ${plannedPolesCount} Tiang Rencana, Tarikan Jaringan ${totalPlannedSpanMeters}m • Total RAB Rp ${summary.grandTotal.toLocaleString('id-ID')}`
    );

    if (switchToRabTab) {
      setStudioTab('tabel_rab');
    }
  };

  // Clear all poles & spans on the map canvas (with Undo snapshot)
  const handleClearAllMap = () => {
    if (nodes.length === 0 && spans.length === 0) return;
    recordHistorySnapshot('Reset Kanvas Peta');
    setNodes([]);
    setSpans([]);
    setSelectedNodeId(null);
    setSelectedSpanId(null);
    setPendingSpanStartNodeId(null);
    setRabItems([]);
  };

  // Fit all poles into view on Leaflet Map
  const handleFitAllPoles = (targetNodes: SurveyPoleNode[] = nodes) => {
    const map = mapInstanceRef.current;
    if (!map || targetNodes.length === 0) return;
    const bounds = L.latLngBounds(
      targetNodes.map((n) => [n.lat, n.lng] as [number, number])
    );
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [175, 55],
        paddingBottomRight: [245, 135],
        maxZoom: 18,
      });
    }
  };

  const rabSummary = useMemo(
    () => calculateRabSummary(rabItems, ppnPercent),
    [rabItems, ppnPercent]
  );

  const groupedRabSections = useMemo(
    () => groupRabItemsByRomanSection(rabItems),
    [rabItems]
  );

  // Totals for top badges
  const totalPlannedPoles = nodes.filter(
    (n) => n.kind === 'TIANG_RENCANA' || n.kind === 'GARDU_RENCANA'
  ).length;
  const totalExistingPoles = nodes.filter(
    (n) => n.kind !== 'TIANG_RENCANA' && n.kind !== 'GARDU_RENCANA'
  ).length;
  const totalPlannedMeters = spans.reduce((acc, s) => {
    const plannedCables = getEffectiveSpanCables(s).filter(
      (c) => c.statusJaringan === 'RENCANA'
    );
    return (
      acc +
      plannedCables.reduce(
        (sum, c) => sum + s.distanceMeters * (c.circuitCount || 1),
        0
      )
    );
  }, 0);

  // Export Official 10-Column RAB to Excel (.xls) matching Contoh_Format_RAB.pdf
  const handleExportRabExcel = () => {
    const today = new Date().toISOString().slice(0, 10);
    const fileName = `RAB_PLN_Unit_Borobudur_${item.noNodin.replace(/[^a-zA-Z0-9]/g, '_')}_${today}.xls`;

    const rowsHtml = groupedRabSections
      .map((sec) => {
        const secHeader = `<tr style="background-color:#e2e8f0;font-weight:bold;">
          <td style="text-align:center;">${sec.roman}</td>
          <td colspan="9">${sec.title}</td>
        </tr>`;
        let fallbackNo = 1;
        const itemRows = sec.items
          .map((it) => {
            if (it.isPackageHeader) {
              fallbackNo = 1;
              return `<tr style="background-color:#f8fafc;font-weight:bold;">
                <td style="text-align:center;font-weight:bold;">+</td>
                <td style="font-weight:bold;">${it.uraian}</td>
                <td style="text-align:center;"></td>
                <td style="text-align:center;">${it.satuan || 'Unit'}</td>
                <td style="text-align:right;font-weight:bold;">${it.volume}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>`;
            }
            const br = calculateRabRowBreakdown(it);
            const displayNo = it.itemNo ?? fallbackNo++;
            return `<tr>
              <td style="text-align:center;">${displayNo}</td>
              <td>${it.uraian}</td>
              <td style="text-align:center;">${it.gol}</td>
              <td style="text-align:center;">${it.satuan}</td>
              <td style="text-align:right;">${it.volume}</td>
              <td style="text-align:right;">${it.hargaSatuan}</td>
              <td style="text-align:right;">${br.mdu || '-'}</td>
              <td style="text-align:right;">${br.hardware || '-'}</td>
              <td style="text-align:right;">${br.jasa || '-'}</td>
              <td style="text-align:right;font-weight:bold;">${br.jumlah}</td>
            </tr>`;
          })
          .join('');
        return secHeader + itemRows;
      })
      .join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>
      <body>
        <table border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt;">
          <tr><td colspan="10" style="font-weight:bold;font-size:11pt;">PT. PLN (PERSERO) UID JAWA TENGAH — UP3 MAGELANG — UNIT BOROBUDUR</td></tr>
          <tr><td colspan="10" style="font-weight:bold;font-size:13pt;text-align:center;text-decoration:underline;">RENCANA ANGGARAN BIAYA (RAB)</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Pekerjaan</td><td colspan="8">: ${rabPekerjaan}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Lokasi</td><td colspan="8">: ${rabLokasi}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Pelaksana</td><td colspan="8">: ${rabPelaksana}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Anggaran</td><td colspan="8">: ${rabAnggaran}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Nomor PRK</td><td colspan="8">: ${rabNomorPrk}</td></tr>
          <tr style="background-color:#f1f5f9;font-weight:bold;text-align:center;">
            <th rowspan="2">NO</th>
            <th rowspan="2">URAIAN</th>
            <th rowspan="2">GOL</th>
            <th rowspan="2">SAT</th>
            <th rowspan="2">VOL</th>
            <th rowspan="2">HARGA SATUAN</th>
            <th colspan="4">BIAYA YANG DIPERLUKAN ( Rp )</th>
          </tr>
          <tr style="background-color:#f1f5f9;font-weight:bold;text-align:center;">
            <th>MDU</th><th>HARDWARE</th><th>JASA</th><th>JUMLAH</th>
          </tr>
          ${rowsHtml}
          <tr style="font-weight:bold;background-color:#f8fafc;">
            <td colspan="6" style="text-align:right;">Jumlah MDU - Hardware - Jasa</td>
            <td style="text-align:right;">${rabSummary.subTotalMdu}</td>
            <td style="text-align:right;">${rabSummary.subTotalHardware}</td>
            <td style="text-align:right;">${rabSummary.subTotalJasa}</td>
            <td style="text-align:right;">${rabSummary.subTotalJumlah}</td>
          </tr>
          <tr style="font-weight:bold;background-color:#f8fafc;">
            <td colspan="9" style="text-align:right;">PPN ${rabSummary.ppnPercent}%</td>
            <td style="text-align:right;">${rabSummary.ppnAmount}</td>
          </tr>
          <tr style="font-weight:bold;background-color:#fef3c7;">
            <td colspan="9" style="text-align:right;">Jumlah Total</td>
            <td style="text-align:right;">${rabSummary.grandTotal}</td>
          </tr>
          <tr>
            <td colspan="10" style="font-style:italic;font-weight:bold;">Terbilang : ${rabSummary.terbilang}</td>
          </tr>
          <tr>
            <td colspan="10">Harga yang dipakai adalah RAB HSS 2020</td>
          </tr>
        </table>
      </body>
    </html>`;

    const blob = new Blob([html], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Keep latest handlers in refs so Leaflet event listeners never use stale closures
  const onMapClickRef = useRef<(lat: number, lng: number) => void>(() => {});
  onMapClickRef.current = (lat: number, lng: number) => {
    if (toolMode === 'ADD_TIANG_RENCANA') {
      handleAddPoleAtCoord(lat, lng, 'TIANG_RENCANA');
    } else if (toolMode === 'ADD_TIANG_EKSISTING') {
      handleAddPoleAtCoord(lat, lng, 'TIANG_EKSISTING');
    } else if (toolMode === 'ADD_GARDU_RENCANA') {
      handleAddPoleAtCoord(lat, lng, 'GARDU_RENCANA');
    } else if (toolMode === 'ADD_GARDU_TRAFO') {
      handleAddPoleAtCoord(lat, lng, 'GARDU_TRAFO');
    } else if (toolMode === 'ADD_TITIK_KONSTRUKSI') {
      handleAddPoleAtCoord(lat, lng, 'TITIK_APP');
    }
  };

  const onMarkerClickRef = useRef<(nodeId: string) => void>(() => {});
  onMarkerClickRef.current = (nodeId: string) => {
    handleMarkerClick(nodeId);
  };

  const onSpanClickRef = useRef<(spanId: string) => void>(() => {});
  onSpanClickRef.current = (spanId: string) => {
    if (toolMode === 'DELETE_ITEM') {
      handleDeleteSpanById(spanId);
      return;
    }
    if (toolMode === 'MARK_BONGKAR') {
      handleToggleSpanBongkar(spanId);
      setSelectedSpanId(spanId);
      setInspectorMode('SPAN');
      setShowCornerMaterialCard(true);
      return;
    }
    setSelectedSpanId(spanId);
    setInspectorMode('SPAN');
    setShowCornerMaterialCard(true);
  };

  const onToggleSpanBongkarDirectRef = useRef<(spanId: string) => void>(() => {});
  onToggleSpanBongkarDirectRef.current = (spanId: string) => {
    handleToggleSpanBongkar(spanId);
    setSelectedSpanId(spanId);
    setInspectorMode('SPAN');
    setShowCornerMaterialCard(true);
  };

  const onDeleteSpanDirectRef = useRef<(spanId: string) => void>(() => {});
  onDeleteSpanDirectRef.current = (spanId: string) => {
    handleDeleteSpanById(spanId);
  };

  const onNodeDragEndRef = useRef<(nodeId: string, lat: number, lng: number) => void>(
    () => {}
  );
  onNodeDragEndRef.current = (nodeId: string, lat: number, lng: number) => {
    updateNodeCoordinates(nodeId, lat, lng, true);
  };

  // Initialize Leaflet Map when studioTab === 'google_maps'
  useEffect(() => {
    if (studioTab !== 'google_maps') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerGroupRef.current = null;
        overlayLayerGroupRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = [
      nodes[0]?.lat || parsedCenter.lat,
      nodes[0]?.lng || parsedCenter.lng,
    ];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 18,
      zoomControl: false,
      doubleClickZoom: false,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    const tileGroup = L.layerGroup().addTo(map);
    const overlayGroup = L.layerGroup().addTo(map);

    tileLayerGroupRef.current = tileGroup;
    overlayLayerGroupRef.current = overlayGroup;
    mapInstanceRef.current = map;

    const containerEl = mapContainerRef.current;
    const handleNativeContainerClick = (domEv: MouseEvent) => {
      const target = domEv.target as HTMLElement | null;
      if (!target) return;
      const deleteBtn = target.closest('[data-delete-span-id]') as HTMLElement | null;
      if (deleteBtn) {
        const spanId = deleteBtn.getAttribute('data-delete-span-id');
        if (spanId) {
          domEv.stopPropagation();
          domEv.preventDefault();
          onDeleteSpanDirectRef.current(spanId);
          return;
        }
      }
      const badgeEl = target.closest('[data-select-span-id]') as HTMLElement | null;
      if (badgeEl) {
        const spanId = badgeEl.getAttribute('data-select-span-id');
        if (spanId) {
          domEv.stopPropagation();
          onSpanClickRef.current(spanId);
        }
      }
    };
    containerEl.addEventListener('click', handleNativeContainerClick, true);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    // Fit bounds to all initial poles
    if (nodes.length > 0) {
      const bounds = L.latLngBounds(
        nodes.map((n) => [n.lat, n.lng] as [number, number])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: [175, 55],
          paddingBottomRight: [245, 135],
          maxZoom: 18,
        });
      }
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      containerEl.removeEventListener('click', handleNativeContainerClick, true);
      map.remove();
      mapInstanceRef.current = null;
      tileLayerGroupRef.current = null;
      overlayLayerGroupRef.current = null;
    };
  }, [studioTab]);

  // Keep map centered on parsedCenter (initial permohonan location) whenever tagingLokasi or item changes and no poles are drawn yet
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || studioTab !== 'google_maps') return;
    if (nodes.length === 0) {
      map.setView([parsedCenter.lat, parsedCenter.lng], 18);
    }
  }, [parsedCenter.lat, parsedCenter.lng, studioTab, item.id]);

  const handleCenterToInitialLocation = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([parsedCenter.lat, parsedCenter.lng], 18);
  };

  // Switch Tile Layers (Default: Peta Jalan OpenStreetMap, Option: Satelit Esri)
  useEffect(() => {
    const tileGroup = tileLayerGroupRef.current;
    if (!tileGroup || studioTab !== 'google_maps') return;

    tileGroup.clearLayers();

    if (mapTypeId === 'hybrid') {
      const esriSat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar',
          maxZoom: 19,
        }
      );
      const esriLabels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          opacity: 0.85,
        }
      );
      tileGroup.addLayer(esriSat);
      tileGroup.addLayer(esriLabels);
    } else {
      const osmRoad = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }
      );
      tileGroup.addLayer(osmRoad);
    }
  }, [mapTypeId, studioTab]);

  // Render Multi-Cable Spans (Distinct JTM / JTR / SR Colors + Parallel Offset Polylines) & Non-Overlapping Pole Callouts
  useEffect(() => {
    const overlayGroup = overlayLayerGroupRef.current;
    if (!overlayGroup || studioTab !== 'google_maps') return;

    overlayGroup.clearLayers();

    // 0. Render Initial Permohonan Location Reference Pin (from Security / Front Office intake)
    const initialLocationIcon = L.divIcon({
      className: 'leaflet-initial-permohonan-pin',
      html: `
        <div data-testid="survey-initial-location-pin" style="
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-50%, -100%);
          pointer-events: none;
        ">
          <div style="
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: #ffffff;
            padding: 2px 7px;
            border-radius: 9999px;
            font-size: 9.5px;
            font-weight: 800;
            white-space: nowrap;
            border: 1.5px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.28);
            margin-bottom: 2px;
          ">
            📍 Lokasi Permohonan: ${item.projectName} (${parsedCenter.lat.toFixed(5)}, ${parsedCenter.lng.toFixed(5)})
          </div>
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 50% 50% 50% 0;
            background-color: #0284c7;
            transform: rotate(-45deg);
            border: 2.5px solid #ffffff;
            box-shadow: 0 3px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <span style="transform: rotate(45deg); font-size: 11px; color: #ffffff; font-weight: bold;">🏠</span>
          </div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const initialLocMarker = L.marker([parsedCenter.lat, parsedCenter.lng], {
      icon: initialLocationIcon,
      interactive: false,
      zIndexOffset: 200,
    });
    overlayGroup.addLayer(initialLocMarker);

    // 1. Render Multi-Cable Span Polylines & Midpoint Badges
    spans.forEach((span) => {
      const fromNode = nodes.find((n) => n.id === span.fromNodeId);
      const toNode = nodes.find((n) => n.id === span.toNodeId);
      if (!fromNode || !toNode) return;

      const isSelectedSpan = span.id === selectedSpanId;
      const effectiveCables = getEffectiveSpanCables(span);

      effectiveCables.forEach((cable, cIdx) => {
        const style = getCableVisualStyle(
          cable.jenisJaringan,
          cable.statusJaringan
        );
        const phaseCount = inferPhaseCountFromConductor(
          cable.conductorType,
          cable.phaseCount
        );
        const offsetCoords = calculateOffsetLineCoords(
          fromNode.lat,
          fromNode.lng,
          toNode.lat,
          toNode.lng,
          cIdx,
          effectiveCables.length,
          0.000028
        );

        // Wide invisible hit-target polyline so clicking anywhere near the cable line works effortlessly
        const hitPoly = L.polyline(offsetCoords, {
          color: '#000000',
          weight: 22,
          opacity: 0,
          interactive: true,
        });

        hitPoly.on('click', (ev: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(ev);
          onSpanClickRef.current(span.id);
        });

        overlayGroup.addLayer(hitPoly);

        const poly = L.polyline(offsetCoords, {
          color: style.strokeColor,
          weight: isSelectedSpan ? style.weight + 1.5 : style.weight,
          opacity: 0.96,
          dashArray: style.dashArray,
        });

        poly.on('click', (ev: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(ev);
          onSpanClickRef.current(span.id);
        });

        overlayGroup.addLayer(poly);

        // Render 1-Phase (/) vs 3-Phase (///) diagonal slash tick marks at staggered positions
        // along the span so parallel cables NEVER overlap their phase slashes!
        const angleDeg = getCableScreenAngleDeg(
          offsetCoords[0][0],
          offsetCoords[0][1],
          offsetCoords[1][0],
          offsetCoords[1][1]
        );
        const tickRatio = getStaggeredPhaseTickRatio(
          cIdx,
          effectiveCables.length
        );
        const tickLat =
          offsetCoords[0][0] +
          (offsetCoords[1][0] - offsetCoords[0][0]) * tickRatio;
        const tickLng =
          offsetCoords[0][1] +
          (offsetCoords[1][1] - offsetCoords[0][1]) * tickRatio;

        const phaseSlashIcon = L.divIcon({
          className: 'leaflet-cable-phase-slash',
          html: `
            <div title="${cable.jenisJaringan} ${phaseCount} Phase (${getPhaseSlashSymbol(
            phaseCount
          )}) - ${cable.conductorType}" style="
              width: 28px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            ">
              ${buildPhaseSlashSvg(phaseCount, style.strokeColor, angleDeg)}
            </div>
          `,
          iconSize: [28, 24],
          iconAnchor: [14, 12],
        });

        const slashMarker = L.marker([tickLat, tickLng], {
          icon: phaseSlashIcon,
          interactive: true,
          zIndexOffset: 240,
        });

        slashMarker.on('click', (ev: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(ev);
          onSpanClickRef.current(span.id);
        });

        overlayGroup.addLayer(slashMarker);

        // Bila kabel ini ditandai BONGKAR, tampilkan simbol X berwarna merah tegas tepat di atas garis kabel (tanpa menghapus kabel dari gambar)
        const cableIsBongkar = isCableMarkedBongkar(cable, span);
        if (cableIsBongkar) {
          const bongkarRatio = Math.max(0.18, Math.min(0.82, 1 - tickRatio));
          const bongkarLat =
            offsetCoords[0][0] +
            (offsetCoords[1][0] - offsetCoords[0][0]) * bongkarRatio;
          const bongkarLng =
            offsetCoords[0][1] +
            (offsetCoords[1][1] - offsetCoords[0][1]) * bongkarRatio;

          const cableBongkarIcon = L.divIcon({
            className: 'leaflet-cable-bongkar-x',
            html: `
              <div data-testid="map-cable-bongkar-x-${span.id}" title="Kabel ${cable.conductorType} DIBONGKAR (Simbol X Merah)" style="
                width: 26px;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
              ">
                ${buildBongkarXSvg(24)}
              </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });

          const bongkarMarker = L.marker([bongkarLat, bongkarLng], {
            icon: cableBongkarIcon,
            interactive: true,
            zIndexOffset: 260,
          });

          bongkarMarker.on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev);
            onSpanClickRef.current(span.id);
          });

          overlayGroup.addLayer(bongkarMarker);
        }
      });

      const mid = getMidpointCoordinate(
        fromNode.lat,
        fromNode.lng,
        toNode.lat,
        toNode.lng
      );

      const spanHasBongkar = isSpanMarkedBongkar(span);

      // Build compact multi-cable badge at midpoint with 1-Phase (/) or 3-Phase (///) indicator + Bongkar (✕) toggle
      // PENTING: Tombol ✕ pada badge kabel berfungsi menandai BONGKAR (bukan menghapus dari kanvas!)
      const cableTagsHtml = effectiveCables
        .map((c) => {
          const st = getCableVisualStyle(c.jenisJaringan, c.statusJaringan);
          const ph = inferPhaseCountFromConductor(c.conductorType, c.phaseCount);
          const slashStr = getPhaseSlashSymbol(ph);
          const cBongkar = isCableMarkedBongkar(c, span);
          return `<span style="
            display: inline-block;
            padding: 1px 4px;
            border-radius: 3px;
            background-color: ${cBongkar ? '#dc2626' : st.badgeBg};
            color: ${st.badgeText};
            border: 1px solid ${cBongkar ? '#fecaca' : st.badgeBorder};
            font-size: 8.5px;
            font-weight: 800;
            margin-left: 2px;
          ">${cBongkar ? '&#10005; ' : ''}${c.jenisJaringan} ${ph}&Oslash;(${slashStr})${
            (c.circuitCount || 1) > 1 ? ` x${c.circuitCount}` : ''
          }${cBongkar ? ' BONGKAR' : ''}</span>`;
        })
        .join('');

      const midBadgeIcon = L.divIcon({
        className: 'leaflet-span-distance-badge',
        html: `
          <div style="
            width: 210px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
          ">
            <div data-select-span-id="${span.id}" data-testid="map-cable-badge-${span.id}" title="Klik untuk detail kabel, atau klik ✕ untuk tandai BONGKAR kabel (tetap di gambar)" style="
              pointer-events: auto;
              display: inline-flex;
              align-items: center;
              padding: 2px 5px;
              border-radius: 5px;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 9.5px;
              font-weight: 800;
              white-space: nowrap;
              box-shadow: 0 2px 5px rgba(0,0,0,0.4);
              border: ${
                isSelectedSpan
                  ? '2px solid #fbbf24'
                  : spanHasBongkar
                  ? '2px solid #ef4444'
                  : '1.5px solid #ffffff'
              };
              background-color: rgba(15, 23, 42, 0.94);
              color: #ffffff;
              cursor: pointer;
            ">
              <span>${span.distanceMeters}m</span>
              ${cableTagsHtml}
              <button
                type="button"
                data-bongkar-span-id="${span.id}"
                data-testid="map-badge-bongkar-cable-btn"
                title="${
                  spanHasBongkar
                    ? 'Batalkan tanda Bongkar (✕) pada kabel gawang ini'
                    : 'Tandai Bongkar (Simbol ✕ Merah) pada kabel gawang ini — tetap di gambar & masuk RAB'
                }"
                style="
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  margin-left: 4px;
                  padding: 0px 4px;
                  border-radius: 3px;
                  background-color: ${spanHasBongkar ? '#dc2626' : '#334155'};
                  color: #ffffff;
                  border: 1px solid ${spanHasBongkar ? '#fecaca' : '#94a3b8'};
                  font-size: 9px;
                  font-weight: 900;
                  line-height: 1.25;
                  cursor: pointer;
                "
              >&#10005;</button>
            </div>
          </div>
        `,
        iconSize: [210, 28],
        iconAnchor: [105, 14],
      });

      const midMarker = L.marker([mid.lat, mid.lng], {
        icon: midBadgeIcon,
        interactive: true,
        zIndexOffset: 1200,
      });

      midMarker.on('click', (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        const origTarget = ev.originalEvent?.target as HTMLElement | null;
        if (origTarget && origTarget.closest('[data-bongkar-span-id]')) {
          onToggleSpanBongkarDirectRef.current(span.id);
          return;
        }
        if (origTarget && origTarget.closest('[data-delete-span-id]')) {
          onDeleteSpanDirectRef.current(span.id);
          return;
        }
        onSpanClickRef.current(span.id);
      });

      overlayGroup.addLayer(midMarker);
    });

    // 2. Render Draggable Pole, Gardu & Titik Konstruksi Markers with Non-Overlapping Offset Leader-Line Callouts
    nodes.forEach((node, nodeIdx) => {
      const isSelected = node.id === selectedNodeId;
      const isPendingStart = node.id === pendingSpanStartNodeId;
      const isRencana =
        node.kind === 'TIANG_RENCANA' || node.kind === 'GARDU_RENCANA';
      const isGardu =
        node.kind === 'GARDU_TRAFO' || node.kind === 'GARDU_RENCANA';
      const isTitikApp = node.kind === 'TITIK_APP';
      const calloutLines = formatPoleCalloutLines(node);

      const ringStyle =
        isSelected || isPendingStart
          ? 'box-shadow: 0 0 0 4px #fbbf24, 0 4px 10px rgba(0,0,0,0.45); transform: scale(1.12);'
          : 'box-shadow: 0 3px 8px rgba(0,0,0,0.4);';

      const symbolHtml = isGardu
        ? `<div title="${node.kodeTiang} (${
            node.kind === 'GARDU_RENCANA'
              ? 'Gardu Rencana'
              : 'Gardu Eksisting'
          } - Geser atau Klik)" style="
            width: 26px;
            height: 26px;
            border-radius: 6px;
            background-color: ${
              node.kind === 'GARDU_RENCANA' ? '#dc2626' : '#0f172a'
            };
            color: ${node.kind === 'GARDU_RENCANA' ? '#ffffff' : '#fbbf24'};
            border: 2px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 12px;
            cursor: grab;
            ${ringStyle}
          ">&#9650;</div>`
        : isTitikApp
        ? `<div title="${node.kodeTiang} (Titik Konstruksi / SR - Geser atau Klik)" style="
            width: 22px;
            height: 22px;
            border-radius: 4px;
            background-color: #d97706;
            color: #ffffff;
            border: 2px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 9px;
            cursor: grab;
            ${ringStyle}
          ">SR</div>`
        : `<div title="${node.kodeTiang} (${
            isRencana ? 'Tiang Rencana' : 'Tiang Eksisting'
          } - Geser atau Klik)" style="
            width: 22px;
            height: 22px;
            border-radius: 9999px;
            background-color: ${isRencana ? '#dc2626' : '#0f172a'};
            color: #ffffff;
            border: 2px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 9.5px;
            cursor: grab;
            ${ringStyle}
          ">${isRencana ? 'R' : 'E'}</div>`;

      const isBongkarNode = isNodeMarkedBongkar(node);
      const bongkarXOverlayHtml = isBongkarNode
        ? `<div title="Konstruksi / Tiang Ditandai DIBONGKAR (Simbol X Merah)" style="
            position: absolute;
            left: -3px;
            top: -3px;
            width: 28px;
            height: 28px;
            z-index: 20;
            pointer-events: none;
          ">
            ${buildBongkarXSvg(28)}
          </div>`
        : '';

      // Calculate smart offset away from connected cables so the callout NEVER covers the pole, trafo, or cable lines
      const offset = calculatePoleCalloutOffset(node, nodes, spans, nodeIdx);
      const borderCol = isBongkarNode
        ? '#dc2626'
        : isRencana
        ? '#dc2626'
        : isTitikApp
        ? '#d97706'
        : '#0f172a';

      let calloutOverlayHtml = '';
      if (calloutMode === 'offset_leader') {
        const boxTransformX =
          offset.anchorSide === 'left' ? `${offset.dx}px` : `calc(${offset.dx}px - 100%)`;
        const boxTransformY = `calc(${offset.dy}px - 50%)`;

        calloutOverlayHtml = `
          <svg width="160" height="120" viewBox="-80 -60 160 120" style="
            position: absolute;
            left: 11px;
            top: 11px;
            transform: translate(-80px, -60px);
            pointer-events: none;
            overflow: visible;
          ">
            <line
              x1="0"
              y1="0"
              x2="${offset.dx}"
              y2="${offset.dy}"
              stroke="${borderCol}"
              stroke-width="1.5"
              stroke-dasharray="3,2"
            />
            <circle cx="${offset.dx}" cy="${offset.dy}" r="2" fill="${borderCol}" />
          </svg>
          <div style="
            position: absolute;
            left: 11px;
            top: 11px;
            transform: translate(${boxTransformX}, ${boxTransformY});
            padding: 2.5px 6px;
            border-radius: 5px;
            background-color: rgba(255, 255, 255, 0.94);
            border: 1.5px solid ${borderCol};
            color: ${isRencana || isBongkarNode ? '#450a0a' : '#0f172a'};
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 9px;
            line-height: 1.2;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.22);
            pointer-events: none;
            ${isSelected ? 'outline: 2px solid #fbbf24;' : ''}
          ">
            <div style="font-weight: 800; border-bottom: 1px solid #e2e8f0; padding-bottom: 1px; margin-bottom: 1px; display: flex; align-items: center; gap: 3px;">
              <span>${node.kodeTiang}</span>
              ${
                isBongkarNode
                  ? '<span style="background:#dc2626;color:#ffffff;padding:0px 3px;border-radius:2px;font-size:7.5px;font-weight:900;">&#10005; BONGKAR</span>'
                  : ''
              }
            </div>
            ${calloutLines
              .map(
                (line) =>
                  `<div style="font-size: 8.5px; font-weight: 700; ${
                    line.startsWith('✕') ? 'color: #dc2626;' : ''
                  }">${line}</div>`
              )
              .join('')}
          </div>
        `;
      } else if (calloutMode === 'compact') {
        const boxTransformX =
          offset.anchorSide === 'left' ? '18px' : 'calc(-18px - 100%)';
        calloutOverlayHtml = `
          <div style="
            position: absolute;
            left: 11px;
            top: 11px;
            transform: translate(${boxTransformX}, -50%);
            padding: 1px 5px;
            border-radius: 4px;
            background-color: rgba(255, 255, 255, 0.92);
            border: 1px solid ${borderCol};
            color: #0f172a;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 8.5px;
            font-weight: 800;
            white-space: nowrap;
            pointer-events: none;
          ">
            ${node.kodeTiang}${isBongkarNode ? ' ✕' : ''}
          </div>
        `;
      }

      const poleIcon = L.divIcon({
        className: 'leaflet-pln-pole-marker',
        html: `
          <div style="
            position: relative;
            width: 22px;
            height: 22px;
            transform: translate(-11px, -11px);
          ">
            ${calloutOverlayHtml}
            <div style="position: relative; z-index: 5;">
              ${symbolHtml}
              ${bongkarXOverlayHtml}
            </div>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([node.lat, node.lng], {
        icon: poleIcon,
        draggable: true,
        zIndexOffset: isSelected ? 1000 : 500,
      });

      marker.on('click', (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        onMarkerClickRef.current(node.id);
      });

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onNodeDragEndRef.current(node.id, pos.lat, pos.lng);
      });

      overlayGroup.addLayer(marker);
    });
  }, [
    nodes,
    spans,
    selectedNodeId,
    selectedSpanId,
    pendingSpanStartNodeId,
    calloutMode,
    studioTab,
    parsedCenter.lat,
    parsedCenter.lng,
    item.projectName,
  ]);

  return (
    <div className="bg-white border-2 border-sky-200 rounded-xl shadow-xs overflow-hidden space-y-0">
      {/* Top Studio Header & Sub-Tab Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 text-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider">
              Acuan: Harga KHS &amp; Standar Konstruksi PLN (PRK 2019 / HSS 2020)
            </span>
            <h4 className="text-sm font-bold">
              Studio Gambar Survei Peta GIS &amp; Generator RAB Otomatis
            </h4>
          </div>
          <p className="text-[11px] text-sky-200 mt-0.5">
            Seluruh fasilitas gambar tersedia langsung di dalam Peta GIS (Layar Penuh, Tiang, Gardu, Multi-Kabel 1&Oslash;/3&Oslash;, Hapus &amp; Undo Ctrl+Z) &rarr; Tabel RAB 10 Kolom
          </p>
        </div>

        {/* Summary KPI Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15">
            <span className="text-sky-200 text-[10px] block">Tiang Rencana / Eksisting</span>
            <span className="font-bold text-white">
              <span className="text-rose-300">{totalPlannedPoles} Merah</span> •{' '}
              <span>{totalExistingPoles} Hitam</span>
            </span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15">
            <span className="text-sky-200 text-[10px] block">Total Tarikan Rencana</span>
            <span className="font-bold text-amber-300">{totalPlannedMeters} Meter</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40">
            <span className="text-emerald-200 text-[10px] block">Estimasi RAB (+PPN)</span>
            <span className="font-extrabold text-emerald-300">
              {formatRupiah(rabSummary.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs + Reference PDF Quick Links */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStudioTab('google_maps')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              studioTab === 'google_maps'
                ? 'bg-sky-700 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>1. Kanvas Peta GIS</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioTab('sketsa_etiket')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              studioTab === 'sketsa_etiket'
                ? 'bg-sky-700 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>2. Gambar Sketsa Ber-Etiket PLN</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioTab('tabel_rab')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              studioTab === 'tabel_rab'
                ? 'bg-indigo-700 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>3. Tabel RAB Resmi PLN ({rabItems.length} Item)</span>
          </button>

          <button
            type="button"
            data-testid="tab-berkas-survey-pdf-btn"
            onClick={() => setStudioTab('berkas_survey_pdf')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              studioTab === 'berkas_survey_pdf'
                ? 'bg-rose-700 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>4. Generate File Survey (PDF 3 Hal)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="/assets/aistudio/Harga_KHS_aca04794.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-bold flex items-center gap-1 transition"
            title="Buka File PDF Acuan Harga KHS PLN"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-700" />
            <span>PDF Harga KHS</span>
          </a>

          <a
            href="/assets/aistudio/STANDAR_KONTRUKSI__PRK_2019__HSS_2020_2d9ae1d8.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-bold flex items-center gap-1 transition"
            title="Buka File PDF Standar Konstruksi PRK 2019 HSS 2020"
          >
            <FileText className="w-3.5 h-3.5 text-sky-700" />
            <span>PDF Standar Konstruksi</span>
          </a>

          <button
            type="button"
            onClick={() => handleGenerateRabFromMap(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Generate Otomatis RAB &amp; Terapkan</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: KANVAS SURVEI PETA GIS (ALL CONTROLS ON-MAP & FULLSCREEN)  */}
      {/* ===================================================================== */}
      {studioTab === 'google_maps' && (
        <div className="p-3">
          <div
            data-testid="google-maps-survey-canvas"
            className={
              isMapFullscreen
                ? 'fixed inset-0 z-[9999] w-screen h-screen bg-slate-100 overflow-hidden'
                : 'relative w-full h-[540px] rounded-xl overflow-hidden border-2 border-slate-300 shadow-inner bg-slate-100'
            }
          >
            {/* Leaflet Map Mount Container */}
            <div
              ref={mapContainerRef}
              className="w-full h-full z-0"
              aria-label="Kanvas Peta GIS Survei PLN"
            />

            {/* ================================================================= */}
            {/* COMPACT FLOATING TOP BAR ON MAP (Single Row, No Scroll Needed)    */}
            {/* ================================================================= */}
            <div
              data-testid="on-map-quick-toolbar"
              className="absolute top-2.5 left-2.5 right-2.5 z-[1050] bg-slate-900/95 backdrop-blur-xs text-white px-2 py-1 rounded-xl shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-1 text-[10px]"
            >
              {/* Left: Compact Drawing Tools (Geser, Tiang Dropdown, Gardu Dropdown, Kabel + SR, Hapus) */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setToolMode('SELECT_DRAG');
                    setPendingSpanStartNodeId(null);
                  }}
                  className={`px-1.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    toolMode === 'SELECT_DRAG'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title="Pilih atau geser titik tiang/gardu"
                >
                  Geser
                </button>

                {/* Dropdown Tiang: Rencana vs Eksisting */}
                <div
                  className={`inline-flex items-center rounded-md border transition ${
                    toolMode === 'ADD_TIANG_RENCANA' ||
                    toolMode === 'ADD_TIANG_EKSISTING'
                      ? tiangKindMode === 'ADD_TIANG_RENCANA'
                        ? 'bg-rose-600 text-white border-white shadow-2xs'
                        : 'bg-slate-600 text-white border-white shadow-2xs'
                      : 'bg-white/10 hover:bg-white/20 text-rose-200 border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    data-testid="map-pole-mode-btn"
                    onClick={() => {
                      setToolMode(tiangKindMode);
                      setPendingSpanStartNodeId(null);
                    }}
                    className="pl-1.5 pr-0.5 py-1 font-bold flex items-center gap-1 cursor-pointer"
                    title="Klik untuk mengaktifkan mode tambah Tiang"
                  >
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        tiangKindMode === 'ADD_TIANG_RENCANA'
                          ? 'bg-rose-400 border border-white'
                          : 'bg-slate-950 border border-white'
                      }`}
                    />
                    <span>+Tiang:</span>
                  </button>
                  <select
                    aria-label="Pilih Jenis Tiang (Rencana atau Eksisting)"
                    data-testid="map-pole-mode-select"
                    value={tiangKindMode}
                    onChange={(e) => {
                      const val = e.target.value as
                        | 'ADD_TIANG_RENCANA'
                        | 'ADD_TIANG_EKSISTING';
                      setTiangKindMode(val);
                      setToolMode(val);
                      setPendingSpanStartNodeId(null);
                    }}
                    onClick={() => {
                      if (
                        toolMode !== 'ADD_TIANG_RENCANA' &&
                        toolMode !== 'ADD_TIANG_EKSISTING'
                      ) {
                        setToolMode(tiangKindMode);
                        setPendingSpanStartNodeId(null);
                      }
                    }}
                    className="bg-transparent text-white font-bold pr-1 py-1 rounded-r-md cursor-pointer focus:outline-none"
                    title="Pilih Tiang Rencana atau Tiang Eksisting"
                  >
                    <option value="ADD_TIANG_RENCANA" className="bg-slate-900 text-rose-300">
                      Rencana
                    </option>
                    <option value="ADD_TIANG_EKSISTING" className="bg-slate-900 text-slate-200">
                      Eksisting
                    </option>
                  </select>
                </div>

                {/* Dropdown Gardu: Rencana vs Eksisting */}
                <div
                  className={`inline-flex items-center rounded-md border transition ${
                    toolMode === 'ADD_GARDU_RENCANA' ||
                    toolMode === 'ADD_GARDU_TRAFO'
                      ? 'bg-amber-600 text-white border-white shadow-2xs'
                      : 'bg-white/10 hover:bg-white/20 text-amber-300 border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    data-testid="map-gardu-mode-btn"
                    onClick={() => {
                      setToolMode(garduKindMode);
                      setPendingSpanStartNodeId(null);
                    }}
                    className="pl-1.5 pr-0.5 py-1 font-bold flex items-center gap-0.5 cursor-pointer"
                    title="Klik untuk mengaktifkan mode tambah Gardu"
                  >
                    <span>▲Gardu:</span>
                  </button>
                  <select
                    aria-label="Pilih Jenis Gardu (Rencana atau Eksisting)"
                    data-testid="map-gardu-mode-select"
                    value={garduKindMode}
                    onChange={(e) => {
                      const val = e.target.value as
                        | 'ADD_GARDU_RENCANA'
                        | 'ADD_GARDU_TRAFO';
                      setGarduKindMode(val);
                      setToolMode(val);
                      setPendingSpanStartNodeId(null);
                    }}
                    onClick={() => {
                      if (
                        toolMode !== 'ADD_GARDU_RENCANA' &&
                        toolMode !== 'ADD_GARDU_TRAFO'
                      ) {
                        setToolMode(garduKindMode);
                        setPendingSpanStartNodeId(null);
                      }
                    }}
                    className="bg-transparent text-white font-bold pr-1 py-1 rounded-r-md cursor-pointer focus:outline-none"
                    title="Pilih Gardu Rencana atau Gardu Eksisting"
                  >
                    <option value="ADD_GARDU_RENCANA" className="bg-slate-900 text-amber-300">
                      Rencana
                    </option>
                    <option value="ADD_GARDU_TRAFO" className="bg-slate-900 text-slate-200">
                      Eksisting
                    </option>
                  </select>
                </div>

                {/* Kabel (termasuk pilihan SR di dalam dropdown Kabel) */}
                <div
                  className={`inline-flex items-center rounded-md border transition ${
                    toolMode === 'CONNECT_SPAN' ||
                    toolMode === 'ADD_TITIK_KONSTRUKSI'
                      ? 'bg-sky-600 text-white border-white shadow-2xs'
                      : 'bg-white/10 hover:bg-white/20 text-sky-300 border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    data-testid="map-cable-mode-btn"
                    onClick={() => {
                      setToolMode('CONNECT_SPAN');
                      setPendingSpanStartNodeId(null);
                    }}
                    className="pl-1.5 pr-0.5 py-1 font-bold cursor-pointer"
                    title="Klik 2 titik di peta untuk menarik kabel (JTR / JTM / SR)"
                  >
                    ━Kabel:
                  </button>
                  <select
                    aria-label="Pilih Jenis Kabel & SR di Peta"
                    data-testid="map-active-conductor-select"
                    value={
                      toolMode === 'ADD_TITIK_KONSTRUKSI'
                        ? '__TITIK_SR__'
                        : activeConductorType
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__TITIK_SR__') {
                        setActiveConductorType('NFA2X 2x16');
                        setActivePhaseCount(1);
                        setToolMode('ADD_TITIK_KONSTRUKSI');
                        setPendingSpanStartNodeId(null);
                        return;
                      }
                      const nextCond = val as SurveySpanConductorType;
                      setActiveConductorType(nextCond);
                      setActivePhaseCount(inferPhaseCountFromConductor(nextCond));
                      if (toolMode === 'ADD_TITIK_KONSTRUKSI') {
                        setToolMode('CONNECT_SPAN');
                      }
                    }}
                    className="bg-slate-800/90 text-white font-bold px-1 py-1 rounded-r-md border-l border-slate-700 max-w-[122px] truncate cursor-pointer focus:outline-none"
                    title="Pilih jenis kabel JTR, JTM, atau Sambungan Rumah (SR)"
                  >
                    <optgroup label="Kabel SR (Sambungan Rumah)" className="bg-slate-900 text-amber-300">
                      {Object.entries(CONDUCTOR_KHS_MAPPING)
                        .filter(([, meta]) => meta.networkCategory === 'SR')
                        .map(([cond]) => (
                          <option key={cond} value={cond} className="bg-slate-900 text-amber-200">
                            [SR] {cond}
                          </option>
                        ))}
                      <option value="__TITIK_SR__" className="bg-slate-900 text-amber-300">
                        [SR] +Plot Titik SR / APP
                      </option>
                    </optgroup>
                    <optgroup label="Kabel JTR (LVTC)" className="bg-slate-900 text-sky-300">
                      {Object.entries(CONDUCTOR_KHS_MAPPING)
                        .filter(([, meta]) => meta.networkCategory === 'JTR')
                        .map(([cond]) => (
                          <option key={cond} value={cond} className="bg-slate-900 text-white">
                            [JTR] {cond}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Kabel JTM (20kV)" className="bg-slate-900 text-rose-300">
                      {Object.entries(CONDUCTOR_KHS_MAPPING)
                        .filter(([, meta]) => meta.networkCategory === 'JTM')
                        .map(([cond]) => (
                          <option key={cond} value={cond} className="bg-slate-900 text-white">
                            [JTM] {cond}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <button
                  type="button"
                  data-testid="map-active-phase-toggle"
                  onClick={() =>
                    setActivePhaseCount((prev) => (prev === 3 ? 1 : 3))
                  }
                  className={`px-1.5 py-1 rounded-md font-mono font-extrabold border transition cursor-pointer ${
                    activePhaseCount === 3
                      ? 'bg-indigo-600 text-white border-indigo-400'
                      : 'bg-amber-500 text-slate-950 border-amber-300'
                  }`}
                  title="Klik untuk ganti Fasa Kabel Default: 3 Phase (///) vs 1 Phase (/)"
                >
                  {activePhaseCount === 3 ? '3Ø (///)' : '1Ø (/)'}
                </button>

                <button
                  type="button"
                  data-testid="map-active-status-toggle"
                  onClick={() =>
                    setActiveSpanStatus((prev) =>
                      prev === 'RENCANA' ? 'EKSISTING' : 'RENCANA'
                    )
                  }
                  className={`px-1.5 py-1 rounded-md font-bold border transition cursor-pointer ${
                    activeSpanStatus === 'RENCANA'
                      ? 'bg-rose-950/90 text-rose-200 border-rose-500'
                      : 'bg-slate-800 text-slate-300 border-slate-600'
                  }`}
                  title="Klik untuk ganti status kabel baru: Rencana vs Eksisting"
                >
                  {activeSpanStatus === 'RENCANA' ? 'Rencana' : 'Eksisting'}
                </button>

                <button
                  type="button"
                  data-testid="on-map-bongkar-mode-btn"
                  onClick={() => {
                    setToolMode((prev) =>
                      prev === 'MARK_BONGKAR' ? 'SELECT_DRAG' : 'MARK_BONGKAR'
                    );
                    setPendingSpanStartNodeId(null);
                  }}
                  className={`px-1.5 py-1 rounded-md font-extrabold transition cursor-pointer flex items-center gap-0.5 ${
                    toolMode === 'MARK_BONGKAR'
                      ? 'bg-red-600 text-white ring-1 ring-white shadow-2xs'
                      : 'bg-red-950/80 hover:bg-red-800/80 text-red-200 border border-red-500/60'
                  }`}
                  title="Tandai konstruksi/tiang akan DIBONGKAR dengan Simbol X Merah & masukkan Jasa Pembongkaran ke RAB"
                >
                  <span className="text-red-300 font-black leading-none">✕</span>
                  <span>Bongkar</span>
                </button>

                <button
                  type="button"
                  data-testid="on-map-delete-mode-btn"
                  onClick={() => {
                    if (inspectorMode === 'SPAN' && selectedSpan) {
                      handleDeleteSpanById(selectedSpan.id);
                    }
                    setToolMode((prev) =>
                      prev === 'DELETE_ITEM' ? 'SELECT_DRAG' : 'DELETE_ITEM'
                    );
                    setPendingSpanStartNodeId(null);
                  }}
                  className={`px-1.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-0.5 ${
                    toolMode === 'DELETE_ITEM'
                      ? 'bg-red-600 text-white ring-1 ring-white'
                      : 'bg-white/10 hover:bg-white/20 text-red-300'
                  }`}
                  title="Klik tiang atau kabel di peta untuk menghapus langsung (atau hapus kabel yang sedang dipilih)"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Hapus</span>
                </button>
              </div>

              {/* Right: Undo/Redo, Map Layer (Peta Jalan / Satelit), Callout & Fullscreen */}
              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  data-testid="map-undo-btn"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className={`px-1.5 py-1 rounded-md font-bold flex items-center gap-0.5 transition ${
                    undoStack.length > 0
                      ? 'bg-white/15 hover:bg-white/25 text-amber-300 cursor-pointer'
                      : 'bg-white/5 text-slate-500 cursor-not-allowed'
                  }`}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}</span>
                </button>

                {redoStack.length > 0 && (
                  <button
                    type="button"
                    data-testid="map-redo-btn"
                    onClick={handleRedo}
                    className="px-1.5 py-1 rounded-md font-bold bg-white/15 hover:bg-white/25 text-sky-300 cursor-pointer"
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 className="w-3 h-3" />
                  </button>
                )}

                {nodes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllMap}
                    className="px-1.5 py-1 rounded-md font-bold bg-white/10 hover:bg-red-700/80 text-slate-200 hover:text-white transition cursor-pointer"
                    title="Kosongkan seluruh gambar di kanvas peta"
                  >
                    Reset
                  </button>
                )}

                {/* Map Layer Switcher: Default Peta Jalan, Option Satelit */}
                <div
                  data-testid="map-layer-toggle"
                  className="inline-flex rounded-md bg-slate-800 p-0.5 border border-slate-700"
                >
                  <button
                    type="button"
                    data-testid="layer-roadmap-btn"
                    onClick={() => setMapTypeId('roadmap')}
                    className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                      mapTypeId === 'roadmap'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Peta Jalan
                  </button>
                  <button
                    type="button"
                    data-testid="layer-hybrid-btn"
                    onClick={() => setMapTypeId('hybrid')}
                    className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                      mapTypeId === 'hybrid'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Satelit
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCalloutMode((prev) =>
                      prev === 'offset_leader'
                        ? 'compact'
                        : prev === 'compact'
                        ? 'hidden'
                        : 'offset_leader'
                    )
                  }
                  className="px-1.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 font-bold cursor-pointer"
                  title="Ubah tampilan label kode konstruksi di peta"
                >
                  {calloutMode === 'offset_leader'
                    ? 'Label: Lengkap'
                    : calloutMode === 'compact'
                    ? 'Label: Ringkas'
                    : 'Label: Sembunyi'}
                </button>

                <button
                  type="button"
                  data-testid="center-to-initial-location-btn"
                  onClick={() => handleCenterToInitialLocation()}
                  className="px-1.5 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-bold flex items-center gap-1 cursor-pointer"
                  title={`Pusatkan peta ke titik lokasi permohonan awal (${parsedCenter.lat.toFixed(5)}, ${parsedCenter.lng.toFixed(5)})`}
                >
                  <MapPin className="w-3 h-3 text-sky-300" />
                  <span>Titik Permohonan</span>
                </button>

                {nodes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFitAllPoles()}
                    className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-sky-300 cursor-pointer"
                    title="Fokuskan peta ke seluruh titik tiang"
                  >
                    <Navigation className="w-3 h-3" />
                  </button>
                )}

                {/* Fullscreen Toggle Button */}
                <button
                  type="button"
                  data-testid="map-fullscreen-toggle-btn"
                  onClick={() => setIsMapFullscreen((prev) => !prev)}
                  className={`px-1.5 py-1 rounded-md font-extrabold flex items-center gap-1 transition cursor-pointer ${
                    isMapFullscreen
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                  title={
                    isMapFullscreen
                      ? 'Keluar dari Layar Penuh (Esc)'
                      : 'Perbesar Kanvas Peta ke Layar Penuh (Fullscreen)'
                  }
                >
                  {isMapFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span>Keluar</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Layar Penuh</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ================================================================= */}
            {/* COMPACT COLLAPSIBLE LEGEND PILL AT TOP-LEFT                       */}
            {/* ================================================================= */}
            <div className="absolute top-14 left-2.5 z-[1050] flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowLegendOnMap((prev) => !prev)}
                  className="bg-white/95 hover:bg-white backdrop-blur-xs px-2.5 py-1 rounded-lg shadow-sm border border-slate-300 text-[10px] font-extrabold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Legenda Jaringan</span>
                  <span className="text-slate-400">{showLegendOnMap ? '▲' : '▼'}</span>
                </button>

                <label className="bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg shadow-sm border border-slate-300 text-[10px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoConnectNewPoles}
                    onChange={(e) => setAutoConnectNewPoles(e.target.checked)}
                    className="rounded text-sky-600"
                  />
                  <span>Auto-Sambung Kabel</span>
                </label>

                <button
                  type="button"
                  data-testid="quick-add-pole-40m-btn"
                  onClick={handleQuickAddPlannedPole40m}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded-lg shadow-sm text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  title="Tambah cepat 1 Tiang Rencana berjarak 40m"
                >
                  <Plus className="w-3 h-3" />
                  <span>+Tiang 40m</span>
                </button>
              </div>

              {showLegendOnMap && (
                <div className="bg-white/95 backdrop-blur-xs px-2.5 py-1.5 rounded-lg shadow-md border border-slate-300 text-[10px] flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                    <span className="w-3.5 h-0.5 bg-rose-600 inline-block" /> JTM 20kV
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-sky-700">
                    <span className="w-3.5 h-0.5 bg-sky-600 inline-block" /> JTR LVTC
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                    <span className="w-3.5 h-0.5 bg-amber-600 inline-block" /> SR
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono font-extrabold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                    /// = 3 Phase • / = 1 Phase
                  </span>
                  <span className="inline-flex items-center gap-1 font-extrabold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                    <span className="text-red-600 font-black">✕</span> Konstruksi Dibongkar
                  </span>
                </div>
              )}
            </div>

            {/* Undo / Delete Toast Feedback Banner on Map */}
            {undoBannerMessage && (
              <div
                data-testid="map-undo-toast"
                className="absolute top-14 left-1/2 -translate-x-1/2 z-[1100] bg-slate-900/95 text-amber-300 px-3 py-1.5 rounded-lg shadow-lg border border-amber-400 text-[11px] font-bold flex items-center gap-2"
              >
                <span>{undoBannerMessage}</span>
              </div>
            )}

            {/* ================================================================= */}
            {/* EMPTY CANVAS HELPER BANNER (Shown when canvas has 0 poles)         */}
            {/* ================================================================= */}
            {nodes.length === 0 && (
              <div
                data-testid="empty-map-canvas-hint"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1050] bg-slate-900/90 backdrop-blur-xs text-white px-4 py-2 rounded-xl shadow-lg border border-slate-700 text-xs flex items-center gap-2.5 pointer-events-none whitespace-nowrap"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <span>
                  Kanvas siap digambar — Klik pada peta untuk menempatkan{' '}
                  <strong className="text-amber-300">
                    {toolMode === 'ADD_TIANG_EKSISTING'
                      ? 'Tiang Eksisting'
                      : toolMode === 'ADD_GARDU_RENCANA'
                      ? 'Gardu Rencana'
                      : toolMode === 'ADD_GARDU_TRAFO'
                      ? 'Gardu Eksisting'
                      : toolMode === 'ADD_TITIK_KONSTRUKSI'
                      ? 'Titik SR'
                      : 'Tiang Rencana'}
                  </strong>{' '}
                  pertama
                </span>
              </div>
            )}

            {/* ================================================================= */}
            {/* NON-BLOCKING FLOATING INSPECTOR ON MAP (Bottom-Right Corner)      */}
            {/* Lets surveyor edit Tiang/Standar Konstruksi & Kabel/Fasa on-map   */}
            {/* ================================================================= */}
            {(selectedNode || selectedSpan) && (
              <div
                data-testid="non-blocking-pole-detail-card"
                className="absolute bottom-3 right-3 z-[1050] w-80 sm:w-[420px] bg-white/95 backdrop-blur-xs border-2 border-slate-800 rounded-xl shadow-xl overflow-hidden text-[11px]"
              >
                {/* Header with Mode Switcher (Titik vs Kabel) + Delete + Minimize */}
                <div className="bg-slate-900 text-white px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 min-w-0">
                    {selectedNode && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectorMode('NODE');
                          setShowCornerMaterialCard(true);
                        }}
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[10.5px] truncate cursor-pointer transition ${
                          inspectorMode === 'NODE' || !selectedSpan
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        Titik: {selectedNode.kodeTiang}
                      </button>
                    )}
                    {selectedSpan && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectorMode('SPAN');
                          setShowCornerMaterialCard(true);
                        }}
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[10.5px] truncate cursor-pointer transition ${
                          inspectorMode === 'SPAN'
                            ? 'bg-sky-400 text-slate-950'
                            : 'bg-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        Kabel: {selectedSpan.distanceMeters}m
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {selectedNode && (
                      <button
                        type="button"
                        data-testid="map-delete-selected-node-btn"
                        onClick={() => handleDeleteNodeById(selectedNode.id)}
                        className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                        title="Hapus titik ini dari peta"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus Titik</span>
                      </button>
                    )}
                    {selectedSpan && (
                      <>
                        <button
                          type="button"
                          data-testid="map-bongkar-selected-span-btn"
                          onClick={() => handleToggleSpanBongkar(selectedSpan.id)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer border ${
                            isSpanMarkedBongkar(selectedSpan)
                              ? 'bg-red-600 text-white border-red-300 ring-1 ring-white'
                              : 'bg-slate-800 hover:bg-red-900/80 text-red-200 border-red-500/50'
                          }`}
                          title="Tandai Bongkar (Simbol X Merah) pada kabel gawang ini — tetap di gambar & masuk RAB"
                        >
                          <span>&#10005;</span>
                          <span>
                            {isSpanMarkedBongkar(selectedSpan)
                              ? 'Batal Bongkar'
                              : 'Bongkar Kabel'}
                          </span>
                        </button>
                        <button
                          type="button"
                          data-testid="map-delete-selected-span-btn"
                          onClick={() => handleDeleteSpanById(selectedSpan.id)}
                          className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-red-700 text-slate-200 hover:text-white text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                          title="Hapus gawang kabel ini dari kanvas peta"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Hapus</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setShowCornerMaterialCard(!showCornerMaterialCard)
                      }
                      className="text-slate-300 hover:text-white p-0.5 cursor-pointer"
                      title={
                        showCornerMaterialCard
                          ? 'Kecilkan panel detail'
                          : 'Buka panel detail'
                      }
                    >
                      {showCornerMaterialCard ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Body: NODE Mode (Edit Kode Tiang & Standar Konstruksi + Rincian Material Riil) */}
                {showCornerMaterialCard &&
                  (inspectorMode === 'NODE' || !selectedSpan) &&
                  selectedNode && (
                    <div className="p-2.5 space-y-2 max-h-80 overflow-y-auto">
                      {/* Quick Edit Kode Titik & Jenis Titik */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[9.5px] font-bold text-slate-500">
                            Kode Titik
                          </label>
                          <input
                            type="text"
                            value={selectedNode.kodeTiang}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNodes((prev) =>
                                prev.map((n) =>
                                  n.id === selectedNode.id
                                    ? { ...n, kodeTiang: val }
                                    : n
                                )
                              );
                            }}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-[11px] font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[9.5px] font-bold text-slate-500">
                            Status Titik
                          </label>
                          <select
                            value={selectedNode.kind}
                            onChange={(e) => {
                              const nextKind = e.target.value as SurveyNodeKind;
                              setNodes((prev) =>
                                prev.map((n) =>
                                  n.id === selectedNode.id
                                    ? { ...n, kind: nextKind }
                                    : n
                                )
                              );
                            }}
                            className="w-full px-1.5 py-1 border border-slate-300 rounded text-[11px] font-bold bg-white"
                          >
                            <option value="TIANG_RENCANA">Tiang Rencana</option>
                            <option value="TIANG_EKSISTING">Tiang Eksisting</option>
                            <option value="GARDU_RENCANA">Gardu Rencana</option>
                            <option value="GARDU_TRAFO">Gardu Eksisting</option>
                            <option value="TITIK_APP">Titik SR</option>
                          </select>
                        </div>
                      </div>

                      {/* Connected Cables on this Pole — Quick 1-Click Delete Cable */}
                      {spans.some(
                        (s) =>
                          s.fromNodeId === selectedNode.id ||
                          s.toNodeId === selectedNode.id
                      ) && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 space-y-1">
                          <div className="text-[9.5px] font-extrabold text-slate-700 flex items-center justify-between">
                            <span>Kabel Terhubung pada Titik Ini:</span>
                            <span className="text-slate-400 font-normal">
                              &#10005; Bongkar (Gambar) | &#128465; Hapus (Kanvas)
                            </span>
                          </div>
                          {spans
                            .filter(
                              (s) =>
                                s.fromNodeId === selectedNode.id ||
                                s.toNodeId === selectedNode.id
                            )
                            .map((sp) => {
                              const fromK =
                                nodes.find((n) => n.id === sp.fromNodeId)
                                  ?.kodeTiang || '?';
                              const toK =
                                nodes.find((n) => n.id === sp.toNodeId)
                                  ?.kodeTiang || '?';
                              const spBongkar = isSpanMarkedBongkar(sp);
                              return (
                                <div
                                  key={sp.id}
                                  className={`flex items-center justify-between gap-1 px-2 py-1 rounded border text-[10px] ${
                                    spBongkar
                                      ? 'bg-red-50 border-red-300'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSpanId(sp.id);
                                      setInspectorMode('SPAN');
                                    }}
                                    className="font-mono font-bold text-sky-800 hover:underline truncate text-left cursor-pointer"
                                  >
                                    {sp.distanceMeters}m ({fromK} &harr; {toK}){' '}
                                    {spBongkar ? '[✕ BONGKAR]' : ''}
                                  </button>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      data-testid={`bongkar-connected-span-btn-${sp.id}`}
                                      onClick={() => handleToggleSpanBongkar(sp.id)}
                                      className={`px-1.5 py-0.5 rounded font-bold text-[9.5px] flex items-center gap-0.5 cursor-pointer border ${
                                        spBongkar
                                          ? 'bg-red-600 text-white border-red-700'
                                          : 'bg-white hover:bg-red-50 text-red-700 border-red-300'
                                      }`}
                                      title="Tandai Bongkar (Simbol X Merah) pada kabel gawang ini — tetap di gambar"
                                    >
                                      <span>&#10005;</span>
                                      <span>{spBongkar ? 'Dibongkar' : 'Bongkar'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`delete-connected-span-btn-${sp.id}`}
                                      onClick={() => handleDeleteSpanById(sp.id)}
                                      className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-red-600 text-slate-700 hover:text-white font-bold text-[9.5px] flex items-center gap-0.5 cursor-pointer"
                                      title="Hapus kabel gawang ini dari kanvas"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                      <span>Hapus</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* Add Standar Konstruksi Package directly on Map with Search, Category Filter & Bongkar Toggle */}
                      <div className="pt-1.5 border-t border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className="font-extrabold text-slate-800 text-[10.5px]">
                            Standar Konstruksi Titik Ini:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              data-testid="toggle-pole-bongkar-btn"
                              onClick={() => handleToggleNodeBongkar(selectedNode.id)}
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold border flex items-center gap-1 cursor-pointer transition ${
                                isNodeMarkedBongkar(selectedNode)
                                  ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                                  : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300'
                              }`}
                              title="Tandai titik ini dengan Simbol X Merah (Konstruksi Dibongkar) dan masukkan Jasa Pembongkaran ke RAB"
                            >
                              <span className="font-black">✕</span>
                              <span>
                                {isNodeMarkedBongkar(selectedNode)
                                  ? 'Dibongkar (X Merah Aktif)'
                                  : 'Tandai Bongkar (X Merah)'}
                              </span>
                            </button>
                            {selectedPoleMaterialBreakdown && (
                              <span
                                data-testid="pole-total-cost-badge"
                                className="font-mono font-extrabold text-emerald-700 text-[10.5px]"
                              >
                                {formatRupiah(
                                  selectedPoleMaterialBreakdown.totalBiayaTitik
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Search Bar & Klasifikasi Kategori (JTR, JTM, SKUTR, SKUTM, TIANG, GARDU, SKUR, ANCHOR, GROUNDING, SR, BONGKAR) */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 space-y-1.5">
                          <div className="relative flex items-center">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                            <input
                              type="text"
                              data-testid="construction-search-input"
                              value={constSearchQuery}
                              onChange={(e) => setConstSearchQuery(e.target.value)}
                              placeholder="Cari konstruksi / material (misal: MJ6-T, CJ5, CC1, DB01, SKUTR, Bongkar)..."
                              className="w-full pl-7 pr-6 py-1 bg-white border border-slate-300 rounded text-[10.5px] font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-600"
                            />
                            {constSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setConstSearchQuery('')}
                                className="absolute right-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="Bersihkan pencarian"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Category Classification Filter Pills */}
                          <div
                            data-testid="construction-category-pills"
                            className="flex items-center gap-1 overflow-x-auto pb-0.5"
                          >
                            {CONSTRUCTION_CATEGORY_LIST.map((cat) => {
                              const isActive = constCategoryFilter === cat.id;
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  data-testid={`const-cat-pill-${cat.id}`}
                                  onClick={() => setConstCategoryFilter(cat.id)}
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold whitespace-nowrap transition cursor-pointer ${
                                    isActive
                                      ? cat.id === 'BONGKAR'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-sky-700 text-white'
                                      : cat.id === 'BONGKAR'
                                      ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  {cat.shortLabel}
                                </button>
                              );
                            })}
                          </div>

                          {/* Select Classified Construction + Action Type (Pasang / Bongkar / Bongkar-Pasang) + Add Button */}
                          <div className="flex items-center gap-1">
                            <select
                              aria-label="Pilih Standar Konstruksi di Peta"
                              data-testid="construction-package-select"
                              value={newConstCode}
                              onChange={(e) => {
                                const val = e.target.value;
                                setNewConstCode(val);
                                if (val.toUpperCase().startsWith('BONGKAR-')) {
                                  setNewConstAction('BONGKAR');
                                }
                              }}
                              className="flex-1 min-w-0 px-1.5 py-1 border border-slate-300 rounded text-[10px] font-mono font-bold bg-white"
                            >
                              {filteredConstructionCatalog.length === 0 ? (
                                <option value="">
                                  -- Tidak ada konstruksi yang cocok --
                                </option>
                              ) : (
                                CONSTRUCTION_CATEGORY_LIST.filter(
                                  (c) => c.id !== 'ALL'
                                ).map((catGroup) => {
                                  const groupItems =
                                    filteredConstructionCatalog.filter(
                                      (p) => p.category === catGroup.id
                                    );
                                  if (groupItems.length === 0) return null;
                                  return (
                                    <optgroup
                                      key={catGroup.id}
                                      label={catGroup.label}
                                    >
                                      {groupItems.map((pkg) => (
                                        <option key={pkg.code} value={pkg.code}>
                                          [{pkg.category}] {pkg.code} — {pkg.name} (
                                          {formatRupiah(
                                            getPackageTotalKhsPrice(pkg.code)
                                          )}
                                          )
                                        </option>
                                      ))}
                                    </optgroup>
                                  );
                                })
                              )}
                            </select>

                            <select
                              aria-label="Pilih Aksi Konstruksi (Pasang atau Bongkar)"
                              data-testid="new-construction-action-select"
                              value={newConstAction}
                              onChange={(e) =>
                                setNewConstAction(
                                  e.target.value as ConstructionActionType
                                )
                              }
                              className={`px-1 py-1 border rounded text-[9.5px] font-extrabold cursor-pointer ${
                                newConstAction === 'BONGKAR'
                                  ? 'bg-red-50 text-red-700 border-red-300'
                                  : newConstAction === 'BONGKAR_PASANG'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              }`}
                              title="Pilih Pasang Baru, Bongkar (X Merah), atau Bongkar-Pasang"
                            >
                              <option value="PASANG">Pasang</option>
                              <option value="BONGKAR">✕ Bongkar</option>
                              <option value="BONGKAR_PASANG">⇄ B/P</option>
                            </select>

                            <input
                              type="number"
                              min={1}
                              max={20}
                              data-testid="new-construction-qty-input"
                              value={newConstQty}
                              onChange={(e) =>
                                setNewConstQty(
                                  Math.max(1, Number(e.target.value))
                                )
                              }
                              className="w-9 px-1 py-1 border border-slate-300 rounded font-mono text-[10px] font-bold text-center bg-white"
                            />
                            <button
                              type="button"
                              data-testid="add-construction-to-pole-btn"
                              disabled={!newConstCode}
                              onClick={() => {
                                if (!newConstCode) return;
                                recordHistorySnapshot(
                                  `Tambah Konstruksi ${newConstCode} (${newConstAction})`
                                );
                                const effectiveAct: ConstructionActionType =
                                  newConstCode
                                    .toUpperCase()
                                    .startsWith('BONGKAR-')
                                    ? 'BONGKAR'
                                    : newConstAction;
                                const existingIdx =
                                  selectedNode.constructions.findIndex(
                                    (c) =>
                                      c.code.toUpperCase() ===
                                        newConstCode.toUpperCase() &&
                                      (c.actionType || 'PASANG') === effectiveAct
                                  );
                                const targetExpandIdx =
                                  existingIdx >= 0
                                    ? existingIdx
                                    : selectedNode.constructions.length;
                                setExpandedConstIndex(targetExpandIdx);

                                setNodes((prev) =>
                                  prev.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const idxInNode =
                                      n.constructions.findIndex(
                                        (c) =>
                                          c.code.toUpperCase() ===
                                            newConstCode.toUpperCase() &&
                                          (c.actionType || 'PASANG') ===
                                            effectiveAct
                                      );
                                    if (idxInNode >= 0) {
                                      const copy = [...n.constructions];
                                      copy[idxInNode] = {
                                        ...copy[idxInNode],
                                        qty: copy[idxInNode].qty + newConstQty,
                                        actionType: effectiveAct,
                                      };
                                      return {
                                        ...n,
                                        isBongkar:
                                          effectiveAct === 'BONGKAR'
                                            ? true
                                            : n.isBongkar,
                                        constructions: copy,
                                      };
                                    }
                                    return {
                                      ...n,
                                      isBongkar:
                                        effectiveAct === 'BONGKAR'
                                          ? true
                                          : n.isBongkar,
                                      constructions: [
                                        ...n.constructions,
                                        {
                                          code: newConstCode,
                                          qty: newConstQty,
                                          actionType: effectiveAct,
                                        },
                                      ],
                                    };
                                  })
                                );
                              }}
                              className="px-2 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded font-bold text-[10px] shrink-0 cursor-pointer"
                            >
                              +Tambah
                            </button>
                          </div>
                        </div>

                        {/* Assigned Construction Packages — Clickable to Expand Real KHS Material Selection */}
                        <div className="space-y-1.5">
                          {selectedNode.constructions.map((c, idx) => {
                            const isExpanded = expandedConstIndex === idx;
                            const assignBreakdown =
                              getConstructionAssignmentBreakdown(
                                c,
                                Boolean(selectedNode.isBongkar)
                              );
                            const pkgDef = CONSTRUCTION_PACKAGES_CATALOG.find(
                              (p) => p.code.toUpperCase() === c.code.toUpperCase()
                            );
                            const currentAction: ConstructionActionType =
                              c.actionType ||
                              (selectedNode.isBongkar ? 'BONGKAR' : 'PASANG');

                            const handleChangeMainSetQty = (rawVal: string) => {
                              const nextQty =
                                rawVal === '' ? 0 : Math.max(0, Number(rawVal));
                              setNodes((prev) =>
                                prev.map((n) => {
                                  if (n.id !== selectedNode.id) return n;
                                  return {
                                    ...n,
                                    constructions: n.constructions.map(
                                      (itemC, cIdx) =>
                                        cIdx === idx
                                          ? { ...itemC, qty: nextQty }
                                          : itemC
                                    ),
                                  };
                                })
                              );
                            };

                            const handleBlurMainSetQty = () => {
                              if (!c.qty || c.qty <= 0) {
                                setNodes((prev) =>
                                  prev.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    return {
                                      ...n,
                                      constructions: n.constructions.map(
                                        (itemC, cIdx) =>
                                          cIdx === idx
                                            ? { ...itemC, qty: 1 }
                                            : itemC
                                      ),
                                    };
                                  })
                                );
                              }
                            };

                            return (
                              <div
                                key={`${c.code}-${idx}`}
                                className={`rounded-lg border overflow-hidden ${
                                  currentAction === 'BONGKAR'
                                    ? 'border-red-300 bg-red-50/50'
                                    : 'border-slate-200 bg-slate-50'
                                }`}
                              >
                                <div className="px-2 py-1.5 flex items-center justify-between gap-1 hover:bg-sky-50/70 transition">
                                  <button
                                    type="button"
                                    data-testid={`construction-detail-toggle-${c.code}`}
                                    onClick={() =>
                                      setExpandedConstIndex(
                                        isExpanded ? null : idx
                                      )
                                    }
                                    className="flex-1 flex items-center gap-1.5 text-left min-w-0 cursor-pointer"
                                    title="Klik untuk membuka rincian material & memilih material riil yang akan dipasang/dibongkar"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="font-mono font-bold text-slate-900 truncate flex items-center gap-1">
                                        {currentAction === 'BONGKAR' && (
                                          <span className="px-1 py-0.2 rounded bg-red-600 text-white text-[8.5px] font-extrabold">
                                            ✕ BONGKAR
                                          </span>
                                        )}
                                        {currentAction === 'BONGKAR_PASANG' && (
                                          <span className="px-1 py-0.2 rounded bg-amber-600 text-white text-[8.5px] font-extrabold">
                                            ⇄ B/P
                                          </span>
                                        )}
                                        <span>
                                          {c.qty}x {c.code}
                                        </span>
                                        <span className="text-emerald-700 text-[10px]">
                                          ({formatRupiah(assignBreakdown.totalActivePrice)})
                                        </span>
                                        <span className="px-1 py-0.2 rounded bg-sky-100 text-sky-800 text-[8.5px] font-sans font-bold">
                                          {isExpanded ? 'Tutup Rincian' : 'Rincian'}
                                        </span>
                                      </div>
                                      {pkgDef && (
                                        <div className="text-[9.5px] text-slate-500 truncate">
                                          [{pkgDef.category}] {pkgDef.name} •{' '}
                                          {
                                            assignBreakdown.rows.filter(
                                              (r) => r.enabled
                                            ).length
                                          }
                                          /{assignBreakdown.rows.length} komponen
                                        </div>
                                      )}
                                    </div>
                                  </button>

                                  {/* Direct Set Quantity Input on Construction Row Header */}
                                  <div
                                    className="flex items-center gap-0.5 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-[9px] font-bold text-slate-500">
                                      Set:
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      data-testid={`pole-const-qty-input-${c.code}`}
                                      aria-label={`Jumlah set utama ${c.code}`}
                                      value={c.qty === 0 ? '' : c.qty}
                                      onChange={(e) =>
                                        handleChangeMainSetQty(e.target.value)
                                      }
                                      onBlur={handleBlurMainSetQty}
                                      className="w-10 px-1 py-0.5 border border-sky-400 rounded font-mono text-[10px] font-extrabold text-center bg-white text-slate-950 focus:outline-none focus:ring-1 focus:ring-sky-600"
                                      title={`Ubah jumlah set utama ${c.code} (otomatis mengalikan seluruh detail material di bawahnya)`}
                                    />
                                  </div>

                                  {/* Per-construction Pasang / Bongkar / Bongkar-Pasang selector */}
                                  <select
                                    aria-label={`Aksi Konstruksi ${c.code}`}
                                    data-testid={`construction-action-select-${c.code}`}
                                    value={currentAction}
                                    onChange={(e) => {
                                      const nextAct = e.target
                                        .value as ConstructionActionType;
                                      setNodes((prev) =>
                                        prev.map((n) => {
                                          if (n.id !== selectedNode.id) return n;
                                          const nextConsts =
                                            n.constructions.map((itemC, cIdx) =>
                                              cIdx === idx
                                                ? {
                                                    ...itemC,
                                                    actionType: nextAct,
                                                  }
                                                : itemC
                                            );
                                          return {
                                            ...n,
                                            isBongkar: nextConsts.some(
                                              (ic) =>
                                                ic.actionType === 'BONGKAR' ||
                                                ic.actionType ===
                                                  'BONGKAR_PASANG'
                                            ),
                                            constructions: nextConsts,
                                          };
                                        })
                                      );
                                    }}
                                    className={`px-1 py-0.5 rounded border text-[9px] font-extrabold cursor-pointer shrink-0 ${
                                      currentAction === 'BONGKAR'
                                        ? 'bg-red-600 text-white border-red-700'
                                        : currentAction === 'BONGKAR_PASANG'
                                        ? 'bg-amber-500 text-slate-950 border-amber-600'
                                        : 'bg-white text-slate-700 border-slate-300'
                                    }`}
                                    title="Ubah status konstruksi ini: Pasang Baru / ✕ Bongkar / ⇄ Bongkar-Pasang"
                                  >
                                    <option value="PASANG" className="bg-white text-slate-900">
                                      Pasang
                                    </option>
                                    <option value="BONGKAR" className="bg-white text-red-700">
                                      ✕ Bongkar
                                    </option>
                                    <option value="BONGKAR_PASANG" className="bg-white text-amber-800">
                                      ⇄ B/P
                                    </option>
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      recordHistorySnapshot(
                                        `Hapus Konstruksi ${c.code}`
                                      );
                                      if (expandedConstIndex === idx) {
                                        setExpandedConstIndex(null);
                                      }
                                      setNodes((prev) =>
                                        prev.map((n) =>
                                          n.id === selectedNode.id
                                            ? {
                                                ...n,
                                                constructions:
                                                  n.constructions.filter(
                                                    (_, i) => i !== idx
                                                  ),
                                              }
                                            : n
                                        )
                                      );
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer shrink-0"
                                    title="Hapus konstruksi ini"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Expanded Real Material & Jasa Checklist for this Construction */}
                                {isExpanded && (
                                  <div
                                    data-testid={`construction-material-list-${c.code}`}
                                    className="border-t border-slate-200 bg-white p-2 space-y-1.5"
                                  >
                                    <div className="text-[9.5px] font-bold text-sky-900 bg-sky-50 px-2 py-1 rounded border border-sky-200 flex items-center justify-between gap-2">
                                      <span>
                                        Centang material/jasa riil pada{' '}
                                        <strong>{c.code}</strong> (otomatis dikalikan Set):
                                      </span>
                                      <div className="flex items-center gap-1 font-mono shrink-0">
                                        <span>Set:</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          data-testid={`pole-const-expanded-qty-input-${c.code}`}
                                          aria-label={`Ubah jumlah set ${c.code}`}
                                          value={c.qty === 0 ? '' : c.qty}
                                          onChange={(e) =>
                                            handleChangeMainSetQty(e.target.value)
                                          }
                                          onBlur={handleBlurMainSetQty}
                                          className="w-11 px-1 py-0.5 border border-sky-400 rounded font-mono text-[10px] font-extrabold text-center bg-white text-slate-950"
                                        />
                                        <span>x</span>
                                      </div>
                                    </div>

                                    <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                                      {assignBreakdown.rows.map((row) => (
                                        <div
                                          key={row.khsId}
                                          className={`p-1.5 rounded border text-[10px] flex items-center justify-between gap-1.5 transition ${
                                            row.enabled
                                              ? 'bg-slate-50/80 border-slate-200 text-slate-900'
                                              : 'bg-slate-100/50 border-slate-200 text-slate-400 line-through'
                                          }`}
                                        >
                                          <label className="flex items-start gap-1.5 flex-1 min-w-0 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              data-testid={`material-checkbox-${c.code}-${row.khsId}`}
                                              checked={row.enabled}
                                              onChange={(e) => {
                                                const isChecked =
                                                  e.target.checked;
                                                setNodes((prev) =>
                                                  prev.map((n) => {
                                                    if (n.id !== selectedNode.id)
                                                      return n;
                                                    const nextConsts =
                                                      n.constructions.map(
                                                        (itemC, cIdx) => {
                                                          if (cIdx !== idx)
                                                            return itemC;
                                                          const prevDisabled =
                                                            new Set(
                                                              itemC.disabledKhsIds ||
                                                                []
                                                            );
                                                          if (isChecked) {
                                                            prevDisabled.delete(
                                                              row.khsId
                                                            );
                                                          } else {
                                                            prevDisabled.add(
                                                              row.khsId
                                                            );
                                                          }
                                                          return {
                                                            ...itemC,
                                                            disabledKhsIds:
                                                              Array.from(
                                                                prevDisabled
                                                              ),
                                                          };
                                                        }
                                                      );
                                                    return {
                                                      ...n,
                                                      constructions: nextConsts,
                                                    };
                                                  })
                                                );
                                              }}
                                              className="mt-0.5 rounded text-sky-600 cursor-pointer"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="font-semibold leading-tight break-words">
                                                {row.uraian}
                                              </div>
                                              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                                                [{row.gol}] Rp{' '}
                                                {row.hargaSatuan.toLocaleString(
                                                  'id-ID'
                                                )}
                                                /{row.satuan} • ({row.unitQty} &times; {c.qty} Set ={' '}
                                                <strong className="text-slate-700">
                                                  {row.volume} {row.satuan}
                                                </strong>
                                                )
                                              </div>
                                            </div>
                                          </label>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <input
                                              type="number"
                                              min={0}
                                              step="0.5"
                                              disabled={!row.enabled}
                                              data-testid={`material-total-vol-input-${c.code}-${row.khsId}`}
                                              aria-label={`Volume ${row.uraian}`}
                                              value={row.volume}
                                              onChange={(e) => {
                                                const rawVal = e.target.value;
                                                const nextTotalVol =
                                                  rawVal === ''
                                                    ? 0
                                                    : Math.max(
                                                        0,
                                                        Number(rawVal)
                                                      );
                                                const effectiveSetQty =
                                                  Math.max(1, c.qty || 1);
                                                const nextUnitQty =
                                                  Math.round(
                                                    (nextTotalVol /
                                                      effectiveSetQty) *
                                                      10000
                                                  ) / 10000;
                                                setNodes((prev) =>
                                                  prev.map((n) => {
                                                    if (n.id !== selectedNode.id)
                                                      return n;
                                                    const nextConsts =
                                                      n.constructions.map(
                                                        (itemC, cIdx) => {
                                                          if (cIdx !== idx)
                                                            return itemC;
                                                          return {
                                                            ...itemC,
                                                            customComponentQty: {
                                                              ...(itemC.customComponentQty ||
                                                                {}),
                                                              [row.khsId]:
                                                                nextUnitQty,
                                                            },
                                                          };
                                                        }
                                                      );
                                                    return {
                                                      ...n,
                                                      constructions: nextConsts,
                                                    };
                                                  })
                                                );
                                              }}
                                              className="w-12 px-1 py-0.5 border border-slate-300 rounded font-mono text-[10px] font-bold text-right bg-white"
                                              title={`Total volume untuk ${c.qty} set (${row.unitQty} ${row.satuan}/set × ${c.qty} set)`}
                                            />
                                            <span className="font-mono text-[9px] text-slate-500 w-6">
                                              {row.satuan}
                                            </span>
                                            <span
                                              data-testid={`material-total-price-${c.code}-${row.khsId}`}
                                              className="font-mono font-bold text-emerald-700 text-[9.5px] w-16 text-right"
                                            >
                                              {row.enabled
                                                ? row.jumlahHarga.toLocaleString(
                                                    'id-ID'
                                                  )
                                                : '0'}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                {/* Body: SPAN Mode (Edit Jarak, Multi-Kabel & Toggle 1 Phase / vs 3 Phase ///) */}
                {showCornerMaterialCard &&
                  inspectorMode === 'SPAN' &&
                  selectedSpan && (
                    <div className="p-2.5 space-y-2 max-h-64 overflow-y-auto">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-slate-800">
                          Jarak Gawang Otomatis / Manual:
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            value={selectedSpan.distanceMeters}
                            onChange={(e) => {
                              const nextDist = Math.max(
                                1,
                                Number(e.target.value)
                              );
                              setSpans((prev) =>
                                prev.map((s) =>
                                  s.id === selectedSpan.id
                                    ? { ...s, distanceMeters: nextDist }
                                    : s
                                )
                              );
                            }}
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded font-mono font-bold text-right bg-white"
                          />
                          <span className="font-mono font-bold text-slate-600">
                            Meter
                          </span>
                        </div>
                      </div>

                      {/* Existing Cables on this Span with 1-Phase (/) vs 3-Phase (///) Toggle + Bongkar (✕) vs Hapus (🗑️) */}
                      <div className="space-y-1">
                        {getEffectiveSpanCables(selectedSpan).map((cab) => {
                          const st = getCableVisualStyle(
                            cab.jenisJaringan,
                            cab.statusJaringan
                          );
                          const ph = inferPhaseCountFromConductor(
                            cab.conductorType,
                            cab.phaseCount
                          );
                          const cabIsBongkar = isCableMarkedBongkar(
                            cab,
                            selectedSpan
                          );
                          return (
                            <div
                              key={cab.id}
                              className={`px-2 py-1 rounded border flex items-center justify-between gap-1.5 ${
                                cabIsBongkar
                                  ? 'bg-red-50 border-red-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="px-1.5 py-0.5 rounded font-mono text-[9.5px] font-extrabold text-white shrink-0"
                                  style={{
                                    backgroundColor: cabIsBongkar
                                      ? '#dc2626'
                                      : st.strokeColor,
                                  }}
                                >
                                  {cabIsBongkar ? '✕ BONGKAR' : cab.jenisJaringan}
                                </span>
                                <span
                                  className={`font-bold truncate ${
                                    cabIsBongkar
                                      ? 'text-red-900'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  {cab.conductorType}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  data-testid="toggle-cable-phase-btn"
                                  onClick={() =>
                                    handleToggleCablePhase(selectedSpan.id, cab.id)
                                  }
                                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold border cursor-pointer ${
                                    ph === 3
                                      ? 'bg-indigo-100 text-indigo-950 border-indigo-300'
                                      : 'bg-amber-100 text-amber-950 border-amber-300'
                                  }`}
                                  title="Klik untuk ganti 3 Phase (///) <-> 1 Phase (/)"
                                >
                                  {ph} Phase ({getPhaseSlashSymbol(ph)})
                                </button>
                                <button
                                  type="button"
                                  data-testid={`toggle-cable-bongkar-btn-${cab.id}`}
                                  onClick={() =>
                                    handleToggleCableItemBongkar(
                                      selectedSpan.id,
                                      cab.id
                                    )
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold flex items-center gap-0.5 cursor-pointer border ${
                                    cabIsBongkar
                                      ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                                      : 'bg-white hover:bg-red-50 text-red-700 border-red-300'
                                  }`}
                                  title="Tandai Bongkar (Simbol X Merah) pada jalur kabel ini — tetap di gambar & masuk Jasa Bongkar RAB"
                                >
                                  <span>&#10005;</span>
                                  <span>
                                    {cabIsBongkar ? 'Dibongkar' : 'Bongkar'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  data-testid={`remove-cable-item-btn-${cab.id}`}
                                  onClick={() =>
                                    handleRemoveCableFromSpan(
                                      selectedSpan.id,
                                      cab.id
                                    )
                                  }
                                  className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-red-600 text-slate-700 hover:text-white text-[9.5px] font-bold flex items-center gap-0.5 cursor-pointer"
                                  title="Hapus jalur kabel ini dari kanvas"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Prominent Action Buttons: Distinguish ✕ Bongkar (Stays on Drawing + Enters RAB) vs 🗑️ Hapus (Removes from Canvas) */}
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          type="button"
                          data-testid="span-inspector-bongkar-btn"
                          onClick={() => handleToggleSpanBongkar(selectedSpan.id)}
                          className={`w-full py-1.5 px-2 rounded-lg font-extrabold text-[10.5px] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer border ${
                            isSpanMarkedBongkar(selectedSpan)
                              ? 'bg-red-600 hover:bg-red-700 text-white border-red-800'
                              : 'bg-red-50 hover:bg-red-100 text-red-800 border-red-300'
                          }`}
                        >
                          <span className="text-xs leading-none">&#10005;</span>
                          <span>
                            {isSpanMarkedBongkar(selectedSpan)
                              ? `Kabel Gawang ${selectedSpan.distanceMeters}m Ditandai BONGKAR (Klik untuk Batal)`
                              : `Tandai Bongkar Kabel Gawang Ini (${selectedSpan.distanceMeters}m) — Tetap di Gambar`}
                          </span>
                        </button>

                        <button
                          type="button"
                          data-testid="span-inspector-delete-btn"
                          onClick={() => handleDeleteSpanById(selectedSpan.id)}
                          className="w-full py-1 px-2 rounded-lg bg-slate-100 hover:bg-red-600 text-slate-700 hover:text-white border border-slate-300 font-bold text-[10px] flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>
                            Hapus Kabel dari Kanvas ({selectedSpan.distanceMeters}m)
                          </span>
                        </button>
                      </div>

                      {/* Add another parallel cable on the same gawang */}
                      <div className="pt-1.5 border-t border-slate-200 flex items-center gap-1">
                        <select
                          aria-label="Tambah Kabel Paralel pada Gawang"
                          value={spanAddConductor}
                          onChange={(e) => {
                            const nextCond =
                              e.target.value as SurveySpanConductorType;
                            setSpanAddConductor(nextCond);
                            setSpanAddPhaseCount(
                              inferPhaseCountFromConductor(nextCond)
                            );
                          }}
                          className="flex-1 min-w-0 px-1.5 py-1 border border-slate-300 rounded text-[10px] font-semibold bg-white"
                        >
                          {Object.entries(CONDUCTOR_KHS_MAPPING).map(
                            ([cond, meta]) => (
                              <option key={cond} value={cond}>
                                + [{meta.networkCategory}] {cond}
                              </option>
                            )
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setSpanAddPhaseCount((p) => (p === 3 ? 1 : 3))
                          }
                          className="px-1.5 py-1 rounded border border-indigo-300 bg-indigo-50 text-indigo-950 font-mono text-[10px] font-extrabold cursor-pointer"
                          title="Fasa kabel tambahan"
                        >
                          {spanAddPhaseCount}Ø ({getPhaseSlashSymbol(spanAddPhaseCount)})
                        </button>
                        <button
                          type="button"
                          data-testid="add-cable-to-span-btn"
                          onClick={() =>
                            handleAddCableToSpan(
                              selectedSpan.id,
                              spanAddConductor,
                              spanAddStatus,
                              spanAddPhaseCount
                            )
                          }
                          className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-800 text-white font-bold text-[10px] shrink-0 cursor-pointer"
                        >
                          +Kabel
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* REUSABLE RENDERERS FOR ETIKET SKETCH & OFFICIAL RAB SHEET             */}
      {/* ===================================================================== */}
      {(() => {
        const renderEtiketDrawingSheet = () => {
          const hasNodes = nodes.length > 0;
          const baseLat = parsedCenter.lat;
          const baseLng = parsedCenter.lng;
          const lats = hasNodes ? nodes.map((n) => n.lat) : [baseLat - 0.0003, baseLat + 0.0003];
          const lngs = hasNodes ? nodes.map((n) => n.lng) : [baseLng - 0.0004, baseLng + 0.0004];
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const latSpan = Math.max(maxLat - minLat, 0.0008);
          const lngSpan = Math.max(maxLng - minLng, 0.0008);

          const projectToSvg = (lat: number, lng: number) => {
            const x = 235 + ((lng - minLng) / lngSpan) * 430;
            const y = 375 - ((lat - minLat) / latSpan) * 265;
            return { x, y };
          };

          const rawProjectedNodes = nodes.map((n) => ({
            n,
            pt: projectToSvg(n.lat, n.lng),
            lines: formatPoleCalloutLines(n),
          }));

          // Build Road Sketch Path (Sketsa Jalan sesuai Google Maps)
          // Follows the pole corridor (offset slightly so poles sit on the roadside/bahu jalan)
          // or draws a horizontal/diagonal main road + simpang jalan if fewer than 2 poles exist.
          const roadPoints: Array<{ x: number; y: number }> = (() => {
            if (rawProjectedNodes.length >= 2) {
              const pts = rawProjectedNodes.map((np) => ({
                x: np.pt.x + 18,
                y: np.pt.y + 14,
              }));
              const first = pts[0];
              const second = pts[1];
              const last = pts[pts.length - 1];
              const prevLast = pts[pts.length - 2];
              const dxStart = first.x - second.x;
              const dyStart = first.y - second.y;
              const lenStart = Math.max(1, Math.hypot(dxStart, dyStart));
              const dxEnd = last.x - prevLast.x;
              const dyEnd = last.y - prevLast.y;
              const lenEnd = Math.max(1, Math.hypot(dxEnd, dyEnd));
              return [
                {
                  x: Math.max(30, Math.min(890, first.x + (dxStart / lenStart) * 85)),
                  y: Math.max(30, Math.min(430, first.y + (dyStart / lenStart) * 85)),
                },
                ...pts,
                {
                  x: Math.max(30, Math.min(890, last.x + (dxEnd / lenEnd) * 85)),
                  y: Math.max(30, Math.min(430, last.y + (dyEnd / lenEnd) * 85)),
                },
              ];
            }
            if (rawProjectedNodes.length === 1) {
              const p = rawProjectedNodes[0].pt;
              return [
                { x: 110, y: p.y + 18 },
                { x: p.x, y: p.y + 18 },
                { x: 810, y: p.y + 18 },
              ];
            }
            return [
              { x: 110, y: 265 },
              { x: 460, y: 245 },
              { x: 810, y: 225 },
            ];
          })();

          const roadPathD = roadPoints
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(' ');

          const midRoadIdx = Math.floor(roadPoints.length / 2);
          const pivotRoadPt = roadPoints[midRoadIdx] || { x: 460, y: 245 };
          const simpangEndPt = {
            x: Math.min(885, pivotRoadPt.x + 175),
            y: Math.min(435, pivotRoadPt.y + 125),
          };
          const simpangPathD = `M ${pivotRoadPt.x.toFixed(1)} ${pivotRoadPt.y.toFixed(
            1
          )} L ${simpangEndPt.x.toFixed(1)} ${simpangEndPt.y.toFixed(1)}`;

          const defaultMainRoadCenter = roadPoints[0]
            ? {
                x: Math.max(120, Math.min(360, roadPoints[0].x + 25)),
                y: Math.min(434, roadPoints[0].y + 22),
              }
            : { x: 260, y: 285 };

          const defaultSimpangRoadCenter = {
            x: (pivotRoadPt.x + simpangEndPt.x) / 2,
            y: (pivotRoadPt.y + simpangEndPt.y) / 2,
          };

          const projectedSpansForLayout = spans
            .map((sp) => {
              const fromN = nodes.find((n) => n.id === sp.fromNodeId);
              const toN = nodes.find((n) => n.id === sp.toNodeId);
              if (!fromN || !toN) return null;
              const p1 = projectToSvg(fromN.lat, fromN.lng);
              const p2 = projectToSvg(toN.lat, toN.lng);
              const effectiveCables = getEffectiveSpanCables(sp);
              const cableSummaryText = `${sp.distanceMeters}m (${effectiveCables
                .map((c) => {
                  const ph = inferPhaseCountFromConductor(
                    c.conductorType,
                    c.phaseCount
                  );
                  const cBongkar = isCableMarkedBongkar(c, sp);
                  return `${c.jenisJaringan} ${getPhaseSlashSymbol(ph)}${
                    cBongkar ? ' ✕BONGKAR' : ''
                  }`;
                })
                .join(' + ')})`;
              const badgeW = Math.max(58, cableSummaryText.length * 5.6 + 10);
              return {
                id: sp.id,
                x1: p1.x,
                y1: p1.y,
                x2: p2.x,
                y2: p2.y,
                badgeText: cableSummaryText,
                badgeW,
                badgeH: 16,
              };
            })
            .filter((s): s is NonNullable<typeof s> => s !== null);

          const etiketLayout = computeEtiketCalloutLayout({
            nodes: rawProjectedNodes.map(({ n, pt, lines }) => ({
              id: n.id,
              kodeTiang: n.kodeTiang,
              kind: n.kind,
              x: pt.x,
              y: pt.y,
              lines,
            })),
            spans: projectedSpansForLayout,
            defaultMainRoadCenter,
            defaultSimpangRoadCenter,
            showRoadSketch: showRoadSketchOnEtiket,
          });

          const nodePlacements = etiketLayout.nodePlacements.map((placed, idx) => ({
            ...placed,
            n: rawProjectedNodes[idx].n,
          }));
          const spanBadgeMap = new Map(
            etiketLayout.spanBadges.map((b) => [b.id, b])
          );
          const roadLabelPt = etiketLayout.mainRoadLabelCenter;
          const simpangLabelPt = etiketLayout.simpangRoadLabelCenter;

          return (
            <div
              data-testid="pln-etiket-sheet"
              className="bg-white border-2 border-slate-900 p-4 rounded-none shadow-sm space-y-0"
            >
              {/* Top CAD Drawing Area (Auto-scaled SVG with Road Sketch + Network) */}
              <div className="relative w-full h-[460px] border border-slate-900 bg-white overflow-hidden">
                <svg
                  viewBox="0 0 920 460"
                  className="w-full h-full"
                  aria-label="Gambar Sketsa Survei Teknik PLN"
                >
                  {/* Subtle CAD Grid */}
                  <defs>
                    <pattern
                      id="pln-cad-grid"
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="920" height="460" fill="url(#pln-cad-grid)" />

                  {/* SKETSA JALAN SESUAI GOOGLE MAPS (Memudahkan Pembaca Memahami Konteks Lokasi) */}
                  {showRoadSketchOnEtiket && (
                    <g data-testid="etiket-road-sketch-layer">
                      {/* Simpang Jalan Outer Curb */}
                      <path
                        d={simpangPathD}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="26"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Simpang Jalan Asphalt */}
                      <path
                        d={simpangPathD}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="22"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Simpang Jalan Centerline */}
                      <path
                        d={simpangPathD}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="1.2"
                        strokeDasharray="6,6"
                      />

                      {/* Jalan Utama Outer Curb (Bahu Jalan) */}
                      <path
                        d={roadPathD}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="36"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Jalan Utama Surface */}
                      <path
                        d={roadPathD}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="31"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Jalan Utama Centerline */}
                      <path
                        d={roadPathD}
                        fill="none"
                        stroke="#475569"
                        strokeWidth="1.5"
                        strokeDasharray="8,6"
                      />

                      {/* Nama Jalan Utama Label (Zero-Overlap Positioned) */}
                      <g
                        transform={`translate(${roadLabelPt.x.toFixed(
                          1
                        )}, ${roadLabelPt.y.toFixed(1)})`}
                      >
                        <rect
                          data-testid="etiket-road-label-box"
                          x="-95"
                          y="-9"
                          width="190"
                          height="18"
                          rx="3"
                          fill="#f8fafc"
                          fillOpacity="0.94"
                          stroke="#64748b"
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="bold"
                          fill="#1e293b"
                          fontFamily="sans-serif"
                        >
                          {namaJalanUtama || 'JL. RAYA LOKASI SURVEI'}
                        </text>
                      </g>

                      {/* Nama Jalan Simpang Label (Zero-Overlap Positioned) */}
                      <g
                        transform={`translate(${simpangLabelPt.x.toFixed(
                          1
                        )}, ${simpangLabelPt.y.toFixed(1)})`}
                      >
                        <rect
                          data-testid="etiket-road-label-box"
                          x="-70"
                          y="-8"
                          width="140"
                          height="16"
                          rx="3"
                          fill="#f8fafc"
                          fillOpacity="0.94"
                          stroke="#94a3b8"
                          strokeWidth="0.9"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fontSize="7.5"
                          fontWeight="bold"
                          fill="#334155"
                          fontFamily="sans-serif"
                        >
                          {namaJalanSimpang || 'JL. LINGKUNGAN / DESA'}
                        </text>
                      </g>
                    </g>
                  )}

                  {/* North Arrow (U) */}
                  <g transform="translate(55, 55)">
                    <circle
                      cx="0"
                      cy="0"
                      r="28"
                      fill="#ffffff"
                      stroke="#0f172a"
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="-14"
                      textAnchor="middle"
                      className="font-bold text-[11px] fill-slate-900"
                    >
                      U
                    </text>
                    <line
                      x1="0"
                      y1="18"
                      x2="0"
                      y2="-10"
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                    <polygon points="0,-13 -5,-2 5,-2" fill="#0f172a" />
                  </g>

                  {/* Notice when no poles are drawn yet */}
                  {!hasNodes && (
                    <g transform="translate(460, 145)">
                      <rect
                        x="-210"
                        y="-22"
                        width="420"
                        height="44"
                        rx="6"
                        fill="#ffffff"
                        stroke="#94a3b8"
                        strokeDasharray="4,4"
                      />
                      <text
                        x="0"
                        y="-3"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="bold"
                        fill="#334155"
                      >
                        SKETSA KORIDOR JALAN ({namaJalanUtama})
                      </text>
                      <text
                        x="0"
                        y="12"
                        textAnchor="middle"
                        fontSize="9"
                        fill="#64748b"
                      >
                        Silakan plot titik Tiang / Kabel di Tab 1 (Kanvas Peta) untuk menampilkan jaringan di atas jalan ini.
                      </text>
                    </g>
                  )}

                  {/* Multi-Cable Spans (Distinct JTM, JTR, SR Colors + Non-Overlapping Staggered Phase Ticks) */}
                  {spans.map((sp) => {
                    const fromN = nodes.find((n) => n.id === sp.fromNodeId);
                    const toN = nodes.find((n) => n.id === sp.toNodeId);
                    if (!fromN || !toN) return null;
                    const p1 = projectToSvg(fromN.lat, fromN.lng);
                    const p2 = projectToSvg(toN.lat, toN.lng);
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const segLen = Math.max(1, Math.hypot(dx, dy));
                    const nx = -dy / segLen;
                    const ny = dx / segLen;

                    const effectiveCables = getEffectiveSpanCables(sp);
                    const spIsBongkar = isSpanMarkedBongkar(sp);
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const cableSummaryText = `${sp.distanceMeters}m (${effectiveCables
                      .map((c) => {
                        const ph = inferPhaseCountFromConductor(
                          c.conductorType,
                          c.phaseCount
                        );
                        const cBongkar = isCableMarkedBongkar(c, sp);
                        return `${c.jenisJaringan} ${getPhaseSlashSymbol(ph)}${
                          cBongkar ? ' ✕BONGKAR' : ''
                        }`;
                      })
                      .join(' + ')})`;
                    const badgeW = Math.max(58, cableSummaryText.length * 5.6 + 10);

                    const tx = dx / segLen;
                    const ty = dy / segLen;

                    return (
                      <g key={sp.id}>
                        {effectiveCables.map((cab, cIdx) => {
                          const st = getCableVisualStyle(
                            cab.jenisJaringan,
                            cab.statusJaringan
                          );
                          const ph = inferPhaseCountFromConductor(
                            cab.conductorType,
                            cab.phaseCount
                          );
                          const cabBongkar = isCableMarkedBongkar(cab, sp);
                          const offsetIndex =
                            cIdx - (effectiveCables.length - 1) / 2;
                          // Wider separation (8px) + staggered longitudinal ratio so phase ticks never overlap
                          const shiftPx = offsetIndex * 8;
                          const x1 = p1.x + nx * shiftPx;
                          const y1 = p1.y + ny * shiftPx;
                          const x2 = p2.x + nx * shiftPx;
                          const y2 = p2.y + ny * shiftPx;

                          const tickRatio = getStaggeredPhaseTickRatio(
                            cIdx,
                            effectiveCables.length
                          );
                          const slashBaseX = x1 + (x2 - x1) * tickRatio;
                          const slashBaseY = y1 + (y2 - y1) * tickRatio;
                          const slashSteps = ph === 1 ? [0] : [-4.5, 0, 4.5];

                          const bongkarRatio = Math.max(
                            0.18,
                            Math.min(0.82, 1 - tickRatio)
                          );
                          const bongkarX = x1 + (x2 - x1) * bongkarRatio;
                          const bongkarY = y1 + (y2 - y1) * bongkarRatio;

                          return (
                            <g key={cab.id}>
                              <line
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke={st.strokeColor}
                                strokeWidth="2.5"
                                strokeDasharray={st.dashArray}
                              />
                              {slashSteps.map((step, sIdx) => {
                                const cx = slashBaseX + tx * step;
                                const cy = slashBaseY + ty * step;
                                const sx1 = cx - nx * 5.5 - tx * 2.5;
                                const sy1 = cy - ny * 5.5 - ty * 2.5;
                                const sx2 = cx + nx * 5.5 + tx * 2.5;
                                const sy2 = cy + ny * 5.5 + ty * 2.5;
                                return (
                                  <line
                                    key={sIdx}
                                    x1={sx1}
                                    y1={sy1}
                                    x2={sx2}
                                    y2={sy2}
                                    stroke={st.strokeColor}
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                  />
                                );
                              })}
                              {cabBongkar && (
                                <g
                                  data-testid="etiket-cable-bongkar-x"
                                  transform={`translate(${bongkarX.toFixed(
                                    1
                                  )}, ${bongkarY.toFixed(1)})`}
                                >
                                  <line
                                    x1="-6"
                                    y1="-6"
                                    x2="6"
                                    y2="6"
                                    stroke="#ffffff"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                  />
                                  <line
                                    x1="6"
                                    y1="-6"
                                    x2="-6"
                                    y2="6"
                                    stroke="#ffffff"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                  />
                                  <line
                                    x1="-6"
                                    y1="-6"
                                    x2="6"
                                    y2="6"
                                    stroke="#dc2626"
                                    strokeWidth="2.4"
                                    strokeLinecap="round"
                                  />
                                  <line
                                    x1="6"
                                    y1="-6"
                                    x2="-6"
                                    y2="6"
                                    stroke="#dc2626"
                                    strokeWidth="2.4"
                                    strokeLinecap="round"
                                  />
                                </g>
                              )}
                            </g>
                          );
                        })}
                        <rect
                          data-testid="etiket-span-badge-box"
                          x={
                            (spanBadgeMap.get(sp.id)?.centerX ?? midX) -
                            badgeW / 2
                          }
                          y={(spanBadgeMap.get(sp.id)?.centerY ?? midY) - 8}
                          width={badgeW}
                          height="16"
                          rx="3"
                          fill={spIsBongkar ? '#fef2f2' : '#ffffff'}
                          stroke={spIsBongkar ? '#dc2626' : '#0f172a'}
                          strokeWidth="1"
                        />
                        <text
                          x={spanBadgeMap.get(sp.id)?.centerX ?? midX}
                          y={(spanBadgeMap.get(sp.id)?.centerY ?? midY) + 3.2}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="bold"
                          fill={spIsBongkar ? '#dc2626' : '#0f172a'}
                          fontFamily="monospace"
                        >
                          {cableSummaryText}
                        </text>
                      </g>
                    );
                  })}

                  {/* Nodes & Non-Overlapping Leader-Line Callout Boxes */}
                  {nodePlacements.map(
                    ({
                      n,
                      pt,
                      lines,
                      boxX,
                      boxY,
                      boxWidth,
                      boxHeight,
                      anchorX,
                      anchorY,
                    }) => {
                      const isPlan =
                        n.kind === 'TIANG_RENCANA' || n.kind === 'GARDU_RENCANA';
                      const isGardu =
                        n.kind === 'GARDU_TRAFO' || n.kind === 'GARDU_RENCANA';
                      const isTitik = n.kind === 'TITIK_APP';
                      const strokeCol = isPlan
                        ? '#dc2626'
                        : isTitik
                        ? '#d97706'
                        : '#0f172a';

                      return (
                        <g key={n.id}>
                          <line
                            x1={pt.x}
                            y1={pt.y}
                            x2={anchorX}
                            y2={anchorY}
                            stroke={strokeCol}
                            strokeWidth="1"
                            strokeDasharray="2,2"
                          />

                          {isGardu ? (
                            <polygon
                              points={`${pt.x},${pt.y - 9} ${pt.x - 9},${pt.y + 8} ${
                                pt.x + 9
                              },${pt.y + 8}`}
                              fill="#ffffff"
                              stroke={strokeCol}
                              strokeWidth="2.5"
                            />
                          ) : isTitik ? (
                            <rect
                              x={pt.x - 6}
                              y={pt.y - 6}
                              width="12"
                              height="12"
                              fill="#ffffff"
                              stroke={strokeCol}
                              strokeWidth="2.5"
                            />
                          ) : (
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r="6.5"
                              fill="#ffffff"
                              stroke={strokeCol}
                              strokeWidth="2.5"
                            />
                          )}

                          {/* Simbol X Merah pada Gambar Sketsa apabila konstruksi dibongkar */}
                          {isNodeMarkedBongkar(n) && (
                            <g>
                              <line
                                x1={pt.x - 9}
                                y1={pt.y - 9}
                                x2={pt.x + 9}
                                y2={pt.y + 9}
                                stroke="#ffffff"
                                strokeWidth="4.5"
                                strokeLinecap="round"
                              />
                              <line
                                x1={pt.x + 9}
                                y1={pt.y - 9}
                                x2={pt.x - 9}
                                y2={pt.y + 9}
                                stroke="#ffffff"
                                strokeWidth="4.5"
                                strokeLinecap="round"
                              />
                              <line
                                x1={pt.x - 9}
                                y1={pt.y - 9}
                                x2={pt.x + 9}
                                y2={pt.y + 9}
                                stroke="#dc2626"
                                strokeWidth="2.8"
                                strokeLinecap="round"
                              />
                              <line
                                x1={pt.x + 9}
                                y1={pt.y - 9}
                                x2={pt.x - 9}
                                y2={pt.y + 9}
                                stroke="#dc2626"
                                strokeWidth="2.8"
                                strokeLinecap="round"
                              />
                            </g>
                          )}

                          <g transform={`translate(${boxX}, ${boxY})`}>
                            <rect
                              data-testid="etiket-pole-callout-box"
                              x="0"
                              y="0"
                              width={boxWidth}
                              height={boxHeight}
                              fill="#ffffff"
                              stroke={strokeCol}
                              strokeWidth="1.2"
                            />
                            <text
                              x="5"
                              y="11"
                              fontSize="9"
                              fontWeight="bold"
                              fill={strokeCol}
                              fontFamily="monospace"
                            >
                              {n.kodeTiang}
                            </text>
                            {lines.map((ln, lIdx) => (
                              <text
                                key={lIdx}
                                x="5"
                                y={21.5 + lIdx * 10}
                                fontSize="8.5"
                                fill={strokeCol}
                                fontFamily="monospace"
                              >
                                {ln}
                              </text>
                            ))}
                          </g>
                        </g>
                      );
                    }
                  )}
                </svg>
              </div>

              {/* Bottom Official PLN Title Block (Etiket Gambar Sesuai Contoh File Gambar Survey.pdf) */}
              <div className="grid grid-cols-12 border-x border-b border-slate-900 text-[11px] text-slate-900 font-sans">
                <div className="col-span-3 border-r border-slate-900 p-2 flex flex-col justify-between">
                  <div>
                    <div className="font-extrabold text-xs">
                      PT. PLN (PERSERO) UID JAWA TENGAH
                    </div>
                    <div className="font-bold text-sky-900">
                      UP3 MAGELANG — UNIT BOROBUDUR
                    </div>
                  </div>
                  <div className="mt-1.5 pt-1 border-t border-slate-400 text-[9px] leading-tight">
                    <div className="font-bold mb-1 text-slate-800">
                      KET. PETA JALAN, TIANG &amp; KABEL :
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      <div className="text-slate-600 font-bold truncate">
                        ═ SKETSA JALAN
                      </div>
                      <div className="text-rose-600 font-bold truncate">
                        ● TIANG RENCANA / JTM
                      </div>
                      <div className="text-sky-700 font-bold truncate">
                        ━ KABEL JTR LVTC
                      </div>
                      <div className="text-amber-700 font-bold truncate">
                        ┅ KABEL SR PELANGGAN
                      </div>
                      <div className="text-indigo-900 font-bold font-mono truncate">
                        /// = 3Ø • / = 1Ø
                      </div>
                      <div className="text-slate-900 font-bold truncate">
                        ● TIANG/GARDU EKSISTING
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-4 border-r border-slate-900 p-2 space-y-1">
                  <div className="grid grid-cols-3 items-center">
                    <span className="font-semibold">DIGAMBAR</span>
                    <span
                      data-testid="etiket-digambar-value"
                      className="col-span-2 font-bold"
                    >
                      : {effectiveDigambarOleh}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 items-center">
                    <span className="font-semibold">DIRENCANAKAN</span>
                    <span
                      data-testid="etiket-direncanakan-value"
                      className="col-span-2 font-bold"
                    >
                      : {direncanakanOleh}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 items-center">
                    <span className="font-semibold">DIPERIKSA</span>
                    <span
                      data-testid="etiket-diperiksa-value"
                      className="col-span-2 font-bold"
                    >
                      : {diperiksaOleh}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 items-center">
                    <span className="font-semibold">DISETUJUI</span>
                    <span
                      data-testid="etiket-disetujui-value"
                      className="col-span-2 font-bold"
                    >
                      : {disetujuiOleh}
                    </span>
                  </div>
                </div>

                <div className="col-span-5 p-2 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">
                      PEKERJAAN &amp; LOKASI :
                    </div>
                    <div className="font-extrabold text-xs uppercase">
                      {judulGambar}
                    </div>
                    <div className="text-[11px]">{lokasiPekerjaan}</div>
                  </div>
                  <div className="grid grid-cols-3 pt-1 border-t border-slate-300 text-[10px] font-mono font-bold">
                    <span data-testid="etiket-unit-label">UNIT: BOROBUDUR</span>
                    <span>SKALA: NTS</span>
                    <span>NO: {item.noNodin}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        };

        const renderOfficialRabDocument = () => {
          let globalRowNumber = 1;
          return (
            <div
              data-testid="official-rab-sheet"
              className="border-2 border-slate-900 bg-white p-5 text-slate-950 shadow-sm space-y-4"
            >
              {/* OFFICIAL PLN HEADER SESUAI CONTOH FORMAT RAB PDF */}
              <div className="space-y-3">
                {/* Top-Left PLN Identity with Logo */}
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-amber-400 border border-slate-900 flex items-center justify-center font-extrabold text-sky-900 text-sm shrink-0">
                    ⚡
                  </div>
                  <div className="text-xs font-extrabold uppercase leading-tight text-slate-950">
                    <div>PT. PLN (PERSERO)</div>
                    <div>UID JAWA TENGAH</div>
                  </div>
                </div>

                {/* Centered Underlined Title */}
                <div className="text-center py-1">
                  <h3 className="text-sm font-extrabold uppercase underline tracking-wide text-slate-950">
                    RENCANA ANGGARAN BIAYA (RAB)
                  </h3>
                </div>

                {/* 5-Row Metadata Block (Pekerjaan, Lokasi, Pelaksana, Anggaran, Nomor PRK) - Editable */}
                <div className="max-w-3xl text-xs space-y-1 font-sans">
                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-3 sm:col-span-2 font-semibold text-slate-800">
                      Pekerjaan
                    </span>
                    <div className="col-span-9 sm:col-span-10 flex items-center gap-1.5">
                      <span className="font-bold">:</span>
                      <input
                        type="text"
                        data-testid="rab-header-pekerjaan"
                        value={rabPekerjaan}
                        onChange={(e) => {
                          setRabPekerjaan(e.target.value);
                          setJudulGambar(e.target.value);
                        }}
                        className="w-full px-2 py-0.5 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-950 bg-transparent focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-3 sm:col-span-2 font-semibold text-slate-800">
                      Lokasi
                    </span>
                    <div className="col-span-9 sm:col-span-10 flex items-center gap-1.5">
                      <span className="font-bold">:</span>
                      <input
                        type="text"
                        data-testid="rab-header-lokasi"
                        value={rabLokasi}
                        onChange={(e) => {
                          setRabLokasi(e.target.value);
                          setLokasiPekerjaan(e.target.value);
                        }}
                        className="w-full px-2 py-0.5 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-950 bg-transparent focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-3 sm:col-span-2 font-semibold text-slate-800">
                      Pelaksana
                    </span>
                    <div className="col-span-9 sm:col-span-10 flex items-center gap-1.5">
                      <span className="font-bold">:</span>
                      <input
                        type="text"
                        data-testid="rab-header-pelaksana"
                        value={rabPelaksana}
                        onChange={(e) => setRabPelaksana(e.target.value)}
                        className="w-full px-2 py-0.5 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-950 bg-transparent focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-3 sm:col-span-2 font-semibold text-slate-800">
                      Anggaran
                    </span>
                    <div className="col-span-9 sm:col-span-10 flex items-center gap-1.5">
                      <span className="font-bold">:</span>
                      <input
                        type="text"
                        data-testid="rab-header-anggaran"
                        value={rabAnggaran}
                        onChange={(e) => setRabAnggaran(e.target.value)}
                        className="w-full px-2 py-0.5 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-950 bg-transparent focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-3 sm:col-span-2 font-semibold text-slate-800">
                      Nomor PRK
                    </span>
                    <div className="col-span-9 sm:col-span-10 flex items-center gap-1.5">
                      <span className="font-bold">:</span>
                      <input
                        type="text"
                        data-testid="rab-header-nomor-prk"
                        value={rabNomorPrk}
                        onChange={(e) => setRabNomorPrk(e.target.value)}
                        placeholder="Isi Nomor PRK..."
                        className="w-full px-2 py-0.5 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-950 bg-transparent focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* OFFICIAL 2-ROW MERGED HEADER TABLE SESUAI CONTOH FORMAT RAB PDF */}
              <div className="overflow-x-auto">
                <table
                  data-testid="official-rab-table"
                  className="w-full text-left border-collapse border border-slate-900 text-[11px]"
                >
                  <thead className="bg-slate-100 text-slate-950 uppercase font-extrabold">
                    <tr>
                      <th
                        rowSpan={2}
                        className="py-2 px-2 text-center border border-slate-900 w-10"
                      >
                        NO
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-2.5 text-center border border-slate-900 min-w-[220px]"
                      >
                        URAIAN
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-2 text-center border border-slate-900 w-16"
                      >
                        GOL
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-2 text-center border border-slate-900 w-14"
                      >
                        SAT
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-2 text-center border border-slate-900 w-16"
                      >
                        VOL
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-2 text-center border border-slate-900 w-28"
                      >
                        HARGA
                        <br />
                        SATUAN
                      </th>
                      <th
                        colSpan={4}
                        className="py-1.5 px-2 text-center border border-slate-900"
                      >
                        BIAYA YANG DIPERLUKAN ( Rp )
                      </th>
                      <th
                        rowSpan={2}
                        className="py-2 px-1.5 text-center border border-slate-900 w-8 print:hidden"
                      >
                        AKSI
                      </th>
                    </tr>
                    <tr>
                      <th className="py-1.5 px-2 text-center border border-slate-900 w-28">
                        MDU
                      </th>
                      <th className="py-1.5 px-2 text-center border border-slate-900 w-28">
                        HARDWARE
                      </th>
                      <th className="py-1.5 px-2 text-center border border-slate-900 w-28">
                        JASA
                      </th>
                      <th className="py-1.5 px-2 text-center border border-slate-900 w-32">
                        JUMLAH
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRabSections.map((sec) => {
                      let sectionFallbackNo = 1;
                      return (
                        <React.Fragment key={sec.code}>
                          <tr className="bg-slate-200/75 font-extrabold text-slate-950">
                            <td className="py-1.5 px-2 text-center font-mono border border-slate-900">
                              {sec.roman}
                            </td>
                            <td
                              colSpan={10}
                              className="py-1.5 px-2.5 tracking-wide border border-slate-900"
                            >
                              {sec.title}
                            </td>
                          </tr>

                          {sec.items.map((it) => {
                            const currentNo = globalRowNumber++;

                            // Baris Header Paket Konstruksi (+ | MJ6-T | Unit | Vol) sesuai Contoh_Format_RAB.pdf
                            if (it.isPackageHeader) {
                              sectionFallbackNo = 1;
                              return (
                                <tr
                                  key={it.id}
                                  data-testid={`rab-package-header-row-${it.uraian}`}
                                  className="bg-amber-50/70 font-extrabold text-slate-950"
                                >
                                  <td className="py-1 px-2 text-center font-mono font-extrabold text-slate-950 border border-slate-900">
                                    +
                                  </td>
                                  <td className="py-1 px-2 border border-slate-900 font-mono font-extrabold text-slate-950">
                                    {it.uraian}
                                  </td>
                                  <td className="py-1 px-1.5 text-center border border-slate-900" />
                                  <td className="py-1 px-1.5 text-center font-mono font-bold border border-slate-900">
                                    {it.satuan || 'Unit'}
                                  </td>
                                  <td className="py-1 px-1.5 text-right border border-slate-900">
                                    <input
                                      type="number"
                                      data-testid={`rab-package-vol-input-${it.uraian}`}
                                      aria-label={`Volume paket ${it.uraian}`}
                                      min={0}
                                      step="1"
                                      value={it.volume === 0 ? '' : it.volume}
                                      onChange={(e) => {
                                        const rawVal = e.target.value;
                                        const nextPkgVol =
                                          rawVal === ''
                                            ? 0
                                            : Math.max(0, Number(rawVal));
                                        setRabItems((prev) =>
                                          updateRabPackageHeaderVolume(
                                            prev,
                                            it.id,
                                            nextPkgVol
                                          )
                                        );
                                      }}
                                      onBlur={() => {
                                        if (!it.volume || it.volume <= 0) {
                                          setRabItems((prev) =>
                                            updateRabPackageHeaderVolume(
                                              prev,
                                              it.id,
                                              1
                                            )
                                          );
                                        }
                                      }}
                                      className="w-14 px-1 py-0.5 border border-slate-400 rounded text-right font-mono font-extrabold bg-white"
                                      title={`Ubah jumlah set utama ${it.uraian} (otomatis mengalikan seluruh detail material di bawahnya)`}
                                    />
                                  </td>
                                  <td className="py-1 px-1.5 border border-slate-900" />
                                  <td className="py-1 px-2 border border-slate-900" />
                                  <td className="py-1 px-2 border border-slate-900" />
                                  <td className="py-1 px-2 border border-slate-900" />
                                  <td className="py-1 px-2.5 border border-slate-900" />
                                  <td className="py-1 px-1 text-center border border-slate-900 print:hidden">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRabItems((prev) =>
                                          prev.filter(
                                            (r) =>
                                              r.id !== it.id &&
                                              !(
                                                r.parentPackageCode ===
                                                  it.parentPackageCode &&
                                                r.section === it.section
                                              )
                                          )
                                        )
                                      }
                                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                      title={`Hapus Paket ${it.uraian} beserta rinciannya`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            const rowCost = calculateRabRowBreakdown(it);
                            const displayItemNo =
                              it.itemNo ?? sectionFallbackNo++;

                            return (
                              <tr
                                key={it.id}
                                className="hover:bg-sky-50/40 transition"
                              >
                                <td className="py-1 px-2 text-center font-mono text-slate-700 border border-slate-900">
                                  {displayItemNo}
                                </td>
                                <td className="py-1 px-2 border border-slate-900">
                                  <input
                                    type="text"
                                    aria-label={`Uraian baris ${currentNo}`}
                                    value={it.uraian}
                                    onChange={(e) => {
                                      const nextUraian = e.target.value;
                                      setRabItems((prev) =>
                                        prev.map((row) =>
                                          row.id === it.id
                                            ? { ...row, uraian: nextUraian }
                                            : row
                                        )
                                      );
                                    }}
                                    className="w-full px-1 py-0.5 font-semibold text-slate-950 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded"
                                  />
                                </td>
                                <td className="py-1 px-1.5 text-center border border-slate-900">
                                  <select
                                    aria-label={`Golongan baris ${currentNo}`}
                                    value={it.gol}
                                    onChange={(e) => {
                                      const nextGol = e.target.value as typeof it.gol;
                                      setRabItems((prev) =>
                                        prev.map((row) =>
                                          row.id === it.id
                                            ? { ...row, gol: nextGol }
                                            : row
                                        )
                                      );
                                    }}
                                    className="px-1 py-0.5 rounded text-[10px] font-mono font-bold bg-transparent border border-transparent hover:border-slate-300"
                                  >
                                    <option value="MDU-KD">MDU-KD</option>
                                    <option value="HDW">HDW</option>
                                    <option value="JASA">JASA</option>
                                  </select>
                                </td>
                                <td className="py-1 px-1.5 text-center font-mono border border-slate-900">
                                  <input
                                    type="text"
                                    aria-label={`Satuan baris ${currentNo}`}
                                    value={it.satuan}
                                    onChange={(e) => {
                                      const nextSat = e.target.value;
                                      setRabItems((prev) =>
                                        prev.map((row) =>
                                          row.id === it.id
                                            ? { ...row, satuan: nextSat }
                                            : row
                                        )
                                      );
                                    }}
                                    className="w-12 text-center font-mono bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded"
                                  />
                                </td>
                                <td className="py-1 px-1.5 text-right border border-slate-900">
                                  <input
                                    type="number"
                                    aria-label={`Volume baris ${currentNo}`}
                                    min={0}
                                    step="0.5"
                                    value={it.volume}
                                    onChange={(e) => {
                                      const nextVol = Math.max(
                                        0,
                                        Number(e.target.value)
                                      );
                                      setRabItems((prev) =>
                                        prev.map((row) =>
                                          row.id === it.id
                                            ? { ...row, volume: nextVol }
                                            : row
                                        )
                                      );
                                    }}
                                    className="w-14 px-1 py-0.5 border border-slate-300 rounded text-right font-mono font-bold bg-white"
                                  />
                                </td>
                                <td className="py-1 px-1.5 text-right font-mono border border-slate-900">
                                  <input
                                    type="number"
                                    aria-label={`Harga satuan baris ${currentNo}`}
                                    min={0}
                                    step="100"
                                    value={it.hargaSatuan}
                                    onChange={(e) => {
                                      const nextPrice = Math.max(
                                        0,
                                        Number(e.target.value)
                                      );
                                      setRabItems((prev) =>
                                        prev.map((row) =>
                                          row.id === it.id
                                            ? { ...row, hargaSatuan: nextPrice }
                                            : row
                                        )
                                      );
                                    }}
                                    className="w-24 px-1 py-0.5 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded text-right font-mono bg-transparent focus:bg-white"
                                  />
                                </td>
                                <td className="py-1 px-2 text-right font-mono border border-slate-900">
                                  {rowCost.mdu > 0
                                    ? rowCost.mdu.toLocaleString('id-ID')
                                    : '-'}
                                </td>
                                <td className="py-1 px-2 text-right font-mono border border-slate-900">
                                  {rowCost.hardware > 0
                                    ? rowCost.hardware.toLocaleString('id-ID')
                                    : '-'}
                                </td>
                                <td className="py-1 px-2 text-right font-mono border border-slate-900">
                                  {rowCost.jasa > 0
                                    ? rowCost.jasa.toLocaleString('id-ID')
                                    : '-'}
                                </td>
                                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-950 border border-slate-900">
                                  {rowCost.jumlah.toLocaleString('id-ID')}
                                </td>
                                <td className="py-1 px-1 text-center border border-slate-900 print:hidden">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRabItems((prev) =>
                                        prev.filter((r) => r.id !== it.id)
                                      )
                                    }
                                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                    title="Hapus Baris RAB"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  {/* OFFICIAL FOOTER SESUAI CONTOH FORMAT RAB PDF HALAMAN 12 */}
                  <tfoot className="bg-slate-50 font-extrabold text-xs">
                    <tr>
                      <td
                        colSpan={6}
                        className="py-1.5 px-3 text-left border border-slate-900 text-slate-900"
                      >
                        Jumlah MDU - Hardware - Jasa
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono border border-slate-900">
                        {rabSummary.subTotalMdu.toLocaleString('id-ID')}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono border border-slate-900">
                        {rabSummary.subTotalHardware.toLocaleString('id-ID')}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono border border-slate-900">
                        {rabSummary.subTotalJasa.toLocaleString('id-ID')}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono border border-slate-900">
                        {rabSummary.subTotalJumlah.toLocaleString('id-ID')}
                      </td>
                      <td className="border border-slate-900 print:hidden" />
                    </tr>
                    <tr>
                      <td
                        colSpan={6}
                        className="py-1.5 px-3 text-left border border-slate-900 text-slate-900"
                      >
                        PPN {rabSummary.ppnPercent}%
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono border border-slate-900">
                        {Math.round(
                          rabSummary.subTotalMdu * (rabSummary.ppnPercent / 100)
                        ).toLocaleString('id-ID')}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono border border-slate-900">
                        {Math.round(
                          rabSummary.subTotalHardware *
                            (rabSummary.ppnPercent / 100)
                        ).toLocaleString('id-ID')}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono border border-slate-900">
                        {Math.round(
                          rabSummary.subTotalJasa * (rabSummary.ppnPercent / 100)
                        ).toLocaleString('id-ID')}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono border border-slate-900">
                        {rabSummary.ppnAmount.toLocaleString('id-ID')}
                      </td>
                      <td className="border border-slate-900 print:hidden" />
                    </tr>
                    <tr className="bg-amber-50 text-slate-950 text-xs font-extrabold">
                      <td
                        colSpan={6}
                        className="py-2 px-3 text-left border border-slate-900"
                      >
                        Jumlah Total
                      </td>
                      <td className="py-2 px-2 text-right font-mono border border-slate-900">
                        {(
                          rabSummary.subTotalMdu +
                          Math.round(
                            rabSummary.subTotalMdu * (rabSummary.ppnPercent / 100)
                          )
                        ).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-2 text-right font-mono border border-slate-900">
                        {(
                          rabSummary.subTotalHardware +
                          Math.round(
                            rabSummary.subTotalHardware *
                              (rabSummary.ppnPercent / 100)
                          )
                        ).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-2 text-right font-mono border border-slate-900">
                        {(
                          rabSummary.subTotalJasa +
                          Math.round(
                            rabSummary.subTotalJasa * (rabSummary.ppnPercent / 100)
                          )
                        ).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-emerald-900 border border-slate-900">
                        {rabSummary.grandTotal.toLocaleString('id-ID')}
                      </td>
                      <td className="border border-slate-900 print:hidden" />
                    </tr>
                    <tr className="bg-white">
                      <td
                        colSpan={11}
                        className="py-2 px-3 italic text-slate-900 border border-slate-900"
                      >
                        <span className="font-extrabold not-italic">
                          Terbilang :{' '}
                        </span>
                        {rabSummary.terbilang}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* BOTTOM NOTE & PARAF BOX SESUAI CONTOH FORMAT RAB PDF */}
              <div className="flex flex-wrap items-start justify-between gap-4 pt-2 text-xs text-slate-900">
                <div className="italic font-semibold">
                  Harga yang dipakai adalah RAB HSS 2020
                </div>
                <table className="border-collapse border border-slate-900 text-[11px] w-56">
                  <thead>
                    <tr className="bg-slate-100">
                      <th
                        colSpan={2}
                        className="border border-slate-900 py-1 px-2 text-center font-bold"
                      >
                        Paraf
                      </th>
                    </tr>
                    <tr>
                      <th className="border border-slate-900 py-1 px-2 text-center font-bold w-1/2">
                        MSB RENSISDIS
                      </th>
                      <th className="border border-slate-900 py-1 px-2 text-center font-bold w-1/2">
                        MSB POSD
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-900 h-12" />
                      <td className="border border-slate-900 h-12" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        };

        return (
          <>
            {/* ===================================================================== */}
            {/* SUB-TAB 2: GAMBAR SKETSA SURVEI BER-ETIKET RESMI PLN                  */}
            {/* ===================================================================== */}
            {studioTab === 'sketsa_etiket' && (
              <div className="p-4 space-y-4">
                {/* Etiket Metadata & Road Sketch Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Judul Gambar Pekerjaan
                    </label>
                    <input
                      type="text"
                      value={judulGambar}
                      onChange={(e) => {
                        setJudulGambar(e.target.value);
                        setRabPekerjaan(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-bold text-slate-900 mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Lokasi / Desa / Kecamatan
                    </label>
                    <input
                      type="text"
                      value={lokasiPekerjaan}
                      onChange={(e) => {
                        setLokasiPekerjaan(e.target.value);
                        setRabLokasi(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Digambar &amp; Direncanakan Oleh
                    </label>
                    <input
                      type="text"
                      data-testid="input-digambar-oleh"
                      placeholder="Ketik nama petugas..."
                      value={effectiveDigambarOleh}
                      onChange={(e) => {
                        setDigambarOleh(e.target.value);
                        onUpdatePetugasSurvei?.(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Nama Jalan di Sketsa Peta
                    </label>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="checkbox"
                        checked={showRoadSketchOnEtiket}
                        onChange={(e) =>
                          setShowRoadSketchOnEtiket(e.target.checked)
                        }
                        title="Tampilkan Sketsa Jalan sesuai Peta"
                        className="rounded text-indigo-600"
                      />
                      <input
                        type="text"
                        data-testid="input-nama-jalan-sketsa"
                        value={namaJalanUtama}
                        onChange={(e) => setNamaJalanUtama(e.target.value)}
                        placeholder="Nama Jalan Utama..."
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    <a
                      href="/assets/aistudio/Contoh_File_Gambar_Survey_07e50dc1.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-700" />
                      <span>PDF Ref</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak</span>
                    </button>
                  </div>
                </div>

                {renderEtiketDrawingSheet()}
              </div>
            )}

            {/* ===================================================================== */}
            {/* SUB-TAB 3: TABEL RAB RESMI PLN UID JAWA TENGAH (SAMA PERSIS CONTOH)   */}
            {/* ===================================================================== */}
            {studioTab === 'tabel_rab' && (
              <div className="p-4 space-y-4">
                {/* Top RAB Controls & Options */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includePembetonanTiang}
                        onChange={(e) => {
                          setIncludePembetonanTiang(e.target.checked);
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span>Sertakan Pembetonan Tiang</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700">
                        Transportasi (Rit):
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={transportasiRit}
                        onChange={(e) =>
                          setTransportasiRit(
                            Math.max(0, Number(e.target.value))
                          )
                        }
                        className="w-14 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-center"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700">PPN:</span>
                      <select
                        aria-label="Persentase PPN RAB"
                        value={ppnPercent}
                        onChange={(e) => setPpnPercent(Number(e.target.value))}
                        className="px-2 py-1 bg-white border border-slate-300 rounded font-bold"
                      >
                        <option value={10}>PPN 10% (Sesuai Contoh RAB)</option>
                        <option value={11}>PPN 11%</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleGenerateRabFromMap(false)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Hitung Ulang dari Peta</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href="/assets/aistudio/Contoh_Format_RAB_103a8806.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Contoh RAB PDF</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleExportRabExcel}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Export RAB (.xls)</span>
                    </button>
                  </div>
                </div>

                {/* Manual KHS Item & Jasa Pembongkaran Adder Bar (with Search & Section Filter) */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">
                      + Tambah Material / Jasa Pasang / Jasa Pembongkaran KHS Manual:
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        data-testid="rab-filter-bongkar-btn"
                        onClick={() =>
                          setKhsSectionFilter((prev) =>
                            prev === 'XV' ? 'ALL' : 'XV'
                          )
                        }
                        className={`px-2 py-0.5 rounded font-extrabold text-[10.5px] border transition cursor-pointer ${
                          khsSectionFilter === 'XV'
                            ? 'bg-red-600 text-white border-red-700'
                            : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300'
                        }`}
                      >
                        ✕ Filter Jasa Pembongkaran (Seksi XV)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setKhsSectionFilter((prev) =>
                            prev === 'XIV' ? 'ALL' : 'XIV'
                          )
                        }
                        className={`px-2 py-0.5 rounded font-extrabold text-[10.5px] border transition cursor-pointer ${
                          khsSectionFilter === 'XIV'
                            ? 'bg-amber-600 text-white border-amber-700'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        ⇄ Filter Bongkar-Pasang (Seksi XIV)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-56">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                      <input
                        type="text"
                        data-testid="rab-khs-search-input"
                        value={khsSearchQuery}
                        onChange={(e) => setKhsSearchQuery(e.target.value)}
                        placeholder="Cari material / upah bongkar..."
                        className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
                      />
                    </div>

                    <select
                      aria-label="Filter Seksi KHS"
                      value={khsSectionFilter}
                      onChange={(e) => setKhsSectionFilter(e.target.value)}
                      className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700"
                    >
                      <option value="ALL">Semua Seksi (I - XVI)</option>
                      {RAB_ROMAN_SECTIONS.map((sec) => (
                        <option key={sec.code} value={sec.code}>
                          {sec.fullLabel}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Pilih Material atau Jasa KHS"
                      data-testid="rab-manual-khs-select"
                      value={selectedKhsIdToAdd}
                      onChange={(e) => setSelectedKhsIdToAdd(e.target.value)}
                      className="flex-1 min-w-[240px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
                    >
                      {filteredKhsMasterList.map((khs) => (
                        <option key={khs.id} value={khs.id}>
                          [{khs.section} - {khs.gol}] {khs.uraian} (
                          {formatRupiah(khs.hargaSatuan)}/{khs.satuan})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={manualKhsQty}
                      onChange={(e) =>
                        setManualKhsQty(Math.max(1, Number(e.target.value)))
                      }
                      className="w-20 px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-center"
                    />
                    <button
                      type="button"
                      data-testid="rab-add-manual-khs-btn"
                      onClick={() => {
                        const khs = KHS_MASTER_CATALOG[selectedKhsIdToAdd];
                        if (!khs) return;
                        setRabItems((prev) => [
                          ...prev,
                          {
                            id: `rab-manual-${Date.now()}`,
                            section: khs.section,
                            uraian: khs.uraian,
                            gol: khs.gol,
                            satuan: khs.satuan,
                            volume: manualKhsQty,
                            hargaSatuan: khs.hargaSatuan,
                            sourceInfo: 'Input Manual KHS',
                          },
                        ]);
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer"
                    >
                      + Masukkan ke RAB
                    </button>
                  </div>
                </div>

                {renderOfficialRabDocument()}
              </div>
            )}

            {/* ===================================================================== */}
            {/* SUB-TAB 4: GENERATE FILE SURVEY PDF (3 HALAMAN: SURAT, RAB, GAMBAR)   */}
            {/* ===================================================================== */}
            {studioTab === 'berkas_survey_pdf' && (
              <div
                data-testid="berkas-survey-pdf-container"
                className="p-4 space-y-6 bg-slate-100"
              >
                {/* Action Toolbar for 3-Page Survey PDF */}
                <div className="p-3 bg-white border border-slate-300 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs print:hidden">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-700" />
                      <span>
                        Berkas Lengkap Hasil Survei Teknik (Format PDF 3 Halaman)
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      Halaman 1: <strong>Surat Permohonan (Upload Security)</strong> • Halaman 2: <strong>RAB (Bisa Diedit Langsung)</strong> • Halaman 3: <strong>Gambar Rencana Ber-Etiket &amp; Sketsa Jalan</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold cursor-pointer flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-700" />
                      <span>Upload / Ganti File Surat Security</span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setSuratPermohonanFileName(file.name);
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              setSuratPermohonanFileUrl(reader.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      data-testid="print-berkas-survey-pdf-btn"
                      onClick={() => window.print()}
                      className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak / Simpan PDF Survey (3 Halaman)</span>
                    </button>
                  </div>
                </div>

                {/* ================================================================= */}
                {/* HALAMAN 1: SURAT PERMOHONAN PELANGGAN (SESUAI UPLOAD SECURITY)   */}
                {/* ================================================================= */}
                <div
                  data-testid="survey-pdf-page-1"
                  className="bg-white border-2 border-slate-900 p-6 shadow-sm space-y-4 break-after-page"
                >
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-amber-400 border border-slate-900 flex items-center justify-center font-extrabold text-sky-900 text-sm">
                        ⚡
                      </div>
                      <div className="text-xs font-extrabold uppercase leading-tight text-slate-950">
                        <div>PT. PLN (PERSERO) UID JAWA TENGAH</div>
                        <div className="text-sky-900">
                          UP3 MAGELANG — UNIT BOROBUDUR
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] font-bold text-slate-700">
                      <div>HALAMAN 1 / 3</div>
                      <div className="text-slate-950">
                        LAMPIRAN SURAT PERMOHONAN SECURITY
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-300 p-4 rounded-lg text-xs space-y-2">
                    <div className="font-extrabold uppercase text-slate-900 border-b border-slate-200 pb-1.5">
                      DATA REGISTRASI SURAT PERMOHONAN MASUK (POSKO SECURITY / LOKET)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 font-semibold">
                          Nama Pemohon / Instansi:
                        </span>{' '}
                        <span className="font-extrabold text-slate-950">
                          {item.projectName}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">
                          No. Surat / Agenda:
                        </span>{' '}
                        <span className="font-mono font-bold text-slate-900">
                          {item.suratPermohonan || item.noNodin || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">
                          Tanggal Surat Masuk:
                        </span>{' '}
                        <span className="font-mono font-semibold text-slate-900">
                          {item.tglSurat || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">
                          File Lampiran Security:
                        </span>{' '}
                        <span className="font-mono font-bold text-indigo-900">
                          {suratPermohonanFileName}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 font-semibold">
                          Lokasi Permohonan:
                        </span>{' '}
                        <span className="font-semibold text-slate-900">
                          {item.alamat || lokasiPekerjaan}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 font-semibold">
                          Perihal / Keperluan:
                        </span>{' '}
                        <span className="font-semibold text-slate-900">
                          {judulGambar}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Embedded Preview of Uploaded Security File or Formal Surat Permohonan */}
                  <div className="border-2 border-dashed border-slate-400 rounded-lg p-5 bg-white min-h-[360px] flex flex-col justify-between">
                    {suratPermohonanFileUrl ? (
                      suratPermohonanFileUrl.startsWith('data:image/') ? (
                        <div className="flex flex-col items-center gap-2">
                          <img
                            src={suratPermohonanFileUrl}
                            alt="Surat Permohonan Security"
                            className="max-h-[420px] object-contain border border-slate-200"
                          />
                          <span className="text-[11px] font-mono text-slate-500">
                            Berkas Scan Surat Permohonan: {suratPermohonanFileName}
                          </span>
                        </div>
                      ) : (
                        <iframe
                          src={suratPermohonanFileUrl}
                          title="Surat Permohonan PDF"
                          className="w-full h-[420px] border border-slate-200"
                        />
                      )
                    ) : (
                      <div className="space-y-4 text-xs text-slate-900 max-w-2xl mx-auto w-full py-2">
                        <div className="flex justify-between items-start border-b border-slate-300 pb-3">
                          <div>
                            <div className="font-bold">
                              Nomor : {item.suratPermohonan || '001/PERMOHONAN/2026'}
                            </div>
                            <div className="font-bold">
                              Lampiran : 1 (Satu) Berkas ({suratPermohonanFileName})
                            </div>
                            <div className="font-bold">
                              Perihal : Permohonan {judulGambar}
                            </div>
                          </div>
                          <div className="text-right">
                            Magelang, {item.tglSurat || '2026'}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div>Kepada Yth.</div>
                          <div className="font-extrabold">
                            Manager PT. PLN (PERSERO) UID JAWA TENGAH
                          </div>
                          <div className="font-bold">
                            UP3 Magelang — UNIT Borobudur
                          </div>
                          <div>di Tempat</div>
                        </div>

                        <div className="space-y-2 leading-relaxed">
                          <p>Dengan hormat,</p>
                          <p>
                            Sehubungan dengan kebutuhan pelayanan kelistrikan pada lokasi{' '}
                            <strong>{item.alamat || lokasiPekerjaan}</strong>, bersama surat ini kami atas nama{' '}
                            <strong>{item.projectName}</strong> mengajukan permohonan{' '}
                            <strong>{judulGambar}</strong>.
                          </p>
                          <p>
                            Dokumen fisik surat permohonan ini telah diterima dan diregistrasi melalui Posko Security / Loket Pelayanan Pelanggan dengan nama berkas{' '}
                            <span className="font-mono font-bold underline">
                              {suratPermohonanFileName}
                            </span>{' '}
                            untuk ditindaklanjuti dengan Survei Teknik, penyusunan RAB, serta Gambar Rencana Jaringan.
                          </p>
                        </div>

                        <div className="flex justify-between items-end pt-8">
                          <div className="text-[11px] font-mono text-slate-600 border border-slate-300 px-3 py-2 rounded bg-slate-50">
                            <div className="font-bold text-slate-800">
                              VERIFIKASI DITERIMA SECURITY:
                            </div>
                            <div>Status: TERVERIFIKASI LENGKAP</div>
                            <div>Berkas: {suratPermohonanFileName}</div>
                          </div>
                          <div className="text-center">
                            <div>Hormat Kami,</div>
                            <div>Pemohon</div>
                            <div className="h-12" />
                            <div className="font-extrabold underline">
                              {item.projectName}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ================================================================= */}
                {/* HALAMAN 2: RENCANA ANGGARAN BIAYA (RAB) — BISA DIEDIT LANGSUNG    */}
                {/* ================================================================= */}
                <div
                  data-testid="survey-pdf-page-2"
                  className="space-y-2 break-after-page"
                >
                  <div className="flex items-center justify-between px-1 text-xs font-mono font-bold text-slate-700 print:hidden">
                    <span>
                      HALAMAN 2 / 3 — RENCANA ANGGARAN BIAYA (RAB) [DAPAT DIEDIT LANGSUNG DI BAWAH INI]
                    </span>
                    <span>Total RAB: {formatRupiah(rabSummary.grandTotal)}</span>
                  </div>
                  {renderOfficialRabDocument()}
                </div>

                {/* ================================================================= */}
                {/* HALAMAN 3: GAMBAR RENCANA BER-ETIKET PLN + SKETSA JALAN           */}
                {/* ================================================================= */}
                <div data-testid="survey-pdf-page-3" className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-xs font-mono font-bold text-slate-700 print:hidden">
                    <span>
                      HALAMAN 3 / 3 — GAMBAR RENCANA JARINGAN &amp; SKETSA JALAN BER-ETIKET PLN
                    </span>
                    <span>UNIT: BOROBUDUR</span>
                  </div>
                  {renderEtiketDrawingSheet()}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};
