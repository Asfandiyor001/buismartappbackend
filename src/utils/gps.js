/**
 * Ikki nuqta orasidagi masofa (metr) — Haversine formulasi.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRad(Number(lat1));
  const φ2 = toRad(Number(lat2));
  const Δφ = toRad(Number(lat2) - Number(lat1));
  const Δλ = toRad(Number(lon2) - Number(lon1));

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Foydalanuvchi binoning radius ichidami.
 * building: { latitude, longitude, radius_m }
 */
function isInsideBuilding(userLat, userLon, building) {
  const lat = Number(building.latitude);
  const lon = Number(building.longitude);
  const radiusM = Number(building.radius_m) || 0;
  const d = haversineDistance(userLat, userLon, lat, lon);
  return d <= radiusM;
}

module.exports = {
  haversineDistance,
  isInsideBuilding,
};
