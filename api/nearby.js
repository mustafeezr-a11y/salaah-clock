// Server-side proxy for nearby-mosque search. The public Overpass mirrors are
// unreliable/blocked from some end-user networks when called directly from the
// browser (confirmed live: a real device got "Failed to fetch" while this same
// query succeeded from server-side infrastructure) -- routing through Vercel's
// network sidesteps that, and lets one retry chain serve every visitor instead
// of each browser repeating its own.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

export default async function handler(req, res) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng query params are required' });
    return;
  }

  const q = `[out:json][timeout:20];(node["amenity"="place_of_worship"]["religion"="muslim"](around:15000,${lat},${lng});way["amenity"="place_of_worship"]["religion"="muslim"](around:15000,${lat},${lng}););out center 12;`;

  for (const url of ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(url, { method: 'POST', body: q, signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
      res.status(200).json(data);
      return;
    } catch (e) {
      // try the next mirror
    }
  }
  res.status(502).json({ error: 'all upstream Overpass endpoints failed' });
}
