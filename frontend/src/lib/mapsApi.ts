function getAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface GeocodeResult {
  formatted_address: string;
  name: string;
  lat: number;
  lng: number;
  privacy_note?: string;
}

export interface PlacePrediction {
  description: string;
  place_id: string;
  main_text?: string;
}

export async function fetchMapsConfig(): Promise<{ hasClientKey: boolean; clientKey: string }> {
  try {
    const res = await fetch('/api/maps/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch maps config:', err);
  }
  return { hasClientKey: false, clientKey: '' };
}

export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
  token: string | null
): Promise<GeocodeResult> {
  const res = await fetch('/api/maps/geocode', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ lat, lng }),
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed with status ${res.status}`);
  }

  return await res.json();
}

export async function forwardGeocodeAddress(
  address: string,
  token: string | null
): Promise<GeocodeResult> {
  const res = await fetch('/api/maps/geocode', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ address }),
  });

  if (!res.ok) {
    throw new Error(`Address geocoding failed with status ${res.status}`);
  }

  return await res.json();
}

export async function searchPlacesAutocomplete(
  query: string,
  token: string | null
): Promise<PlacePrediction[]> {
  const res = await fetch('/api/maps/search', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return data.predictions || [];
}
