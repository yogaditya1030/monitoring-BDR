import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  PermohonanItem,
  SurveyRabDesign,
  SurveyPoleNode,
  SurveySpanEdge,
  SpanCableItem,
  SurveyPoleConstructionAssignment,
  SurveySpanConductorType,
  CablePhaseCount,
  RabLineItem,
  RabRomanSection,
  ConstructionCategory,
} from '../types';
import {
  KHS_MASTER_CATALOG,
  CONSTRUCTION_PACKAGES_CATALOG,
  CONSTRUCTION_CATEGORY_LIST,
  CONDUCTOR_KHS_MAPPING,
  RAB_ROMAN_SECTIONS,
  PRESET_SMPN3_PABELAN_NODES,
  PRESET_SMPN3_PABELAN_SPANS,
} from '../data/khsAndConstructionCatalog';
import {
  calculateGeodesicDistanceMeters,
  generateRabItemsFromSurvey,
  updateRabPackageHeaderVolume,
  calculateRabRowBreakdown,
  calculateRabSummary,
  groupRabItemsByRomanSection,
  getRomanSectionForPackage,
  computeEtiketCalloutLayout,
  getConstructionAssignmentBreakdown,
  getPoleKhsMaterialBreakdown,
  getEffectiveSpanCables,
  getCableVisualStyle,
  buildPhaseSlashSvg,
  buildBongkarXSvg,
  isNodeMarkedBongkar,
  isSpanMarkedBongkar,
  isCableMarkedBongkar,
  calculateOffsetLineCoords,
  calculatePoleCalloutOffset,
  formatPoleCalloutLines,
  inferNetworkCategoryFromConductor,
  inferPhaseCountFromConductor,
  getPhaseSlashSymbol,
  getStaggeredPhaseTickRatio,
  getCableScreenAngleDeg,
} from '../utils/rabCalculator';
import { parseCoordinate } from '../utils/plnValidation';
import {
  Map as MapIcon,
  FileSpreadsheet,
  Compass,
  FileText,
  Zap,
  Sparkles,
  Undo2,
  RotateCcw,
  Trash2,
  Plus,
  Printer,
  Maximize2,
  Minimize2,
  Layers,
  CheckCircle2,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripHorizontal,
  Move,
  Upload,
  X,
} from 'lucide-react';

export interface TeknikSurveyRabStudioProps {
  item: PermohonanItem;
  petugasSurvei: string;
  onUpdatePetugasSurvei?: (name: string) => void;
  tagingLokasi: string;
  nomorGardu?: string;
  nomorTiang: string;
  initialDesign?: SurveyRabDesign;
  defaultViewTab?: 'map' | 'etiket' | 'rab' | 'pdf3hal';
  onAutoSyncDesign?: (
    design: SurveyRabDesign,
    grandTotalRab: number
  ) => void;
  onApplyRabDesign: (
    design: SurveyRabDesign,
    grandTotalRab: number,
    summaryNotes: string
  ) => void;
  onDirectSave?: (
    design: SurveyRabDesign,
    grandTotalRab: number,
    summaryNotes: string
  ) => void;
  readOnly?: boolean;
}

type StudioSubTab = 'map' | 'etiket' | 'rab' | 'pdf3hal';
type MapDrawTool =
  | 'pan'
  | 'add_pole_planned'
  | 'add_pole_existing'
  | 'add_gardu_planned'
  | 'add_gardu_existing'
  | 'add_cable'
  | 'bongkar'
  | 'delete';

interface HistorySnapshot {
  nodes: SurveyPoleNode[];
  spans: SurveySpanEdge[];
}

const CONDUCTOR_OPTIONS: Array<{
  value: SurveySpanConductorType;
  label: string;
}> = [
  { value: 'NFA2X-T 3x70+1x70', label: '[JTR] NFA2X-T 3x70+1x70 mm²' },
  { value: 'NFA2X-T 3x70+1x50', label: '[JTR] NFA2X-T 3x70+1x50 mm²' },
  { value: 'NFA2X-T 3x35+1x35', label: '[JTR] NFA2X-T 3x35+1x35 mm²' },
  { value: 'NFA2X-T 2x70', label: '[JTR] NFA2X-T 2x70 mm² (1Ø)' },
  { value: 'NFA2X-T 2x35', label: '[JTR] NFA2X-T 2x35 mm² (1Ø)' },
  { value: 'AAAC 70', label: '[JTM] AAAC 70 mm² (SUTM 20kV)' },
  { value: 'AAAC 150', label: '[JTM] AAAC 150 mm² (SUTM 20kV)' },
  { value: 'AAAC/S 150', label: '[JTM] AAAC/S 150 mm² (SUTM 20kV)' },
  { value: 'MVTIC 3x240+N95', label: '[JTM] MVTIC 3x240+N95 mm² (SKUTM)' },
  { value: 'NFA2X 2x16', label: '[SR] TIC / NFA2X 2x16 mm² (1Ø)' },
  { value: 'NFA2X 4x16', label: '[SR] TIC / NFA2X 4x16 mm² (3Ø)' },
];

export const TeknikSurveyRabStudio: React.FC<TeknikSurveyRabStudioProps> = ({
  item,
  petugasSurvei,
  onUpdatePetugasSurvei,
  tagingLokasi,
  nomorGardu = '',
  nomorTiang,
  initialDesign,
  defaultViewTab,
  onAutoSyncDesign,
  onApplyRabDesign,
  onDirectSave,
  readOnly = false,
}) => {
  const [viewTab, setViewTab] = useState<StudioSubTab>(defaultViewTab || 'map');

  useEffect(() => {
    if (defaultViewTab) {
      setViewTab(defaultViewTab);
    }
  }, [defaultViewTab]);

  // Nodes & Spans State (starts empty unless initialDesign has nodes)
  const [nodes, setNodes] = useState<SurveyPoleNode[]>(
    () => initialDesign?.nodes || []
  );
  const [spans, setSpans] = useState<SurveySpanEdge[]>(
    () => initialDesign?.spans || []
  );
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [customCalloutOffsets, setCustomCalloutOffsets] = useState<
    Record<string, { dx: number; dy: number }>
  >(() => initialDesign?.customCalloutOffsets || {});

  // RAB Settings & Items (PPN ditetapkan 11%)
  const [ppnPercent, setPpnPercent] = useState<number>(
    initialDesign?.ppnPercent ?? 11
  );
  const [includePembetonanTiang, setIncludePembetonanTiang] = useState<boolean>(
    initialDesign?.includePembetonanTiang ?? true
  );
  const [transportasiRit, setTransportasiRit] = useState<number>(
    initialDesign?.transportasiRit ?? 1
  );
  const [rabItems, setRabItems] = useState<RabLineItem[]>(() => {
    if (initialDesign?.rabItems && initialDesign.rabItems.length > 0) {
      return initialDesign.rabItems;
    }
    if (initialDesign?.nodes && initialDesign.nodes.length > 0) {
      return generateRabItemsFromSurvey({
        nodes: initialDesign.nodes,
        spans: initialDesign.spans || [],
        includePembetonanTiang: initialDesign.includePembetonanTiang ?? true,
        transportasiRit: initialDesign.transportasiRit ?? 1,
      });
    }
    return [];
  });

  // Etiket & RAB Header Metadata
  const [judulGambar, setJudulGambar] = useState<string>(
    initialDesign?.judulGambar ||
      item.keteranganPekerjaan ||
      `${item.transaksi} - ${item.projectName || item.kontakPerson}`
  );
  const [lokasiPekerjaan, setLokasiPekerjaan] = useState<string>(
    initialDesign?.lokasiPekerjaan ||
      item.alamat ||
      'WILAYAH KERJA ULP BOROBUDUR'
  );
  const [pelaksanaPekerjaan, setPelaksanaPekerjaan] = useState<string>(
    initialDesign?.rabHeader?.pelaksana || 'PT. PLN (PERSERO) UP3 MAGELANG'
  );
  const [jenisAnggaran, setJenisAnggaran] = useState<string>(
    initialDesign?.rabHeader?.anggaran || 'OPERASI / INVESTASI'
  );
  const [nomorPrk, setNomorPrk] = useState<string>(
    initialDesign?.rabHeader?.nomorPrk || item.noNodin || '-'
  );
  const [showRoadSketch, setShowRoadSketch] = useState<boolean>(true);

  // Map Toolbar & Selection State
  const [activeTool, setActiveTool] = useState<MapDrawTool>('add_pole_planned');
  const [polePlacementKind, setPolePlacementKind] = useState<
    'TIANG_RENCANA' | 'TIANG_EKSISTING'
  >('TIANG_RENCANA');
  const [selectedConductorType, setSelectedConductorType] =
    useState<SurveySpanConductorType>('NFA2X-T 3x70+1x70');
  const [selectedPhaseCount, setSelectedPhaseCount] =
    useState<CablePhaseCount>(3);
  const [selectedStatusJaringan, setSelectedStatusJaringan] = useState<
    'RENCANA' | 'EKSISTING'
  >('RENCANA');
  const [autoConnectCable, setAutoConnectCable] = useState<boolean>(false);
  const [cableStartNodeId, setCableStartNodeId] = useState<string | null>(
    null
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => initialDesign?.nodes?.[0]?.id || null
  );
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [tileLayerMode, setTileLayerMode] = useState<'street' | 'satellite'>(
    'street'
  );
  const [calloutCompactMode, setCalloutCompactMode] = useState<boolean>(false);

  // Inspector Construction Filter State
  const [constructionSearch, setConstructionSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<
    ConstructionCategory | 'ALL'
  >('ALL');
  const [selectedPkgCode, setSelectedPkgCode] = useState<string>('MJ6-T');
  const [newAssignmentAction, setNewAssignmentAction] =
    useState<NonNullable<SurveyPoleConstructionAssignment['actionType']>>(
      'PASANG'
    );
  const [newAssignmentQty, setNewAssignmentQty] = useState<number>(1);
  const [expandedAssignmentIdx, setExpandedAssignmentIdx] = useState<
    number | null
  >(null);

  // Modal Tambah Item / Paket / Jasa Pembongkaran ke RAB
  const [showAddRabModal, setShowAddRabModal] = useState<boolean>(false);
  const [addModalMode, setAddModalMode] = useState<'PACKAGE' | 'MATERIAL_BONGKAR'>('PACKAGE');
  const [addModalSearch, setAddModalSearch] = useState<string>('');
  const [addModalCategory, setAddModalCategory] = useState<string>('ALL');
  const [addModalQty, setAddModalQty] = useState<number>(1);
  const [addModalSelectedPkgCode, setAddModalSelectedPkgCode] = useState<string>('MJ6-T');
  const [addModalSelectedKhsId, setAddModalSelectedKhsId] = useState<string>('JASA_BONGKAR_JTR_J6');
  const [addModalSection, setAddModalSection] = useState<RabRomanSection>('XV');

  // RAB Custom Row State
  const khsCatalogList = useMemo(() => Object.values(KHS_MASTER_CATALOG), []);
  const [newRowSection, setNewRowSection] = useState<RabRomanSection>('III');
  const [newRowKhsId, setNewRowKhsId] = useState<string>(
    khsCatalogList[0]?.id || ''
  );
  const [newRowVol, setNewRowVol] = useState<number>(1);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() =>
    initialDesign?.updatedAt
      ? new Date(initialDesign.updatedAt).toLocaleTimeString('id-ID')
      : null
  );

  // Map Background State for Etiket SVG (Defaults to Real Maps OSM)
  const [mapBackgroundMode, setMapBackgroundMode] = useState<
    'osm' | 'voyager' | 'satellite' | 'off'
  >(() => initialDesign?.mapBackgroundMode || 'osm');
  const [mapBackgroundOpacity, setMapBackgroundOpacity] = useState<number>(
    () => initialDesign?.mapBackgroundOpacity ?? 0.92
  );
  const [mapZoomOffset, setMapZoomOffset] = useState<number>(
    () => initialDesign?.mapZoomOffset ?? 0
  );

  // Draggable Legend & Callout State in Etiket SVG
  const [legendPos, setLegendPos] = useState<{ x: number; y: number }>(
    () => initialDesign?.legendPos || { x: 690, y: 16 }
  );
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);
  const legendDragStart = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  }>({ mouseX: 0, mouseY: 0, startX: 690, startY: 16 });
  const [draggingCalloutNodeId, setDraggingCalloutNodeId] = useState<string | null>(null);
  const calloutDragStart = useRef<{
    mouseX: number;
    mouseY: number;
    startDx: number;
    startDy: number;
  }>({ mouseX: 0, mouseY: 0, startDx: 0, startDy: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Multi-page Surat Permohonan State
  const computeInitialSuratPages = (rec: PermohonanItem, des?: SurveyRabDesign): string[] => {
    if (des?.suratPermohonanPages && des.suratPermohonanPages.length > 0) {
      return des.suratPermohonanPages;
    }
    if (rec.suratPermohonanPages && rec.suratPermohonanPages.length > 0) {
      return rec.suratPermohonanPages;
    }
    if (rec.suratPermohonanDataUrl && rec.suratPermohonanDataUrl.trim() !== '') {
      return [rec.suratPermohonanDataUrl];
    }
    return ['FORMAL_PAGE_1'];
  };

  const [attachedSuratPages, setAttachedSuratPages] = useState<string[]>(() =>
    computeInitialSuratPages(item, initialDesign)
  );
  const [failedImageIndices, setFailedImageIndices] = useState<Record<number, boolean>>({});

  const handleUploadSuratPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          setAttachedSuratPages((prev) => {
            // If only default single formal page exists and user uploads real scan, append or replace cleanly
            return [...prev, result];
          });
          setStatusToast(`Halaman surat "${file.name}" berhasil ditambahkan ke bundel berkas!`);
          setTimeout(() => setStatusToast(null), 3500);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAddFormalSuratPage = () => {
    setAttachedSuratPages((prev) => [
      ...prev,
      `FORMAL_PAGE_${prev.length + 1}`,
    ]);
    setStatusToast('Lembar halaman surat permohonan berhasil ditambahkan!');
    setTimeout(() => setStatusToast(null), 3000);
  };

  const handleSetSuratPageCount = (targetCount: number) => {
    const safeCount = Math.max(1, Math.min(10, targetCount));
    setAttachedSuratPages((prev) => {
      if (prev.length === safeCount) return prev;
      if (prev.length > safeCount) {
        return prev.slice(0, safeCount);
      }
      const next = [...prev];
      while (next.length < safeCount) {
        next.push(`FORMAL_PAGE_${next.length + 1}`);
      }
      return next;
    });
  };

  const handleRemoveSuratPage = (idx: number) => {
    setAttachedSuratPages((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      return filtered.length > 0 ? filtered : ['FORMAL_PAGE_1'];
    });
    setFailedImageIndices((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
  };

  // Synchronize ONLY when switching to a different record (item.id)
  useEffect(() => {
    setNodes(initialDesign?.nodes || []);
    setSpans(initialDesign?.spans || []);
    if (initialDesign?.rabItems && initialDesign.rabItems.length > 0) {
      setRabItems(initialDesign.rabItems);
    } else if (initialDesign?.nodes && initialDesign.nodes.length > 0) {
      setRabItems(
        generateRabItemsFromSurvey({
          nodes: initialDesign.nodes,
          spans: initialDesign.spans || [],
          includePembetonanTiang: initialDesign.includePembetonanTiang ?? true,
          transportasiRit: initialDesign.transportasiRit ?? 1,
        })
      );
    } else {
      setRabItems([]);
    }
    setPpnPercent(initialDesign?.ppnPercent ?? 11);
    setIncludePembetonanTiang(initialDesign?.includePembetonanTiang ?? true);
    setTransportasiRit(initialDesign?.transportasiRit ?? 1);
    setJudulGambar(
      initialDesign?.judulGambar ||
        item.keteranganPekerjaan ||
        `${item.transaksi} - ${item.projectName || item.kontakPerson}`
    );
    setLokasiPekerjaan(
      initialDesign?.lokasiPekerjaan ||
        item.alamat ||
        'WILAYAH KERJA ULP BOROBUDUR'
    );
    setLegendPos(initialDesign?.legendPos || { x: 690, y: 16 });
    setMapBackgroundMode(initialDesign?.mapBackgroundMode || 'osm');
    setMapBackgroundOpacity(initialDesign?.mapBackgroundOpacity ?? 0.92);
    setMapZoomOffset(initialDesign?.mapZoomOffset ?? 0);
    setCustomCalloutOffsets(initialDesign?.customCalloutOffsets || {});
    setAttachedSuratPages(computeInitialSuratPages(item, initialDesign));
    setLastSavedAt(
      initialDesign?.updatedAt
        ? new Date(initialDesign.updatedAt).toLocaleTimeString('id-ID')
        : null
    );
  }, [item.id]);

  // Keep a stable ref to onAutoSyncDesign so it never causes a re-render loop
  const onAutoSyncRef = useRef(onAutoSyncDesign);
  useEffect(() => {
    onAutoSyncRef.current = onAutoSyncDesign;
  }, [onAutoSyncDesign]);

  // Continuous auto-sync so parents always have the latest SurveyRabDesign in memory
  useEffect(() => {
    if (nodes.length === 0 && spans.length === 0 && rabItems.length === 0) return;
    const summary = calculateRabSummary(rabItems, ppnPercent);
    const design: SurveyRabDesign = {
      judulGambar,
      lokasiPekerjaan,
      rayonUlp: 'UP3 MAGELANG',
      unitUlp: 'BOROBUDUR',
      rabHeader: {
        pekerjaan: judulGambar,
        lokasi: lokasiPekerjaan,
        pelaksana: pelaksanaPekerjaan,
        anggaran: jenisAnggaran,
        nomorPrk,
      },
      digambarOleh: petugasSurvei || 'TIM SURVEI TEKNIK',
      direncanakanOleh: petugasSurvei || 'TIM SURVEI TEKNIK',
      diperiksaOleh: 'TL TEKNIK',
      disetujuiOleh: 'MANAJER',
      nodes,
      spans,
      rabItems,
      ppnPercent,
      includePembetonanTiang,
      transportasiRit,
      legendPos,
      mapBackgroundMode,
      mapBackgroundOpacity,
      mapZoomOffset,
      customCalloutOffsets,
      suratPermohonanPages: attachedSuratPages,
      updatedAt: new Date().toISOString(),
    };
    onAutoSyncRef.current?.(design, summary.grandTotal);
  }, [
    nodes,
    spans,
    rabItems,
    ppnPercent,
    includePembetonanTiang,
    transportasiRit,
    judulGambar,
    lokasiPekerjaan,
    pelaksanaPekerjaan,
    jenisAnggaran,
    nomorPrk,
    petugasSurvei,
    legendPos,
    mapBackgroundMode,
    mapBackgroundOpacity,
    mapZoomOffset,
    customCalloutOffsets,
    attachedSuratPages,
  ]);

  // Refs for Leaflet Map
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);

  // Latest state refs for map click handlers
  const stateRef = useRef({
    nodes,
    spans,
    activeTool,
    polePlacementKind,
    selectedConductorType,
    selectedPhaseCount,
    selectedStatusJaringan,
    autoConnectCable,
    cableStartNodeId,
    selectedNodeId,
    selectedSpanId,
    nomorTiang,
    nomorGardu,
    includePembetonanTiang,
    transportasiRit,
  });

  useEffect(() => {
    stateRef.current = {
      nodes,
      spans,
      activeTool,
      polePlacementKind,
      selectedConductorType,
      selectedPhaseCount,
      selectedStatusJaringan,
      autoConnectCable,
      cableStartNodeId,
      selectedNodeId,
      selectedSpanId,
      nomorTiang,
      nomorGardu,
      includePembetonanTiang,
      transportasiRit,
    };
  }, [
    nodes,
    spans,
    activeTool,
    polePlacementKind,
    selectedConductorType,
    selectedPhaseCount,
    selectedStatusJaringan,
    autoConnectCable,
    cableStartNodeId,
    selectedNodeId,
    selectedSpanId,
    nomorTiang,
    nomorGardu,
    includePembetonanTiang,
    transportasiRit,
  ]);

  // Helper to push undo snapshot and sync RAB items automatically
  const commitGraphUpdate = (
    nextNodes: SurveyPoleNode[],
    nextSpans: SurveySpanEdge[],
    recordHistory = true
  ) => {
    if (recordHistory) {
      setUndoStack((prev) => [
        ...prev.slice(-29),
        {
          nodes: JSON.parse(JSON.stringify(stateRef.current.nodes)),
          spans: JSON.parse(JSON.stringify(stateRef.current.spans)),
        },
      ]);
    }
    setNodes(nextNodes);
    setSpans(nextSpans);
    const nextRab = generateRabItemsFromSurvey({
      nodes: nextNodes,
      spans: nextSpans,
      includePembetonanTiang: stateRef.current.includePembetonanTiang,
      transportasiRit: stateRef.current.transportasiRit,
    });
    setRabItems(nextRab);
  };

  // Undo handler + Ctrl+Z shortcut
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setNodes(last.nodes);
    setSpans(last.spans);
    const nextRab = generateRabItemsFromSurvey({
      nodes: last.nodes,
      spans: last.spans,
      includePembetonanTiang,
      transportasiRit,
    });
    setRabItems(nextRab);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Compute default map center from tagingLokasi or first node
  const initialMapCenter = useMemo<[number, number]>(() => {
    const parsed = parseCoordinate(tagingLokasi);
    if (parsed) return [parsed.lat, parsed.lng];
    if (nodes.length > 0) return [nodes[0].lat, nodes[0].lng];
    return [-7.6079, 110.2038]; // Default Borobudur / Magelang
  }, [tagingLokasi]);

  // Filtered construction catalog for Inspector
  const filteredCatalog = useMemo(() => {
    const q = constructionSearch.trim().toLowerCase();
    return CONSTRUCTION_PACKAGES_CATALOG.filter((pkg) => {
      const catOk =
        selectedCategory === 'ALL' || pkg.category === selectedCategory;
      if (!catOk) return false;
      if (!q) return true;
      return (
        pkg.code.toLowerCase().includes(q) ||
        pkg.name.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q)
      );
    });
  }, [constructionSearch, selectedCategory]);

  // Filtered packages for Add RAB Item Modal
  const filteredModalPackages = useMemo(() => {
    const q = addModalSearch.trim().toLowerCase();
    return CONSTRUCTION_PACKAGES_CATALOG.filter((pkg) => {
      const catOk =
        addModalCategory === 'ALL' ||
        pkg.category === addModalCategory ||
        (addModalCategory === 'BONGKAR' &&
          (pkg.category === 'BONGKAR' || pkg.code.startsWith('BKR')));
      if (!catOk) return false;
      if (!q) return true;
      return (
        pkg.code.toLowerCase().includes(q) ||
        pkg.name.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.components.some((c) => {
          const khs = KHS_MASTER_CATALOG[c.khsId];
          return (
            c.khsId.toLowerCase().includes(q) ||
            khs?.uraian.toLowerCase().includes(q)
          );
        })
      );
    });
  }, [addModalSearch, addModalCategory]);

  // Filtered KHS catalog (especially Jasa Pembongkaran Seksi XV) for Add RAB Item Modal
  const filteredModalKhs = useMemo(() => {
    const q = addModalSearch.trim().toLowerCase();
    const allKhs = Object.values(KHS_MASTER_CATALOG);
    return allKhs.filter((k) => {
      let matchesCat = true;
      if (addModalCategory === 'BONGKAR') {
        matchesCat =
          k.section === 'XV' ||
          k.section === 'XIV' ||
          k.id.startsWith('JASA_BONGKAR') ||
          k.uraian.toLowerCase().includes('bongkar');
      } else if (addModalCategory === 'TIANG') {
        matchesCat = k.section === 'I' || k.id.includes('TIANG');
      } else if (addModalCategory === 'JTM') {
        matchesCat = k.section === 'II' || k.section === 'VI' || k.id.includes('JTM');
      } else if (addModalCategory === 'GARDU') {
        matchesCat = k.section === 'III' || k.id.includes('TRAFO') || k.id.includes('GARDU');
      } else if (addModalCategory === 'SWITCHING') {
        matchesCat = k.section === 'IV' || k.id.includes('LBS') || k.id.includes('ABSW');
      } else if (addModalCategory === 'SKUTM') {
        matchesCat = k.section === 'V' || k.section === 'VII';
      } else if (addModalCategory === 'SKUR') {
        matchesCat = k.section === 'VIII' || k.id.includes('SKUR') || k.id.includes('GUY');
      } else if (addModalCategory === 'GROUNDING') {
        matchesCat = k.section === 'IX' || k.id.includes('GROUNDING') || k.id.includes('ARRESTER');
      } else if (addModalCategory === 'JTR') {
        matchesCat = k.section === 'X' || k.section === 'XI' || k.id.includes('JTR');
      } else if (addModalCategory === 'SKUTR') {
        matchesCat = k.section === 'XI' || k.id.includes('LVTC') || k.id.includes('SKUTR');
      } else if (addModalCategory === 'SR') {
        matchesCat = k.id.includes('SR') || k.id.includes('METER') || k.id.includes('MCB') || k.id.includes('APP');
      }
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        k.id.toLowerCase().includes(q) ||
        k.uraian.toLowerCase().includes(q) ||
        k.section.toLowerCase().includes(q) ||
        k.gol.toLowerCase().includes(q)
      );
    });
  }, [addModalSearch, addModalCategory]);

  useEffect(() => {
    if (
      filteredCatalog.length > 0 &&
      !filteredCatalog.some((p) => p.code === selectedPkgCode)
    ) {
      setSelectedPkgCode(filteredCatalog[0].code);
    }
  }, [filteredCatalog, selectedPkgCode]);

  // Selected Node & Span objects
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );
  const selectedSpan = useMemo(
    () => spans.find((s) => s.id === selectedSpanId) || null,
    [spans, selectedSpanId]
  );

  // Summary KPIs
  const plannedNodeCount = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.kind === 'TIANG_RENCANA' ||
          n.kind === 'GARDU_RENCANA' ||
          n.kind === 'TITIK_APP'
      ).length,
    [nodes]
  );
  const existingNodeCount = useMemo(
    () =>
      nodes.filter(
        (n) => n.kind === 'TIANG_EKSISTING' || n.kind === 'GARDU_TRAFO'
      ).length,
    [nodes]
  );
  const totalPlannedMeters = useMemo(
    () =>
      spans.reduce((acc, s) => {
        const hasPlanned = getEffectiveSpanCables(s).some(
          (c) => c.statusJaringan === 'RENCANA'
        );
        return hasPlanned ? acc + (s.distanceMeters || 0) : acc;
      }, 0),
    [spans]
  );

  const rabSummary = useMemo(
    () => calculateRabSummary(rabItems, ppnPercent),
    [rabItems, ppnPercent]
  );

  const groupedRabSections = useMemo(
    () => groupRabItemsByRomanSection(rabItems),
    [rabItems]
  );

  // Initialize Leaflet Map when on 'map' tab
  useEffect(() => {
    if (viewTab !== 'map' || !mapContainerRef.current) return;
    if (leafletMapRef.current) {
      setTimeout(() => leafletMapRef.current?.invalidateSize(), 80);
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: initialMapCenter,
      zoom: 18,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    const tile = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 20,
        attribution: '© OpenStreetMap • Studio GIS PLN',
      }
    ).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);

    leafletMapRef.current = map;
    tileLayerRef.current = tile;
    overlayGroupRef.current = overlayGroup;

    // Handle map click to place poles or gardu
    map.on('click', (e: L.LeafletMouseEvent) => {
      const st = stateRef.current;
      if (
        st.activeTool !== 'add_pole_planned' &&
        st.activeTool !== 'add_pole_existing' &&
        st.activeTool !== 'add_gardu_planned' &&
        st.activeTool !== 'add_gardu_existing'
      ) {
        return;
      }

      const isGardu =
        st.activeTool === 'add_gardu_planned' ||
        st.activeTool === 'add_gardu_existing';
      const kind: SurveyPoleNode['kind'] =
        st.activeTool === 'add_pole_planned'
          ? 'TIANG_RENCANA'
          : st.activeTool === 'add_pole_existing'
          ? 'TIANG_EKSISTING'
          : st.activeTool === 'add_gardu_planned'
          ? 'GARDU_RENCANA'
          : 'GARDU_TRAFO';

      const idx = st.nodes.length + 1;
      const defaultCode = isGardu
        ? st.nomorGardu || `GD-${String(idx).padStart(2, '0')}`
        : idx === 1 && st.nomorTiang
        ? st.nomorTiang
        : kind === 'TIANG_RENCANA'
        ? `SA4-20/${idx}`
        : `TE-${String(idx).padStart(2, '0')}`;

      // Tiang baru dimasukkan ke canvas dalam keadaan kosong tanpa konstruksi dan kabel bawaan
      const defaultConstructions: SurveyPoleConstructionAssignment[] = [];

      const newNode: SurveyPoleNode = {
        id: `node-${Date.now()}-${idx}`,
        kodeTiang: defaultCode,
        kind,
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
        constructions: defaultConstructions,
      };

      const nextNodes = [...st.nodes, newNode];
      const nextSpans = [...st.spans];

      commitGraphUpdate(nextNodes, nextSpans, true);
      setSelectedNodeId(newNode.id);
      setSelectedSpanId(null);
      setShowInspector(true);
    });

    return () => {
      map.remove();
      leafletMapRef.current = null;
      tileLayerRef.current = null;
      overlayGroupRef.current = null;
    };
  }, [viewTab]);

  // Switch Street / Satellite tile layer
  useEffect(() => {
    if (!tileLayerRef.current) return;
    if (tileLayerMode === 'satellite') {
      tileLayerRef.current.setUrl(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      );
    } else {
      tileLayerRef.current.setUrl(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      );
    }
  }, [tileLayerMode]);

  // Invalidate map size when fullscreen toggles
  useEffect(() => {
    if (leafletMapRef.current) {
      setTimeout(() => leafletMapRef.current?.invalidateSize(), 120);
    }
  }, [isFullscreen]);

  // Render Nodes, Spans, Phase Ticks, Callout Boxes, and Bongkar X on Leaflet Map
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = overlayGroupRef.current;
    if (!map || !group || viewTab !== 'map') return;

    group.clearLayers();

    // 1. Render Spans & Multi-Cables
    spans.forEach((span) => {
      const fromNode = nodes.find((n) => n.id === span.fromNodeId);
      const toNode = nodes.find((n) => n.id === span.toNodeId);
      if (!fromNode || !toNode) return;

      const cables = getEffectiveSpanCables(span);
      const isSelected = span.id === selectedSpanId;

      cables.forEach((cable, cIdx) => {
        const [fromCoord, toCoord] = calculateOffsetLineCoords(
          fromNode.lat,
          fromNode.lng,
          toNode.lat,
          toNode.lng,
          cIdx,
          cables.length
        );
        const vis = getCableVisualStyle(
          cable.jenisJaringan,
          cable.statusJaringan
        );
        const cableBongkar = isCableMarkedBongkar(cable, span);

        const poly = L.polyline([fromCoord, toCoord], {
          color: cableBongkar ? '#dc2626' : vis.strokeColor,
          weight: isSelected ? vis.weight + 2 : vis.weight,
          dashArray: cableBongkar ? '6, 4' : vis.dashArray,
          opacity: 0.95,
        }).addTo(group);

        poly.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          const st = stateRef.current;
          if (st.activeTool === 'delete') {
            commitGraphUpdate(
              st.nodes,
              st.spans.filter((s) => s.id !== span.id),
              true
            );
            if (st.selectedSpanId === span.id) setSelectedSpanId(null);
            return;
          }
          if (st.activeTool === 'bongkar') {
            const nextBongkar = !isSpanMarkedBongkar(span);
            const nextSpans = st.spans.map((s) =>
              s.id === span.id
                ? {
                    ...s,
                    isBongkar: nextBongkar,
                    actionType: nextBongkar
                      ? ('BONGKAR' as const)
                      : ('PASANG' as const),
                    cables: getEffectiveSpanCables(s).map((c) => ({
                      ...c,
                      isBongkar: nextBongkar,
                      actionType: nextBongkar
                        ? ('BONGKAR' as const)
                        : ('PASANG' as const),
                    })),
                  }
                : s
            );
            commitGraphUpdate(st.nodes, nextSpans, true);
            return;
          }
          setSelectedSpanId(span.id);
          setSelectedNodeId(null);
          setShowInspector(true);
        });

        // Phase slash tick (/ or ///) along the cable
        const tickRatio = getStaggeredPhaseTickRatio(cIdx, cables.length);
        const tickLat =
          fromCoord[0] + (toCoord[0] - fromCoord[0]) * tickRatio;
        const tickLng =
          fromCoord[1] + (toCoord[1] - fromCoord[1]) * tickRatio;
        const angleDeg = getCableScreenAngleDeg(
          fromCoord[0],
          fromCoord[1],
          toCoord[0],
          toCoord[1]
        );
        const phaseCount = inferPhaseCountFromConductor(
          cable.conductorType,
          cable.phaseCount
        );

        const slashSvg = buildPhaseSlashSvg(
          phaseCount,
          cableBongkar ? '#dc2626' : vis.strokeColor,
          angleDeg
        );
        L.marker([tickLat, tickLng], {
          interactive: false,
          icon: L.divIcon({
            className: 'pln-phase-tick-icon',
            html: slashSvg,
            iconSize: [28, 24],
            iconAnchor: [14, 12],
          }),
        }).addTo(group);

        // Red X symbol on cable if marked Bongkar
        if (cableBongkar) {
          const xLat = fromCoord[0] + (toCoord[0] - fromCoord[0]) * 0.64;
          const xLng = fromCoord[1] + (toCoord[1] - fromCoord[1]) * 0.64;
          L.marker([xLat, xLng], {
            interactive: false,
            icon: L.divIcon({
              className: 'pln-bongkar-x-cable',
              html: buildBongkarXSvg(22),
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            }),
          }).addTo(group);
        }
      });

      // Span Midpoint Label Pill
      const midLat = (fromNode.lat + toNode.lat) / 2;
      const midLng = (fromNode.lng + toNode.lng) / 2;
      const primaryCable = cables[0];
      const vis = getCableVisualStyle(
        primaryCable.jenisJaringan,
        primaryCable.statusJaringan
      );
      const spanBongkar = isSpanMarkedBongkar(span);
      const phaseSlash = getPhaseSlashSymbol(
        inferPhaseCountFromConductor(
          primaryCable.conductorType,
          primaryCable.phaseCount
        )
      );

      const badgeHtml = `
        <div style="display:inline-flex;align-items:center;background:${
          isSelected ? '#1e1b4b' : 'rgba(255,255,255,0.96)'
        };color:${isSelected ? '#ffffff' : spanBongkar ? '#dc2626' : '#0f172a'};border:1.5px solid ${
        spanBongkar ? '#dc2626' : vis.strokeColor
      };border-radius:999px;padding:1px 6px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 1px 4px rgba(15,23,42,0.18);">
          <span>${span.distanceMeters}m${spanBongkar ? ' (BKR)' : ''}</span>
        </div>
      `;

      const midMarker = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'pln-span-mid-badge',
          html: badgeHtml,
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        }),
      }).addTo(group);

      midMarker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        const st = stateRef.current;
        if (st.activeTool === 'bongkar') {
          const nextBongkar = !isSpanMarkedBongkar(span);
          const nextSpans = st.spans.map((s) =>
            s.id === span.id
              ? {
                  ...s,
                  isBongkar: nextBongkar,
                  actionType: nextBongkar
                    ? ('BONGKAR' as const)
                    : ('PASANG' as const),
                  cables: getEffectiveSpanCables(s).map((c) => ({
                    ...c,
                    isBongkar: nextBongkar,
                    actionType: nextBongkar
                      ? ('BONGKAR' as const)
                      : ('PASANG' as const),
                  })),
                }
              : s
          );
          commitGraphUpdate(st.nodes, nextSpans, true);
          return;
        }
        if (st.activeTool === 'delete') {
          commitGraphUpdate(
            st.nodes,
            st.spans.filter((s) => s.id !== span.id),
            true
          );
          return;
        }
        setSelectedSpanId(span.id);
        setSelectedNodeId(null);
        setShowInspector(true);
      });
    });

    // 2. Render Nodes (Poles / Gardu) & Draggable Callout Boxes
    nodes.forEach((node, idx) => {
      const isPlanned =
        node.kind === 'TIANG_RENCANA' ||
        node.kind === 'GARDU_RENCANA' ||
        node.kind === 'TITIK_APP';
      const isGardu =
        node.kind === 'GARDU_RENCANA' || node.kind === 'GARDU_TRAFO';
      const isSelected = node.id === selectedNodeId;
      const isCableStart = node.id === cableStartNodeId;
      const nodeBongkar = isNodeMarkedBongkar(node);

      const mainColor = isPlanned ? '#dc2626' : '#0f172a';
      const ringColor = isCableStart
        ? '#f59e0b'
        : isSelected
        ? '#4f46e5'
        : '#ffffff';

      // Pole / Gardu SVG marker
      const markerSvg = isGardu
        ? `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
            <svg width="26" height="26" viewBox="0 0 26 26">
              <polygon points="13,2 24,22 2,22" fill="${mainColor}" stroke="${ringColor}" stroke-width="${
            isSelected ? 3 : 2
          }" />
            </svg>
            ${
              nodeBongkar
                ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">${buildBongkarXSvg(
                    24
                  )}</div>`
                : ''
            }
          </div>`
        : `<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
            <div style="width:16px;height:16px;border-radius:999px;background:${mainColor};border:${
            isSelected || isCableStart ? '3px' : '2px'
          } solid ${ringColor};box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
            ${
              nodeBongkar
                ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">${buildBongkarXSvg(
                    22
                  )}</div>`
                : ''
            }
          </div>`;

      const poleMarker = L.marker([node.lat, node.lng], {
        draggable: true,
        icon: L.divIcon({
          className: 'pln-pole-node-marker',
          html: markerSvg,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(group);

      poleMarker.on('dragend', () => {
        const pos = poleMarker.getLatLng();
        const st = stateRef.current;
        const nextNodes = st.nodes.map((n) =>
          n.id === node.id
            ? {
                ...n,
                lat: Number(pos.lat.toFixed(6)),
                lng: Number(pos.lng.toFixed(6)),
              }
            : n
        );
        const nextSpans = st.spans.map((s) => {
          if (s.fromNodeId === node.id || s.toNodeId === node.id) {
            const fn = nextNodes.find((n) => n.id === s.fromNodeId);
            const tn = nextNodes.find((n) => n.id === s.toNodeId);
            if (fn && tn) {
              return {
                ...s,
                distanceMeters: Math.max(
                  5,
                  calculateGeodesicDistanceMeters(fn.lat, fn.lng, tn.lat, tn.lng)
                ),
              };
            }
          }
          return s;
        });
        commitGraphUpdate(nextNodes, nextSpans, true);
      });

      poleMarker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        const st = stateRef.current;

        if (st.activeTool === 'delete') {
          const nextNodes = st.nodes.filter((n) => n.id !== node.id);
          const nextSpans = st.spans.filter(
            (s) => s.fromNodeId !== node.id && s.toNodeId !== node.id
          );
          commitGraphUpdate(nextNodes, nextSpans, true);
          if (st.selectedNodeId === node.id) setSelectedNodeId(null);
          return;
        }

        if (st.activeTool === 'bongkar') {
          const nextBongkar = !isNodeMarkedBongkar(node);
          const nextNodes = st.nodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  isBongkar: nextBongkar,
                  constructions: n.constructions.map((c) => ({
                    ...c,
                    actionType: nextBongkar
                      ? ('BONGKAR' as const)
                      : ('PASANG' as const),
                  })),
                }
              : n
          );
          commitGraphUpdate(nextNodes, st.spans, true);
          return;
        }

        if (st.activeTool === 'add_cable') {
          if (!st.cableStartNodeId) {
            setCableStartNodeId(node.id);
            setSelectedNodeId(node.id);
            return;
          }
          if (st.cableStartNodeId !== node.id) {
            const startNode = st.nodes.find(
              (n) => n.id === st.cableStartNodeId
            );
            if (startNode) {
              const jenisJaringan = inferNetworkCategoryFromConductor(
                st.selectedConductorType
              );
              const newCable: SpanCableItem = {
                id: `cab-${Date.now()}`,
                statusJaringan: st.selectedStatusJaringan,
                jenisJaringan,
                conductorType: st.selectedConductorType,
                phaseCount: st.selectedPhaseCount,
                circuitCount: 1,
                actionType: 'PASANG',
              };

              const existingSpan = st.spans.find(
                (s) =>
                  (s.fromNodeId === startNode.id && s.toNodeId === node.id) ||
                  (s.fromNodeId === node.id && s.toNodeId === startNode.id)
              );

              if (existingSpan) {
                const nextSpans = st.spans.map((s) =>
                  s.id === existingSpan.id
                    ? {
                        ...s,
                        cables: [...getEffectiveSpanCables(s), newCable],
                      }
                    : s
                );
                commitGraphUpdate(st.nodes, nextSpans, true);
                setSelectedSpanId(existingSpan.id);
              } else {
                const dist = calculateGeodesicDistanceMeters(
                  startNode.lat,
                  startNode.lng,
                  node.lat,
                  node.lng
                );
                const newSpan: SurveySpanEdge = {
                  id: `span-${Date.now()}`,
                  fromNodeId: startNode.id,
                  toNodeId: node.id,
                  statusJaringan: st.selectedStatusJaringan,
                  jenisJaringan,
                  conductorType: st.selectedConductorType,
                  phaseCount: st.selectedPhaseCount,
                  distanceMeters: Math.max(5, dist),
                  cables: [newCable],
                };
                commitGraphUpdate(st.nodes, [...st.spans, newSpan], true);
                setSelectedSpanId(newSpan.id);
              }
            }
          }
          setCableStartNodeId(null);
          return;
        }

        setSelectedNodeId(node.id);
        setSelectedSpanId(null);
        setShowInspector(true);
      });

      // Callout Box with leader line
      const autoOffset = calculatePoleCalloutOffset(node, nodes, spans, idx);
      const customOffset = customCalloutOffsets[node.id];
      const dx = customOffset?.dx ?? autoOffset.dx;
      const dy = customOffset?.dy ?? autoOffset.dy;
      const calloutLat = node.lat - dy * 0.0000045;
      const calloutLng = node.lng + dx * 0.0000055;

      L.polyline(
        [
          [node.lat, node.lng],
          [calloutLat, calloutLng],
        ],
        {
          color: isPlanned ? '#dc2626' : '#334155',
          weight: 1.4,
          dashArray: '3, 3',
          opacity: 0.85,
        }
      ).addTo(group);

      const lines = formatPoleCalloutLines(node);
      const visibleLines = calloutCompactMode ? lines.slice(0, 2) : lines;

      const calloutHtml = `
        <div style="background:rgba(255,255,255,0.96);border:1.5px solid ${
          isSelected ? '#4f46e5' : isPlanned ? '#dc2626' : '#1e293b'
        };border-radius:6px;padding:3px 7px;min-width:86px;box-shadow:0 3px 8px rgba(15,23,42,0.18);font-family:ui-monospace,monospace;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;border-bottom:1px solid #e2e8f0;padding-bottom:2px;margin-bottom:2px;">
            <span style="font-size:10px;font-weight:800;color:${
              isPlanned ? '#dc2626' : '#0f172a'
            };">${node.kodeTiang}</span>
            ${
              nodeBongkar
                ? `<span style="background:#dc2626;color:#fff;font-size:8px;font-weight:800;padding:0 3px;border-radius:3px;">✕ BKR</span>`
                : ''
            }
          </div>
          ${visibleLines
            .map(
              (l) =>
                `<div style="font-size:9.5px;font-weight:700;color:#1e293b;line-height:1.25;white-space:nowrap;">${l}</div>`
            )
            .join('')}
        </div>
      `;

      const calloutMarker = L.marker([calloutLat, calloutLng], {
        draggable: true,
        icon: L.divIcon({
          className: 'pln-pole-callout-box',
          html: calloutHtml,
          iconSize: [96, 46],
          iconAnchor: [48, 23],
        }),
      }).addTo(group);

      calloutMarker.on('dragend', () => {
        const pos = calloutMarker.getLatLng();
        const newDy = Math.round((node.lat - pos.lat) / 0.0000045);
        const newDx = Math.round((pos.lng - node.lng) / 0.0000055);
        setCustomCalloutOffsets((prev) => ({
          ...prev,
          [node.id]: { dx: newDx, dy: newDy },
        }));
      });

      calloutMarker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        setSelectedNodeId(node.id);
        setSelectedSpanId(null);
        setShowInspector(true);
      });
    });
  }, [
    nodes,
    spans,
    selectedNodeId,
    selectedSpanId,
    cableStartNodeId,
    calloutCompactMode,
    customCalloutOffsets,
    viewTab,
  ]);

  // Quick Action: +Tiang 40m
  const handleQuickAddPole40m = () => {
    const refNode =
      nodes.find((n) => n.id === selectedNodeId) ||
      nodes[nodes.length - 1] ||
      null;
    const baseLat = refNode ? refNode.lat : initialMapCenter[0];
    const baseLng = refNode ? refNode.lng + 0.00036 : initialMapCenter[1];
    const idx = nodes.length + 1;

    const newNode: SurveyPoleNode = {
      id: `node-${Date.now()}-${idx}`,
      kodeTiang: `SA4-20/${idx}`,
      kind: polePlacementKind,
      lat: Number(baseLat.toFixed(6)),
      lng: Number(baseLng.toFixed(6)),
      constructions: [], // Tiang baru kosong tanpa konstruksi dan kabel
    };

    const nextNodes = [...nodes, newNode];
    const nextSpans = [...spans];

    commitGraphUpdate(nextNodes, nextSpans, true);
    setSelectedNodeId(newNode.id);
    setSelectedSpanId(null);
    setShowInspector(true);
    if (leafletMapRef.current) {
      leafletMapRef.current.panTo([newNode.lat, newNode.lng]);
    }
  };

  // Load Preset: SMP N 3 Pabelan
  const handleLoadPresetSmpn3Pabelan = () => {
    const presetNodes: SurveyPoleNode[] = JSON.parse(
      JSON.stringify(PRESET_SMPN3_PABELAN_NODES)
    );
    const presetSpans: SurveySpanEdge[] = JSON.parse(
      JSON.stringify(PRESET_SMPN3_PABELAN_SPANS)
    );
    commitGraphUpdate(presetNodes, presetSpans, true);
    setSelectedNodeId(presetNodes[0]?.id || null);
    setSelectedSpanId(null);
    if (leafletMapRef.current && presetNodes[0]) {
      leafletMapRef.current.setView(
        [presetNodes[0].lat, presetNodes[0].lng],
        18
      );
    }
    setStatusToast(
      'Contoh Survei SMP N 3 Pabelan berhasil dimuat ke Peta & RAB.'
    );
    setTimeout(() => setStatusToast(null), 3500);
  };

  // Reset Canvas
  const handleResetCanvas = () => {
    commitGraphUpdate([], [], true);
    setSelectedNodeId(null);
    setSelectedSpanId(null);
    setCableStartNodeId(null);
  };

  // Generate & Save RAB + Gambar Sketsa to Parent Modal & App State (without closing modal)
  const handleGenerateAndApplyRab = (forceRegenerateFromMap = false) => {
    const finalRabItems =
      (forceRegenerateFromMap || rabItems.length === 0) &&
      (nodes.length > 0 || spans.length > 0)
        ? generateRabItemsFromSurvey({
            nodes,
            spans,
            includePembetonanTiang,
            transportasiRit,
          })
        : rabItems;

    if (finalRabItems !== rabItems) {
      setRabItems(finalRabItems);
    }
    const summary = calculateRabSummary(finalRabItems, ppnPercent);
    const nowIso = new Date().toISOString();

    const design: SurveyRabDesign = {
      judulGambar,
      lokasiPekerjaan,
      rayonUlp: 'UP3 MAGELANG',
      unitUlp: 'BOROBUDUR',
      rabHeader: {
        pekerjaan: judulGambar,
        lokasi: lokasiPekerjaan,
        pelaksana: pelaksanaPekerjaan,
        anggaran: jenisAnggaran,
        nomorPrk,
      },
      digambarOleh: petugasSurvei || 'TIM SURVEI TEKNIK',
      direncanakanOleh: petugasSurvei || 'TIM SURVEI TEKNIK',
      diperiksaOleh: 'TL TEKNIK',
      disetujuiOleh: 'MANAJER',
      nodes,
      spans,
      rabItems: finalRabItems,
      ppnPercent,
      includePembetonanTiang,
      transportasiRit,
      legendPos,
      mapBackgroundMode,
      mapBackgroundOpacity,
      mapZoomOffset,
      customCalloutOffsets,
      suratPermohonanPages: attachedSuratPages,
      updatedAt: nowIso,
    };

    const summaryNotes = `Survei GIS: ${plannedNodeCount} Tiang Rencana, ${existingNodeCount} Eksisting, Tarikan ${totalPlannedMeters}m. Total RAB (+PPN ${ppnPercent}%): Rp ${summary.grandTotal.toLocaleString(
      'id-ID'
    )}`;

    onApplyRabDesign(design, summary.grandTotal, summaryNotes);
    onDirectSave?.(design, summary.grandTotal, summaryNotes);
    setLastSavedAt(new Date(nowIso).toLocaleTimeString('id-ID'));
    setStatusToast(
      `✓ Gambar Sketsa (${nodes.length} Titik) & RAB (${
        finalRabItems.length
      } baris, Rp ${summary.grandTotal.toLocaleString(
        'id-ID'
      )}) berhasil disimpan & tetap tampil di aplikasi!`
    );
    setTimeout(() => setStatusToast(null), 5000);
  };

  // Node Construction Inspector Handlers
  const handleAddConstructionToNode = () => {
    if (!selectedNode || !selectedPkgCode) return;
    const nextNodes = nodes.map((n) =>
      n.id === selectedNode.id
        ? {
            ...n,
            constructions: [
              ...n.constructions,
              {
                code: selectedPkgCode,
                qty: Math.max(1, newAssignmentQty),
                actionType: newAssignmentAction,
              },
            ],
          }
        : n
    );
    commitGraphUpdate(nextNodes, spans, true);
  };

  const handleUpdateConstructionAssignment = (
    idx: number,
    patch: Partial<SurveyPoleConstructionAssignment>
  ) => {
    if (!selectedNode) return;
    const nextNodes = nodes.map((n) => {
      if (n.id !== selectedNode.id) return n;
      const nextConstructions = n.constructions.map((c, i) =>
        i === idx ? { ...c, ...patch } : c
      );
      return { ...n, constructions: nextConstructions };
    });
    commitGraphUpdate(nextNodes, spans, true);
  };

  const handleRemoveConstructionFromNode = (idx: number) => {
    if (!selectedNode) return;
    const nextNodes = nodes.map((n) =>
      n.id === selectedNode.id
        ? {
            ...n,
            constructions: n.constructions.filter((_, i) => i !== idx),
          }
        : n
    );
    commitGraphUpdate(nextNodes, spans, true);
  };

  const handleToggleNodeBongkar = (node: SurveyPoleNode) => {
    const nextBongkar = !isNodeMarkedBongkar(node);
    const nextNodes = nodes.map((n) =>
      n.id === node.id
        ? {
            ...n,
            isBongkar: nextBongkar,
            constructions: n.constructions.map((c) => ({
              ...c,
              actionType: nextBongkar
                ? ('BONGKAR' as const)
                : ('PASANG' as const),
            })),
          }
        : n
    );
    commitGraphUpdate(nextNodes, spans, true);
  };

  // Ubah kuantitas material komponen individual per set pada titik konstruksi di canvas
  const handleUpdateComponentQtyOnNode = (
    assignmentIdx: number,
    khsId: string,
    newUnitQty: number
  ) => {
    if (!selectedNode) return;
    const nextNodes = nodes.map((n) => {
      if (n.id !== selectedNode.id) return n;
      const nextConstructions = n.constructions.map((c, i) => {
        if (i !== assignmentIdx) return c;
        const nextCustom = { ...(c.customComponentQty || {}) };
        if (newUnitQty <= 0) {
          delete nextCustom[khsId];
        } else {
          nextCustom[khsId] = newUnitQty;
        }
        return { ...c, customComponentQty: nextCustom };
      });
      return { ...n, constructions: nextConstructions };
    });
    commitGraphUpdate(nextNodes, spans, true);
  };

  // Toggle aktif / non-aktif komponen material individual pada titik konstruksi di canvas
  const handleToggleComponentOnNode = (
    assignmentIdx: number,
    khsId: string
  ) => {
    if (!selectedNode) return;
    const nextNodes = nodes.map((n) => {
      if (n.id !== selectedNode.id) return n;
      const nextConstructions = n.constructions.map((c, i) => {
        if (i !== assignmentIdx) return c;
        const prevDisabled = new Set(c.disabledKhsIds || []);
        if (prevDisabled.has(khsId)) {
          prevDisabled.delete(khsId);
        } else {
          prevDisabled.add(khsId);
        }
        return { ...c, disabledKhsIds: Array.from(prevDisabled) };
      });
      return { ...n, constructions: nextConstructions };
    });
    commitGraphUpdate(nextNodes, spans, true);
  };

  // Tambah Paket Konstruksi Standar Langsung ke Tabel RAB (beserta seluruh rincian material dikalikan)
  const handleAddPackageToRab = (pkgCode: string, qty: number) => {
    const pkg = CONSTRUCTION_PACKAGES_CATALOG.find(
      (p) => p.code.toUpperCase() === pkgCode.toUpperCase()
    );
    if (!pkg) return;
    const safeQty = Math.max(1, Number(qty) || 1);
    const targetSec = getRomanSectionForPackage(pkg.code, pkg.category);
    const headerId = `custom-pkg-header-${targetSec}-${pkg.code}-${Date.now()}`;

    const headerItem: RabLineItem = {
      id: headerId,
      section: targetSec,
      uraian: pkg.code,
      gol: 'HDW',
      satuan: 'Unit',
      volume: safeQty,
      hargaSatuan: 0,
      isPackageHeader: true,
      parentPackageCode: pkg.code,
      sourceInfo: `Tambah Manual (${safeQty} Unit)`,
    };

    const childItems: RabLineItem[] = pkg.components.map((comp, idx) => {
      const khs = KHS_MASTER_CATALOG[comp.khsId];
      const vol = Math.round(comp.qty * safeQty * 100) / 100;
      return {
        id: `custom-pkg-item-${targetSec}-${pkg.code}-${comp.khsId}-${Date.now()}-${idx}`,
        section: targetSec,
        uraian: khs?.uraian || comp.khsId,
        gol: khs?.gol || 'HDW',
        satuan: khs?.satuan || 'Bh',
        volume: vol,
        hargaSatuan: khs?.hargaSatuan || 0,
        khsId: comp.khsId,
        itemNo: idx + 1,
        parentPackageCode: pkg.code,
        parentHeaderId: headerId,
        unitQtyPerPackage: comp.qty,
        sourceInfo: `${pkg.code} (${safeQty} Unit)`,
      };
    });

    setRabItems((prev) => [...prev, headerItem, ...childItems]);
    setStatusToast(
      `✓ Paket ${pkg.code} (${safeQty} Set) beserta ${childItems.length} detail material berhasil ditambahkan ke RAB!`
    );
    setTimeout(() => setStatusToast(null), 4000);
    setShowAddRabModal(false);
  };

  // Tambah Material Satuan atau Jasa Pembongkaran Langsung ke Tabel RAB (Seksi XV atau lainnya)
  const handleAddKhsItemToRab = (
    khsId: string,
    volume: number,
    targetSectionOverride?: RabRomanSection
  ) => {
    const khs = KHS_MASTER_CATALOG[khsId];
    if (!khs) return;
    const safeVol = Math.max(0.1, Number(volume) || 1);
    const effectiveSection: RabRomanSection =
      targetSectionOverride ||
      khs.section ||
      (khsId.startsWith('JASA_BONGKAR') ? 'XV' : 'X');

    const newItem: RabLineItem = {
      id: `custom-khs-${khs.id}-${Date.now()}`,
      section: effectiveSection,
      uraian: khs.uraian,
      gol: khs.gol,
      satuan: khs.satuan,
      volume: safeVol,
      hargaSatuan: khs.hargaSatuan,
      khsId: khs.id,
      sourceInfo:
        effectiveSection === 'XV' ? 'Pekerjaan Pembongkaran' : 'Item Tambahan',
    };

    setRabItems((prev) => [...prev, newItem]);
    setStatusToast(
      `✓ ${khs.uraian} (${safeVol} ${khs.satuan}) berhasil ditambahkan ke Seksi ${effectiveSection}!`
    );
    setTimeout(() => setStatusToast(null), 4000);
    setShowAddRabModal(false);
  };

  // Project lat/lng to SVG canvas coordinates for Tab 2 & Tab 4 Etiket
  const etiketWidth = 920;
  const etiketHeight = 460;

  // Real Web Mercator Projection & Map Tile Calculator (matching real OSM / ESRI / CartoDB maps)
  const mercatorInfo = useMemo(() => {
    const fallbackCoord = parseCoordinate(tagingLokasi) || {
      lat: -7.6079,
      lng: 110.2038,
    };

    const lats = nodes.length > 0 ? nodes.map((n) => n.lat) : [fallbackCoord.lat];
    const lngs = nodes.length > 0 ? nodes.map((n) => n.lng) : [fallbackCoord.lng];
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const latSpan = Math.max(maxLat - minLat, 0.0001);
    const lngSpan = Math.max(maxLng - minLng, 0.0001);

    // Auto-select optimal zoom level so poles span roughly 50-70% of canvas
    let autoZoom = 18;
    for (let z = 19; z >= 14; z--) {
      const pxX = (lngSpan / 360) * 256 * Math.pow(2, z);
      const rad1 = (minLat * Math.PI) / 180;
      const rad2 = (maxLat * Math.PI) / 180;
      const py1 =
        (0.5 -
          Math.log((1 + Math.sin(rad1)) / (1 - Math.sin(rad1))) /
            (4 * Math.PI)) *
        256 *
        Math.pow(2, z);
      const py2 =
        (0.5 -
          Math.log((1 + Math.sin(rad2)) / (1 - Math.sin(rad2))) /
            (4 * Math.PI)) *
        256 *
        Math.pow(2, z);
      const pxY = Math.abs(py2 - py1);
      if (pxX <= etiketWidth - 260 && pxY <= etiketHeight - 160) {
        autoZoom = z;
        break;
      }
    }

    const finalZoom = Math.max(14, Math.min(19, autoZoom + mapZoomOffset));

    const centerWorldX =
      ((centerLng + 180) / 360) * 256 * Math.pow(2, finalZoom);
    const sinLat = Math.sin((centerLat * Math.PI) / 180);
    const clampedCenterSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
    const centerWorldY =
      (0.5 -
        Math.log((1 + clampedCenterSin) / (1 - clampedCenterSin)) /
          (4 * Math.PI)) *
      256 *
      Math.pow(2, finalZoom);

    // Tiles covering the 920 x 460 viewBox
    const leftWorldX = centerWorldX - etiketWidth / 2;
    const topWorldY = centerWorldY - etiketHeight / 2;

    const minTileX = Math.floor(leftWorldX / 256);
    const maxTileX = Math.floor((centerWorldX + etiketWidth / 2) / 256);
    const minTileY = Math.floor(topWorldY / 256);
    const maxTileY = Math.floor((centerWorldY + etiketHeight / 2) / 256);

    const tiles: Array<{
      key: string;
      url: string;
      x: number;
      y: number;
    }> = [];

    if (mapBackgroundMode !== 'off') {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          let url = '';
          if (mapBackgroundMode === 'osm') {
            url = `https://tile.openstreetmap.org/${finalZoom}/${tx}/${ty}.png`;
          } else if (mapBackgroundMode === 'voyager') {
            url = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${finalZoom}/${tx}/${ty}.png`;
          } else if (mapBackgroundMode === 'satellite') {
            url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${finalZoom}/${ty}/${tx}`;
          }
          tiles.push({
            key: `tile-${finalZoom}-${tx}-${ty}`,
            url,
            x: Math.round(tx * 256 - leftWorldX),
            y: Math.round(ty * 256 - topWorldY),
          });
        }
      }
    }

    return {
      centerLat,
      centerLng,
      zoom: finalZoom,
      centerWorldX,
      centerWorldY,
      tiles,
    };
  }, [nodes, tagingLokasi, mapBackgroundMode, mapZoomOffset]);

  const projectedNodes = useMemo(() => {
    if (nodes.length === 0) return [];
    const { centerWorldX, centerWorldY, zoom } = mercatorInfo;

    return nodes.map((n) => {
      const worldX = ((n.lng + 180) / 360) * 256 * Math.pow(2, zoom);
      const sinLat = Math.sin((n.lat * Math.PI) / 180);
      const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
      const worldY =
        (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) *
        256 *
        Math.pow(2, zoom);

      const x = Math.round(etiketWidth / 2 + (worldX - centerWorldX));
      const y = Math.round(etiketHeight / 2 + (worldY - centerWorldY));

      return {
        id: n.id,
        kodeTiang: n.kodeTiang,
        kind: n.kind,
        node: n,
        x,
        y,
        lines: formatPoleCalloutLines(n),
      };
    });
  }, [nodes, mercatorInfo]);

  const projectedSpans = useMemo(() => {
    return spans
      .map((sp) => {
        const pFrom = projectedNodes.find((p) => p.id === sp.fromNodeId);
        const pTo = projectedNodes.find((p) => p.id === sp.toNodeId);
        if (!pFrom || !pTo) return null;
        // Legenda/label pada kabel hanya menuliskan panjangnya saja
        const badgeText = `${sp.distanceMeters}m`;
        return {
          id: sp.id,
          x1: pFrom.x,
          y1: pFrom.y,
          x2: pTo.x,
          y2: pTo.y,
          badgeText,
          badgeW: Math.max(30, badgeText.length * 6.5),
          badgeH: 15,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [spans, projectedNodes]);

  // Calculate cable lengths for the Legend box (tuliskan saja panjangnya)
  const cableLegendLengths = useMemo(() => {
    let jtmMeters = 0;
    let jtrMeters = 0;
    let jtrPlannedMeters = 0;
    let srMeters = 0;
    let totalMeters = 0;
    let plannedMeters = 0;
    spans.forEach((sp) => {
      const dist = Number(sp.distanceMeters) || 0;
      totalMeters += dist;
      const cables = getEffectiveSpanCables(sp);
      cables.forEach((c) => {
        const cDist = dist * (c.circuitCount || 1);
        if (c.statusJaringan === 'RENCANA') {
          plannedMeters += cDist;
        }
        if (c.jenisJaringan === 'JTM') jtmMeters += cDist;
        else if (c.jenisJaringan === 'JTR') {
          jtrMeters += cDist;
          if (c.statusJaringan === 'RENCANA') jtrPlannedMeters += cDist;
        } else if (c.jenisJaringan === 'SR') srMeters += cDist;
      });
    });
    const spanDistances = spans.map((s) => `${s.distanceMeters}m`).join(', ');
    return {
      jtmMeters,
      jtrMeters,
      jtrPlannedMeters,
      srMeters,
      totalMeters,
      plannedMeters: plannedMeters > 0 ? plannedMeters : totalMeters,
      spanDistances: spanDistances || '0m',
    };
  }, [spans]);

  const etiketLayout = useMemo(
    () =>
      computeEtiketCalloutLayout({
        nodes: projectedNodes,
        spans: projectedSpans,
        defaultMainRoadCenter: { x: etiketWidth / 2, y: etiketHeight / 2 + 44 },
        defaultSimpangRoadCenter: { x: 185, y: etiketHeight - 40 },
        showRoadSketch: false, // Uses real maps background
      }),
    [projectedNodes, projectedSpans]
  );

  // Pointer-event drag handlers for the Draggable Legend & Callouts in SVG
  const handleLegendPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    legendDragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: legendPos.x,
      startY: legendPos.y,
    };
    setIsDraggingLegend(true);
  };

  const handleCalloutPointerDown = (
    e: React.PointerEvent<SVGGElement>,
    nodeId: string
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const existing = customCalloutOffsets[nodeId] || { dx: 0, dy: 0 };
    calloutDragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startDx: existing.dx,
      startDy: existing.dy,
    };
    setDraggingCalloutNodeId(nodeId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    if (!isDraggingLegend && !draggingCalloutNodeId) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = etiketWidth / (rect.width || 1);
    const scaleY = etiketHeight / (rect.height || 1);

    if (isDraggingLegend) {
      const dx = (e.clientX - legendDragStart.current.mouseX) * scaleX;
      const dy = (e.clientY - legendDragStart.current.mouseY) * scaleY;
      const nextX = Math.max(
        6,
        Math.min(etiketWidth - 220, legendDragStart.current.startX + dx)
      );
      const nextY = Math.max(
        6,
        Math.min(etiketHeight - 160, legendDragStart.current.startY + dy)
      );
      setLegendPos({ x: Math.round(nextX), y: Math.round(nextY) });
    } else if (draggingCalloutNodeId) {
      const dx = (e.clientX - calloutDragStart.current.mouseX) * scaleX;
      const dy = (e.clientY - calloutDragStart.current.mouseY) * scaleY;
      setCustomCalloutOffsets((prev) => ({
        ...prev,
        [draggingCalloutNodeId]: {
          dx: Math.round(calloutDragStart.current.startDx + dx),
          dy: Math.round(calloutDragStart.current.startDy + dy),
        },
      }));
    }
  };

  const handleSvgPointerUp = () => {
    if (isDraggingLegend) {
      setIsDraggingLegend(false);
    }
    if (draggingCalloutNodeId) {
      setDraggingCalloutNodeId(null);
    }
  };

  // Render SVG Etiket Drawing (shared between Tab 2 and Tab 4)
  const renderEtiketEngineeringSvg = () => {
    return (
      <div className="border-2 border-slate-900 bg-white text-slate-900 shadow-sm overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${etiketWidth} ${etiketHeight}`}
          className="w-full h-auto block bg-slate-100 select-none touch-none"
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
        >
          <defs>
            <pattern
              id="pln-cad-grid"
              width="30"
              height="30"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 30 0 L 0 0 0 30"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="0.8"
              />
            </pattern>
          </defs>

          {/* Real Map Tiles Layer (OpenStreetMap / CartoDB / ESRI Satellite) */}
          {mapBackgroundMode !== 'off' && mercatorInfo.tiles.length > 0 && (
            <g id="svg-map-tiles" opacity={mapBackgroundOpacity}>
              {mercatorInfo.tiles.map((tile) => (
                <image
                  key={tile.key}
                  href={tile.url}
                  x={tile.x}
                  y={tile.y}
                  width="256"
                  height="256"
                  preserveAspectRatio="none"
                />
              ))}
            </g>
          )}

          {/* Subtle grid overlay */}
          <rect
            width={etiketWidth}
            height={etiketHeight}
            fill="url(#pln-cad-grid)"
            opacity={mapBackgroundMode !== 'off' ? 0.15 : 1}
          />

          {/* Compass North Arrow (U) */}
          <g transform="translate(55, 55)">
            <circle
              cx="0"
              cy="0"
              r="20"
              fill="#ffffff"
              fillOpacity="0.92"
              stroke="#0f172a"
              strokeWidth="1.5"
            />
            <polygon points="0,-16 -6,8 0,3 6,8" fill="#0f172a" />
            <text
              x="0"
              y="-23"
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fill="#0f172a"
            >
              U
            </text>
          </g>

          {projectedNodes.length === 0 && (
            <g>
              <rect
                x={etiketWidth / 2 - 260}
                y={etiketHeight / 2 - 26}
                width="520"
                height="52"
                rx="8"
                fill="#ffffff"
                fillOpacity="0.92"
                stroke="#0f172a"
                strokeWidth="1.2"
              />
              <text
                x={etiketWidth / 2}
                y={etiketHeight / 2 + 4}
                textAnchor="middle"
                fontSize="12"
                fontWeight="800"
                fill="#0f172a"
              >
                Peta Lokasi Survei ({tagingLokasi}) — Tambahkan tiang di Peta GIS atau Muat Contoh
              </text>
            </g>
          )}

          {/* Spans & Multi-Cables */}
          {spans.map((span) => {
            const pFrom = projectedNodes.find((p) => p.id === span.fromNodeId);
            const pTo = projectedNodes.find((p) => p.id === span.toNodeId);
            if (!pFrom || !pTo) return null;

            const cables = getEffectiveSpanCables(span);
            const dx = pTo.x - pFrom.x;
            const dy = pTo.y - pFrom.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const spanBongkar = isSpanMarkedBongkar(span);
            const badgePos = etiketLayout.spanBadges.find(
              (b) => b.id === span.id
            );

            return (
              <g key={span.id}>
                {cables.map((cable, cIdx) => {
                  const offsetPx = (cIdx - (cables.length - 1) / 2) * 7;
                  const x1 = pFrom.x + nx * offsetPx;
                  const y1 = pFrom.y + ny * offsetPx;
                  const x2 = pTo.x + nx * offsetPx;
                  const y2 = pTo.y + ny * offsetPx;
                  const vis = getCableVisualStyle(
                    cable.jenisJaringan,
                    cable.statusJaringan
                  );
                  const cableBongkar = isCableMarkedBongkar(cable, span);
                  const tickRatio = getStaggeredPhaseTickRatio(
                    cIdx,
                    cables.length
                  );
                  const phaseSlash = getPhaseSlashSymbol(
                    inferPhaseCountFromConductor(
                      cable.conductorType,
                      cable.phaseCount
                    )
                  );

                  return (
                    <g key={cable.id || cIdx}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={cableBongkar ? '#dc2626' : vis.strokeColor}
                        strokeWidth={vis.weight}
                        strokeDasharray={cableBongkar ? '6,4' : vis.dashArray}
                      />
                      <text
                        x={x1 + (x2 - x1) * tickRatio}
                        y={y1 + (y2 - y1) * tickRatio - 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="900"
                        fill={cableBongkar ? '#dc2626' : vis.strokeColor}
                      >
                        {phaseSlash}
                      </text>
                      {cableBongkar && (
                        <text
                          x={(x1 + x2) / 2 + 18}
                          y={(y1 + y2) / 2 + 4}
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight="900"
                          fill="#dc2626"
                        >
                          ✕
                        </text>
                      )}
                    </g>
                  );
                })}

                {badgePos && (
                  <g>
                    <rect
                      x={badgePos.boxX}
                      y={badgePos.boxY}
                      width={badgePos.badgeW}
                      height={badgePos.badgeH}
                      rx="4"
                      fill="#ffffff"
                      stroke={spanBongkar ? '#dc2626' : '#334155'}
                      strokeWidth="1"
                    />
                    <text
                      x={badgePos.centerX}
                      y={badgePos.centerY + 3}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="800"
                      fill={spanBongkar ? '#dc2626' : '#0f172a'}
                    >
                      {span.distanceMeters}m
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Callout Leader Lines & Draggable Callout Boxes */}
          {etiketLayout.nodePlacements.map((cl) => {
            const pNode = projectedNodes.find((p) => p.id === cl.id);
            if (!pNode) return null;
            const isPlanned =
              pNode.kind === 'TIANG_RENCANA' ||
              pNode.kind === 'GARDU_RENCANA' ||
              pNode.kind === 'TITIK_APP';
            const nodeBongkar = isNodeMarkedBongkar(pNode.node);
            const customOffset = customCalloutOffsets[cl.id] || { dx: 0, dy: 0 };
            const boxX = cl.boxX + customOffset.dx;
            const boxY = cl.boxY + customOffset.dy;
            const anchorX = cl.anchorX + customOffset.dx;
            const anchorY = cl.anchorY + customOffset.dy;

            return (
              <g
                key={`callout-${cl.id}`}
                onPointerDown={(ev) => handleCalloutPointerDown(ev, cl.id)}
                style={{ cursor: 'grab' }}
              >
                <line
                  x1={cl.pt.x}
                  y1={cl.pt.y}
                  x2={anchorX}
                  y2={anchorY}
                  stroke={isPlanned ? '#dc2626' : '#334155'}
                  strokeWidth="1.1"
                  strokeDasharray="3,3"
                />
                <rect
                  x={boxX}
                  y={boxY}
                  width={cl.boxWidth}
                  height={cl.boxHeight}
                  rx="3"
                  fill="#ffffff"
                  fillOpacity="0.95"
                  stroke={isPlanned ? '#dc2626' : '#0f172a'}
                  strokeWidth="1.2"
                />
                <text
                  x={boxX + 5}
                  y={boxY + 11}
                  fontSize="8.5"
                  fontWeight="800"
                  fill={isPlanned ? '#dc2626' : '#0f172a'}
                >
                  {pNode.kodeTiang} {nodeBongkar ? '✕ BKR' : ''}
                </text>
                {cl.lines.map((line, lIdx) => (
                  <text
                    key={lIdx}
                    x={boxX + 5}
                    y={boxY + 22 + lIdx * 10}
                    fontSize="8"
                    fontWeight="700"
                    fill="#1e293b"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          {/* Pole / Gardu Nodes & Bongkar X */}
          {projectedNodes.map(({ node, x, y }) => {
            const isPlanned =
              node.kind === 'TIANG_RENCANA' ||
              node.kind === 'GARDU_RENCANA' ||
              node.kind === 'TITIK_APP';
            const isGardu =
              node.kind === 'GARDU_RENCANA' || node.kind === 'GARDU_TRAFO';
            const nodeBongkar = isNodeMarkedBongkar(node);

            return (
              <g key={node.id} transform={`translate(${x}, ${y})`}>
                {isGardu ? (
                  <polygon
                    points="0,-9 9,8 -9,8"
                    fill={isPlanned ? '#dc2626' : '#0f172a'}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                ) : (
                  <circle
                    cx="0"
                    cy="0"
                    r="6.5"
                    fill={isPlanned ? '#dc2626' : '#0f172a'}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}
                {nodeBongkar && (
                  <g>
                    <line
                      x1="-8"
                      y1="-8"
                      x2="8"
                      y2="8"
                      stroke="#dc2626"
                      strokeWidth="2.4"
                    />
                    <line
                      x1="8"
                      y1="-8"
                      x2="-8"
                      y2="8"
                      stroke="#dc2626"
                      strokeWidth="2.4"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* Draggable Legend Box (Dapat Dipindah-Pindah Bebas; Kabel Hanya Menuliskan Panjangnya) */}
          <g
            id="draggable-etiket-legend"
            transform={`translate(${legendPos.x}, ${legendPos.y})`}
            onPointerDown={handleLegendPointerDown}
            style={{ cursor: isDraggingLegend ? 'grabbing' : 'move' }}
            className="select-none"
          >
            <rect
              width="214"
              height="154"
              rx="6"
              fill="#ffffff"
              fillOpacity="0.96"
              stroke="#0f172a"
              strokeWidth="1.6"
            />
            {/* Dark Drag Grip Header */}
            <rect
              width="214"
              height="24"
              rx="6"
              fill="#0f172a"
            />
            <rect
              y="18"
              width="214"
              height="6"
              fill="#0f172a"
            />
            <text
              x="10"
              y="16"
              fontSize="8.8"
              fontWeight="900"
              fill="#ffffff"
              letterSpacing="0.5"
            >
              ✥ LEGENDA GAMBAR (GESER BEBAS)
            </text>

            {/* 1. Kabel Merah: Tuliskan Saja Panjangnya */}
            <line x1="12" y1="38" x2="38" y2="38" stroke="#dc2626" strokeWidth="2.6" />
            <text x="46" y="41" fontSize="8.5" fontWeight="700" fill="#0f172a">
              {cableLegendLengths.jtmMeters > 0
                ? `${cableLegendLengths.jtmMeters}m`
                : `${cableLegendLengths.plannedMeters}m`}
            </text>

            {/* 2. Kabel Biru: Tuliskan Saja Panjangnya */}
            <line x1="12" y1="54" x2="38" y2="54" stroke="#2563eb" strokeWidth="2.6" />
            <text x="46" y="57" fontSize="8.5" fontWeight="700" fill="#0f172a">
              {cableLegendLengths.jtrPlannedMeters > 0
                ? `${cableLegendLengths.jtrPlannedMeters}m`
                : `${cableLegendLengths.jtrMeters}m`}
            </text>

            {/* 3. Kabel Oranye: Tuliskan Saja Panjangnya */}
            <line x1="12" y1="70" x2="38" y2="70" stroke="#f97316" strokeWidth="2" strokeDasharray="3,2" />
            <text x="46" y="73" fontSize="8.5" fontWeight="700" fill="#0f172a">
              {cableLegendLengths.srMeters > 0 ? `${cableLegendLengths.srMeters}m` : '25m'}
            </text>

            {/* 4. Tiang Rencana & Eksisting */}
            <circle cx="18" cy="86" r="5" fill="#dc2626" stroke="#ffffff" strokeWidth="1" />
            <circle cx="32" cy="86" r="5" fill="#0f172a" stroke="#ffffff" strokeWidth="1" />
            <text x="46" y="89" fontSize="8.5" fontWeight="700" fill="#0f172a">
              Tiang Rencana / Eksisting
            </text>

            {/* 5. Gardu Trafo */}
            <polygon points="25,97 32,109 18,109" fill="#dc2626" stroke="#ffffff" strokeWidth="1" />
            <text x="46" y="105" fontSize="8.5" fontWeight="700" fill="#0f172a">
              Gardu Trafo Distribusi
            </text>

            {/* 6. Silang Bongkar */}
            <g transform="translate(25, 121)">
              <circle cx="0" cy="0" r="6" fill="#fef2f2" stroke="#dc2626" strokeWidth="1" />
              <line x1="-4" y1="-4" x2="4" y2="4" stroke="#dc2626" strokeWidth="1.8" />
              <line x1="4" y1="-4" x2="-4" y2="4" stroke="#dc2626" strokeWidth="1.8" />
            </g>
            <text x="46" y="124" fontSize="8.5" fontWeight="700" fill="#dc2626">
              ✕ Konstruksi Dibongkar
            </text>

            {/* 7. Total Panjang Kabel (m) */}
            <rect x="12" y="133" width="28" height="13" rx="2" fill="#f8fafc" stroke="#0f172a" strokeWidth="0.8" />
            <text x="26" y="142" fontSize="7.5" fontWeight="800" textAnchor="middle" fill="#0f172a">
              {spans[0]?.distanceMeters || 40}m
            </text>
            <text x="46" y="142" fontSize="8.5" fontWeight="700" fill="#0f172a">
              {cableLegendLengths.plannedMeters}m
            </text>
          </g>
        </svg>

        {/* Formal PLN Engineering Etiket Title Block */}
        <div className="border-t-2 border-slate-900 grid grid-cols-12 text-[11px] bg-white">
          <div className="col-span-3 border-r border-slate-900 p-2.5 flex flex-col justify-between">
            <div>
              <p className="font-black text-slate-900 uppercase tracking-tight">
                PT. PLN (PERSERO) UID JAWA TENGAH &amp; DIY
              </p>
              <p className="font-bold text-slate-700 text-[10px]">
                UP3 MAGELANG — ULP BOROBUDUR
              </p>
            </div>
            <div className="mt-2 pt-1.5 border-t border-slate-200 text-[9.5px] text-slate-600 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
                <span>Merah = Tiang / Kabel Rencana</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
                <span>Hitam = Tiang / Kabel Eksisting</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-red-600">✕</span>
                <span>Silang Merah = Konstruksi Dibongkar</span>
              </div>
            </div>
          </div>

          <div className="col-span-5 border-r border-slate-900 p-2.5 flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">
                PEKERJAAN :
              </p>
              <p className="font-black text-slate-900 uppercase leading-snug">
                {judulGambar}
              </p>
            </div>
            <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px]">
              <span>
                <strong>LOKASI:</strong> {lokasiPekerjaan}
              </span>
              <span>
                <strong>KOORDINAT:</strong> {tagingLokasi || '-'}
              </span>
            </div>
          </div>

          <div className="col-span-4 p-2 border-l border-slate-900 flex flex-col justify-between text-[10px]">
            <div className="space-y-1.5 font-bold">
              <div className="flex items-center">
                <span className="w-28 text-slate-700">DIGAMBAR</span>
                <span className="w-3 text-slate-700">:</span>
                <span className="font-extrabold text-slate-900 truncate uppercase">
                  {petugasSurvei || 'TIM SURVEI TEKNIK'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-700">DIRENCANAKAN</span>
                <span className="w-3 text-slate-700">:</span>
                <span className="font-extrabold text-slate-900 truncate uppercase">
                  {petugasSurvei || 'TIM SURVEI TEKNIK'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-700">DIPERIKSA</span>
                <span className="w-3 text-slate-700">:</span>
                <span className="font-black text-slate-900 uppercase">TL TEKNIK</span>
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-700">DISETUJUI</span>
                <span className="w-3 text-slate-700">:</span>
                <span className="font-black text-slate-900 uppercase">MANAJER</span>
              </div>
            </div>
            <div className="pt-1.5 mt-1 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-500 font-bold">
              <span>NO. NODIN: {item.noNodin || '-'}</span>
              <span>SKALA: NTS</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Formal 10-Column RAB Table (shared between Tab 3 and Tab 4 Page 3)
  const renderOfficialRabTable = (readOnly = false) => {
    const ppnMdu = Math.round(rabSummary.subTotalMdu * (ppnPercent / 100));
    const ppnHardware = Math.round(
      rabSummary.subTotalHardware * (ppnPercent / 100)
    );
    const ppnJasa = Math.round(rabSummary.subTotalJasa * (ppnPercent / 100));
    const totalMdu = rabSummary.subTotalMdu + ppnMdu;
    const totalHardware = rabSummary.subTotalHardware + ppnHardware;
    const totalJasa = rabSummary.subTotalJasa + ppnJasa;

    return (
      <div className="border-2 border-slate-900 bg-white text-slate-900 rounded-sm overflow-hidden shadow-sm">
        {/* Formal PLN Top Header */}
        <div className="p-4 border-b-2 border-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-wide uppercase text-slate-900">
                PT. PLN (PERSERO) UID JAWA TENGAH &amp; DIY
              </p>
              <p className="text-[11px] font-bold text-slate-700">
                UP3 MAGELANG — ULP BOROBUDUR
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                RENCANA ANGGARAN BIAYA (RAB)
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-24 font-bold text-slate-600 uppercase">
                Pekerjaan
              </span>
              <span>:</span>
              {readOnly ? (
                <span className="font-extrabold text-slate-900">
                  {judulGambar}
                </span>
              ) : (
                <input
                  type="text"
                  value={judulGambar}
                  onChange={(e) => setJudulGambar(e.target.value)}
                  className="flex-1 border-b border-slate-300 focus:border-indigo-600 outline-none font-bold px-1 py-0.5"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 font-bold text-slate-600 uppercase">
                Pelaksana
              </span>
              <span>:</span>
              {readOnly ? (
                <span className="font-bold text-slate-900">
                  {pelaksanaPekerjaan}
                </span>
              ) : (
                <input
                  type="text"
                  value={pelaksanaPekerjaan}
                  onChange={(e) => setPelaksanaPekerjaan(e.target.value)}
                  className="flex-1 border-b border-slate-300 focus:border-indigo-600 outline-none font-bold px-1 py-0.5"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 font-bold text-slate-600 uppercase">
                Lokasi
              </span>
              <span>:</span>
              {readOnly ? (
                <span className="font-bold text-slate-900">
                  {lokasiPekerjaan}
                </span>
              ) : (
                <input
                  type="text"
                  value={lokasiPekerjaan}
                  onChange={(e) => setLokasiPekerjaan(e.target.value)}
                  className="flex-1 border-b border-slate-300 focus:border-indigo-600 outline-none font-bold px-1 py-0.5"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 font-bold text-slate-600 uppercase">
                Anggaran / PRK
              </span>
              <span>:</span>
              {readOnly ? (
                <span className="font-bold text-slate-900">
                  {jenisAnggaran} ({nomorPrk})
                </span>
              ) : (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={jenisAnggaran}
                    onChange={(e) => setJenisAnggaran(e.target.value)}
                    className="w-1/2 border-b border-slate-300 focus:border-indigo-600 outline-none font-bold px-1 py-0.5"
                  />
                  <input
                    type="text"
                    value={nomorPrk}
                    onChange={(e) => setNomorPrk(e.target.value)}
                    placeholder="No. PRK"
                    className="w-1/2 border-b border-slate-300 focus:border-indigo-600 outline-none font-bold px-1 py-0.5"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 10-Column Official PLN RAB Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold uppercase text-center">
                <th
                  rowSpan={2}
                  className="border border-slate-700 px-2 py-2 w-10"
                >
                  NO
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-700 px-3 py-2 text-left min-w-[230px]"
                >
                  URAIAN
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-700 px-2 py-2 w-14"
                >
                  GOL
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-700 px-2 py-2 w-14"
                >
                  SAT
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-700 px-2 py-2 w-16"
                >
                  VOL
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-700 px-2.5 py-2 text-right w-28"
                >
                  HARGA SATUAN
                </th>
                <th
                  colSpan={4}
                  className="border border-slate-700 px-2 py-1.5 text-center bg-indigo-950"
                >
                  BIAYA YANG DIPERLUKAN ( RP )
                </th>
                {!readOnly && (
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-2 py-2 w-12"
                  >
                    AKSI
                  </th>
                )}
              </tr>
              <tr className="bg-slate-800 text-white font-bold uppercase text-right">
                <th className="border border-slate-700 px-2.5 py-1.5 w-28">
                  MDU
                </th>
                <th className="border border-slate-700 px-2.5 py-1.5 w-28">
                  HARDWARE
                </th>
                <th className="border border-slate-700 px-2.5 py-1.5 w-28">
                  JASA
                </th>
                <th className="border border-slate-700 px-2.5 py-1.5 w-32 bg-slate-900">
                  JUMLAH
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedRabSections.map((sec) => {
                if (sec.items.length === 0) return null;
                let itemSeq = 0;

                return (
                  <React.Fragment key={sec.code}>
                    <tr className="bg-slate-100 font-black text-slate-900">
                      <td className="border border-slate-300 px-2 py-1.5 text-center">
                        {sec.code}
                      </td>
                      <td
                        colSpan={readOnly ? 9 : 10}
                        className="border border-slate-300 px-3 py-1.5 uppercase tracking-wide"
                      >
                        {sec.title}
                      </td>
                    </tr>

                    {sec.items.map((row) => {
                      if (row.isPackageHeader) {
                        itemSeq = 0;
                        const pkgCodeUpper = (
                          row.parentPackageCode ||
                          row.uraian ||
                          ''
                        ).toUpperCase();
                        const pkgDef = CONSTRUCTION_PACKAGES_CATALOG.find(
                          (p) => p.code.toUpperCase() === pkgCodeUpper
                        );

                        return (
                          <tr
                            key={row.id}
                            className="bg-amber-100/70 font-extrabold text-slate-900 border-t border-b border-amber-300"
                          >
                            <td className="border border-slate-300 px-2 py-1.5 text-center text-amber-900 font-black text-sm">
                              +
                            </td>
                            <td className="border border-slate-300 px-3 py-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[11px] font-mono">
                                  {row.uraian}
                                </span>
                                <span className="font-bold text-slate-900 text-xs">
                                  {pkgDef?.name || 'Paket Konstruksi'}
                                </span>
                                {row.sourceInfo && (
                                  <span className="text-[10px] text-amber-900 font-medium bg-amber-200/60 px-1.5 py-0.5 rounded">
                                    {row.sourceInfo}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="border border-slate-300 px-2 py-1.5 text-center text-slate-400">
                              -
                            </td>
                            <td className="border border-slate-300 px-2 py-1.5 text-center font-bold">
                              {row.satuan || 'Unit'}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center">
                              {readOnly ? (
                                <span className="font-mono font-black text-amber-900 text-xs">
                                  {row.volume}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={row.volume}
                                  onChange={(e) => {
                                    const nextVol =
                                      Number(e.target.value) || 0;
                                    setRabItems((prev) =>
                                      updateRabPackageHeaderVolume(
                                        prev,
                                        row.id,
                                        nextVol
                                      )
                                    );
                                  }}
                                  className="w-16 text-center font-black bg-white border border-amber-500 rounded px-1.5 py-1 text-xs shadow-2xs focus:ring-2 focus:ring-amber-500"
                                  title="Ubah jumlah set paket konstruksi ini (seluruh rincian material di bawah otomatis dikalikan)"
                                />
                              )}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-right text-slate-400">
                              -
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-right text-slate-400">
                              -
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-right text-slate-400">
                              -
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-right text-slate-400">
                              -
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-right text-slate-400">
                              -
                            </td>
                            {!readOnly && (
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRabItems((prev) =>
                                      prev.filter(
                                        (r) =>
                                          r.id !== row.id &&
                                          !(
                                            r.parentHeaderId === row.id ||
                                            (r.parentPackageCode &&
                                              r.parentPackageCode.toUpperCase() ===
                                                pkgCodeUpper)
                                          )
                                      )
                                    )
                                  }
                                  className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                                  title="Hapus Paket Konstruksi dan Seluruh Detail Materialnya"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      }

                      itemSeq += 1;
                      const brk = calculateRabRowBreakdown(row);
                      const isChild = Boolean(
                        row.parentPackageCode || row.parentHeaderId
                      );

                      return (
                        <tr
                          key={row.id}
                          className={`${
                            isChild
                              ? 'bg-amber-50/25 hover:bg-amber-50/60'
                              : 'hover:bg-slate-50'
                          } text-slate-800 transition-colors`}
                        >
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-500 text-xs">
                            {row.itemNo ?? itemSeq}
                          </td>
                          <td
                            className={`border border-slate-300 py-1 ${
                              isChild ? 'pl-6 pr-3' : 'px-3'
                            } font-medium text-xs`}
                          >
                            {isChild ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-amber-600 font-bold font-mono">
                                  ↳
                                </span>
                                <span className="text-slate-900 font-medium">
                                  {row.uraian}
                                </span>
                                {row.unitQtyPerPackage !== undefined && (
                                  <span className="text-[10px] text-slate-500 font-normal ml-1">
                                    ({row.unitQtyPerPackage} {row.satuan}/set)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span>{row.uraian}</span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-600 text-xs">
                            {row.gol}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center text-xs">
                            {row.satuan}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono text-xs">
                            {readOnly ? (
                              <span className="font-bold">{row.volume}</span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.volume}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  setRabItems((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id ? { ...r, volume: v } : r
                                    )
                                  );
                                }}
                                className="w-16 text-center border border-slate-300 rounded px-1 py-0.5 font-bold bg-white text-xs"
                              />
                            )}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-xs">
                            {row.hargaSatuan.toLocaleString('id-ID')}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-xs">
                            {brk.mdu > 0
                              ? brk.mdu.toLocaleString('id-ID')
                              : '0'}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-xs">
                            {brk.hardware > 0
                              ? brk.hardware.toLocaleString('id-ID')
                              : '0'}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-xs">
                            {brk.jasa > 0
                              ? brk.jasa.toLocaleString('id-ID')
                              : '0'}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono font-bold text-slate-900 bg-slate-50/70 text-xs">
                            {brk.jumlah.toLocaleString('id-ID')}
                          </td>
                          {!readOnly && (
                            <td className="border border-slate-300 px-2 py-1 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setRabItems((prev) =>
                                    prev.filter((r) => r.id !== row.id)
                                  )
                                }
                                className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                                title="Hapus Baris"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {rabItems.length === 0 && (
                <tr>
                  <td
                    colSpan={readOnly ? 10 : 11}
                    className="border border-slate-300 px-4 py-8 text-center text-slate-500 font-medium"
                  >
                    Tabel RAB masih kosong. Tambahkan tiang/konstruksi pada Peta
                    GIS atau klik <strong>Muat Contoh SMP N 3 Pabelan</strong>.
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900">
                <td
                  colSpan={6}
                  className="border border-slate-400 px-3 py-2 text-right uppercase"
                >
                  Jumlah MDU - Hardware - Jasa
                </td>
                <td className="border border-slate-400 px-2.5 py-2 text-right font-mono">
                  {rabSummary.subTotalMdu.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-400 px-2.5 py-2 text-right font-mono">
                  {rabSummary.subTotalHardware.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-400 px-2.5 py-2 text-right font-mono">
                  {rabSummary.subTotalJasa.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-400 px-2.5 py-2 text-right font-mono font-extrabold">
                  {rabSummary.subTotalJumlah.toLocaleString('id-ID')}
                </td>
                {!readOnly && <td className="border border-slate-400" />}
              </tr>
              <tr className="bg-slate-100 font-bold text-slate-900">
                <td
                  colSpan={6}
                  className="border border-slate-400 px-3 py-1.5 text-right uppercase"
                >
                  PPN {ppnPercent}%
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono">
                  {ppnMdu.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono">
                  {ppnHardware.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono">
                  {ppnJasa.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono font-extrabold">
                  {rabSummary.ppnAmount.toLocaleString('id-ID')}
                </td>
                {!readOnly && <td className="border border-slate-400" />}
              </tr>
              <tr className="bg-slate-900 text-white font-black">
                <td
                  colSpan={6}
                  className="border border-slate-700 px-3 py-2 text-right uppercase tracking-wide"
                >
                  Jumlah Total (Rp)
                </td>
                <td className="border border-slate-700 px-2.5 py-2 text-right font-mono">
                  {totalMdu.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-700 px-2.5 py-2 text-right font-mono">
                  {totalHardware.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-700 px-2.5 py-2 text-right font-mono">
                  {totalJasa.toLocaleString('id-ID')}
                </td>
                <td className="border border-slate-700 px-2.5 py-2 text-right font-mono text-amber-300 text-xs">
                  Rp {rabSummary.grandTotal.toLocaleString('id-ID')}
                </td>
                {!readOnly && <td className="border border-slate-700" />}
              </tr>
              <tr className="bg-amber-50 border-t border-slate-400">
                <td
                  colSpan={readOnly ? 10 : 11}
                  className="px-3 py-2 text-xs font-extrabold italic text-slate-900"
                >
                  Terbilang : {rabSummary.terbilang}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Studio Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-4 shadow-md border border-indigo-900/60">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Zap className="w-3 h-3" />
              ACUAN: HARGA KHS &amp; STANDAR KONSTRUKSI PLN (PRK 2019 / HSS
              2020)
            </div>
            <h4 className="text-base font-extrabold tracking-tight text-white">
              Studio Gambar Survei Peta GIS &amp; Generator RAB Otomatis
            </h4>
            <p className="text-xs text-slate-300">
              Seluruh fasilitas gambar tersedia langsung di dalam Peta GIS
              (Layar Penuh, Tiang, Gardu, Multi-Kabel 1Ø/3Ø, Tandai Bongkar ✕
              &amp; Undo Ctrl+Z) → Tabel RAB 10 Kolom
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Tiang Rencana / Eksisting
              </p>
              <p className="text-xs font-extrabold text-white mt-0.5">
                <span className="text-red-400">{plannedNodeCount} Merah</span> •{' '}
                <span>{existingNodeCount} Hitam</span>
              </p>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Total Tarikan Rencana
              </p>
              <p className="text-xs font-extrabold text-cyan-300 mt-0.5">
                {totalPlannedMeters} Meter
              </p>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Estimasi RAB (+PPN)
              </p>
              <p className="text-xs font-extrabold text-amber-300 mt-0.5">
                Rp {rabSummary.grandTotal.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Toast */}
      {statusToast && (
        <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-300 text-emerald-900 px-3.5 py-2 rounded-lg text-xs font-bold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            className="text-emerald-700 hover:underline text-[11px]"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Sub-Tab Bar & Reference Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewTab('map')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              viewTab === 'map'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            1. Kanvas Peta GIS
          </button>
          <button
            type="button"
            onClick={() => setViewTab('etiket')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              viewTab === 'etiket'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            2. Gambar Sketsa Ber-Etiket PLN
          </button>
          <button
            type="button"
            onClick={() => setViewTab('rab')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              viewTab === 'rab'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            3. Tabel RAB Resmi PLN ({rabItems.length} Item)
          </button>
          <button
            type="button"
            onClick={() => setViewTab('pdf3hal')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              viewTab === 'pdf3hal'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            4. Cetak Bundel Dokumen ({Math.max(1, attachedSuratPages.length) + 2} Halaman)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="/assets/aistudio/Harga_KHS_aca04794.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-[11px] font-bold"
          >
            <ExternalLink className="w-3 h-3 text-indigo-600" />
            PDF Harga KHS
          </a>
          <a
            href="/assets/aistudio/STANDAR_KONTRUKSI__PRK_2019__HSS_2020_2d9ae1d8.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-[11px] font-bold"
          >
            <ExternalLink className="w-3 h-3 text-indigo-600" />
            PDF Standar Konstruksi
          </a>
          <button
            type="button"
            onClick={handleLoadPresetSmpn3Pabelan}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-extrabold cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Muat Contoh SMP N 3 Pabelan
          </button>
          <button
            type="button"
            onClick={() => handleGenerateAndApplyRab(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Simpan Gambar &amp; RAB</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: KANVAS PETA GIS                                            */}
      {/* ===================================================================== */}
      {viewTab === 'map' && (
        <div
          ref={mapWrapperRef}
          className={
            isFullscreen
              ? 'fixed inset-0 z-[9999] bg-slate-950 flex flex-col'
              : 'relative rounded-xl overflow-hidden border-2 border-slate-800 bg-slate-900 shadow-lg'
          }
        >
          {/* Top Integrated Dark GIS Toolbar */}
          <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-2 text-white space-y-2 z-20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('pan');
                    setCableStartNodeId(null);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                    activeTool === 'pan'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ✋ Geser
                </button>

                {/* +Tiang Rencana / Eksisting */}
                <div className="inline-flex items-center rounded overflow-hidden border border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setPolePlacementKind('TIANG_RENCANA');
                      setActiveTool('add_pole_planned');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold flex items-center gap-1 ${
                      activeTool === 'add_pole_planned'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-300" />
                    +Tiang Rencana
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPolePlacementKind('TIANG_EKSISTING');
                      setActiveTool('add_pole_existing');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold border-l border-slate-700 flex items-center gap-1 ${
                      activeTool === 'add_pole_existing'
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-slate-950 border border-white" />
                    +Eksisting
                  </button>
                </div>

                {/* +Gardu Rencana / Eksisting */}
                <div className="inline-flex items-center rounded overflow-hidden border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setActiveTool('add_gardu_planned')}
                    className={`px-2 py-1 text-[11px] font-bold ${
                      activeTool === 'add_gardu_planned'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    ▲ +Gardu Rencana
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool('add_gardu_existing')}
                    className={`px-2 py-1 text-[11px] font-bold border-l border-slate-700 ${
                      activeTool === 'add_gardu_existing'
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    ▲ Eksisting
                  </button>
                </div>

                {/* Cable Tool & Spec Selectors */}
                <div className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('add_cable');
                      setCableStartNodeId(null);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      activeTool === 'add_cable'
                        ? 'bg-cyan-600 text-white'
                        : 'text-cyan-300 hover:bg-slate-700'
                    }`}
                  >
                    ━ Tarik Kabel
                  </button>
                  <select
                    value={selectedConductorType}
                    onChange={(e) =>
                      setSelectedConductorType(
                        e.target.value as SurveySpanConductorType
                      )
                    }
                    className="bg-slate-900 text-white text-[11px] font-bold rounded px-1.5 py-0.5 border border-slate-700"
                  >
                    {CONDUCTOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPhaseCount((prev) => (prev === 3 ? 1 : 3))
                    }
                    className="px-1.5 py-0.5 rounded bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 text-[10px] font-extrabold"
                    title="Ubah Fasa Kabel (3 Phase /// vs 1 Phase /)"
                  >
                    {selectedPhaseCount === 3 ? '3Ø (///)' : '1Ø (/)'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStatusJaringan((prev) =>
                        prev === 'RENCANA' ? 'EKSISTING' : 'RENCANA'
                      )
                    }
                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                      selectedStatusJaringan === 'RENCANA'
                        ? 'bg-red-900/80 text-red-200 border border-red-500/40'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {selectedStatusJaringan === 'RENCANA'
                      ? 'Rencana'
                      : 'Eksisting'}
                  </button>
                </div>

                {/* Mode Tandai Bongkar */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool((prev) =>
                      prev === 'bongkar' ? 'pan' : 'bongkar'
                    );
                    setCableStartNodeId(null);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-extrabold border transition-all ${
                    activeTool === 'bongkar'
                      ? 'bg-red-600 text-white border-red-400 shadow-sm'
                      : 'bg-slate-800 text-red-300 border-red-800/60 hover:bg-red-950/60'
                  }`}
                >
                  ✕ Tandai Bongkar
                </button>

                {/* Mode Hapus */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool((prev) =>
                      prev === 'delete' ? 'pan' : 'delete'
                    );
                    setCableStartNodeId(null);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                    activeTool === 'delete'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗑 Hapus
                </button>
              </div>

              {/* Right Quick Controls */}
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoConnectCable}
                    onChange={(e) => setAutoConnectCable(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Auto-Sambung Kabel</span>
                </label>

                <button
                  type="button"
                  onClick={handleQuickAddPole40m}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold"
                >
                  +Tiang 40m
                </button>

                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-bold"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo ({undoStack.length})
                </button>

                <button
                  type="button"
                  onClick={handleResetCanvas}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-red-900/70 text-slate-300 text-[11px] font-bold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTileLayerMode((prev) =>
                      prev === 'street' ? 'satellite' : 'street'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  {tileLayerMode === 'street' ? 'Satelit' : 'Peta Jalan'}
                </button>

                <button
                  type="button"
                  onClick={() => setCalloutCompactMode((p) => !p)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                >
                  Label: {calloutCompactMode ? 'Ringkas' : 'Lengkap'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" />
                      Keluar Layar Penuh
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      Layar Penuh
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Row 2: Legend & Active Mode Helper */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[11px]">
              <div className="flex flex-wrap items-center gap-3 text-slate-300">
                <button
                  type="button"
                  onClick={() => setShowLegend((p) => !p)}
                  className="font-bold text-amber-300 hover:underline"
                >
                  {showLegend ? '▾ Legenda Jaringan:' : '▸ Legenda Jaringan'}
                </button>
                {showLegend && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-1 bg-red-600 inline-block" />{' '}
                      {cableLegendLengths.jtmMeters > 0
                        ? `${cableLegendLengths.jtmMeters}m`
                        : `${cableLegendLengths.plannedMeters}m`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-1 bg-sky-600 inline-block" />{' '}
                      {cableLegendLengths.jtrPlannedMeters > 0
                        ? `${cableLegendLengths.jtrPlannedMeters}m`
                        : `${cableLegendLengths.jtrMeters}m`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-1 bg-amber-600 inline-block" /> {cableLegendLengths.srMeters}m
                    </span>
                    <span className="text-slate-400">
                      <strong>///</strong> = 3 Phase • <strong>/</strong> = 1 Phase
                    </span>
                    <span className="text-red-400 font-bold">
                      ✕ = Konstruksi / Kabel Dibongkar
                    </span>
                  </>
                )}
              </div>

              <div className="text-slate-400">
                {activeTool === 'add_cable' && cableStartNodeId ? (
                  <span className="text-amber-300 font-bold">
                    Pilih tiang tujuan untuk menarik kabel dari titik awal...
                  </span>
                ) : activeTool === 'bongkar' ? (
                  <span className="text-red-300 font-bold">
                    Mode Bongkar Aktif: Klik tiang atau jalur kabel untuk
                    memberi tanda ✕ Merah (Bongkar).
                  </span>
                ) : (
                  <span>
                    Klik peta untuk menaruh tiang • Geser kotak label untuk
                    merapikan • Klik titik/kabel untuk rincian KHS
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Map Canvas Container */}
          <div
            ref={mapContainerRef}
            className={isFullscreen ? 'flex-1 w-full' : 'w-full h-[560px]'}
          />

          {/* Floating Bottom-Right Inspector Panel inside GIS Map */}
          {(selectedNode || selectedSpan) && (
            <div className="absolute bottom-3 right-3 z-[1000] w-full max-w-md bg-slate-900/95 text-white border border-slate-700 rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm">
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-amber-300">
                    {selectedNode
                      ? `Titik: ${selectedNode.kodeTiang}`
                      : `Kabel: ${selectedSpan?.distanceMeters}m`}
                  </span>
                  {selectedNode && isNodeMarkedBongkar(selectedNode) && (
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-black">
                      ✕ BONGKAR
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedNode && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextNodes = nodes.filter(
                          (n) => n.id !== selectedNode.id
                        );
                        const nextSpans = spans.filter(
                          (s) =>
                            s.fromNodeId !== selectedNode.id &&
                            s.toNodeId !== selectedNode.id
                        );
                        commitGraphUpdate(nextNodes, nextSpans, true);
                        setSelectedNodeId(null);
                      }}
                      className="px-2 py-0.5 rounded bg-rose-600/80 hover:bg-rose-600 text-white text-[10px] font-bold"
                    >
                      Hapus Titik
                    </button>
                  )}
                  {selectedSpan && (
                    <button
                      type="button"
                      onClick={() => {
                        commitGraphUpdate(
                          nodes,
                          spans.filter((s) => s.id !== selectedSpan.id),
                          true
                        );
                        setSelectedSpanId(null);
                      }}
                      className="px-2 py-0.5 rounded bg-rose-600/80 hover:bg-rose-600 text-white text-[10px] font-bold"
                    >
                      Hapus Kabel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowInspector((p) => !p)}
                    className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                    title="Sembunyikan / Tampilkan Rincian"
                  >
                    {showInspector ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {showInspector && selectedNode && (
                <div className="p-3 space-y-2.5 max-h-[370px] overflow-y-auto text-xs">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-400 font-bold mb-0.5">
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
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-white"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-400 font-bold mb-0.5">
                        Status Titik
                      </label>
                      <select
                        value={selectedNode.kind}
                        onChange={(e) => {
                          const nextKind = e.target
                            .value as SurveyPoleNode['kind'];
                          const nextNodes = nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, kind: nextKind }
                              : n
                          );
                          commitGraphUpdate(nextNodes, spans, true);
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-white"
                      >
                        <option value="TIANG_RENCANA">
                          Tiang Rencana (Merah)
                        </option>
                        <option value="TIANG_EKSISTING">
                          Tiang Eksisting (Hitam)
                        </option>
                        <option value="GARDU_RENCANA">
                          Gardu Rencana (▲ Merah)
                        </option>
                        <option value="GARDU_TRAFO">
                          Gardu Eksisting (▲ Hitam)
                        </option>
                      </select>
                    </div>
                    <div className="col-span-4">
                      <button
                        type="button"
                        onClick={() => handleToggleNodeBongkar(selectedNode)}
                        className={`w-full py-1 px-2 rounded text-[11px] font-extrabold border ${
                          isNodeMarkedBongkar(selectedNode)
                            ? 'bg-red-600 text-white border-red-400'
                            : 'bg-slate-800 text-red-300 border-red-800 hover:bg-red-950'
                        }`}
                      >
                        {isNodeMarkedBongkar(selectedNode)
                          ? '✕ Batal Bongkar'
                          : '✕ Tandai Bongkar'}
                      </button>
                    </div>
                  </div>

                  {/* Add Construction Package to Node */}
                  <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-amber-300">
                        Input Konstruksi pada Titik
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {filteredCatalog.length} paket tersedia
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={constructionSearch}
                        onChange={(e) => setConstructionSearch(e.target.value)}
                        placeholder="Cari kode/nama konstruksi (MJ6-T, SJ6, CJ5, CC1, DB01, dll)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded pl-8 pr-2 py-1 text-[11px] text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                      />
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('ALL')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          selectedCategory === 'ALL'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        Semua
                      </button>
                      {CONSTRUCTION_CATEGORY_LIST.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            selectedCategory === cat.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {cat.id}
                        </button>
                      ))}
                    </div>

                    {/* Live search selector & preview */}
                    <div className="space-y-1.5">
                      <select
                        value={selectedPkgCode}
                        onChange={(e) => setSelectedPkgCode(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-bold text-white truncate"
                      >
                        {filteredCatalog.map((pkg) => (
                          <option key={pkg.code} value={pkg.code}>
                            [{pkg.category}] {pkg.code} — {pkg.name} ({pkg.components.length} mat)
                          </option>
                        ))}
                      </select>

                      {(() => {
                        const curPkg = CONSTRUCTION_PACKAGES_CATALOG.find(
                          (p) => p.code === selectedPkgCode
                        );
                        if (!curPkg) return null;
                        return (
                          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800 text-[9.5px] text-slate-300 space-y-0.5">
                            <div className="font-bold text-amber-200 truncate flex items-center justify-between">
                              <span>{curPkg.name}</span>
                              <span className="text-[9px] text-slate-400">
                                {curPkg.components.length} material
                              </span>
                            </div>
                            <div className="truncate text-slate-400 text-[9px]">
                              {curPkg.components
                                .slice(0, 3)
                                .map((c) => {
                                  const k = KHS_MASTER_CATALOG[c.khsId];
                                  return `${k?.uraian || c.khsId} (${c.qty})`;
                                })
                                .join(' • ')}
                              {curPkg.components.length > 3 ? '...' : ''}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="grid grid-cols-12 gap-1.5 items-center pt-0.5">
                      <select
                        value={newAssignmentAction}
                        onChange={(e) =>
                          setNewAssignmentAction(
                            e.target.value as NonNullable<
                              SurveyPoleConstructionAssignment['actionType']
                            >
                          )
                        }
                        className="col-span-4 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] font-bold text-white"
                      >
                        <option value="PASANG">Pasang (Baru)</option>
                        <option value="BONGKAR">Bongkar (✕)</option>
                        <option value="BONGKAR_PASANG">Bkr-Psg (⇄)</option>
                      </select>
                      <div className="col-span-4 flex items-center bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5">
                        <span className="text-[10px] text-slate-400 mr-1 font-bold">
                          Qty:
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={newAssignmentQty}
                          onChange={(e) =>
                            setNewAssignmentQty(
                              Math.max(1, Number(e.target.value) || 1)
                            )
                          }
                          className="w-full bg-transparent text-center text-[11px] font-bold text-white focus:outline-hidden"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddConstructionToNode}
                        className="col-span-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded py-1 px-1 text-[11px] font-extrabold cursor-pointer shadow-2xs"
                      >
                        +Tambahkan
                      </button>
                    </div>
                  </div>

                  {/* Assigned Constructions on This Pole */}
                  <div className="space-y-1.5">
                    {selectedNode.constructions.length === 0 && (
                      <div className="p-2.5 rounded bg-slate-800/40 border border-slate-700/60 text-center text-[11px] text-slate-400">
                        Titik tiang ini masih kosong. Silakan cari dan tambahkan
                        konstruksi di atas.
                      </div>
                    )}

                    {selectedNode.constructions.map((assg, idx) => {
                      const breakdown = getConstructionAssignmentBreakdown(
                        assg,
                        Boolean(selectedNode.isBongkar)
                      );
                      const isExpanded = expandedAssignmentIdx === idx;
                      return (
                        <div
                          key={`${assg.code}-${idx}`}
                          className="bg-slate-800/80 border border-slate-700 rounded-lg p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-extrabold text-amber-300">
                                {assg.qty}x {assg.code}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1.5">
                                (Rp{' '}
                                {breakdown.totalActivePrice.toLocaleString(
                                  'id-ID'
                                )}
                                )
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                value={assg.qty}
                                onChange={(e) =>
                                  handleUpdateConstructionAssignment(idx, {
                                    qty: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-11 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center text-[10px] font-bold"
                                title="Jumlah Set Konstruksi (detail material di bawah otomatis dikalikan)"
                              />
                              <select
                                value={assg.actionType || 'PASANG'}
                                onChange={(e) =>
                                  handleUpdateConstructionAssignment(idx, {
                                    actionType: e.target
                                      .value as SurveyPoleConstructionAssignment['actionType'],
                                  })
                                }
                                className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] font-bold"
                              >
                                <option value="PASANG">Pasang</option>
                                <option value="BONGKAR">Bongkar</option>
                                <option value="BONGKAR_PASANG">Bkr-Psg</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAssignmentIdx(
                                    isExpanded ? null : idx
                                  )
                                }
                                className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] font-bold cursor-pointer"
                                title="Lihat detail rincian material"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveConstructionFromNode(idx)
                                }
                                className="p-0.5 text-rose-400 hover:text-rose-300 cursor-pointer"
                                title="Hapus Konstruksi dari Titik"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-slate-700 space-y-1.5 text-[10px]">
                              <div className="text-[10px] font-bold text-amber-300 pb-1 flex justify-between items-center border-b border-slate-700/60">
                                <span>Detail Material Konstruksi ({assg.code}):</span>
                                <span className="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded text-amber-200 border border-amber-500/30">
                                  Volume = Qty Satuan × {assg.qty} Set
                                </span>
                              </div>
                              {breakdown.rows.map((row) => (
                                <div
                                  key={row.khsId}
                                  className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded border transition-colors ${
                                    row.enabled
                                      ? 'bg-slate-900/80 border-slate-700 text-slate-200'
                                      : 'bg-slate-950/40 border-slate-800 text-slate-500 line-through'
                                  }`}
                                >
                                  <label className="flex items-center gap-1.5 truncate flex-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={row.enabled}
                                      onChange={() =>
                                        handleToggleComponentOnNode(
                                          idx,
                                          row.khsId
                                        )
                                      }
                                      className="rounded text-indigo-500 focus:ring-0 w-3 h-3"
                                    />
                                    <span className="truncate">{row.uraian}</span>
                                  </label>
                                  <div className="flex items-center gap-1 shrink-0 font-mono">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={row.unitQty}
                                      onChange={(e) =>
                                        handleUpdateComponentQtyOnNode(
                                          idx,
                                          row.khsId,
                                          Number(e.target.value) || 0
                                        )
                                      }
                                      className="w-10 bg-slate-800 border border-slate-600 rounded px-1 py-0.2 text-center text-[10px] font-bold text-white"
                                      title="Kuantitas per 1 set konstruksi"
                                    />
                                    <span className="text-slate-400 text-[9px]">
                                      × {assg.qty} =
                                    </span>
                                    <span className="font-bold text-amber-300 bg-slate-800 px-1.5 py-0.5 rounded border border-amber-400/30 text-[10px]">
                                      {row.volume} {row.satuan}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Span / Multi-Cable Inspector */}
              {showInspector && selectedSpan && (
                <div className="p-3 space-y-2.5 max-h-[340px] overflow-y-auto text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-0.5">
                        Panjang Gawang (Meter)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={selectedSpan.distanceMeters}
                        onChange={(e) => {
                          const dist = Math.max(
                            1,
                            Number(e.target.value) || 1
                          );
                          const nextSpans = spans.map((s) =>
                            s.id === selectedSpan.id
                              ? { ...s, distanceMeters: dist }
                              : s
                          );
                          commitGraphUpdate(nodes, nextSpans, true);
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 font-bold text-white"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => {
                          const nextBongkar = !isSpanMarkedBongkar(selectedSpan);
                          const nextSpans = spans.map((s) =>
                            s.id === selectedSpan.id
                              ? {
                                  ...s,
                                  isBongkar: nextBongkar,
                                  actionType: nextBongkar
                                    ? ('BONGKAR' as const)
                                    : ('PASANG' as const),
                                  cables: getEffectiveSpanCables(s).map((c) => ({
                                    ...c,
                                    isBongkar: nextBongkar,
                                    actionType: nextBongkar
                                      ? ('BONGKAR' as const)
                                      : ('PASANG' as const),
                                  })),
                                }
                              : s
                          );
                          commitGraphUpdate(nodes, nextSpans, true);
                        }}
                        className={`w-full py-1 px-2 rounded text-[11px] font-extrabold border ${
                          isSpanMarkedBongkar(selectedSpan)
                            ? 'bg-red-600 text-white border-red-400'
                            : 'bg-slate-800 text-red-300 border-red-800'
                        }`}
                      >
                        {isSpanMarkedBongkar(selectedSpan)
                          ? '✕ Batal Bongkar Kabel'
                          : '✕ Tandai Kabel Bongkar'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Daftar Tarikan Kabel pada Gawang Ini:
                    </p>
                    {getEffectiveSpanCables(selectedSpan).map((cab, cIdx) => (
                      <div
                        key={cab.id || cIdx}
                        className="flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5"
                      >
                        <div>
                          <p className="font-bold text-white text-[11px]">
                            {cab.conductorType} •{' '}
                            {cab.phaseCount === 1 ? '1Ø (/)' : '3Ø (///)'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Status: {cab.statusJaringan} •{' '}
                            {isCableMarkedBongkar(cab, selectedSpan)
                              ? '✕ BONGKAR'
                              : 'PASANG BARU'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: GAMBAR SKETSA BER-ETIKET PLN                               */}
      {/* ===================================================================== */}
      {viewTab === 'etiket' && (
        <div className="space-y-3 bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
          {/* Metadata Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Judul Gambar Pekerjaan
              </label>
              <input
                type="text"
                value={judulGambar}
                onChange={(e) => setJudulGambar(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Lokasi / Desa / Kecamatan
              </label>
              <input
                type="text"
                value={lokasiPekerjaan}
                onChange={(e) => setLokasiPekerjaan(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Digambar &amp; Direncanakan (Surveyor)
              </label>
              <input
                type="text"
                value={petugasSurvei}
                onChange={(e) => onUpdatePetugasSurvei?.(e.target.value)}
                placeholder="Nama Petugas Survei"
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Map Background & Draggable Legend Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
            {/* Left: Background Map Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-slate-700 flex items-center gap-1 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                Background Peta:
              </span>
              <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setMapBackgroundMode('osm')}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    mapBackgroundMode === 'osm'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Peta Jalan OpenStreetMap Resmi"
                >
                  🗺️ Jalan (OSM)
                </button>
                <button
                  type="button"
                  onClick={() => setMapBackgroundMode('voyager')}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    mapBackgroundMode === 'voyager'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Peta Jalan Halus CartoDB"
                >
                  🧭 Peta Halus
                </button>
                <button
                  type="button"
                  onClick={() => setMapBackgroundMode('satellite')}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    mapBackgroundMode === 'satellite'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Citra Satelit ESRI World Imagery"
                >
                  🛰️ Satelit
                </button>
                <button
                  type="button"
                  onClick={() => setMapBackgroundMode('off')}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    mapBackgroundMode === 'off'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Polos Grid CAD Standar"
                >
                  📐 Polos CAD
                </button>
              </div>

              {mapBackgroundMode !== 'off' && (
                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500">Zoom:</span>
                  <button
                    type="button"
                    onClick={() => setMapZoomOffset((prev) => Math.max(-2, prev - 1))}
                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-slate-800 text-xs flex items-center justify-center cursor-pointer"
                    title="Zoom Out Peta"
                  >
                    -
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-800 w-4 text-center">
                    {mercatorInfo.zoom}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMapZoomOffset((prev) => Math.min(2, prev + 1))}
                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-slate-800 text-xs flex items-center justify-center cursor-pointer"
                    title="Zoom In Peta"
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {/* Right: Draggable Legend Quick-Positioning */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-extrabold text-slate-700 flex items-center gap-1 text-[11px]">
                <Move className="w-3.5 h-3.5 text-amber-600" />
                Posisi Legenda:
              </span>
              <button
                type="button"
                onClick={() => setLegendPos({ x: 26, y: 26 })}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-300 cursor-pointer"
                title="Pindah Legenda ke Kiri Atas"
              >
                ↖ Kiri Atas
              </button>
              <button
                type="button"
                onClick={() => setLegendPos({ x: etiketWidth - 215, y: 26 })}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-300 cursor-pointer"
                title="Pindah Legenda ke Kanan Atas"
              >
                ↗ Kanan Atas
              </button>
              <button
                type="button"
                onClick={() => setLegendPos({ x: 26, y: etiketHeight - 165 })}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-300 cursor-pointer"
                title="Pindah Legenda ke Kiri Bawah"
              >
                ↙ Kiri Bawah
              </button>
              <button
                type="button"
                onClick={() => setLegendPos({ x: etiketWidth - 215, y: etiketHeight - 165 })}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-300 cursor-pointer"
                title="Pindah Legenda ke Kanan Bawah"
              >
                ↘ Kanan Bawah
              </button>

              <button
                type="button"
                onClick={() => handleGenerateAndApplyRab(false)}
                className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-2xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Simpan Gambar &amp; RAB
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Gambar
              </button>
            </div>
          </div>

          {renderEtiketEngineeringSvg()}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: TABEL RAB RESMI PLN (10 KOLOM + ROMAN SECTIONS I-XVI)      */}
      {/* ===================================================================== */}
      {viewTab === 'rab' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includePembetonanTiang}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludePembetonanTiang(checked);
                    if (nodes.length > 0 || spans.length > 0) {
                      setRabItems(
                        generateRabItemsFromSurvey({
                          nodes,
                          spans,
                          includePembetonanTiang: checked,
                          transportasiRit,
                        })
                      );
                    }
                  }}
                  className="rounded text-indigo-600"
                />
                <span>Sertakan Pembetonan Tiang</span>
              </label>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Angkutan (Rit):</span>
                <input
                  type="number"
                  min={0}
                  value={transportasiRit}
                  onChange={(e) => {
                    const rit = Math.max(0, Number(e.target.value) || 0);
                    setTransportasiRit(rit);
                    if (nodes.length > 0 || spans.length > 0) {
                      setRabItems(
                        generateRabItemsFromSurvey({
                          nodes,
                          spans,
                          includePembetonanTiang,
                          transportasiRit: rit,
                        })
                      );
                    }
                  }}
                  className="w-14 px-2 py-1 border border-slate-300 rounded font-bold text-center"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">PPN:</span>
                <select
                  value={ppnPercent}
                  onChange={(e) => setPpnPercent(Number(e.target.value))}
                  className="px-2 py-1 border border-slate-300 rounded font-bold bg-white"
                >
                  <option value={11}>11% (Standar PLN)</option>
                  <option value={10}>10%</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddModalMode('PACKAGE');
                    setAddModalCategory('ALL');
                    setAddModalSearch('');
                    setAddModalQty(1);
                    setShowAddRabModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-2xs cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  + Tambah Item / Paket ke RAB
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAddModalMode('MATERIAL_BONGKAR');
                    setAddModalCategory('BONGKAR');
                    setAddModalSearch('');
                    setAddModalSection('XV');
                    setAddModalQty(1);
                    setShowAddRabModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-extrabold text-xs cursor-pointer transition"
                  title="Tambah Upah / Jasa Pembongkaran Seksi XV"
                >
                  <span className="text-rose-600 font-black">⚡</span>
                  + Jasa Pembongkaran (Seksi XV)
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateAndApplyRab(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 cursor-pointer"
                  title="Hitung ulang RAB otomatis dari titik & kabel di peta survei"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Hitung Ulang dari Peta
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Fallback quick insert row */}
                <div className="inline-flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase px-1">Cepat:</span>
                  <select
                    value={newRowSection}
                    onChange={(e) =>
                      setNewRowSection(e.target.value as RabRomanSection)
                    }
                    className="px-1.5 py-0.5 border border-slate-300 rounded bg-white text-[11px] font-bold"
                  >
                    {RAB_ROMAN_SECTIONS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}. {s.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newRowKhsId}
                    onChange={(e) => setNewRowKhsId(e.target.value)}
                    className="px-1.5 py-0.5 border border-slate-300 rounded bg-white text-[11px] font-bold max-w-[160px] truncate"
                  >
                    {khsCatalogList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.uraian} ({k.gol})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={newRowVol}
                    onChange={(e) =>
                      setNewRowVol(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-12 px-1 py-0.5 border border-slate-300 rounded text-center font-bold text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const khs = KHS_MASTER_CATALOG[newRowKhsId];
                      if (!khs) return;
                      const newItem: RabLineItem = {
                        id: `custom-${Date.now()}`,
                        section: newRowSection,
                        uraian: khs.uraian,
                        gol: khs.gol,
                        satuan: khs.satuan,
                        volume: newRowVol,
                        hargaSatuan: khs.hargaSatuan,
                        khsId: khs.id,
                      };
                      setRabItems((prev) => [...prev, newItem]);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerateAndApplyRab(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Simpan RAB &amp; Gambar
                </button>
              </div>
            </div>
          </div>

          {renderOfficialRabTable(false)}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 4: BUNDEL FILE SURAT (1..N) + RAB (N+1) + GAMBAR (N+2)        */}
      {/* ===================================================================== */}
      {viewTab === 'pdf3hal' && (() => {
        const totalSuratPages = Math.max(1, attachedSuratPages.length);
        const totalBundelPages = totalSuratPages + 2;

        return (
          <div className="space-y-6 bg-slate-100 p-4 rounded-xl border border-slate-300">
            {/* Header Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <div>
                <h5 className="text-sm font-extrabold text-slate-900">
                  Bundel Dokumen Permohonan, RAB &amp; Gambar Sketsa ({totalBundelPages} Halaman Dinamis)
                </h5>
                <p className="text-xs text-slate-600 mt-0.5">
                  Halaman 1{totalSuratPages > 1 ? ` s/d ${totalSuratPages}` : ''}:{' '}
                  <strong>Surat Permohonan ({totalSuratPages} Halaman)</strong> • Halaman {totalSuratPages + 1}:{' '}
                  <strong>Tabel RAB Resmi PLN</strong> • Halaman {totalSuratPages + 2}:{' '}
                  <strong>Gambar Sketsa Ber-Etiket PLN</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Page Count Selector for Surat Permohonan */}
                <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-300 text-xs">
                  <span className="font-bold text-slate-700 text-[11px]">Jumlah Hal. Surat:</span>
                  {[1, 2, 3, 4].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => handleSetSuratPageCount(cnt)}
                      className={`px-2 py-0.5 rounded font-extrabold text-[11px] transition cursor-pointer ${
                        totalSuratPages === cnt
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      {cnt} Hal
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddFormalSuratPage}
                    className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold text-[11px] border border-amber-300 cursor-pointer"
                    title="Tambah 1 Halaman Lampiran Surat Permohonan"
                  >
                    + Hal Surat
                  </button>
                </div>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Scan/PDF Surat</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    onChange={handleUploadSuratPage}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handleGenerateAndApplyRab(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simpan Bundel, Gambar &amp; RAB</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Cetak PDF ({totalBundelPages} Hal)
                </button>
              </div>
            </div>

            {/* HALAMAN 1 s/d totalSuratPages: SURAT PERMOHONAN RESMI (SESUAI JUMLAH HALAMAN SURAT) */}
            {Array.from({ length: totalSuratPages }).map((_, pIdx) => {
              const pageNumber = pIdx + 1;
              const pageData = attachedSuratPages[pIdx];
              const isFormalPlaceholder = !pageData || pageData.startsWith('FORMAL_PAGE_');
              const isPdfDataUrl = Boolean(pageData && pageData.startsWith('data:application/pdf'));
              const hasFailedImg = Boolean(failedImageIndices[pIdx]);

              return (
                <div
                  key={`surat-page-${pIdx}`}
                  className="bg-white border-2 border-slate-900 p-6 rounded-sm shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-900 pb-3">
                    <div>
                      <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase">
                        HALAMAN {pageNumber} / {totalBundelPages} — SURAT PERMOHONAN PELANGGAN (HALAMAN {pageNumber} DARI {totalSuratPages})
                      </span>
                      <h4 className="text-sm font-black text-slate-900 uppercase mt-1">
                        {pIdx === 0
                          ? `SURAT PERMOHONAN RESMI — ${item.projectName}`
                          : pIdx === 1
                          ? `LAMPIRAN SURAT PERMOHONAN (LEMBAR ${pageNumber}) — RINCIAN TEKNIS & LOKASI PERMOHONAN`
                          : `LAMPIRAN SURAT PERMOHONAN (LEMBAR ${pageNumber}) — DOKUMEN PENDUKUNG & PERNYATAAN PELANGGAN`}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">
                        No. Surat: {item.suratPermohonan || '-'} • {item.tglSurat}
                      </span>
                      {totalSuratPages > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSuratPage(pIdx)}
                          className="px-2 py-1 rounded bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold cursor-pointer"
                        >
                          ✕ Hapus Hal. {pageNumber}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Uploaded PDF or Image Scan if provided */}
                  {!isFormalPlaceholder && isPdfDataUrl ? (
                    <div className="border border-slate-300 rounded p-2 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between text-xs px-2 text-slate-700 font-bold">
                        <span>Dokumen PDF Surat Permohonan (Halaman {pageNumber}):</span>
                      </div>
                      <iframe
                        src={pageData}
                        title={`PDF Surat Permohonan Halaman ${pageNumber}`}
                        className="w-full h-[640px] rounded border border-slate-300 bg-white"
                      />
                    </div>
                  ) : !isFormalPlaceholder && !hasFailedImg ? (
                    <div className="border border-slate-300 rounded p-2 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between text-xs px-2 text-slate-600">
                        <span className="font-bold">Scan Dokumen Surat Permohonan Halaman {pageNumber}:</span>
                      </div>
                      <img
                        src={pageData}
                        alt={`Lampiran Surat Permohonan Lembar ${pageNumber}`}
                        onError={() => setFailedImageIndices((prev) => ({ ...prev, [pIdx]: true }))}
                        className="max-h-[640px] w-auto mx-auto object-contain rounded border border-slate-200 shadow-xs"
                      />
                    </div>
                  ) : pIdx === 0 ? (
                    /* HALAMAN 1 SURAT PERMOHONAN: SURAT PERMOHONAN UTAMA */
                    <div className="border-2 border-slate-300 rounded-lg p-6 bg-white space-y-4 font-serif text-slate-900">
                      {/* Kop Surat Resmi Pemohon */}
                      <div className="border-b-2 border-slate-900 pb-3 text-center space-y-0.5 font-sans">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-950">
                          {item.projectName.toUpperCase()}
                        </h3>
                        <p className="text-xs text-slate-700 font-semibold">{item.alamat}</p>
                        <p className="text-[11px] text-slate-500">
                          Kontak Pemohon / WhatsApp: {item.kontakPerson || '-'} • No. Nodin: {item.noNodin || '-'}
                        </p>
                      </div>

                      {/* Header Surat */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans pt-1">
                        <div className="space-y-0.5">
                          <p>
                            Nomor : <span className="font-mono font-bold">{item.suratPermohonan || `014/${item.transaksi}-BBD/2026`}</span>
                          </p>
                          <p>
                            Lampiran : <strong>{totalSuratPages} ({totalSuratPages === 1 ? 'Satu' : totalSuratPages === 2 ? 'Dua' : totalSuratPages === 3 ? 'Tiga' : totalSuratPages}) Halaman</strong>
                          </p>
                          <p>
                            Perihal :{' '}
                            <strong className="underline uppercase">
                              Surat Permohonan {item.transaksi} ({item.peruntukan})
                            </strong>
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p>Magelang, {item.tglSurat || '04 November 2026'}</p>
                          <div className="mt-2 text-left inline-block">
                            <p className="font-bold">Kepada Yth.</p>
                            <p>Manajer PT PLN (Persero) UP3 Magelang</p>
                            <p>Up. Manajer ULP Borobudur</p>
                            <p className="text-slate-600">di Magelang</p>
                          </div>
                        </div>
                      </div>

                      {/* Isi Surat */}
                      <div className="text-xs space-y-2.5 pt-2 leading-relaxed font-sans">
                        <p>Dengan hormat,</p>
                        <p>
                          Bersama surat ini kami mengajukan permohonan layanan ketenagalistrikan ({item.transaksi}) serta
                          pelaksanaan survei teknis jaringan dan penyusunan Rencana Anggaran Biaya (RAB) kepada PT PLN (Persero)
                          ULP Borobudur dengan rincian permohonan sebagai berikut:
                        </p>

                        <div className="bg-slate-50 p-3.5 rounded border border-slate-200 space-y-1.5 font-mono text-[11px]">
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-500">1. Nama Pemohon / Instansi</span>
                            <span className="col-span-8 font-bold text-slate-900">: {item.projectName}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-500">2. Nomor Kontak / HP WA</span>
                            <span className="col-span-8 font-bold text-slate-900">: {item.kontakPerson}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-500">3. Alamat Lokasi</span>
                            <span className="col-span-8 text-slate-800">: {item.alamat}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-500">4. Jenis Transaksi &amp; Peruntukan</span>
                            <span className="col-span-8 font-bold text-indigo-700">: {item.transaksi} — {item.peruntukan}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-500">5. Daya / Golongan Tarif</span>
                            <span className="col-span-8 font-bold text-slate-900">
                              : {item.dayaBaru ? `${item.dayaBaru.toLocaleString('id-ID')} VA` : '-'} ({item.tarif} • {item.meter})
                            </span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-500">6. Uraian Permohonan</span>
                            <span className="col-span-8 text-slate-800">
                              : {item.keteranganPekerjaan || judulGambar}
                            </span>
                          </div>
                        </div>

                        <p>
                          Demikian surat permohonan ini kami sampaikan untuk dapat ditindaklanjuti sesuai prosedur dan standar
                          konstruksi PT PLN (Persero). Atas perhatian dan kerja samanya kami ucapkan terima kasih.
                        </p>
                      </div>

                      {/* Tanda Tangan & Cap Registrasi Posko Security */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-xs font-sans items-end">
                        <div className="border-2 border-indigo-900 p-2.5 rounded text-indigo-950 bg-indigo-50/50 space-y-0.5 max-w-xs">
                          <div className="text-[10px] font-black uppercase tracking-wider text-indigo-900 border-b border-indigo-300 pb-1 flex items-center justify-between">
                            <span>PT PLN (PERSERO) ULP BOROBUDUR</span>
                            <span className="text-emerald-700">✓ TERVERIFIKASI</span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-700 mt-1">
                            Posko Security &amp; Pelayanan Pelanggan
                          </p>
                          <p className="text-[10px] font-mono">
                            No. Nodin: <strong>{item.noNodin || `#${item.id.slice(-6)}`}</strong>
                          </p>
                          <p className="text-[10px] font-mono">
                            Tgl Surat: <strong>{item.tglSurat}</strong>
                          </p>
                        </div>

                        <div className="text-center space-y-1 ml-auto">
                          <p className="font-bold text-slate-800">Pemohon,</p>
                          <div className="h-14 flex items-center justify-center">
                            <div className="border border-rose-300 bg-rose-50 px-3 py-1 rounded text-[10px] font-bold text-rose-800 border-dashed">
                              MATERAI Rp 10.000
                            </div>
                          </div>
                          <p className="font-extrabold uppercase underline text-slate-900">
                            {item.projectName}
                          </p>
                          <p className="text-[10px] text-slate-500">Kontak: {item.kontakPerson}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* HALAMAN 2..N SURAT PERMOHONAN: LAMPIRAN RINCIAN TEKNIS & DATA PENDUKUNG SURAT */
                    <div className="border-2 border-slate-300 rounded-lg p-6 bg-white space-y-4 font-sans text-slate-900 text-xs">
                      <div className="border-b-2 border-slate-900 pb-2 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-indigo-700">
                            LAMPIRAN SURAT PERMOHONAN NOMOR: {item.suratPermohonan || item.noNodin}
                          </div>
                          <h4 className="text-sm font-black uppercase text-slate-950">
                            LEMBAR KE-{pageNumber} DARI {totalSuratPages}: DATA SPESIFIKASI TEKNIS, LOKASI &amp; KESANGGUPAN PELANGGAN
                          </h4>
                        </div>
                        <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-300 font-mono font-bold text-[11px]">
                          Hal. {pageNumber} / {totalSuratPages} Surat
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="space-y-1.5">
                          <p className="font-extrabold text-slate-800 uppercase text-[11px] border-b border-slate-200 pb-1">
                            A. Identitas &amp; Administrasi Pemohon
                          </p>
                          <p><span className="text-slate-500">Nama Lengkap / Badan:</span> <strong>{item.projectName}</strong></p>
                          <p><span className="text-slate-500">NIK KTP / NPWP:</span> <strong className="font-mono">{item.nomorKtp || '3308091408890001 (Terlampir)'}</strong></p>
                          <p><span className="text-slate-500">Nomor Telepon / WA:</span> <strong className="font-mono">{item.kontakPerson}</strong></p>
                          <p><span className="text-slate-500">IDPEL / Meter Referensi:</span> <strong className="font-mono">{item.idPel || item.idPelTetangga || '-'}</strong></p>
                        </div>

                        <div className="space-y-1.5">
                          <p className="font-extrabold text-slate-800 uppercase text-[11px] border-b border-slate-200 pb-1">
                            B. Titik Lokasi &amp; Referensi Jaringan PLN
                          </p>
                          <p><span className="text-slate-500">Koordinat GPS Lokasi:</span> <strong className="font-mono">{tagingLokasi}</strong></p>
                          <p><span className="text-slate-500">Gardu Distribusi:</span> <strong className="font-mono">{nomorGardu || item.nomorGardu || 'GD-BBD'}</strong></p>
                          <p><span className="text-slate-500">Nomor Tiang Terdekat:</span> <strong className="font-mono">{nomorTiang || item.nomorTiang || '-'}</strong></p>
                          <p><span className="text-slate-500">Jumlah Titik Konstruksi:</span> <strong>{nodes.length} Titik ({ cableLegendLengths.totalMeters }m Kabel)</strong></p>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-2">
                        <p className="font-extrabold text-slate-800 uppercase text-[11px]">
                          C. Pernyataan &amp; Lampiran Permohonan Pelanggan (Lembar {pageNumber})
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-slate-700 leading-relaxed">
                          <li>
                            Pemohon menyatakan bahwa lokasi pekerjaan di <strong>{item.alamat}</strong> siap disurvei dan bebas dari sengketa lahan untuk penempatan tiang/jaringan PLN.
                          </li>
                          <li>
                            Permohonan <strong>{item.transaksi}</strong> dengan kebutuhan daya <strong>{item.dayaBaru.toLocaleString('id-ID')} VA ({item.tarif})</strong> diajukan sesuai kebutuhan riil di lapangan ({item.peruntukan}).
                          </li>
                          <li>
                            Dokumen hasil survei berupa Rencana Anggaran Biaya (RAB) dan Gambar Sketsa Jaringan dilampirkan pada halaman berikutnya setelah lembar surat permohonan ini.
                          </li>
                        </ol>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                        <div className="text-[11px] text-slate-500">
                          Lampiran Surat Permohonan Halaman {pageNumber} dari {totalSuratPages} • Tanggal: {item.tglSurat}
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold text-slate-700">Pemohon / Penanggung Jawab,</p>
                          <p className="font-extrabold uppercase underline text-slate-900 mt-6">{item.projectName}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* HALAMAN totalSuratPages + 1: TABEL RENCANA ANGGARAN BIAYA (RAB) RESMI PLN */}
            <div className="bg-white border-2 border-slate-900 p-6 rounded-sm shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase">
                  HALAMAN {totalSuratPages + 1} / {totalBundelPages} — RENCANA ANGGARAN BIAYA (RAB) RESMI PLN
                </span>
                <span className="text-xs font-extrabold text-slate-900">
                  Total RAB (+PPN {ppnPercent}%): Rp{' '}
                  {rabSummary.grandTotal.toLocaleString('id-ID')}
                </span>
              </div>
              {renderOfficialRabTable(true)}
            </div>

            {/* HALAMAN totalSuratPages + 2: GAMBAR SKETSA SURVEI BER-ETIKET PLN */}
            <div className="bg-white border-2 border-slate-900 p-6 rounded-sm shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase">
                  HALAMAN {totalSuratPages + 2} / {totalBundelPages} — GAMBAR SKETSA SURVEI BER-ETIKET PLN (BACKGROUND MAPS)
                </span>
                <span className="text-xs font-bold text-slate-600">
                  Petugas Survei: {petugasSurvei || '-'} • Lokasi: {tagingLokasi}
                </span>
              </div>
              {renderEtiketEngineeringSvg()}
            </div>
          </div>
        );
      })()}

      {/* ===================================================================== */}
      {/* MODAL: TAMBAH PAKET KONSTRUKSI & JASA PEMBONGKARAN KE RAB              */}
      {/* ===================================================================== */}
      {showAddRabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-sm">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Katalog Konstruksi, Material &amp; Jasa Pembongkaran PLN
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih paket konstruksi atau jasa pembongkaran KHS resmi PLN UID Jateng &amp; DIY
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRabModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch & Search Filter Toolbar */}
            <div className="p-4 border-b border-slate-200 bg-white space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Mode Selector */}
                <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAddModalMode('PACKAGE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      addModalMode === 'PACKAGE'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📦 Paket Konstruksi ({CONSTRUCTION_PACKAGES_CATALOG.length} Paket)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddModalMode('MATERIAL_BONGKAR')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      addModalMode === 'MATERIAL_BONGKAR'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ⚡ Jasa Pembongkaran &amp; Material KHS
                  </button>
                </div>

                {/* Live Search Input */}
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={addModalSearch}
                    onChange={(e) => setAddModalSearch(e.target.value)}
                    placeholder={
                      addModalMode === 'PACKAGE'
                        ? 'Cari kode paket (SJ6, MJ6-T, C1, GTR, BKR...)'
                        : 'Cari jasa bongkar/material (Bongkar tiang, kabel, lvtc...)'
                    }
                    className="w-full pl-9 pr-8 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-indigo-500 bg-slate-50 focus:bg-white"
                  />
                  {addModalSearch && (
                    <button
                      type="button"
                      onClick={() => setAddModalSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs overflow-x-auto pb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Kategori:</span>
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'JTR', label: 'JTR (Jaringan TR)' },
                  { id: 'JTM', label: 'JTM (Jaringan TM)' },
                  { id: 'SKUTR', label: 'SKUTR' },
                  { id: 'GARDU', label: 'Gardu Trafo' },
                  { id: 'TIANG', label: 'Tiang' },
                  { id: 'SR', label: 'SR & APP' },
                  { id: 'BONGKAR', label: 'Pekerjaan Bongkar', isSpecial: true },
                  { id: 'SWITCHING', label: 'Switching (LBS/CO)' },
                  { id: 'SKUR', label: 'Skur / Guy Wire' },
                  { id: 'GROUNDING', label: 'Grounding' },
                ].map((cat) => {
                  const isActive = addModalCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setAddModalCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                        isActive
                          ? cat.isSpecial
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-indigo-600 text-white shadow-2xs'
                          : cat.isSpecial
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      {cat.isSpecial && <span className="mr-1">⚡</span>}
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Body: List of Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {addModalMode === 'PACKAGE' ? (
                /* Mode 1: Paket Konstruksi */
                filteredModalPackages.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm font-bold">Tidak ada paket konstruksi yang cocok.</p>
                    <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian atau kategori lain.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredModalPackages.map((pkg) => {
                      const isBongkar = pkg.category === 'BONGKAR' || pkg.code.startsWith('BKR');
                      return (
                        <div
                          key={pkg.code}
                          className={`p-3.5 rounded-xl border bg-white shadow-xs hover:border-indigo-400 transition flex flex-col justify-between ${
                            isBongkar ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md font-black text-xs ${
                                  isBongkar
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                [{pkg.code}]
                              </span>
                              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {pkg.category}
                              </span>
                            </div>
                            <h4 className="text-xs font-black text-slate-900 mt-1.5">{pkg.name}</h4>
                            <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{pkg.description}</p>

                            {/* Detail Komponen Material */}
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">
                                Rincian Material ({pkg.components.length} Komponen per Set):
                              </span>
                              <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto pr-1">
                                {pkg.components.map((comp, cIdx) => {
                                  const khs = KHS_MASTER_CATALOG[comp.khsId];
                                  return (
                                    <div
                                      key={cIdx}
                                      className="flex items-center justify-between text-[10px] text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded"
                                    >
                                      <span className="truncate max-w-[190px]">
                                        ↳ {khs?.uraian || comp.khsId}
                                      </span>
                                      <span className="font-mono font-bold text-slate-900 shrink-0">
                                        {comp.qty} {khs?.satuan || 'Bh'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Quick Add Form */}
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-600">Qty Set:</span>
                              <input
                                type="number"
                                min={1}
                                defaultValue={1}
                                id={`qty-input-${pkg.code}`}
                                className="w-14 px-2 py-1 border border-slate-300 rounded-lg text-center font-bold text-xs bg-white"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  `qty-input-${pkg.code}`
                                ) as HTMLInputElement | null;
                                const qty = Math.max(1, Number(input?.value) || 1);
                                handleAddPackageToRab(pkg.code, qty);
                              }}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white font-extrabold text-xs shadow-2xs cursor-pointer transition ${
                                isBongkar
                                  ? 'bg-rose-600 hover:bg-rose-700'
                                  : 'bg-indigo-600 hover:bg-indigo-700'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              + Tambah ke RAB
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Mode 2: Material Satuan & Jasa Pembongkaran KHS */
                filteredModalKhs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm font-bold">Tidak ada item KHS atau jasa bongkar yang cocok.</p>
                    <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian atau kategori lain.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-xs text-amber-900">
                      <span>
                        <strong>Target Seksi RAB:</strong> Masukkan item ini ke Seksi:
                      </span>
                      <select
                        value={addModalSection}
                        onChange={(e) => setAddModalSection(e.target.value as RabRomanSection)}
                        className="px-2 py-1 border border-amber-300 rounded-lg font-bold bg-white text-xs"
                      >
                        {RAB_ROMAN_SECTIONS.map((s) => (
                          <option key={s.code} value={s.code}>
                            Seksi {s.code}. {s.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                      {filteredModalKhs.map((k) => {
                        const isBongkar =
                          k.section === 'XV' ||
                          k.section === 'XIV' ||
                          k.id.startsWith('JASA_BONGKAR') ||
                          k.uraian.toLowerCase().includes('bongkar');

                        return (
                          <div
                            key={k.id}
                            className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 transition ${
                              isBongkar ? 'bg-rose-50/30' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                    isBongkar
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {isBongkar ? '⚡ BONGKAR' : `Seksi ${k.section || 'KHS'}`}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-slate-500">
                                  {k.id}
                                </span>
                                <span className="text-[10px] font-extrabold uppercase px-1 rounded bg-slate-100 text-slate-600">
                                  {k.gol}
                                </span>
                              </div>
                              <h5 className="text-xs font-bold text-slate-900 mt-0.5 leading-snug">
                                {k.uraian}
                              </h5>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Harga Satuan KHS: <strong className="text-slate-800">Rp {k.hargaSatuan.toLocaleString('id-ID')}</strong> / {k.satuan}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-600 font-bold">Vol:</span>
                                <input
                                  type="number"
                                  min={0.1}
                                  step={0.1}
                                  defaultValue={1}
                                  id={`vol-input-${k.id}`}
                                  className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-center font-bold text-xs bg-white"
                                />
                                <span className="text-xs text-slate-500 font-semibold">{k.satuan}</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.getElementById(
                                    `vol-input-${k.id}`
                                  ) as HTMLInputElement | null;
                                  const vol = Math.max(0.1, Number(input?.value) || 1);
                                  const targetSec = isBongkar ? 'XV' : addModalSection;
                                  handleAddKhsItemToRab(k.id, vol, targetSec);
                                }}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white font-extrabold text-xs shadow-2xs cursor-pointer transition ${
                                  isBongkar
                                    ? 'bg-rose-600 hover:bg-rose-700'
                                    : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {isBongkar ? '+ Bongkar (Seksi XV)' : '+ Masukkan'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                Pilih paket atau item untuk langsung menambahkannya ke tabel RAB dengan perhitungan harga resmi PLN UID Jawa Tengah.
              </span>
              <button
                type="button"
                onClick={() => setShowAddRabModal(false)}
                className="px-4 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
