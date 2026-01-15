"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";

type MapLibreModule = typeof import("maplibre-gl");
type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
type GeoFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
type SavedView = {
  id: number;
  name: string;
  center_lng: number;
  center_lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
  bounds_west: number | null;
  bounds_south: number | null;
  bounds_east: number | null;
  bounds_north: number | null;
  labels_mode: "none" | "selected" | "all";
  cities_visible: boolean;
  states_visible: boolean;
  focus_seas_only: boolean;
  selected_iso2: string[];
  created_at: string;
};

const DEFAULT_CENTER: [number, number] = [12, 22];
const DEFAULT_ZOOM = 1.6;

const MAP_STYLE_URL = "/map-style-physical.json";
const FEATURED_STATE_BORDER_ISO2 = ["US", "CA", "BR", "RU", "CN", "IN", "AU"];
const COUNTRY_LABEL_OVERRIDES: Record<string, [number, number]> = {
  US: [-98.5, 39.8],
  CA: [-100.5, 55.0],
};
const LOW_ZOOM_OVERLAY = [
  { iso2: "GL", color: "#f6f8fb", opacity: 0.9 },
  { iso2: "CA", color: "#dde6de", opacity: 0.22 },
  { iso2: "IS", color: "#d9dad2", opacity: 0.7 },
  { iso2: "NO", color: "#cfd8cc", opacity: 0.6 },
  { iso2: "SE", color: "#cfd8cc", opacity: 0.6 },
  { iso2: "FI", color: "#cfd8cc", opacity: 0.6 },
  { iso2: "AU", color: "#d8cbb7", opacity: 0.7 },
  { iso2: "NZ", color: "#d2c7b4", opacity: 0.7 },
  { iso2: "PG", color: "#c6d1c4", opacity: 0.6 },
  { iso2: "SB", color: "#c6d1c4", opacity: 0.6 },
  { iso2: "VU", color: "#c6d1c4", opacity: 0.6 },
  { iso2: "NC", color: "#c6d1c4", opacity: 0.6 },
  { iso2: "FJ", color: "#c6d1c4", opacity: 0.6 },
];

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

function buildCountryLabelCollection(
  countries: GeoFeature[],
  labelPoints?: GeoFeature[]
): GeoFeatureCollection {
  const fallbackByIso2 = new Map<
    string,
    { bounds: Bounds; area: number; name: string; iso2: string }
  >();
  const byIso3 = new Map<
    string,
    { name: string; iso2: string; bounds: Bounds; area: number }
  >();

  countries.forEach((feature) => {
    const props = feature.properties ?? {};
    const iso2 = String(props["ISO3166-1-Alpha-2"] ?? "").trim().toUpperCase();
    const iso3 = String(props["ISO3166-1-Alpha-3"] ?? "").trim().toUpperCase();
    const name = String(props.name ?? "").trim();
    if (!iso2 || !feature.geometry) {
      return;
    }
    const bounds = boundsFromGeometry(feature.geometry);
    if (!bounds) {
      return;
    }
    const area = Math.abs((bounds.east - bounds.west) * (bounds.north - bounds.south));
    const existing = fallbackByIso2.get(iso2);
    if (!existing || area > existing.area) {
      fallbackByIso2.set(iso2, { bounds, area, name, iso2 });
    }
    if (iso3) {
      const existingIso3 = byIso3.get(iso3);
      if (!existingIso3 || area > existingIso3.area) {
        byIso3.set(iso3, { name, iso2, bounds, area });
      }
    }
  });

  const labelFeatures: GeoFeature[] = [];
  const usedIso2 = new Set<string>();

  if (labelPoints && labelPoints.length > 0) {
    const bestByIso3 = new Map<string, { coord: [number, number]; rank: number }>();
    labelPoints.forEach((feature) => {
      if (!feature.geometry || feature.geometry.type !== "Point") {
        return;
      }
      const props = feature.properties ?? {};
      const iso3 = String(
        props.sr_adm0_a3 ?? props.sr_sov_a3 ?? props.sr_brk_a3 ?? ""
      )
        .trim()
        .toUpperCase();
      if (!iso3) {
        return;
      }
      const rankValue = Number(props.scalerank ?? Number.POSITIVE_INFINITY);
      const coord = feature.geometry.coordinates as [number, number];
      const existing = bestByIso3.get(iso3);
      if (!existing || rankValue < existing.rank) {
        bestByIso3.set(iso3, { coord, rank: rankValue });
      }
    });

    bestByIso3.forEach((entry, iso3) => {
      const country = byIso3.get(iso3);
      if (!country) {
        return;
      }
      labelFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: entry.coord },
        properties: {
          name: country.name,
          "ISO3166-1-Alpha-2": country.iso2,
        },
      });
      usedIso2.add(country.iso2);
    });
  }

  fallbackByIso2.forEach((entry, iso2) => {
    if (usedIso2.has(iso2)) {
      return;
    }
    labelFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [(entry.bounds.west + entry.bounds.east) / 2, (entry.bounds.south + entry.bounds.north) / 2],
      },
      properties: {
        name: entry.name,
        "ISO3166-1-Alpha-2": iso2,
      },
    });
  });

  const overrideIso2 = new Set(
    Object.keys(COUNTRY_LABEL_OVERRIDES).map((code) => code.toUpperCase())
  );
  const normalizedFeatures = labelFeatures.filter((feature) => {
    const iso2 = String(feature.properties?.["ISO3166-1-Alpha-2"] ?? "")
      .trim()
      .toUpperCase();
    return !overrideIso2.has(iso2);
  });
  overrideIso2.forEach((iso2) => {
    const coords = COUNTRY_LABEL_OVERRIDES[iso2];
    if (!coords) {
      return;
    }
    const name = fallbackByIso2.get(iso2)?.name ?? iso2;
    normalizedFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: {
        name,
        "ISO3166-1-Alpha-2": iso2,
      },
    });
  });

  return {
    type: "FeatureCollection",
    features: normalizedFeatures,
  } as GeoFeatureCollection;
}

function buildStateLabelCollection(features: GeoFeature[]) {
  const bestByKey = new Map<
    string,
    {
      bounds: Bounds;
      area: number;
      name: string;
      iso2: string;
      labelX?: number;
      labelY?: number;
      hasLabel: boolean;
    }
  >();
  features.forEach((feature) => {
    const props = feature.properties ?? {};
    const iso2 = String(props.iso_a2 ?? props["iso_a2"] ?? "").trim().toUpperCase();
    const name = String(props.name ?? "").trim();
    const labelX = Number(props.label_x ?? props["label_x"] ?? props.longitude);
    const labelY = Number(props.label_y ?? props["label_y"] ?? props.latitude);
    const hasLabel = Number.isFinite(labelX) && Number.isFinite(labelY);
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
    if (!existing || area > existing.area || (!existing.hasLabel && hasLabel)) {
      bestByKey.set(key, {
        bounds,
        area,
        name,
        iso2,
        labelX: hasLabel ? labelX : undefined,
        labelY: hasLabel ? labelY : undefined,
        hasLabel,
      });
    }
  });

  const labelFeatures: GeoFeature[] = [];
  bestByKey.forEach((entry) => {
    const hasLabel = entry.hasLabel && Number.isFinite(entry.labelX) && Number.isFinite(entry.labelY);
    labelFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: hasLabel
          ? [entry.labelX as number, entry.labelY as number]
          : [(entry.bounds.west + entry.bounds.east) / 2, (entry.bounds.south + entry.bounds.north) / 2],
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
    "rgba(0,0,0,0)",
    "rgba(0,0,0,0)",
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
    maxzoom: 4.4,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 14,
      "text-letter-spacing": 0.08,
      "text-font": ["Lato Bold", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color": "#5f5f5f",
      "text-halo-color": "rgba(246,244,240,0.9)",
      "text-halo-width": 1,
    },
  });
  map.addLayer({
    id: "country-labels-selected",
    type: "symbol",
    source: "country-labels",
    maxzoom: 5.2,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 13,
      "text-letter-spacing": 0.08,
      "text-font": ["Lato Bold", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color": "#5f5f5f",
      "text-halo-color": "rgba(246,244,240,0.9)",
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
  const apiBase = getClientApiBase();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapReady, setMapReady] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(max-width: 900px)").matches;
  });
  const [mobileBarsVisible, setMobileBarsVisible] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return true;
    }
    return !window.matchMedia("(max-width: 900px)").matches;
  });
  const [mobilePanel, setMobilePanel] = useState<"views" | "settings" | null>(null);
  const [labelsMode, setLabelsMode] = useState<"none" | "selected" | "all">("all");
  const [selectedIso2, setSelectedIso2] = useState<string[]>([]);
  const [citiesVisible, setCitiesVisible] = useState(false);
  const [citiesStatus, setCitiesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [statesVisible, setStatesVisible] = useState(true);
  const [focusSeasOnly, setFocusSeasOnly] = useState(true);
  const [statesStatus, setStatesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewsStatus, setSavedViewsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const loadSavedViews = useCallback(async () => {
    setSavedViewsStatus("loading");
    try {
      const response = await fetch(`${apiBase}/map-views`);
      if (!response.ok) {
        throw new Error("Failed to load saved views");
      }
      const data = await response.json();
      setSavedViews((data?.views ?? []) as SavedView[]);
      setSavedViewsStatus("ready");
    } catch (error) {
      console.error(error);
      setSavedViewsStatus("error");
    }
  }, [apiBase]);

  const applySavedView = useCallback(
    (view: SavedView) => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }
      const labelsModeValue = view.labels_mode ?? "all";
      const selected = view.selected_iso2 ?? [];
      setLabelsMode(labelsModeValue);
      setCitiesVisible(view.cities_visible);
      setStatesVisible(view.states_visible);
      setFocusSeasOnly(view.focus_seas_only);
      setSelectedIso2(selected);
      applySelection(map, selected);
      applyLabelState(map, labelsModeValue, selected);
      applyCityFilter(map, labelsModeValue, selected);
      applyStateFilter(map, labelsModeValue, selected);
      applyMarineFilter(map, view.focus_seas_only);
      map.flyTo({
        center: [view.center_lng, view.center_lat],
        zoom: view.zoom,
        bearing: view.bearing,
        pitch: view.pitch,
        duration: 800,
      });
    },
    [mapReady]
  );

  const handleMobilePanel = useCallback(
    (panel: "views" | "settings") => {
      setMobileBarsVisible(true);
      setMobilePanel((prev) => {
        const next = prev === panel ? null : panel;
        return next;
      });
      if (panel === "views") {
        void loadSavedViews();
      }
    },
    [loadSavedViews]
  );

  const handleSaveView = useCallback(async (name: string) => {
    const map = mapRef.current;
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus("Name is required.");
      window.setTimeout(() => setStatus(null), 2000);
      return;
    }
    if (!map || !mapReady) {
      setStatus("Map is not ready yet.");
      window.setTimeout(() => setStatus(null), 2000);
      return;
    }
    const center = map.getCenter();
    const bounds = map.getBounds();
    try {
      const response = await fetch(`${apiBase}/map-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          center_lng: center.lng,
          center_lat: center.lat,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          bounds_west: bounds.getWest(),
          bounds_south: bounds.getSouth(),
          bounds_east: bounds.getEast(),
          bounds_north: bounds.getNorth(),
          labels_mode: labelsMode,
          cities_visible: citiesVisible,
          states_visible: statesVisible,
          focus_seas_only: focusSeasOnly,
          selected_iso2: selectedIso2,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save view");
      }
      const data = await response.json();
      const view = data?.view as SavedView | undefined;
      if (view) {
        setSavedViews((prev) => [view, ...prev]);
      } else {
        await loadSavedViews();
      }
      setStatus("Saved view.");
      window.setTimeout(() => setStatus(null), 2000);
    } catch (error) {
      console.error(error);
      setStatus("Failed to save view.");
      window.setTimeout(() => setStatus(null), 2000);
    }
  }, [
    apiBase,
    citiesVisible,
    focusSeasOnly,
    labelsMode,
    loadSavedViews,
    mapReady,
    selectedIso2,
    statesVisible,
  ]);

  useEffect(() => {
    let cancelled = false;
    let maplibre: MapLibreModule | null = null;
    const isMobileScreen =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(max-width: 900px)").matches;

    const addOceans = async (map: MapLibreMap) => {
      if (map.getSource("oceans")) {
        return;
      }
      try {
        const response = await fetch("/data/oceans.geojson");
        if (!response.ok) {
          throw new Error("Failed to load oceans");
        }
        const data = await response.json();
        if (cancelled || map.getSource("oceans")) {
          return;
        }
        map.addSource("oceans", {
          type: "geojson",
          data,
        });
        map.addLayer({
          id: "oceans-fill",
          type: "fill",
          source: "oceans",
          paint: {
            "fill-color": "#70d3e5",
            "fill-opacity": 0.95,
          },
        });
      } catch (error) {
        console.warn("Failed to load oceans", error);
      }
    };

    const addMarineLabels = async (map: MapLibreMap) => {
      if (map.getSource("marine-polys")) {
        return;
      }
      try {
        const response = await fetch("/data/marine_polys.geojson");
        if (!response.ok) {
          throw new Error("Failed to load marine labels");
        }
        const data = await response.json();
        if (cancelled || map.getSource("marine-polys")) {
          return;
        }
        map.addSource("marine-polys", {
          type: "geojson",
          data,
        });
        const labelBefore = map.getLayer("country-labels-all") ? "country-labels-all" : undefined;
        map.addLayer(
          {
            id: "marine-labels",
            type: "symbol",
            source: "marine-polys",
            filter: [
              "in",
              ["get", "featurecla"],
              ["literal", ["ocean", "sea", "gulf"]],
            ],
            layout: {
              "text-field": ["coalesce", ["get", "label"], ["get", "name"]],
              "text-size": 14,
              "text-letter-spacing": 0.08,
              "text-font": ["Lato Semibold", "Arial Unicode MS Regular"],
            },
            paint: {
              "text-color": "#5f7890",
              "text-halo-color": "rgba(207,232,247,0.8)",
              "text-halo-width": 1,
            },
          },
          labelBefore
        );
      } catch (error) {
        console.warn("Failed to load marine labels", error);
      }
    };

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
        await addOceans(map);
        if (!map.getSource("country-labels")) {
          let labelPoints: GeoFeature[] | undefined;
          try {
            const labelResponse = await fetch("/data/country_label_points.geojson");
            if (labelResponse.ok) {
              const labelData = await labelResponse.json();
              labelPoints = (labelData?.features ?? []) as GeoFeature[];
            }
          } catch (error) {
            console.warn("Failed to load country label points", error);
          }
          const labelCollection = buildCountryLabelCollection(
            data.features ?? [],
            labelPoints
          );
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
              "fill-color": "rgba(0,0,0,0)",
              "fill-opacity": 0.35,
            },
          });
        }
        if (!map.getLayer("countries-lowzoom-fill") && LOW_ZOOM_OVERLAY.length > 0) {
          const overlayCodes = LOW_ZOOM_OVERLAY.map((entry) => entry.iso2);
          const colorExpression: any[] = ["match", ["get", "ISO3166-1-Alpha-2"]];
          const opacityExpression: any[] = ["match", ["get", "ISO3166-1-Alpha-2"]];
          LOW_ZOOM_OVERLAY.forEach((entry) => {
            colorExpression.push(entry.iso2, entry.color);
            opacityExpression.push(entry.iso2, entry.opacity);
          });
          colorExpression.push("rgba(0,0,0,0)");
          opacityExpression.push(0);
          map.addLayer({
            id: "countries-lowzoom-fill",
            type: "fill",
            source: "countries",
            maxzoom: 3.6,
            filter: ["in", ["get", "ISO3166-1-Alpha-2"], ["literal", overlayCodes]],
            paint: {
              "fill-color": colorExpression,
              "fill-opacity": opacityExpression,
            },
          });
        }
        if (!map.getLayer("countries-outline")) {
          map.addLayer({
            id: "countries-outline",
            type: "line",
            source: "countries",
            paint: {
              "line-color": "#8c7b6f",
              "line-width": 1.1,
              "line-opacity": 0.75,
            },
          });
        }
        ensureLabelLayers(map);
        await addMarineLabels(map);
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
        style: MAP_STYLE_URL,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });
      map.addControl(new maplibre.NavigationControl(), "top-right");
      map.setRenderWorldCopies(true);
      if (isMobileScreen) {
        map.doubleClickZoom.disable();
        map.on("dblclick", (event) => {
          event.preventDefault();
          setMobileBarsVisible((prev) => {
            const next = !prev;
            if (!next) {
              setMobilePanel(null);
            }
            return next;
          });
        });
      }
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
        if (isMobileScreen) {
          mapRef.current.doubleClickZoom.enable();
        }
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const matches = window.matchMedia("(max-width: 900px)").matches;
    setIsMobile(matches);
    setMobileBarsVisible(!matches);
    if (!matches) {
      setMobilePanel(null);
    } else {
      setSaveModalOpen(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedViews();
  }, [loadSavedViews]);

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
    applyMarineFilter(map, focusSeasOnly);
  }, [dataStatus, focusSeasOnly, mapReady]);

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
            "text-size": 11,
            "text-font": ["Lato Regular", "Arial Unicode MS Regular"],
            "text-offset": [0, 0.6],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#4f4f4f",
            "text-halo-color": "rgba(246,244,240,0.9)",
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
      if (map.getSource("state-labels") && map.getSource("states")) {
        map.setLayoutProperty("state-labels", "visibility", statesVisible ? "visible" : "none");
        if (map.getLayer("state-borders")) {
          map.setLayoutProperty("state-borders", "visibility", statesVisible ? "visible" : "none");
        }
        applyStateFilter(map, labelsMode, selectedIso2);
        return;
      }
      if (!statesVisible) {
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
        if (!map.getSource("states")) {
          map.addSource("states", {
            type: "geojson",
            data,
          });
        }
        if (!map.getSource("state-labels")) {
          map.addSource("state-labels", {
            type: "geojson",
            data: stateLabels,
          });
        }
        const labelBefore = map.getLayer("country-labels-all") ? "country-labels-all" : undefined;
        if (!map.getLayer("state-borders")) {
          map.addLayer(
            {
              id: "state-borders",
              type: "line",
              source: "states",
              minzoom: 1.5,
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#b09a90",
                "line-width": 1.1,
                "line-opacity": 0.8,
                "line-dasharray": [1, 1.6],
              },
            },
            labelBefore
          );
        }
        if (!map.getLayer("state-labels")) {
          map.addLayer(
            {
              id: "state-labels",
              type: "symbol",
              source: "state-labels",
              minzoom: 4.2,
              layout: {
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-font": ["Lato Semibold", "Arial Unicode MS Regular"],
                "text-offset": [0, 0.6],
                "text-transform": "uppercase",
                "text-allow-overlap": false,
                "text-ignore-placement": false,
              },
              paint: {
                "text-color": "#4f4f4f",
                "text-halo-color": "rgba(246,244,240,0.9)",
                "text-halo-width": 1,
              },
            },
            labelBefore
          );
        }
        map.setLayoutProperty("state-labels", "visibility", statesVisible ? "visible" : "none");
        map.setLayoutProperty("state-borders", "visibility", statesVisible ? "visible" : "none");
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

  const savedViewsList =
    savedViewsStatus === "loading" ? (
      <div className="map-modal__empty">Loading saved views...</div>
    ) : savedViews.length === 0 ? (
      <div className="map-modal__empty">No saved views yet.</div>
    ) : (
      <div className="map-modal__list">
        {savedViews.map((view) => (
          <button
            key={view.id}
            type="button"
            className="map-view-card"
            onClick={() => applySavedView(view)}
          >
            <span className="map-view-card__title">{view.name}</span>
            <span className="map-view-card__meta">
              Zoom {Math.round(view.zoom * 10) / 10}
            </span>
          </button>
        ))}
      </div>
    );

  const layersSection = (
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
      <label className={`map-toggle${!mapReady ? " map-toggle--disabled" : ""}`}>
        <input
          type="checkbox"
          checked={citiesVisible}
          onChange={(event) => setCitiesVisible(event.target.checked)}
          disabled={!mapReady}
        />
        <span>City labels</span>
      </label>
      <label className={`map-toggle${!mapReady ? " map-toggle--disabled" : ""}`}>
        <input
          type="checkbox"
          checked={statesVisible}
          onChange={(event) => setStatesVisible(event.target.checked)}
          disabled={!mapReady}
        />
        <span>State/Province labels + borders</span>
      </label>
      <label className="map-toggle">
        <input
          type="checkbox"
          checked={focusSeasOnly}
          onChange={(event) => setFocusSeasOnly(event.target.checked)}
        />
        <span>Focus seas: Gulf of Mexico + Mediterranean</span>
      </label>
    </div>
  );

  const showSidepanel = !isMobile || mobilePanel !== null;

  return (
    <div className="map-page">
      <header
        className={`map-toolbar${isMobile ? " map-toolbar--mobile" : ""}${
          isMobile && !mobileBarsVisible ? " map-toolbar--hidden" : ""
        }`}
      >
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
            aria-label="Go"
          >
            <span className="map-button__icon" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path
                  d="M4 10h9M10 5l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="map-button__text">Go</span>
          </button>
          <button
            type="button"
            className="map-button map-button--secondary"
            onClick={() => {
              const trimmed = query.trim();
              const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
              const name = trimmed || `Saved view ${timestamp}`;
              void handleSaveView(name);
            }}
            disabled={!mapReady || dataStatus !== "ready"}
            aria-label="Save view"
          >
            <span className="map-button__icon" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path
                  d="M5 4h10a1 1 0 0 1 1 1v11l-6-3-6 3V5a1 1 0 0 1 1-1Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="map-button__text">Save view</span>
          </button>
        </form>
      </header>
      <div className="map-shell">
        <div className="map-canvas" ref={containerRef} />
        {showSidepanel ? (
          <aside className={`map-sidepanel${isMobile ? " map-sidepanel--mobile" : ""}`}>
            {!isMobile ? (
              <>
                <div className="map-sidepanel__section">
                  <div className="map-sidepanel__header">
                    <div className="map-sidepanel__title">Saved Views</div>
                    <button
                      type="button"
                      className="map-icon-button"
                      aria-label="Open saved views"
                      onClick={() => {
                        setSaveModalOpen(true);
                        void loadSavedViews();
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4 12.2 12 16.7 20 12.2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4 16.9 12 21.4 20 16.9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                {layersSection}
                {saveModalOpen ? (
                  <div
                    className="map-sidepanel__overlay"
                    onClick={() => setSaveModalOpen(false)}
                  >
                    <div
                      className="map-modal__panel map-modal__panel--overlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="map-modal__header">
                        <div className="map-modal__title">Saved views</div>
                        <button
                          type="button"
                          className="map-modal__close"
                          onClick={() => setSaveModalOpen(false)}
                          aria-label="Close saved views"
                        >
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <path
                              d="M5 5 15 15M15 5 5 15"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="map-modal__body">{savedViewsList}</div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="map-sidepanel__mobile-header">
                  <div className="map-sidepanel__title">
                    {mobilePanel === "views" ? "Saved views" : "Layers"}
                  </div>
                  <button
                    type="button"
                    className="map-modal__close"
                    onClick={() => setMobilePanel(null)}
                    aria-label="Close panel"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="M5 5 15 15M15 5 5 15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="map-modal__body">
                  {mobilePanel === "views" ? savedViewsList : layersSection}
                </div>
              </>
            )}
          </aside>
        ) : null}
        {isMobile && mobileBarsVisible ? (
          <div className="map-mobile-nav">
            <button
              type="button"
              className="map-mobile-nav__button"
              disabled
              aria-label="Explore"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 12h16M12 4v16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={`map-mobile-nav__button${
                mobilePanel === "views" ? " map-mobile-nav__button--active" : ""
              }`}
              onClick={() => handleMobilePanel("views")}
              aria-label="Views"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 12.2 12 16.7 20 12.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={`map-mobile-nav__button${
                mobilePanel === "settings" ? " map-mobile-nav__button--active" : ""
              }`}
              onClick={() => handleMobilePanel("settings")}
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 6h16M7 12h10M10 18h4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
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
  const hasLabels = map.getLayer("state-labels");
  const hasBorders = map.getLayer("state-borders");
  if (!hasLabels && !hasBorders) {
    return;
  }
  const featuredIso2 = FEATURED_STATE_BORDER_ISO2.map((code) => code.toUpperCase());
  if (mode === "selected") {
    if (selectedIso2.length === 0) {
      if (hasLabels) {
        map.setFilter("state-labels", ["==", ["get", "iso_a2"], ""]);
      }
      if (hasBorders) {
        if (featuredIso2.length === 0) {
          map.setFilter("state-borders", ["==", ["get", "iso_a2"], ""]);
        } else {
          map.setFilter("state-borders", ["in", ["get", "iso_a2"], ["literal", featuredIso2]]);
        }
      }
      return;
    }
    const normalized = selectedIso2.map((code) => code.toUpperCase());
    if (hasLabels) {
      map.setFilter("state-labels", ["in", ["get", "iso_a2"], ["literal", normalized]]);
    }
    if (hasBorders) {
      map.setFilter("state-borders", ["in", ["get", "iso_a2"], ["literal", normalized]]);
    }
    return;
  }
  if (hasLabels) {
    map.setFilter("state-labels", null);
  }
  if (hasBorders) {
    map.setFilter("state-borders", null);
  }
}

function applyMarineFilter(map: MapLibreMap, focusSeasOnly: boolean) {
  if (!map.getLayer("marine-labels")) {
    return;
  }
  if (!focusSeasOnly) {
    map.setFilter("marine-labels", [
      "in",
      ["get", "featurecla"],
      ["literal", ["ocean", "sea", "gulf"]],
    ]);
    return;
  }
  map.setFilter("marine-labels", [
    "any",
    ["==", ["get", "featurecla"], "ocean"],
    [
      "all",
      ["in", ["get", "featurecla"], ["literal", ["sea", "gulf"]]],
      ["in", ["get", "name"], ["literal", ["Gulf of Mexico", "Mediterranean Sea"]]],
    ],
  ]);
}
