// Server-side proxy for nearby-mosque search. The public Overpass API (and
// every one of its mirrors) proved unreliable across several independent
// tests -- 504s/timeouts confirmed live from both a real end-user device and
// this very server, at the same moment. Nominatim -- the same OSM search
// service already used client-side for city lookups -- has been reliable in
// every test this session, so this proxy searches it by keyword within a
// bounding box around the user instead of querying Overpass by amenity tag.
// Less precise than a true tag search (a mosque with neither "mosque",
// "masjid" nor "islamic" in its name/address won't match), but it works.
const TERMS = ['mosque', 'masjid', 'islamic centre', 'islamic center'];
const RADIUS_KM = 15;
const NOMINATIM_DELAY_MS = 1100; // Nominatim's usage policy caps this at 1 req/sec

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchTerm(term, viewbox) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: term, format: 'jsonv2', limit: '20', viewbox, bounded: '1', addressdetails: '1',
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SalaahClock/1.0 (+https://salaah-clock.vercel.app)' },
    });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Reshape a Nominatim hit into the Overpass "element" shape the client's
// processData() already knows how to read, so the client needed no changes.
function toElement(hit) {
  const a = hit.address || {};
  const tags = {
    name: hit.namedetails?.name || hit.display_name.split(',')[0],
    'addr:city': a.city || a.town || a.suburb || a.village || '',
    'addr:street': a.road || '',
    'addr:housenumber': a.house_number || '',
  };
  return { id: hit.osm_type + '_' + hit.osm_id, lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), tags };
}

export default async function handler(req, res) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng query params are required' });
    return;
  }

  const latD = RADIUS_KM / 111;
  const lngD = RADIUS_KM / (111 * Math.cos(lat * Math.PI / 180));
  const viewbox = `${lng - lngD},${lat + latD},${lng + lngD},${lat - latD}`;

  const seen = new Map();
  for (let i = 0; i < TERMS.length; i++) {
    const hits = await searchTerm(TERMS[i], viewbox);
    for (const hit of hits) {
      const key = hit.osm_type + hit.osm_id;
      if (!seen.has(key)) seen.set(key, hit);
    }
    if (i < TERMS.length - 1) await sleep(NOMINATIM_DELAY_MS);
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
  res.status(200).json({ elements: [...seen.values()].map(toElement) });
}
