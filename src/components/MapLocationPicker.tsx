import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Compass, ExternalLink, Check } from 'lucide-react';

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
    if (!str) return [defaultLat, defaultLng];
    const parts = str.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return [defaultLat, defaultLng];
  };

  const [currentCoords, setCurrentCoords] = useState<[number, number]>(() => parseCoords(initialCoordinates));
  const [isLocating, setIsLocating] = useState(false);

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
      zoom: 14,
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
      onChange(`${lat}, ${lng}`);
    });

    // Marker drag handler
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const lat = parseFloat(pos.lat.toFixed(6));
      const lng = parseFloat(pos.lng.toFixed(6));
      setCurrentCoords([lat, lng]);
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
    onChange(`${fixedLat}, ${fixedLng}`);

    if (mapInstanceRef.current && markerRef.current) {
      markerRef.current.setLatLng([fixedLat, fixedLng]);
      mapInstanceRef.current.setView([fixedLat, fixedLng], 15);
      markerRef.current.openPopup();
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Fitur Geolocation tidak didukung di browser ini.');
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
      {/* Action / Presets Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 font-semibold text-[11px]">Pilih Lokasi Cepat:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setLocation(p.lat, p.lng)}
              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-slate-700 text-[11px] font-medium border border-slate-200 transition"
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          className="flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-800 border border-sky-300 rounded hover:bg-sky-100 text-[11px] font-semibold transition"
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
          👆 Klik peta untuk titik lokasi
        </div>
      </div>

      {/* Selected Coordinates Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-md text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            📍
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Koordinat Terpilih (Lat, Long):</div>
            <div className="font-mono font-bold text-slate-900 text-xs">
              {currentCoords[0].toFixed(6)}, {currentCoords[1].toFixed(6)}
            </div>
          </div>
        </div>

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
    </div>
  );
};
