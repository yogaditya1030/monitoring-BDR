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
} from 'lucide-react';

export interface TeknikSurveyRabStudioProps {
  item: PermohonanItem;
  petugasSurvei: string;
  onUpdatePetugasSurvei?: (name: string) => void;
  tagingLokasi: string;
  nomorGardu?: string;
  nomorTiang: string;
  initialDesign?: SurveyRabDesign;
  onApplyRabDesign: (
    design: SurveyRabDesign,
    grandTotalRab: number,
    summaryNotes: string
  ) => void;
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
  onApplyRabDesign,
}) => {
  const [viewTab, setViewTab] = useState<StudioSubTab>('map');

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
  >({});

  // RAB Settings & Items
  const [ppnPercent, setPpnPercent] = useState<number>(
    initialDesign?.ppnPercent ?? 10
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
      `${item.transaksi} - ${item.kontakPerson}`
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
  const [autoConnectCable, setAutoConnectCable] = useState<boolean>(true);
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
  const [selectedPkgCode, setSelectedPkgCode] = useState<string>('C9-200');
  const [newAssignmentAction, setNewAssignmentAction] =
    useState<NonNullable<SurveyPoleConstructionAssignment['actionType']>>(
      'PASANG'
    );
  const [newAssignmentQty, setNewAssignmentQty] = useState<number>(1);
  const [expandedAssignmentIdx, setExpandedAssignmentIdx] = useState<
    number | null
  >(null);

  // RAB Custom Row State
  const khsCatalogList = useMemo(() => Object.values(KHS_MASTER_CATALOG), []);
  const [newRowSection, setNewRowSection] = useState<RabRomanSection>('III');
  const [newRowKhsId, setNewRowKhsId] = useState<string>(
    khsCatalogList[0]?.id || ''
  );
  const [newRowVol, setNewRowVol] = useState<number>(1);
  const [statusToast, setStatusToast] = useState<string | null>(null);

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

      const defaultConstructions: SurveyPoleConstructionAssignment[] =
        kind === 'TIANG_RENCANA'
          ? [
              { code: 'C9-200', qty: 1, actionType: 'PASANG' },
              { code: 'SJ5', qty: 1, actionType: 'PASANG' },
            ]
          : kind === 'GARDU_RENCANA'
          ? [
              { code: 'DB01', qty: 1, actionType: 'PASANG' },
              { code: 'C12-350', qty: 2, actionType: 'PASANG' },
            ]
          : [{ code: 'SJ5', qty: 1, actionType: 'PASANG' }];

      const newNode: SurveyPoleNode = {
        id: `node-${Date.now()}-${idx}`,
        kodeTiang: defaultCode,
        kind,
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
        constructions: defaultConstructions,
      };

      const nextNodes = [...st.nodes, newNode];
      let nextSpans = [...st.spans];

      if (st.autoConnectCable && st.nodes.length > 0) {
        const prevNode =
          st.nodes.find((n) => n.id === st.selectedNodeId) ||
          st.nodes[st.nodes.length - 1];
        if (prevNode) {
          const dist = calculateGeodesicDistanceMeters(
            prevNode.lat,
            prevNode.lng,
            newNode.lat,
            newNode.lng
          );
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
          const newSpan: SurveySpanEdge = {
            id: `span-${Date.now()}`,
            fromNodeId: prevNode.id,
            toNodeId: newNode.id,
            statusJaringan: st.selectedStatusJaringan,
            jenisJaringan,
            conductorType: st.selectedConductorType,
            phaseCount: st.selectedPhaseCount,
            distanceMeters: Math.max(5, dist),
            cables: [newCable],
          };
          nextSpans = [...nextSpans, newSpan];
        }
      }

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
        <div style="display:inline-flex;align-items:center;gap:4px;background:${
          isSelected ? '#1e1b4b' : 'rgba(255,255,255,0.95)'
        };color:${isSelected ? '#ffffff' : '#0f172a'};border:1.5px solid ${
        spanBongkar ? '#dc2626' : vis.strokeColor
      };border-radius:999px;padding:1px 7px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,0.18);">
          <span>${span.distanceMeters}m ${primaryCable.jenisJaringan} (${phaseSlash})${
        cables.length > 1 ? ` +${cables.length - 1}` : ''
      }</span>
          ${
            spanBongkar
              ? `<span style="background:#dc2626;color:#fff;padding:0 4px;border-radius:4px;font-size:9px;">✕ BKR</span>`
              : ''
          }
        </div>
      `;

      const midMarker = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'pln-span-mid-badge',
          html: badgeHtml,
          iconSize: [110, 22],
          iconAnchor: [55, 11],
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
      constructions: [
        { code: 'C9-200', qty: 1, actionType: 'PASANG' },
        { code: 'SJ5', qty: 1, actionType: 'PASANG' },
        { code: 'CM2-12', qty: 1, actionType: 'PASANG' },
      ],
    };

    const nextNodes = [...nodes, newNode];
    let nextSpans = [...spans];

    if (refNode && autoConnectCable) {
      const jenisJaringan = inferNetworkCategoryFromConductor(
        selectedConductorType
      );
      const newCable: SpanCableItem = {
        id: `cab-${Date.now()}`,
        statusJaringan: selectedStatusJaringan,
        jenisJaringan,
        conductorType: selectedConductorType,
        phaseCount: selectedPhaseCount,
        circuitCount: 1,
        actionType: 'PASANG',
      };
      nextSpans.push({
        id: `span-${Date.now()}`,
        fromNodeId: refNode.id,
        toNodeId: newNode.id,
        statusJaringan: selectedStatusJaringan,
        jenisJaringan,
        conductorType: selectedConductorType,
        phaseCount: selectedPhaseCount,
        distanceMeters: 40,
        cables: [newCable],
      });
    }

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

  // Generate & Apply RAB to Parent Modal
  const handleGenerateAndApplyRab = () => {
    const generated =
      nodes.length > 0 || spans.length > 0
        ? generateRabItemsFromSurvey({
            nodes,
            spans,
            includePembetonanTiang,
            transportasiRit,
          })
        : rabItems;

    setRabItems(generated);
    const summary = calculateRabSummary(generated, ppnPercent);

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
      diperiksaOleh: 'ARIS DWI SS (TL Teknik)',
      disetujuiOleh: 'ARIF SETYAWAN (Manajer)',
      nodes,
      spans,
      rabItems: generated,
      ppnPercent,
      includePembetonanTiang,
      transportasiRit,
      updatedAt: new Date().toISOString(),
    };

    const summaryNotes = `Survei GIS: ${plannedNodeCount} Tiang Rencana, ${existingNodeCount} Eksisting, Tarikan ${totalPlannedMeters}m. Total RAB (+PPN ${ppnPercent}%): Rp ${summary.grandTotal.toLocaleString(
      'id-ID'
    )}`;

    onApplyRabDesign(design, summary.grandTotal, summaryNotes);
    setStatusToast(
      `RAB Otomatis (${
        generated.length
      } baris, Rp ${summary.grandTotal.toLocaleString(
        'id-ID'
      )}) berhasil diterapkan ke Form Teknik!`
    );
    setTimeout(() => setStatusToast(null), 4000);
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

  // Project lat/lng to SVG canvas coordinates for Tab 2 & Tab 4 Etiket
  const etiketWidth = 920;
  const etiketHeight = 460;
  const etiketPadX = 95;
  const etiketPadY = 85;

  const projectedNodes = useMemo(() => {
    if (nodes.length === 0) return [];
    if (nodes.length === 1) {
      return [
        {
          id: nodes[0].id,
          kodeTiang: nodes[0].kodeTiang,
          kind: nodes[0].kind,
          node: nodes[0],
          x: etiketWidth / 2,
          y: etiketHeight / 2,
          lines: formatPoleCalloutLines(nodes[0]),
        },
      ];
    }
    const lats = nodes.map((n) => n.lat);
    const lngs = nodes.map((n) => n.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.0004);
    const lngSpan = Math.max(maxLng - minLng, 0.0006);

    return nodes.map((n) => {
      const x =
        etiketPadX +
        ((n.lng - minLng) / lngSpan) * (etiketWidth - etiketPadX * 2);
      const y =
        etiketHeight -
        etiketPadY -
        ((n.lat - minLat) / latSpan) * (etiketHeight - etiketPadY * 2);
      return {
        id: n.id,
        kodeTiang: n.kodeTiang,
        kind: n.kind,
        node: n,
        x: Math.round(x),
        y: Math.round(y),
        lines: formatPoleCalloutLines(n),
      };
    });
  }, [nodes]);

  const projectedSpans = useMemo(() => {
    return spans
      .map((sp) => {
        const pFrom = projectedNodes.find((p) => p.id === sp.fromNodeId);
        const pTo = projectedNodes.find((p) => p.id === sp.toNodeId);
        if (!pFrom || !pTo) return null;
        const primaryCable = getEffectiveSpanCables(sp)[0];
        const slash = getPhaseSlashSymbol(
          inferPhaseCountFromConductor(
            primaryCable.conductorType,
            primaryCable.phaseCount
          )
        );
        const badgeText = `${sp.distanceMeters}m (${primaryCable.jenisJaringan} ${slash})`;
        return {
          id: sp.id,
          x1: pFrom.x,
          y1: pFrom.y,
          x2: pTo.x,
          y2: pTo.y,
          badgeText,
          badgeW: Math.max(66, badgeText.length * 5.6),
          badgeH: 16,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [spans, projectedNodes]);

  const etiketLayout = useMemo(
    () =>
      computeEtiketCalloutLayout({
        nodes: projectedNodes,
        spans: projectedSpans,
        defaultMainRoadCenter: { x: etiketWidth / 2, y: etiketHeight / 2 + 44 },
        defaultSimpangRoadCenter: { x: 185, y: etiketHeight - 40 },
        showRoadSketch,
      }),
    [projectedNodes, projectedSpans, showRoadSketch]
  );

  // Render SVG Etiket Drawing (shared between Tab 2 and Tab 4 Page 2)
  const renderEtiketEngineeringSvg = () => {
    return (
      <div className="border-2 border-slate-900 bg-white text-slate-900 shadow-sm overflow-hidden">
        <svg
          viewBox={`0 0 ${etiketWidth} ${etiketHeight}`}
          className="w-full h-auto block bg-white"
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
                stroke="#f1f5f9"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            width={etiketWidth}
            height={etiketHeight}
            fill="url(#pln-cad-grid)"
          />

          {/* Compass North Arrow (U) */}
          <g transform="translate(55, 55)">
            <circle
              cx="0"
              cy="0"
              r="20"
              fill="#ffffff"
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

          {/* Optional Road Sketch */}
          {showRoadSketch && (
            <g opacity="0.85">
              <rect
                x="24"
                y={etiketHeight / 2 + 28}
                width={etiketWidth - 48}
                height="32"
                fill="#f8fafc"
                stroke="#94a3b8"
                strokeWidth="1.2"
              />
              <line
                x1="30"
                y1={etiketHeight / 2 + 44}
                x2={etiketWidth - 30}
                y2={etiketHeight / 2 + 44}
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="10,8"
              />
              <text
                x={etiketLayout.mainRoadLabelCenter.x}
                y={etiketLayout.mainRoadLabelCenter.y + 3}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="700"
                fill="#64748b"
                letterSpacing="1.5"
              >
                JALAN RAYA / LOKASI SURVEI ({lokasiPekerjaan.toUpperCase()})
              </text>
            </g>
          )}

          {projectedNodes.length === 0 && (
            <text
              x={etiketWidth / 2}
              y={etiketHeight / 2}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#64748b"
            >
              Belum ada titik tiang pada Kanvas Peta GIS. Silakan tambahkan tiang
              atau klik &quot;Muat Contoh SMP N 3 Pabelan&quot;.
            </text>
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
                      {span.distanceMeters}m{' '}
                      {spanBongkar
                        ? '(BKR)'
                        : getEffectiveSpanCables(span)[0]?.jenisJaringan ||
                          'JTR'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Callout Leader Lines & Non-Overlapping Callout Boxes */}
          {etiketLayout.nodePlacements.map((cl) => {
            const pNode = projectedNodes.find((p) => p.id === cl.id);
            if (!pNode) return null;
            const isPlanned =
              pNode.kind === 'TIANG_RENCANA' ||
              pNode.kind === 'GARDU_RENCANA' ||
              pNode.kind === 'TITIK_APP';
            const nodeBongkar = isNodeMarkedBongkar(pNode.node);

            return (
              <g key={`callout-${cl.id}`}>
                <line
                  x1={cl.pt.x}
                  y1={cl.pt.y}
                  x2={cl.anchorX}
                  y2={cl.anchorY}
                  stroke={isPlanned ? '#dc2626' : '#334155'}
                  strokeWidth="1.1"
                  strokeDasharray="3,3"
                />
                <rect
                  x={cl.boxX}
                  y={cl.boxY}
                  width={cl.boxWidth}
                  height={cl.boxHeight}
                  rx="3"
                  fill="#ffffff"
                  stroke={isPlanned ? '#dc2626' : '#0f172a'}
                  strokeWidth="1.2"
                />
                <text
                  x={cl.boxX + 5}
                  y={cl.boxY + 11}
                  fontSize="8.5"
                  fontWeight="800"
                  fill={isPlanned ? '#dc2626' : '#0f172a'}
                >
                  {pNode.kodeTiang} {nodeBongkar ? '✕ BKR' : ''}
                </text>
                {cl.lines.map((line, lIdx) => (
                  <text
                    key={lIdx}
                    x={cl.boxX + 5}
                    y={cl.boxY + 22 + lIdx * 10}
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

          <div className="col-span-4 p-2.5 grid grid-cols-2 gap-2 text-[10px]">
            <div className="border border-slate-300 rounded p-1.5">
              <p className="text-[8.5px] font-bold text-slate-500 uppercase">
                DIGAMBAR / SURVEYOR
              </p>
              <p className="font-extrabold text-slate-900 mt-2 truncate">
                {petugasSurvei || 'TIM SURVEI TEKNIK'}
              </p>
            </div>
            <div className="border border-slate-300 rounded p-1.5">
              <p className="text-[8.5px] font-bold text-slate-500 uppercase">
                DIPERIKSA (TL TEKNIK)
              </p>
              <p className="font-extrabold text-slate-900 mt-2">ARIS DWI SS (TL Teknik)</p>
            </div>
            <div className="border border-slate-300 rounded p-1.5">
              <p className="text-[8.5px] font-bold text-slate-500 uppercase">
                DISETUJUI (MANAJER ULP)
              </p>
              <p className="font-extrabold text-slate-900 mt-2">
                ARIF SETYAWAN (Manajer)
              </p>
            </div>
            <div className="border border-slate-300 rounded p-1.5 flex flex-col justify-between">
              <p className="text-[8.5px] font-bold text-slate-500 uppercase">
                NO. NODIN / SKALA
              </p>
              <p className="font-extrabold text-slate-900 truncate">
                {item.noNodin || '-'} • NTS
              </p>
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
                        return (
                          <tr
                            key={row.id}
                            className="bg-amber-50/90 font-extrabold text-slate-900"
                          >
                            <td className="border border-slate-300 px-2 py-1.5 text-center text-amber-800 font-black">
                              +
                            </td>
                            <td className="border border-slate-300 px-3 py-1.5">
                              {row.uraian}
                            </td>
                            <td className="border border-slate-300 px-2 py-1.5 text-center">
                              -
                            </td>
                            <td className="border border-slate-300 px-2 py-1.5 text-center">
                              {row.satuan || 'Unit'}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center">
                              {readOnly ? (
                                <span>{row.volume}</span>
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
                                  className="w-14 text-center font-black bg-white border border-amber-400 rounded px-1 py-0.5"
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
                                            r.section === row.section &&
                                            r.parentPackageCode ===
                                              row.parentPackageCode
                                          )
                                      )
                                    )
                                  }
                                  className="text-red-600 hover:text-red-800 p-0.5"
                                  title="Hapus Paket Konstruksi"
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

                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-slate-50 text-slate-800"
                        >
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-500">
                            {row.itemNo ?? itemSeq}
                          </td>
                          <td className="border border-slate-300 px-3 py-1 font-medium">
                            {row.uraian}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-600">
                            {row.gol}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.satuan}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono">
                            {readOnly ? (
                              <span>{row.volume}</span>
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
                                className="w-14 text-center border border-slate-300 rounded px-1 py-0.5 font-bold"
                              />
                            )}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">
                            {row.hargaSatuan.toLocaleString('id-ID')}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">
                            {brk.mdu > 0 ? brk.mdu.toLocaleString('id-ID') : '0'}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">
                            {brk.hardware > 0
                              ? brk.hardware.toLocaleString('id-ID')
                              : '0'}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">
                            {brk.jasa > 0
                              ? brk.jasa.toLocaleString('id-ID')
                              : '0'}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono font-bold text-slate-900 bg-slate-50/70">
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
                                className="text-slate-400 hover:text-red-600 p-0.5"
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
            4. Generate File Survey (PDF 3 Hal)
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
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-extrabold"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Muat Contoh SMP N 3 Pabelan
          </button>
          <button
            type="button"
            onClick={handleGenerateAndApplyRab}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate Otomatis RAB &amp; Terapkan
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
                      <span className="w-3 h-1 bg-red-600 inline-block" /> JTM
                      20kV
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-1 bg-sky-600 inline-block" /> JTR
                      LVTC
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-1 bg-amber-600 inline-block" /> SR
                    </span>
                    <span className="text-slate-400">
                      <strong>///</strong> = 3 Phase • <strong>/</strong> = 1
                      Phase
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
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={constructionSearch}
                        onChange={(e) => setConstructionSearch(e.target.value)}
                        placeholder="Cari konstruksi / material (misal: MJ6-T, CJ5, CC1, DB01)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded pl-8 pr-2 py-1 text-[11px] text-white placeholder-slate-500"
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

                    <div className="grid grid-cols-12 gap-1.5 items-center">
                      <select
                        value={selectedPkgCode}
                        onChange={(e) => setSelectedPkgCode(e.target.value)}
                        className="col-span-6 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-bold text-white"
                      >
                        {filteredCatalog.map((pkg) => (
                          <option key={pkg.code} value={pkg.code}>
                            {pkg.code} — {pkg.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={newAssignmentAction}
                        onChange={(e) =>
                          setNewAssignmentAction(
                            e.target.value as NonNullable<
                              SurveyPoleConstructionAssignment['actionType']
                            >
                          )
                        }
                        className="col-span-3 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] font-bold text-white"
                      >
                        <option value="PASANG">Pasang</option>
                        <option value="BONGKAR">Bongkar</option>
                        <option value="BONGKAR_PASANG">Bkr-Psg</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={newAssignmentQty}
                        onChange={(e) =>
                          setNewAssignmentQty(
                            Math.max(1, Number(e.target.value) || 1)
                          )
                        }
                        className="col-span-1 bg-slate-900 border border-slate-700 rounded px-1 py-1 text-center text-[11px] font-bold text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddConstructionToNode}
                        className="col-span-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded py-1 text-[11px] font-extrabold"
                      >
                        +Tambah
                      </button>
                    </div>
                  </div>

                  {/* Assigned Constructions on This Pole */}
                  <div className="space-y-1.5">
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
                                title="Jumlah Set Konstruksi"
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
                                className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] font-bold"
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
                                className="p-0.5 text-rose-400 hover:text-rose-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-slate-700 space-y-1 text-[10px]">
                              {breakdown.rows.map((row) => (
                                <div
                                  key={row.khsId}
                                  className="flex items-center justify-between gap-2 text-slate-300"
                                >
                                  <span className="truncate flex-1">
                                    • {row.uraian}
                                  </span>
                                  <span className="font-mono text-amber-200 shrink-0">
                                    {row.volume} {row.satuan}
                                  </span>
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
        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200">
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
                Digambar Oleh (Surveyor)
              </label>
              <input
                type="text"
                value={petugasSurvei}
                onChange={(e) => onUpdatePetugasSurvei?.(e.target.value)}
                placeholder="Nama Petugas Survei"
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-end justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRoadSketch}
                  onChange={(e) => setShowRoadSketch(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Sketsa Jalan</span>
              </label>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
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
                  <option value={10}>10% (Sesuai Contoh KHS)</option>
                  <option value={11}>11%</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={newRowSection}
                onChange={(e) =>
                  setNewRowSection(e.target.value as RabRomanSection)
                }
                className="px-2 py-1 border border-slate-300 rounded bg-white text-[11px] font-bold"
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
                className="px-2 py-1 border border-slate-300 rounded bg-white text-[11px] font-bold max-w-[220px]"
              >
                {khsCatalogList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.uraian} ({k.gol} - Rp{' '}
                    {k.hargaSatuan.toLocaleString('id-ID')})
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
                className="w-14 px-2 py-1 border border-slate-300 rounded text-center font-bold"
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Item KHS
              </button>
            </div>
          </div>

          {renderOfficialRabTable(false)}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 4: GENERATE FILE SURVEY (PDF 3 HALAMAN)                       */}
      {/* ===================================================================== */}
      {viewTab === 'pdf3hal' && (
        <div className="space-y-6 bg-slate-100 p-4 rounded-xl border border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <h5 className="text-sm font-extrabold text-slate-900">
                Bundel Dokumen Hasil Survei Teknik &amp; RAB (3 Halaman Lengkap)
              </h5>
              <p className="text-xs text-slate-600">
                Halaman 1: Surat Permohonan Masuk (Security) • Halaman 2: Gambar
                Sketsa Survei Ber-Etiket PLN • Halaman 3: Tabel RAB Resmi PLN
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Cetak / Simpan PDF 3 Halaman
            </button>
          </div>

          {/* HALAMAN 1 / 3: SURAT PERMOHONAN MASUK (SECURITY) */}
          <div className="bg-white border-2 border-slate-900 p-6 rounded-sm shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
              <div>
                <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase">
                  HALAMAN 1 / 3 — LAMPIRAN SURAT PERMOHONAN SECURITY
                </span>
                <h4 className="text-sm font-black text-slate-900 uppercase mt-1">
                  DATA REGISTRASI SURAT PERMOHONAN MASUK (POSKO SECURITY /
                  LOKET)
                </h4>
              </div>
              <div className="text-right text-xs font-bold text-slate-600">
                No. Agenda: #{item.id.slice(-6)} • {item.tglSurat}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded border border-slate-200">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  Nama Pemohon
                </p>
                <p className="font-extrabold text-slate-900">{item.kontakPerson}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  No. Surat Permohonan
                </p>
                <p className="font-bold text-slate-900">
                  {item.suratPermohonan}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  Jenis Permohonan
                </p>
                <p className="font-bold text-indigo-700">
                  {item.transaksi} - {item.peruntukan}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  Lokasi Permohonan
                </p>
                <p className="font-bold text-slate-900">{item.alamat}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  Uraian Permohonan
                </p>
                <p className="font-bold text-slate-900">
                  {item.keteranganPekerjaan}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  File Lampiran Security
                </p>
                <p className="font-bold text-slate-800">
                  {item.suratPermohonan ||
                    'Teregistrasi di Posko Security'}
                </p>
              </div>
            </div>

            {item.suratPermohonanDataUrl ? (
              <div className="border border-slate-300 rounded p-2 bg-slate-50">
                <img
                  src={item.suratPermohonanDataUrl}
                  alt="Lampiran Surat Permohonan"
                  className="max-h-96 mx-auto object-contain"
                />
              </div>
            ) : (
              <div className="border border-dashed border-slate-300 rounded p-6 text-center text-xs text-slate-600 bg-slate-50">
                Dokumen fisik surat permohonan nomor{' '}
                <strong>{item.suratPermohonan}</strong> dari{' '}
                <strong>{item.kontakPerson}</strong> telah diverifikasi oleh bagian
                Security dan diteruskan ke bagian Teknik untuk pelaksanaan
                Survei &amp; penyusunan RAB.
              </div>
            )}
          </div>

          {/* HALAMAN 2 / 3: GAMBAR SKETSA SURVEI BER-ETIKET PLN */}
          <div className="bg-white border-2 border-slate-900 p-6 rounded-sm shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2">
              <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase">
                HALAMAN 2 / 3 — GAMBAR SKETSA SURVEI BER-ETIKET PLN
              </span>
              <span className="text-xs font-bold text-slate-600">
                Petugas Survei: {petugasSurvei || '-'} • Lokasi: {tagingLokasi}
              </span>
            </div>
            {renderEtiketEngineeringSvg()}
          </div>

          {/* HALAMAN 3 / 3: TABEL RENCANA ANGGARAN BIAYA (RAB) */}
          <div className="bg-white border-2 border-slate-900 p-6 rounded-sm shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2">
              <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase">
                HALAMAN 3 / 3 — RENCANA ANGGARAN BIAYA (RAB) RESMI PLN
              </span>
              <span className="text-xs font-extrabold text-slate-900">
                Total RAB (+PPN {ppnPercent}%): Rp{' '}
                {rabSummary.grandTotal.toLocaleString('id-ID')}
              </span>
            </div>
            {renderOfficialRabTable(true)}
          </div>
        </div>
      )}
    </div>
  );
};
