import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Free OpenStreetMap picker. Loaded lazily on the client only.
export default function MapPicker({
  lat, lon, radius, onPick,
}: { lat: number | null; lon: number | null; radius: number; onPick: (lat: number, lon: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current).setView([lat ?? 19.9975, lon ?? 73.7898], lat ? 17 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pickRef.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    marker.current?.remove();
    circle.current?.remove();
    if (lat == null || lon == null) return;
    marker.current = L.circleMarker([lat, lon], { radius: 7, weight: 2 }).addTo(m);
    circle.current = L.circle([lat, lon], { radius, weight: 1, fillOpacity: 0.15 }).addTo(m);
  }, [lat, lon, radius]);

  return <div ref={el} className="h-80 w-full overflow-hidden rounded-lg border border-border" />;
}
