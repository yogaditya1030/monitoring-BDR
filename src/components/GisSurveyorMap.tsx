import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PermohonanItem } from '../types';
import { formatPowerVA, formatRupiah } from '../utils/plnValidation';
import {
  MapPin,
  Compass,
  Layers,
  ExternalLink,
  Wrench,
  Eye,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Navigation,
  Search,
  Filter,
  Flame,
} from 'lucide-react';

interface GisSurveyorMapProps {
  records: PermohonanItem[];
  onSelectRecord: (record: PermohonanItem) => void;
  onOpenWorkflowAction: (record: PermohonanItem) => void;
}

type MapFilterMode = 'survei' | 'rab' | 'survei_dan_mohon' | 'pfk_segera' | 'semua';

// Default center: ULP Borobudur (Kabupaten Magelang)
const DEFAULT_CENTER: [number, number] = [-7.5812, 110.2319];
const DEFAULT_ZOOM = 12;

export const GisSurveyorMap: React.FC<GisSurveyorMapProps> = ({
  records,
  onSelectRecord,
  onOpenWorkflowAction,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [filterMode, setFilterMode] = useState<MapFilterMode>('survei');
  const [selectedClusterArea, setSelectedClusterArea] = useState<string | null>(null);
  const [activeTileType, setActiveTileType] = useState<'streets' | 'satellite'>('streets');
  const [searchQuery, setSearchQuery] = useState('');

  // Helper: Permohonan berstatus SURVEI
  const isSurveiStatus = (r: PermohonanItem): boolean => {
    return r.status === 'SURVEI';
  };

  // Helper: Permohonan berstatus RAB
  const isRabStatus = (r: PermohonanItem): boolean => {
    return r.status === 'RAB';
  };

  // Helper: Permohonan antrean survei & RAB (SURVEI, RAB, maupun MOHON)
  const isSurveyQueue = (r: PermohonanItem): boolean => {
    return r.status === 'SURVEI' || r.status === 'RAB' || r.status === 'MOHON';
  };

  // Ekstrak area / kecamatan dari alamat untuk pengelompokan konsentrasi
  const extractAreaName = (alamat: string): string => {
    const upper = (alamat || '').toUpperCase();
    if (upper.includes('BOROBUDUR')) return 'Kec. Borobudur';
    if (upper.includes('MUNGKID')) return 'Kec. Mungkid';
    if (upper.includes('MUNTILAN')) return 'Kec. Muntilan';
    if (upper.includes('SALAMAN')) return 'Kec. Salaman';
    if (upper.includes('SAWANGAN')) return 'Kec. Sawangan';
    if (upper.includes('MERTOYUDAN')) return 'Kec. Mertoyudan';
    if (upper.includes('SRUMBUNG')) return 'Kec. Srumbung';
    if (upper.includes('TEMPURAN')) return 'Kec. Tempuran';
    if (upper.includes('CANDIMULYO')) return 'Kec. Candimulyo';
    if (upper.includes('DUKUN')) return 'Kec. Dukun';
    if (upper.includes('SALAM')) return 'Kec. Salam';
    return 'Wilayah ULP Borobudur';
  };

  // Parse koordinat Lat, Long
  const parseCoords = (taging: string): [number, number] | null => {
    if (!taging) return null;
    const parts = taging.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return null;
  };

  // Filter records berdasarkan mode dan search
  const visibleRecords = useMemo(() => {
    return records.filter((r) => {
      // Filter mode
      if (filterMode === 'survei') {
        if (!isSurveiStatus(r)) return false;
      } else if (filterMode === 'rab') {
        if (!isRabStatus(r)) return false;
      } else if (filterMode === 'survei_dan_mohon') {
        if (!isSurveyQueue(r)) return false;
      } else if (filterMode === 'pfk_segera') {
        if (r.transaksi !== 'PFK') return false;
      }
      // Mode 'semua' menampilkan seluruh permohonan

      // Filter area cluster bila dipilih
      if (selectedClusterArea) {
        if (extractAreaName(r.alamat) !== selectedClusterArea) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.projectName.toLowerCase().includes(q) ||
          r.alamat.toLowerCase().includes(q) ||
          r.noNodin.toLowerCase().includes(q) ||
          (r.nomorTiang && r.nomorTiang.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [records, filterMode, selectedClusterArea, searchQuery]);

  // Statistik konsentrasi permohonan per kecamatan sesuai mode filter aktif
  const concentrationClusters = useMemo(() => {
    const targetRecords =
      filterMode === 'survei'
        ? records.filter(isSurveiStatus)
        : filterMode === 'rab'
        ? records.filter(isRabStatus)
        : filterMode === 'survei_dan_mohon'
        ? records.filter(isSurveyQueue)
        : filterMode === 'pfk_segera'
        ? records.filter((r) => r.transaksi === 'PFK')
        : records;

    const groups: Record<
      string,
      { count: number; pfkCount: number; records: PermohonanItem[]; centerLat: number; centerLng: number }
    > = {};

    targetRecords.forEach((r) => {
      const area = extractAreaName(r.alamat);
      if (!groups[area]) {
        groups[area] = { count: 0, pfkCount: 0, records: [], centerLat: 0, centerLng: 0 };
      }
      groups[area].count += 1;
      if (r.transaksi === 'PFK') groups[area].pfkCount += 1;
      groups[area].records.push(r);
    });

    // Hitung titik tengah perkiraan per cluster
    Object.keys(groups).forEach((area) => {
      const coordsList = groups[area].records
        .map((r) => parseCoords(r.tagingLokasi))
        .filter((c): c is [number, number] => c !== null);

      if (coordsList.length > 0) {
        groups[area].centerLat =
          coordsList.reduce((acc, c) => acc + c[0], 0) / coordsList.length;
        groups[area].centerLng =
          coordsList.reduce((acc, c) => acc + c[1], 0) / coordsList.length;
      } else {
        groups[area].centerLat = DEFAULT_CENTER[0];
        groups[area].centerLng = DEFAULT_CENTER[1];
      }
    });

    return Object.entries(groups)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [records, filterMode]);

  // Total perhitungan untuk tombol filter
  const totalSurvei = useMemo(() => {
    return records.filter(isSurveiStatus).length;
  }, [records]);

  const totalRab = useMemo(() => {
    return records.filter(isRabStatus).length;
  }, [records]);

  const totalSurveiDanMohon = useMemo(() => {
    return records.filter(isSurveyQueue).length;
  }, [records]);

  const totalPfk = useMemo(() => {
    return records.filter((r) => r.transaksi === 'PFK').length;
  }, [records]);

  // Inisialisasi Peta Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Tile layer
      const streetsLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors • PT PLN (Persero)',
          maxZoom: 19,
        }
      );
      streetsLayer.addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Ganti Tile Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Bersihkan tile layers yang ada
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (activeTileType === 'satellite') {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar',
          maxZoom: 19,
        }
      ).addTo(map);
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          opacity: 0.85,
        }
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    }
  }, [activeTileType]);

  // Update Markers ketika visibleRecords berubah
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    visibleRecords.forEach((item) => {
      const coords = parseCoords(item.tagingLokasi);
      if (!coords) return;

      const isSurvei = item.status === 'SURVEI';
      const isRab = item.status === 'RAB';
      const isMohon = item.status === 'MOHON';
      const isSurveyItem = isSurvei || isRab || isMohon;
      const isPfk = item.transaksi === 'PFK';

      // Custom HTML Marker Icon
      let markerHtml = '';
      if (isSurveyItem) {
        // Marker Survei / RAB / Antrean Mohon
        markerHtml = `
          <div class="relative flex items-center justify-center cursor-pointer group">
            <span class="absolute w-8 h-8 rounded-full ${
              isPfk
                ? 'bg-rose-500 animate-ping opacity-75'
                : isRab
                ? 'bg-indigo-400 animate-ping opacity-70'
                : 'bg-amber-400 animate-ping opacity-70'
            }"></span>
            <div class="relative w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white ${
              isPfk
                ? 'bg-gradient-to-br from-rose-600 to-red-700 text-white font-extrabold text-xs'
                : isRab
                ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold text-xs'
                : 'bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 font-bold text-xs'
            }">
              ${isPfk ? '⚡' : isRab ? '🧮' : '📍'}
            </div>
            <div class="absolute -bottom-5 whitespace-nowrap bg-slate-900/90 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shadow-md pointer-events-none">
              ${isPfk ? `PFK (${item.status})` : item.status}
            </div>
          </div>
        `;
      } else {
        // Marker Sudah Disurvei / Selesai
        markerHtml = `
          <div class="relative flex items-center justify-center cursor-pointer">
            <div class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md border-2 border-white text-[10px] font-bold">
              ✓
            </div>
            <div class="absolute -bottom-4 whitespace-nowrap bg-slate-800/80 text-emerald-200 px-1 py-0.2 rounded text-[8px] font-bold pointer-events-none">
              ${item.status}
            </div>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-gis-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(coords, { icon: customIcon });

      // Popup Content yang Kaya Info untuk Surveyor
      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-800 text-xs leading-relaxed max-w-xs font-sans';
      popupContent.innerHTML = `
        <div class="border-b border-slate-200 pb-2 mb-2">
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
              isPfk
                ? 'bg-rose-600 text-white'
                : isSurvei
                ? 'bg-amber-500 text-slate-950'
                : isRab
                ? 'bg-indigo-600 text-white'
                : isMohon
                ? 'bg-teal-600 text-white'
                : 'bg-emerald-600 text-white'
            }">
              ${
                isPfk
                  ? `⚡ PFK - ${item.status}`
                  : isSurvei
                  ? '📐 Status: SURVEI'
                  : isRab
                  ? '🧮 Status: RAB'
                  : isMohon
                  ? '📋 Antrean Mohon'
                  : `✓ Status: ${item.status}`
              }
            </span>
            <span class="font-mono text-[10px] text-slate-500 font-bold">${item.noNodin}</span>
          </div>
          <div class="font-bold text-sm text-slate-950">${item.projectName}</div>
          <div class="text-[11px] text-slate-600 mt-0.5">${item.alamat}</div>
        </div>

        <div class="space-y-1 text-[11px] mb-3">
          <div class="flex justify-between">
            <span class="text-slate-500">Transaksi:</span>
            <span class="font-bold text-sky-800">${item.transaksi} (${formatPowerVA(item.dayaBaru)})</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Peruntukan:</span>
            <span class="truncate max-w-[150px] font-medium">${item.peruntukan}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Tiang Terdekat:</span>
            <span class="font-mono font-bold text-slate-900">${item.nomorTiang || '(Perlu Taging Lapangan)'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Kontak Pemohon:</span>
            <span class="font-mono font-bold text-emerald-700">${item.kontakPerson || '-'}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200">
          <a
            href="${item.linkMap || `https://maps.google.com/?q=${coords[0]},${coords[1]}`}"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold text-center transition shadow-2xs"
          >
            <span>Rute GPS</span>
          </a>
          <button
            id="btn-workflow-${item.id}"
            class="py-1.5 px-2 bg-sky-700 hover:bg-sky-800 text-white rounded text-[11px] font-bold text-center transition shadow-2xs cursor-pointer"
          >
            ${isSurveyItem ? 'Input Survei' : 'Proses'}
          </button>
        </div>
      `;

      // Bind click on popup button
      marker.bindPopup(popupContent, { maxWidth: 300 });
      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-workflow-${item.id}`);
        if (btn) {
          btn.onclick = () => {
            onOpenWorkflowAction(item);
          };
        }
      });

      markersGroup.addLayer(marker);
      bounds.extend(coords);
    });

    // Auto-fit bounds jika ada marker
    if (visibleRecords.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [visibleRecords, onOpenWorkflowAction]);

  // Fungsi untuk terbang ke koordinat cluster
  const handleFlyToCluster = (lat: number, lng: number, areaName: string) => {
    setSelectedClusterArea(selectedClusterArea === areaName ? null : areaName);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], 14, { duration: 1.2 });
    }
  };

  const handleResetView = () => {
    setSelectedClusterArea(null);
    setSearchQuery('');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1 });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col space-y-0">
      {/* Top Header & Surveyor Filter Toolbar */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-sky-950 to-blue-950 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-400 text-slate-950 rounded-lg shadow-xs">
              <Compass className="w-5 h-5 text-slate-950" />
            </span>
            <h3 className="text-base sm:text-lg font-bold tracking-tight">
              Peta GIS Sebaran Permohonan & Konsentrasi Survei
            </h3>
          </div>
          <p className="text-xs text-sky-200 mt-1">
            Visualisasi pemetaan titik permohonan yang belum disurvei untuk efisiensi rute inspeksi lapangan Tim Teknik ULP Borobudur
          </p>
        </div>

        {/* Filter Mode Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setFilterMode('survei');
              setSelectedClusterArea(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs ${
              filterMode === 'survei'
                ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Status Survei ({totalSurvei} Titik)</span>
          </button>

          <button
            onClick={() => {
              setFilterMode('rab');
              setSelectedClusterArea(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs ${
              filterMode === 'rab'
                ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
            <span>Status RAB ({totalRab} Titik)</span>
          </button>

          <button
            onClick={() => {
              setFilterMode('survei_dan_mohon');
              setSelectedClusterArea(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs ${
              filterMode === 'survei_dan_mohon'
                ? 'bg-amber-300 text-slate-950 ring-2 ring-amber-200'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span>+ Antrean Mohon ({totalSurveiDanMohon} Titik)</span>
          </button>

          <button
            onClick={() => {
              setFilterMode('pfk_segera');
              setSelectedClusterArea(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs ${
              filterMode === 'pfk_segera'
                ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Khusus PFK ({totalPfk})</span>
          </button>

          <button
            onClick={() => {
              setFilterMode('semua');
              setSelectedClusterArea(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              filterMode === 'semua'
                ? 'bg-sky-600 text-white font-bold ring-2 ring-sky-300'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            <span>Semua Titik ({records.length})</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Sidebar Cluster & Right Map */}
      <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[550px]">
        {/* SIDEBAR: Konsentrasi Wilayah Belum Disurvei */}
        <div className="lg:col-span-1 bg-slate-50 border-r border-slate-200 p-4 space-y-4 flex flex-col justify-between max-h-[600px] overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-600" />
                Konsentrasi Wilayah
              </h4>
              {selectedClusterArea && (
                <button
                  onClick={handleResetView}
                  className="text-[10px] text-sky-700 font-bold hover:underline"
                >
                  Reset Filter
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-500 leading-snug">
              Klik nama wilayah untuk langsung mengarahkan kamera peta ke konsentrasi permohonan surveyor:
            </p>

            {/* List Konsentrasi Per Kecamatan */}
            <div className="space-y-2">
              {concentrationClusters.length > 0 ? (
                concentrationClusters.map((cluster) => {
                  const isSelected = selectedClusterArea === cluster.name;
                  return (
                    <div
                      key={cluster.name}
                      onClick={() =>
                        handleFlyToCluster(cluster.centerLat, cluster.centerLng, cluster.name)
                      }
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition shadow-2xs flex items-center justify-between ${
                        isSelected
                          ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold shadow-xs'
                          : 'bg-white border-slate-200 hover:border-sky-400 hover:bg-sky-50/50 text-slate-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <MapPin
                            className={`w-3.5 h-3.5 ${
                              isSelected ? 'text-amber-700' : 'text-slate-500'
                            }`}
                          />
                          <span>{cluster.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {cluster.pfkCount > 0 && (
                            <span className="text-rose-600 font-bold mr-1">
                              ⚡ {cluster.pfkCount} PFK
                            </span>
                          )}
                          <span>Daya total: {cluster.records.reduce((acc, c) => acc + c.dayaBaru, 0) / 1000} kVA</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-extrabold shadow-2xs ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {cluster.count} Titik
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-500 italic">
                  Tidak ada permohonan yang menunggu survei di wilayah ini.
                </div>
              )}
            </div>

            {/* Quick Search */}
            <div className="pt-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari pemohon, alamat, tiang..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Quick Route Summary Card */}
          <div className="p-3 bg-gradient-to-br from-sky-900 to-blue-950 text-white rounded-xl text-xs space-y-2 mt-4 shadow-sm">
            <div className="font-bold flex items-center gap-1 text-sky-200">
              <Navigation className="w-3.5 h-3.5 text-amber-400" />
              <span>Panduan Survei Lapangan</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Prioritaskan survei permohonan <strong>PFK</strong> dan pelanggan daya besar (&ge;11 kVA) terlebih dahulu sebelum pemohon berdaya kecil.
            </p>
            <button
              onClick={handleResetView}
              className="w-full py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-semibold transition"
            >
              Fokuskan ke ULP Borobudur
            </button>
          </div>
        </div>

        {/* MAP CANVAS CONTAINER */}
        <div className="lg:col-span-3 relative h-[500px] lg:h-auto min-h-[500px]">
          {/* Leaflet map container */}
          <div ref={mapContainerRef} className="w-full h-full min-h-[500px] z-0" />

          {/* Floating Map Controls & Legend Overlay */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
            {/* Tile Layer Toggle */}
            <div className="bg-white/90 backdrop-blur-xs p-1.5 rounded-lg shadow-md border border-slate-200 flex items-center gap-1 text-xs">
              <button
                onClick={() => setActiveTileType('streets')}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                  activeTileType === 'streets'
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Peta Jalan
              </button>
              <button
                onClick={() => setActiveTileType('satellite')}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                  activeTileType === 'satellite'
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Satelit
              </button>
            </div>
          </div>

          {/* Floating Bottom Legend */}
          <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-xs px-3.5 py-2.5 rounded-xl shadow-lg border border-slate-200 text-xs flex flex-wrap items-center gap-4">
            <span className="font-bold text-slate-800 text-[11px]">Legenda Titik:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
              <span className="font-semibold text-rose-900">PFK Segera (Langsung Survei)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="font-semibold text-amber-950">PB/PD Menunggu Survei</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-600" />
              <span className="text-slate-600">Sudah Disurvei / Selesai</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
