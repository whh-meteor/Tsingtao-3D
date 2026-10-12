import SunCalc from 'suncalc';

export const ORIGIN = { longitude: 120.3163, latitude: 36.0603 };
export function chinaDateParts(date: Date) {
  const d = new Date(date.getTime() + 8 * 3600000);
  return { date: d.toISOString().slice(0, 10), hours: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 };
}
export function chinaTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}
export function chinaInstant(day: string, hours: number): Date {
  return new Date(new Date(`${day}T00:00:00+08:00`).getTime() + hours * 3600000);
}
/** SunCalc azimuth is measured from south toward west. Babylon axes: +X east, +Y up, +Z north. */
export function solarState(date: Date) {
  const p = SunCalc.getPosition(date, ORIGIN.latitude, ORIGIN.longitude);
  const c = Math.cos(p.altitude);
  const direction = { x: -Math.sin(p.azimuth) * c, y: Math.sin(p.altitude), z: -Math.cos(p.azimuth) * c };
  const daylight = Math.max(0, Math.min(1, (p.altitude + 0.10) / 0.25));
  const sunlight = Math.max(0, Math.sin(p.altitude));
  const moon = SunCalc.getMoonPosition(date, ORIGIN.latitude, ORIGIN.longitude);
  return { direction, daylight, sunlight, altitude: p.altitude * 180 / Math.PI, azimuth: (p.azimuth * 180 / Math.PI + 180 + 360) % 360, moonDirection: {x:-Math.sin(moon.azimuth)*Math.cos(moon.altitude),y:Math.sin(moon.altitude),z:-Math.cos(moon.azimuth)*Math.cos(moon.altitude)}, moonIllumination: SunCalc.getMoonIllumination(date).fraction };
}
