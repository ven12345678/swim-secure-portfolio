"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, History, Check, X, Map as MapIcon, Loader2 } from 'lucide-react';
import { LocationData } from '../types';
import 'leaflet/dist/leaflet.css';

// We dynamically import react-leaflet components because leaflet requires window object
import dynamic from 'next/dynamic';
import type { MapContainer as MapContainerType, TileLayer as TileLayerType, Marker as MarkerType, useMap as useMapType } from 'react-leaflet';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);

// Leaflet default icon fix
let DefaultIconFixed = false;
const fixLeafletIcon = async () => {
  if (DefaultIconFixed) return;
  const L = (await import('leaflet')).default;
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
  DefaultIconFixed = true;
};

// Component to recenter map when selection changes
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const { useMap } = require('react-leaflet');
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 15);
  }, [lat, lng, map]);
  return null;
}

interface LocationSelectorProps {
  isOpen: boolean;
  onSelect: (location: LocationData) => void;
  onCancel: () => void;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

function PlaceAutocomplete({ onPlaceSelect }: { onPlaceSelect: (place: LocationData | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length > 2) {
        setIsSearching(true);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'SwimSecure-App'
            }
          });
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        placeholder="Search for pool location (e.g. city, street)..."
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-12 py-3.5 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
      />
      {isSearching && (
        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin" />
      )}
      
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-20 max-h-60 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.place_id}
              onClick={() => {
                setQuery(result.display_name);
                setShowDropdown(false);
                onPlaceSelect({
                  address: result.display_name,
                  lat: parseFloat(result.lat),
                  lng: parseFloat(result.lon)
                });
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-sm font-medium text-slate-700"
            >
              {result.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LocationSelector({ isOpen, onSelect, onCancel }: LocationSelectorProps) {
  const [history, setHistory] = useState<LocationData[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 3.1412, lng: 101.6865 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fixLeafletIcon();
    
    const saved = localStorage.getItem('swimsecure_locations');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse location history");
      }
    }
  }, [isOpen]);

  const saveToHistory = (loc: LocationData) => {
    const saved = localStorage.getItem('swimsecure_locations');
    let currentHistory: LocationData[] = saved ? JSON.parse(saved) : [];
    
    currentHistory = currentHistory.filter(h => h.address !== loc.address);
    currentHistory.unshift(loc);
    
    if (currentHistory.length > 5) {
      currentHistory = currentHistory.slice(0, 5);
    }
    
    localStorage.setItem('swimsecure_locations', JSON.stringify(currentHistory));
    setHistory(currentHistory);
  };

  const handlePlaceSelect = (place: LocationData | null) => {
    if (place) {
      setSelectedLocation(place);
      setMapCenter({ lat: place.lat, lng: place.lng });
    }
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      saveToHistory(selectedLocation);
      onSelect(selectedLocation);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md">
      <div className="bg-white text-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Pool Location</h2>
              <p className="text-xs text-slate-500 font-medium">Set the location for emergency dispatch</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {/* Search */}
          <div className="mb-6 relative z-20">
            <PlaceAutocomplete onPlaceSelect={handlePlaceSelect} />
          </div>

          {/* Map Preview */}
          <div className="w-full h-48 rounded-xl bg-slate-100 border border-slate-200 mb-6 overflow-hidden relative z-10">
            {mounted && (
              <MapContainer 
                center={[mapCenter.lat, mapCenter.lng]} 
                zoom={15} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {selectedLocation && (
                  <>
                    <Marker position={[selectedLocation.lat, selectedLocation.lng]} />
                    <RecenterMap lat={selectedLocation.lat} lng={selectedLocation.lng} />
                  </>
                )}
              </MapContainer>
            )}
            {!selectedLocation && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm z-10 pointer-events-none">
                <MapIcon className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-500">Search to drop a pin</p>
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Recent Locations
              </h3>
              <div className="space-y-2">
                {history.map((loc, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedLocation(loc);
                      setMapCenter({ lat: loc.lat, lng: loc.lng });
                    }}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedLocation?.address === loc.address 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                    }`}
                  >
                    <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${selectedLocation?.address === loc.address ? 'text-blue-500' : 'text-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${selectedLocation?.address === loc.address ? 'text-blue-900' : 'text-slate-700'}`}>
                        {loc.address}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {loc.lat.toFixed(4)}°, {loc.lng.toFixed(4)}°
                      </p>
                    </div>
                    {selectedLocation?.address === loc.address && (
                      <Check className="w-4 h-4 text-blue-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button 
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md ${
              selectedLocation 
                ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-95' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}
