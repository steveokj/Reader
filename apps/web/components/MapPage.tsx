"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

type MapLibreModule = typeof import("maplibre-gl");
type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
type GeoFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

const DEFAULT_CENTER: [number, number] = [12, 22];
const DEFAULT_ZOOM = 1.6;

const baseStyle = {
  version: 8 as const,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#f3efe6",
      },
    },
  ],
};

type Bounds = { west: number; south: number; east: number; north: number };

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePlaces(value: string) {
  const normalized = value.replace(/[–—-]+/g, " to ");
  return normalized
    .split(/\s+to\s+|,|&|\/|\s+and\s+|\+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function expandCoords(coords: number[][], bounds: Bounds) {
  coords.forEach(([lng, lat]) => {
    bounds.west = Math.min(bounds.west, lng);
    bounds.south = Math.min(bounds.south, lat);
    bounds.east = Math.max(bounds.east, lng);
    bounds.north = Math.max(bounds.north, lat);
  });
}

function collectBounds(geometry: GeoJSON.Geometry, bounds: Bounds) {
  switch (geometry.type) {
    case "Point":
      expandCoords([geometry.coordinates as number[]], bounds);
      break;
    case "MultiPoint":
    case "LineString":
      expandCoords(geometry.coordinates as number[][], bounds);
      break;
    case "MultiLineString":
    case "Polygon":
      (geometry.coordinates as number[][][]).forEach((ring) => expandCoords(ring, bounds));
      break;
    case "MultiPolygon":
      (geometry.coordinates as number[][][][]).forEach((poly) =>
        poly.forEach((ring) => expandCoords(ring, bounds))
      );
      break;
    case "GeometryCollection":
      geometry.geometries.forEach((geom) => collectBounds(geom, bounds));
      break;
    default:
      break;
  }
}

function unionBounds(features: GeoFeature[]): Bounds | null {
  if (features.length === 0) {
    return null;
  }
  const bounds: Bounds = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };
  features.forEach((feature) => {
    if (!feature.geometry) {
      return;
    }
    collectBounds(feature.geometry, bounds);
  });
  if (!Number.isFinite(bounds.west)) {
    return null;
  }
  return bounds;
}

function applySelection(map: MapLibreMap, iso2Codes: string[]) {
  if (!map.getLayer("countries-fill")) {
    return;
  }
  const normalized = iso2Codes.map((code) => code.toUpperCase());
  map.setPaintProperty("countries-fill", "fill-color", [
    "case",
    ["in", ["get", "ISO3166-1-Alpha-2"], ["literal", normalized]],
    "#d9663f",
    "#d9b895",
  ]);
}

export default function MapPage() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const countriesRef = useRef<GeoFeatureCollection | null>(null);
  const countriesIndexRef = useRef<Map<string, GeoFeature>>(new Map());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let maplibre: MapLibreModule | null = null;

    const addCountries = async (map: MapLibreMap) => {
      if (map.getSource("countries")) {
        return;
      }
      setDataStatus("loading");
      try {
        const response = await fetch("/data/countries.geojson");
        if (!response.ok) {
          throw new Error("Failed to load countries");
        }
        const data = await response.json();
        if (cancelled || map.getSource("countries")) {
          return;
        }
        map.addSource("countries", {
          type: "geojson",
          data,
        });
        countriesRef.current = data as GeoFeatureCollection;
        const index = new Map<string, GeoFeature>();
        (data.features ?? []).forEach((feature: GeoFeature) => {
          const props = feature.properties ?? {};
          const name = String(props.name ?? "").trim();
          const iso2 = String(props["ISO3166-1-Alpha-2"] ?? "").trim();
          const iso3 = String(props["ISO3166-1-Alpha-3"] ?? "").trim();
          if (name) {
            index.set(normalizeKey(name), feature);
          }
          if (iso2) {
            index.set(normalizeKey(iso2), feature);
          }
          if (iso3) {
            index.set(normalizeKey(iso3), feature);
          }
        });
        countriesIndexRef.current = index;
        if (!map.getLayer("countries-fill")) {
          map.addLayer({
            id: "countries-fill",
            type: "fill",
            source: "countries",
            paint: {
              "fill-color": "#d9b895",
              "fill-opacity": 0.6,
            },
          });
        }
        if (!map.getLayer("countries-outline")) {
          map.addLayer({
            id: "countries-outline",
            type: "line",
            source: "countries",
            paint: {
              "line-color": "#6b4c3b",
              "line-width": 1.4,
            },
          });
        }
        setDataStatus("ready");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setDataStatus("error");
        }
      }
    };

    let handleResize: (() => void) | null = null;

    const init = async () => {
      if (!containerRef.current || mapRef.current) {
        return;
      }
      maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) {
        return;
      }
      const map = new maplibre.Map({
        container: containerRef.current,
        style: baseStyle,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });
      map.addControl(new maplibre.NavigationControl(), "top-right");
      map.setRenderWorldCopies(false);
      map.on("load", () => {
        setMapReady(true);
        void addCountries(map);
      });
      map.on("error", (event) => {
        console.error(event?.error ?? event);
        setDataStatus("error");
      });
      mapRef.current = map;
    };

    void init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      if (!mapReady || dataStatus !== "ready") {
        setStatus("Map is still loading.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }
      const map = mapRef.current;
      const index = countriesIndexRef.current;
      if (!map || index.size === 0) {
        setStatus("Countries data not ready.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }
      const terms = parsePlaces(trimmed);
      const matches = terms
        .map((term) => index.get(normalizeKey(term)) ?? null)
        .filter(Boolean) as GeoFeature[];
      if (matches.length === 0) {
        setStatus("No countries matched.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }
      const bbox = unionBounds(matches);
      if (!bbox) {
        setStatus("Unable to compute bounds.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }
      const selectedIso2 = matches
        .map((feature) => String(feature.properties?.["ISO3166-1-Alpha-2"] ?? "").trim())
        .filter(Boolean);
      applySelection(map, selectedIso2);
      map.fitBounds(
        [
          [bbox.west, bbox.south],
          [bbox.east, bbox.north],
        ],
        { padding: 60, duration: 800 }
      );
      setStatus(`Showing ${selectedIso2.join(", ") || matches.length} countries.`);
      window.setTimeout(() => setStatus(null), 2000);
    },
    [dataStatus, mapReady, query]
  );

  return (
    <div className="map-page">
      <header className="map-toolbar">
        <div className="map-toolbar__title">Map</div>
        <form className="map-toolbar__controls" onSubmit={handleSubmit}>
          <input
            className="map-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Italy to Turkey"
          />
          <button
            type="submit"
            className="map-button"
            disabled={!query.trim() || !mapReady || dataStatus !== "ready"}
          >
            Go
          </button>
          <button type="button" className="map-button map-button--secondary" disabled>
            Save view
          </button>
        </form>
      </header>
      <div className="map-shell">
        <div className="map-canvas" ref={containerRef} />
        <aside className="map-sidepanel">
          <div className="map-sidepanel__section">
            <div className="map-sidepanel__title">Saved Views</div>
            <div className="map-sidepanel__empty">No saved views yet.</div>
          </div>
          <div className="map-sidepanel__section">
            <div className="map-sidepanel__title">Layers</div>
            <label className="map-toggle">
              <input type="checkbox" disabled />
              <span>City labels</span>
            </label>
            <label className="map-toggle">
              <input type="checkbox" disabled />
              <span>Selected country labels</span>
            </label>
          </div>
        </aside>
        {!mapReady ? (
          <div className="map-loading">
            <div className="map-loading__card">
              <span className="explore-spinner" aria-hidden="true" />
              <div>Loading map…</div>
            </div>
          </div>
        ) : null}
        {status ? <div className="map-toast">{status}</div> : null}
        {dataStatus === "error" ? (
          <div className="map-toast map-toast--error">Failed to load map data.</div>
        ) : null}
      </div>
    </div>
  );
}
