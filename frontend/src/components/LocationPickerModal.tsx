import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Search, 
  Navigation, 
  X, 
  Check, 
  AlertCircle, 
  Compass, 
  Globe,
  Loader2
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { SafeMapBoundary } from './SafeMapBoundary';
import { useAuth } from '../context/AuthContext';
import { 
  fetchMapsConfig, 
  reverseGeocodeCoordinates, 
  forwardGeocodeAddress, 
  searchPlacesAutocomplete,
  type PlacePrediction 
} from '../lib/mapsApi';
import type { EntryLocation } from '../types/entry';

interface LocationPickerModalProps {
  currentLocation?: EntryLocation | null;
  onSaveLocation: (location: EntryLocation | null) => void;
  onClose: () => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  currentLocation,
  onSaveLocation,
  onClose,
}) => {
  const { idToken } = useAuth();

  const [mapsConfig, setMapsConfig] = useState<{ hasClientKey: boolean; clientKey: string }>({
    hasClientKey: false,
    clientKey: '',
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);
  const [locatingUser, setLocatingUser] = useState<boolean>(false);

  // Active selected location state
  const [selectedName, setSelectedName] = useState<string>(currentLocation?.name || '');
  const [selectedAddress, setSelectedAddress] = useState<string>(currentLocation?.address || '');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number }>(() => ({
    lat: currentLocation?.lat ?? 37.7749,
    lng: currentLocation?.lng ?? -122.4194,
  }));
  const [manualPlaceInput, setManualPlaceInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch maps client configuration on mount
  useEffect(() => {
    fetchMapsConfig().then((cfg) => setMapsConfig(cfg));
  }, []);

  // Debounced search for places
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setPredictions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const results = await searchPlacesAutocomplete(q, idToken);
        setPredictions(results);
      } catch (err: any) {
        console.warn('Search error:', err);
      } finally {
        setLoadingSearch(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, idToken]);

  // Select place from autocomplete
  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setLoadingSearch(true);
    setSearchQuery('');
    setPredictions([]);
    setErrorMessage(null);

    try {
      const geo = await forwardGeocodeAddress(prediction.description, idToken);
      setSelectedName(geo.name || prediction.description.split(',')[0]);
      setSelectedAddress(geo.formatted_address || prediction.description);
      setSelectedCoords({ lat: geo.lat, lng: geo.lng });
    } catch (err: any) {
      // Graceful fallback
      setSelectedName(prediction.description.split(',')[0]);
      setSelectedAddress(prediction.description);
    } finally {
      setLoadingSearch(false);
    }
  };

  // HTML5 Browser Geolocation with reverse geocoding & resilient fallback
  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser or environment. You can type your place below or select a quick preset.');
      return;
    }

    setLocatingUser(true);
    setErrorMessage(null);

    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = Number(pos.coords.latitude.toFixed(4));
            const lng = Number(pos.coords.longitude.toFixed(4));
            setSelectedCoords({ lat, lng });

            try {
              const geo = await reverseGeocodeCoordinates(lat, lng, idToken);
              setSelectedName(geo.name || `Latitude ${lat}, Longitude ${lng}`);
              setSelectedAddress(geo.formatted_address || `Coordinates (${lat}, ${lng})`);
            } catch {
              setSelectedName(`Current Spot (${lat}, ${lng})`);
              setSelectedAddress(`GPS Coordinates (${lat}, ${lng})`);
            }
          } catch (innerErr) {
            console.warn('Geolocation parsing error:', innerErr);
          } finally {
            setLocatingUser(false);
          }
        },
        (err) => {
          setLocatingUser(false);
          console.warn('Geolocation error:', err);
          if (err.code === 1) {
            setErrorMessage('Location permission was not granted by your browser or OS. You can select a quick preset or type your place name below!');
          } else if (err.code === 2) {
            setErrorMessage('GPS/Network position is unavailable on this system. You can easily pick a quick preset or type your location below.');
          } else if (err.code === 3) {
            setErrorMessage('Location request timed out. Please select a quick preset or type your location below.');
          } else {
            setErrorMessage('Could not determine location. Please select a quick preset or type your location below.');
          }
        },
        { timeout: 6000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    } catch (e: any) {
      setLocatingUser(false);
      console.warn('Exception calling geolocation:', e);
      setErrorMessage('Geolocation is restricted on this device. You can easily type your place name below!');
    }
  };

  // Add custom manual place
  const handleApplyManualPlace = () => {
    const raw = manualPlaceInput.trim();
    if (!raw) return;
    setSelectedName(raw);
    setSelectedAddress(raw);
    setManualPlaceInput('');
  };

  // Confirm and save location
  const handleConfirmLocation = () => {
    if (!selectedName.trim()) {
      setErrorMessage('Please select or enter a place name.');
      return;
    }

    onSaveLocation({
      name: selectedName.trim(),
      address: selectedAddress.trim() || undefined,
      lat: Number(selectedCoords.lat.toFixed(4)),
      lng: Number(selectedCoords.lng.toFixed(4)),
    });
    onClose();
  };

  // Clear / remove location
  const handleRemoveLocation = () => {
    onSaveLocation(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Anchor Geo-Spatial Location
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Associates this reflection with a place, city, or coordinate (~11m privacy)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Search & Current Location Actions */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city, neighborhood, landmark..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {loadingSearch && (
                <Loader2 className="absolute right-3.5 top-3 h-4 w-4 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Predictions Dropdown */}
            {predictions.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700 shadow-lg max-h-40 overflow-y-auto">
                {predictions.map((p) => (
                  <div
                    key={p.place_id}
                    onClick={() => handleSelectPrediction(p)}
                    className="p-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer flex items-center gap-2 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{p.description}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Use Current Location Button */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locatingUser}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all"
            >
              {locatingUser ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              ) : (
                <Navigation className="h-3.5 w-3.5 text-indigo-500" />
              )}
              <span>{locatingUser ? 'Detecting coordinates...' : 'Use Current Location'}</span>
            </button>
          </div>

          {/* Interactive Map Preview or Safe Fallback Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden h-44 relative bg-slate-100 dark:bg-slate-800/80">
            {mapsConfig.hasClientKey && mapsConfig.clientKey ? (
              <SafeMapBoundary
                fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-2 bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-slate-900">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                      <Compass className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {selectedName || 'Coordinates Anchored'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        Lat: {selectedCoords.lat.toFixed(4)} • Lng: {selectedCoords.lng.toFixed(4)}
                      </p>
                    </div>
                  </div>
                }
              >
                <APIProvider apiKey={mapsConfig.clientKey}>
                  <Map
                    defaultCenter={selectedCoords}
                    center={selectedCoords}
                    defaultZoom={13}
                    gestureHandling="cooperative"
                    disableDefaultUI={true}
                    className="w-full h-full"
                  >
                    <AdvancedMarker position={selectedCoords}>
                      <Pin background="#10b981" glyphColor="#ffffff" borderColor="#047857" />
                    </AdvancedMarker>
                  </Map>
                </APIProvider>
              </SafeMapBoundary>
            ) : (
              /* Serene Fallback Card when Maps API key is not configured */
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-2 bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-slate-900">
                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                  <Compass className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {selectedName || 'Coordinates Anchored'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Lat: {selectedCoords.lat.toFixed(4)} • Lng: {selectedCoords.lng.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                    ✓ Privacy protected: coordinates truncated to 4 decimal places (~11m)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Presets Chips */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Quick Presets:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Home Workspace', emoji: '🏠', lat: 37.7749, lng: -122.4194 },
                { label: 'Library / Study', emoji: '📚', lat: 37.7750, lng: -122.4190 },
                { label: 'Quiet Café', emoji: '☕', lat: 37.7755, lng: -122.4180 },
                { label: 'Nature / Park', emoji: '🌲', lat: 37.7690, lng: -122.4835 },
                { label: 'Transit / Commute', emoji: '🚆', lat: 37.7760, lng: -122.4170 },
                { label: 'Studio / Office', emoji: '💼', lat: 37.7800, lng: -122.4050 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setSelectedName(p.label);
                    setSelectedAddress(p.label);
                    setSelectedCoords({ lat: p.lat, lng: p.lng });
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] transition-colors"
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Place Input / Fallback */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Or Type Place Manually
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualPlaceInput}
                onChange={(e) => setManualPlaceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApplyManualPlace())}
                placeholder="e.g. Zen Retreat Cabin, Mountain Highs"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleApplyManualPlace}
                disabled={!manualPlaceInput.trim()}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium disabled:opacity-50"
              >
                Set Place
              </button>
            </div>
          </div>

          {/* Currently Selected Summary */}
          {selectedName && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-semibold text-indigo-900 dark:text-indigo-200 truncate">
                  {selectedName}
                </span>
              </div>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono shrink-0">
                {selectedCoords.lat.toFixed(4)}, {selectedCoords.lng.toFixed(4)}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div>
            {currentLocation && (
              <button
                type="button"
                onClick={handleRemoveLocation}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
              >
                Remove Location
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmLocation}
              disabled={!selectedName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Attach Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
