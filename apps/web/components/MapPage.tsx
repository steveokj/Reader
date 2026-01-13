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
  const normalized = value.replace(/-+/g, " to ");
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

function boundsFromGeometry(geometry: GeoJSON.Geometry): Bounds | null {
  const bounds: Bounds = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };
  collectBounds(geometry, bounds);
  if (!Number.isFinite(bounds.west)) {
    return null;
  }
  return bounds;
}

function buildLabelCollection(features: GeoFeature[]) {
  const bestByIso2 = new Map<
    string,
    { feature: GeoFeature; bounds: Bounds; area: number; name: string }
  >();
  features.forEach((feature) => {
    const props = feature.properties ?? {};
    const iso2 = String(props["ISO3166-1-Alpha-2"] ?? "").trim().toUpperCase();
    const name = String(props.name ?? "").trim();
    if (!iso2 || !feature.geometry) {
      return;
    }
    const bounds = boundsFromGeometry(feature.geometry);
    if (!bounds) {
      return;
    }
    const area = Math.abs((bounds.east - bounds.west) * (bounds.north - bounds.south));
    const existing = bestByIso2.get(iso2);
    if (!existing || area > existing.area) {
      bestByIso2.set(iso2, { feature, bounds, area, name });
    }
  });

  const labelFeatures: GeoFeature[] = [];
  bestByIso2.forEach((entry, iso2) => {
    const { bounds, name } = entry;
    labelFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2],
      },
      properties: {
        name,
        "ISO3166-1-Alpha-2": iso2,
      },
    });
  });

  return {
    type: "FeatureCollection",
    features: labelFeatures,
  } as GeoFeatureCollection;
}

function buildStateLabelCollection(features: GeoFeature[]) {
  const bestByKey = new Map<
    string,
    { bounds: Bounds; area: number; name: string; iso2: string }
  >();
  features.forEach((feature) => {
    const props = feature.properties ?? {};
    const iso2 = String(props.iso_a2 ?? props["iso_a2"] ?? "").trim().toUpperCase();
    const name = String(props.name ?? "").trim();
    if (!iso2 || !name || !feature.geometry) {
      return;
    }
    const bounds = boundsFromGeometry(feature.geometry);
    if (!bounds) {
      return;
    }
    const area = Math.abs((bounds.east - bounds.west) * (bounds.north - bounds.south));
    const key = `${iso2}:${name.toLowerCase()}`;
    const existing = bestByKey.get(key);
    if (!existing || area > existing.area) {
      bestByKey.set(key, { bounds, area, name, iso2 });
    }
  });

  const labelFeatures: GeoFeature[] = [];
  bestByKey.forEach((entry) => {
    labelFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [(entry.bounds.west + entry.bounds.east) / 2, (entry.bounds.south + entry.bounds.north) / 2],
      },
      properties: {
        name: entry.name,
        iso_a2: entry.iso2,
      },
    });
  });

  return {
    type: "FeatureCollection",
    features: labelFeatures,
  } as GeoFeatureCollection;
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

function ensureLabelLayers(map: MapLibreMap) {
  if (!map.getSource("country-labels")) {
    return;
  }
  if (map.getLayer("country-labels-all")) {
    return;
  }
  map.addLayer({
    id: "country-labels-all",
    type: "symbol",
    source: "country-labels",
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.08,
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color": "#614438",
      "text-halo-color": "#f3efe6",
      "text-halo-width": 1,
    },
  });
  map.addLayer({
    id: "country-labels-selected",
    type: "symbol",
    source: "country-labels",
    layout: {
      "text-field": ["get", "name"],
      "text-size": 12,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.08,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color": "#b34c28",
      "text-halo-color": "#fff3e6",
      "text-halo-width": 1.2,
    },
  });
}

function applyLabelState(
  map: MapLibreMap,
  mode: "none" | "selected" | "all",
  selectedIso2: string[]
) {
  if (!map.getLayer("country-labels-all") || !map.getLayer("country-labels-selected")) {
    return;
  }
  const selectedNormalized = selectedIso2.map((code) => code.toUpperCase());
  map.setFilter("country-labels-selected", [
    "in",
    ["get", "ISO3166-1-Alpha-2"],
    ["literal", selectedNormalized],
  ]);
  map.setLayoutProperty(
    "country-labels-all",
    "visibility",
    mode === "all" ? "visible" : "none"
  );
  map.setLayoutProperty(
    "country-labels-selected",
    "visibility",
    mode === "selected" ? "visible" : "none"
  );
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
  const [labelsMode, setLabelsMode] = useState<"none" | "selected" | "all">("selected");
  const [selectedIso2, setSelectedIso2] = useState<string[]>([]);
  const [citiesVisible, setCitiesVisible] = useState(false);
  const [citiesStatus, setCitiesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [statesVisible, setStatesVisible] = useState(false);
  const [statesStatus, setStatesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );

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
        if (!map.getSource("country-labels")) {
          const labelCollection = buildLabelCollection(data.features ?? []);
          map.addSource("country-labels", {
            type: "geojson",
            data: labelCollection,
          });
        }
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
        ensureLabelLayers(map);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    ensureLabelLayers(map);
    applyLabelState(map, labelsMode, selectedIso2);
  }, [dataStatus, labelsMode, mapReady, selectedIso2]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    const ensureCities = async () => {
      if (map.getSource("cities")) {
        map.setLayoutProperty("city-labels", "visibility", citiesVisible ? "visible" : "none");
        applyCityFilter(map, labelsMode, selectedIso2);
        return;
      }
      if (!citiesVisible) {
        return;
      }
      setCitiesStatus("loading");
      try {
        const response = await fetch("/data/cities.geojson");
        if (!response.ok) {
          throw new Error("Failed to load cities");
        }
        const data = await response.json();
        map.addSource("cities", {
          type: "geojson",
          data,
        });
        map.addLayer({
          id: "city-labels",
          type: "symbol",
          source: "cities",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 10,
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-offset": [0, 0.6],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#544036",
            "text-halo-color": "#f3efe6",
            "text-halo-width": 1,
          },
        });
        map.setLayoutProperty("city-labels", "visibility", "visible");
        applyCityFilter(map, labelsMode, selectedIso2);
        setCitiesStatus("ready");
      } catch (error) {
        console.error(error);
        setCitiesStatus("error");
      }
    };
    void ensureCities();
  }, [citiesVisible, dataStatus, labelsMode, mapReady, selectedIso2]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    const ensureStates = async () => {
      if (map.getSource("state-labels")) {
        map.setLayoutProperty("state-labels", "visibility", statesVisible ? "visible" : "none");
        if (map.getLayer("state-borders")) {
          map.setLayoutProperty("state-borders", "visibility", "visible");
        }
        applyStateFilter(map, labelsMode, selectedIso2);
        return;
      }
      setStatesStatus("loading");
      try {
        const response = await fetch("/data/states.geojson");
        if (!response.ok) {
          throw new Error("Failed to load states");
        }
        const data = await response.json();
        const stateLabels = buildStateLabelCollection(data.features ?? []);
        map.addSource("state-labels", {
          type: "geojson",
          data: stateLabels,
        });
        const labelBefore = map.getLayer("country-labels-all") ? "country-labels-all" : undefined;
        map.addLayer(
          {
            id: "state-borders",
            type: "line",
            source: "state-labels",
            paint: {
              "line-color": "#b48b6a",
              "line-width": 1.1,
              "line-opacity": 0.7,
            },
          },
          labelBefore
        );
        map.addLayer(
          {
            id: "state-labels",
            type: "symbol",
            source: "state-labels",
            layout: {
              "text-field": ["get", "name"],
              "text-size": 10,
              "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
              "text-offset": [0, 0.6],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#6b4c3b",
              "text-halo-color": "#f3efe6",
              "text-halo-width": 1,
            },
          },
          labelBefore
        );
        map.setLayoutProperty("state-labels", "visibility", statesVisible ? "visible" : "none");
        map.setLayoutProperty("state-borders", "visibility", "visible");
        applyStateFilter(map, labelsMode, selectedIso2);
        setStatesStatus("ready");
      } catch (error) {
        console.error(error);
        setStatesStatus("error");
      }
    };
    void ensureStates();
  }, [dataStatus, labelsMode, mapReady, selectedIso2, statesVisible]);

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
      const iso2Codes = matches
        .map((feature) => String(feature.properties?.["ISO3166-1-Alpha-2"] ?? "").trim())
        .filter(Boolean);
      setSelectedIso2(iso2Codes);
      applySelection(map, iso2Codes);
      applyLabelState(map, labelsMode, iso2Codes);
      map.fitBounds(
        [
          [bbox.west, bbox.south],
          [bbox.east, bbox.north],
        ],
        { padding: 60, duration: 800 }
      );
      setStatus(`Showing ${iso2Codes.join(", ") || matches.length} countries.`);
      window.setTimeout(() => setStatus(null), 2000);
    },
    [dataStatus, labelsMode, mapReady, query]
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
            <div className="map-sidepanel__subtitle">Country labels</div>
            <label className="map-toggle">
              <input
                type="radio"
                name="country-labels"
                value="none"
                checked={labelsMode === "none"}
                onChange={() => setLabelsMode("none")}
              />
              <span>None</span>
            </label>
            <label className="map-toggle">
              <input
                type="radio"
                name="country-labels"
                value="selected"
                checked={labelsMode === "selected"}
                onChange={() => setLabelsMode("selected")}
              />
              <span>Selected only</span>
            </label>
            <label className="map-toggle">
              <input
                type="radio"
                name="country-labels"
                value="all"
                checked={labelsMode === "all"}
                onChange={() => setLabelsMode("all")}
              />
              <span>All countries</span>
            </label>
            <div className="map-sidepanel__divider" />
            <label className="map-toggle">
              <input
                type="checkbox"
                checked={citiesVisible}
                onChange={(event) => setCitiesVisible(event.target.checked)}
              />
              <span>City labels</span>
            </label>
            <label className="map-toggle">
              <input
                type="checkbox"
                checked={statesVisible}
                onChange={(event) => setStatesVisible(event.target.checked)}
              />
              <span>State/Province labels</span>
            </label>
          </div>
        </aside>
        {!mapReady ? (
          <div className="map-loading">
            <div className="map-loading__card">
              <span className="explore-spinner" aria-hidden="true" />
              <div>Loading map...</div>
            </div>
          </div>
        ) : null}
        {status ? <div className="map-toast">{status}</div> : null}
        {dataStatus === "error" ? (
          <div className="map-toast map-toast--error">Failed to load map data.</div>
        ) : null}
        {citiesStatus === "loading" ? (
          <div className="map-toast">Loading city labels...</div>
        ) : null}
        {citiesStatus === "error" ? (
          <div className="map-toast map-toast--error">Failed to load city labels.</div>
        ) : null}
        {statesStatus === "loading" ? (
          <div className="map-toast">Loading state labels...</div>
        ) : null}
        {statesStatus === "error" ? (
          <div className="map-toast map-toast--error">Failed to load state labels.</div>
        ) : null}
      </div>
    </div>
  );
}

function applyCityFilter(
  map: MapLibreMap,
  mode: "none" | "selected" | "all",
  selectedIso2: string[]
) {
  if (!map.getLayer("city-labels")) {
    return;
  }
  if (mode === "selected") {
    if (selectedIso2.length === 0) {
      map.setFilter("city-labels", ["==", ["get", "iso_a2"], ""]);
      return;
    }
    const normalized = selectedIso2.map((code) => code.toUpperCase());
    map.setFilter("city-labels", ["in", ["get", "iso_a2"], ["literal", normalized]]);
    return;
  }
  map.setFilter("city-labels", null);
}

function applyStateFilter(
  map: MapLibreMap,
  mode: "none" | "selected" | "all",
  selectedIso2: string[]
) {
  if (!map.getLayer("state-labels")) {
    return;
  }
  if (mode === "selected") {
    if (selectedIso2.length === 0) {
      map.setFilter("state-labels", ["==", ["get", "iso_a2"], ""]);
      return;
    }
    const normalized = selectedIso2.map((code) => code.toUpperCase());
    map.setFilter("state-labels", ["in", ["get", "iso_a2"], ["literal", normalized]]);
    return;
  }
  map.setFilter("state-labels", null);
}
