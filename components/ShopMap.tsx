import React, { useEffect, useRef, useState } from 'react';
import { Coordinates } from '../types';

interface ShopMapProps {
  coordinates: Coordinates;
  shopName: string;
}

let mapsLoaded = false;
let mapsPromise: Promise<void> | null = null;
let mapsLoadFailed = false;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsLoaded) return Promise.resolve();
  if (mapsLoadFailed) return Promise.reject(new Error('Maps load failed'));
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => { mapsLoaded = true; resolve(); };
    script.onerror = () => { mapsLoadFailed = true; mapsPromise = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

const DARK_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
];

/** Fallback: OpenStreetMap iframe (gratuit, pas de clé API) */
const OsmFallback: React.FC<{ coordinates: Coordinates; shopName: string }> = ({ coordinates, shopName }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      Localisation
    </h3>
    <div className="rounded-xl overflow-hidden border border-gray-700 relative">
      <iframe
        title={`Carte - ${shopName}`}
        width="100%"
        height="256"
        style={{ border: 0, filter: 'invert(0.9) hue-rotate(180deg) brightness(0.9) contrast(1.1)' }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${coordinates.lng - 0.005},${coordinates.lat - 0.003},${coordinates.lng + 0.005},${coordinates.lat + 0.003}&layer=mapnik&marker=${coordinates.lat},${coordinates.lng}`}
      />
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg transition-colors flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        Ouvrir dans Maps
      </a>
    </div>
  </div>
);

const ShopMap: React.FC<ShopMapProps> = ({ coordinates, shopName }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'google' | 'fallback'>('loading');

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setStatus('fallback'); return; }

    loadGoogleMaps(apiKey)
      .then(() => {
        if (mapRef.current && (window as any).google?.maps) {
          const map = new (window as any).google.maps.Map(mapRef.current, {
            center: { lat: coordinates.lat, lng: coordinates.lng },
            zoom: 15,
            styles: DARK_MAP_STYLES,
            disableDefaultUI: true,
            zoomControl: true,
          });
          new (window as any).google.maps.Marker({
            position: { lat: coordinates.lat, lng: coordinates.lng },
            map,
            title: shopName,
          });
          setStatus('google');
        } else {
          setStatus('fallback');
        }
      })
      .catch(() => setStatus('fallback'));
  }, [coordinates, shopName]);

  if (status === 'fallback') {
    return <OsmFallback coordinates={coordinates} shopName={shopName} />;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        Localisation
      </h3>
      {status === 'loading' && <div className="h-48 md:h-64 bg-gray-800 rounded-xl animate-pulse" />}
      <div ref={mapRef} className={`h-48 md:h-64 rounded-xl overflow-hidden border border-gray-700 ${status === 'loading' ? 'hidden' : ''}`} />
    </div>
  );
};

export default ShopMap;
