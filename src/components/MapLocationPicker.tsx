import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, ExternalLink, Search } from 'lucide-react';
import { parseCoordinate } from '../utils/plnValidation';

interface MapLocationPickerProps {
  initialCoordinates?: string; // "lat, lng"
  onChange: (coordinates: string) => void;
  height?: string;
}

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  initialCoordinates,
  onChange,
  height = '280px',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Parse initial or fallback to ULP Borobudur central coordinates (-7.6079, 110.2038)
  const defaultLat = -7.6079;
  const defaultLng = 110.2038;

  const parseCoords = (str?: string): [number, number] => {
    const parsed = str ? parseCoordinate(str) : null;
    if (parsed) {
      return [parsed.lat, parsed.lng];
    }
    return [defaultLat, defaultLng];
  };

  const [currentCoords, setCurrentCoords] = useState<[number, number]>(() => parseCoords(initialCoordinates));
  const [coordInputText, setCoordInputText] = useState<string>(() => {
    const [lat, lng] = parseCoords(initialCoordinates);
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  });
  const [coordInputError, setCoordInputError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Sync if initialCoordinates prop changes externally (e.g., modal reset or external edit)
  useEffect(() => {
    if (!initialCoordinates) return;
    const parsed = parseCoordinate(initialCoordinates);
    if (!parsed) return;
    const fixedLat = parseFloat(parsed.lat.toFixed(6));
    const fixedLng = parseFloat(parsed.lng.toFixed(6));
    if (
      Math.abs(fixedLat - currentCoords[0]) > 0.000001 ||
      Math.abs(fixedLng - currentCoords[1]) > 0.000001
    ) {
      setCurrentCoords([fixedLat, fixedLng]);
      setCoordInputText(`${fixedLat.toFixed(6)}, ${fixedLng.toFixed(6)}`);
      if (mapInstanceRef.current && markerRef.current) {
        markerRef.current.setLatLng([fixedLat, fixedLng]);
        mapInstanceRef.current.setView([fixedLat, fixedLng], 16);
      }
    }
  }, [initialCoordinates]);

  // Quick preset locations within ULP Borobudur work area
  const presets = [
    { label: 'Candi Borobudur', lat: -7.6079, lng: 110.2038 },
    { label: 'Wanurejo', lat: -7.6105, lng: 110.218 },
    { label: 'Candirejo', lat: -7.625, lng: 110.229 },
    { label: 'Pasar Borobudur', lat: -7.604, lng: 110.2085 },
    { label: 'Kec. Salaman', lat: -7.585, lng: 110.142 },
    { label: 'Sawitan / Mungkid', lat: -7.575, lng: 110.235 },
  ];

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Fix Leaflet's default icon path issue with bundlers
    const icon = L.divIcon({
      className: 'custom-pin',
      html: `
        <div style="
          background-color: #dc2626;
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid #ffffff;
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="
            transform: rotate(45deg);
            color: #ffffff;
            font-size: 14px;
            font-weight: bold;
          ">⚡</span>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    const map = L.map(mapContainerRef.current, {
      center: currentCoords,
      zoom: 15,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | PLN ULP Borobudur',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(currentCoords, {
      draggable: true,
      icon,
    }).addTo(map);

    marker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
        <strong style="color: #0369a1;">Titik Permohonan PLN</strong><br/>
        ULP Borobudur, UP3 Magelang<br/>
        <span style="font-size: 10px; color: #64748b;">Geser pin atau klik peta untuk ubah lokasi</span>
      </div>
    `).openPopup();

    // Map click handler to set marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = parseFloat(e.latlng.lat.toFixed(6));
      const lng = parseFloat(e.latlng.lng.toFixed(6));
      marker.setLatLng([lat, lng]);
      setCurrentCoords([lat, lng]);
      setCoordInputText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      setCoordInputError(null);
      onChange(`${lat}, ${lng}`);
    });

    // Marker drag handler
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const lat = parseFloat(pos.lat.toFixed(6));
      const lng = parseFloat(pos.lng.toFixed(6));
      setCurrentCoords([lat, lng]);
      setCoordInputText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      setCoordInputError(null);
      onChange(`${lat}, ${lng}`);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const setLocation = (lat: number, lng: number) => {
    const fixedLat = parseFloat(lat.toFixed(6));
    const fixedLng = parseFloat(lng.toFixed(6));
    setCurrentCoords([fixedLat, fixedLng]);
    setCoordInputText(`${fixedLat.toFixed(6)}, ${fixedLng.toFixed(6)}`);
    setCoordInputError(null);
    onChange(`${fixedLat}, ${fixedLng}`);

    if (mapInstanceRef.current && markerRef.current) {
      markerRef.current.setLatLng([fixedLat, fixedLng]);
      mapInstanceRef.current.setView([fixedLat, fixedLng], 16);
      markerRef.current.openPopup();
    }
  };

  const handleApplyManualCoordinate = () => {
    const parsed = parseCoordinate(coordInputText);
    if (!parsed) {
      setCoordInputError('Format koordinat tidak valid. Contoh: -7.607900, 110.203800 atau link Google Maps.');
      return;
    }
    setLocation(parsed.lat, parsed.lng);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setCoordInputError('Fitur Geolocation tidak didukung di browser ini.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation warning, centering on ULP Borobudur', err);
        setLocation(defaultLat, defaultLng);
      },
      { timeout: 7000 }
    );
  };

  const googleMapsUrl = `https://www.google.com/maps?q=${currentCoords[0]},${currentCoords[1]}`;

  return (
    <div className="space-y-2">
      {/* Editable Coordinate / Google Maps Link Bar */}
      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-rose-600" />
            <span>Ketik / Tempel Koordinat (Lat, Long) atau Link Google Maps:</span>
          </label>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 font-semibold hover:underline"
          >
            <span>Buka di Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            data-testid="intake-coordinate-input"
            value={coordInputText}
            onChange={(e) => {
              const val = e.target.value;
              setCoordInputText(val);
              setCoordInputError(null);
              const parsed = parseCoordinate(val);
              if (parsed) {
                const fixedLat = parseFloat(parsed.lat.toFixed(6));
                const fixedLng = parseFloat(parsed.lng.toFixed(6));
                setCurrentCoords([fixedLat, fixedLng]);
                onChange(`${fixedLat}, ${fixedLng}`);
                if (mapInstanceRef.current && markerRef.current) {
                  markerRef.current.setLatLng([fixedLat, fixedLng]);
                  mapInstanceRef.current.setView([fixedLat, fixedLng], 16);
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyManualCoordinate();
              }
            }}
            placeholder="Contoh: -7.607900, 110.203800 atau tempel link Google Maps"
            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
          />
          <button
            type="button"
            data-testid="intake-apply-coordinate-btn"
            onClick={handleApplyManualCoordinate}
            className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-md text-xs font-bold flex items-center gap-1 shrink-0 transition cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Pusatkan Peta</span>
          </button>
        </div>

        {coordInputError && (
          <p className="text-[11px] text-red-600 font-semibold">{coordInputError}</p>
        )}
        <p className="text-[10px] text-slate-500">
          💡 Titik koordinat ini akan otomatis menjadi pusat peta saat <strong>Tim Teknik</strong> membuka Kanvas Survei GIS.
        </p>
      </div>

      {/* GPS Action Bar */}
      <div className="flex items-center justify-end text-xs">
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          className="flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-800 border border-sky-300 rounded hover:bg-sky-100 text-[11px] font-semibold transition cursor-pointer"
        >
          <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
          <span>{isLocating ? 'Mencari...' : 'Gunakan GPS Saya'}</span>
        </button>
      </div>

      {/* Interactive Leaflet Map Container */}
      <div className="relative rounded-lg overflow-hidden border-2 border-sky-600 shadow-sm">
        <div ref={mapContainerRef} style={{ height, width: '100%', zIndex: 10 }} />
        
        {/* Floating Instruction Overlay */}
        <div className="absolute top-2 right-2 z-20 bg-white/90 backdrop-blur-xs px-2 py-1 rounded text-[10px] font-bold text-sky-950 shadow-xs border border-slate-200 pointer-events-none">
          👆 Klik peta atau geser pin untuk titik lokasi
        </div>
      </div>

      {/* Selected Coordinates Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-emerald-50/70 border border-emerald-200 rounded-md text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            📍
          </div>
          <div>
            <div className="text-[10px] text-slate-600 font-medium">Titik Lokasi Permohonan (Tersimpan untuk Survei Teknik):</div>
            <div data-testid="intake-selected-coords-display" className="font-mono font-bold text-slate-900 text-xs">
              {currentCoords[0].toFixed(6)}, {currentCoords[1].toFixed(6)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
