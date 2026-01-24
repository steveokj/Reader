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
  map_scale: number | null;
  bounds_west: number | null;
  bounds_south: number | null;
  bounds_east: number | null;
  bounds_north: number | null;
  labels_mode: "none" | "selected" | "all";
  cities_visible: boolean;
  states_visible: boolean;
  focus_seas_only: boolean;
  selected_iso2: string[];
  selected_state_codes: string[];
  selected_city_keys: string[];
  created_at: string;
};
type MapToggleView = {
  center_lng: number;
  center_lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
  map_scale: number | null;
};
type MapExploreCountry = { name?: string; code?: string };
type MapExploreState = {
  name?: string;
  code?: string;
  postal?: string;
  country?: string;
  country_code?: string;
};
type MapExploreCity = { name?: string; country?: string; country_code?: string };
type MapExploreResponse = {
  query?: string;
  countries?: Array<string | MapExploreCountry>;
  states?: Array<string | MapExploreState>;
  cities?: Array<string | MapExploreCity>;
};
type StateLookup = {
  byName: Map<string, GeoFeature[]>;
  byIso: Map<string, GeoFeature>;
  byPostal: Map<string, GeoFeature[]>;
};
type CityLookup = {
  byName: Map<string, GeoFeature[]>;
  byNameCountry: Map<string, GeoFeature[]>;
};
type MapExploreCountryMatch = {
  name: string;
  code: string;
  feature: GeoFeature;
};
type MapExploreStateMatch = {
  name: string;
  code: string;
  countryCode: string;
  feature: GeoFeature;
};
type MapExploreCityMatch = {
  name: string;
  key: string;
  countryCode: string;
  feature: GeoFeature;
};
type MapExploreMatches = {
  query: string;
  countries: MapExploreCountryMatch[];
  states: MapExploreStateMatch[];
  cities: MapExploreCityMatch[];
};

const DEFAULT_CENTER: [number, number] = [12, 22];
const DEFAULT_ZOOM = 1.6;
const DEFAULT_MAP_SCALE = 0.7;
const SCALE_MIN = 0.7;
const SCALE_MAX = 1;
const SMALL_ISLAND_AREA_CUTOFF = 0.02;
const STATE_LABEL_FULL_MIN_ZOOM = 4.2;
const STATE_LABEL_SWITCH_ZOOM = 4.6;
const STATE_LABEL_ABBREV_MIN_ZOOM = 2.2;
const STATE_LABEL_ABBREV_COUNTRIES = ["US", "CA", "AU"];
const SHOW_MAP_CONTROLS = process.env.NEXT_PUBLIC_MAP_CONTROLS === "1";
const MAP_EXPLORE_MODE = "codex-cli";
const MAP_EXPLORE_INSTRUCTION = [
  "Extract geographic places from the text for a map search.",
  "Return ONLY valid JSON (no markdown) with keys:",
  "query (string), countries (array), states (array), cities (array).",
  "Each country can be a string or {name, code}.",
  "Each state can be a string or {name, country_code, code, postal}.",
  "Each city can be a string or {name, country_code}.",
  "Use ISO-3166-1 alpha-2 for country_code and ISO-3166-2 for state code when known.",
].join(" ");

const MAP_STYLE_URL = "/map-style-physical.json";
const FEATURED_STATE_BORDER_ISO2 = ["US", "CA", "RU", "AU"];
const ALL_COUNTRY_LABELS = [
  "CA",
  "US",
  "MX",
  "VE",
  "CO",
  "PE",
  "BO",
  "BR",
  "CL",
  "AR",
  "IS",
  "GB",
  "NO",
  "SE",
  "FI",
  "DK",
  "IE",
  "ES",
  "FR",
  "DE",
  "PL",
  "UA",
  "IT",
  "RU",
  "MA",
  "TN",
  "GH",
  "GN",
  "DZ",
  "LY",
  "EG",
  "ML",
  "NE",
  "TD",
  "SD",
  "ET",
  "NG",
  "CD",
  "KE",
  "TZ",
  "AO",
  "NA",
  "BW",
  "ZA",
  "MG",
  "TR",
  "IQ",
  "IR",
  "SA",
  "AF",
  "PK",
  "IN",
  "KZ",
  "CN",
  "MN",
  "KR",
  "JP",
  "TH",
  "ID",
  "AU",
  "PG",
  "NZ",
];
const COUNTRY_CODE_OVERRIDES: Record<string, { iso2: string; iso3: string }> = {
  France: { iso2: "FR", iso3: "FRA" },
  Kosovo: { iso2: "XK", iso3: "XKX" },
  Cyprus: { iso2: "CY", iso3: "CYP" },
  Norway: { iso2: "NO", iso3: "NOR" },
};
const COUNTRY_ALIAS_TO_ISO2: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u s a": "US",
  "u s": "US",
  uk: "GB",
  "united kingdom": "GB",
  russia: "RU",
  "russian federation": "RU",
  "south korea": "KR",
  "north korea": "KP",
  "czech republic": "CZ",
  iran: "IR",
  bolivia: "BO",
  tanzania: "TZ",
  venezuela: "VE",
  syria: "SY",
};
const COUNTRY_LABEL_OVERRIDES: Record<string, [number, number]> = {
  US: [-98.5, 39.8],
  CA: [-100.5, 55.0],
};
const COUNTRY_LABEL_TEXT_OVERRIDES: Record<string, string> = {
  CD: "DRC",
  CG: "Congo",
  CF: "C. African Rep.",
  DO: "Dominican Rep.",
  GB: "UK",
  IR: "Iran",
  LA: "Laos",
  MM: "Myanmar",
  RU: "Russia",
  SA: "Saudi",
  TR: "Turkey",
  TZ: "Tanzania",
  UA: "Ukraine",
  US: "United States",
  AE: "UAE",
  VN: "Vietnam",
};
const EXCLUDED_COUNTRY_NAMES = new Set<string>([
  "Akrotiri Sovereign Base Area",
  "American Samoa",
  "Andorra",
  "Anguilla",
  "Antigua and Barbuda",
  "Aruba",
  "Ashmore and Cartier Islands",
  "Bajo Nuevo Bank (Petrel Is.)",
  "Barbados",
  "Bermuda",
  "British Indian Ocean Territory",
  "British Virgin Islands",
  "Brazilian Island",
  "Cayman Islands",
  "Clipperton Island",
  "Cook Islands",
  "Coral Sea Islands",
  "Curaçao",
  "Cyprus No Mans Area",
  "Dhekelia Sovereign Base Area",
  "Falkland Islands",
  "Federated States of Micronesia",
  "French Southern and Antarctic Lands",
  "Gibraltar",
  "Grenada",
  "Guam",
  "Guernsey",
  "Indian Ocean Territories",
  "Jersey",
  "Kiribati",
  "Liechtenstein",
  "Macao S.A.R",
  "Maldives",
  "Malta",
  "Marshall Islands",
  "Monaco",
  "Montserrat",
  "Nauru",
  "New Caledonia",
  "Niue",
  "Norfolk Island",
  "Northern Mariana Islands",
  "Palau",
  "Pitcairn Islands",
  "Puerto Rico",
  "Saint Barthelemy",
  "Saint Helena",
  "Saint Kitts and Nevis",
  "Saint Martin",
  "Saint Pierre and Miquelon",
  "Saint Vincent and the Grenadines",
  "San Marino",
  "Scarborough Reef",
  "Serranilla Bank",
  "Seychelles",
  "Singapore",
  "Sint Maarten",
  "South Georgia and the Islands",
  "Spratly Islands",
  "Tonga",
  "Turks and Caicos Islands",
  "Tuvalu",
  "US Naval Base Guantanamo Bay",
  "United States Minor Outlying Islands",
  "United States Virgin Islands",
  "Vatican",
  "Wallis and Futuna",
]);
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

function isExcludedCountryName(name: string) {
  return EXCLUDED_COUNTRY_NAMES.has(name);
}

function getCountryLabel(name: string, iso2: string) {
  const override = COUNTRY_LABEL_TEXT_OVERRIDES[iso2.toUpperCase()];
  if (override) {
    return override;
  }
  return name;
}

function parsePlaces(value: string) {
  const normalized = value.replace(/-+/g, " to ");
  return normalized
    .split(/\s+to\s+|,|&|\/|\s+and\s+|\+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractJsonBlock(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return value.slice(start, end + 1);
  }
  return value;
}

function parseMapExploreResponse(value: string): MapExploreResponse | null {
  const extracted = extractJsonBlock(value).trim();
  if (!extracted) {
    return null;
  }
  try {
    return JSON.parse(extracted) as MapExploreResponse;
  } catch {
    return null;
  }
}

function parseMapToggleView(value: unknown): MapToggleView | null {
  if (!value) {
    return null;
  }
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const data = parsed as Record<string, unknown>;
  const centerLng = Number(data.center_lng);
  const centerLat = Number(data.center_lat);
  const zoom = Number(data.zoom);
  const bearing = Number(data.bearing);
  const pitch = Number(data.pitch);
  if (!Number.isFinite(centerLng) || !Number.isFinite(centerLat) || !Number.isFinite(zoom)) {
    return null;
  }
  return {
    center_lng: centerLng,
    center_lat: centerLat,
    zoom,
    bearing: Number.isFinite(bearing) ? bearing : 0,
    pitch: Number.isFinite(pitch) ? pitch : 0,
    map_scale:
      data.map_scale === null || data.map_scale === undefined
        ? null
        : Number(data.map_scale),
  };
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

type PolygonInfo = {
  area: number;
  centroid: [number, number];
  polygon: number[][][];
};

function ringArea(ring: number[][]) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ringCentroid(ring: number[][]) {
  const area = ringArea(ring);
  if (!area) {
    return ring[0] ?? [0, 0];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor] as [number, number];
}

function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: [number, number], polygon: number[][][]) {
  if (!polygon.length) {
    return false;
  }
  if (!pointInRing(point, polygon[0])) {
    return false;
  }
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) {
      return false;
    }
  }
  return true;
}

function getLargestPolygonInfo(geometry: GeoJSON.Geometry): PolygonInfo | null {
  let best: PolygonInfo | null = null;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    const outer = rings[0];
    if (outer && outer.length > 2) {
      const area = Math.abs(ringArea(outer));
      best = {
        area,
        centroid: ringCentroid(outer),
        polygon: rings,
      };
    }
  } else if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    polygons.forEach((rings) => {
      const outer = rings[0];
      if (!outer || outer.length <= 2) {
        return;
      }
      const area = Math.abs(ringArea(outer));
      if (!best || area > best.area) {
        best = {
          area,
          centroid: ringCentroid(outer),
          polygon: rings,
        };
      }
    });
  } else if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((geom) => {
      const candidate = getLargestPolygonInfo(geom);
      if (candidate && (!best || candidate.area > best.area)) {
        best = candidate;
      }
    });
  }
  return best;
}

function buildCountryLabelCollection(
  countries: GeoFeature[],
  labelPoints?: GeoFeature[],
  useCentroidLabels = false
): GeoFeatureCollection {
  const fallbackByIso2 = new Map<
    string,
    { centroid: [number, number]; area: number; name: string; iso2: string; polygon: number[][][] }
  >();
  const byIso3 = new Map<
    string,
    { name: string; iso2: string; centroid: [number, number]; area: number; polygon: number[][][] }
  >();

  countries.forEach((feature) => {
    const props = feature.properties ?? {};
    const iso2 = String(props["ISO3166-1-Alpha-2"] ?? "").trim().toUpperCase();
    const iso3 = String(props["ISO3166-1-Alpha-3"] ?? "").trim().toUpperCase();
    const name = String(props.name ?? "").trim();
    if (!iso2 || !feature.geometry) {
      return;
    }
    const polygonInfo = getLargestPolygonInfo(feature.geometry);
    if (!polygonInfo) {
      return;
    }
    const area = polygonInfo.area;
    const existing = fallbackByIso2.get(iso2);
    if (!existing || area > existing.area) {
      fallbackByIso2.set(iso2, {
        centroid: polygonInfo.centroid,
        area,
        name,
        iso2,
        polygon: polygonInfo.polygon,
      });
    }
    if (iso3) {
      const existingIso3 = byIso3.get(iso3);
      if (!existingIso3 || area > existingIso3.area) {
        byIso3.set(iso3, {
          name,
          iso2,
          centroid: polygonInfo.centroid,
          area,
          polygon: polygonInfo.polygon,
        });
      }
    }
  });

  const labelFeatures: GeoFeature[] = [];
  const usedIso2 = new Set<string>();

  if (!useCentroidLabels && labelPoints && labelPoints.length > 0) {
    const pointsByIso3 = new Map<string, { coord: [number, number]; rank: number }[]>();
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
      const existing = pointsByIso3.get(iso3) ?? [];
      existing.push({ coord, rank: rankValue });
      pointsByIso3.set(iso3, existing);
    });

    pointsByIso3.forEach((entries, iso3) => {
      const country = byIso3.get(iso3);
      if (!country) {
        return;
      }
      let bestInside: { coord: [number, number]; rank: number } | null = null;
      if (country.polygon) {
        entries.forEach((entry) => {
          if (!pointInPolygon(entry.coord, country.polygon)) {
            return;
          }
          if (!bestInside || entry.rank < bestInside.rank) {
            bestInside = entry;
          }
        });
      }
      const coord = bestInside?.coord ?? country.centroid;
      labelFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coord },
        properties: {
          name: country.name,
          label: getCountryLabel(country.name, country.iso2),
          "ISO3166-1-Alpha-2": country.iso2,
          excluded_country: isExcludedCountryName(country.name),
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
        coordinates: entry.centroid,
      },
      properties: {
        name: entry.name,
        label: getCountryLabel(entry.name, iso2),
        "ISO3166-1-Alpha-2": iso2,
        excluded_country: isExcludedCountryName(entry.name),
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
    const excluded = isExcludedCountryName(name);
    normalizedFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: {
        name,
        label: getCountryLabel(name, iso2),
        "ISO3166-1-Alpha-2": iso2,
        excluded_country: excluded,
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
      abbr: string;
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
    const postal = String(props.postal ?? "").trim().toUpperCase();
    const isoCode = String(props.iso_3166_2 ?? "").trim().toUpperCase();
    const abbr =
      postal ||
      (isoCode.includes("-") ? isoCode.split("-").pop() ?? "" : "");
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
        abbr,
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
        abbr: entry.abbr,
        iso_a2: entry.iso2,
      },
    });
  });

  return {
    type: "FeatureCollection",
    features: labelFeatures,
  } as GeoFeatureCollection;
}

function addLookupEntry(
  map: Map<string, GeoFeature[]>,
  key: string | undefined,
  feature: GeoFeature
) {
  if (!key) {
    return;
  }
  const normalized = normalizeKey(key);
  if (!normalized) {
    return;
  }
  const existing = map.get(normalized);
  if (existing) {
    existing.push(feature);
  } else {
    map.set(normalized, [feature]);
  }
}

function buildStateLookup(features: GeoFeature[]): StateLookup {
  const byName = new Map<string, GeoFeature[]>();
  const byIso = new Map<string, GeoFeature>();
  const byPostal = new Map<string, GeoFeature[]>();

  features.forEach((feature) => {
    const props = feature.properties ?? {};
    const name = String(props.name ?? "").trim();
    const nameEn = String(props.name_en ?? "").trim();
    const nameAlt = String(props.name_alt ?? "").trim();
    const iso = String(props.iso_3166_2 ?? "").trim().toUpperCase();
    const postal = String(props.postal ?? "").trim().toUpperCase();

    if (iso) {
      byIso.set(iso, feature);
    }
    if (postal) {
      addLookupEntry(byPostal, postal, feature);
    }
    addLookupEntry(byName, name, feature);
    addLookupEntry(byName, nameEn, feature);
    if (nameAlt) {
      nameAlt.split("|").forEach((alt) => addLookupEntry(byName, alt.trim(), feature));
    }
  });

  return { byName, byIso, byPostal };
}

function getCityKey(feature: GeoFeature) {
  const props = feature.properties ?? {};
  const raw = props.ne_id ?? props["ne_id"] ?? props.id ?? props["id"];
  if (raw !== undefined && raw !== null) {
    return String(raw).trim();
  }
  const name = String(props.name ?? props.nameascii ?? "").trim();
  const iso2 = String(props.iso_a2 ?? props["iso_a2"] ?? "").trim();
  return normalizeKey(`${name}-${iso2}`) || `${name}-${iso2}` || "";
}

function buildCityLookup(features: GeoFeature[]): CityLookup {
  const byName = new Map<string, GeoFeature[]>();
  const byNameCountry = new Map<string, GeoFeature[]>();

  features.forEach((feature) => {
    const props = feature.properties ?? {};
    const name = String(props.name ?? "").trim();
    const nameAscii = String(props.nameascii ?? "").trim();
    const nameAlt = String(props.name_alt ?? "").trim();
    const iso2 = String(props.iso_a2 ?? props["iso_a2"] ?? "").trim().toUpperCase();
    const add = (label: string) => {
      if (!label) {
        return;
      }
      const normalized = normalizeKey(label);
      if (!normalized) {
        return;
      }
      const list = byName.get(normalized);
      if (list) {
        list.push(feature);
      } else {
        byName.set(normalized, [feature]);
      }
      if (iso2) {
        const key = `${normalized}|${iso2}`;
        const scoped = byNameCountry.get(key);
        if (scoped) {
          scoped.push(feature);
        } else {
          byNameCountry.set(key, [feature]);
        }
      }
    };
    add(name);
    add(nameAscii);
    if (nameAlt) {
      nameAlt.split("|").forEach((alt) => add(alt.trim()));
    }
  });

  return { byName, byNameCountry };
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

function applySelection(
  map: MapLibreMap,
  iso2Codes: string[],
  selectedStateCodes: string[],
  showExcludedCountries: boolean
) {
  if (!map.getLayer("countries-fill")) {
    return;
  }
  const normalized = iso2Codes.map((code) => code.toUpperCase());
  const stateCountryCodes = new Set(
    selectedStateCodes
      .map((code) => code.split("-")[0]?.toUpperCase())
      .filter((code) => Boolean(code))
  );
  const outlineCodes =
    stateCountryCodes.size > 0
      ? normalized.filter((code) => !stateCountryCodes.has(code))
      : normalized;
  map.setPaintProperty("countries-fill", "fill-color", [
    "case",
    ["in", ["get", "ISO3166-1-Alpha-2"], ["literal", normalized]],
    "rgba(0,0,0,0)",
    "rgba(0,0,0,0)",
  ]);
  if (!map.getLayer("countries-selected-outline")) {
    return;
  }
  if (outlineCodes.length === 0) {
    map.setFilter("countries-selected-outline", ["==", ["get", "ISO3166-1-Alpha-2"], ""]);
    return;
  }
  const outlineFilter: any[] = [
    "all",
    [
      "in",
      ["get", "ISO3166-1-Alpha-2"],
      ["literal", outlineCodes],
    ],
    [">=", ["get", "largest_area"], SMALL_ISLAND_AREA_CUTOFF],
  ];
  if (!showExcludedCountries) {
    outlineFilter.push(["!=", ["get", "excluded_country"], true]);
  }
  map.setFilter("countries-selected-outline", outlineFilter);
}

function applyCountryOutlineFilter(map: MapLibreMap, showExcludedCountries: boolean) {
  if (!map.getLayer("countries-outline")) {
    return;
  }
  const outlineFilter: any[] = [
    "all",
    [">=", ["get", "largest_area"], SMALL_ISLAND_AREA_CUTOFF],
  ];
  if (!showExcludedCountries) {
    outlineFilter.push(["!=", ["get", "excluded_country"], true]);
  }
  map.setFilter("countries-outline", outlineFilter);
}

function applyStateSelection(map: MapLibreMap, stateCodes: string[]) {
  if (!map.getLayer("state-selection")) {
    return;
  }
  if (stateCodes.length === 0) {
    map.setFilter("state-selection", ["==", ["get", "iso_3166_2"], ""]);
    return;
  }
  const normalized = stateCodes.map((code) => code.toUpperCase());
  map.setFilter("state-selection", ["in", ["get", "iso_3166_2"], ["literal", normalized]]);
}

function applyStateLabelMode(
  map: MapLibreMap,
  enableAbbrev: boolean,
  statesVisible: boolean
) {
  const hasLabels = map.getLayer("state-labels");
  if (!hasLabels) {
    return;
  }
  if (map.getLayer("state-labels")) {
    map.setLayoutProperty("state-labels", "visibility", statesVisible ? "visible" : "none");
    map.setLayerZoomRange(
      "state-labels",
      enableAbbrev ? STATE_LABEL_SWITCH_ZOOM : STATE_LABEL_FULL_MIN_ZOOM,
      24
    );
  }
  if (map.getLayer("state-labels-abbrev")) {
    map.setLayoutProperty(
      "state-labels-abbrev",
      "visibility",
      statesVisible && enableAbbrev ? "visible" : "none"
    );
    map.setLayerZoomRange(
      "state-labels-abbrev",
      STATE_LABEL_ABBREV_MIN_ZOOM,
      STATE_LABEL_SWITCH_ZOOM
    );
  }
}

function applyCitySelection(map: MapLibreMap, cityKeys: string[]) {
  if (!map.getLayer("city-selection")) {
    return;
  }
  if (cityKeys.length === 0) {
    map.setFilter("city-selection", ["==", ["to-string", ["get", "ne_id"]], ""]);
    return;
  }
  map.setFilter("city-selection", [
    "in",
    ["to-string", ["get", "ne_id"]],
    ["literal", cityKeys],
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
      "text-field": ["coalesce", ["get", "label"], ["get", "name"]],
      "text-size": 14,
      "text-letter-spacing": 0.08,
      "text-font": ["Roboto Bold", "Arial Unicode MS Regular"],
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
      "text-field": ["coalesce", ["get", "label"], ["get", "name"]],
      "text-size": 13,
      "text-letter-spacing": 0.08,
      "text-font": ["Roboto Bold", "Arial Unicode MS Regular"],
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
  selectedIso2: string[],
  allLabelsFiltered: boolean,
  showExcludedCountries: boolean,
  allowLabelOverlap: boolean
) {
  if (!map.getLayer("country-labels-all") || !map.getLayer("country-labels-selected")) {
    return;
  }
  const selectedNormalized = selectedIso2.map((code) => code.toUpperCase());
  const selectedFilter: any[] = [
    "in",
    ["get", "ISO3166-1-Alpha-2"],
    ["literal", selectedNormalized],
  ];
  if (!showExcludedCountries) {
    map.setFilter("country-labels-selected", [
      "all",
      selectedFilter,
      ["!=", ["get", "excluded_country"], true],
    ]);
  } else {
    map.setFilter("country-labels-selected", selectedFilter);
  }

  const allFilters: any[] = [];
  if (allLabelsFiltered) {
    allFilters.push([
      "in",
      ["get", "ISO3166-1-Alpha-2"],
      ["literal", ALL_COUNTRY_LABELS],
    ]);
  }
  if (!showExcludedCountries) {
    allFilters.push(["!=", ["get", "excluded_country"], true]);
  }
  if (allFilters.length === 0) {
    map.setFilter("country-labels-all", null);
  } else if (allFilters.length === 1) {
    map.setFilter("country-labels-all", allFilters[0]);
  } else {
    map.setFilter("country-labels-all", ["all", ...allFilters]);
  }
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
  const allowOverlap = Boolean(allowLabelOverlap);
  map.setLayoutProperty("country-labels-all", "text-allow-overlap", allowOverlap);
  map.setLayoutProperty("country-labels-all", "text-ignore-placement", allowOverlap);
  map.setLayoutProperty("country-labels-selected", "text-allow-overlap", allowOverlap);
  map.setLayoutProperty("country-labels-selected", "text-ignore-placement", allowOverlap);
}

type MapPageProps = {
  scaleTest?: boolean;
  initialExploreText?: string;
  autoExplore?: boolean;
  onClose?: () => void;
};

export default function MapPage({
  scaleTest = false,
  initialExploreText,
  autoExplore = false,
  onClose,
}: MapPageProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const countriesRef = useRef<GeoFeatureCollection | null>(null);
  const countriesIndexRef = useRef<Map<string, GeoFeature>>(new Map());
  const countryLabelPointsRef = useRef<GeoFeature[] | null>(null);
  const statesRef = useRef<GeoFeatureCollection | null>(null);
  const statesLookupRef = useRef<StateLookup | null>(null);
  const citiesRef = useRef<GeoFeatureCollection | null>(null);
  const citiesLookupRef = useRef<CityLookup | null>(null);
  const autoExploreRequestedRef = useRef(false);
  const apiBase = getClientApiBase();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapReady, setMapReady] = useState(false);
  const [exploreModalOpen, setExploreModalOpen] = useState(false);
  const [exploreInput, setExploreInput] = useState("");
  const [exploreStatus, setExploreStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [exploreMessage, setExploreMessage] = useState<string | null>(null);
  const [exploreMatches, setExploreMatches] = useState<MapExploreMatches | null>(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(max-width: 900px)").matches;
  });
  const [mobileBarsVisible, setMobileBarsVisible] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"views" | "settings" | null>(null);
  const [labelsMode, setLabelsMode] = useState<"none" | "selected" | "all">("all");
  const [allLabelsFiltered, setAllLabelsFiltered] = useState(false);
  const [showExcludedCountries, setShowExcludedCountries] = useState(false);
  const [allowLabelOverlap, setAllowLabelOverlap] = useState(false);
  const [useCentroidLabels, setUseCentroidLabels] = useState(false);
  const [selectedIso2, setSelectedIso2] = useState<string[]>([]);
  const [selectedStateCodes, setSelectedStateCodes] = useState<string[]>([]);
  const [selectedCityKeys, setSelectedCityKeys] = useState<string[]>([]);
  const [citiesVisible, setCitiesVisible] = useState(false);
  const [citiesStatus, setCitiesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [statesVisible, setStatesVisible] = useState(true);
  const [stateAbbrevLabels, setStateAbbrevLabels] = useState(true);
  const [focusSeasOnly, setFocusSeasOnly] = useState(true);
  const [statesStatus, setStatesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewsStatus, setSavedViewsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingViewId, setEditingViewId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [mapScale, setMapScale] = useState(DEFAULT_MAP_SCALE);
  const [scaleSliderOpen, setScaleSliderOpen] = useState(false);
  const [defaultViewIdMobile, setDefaultViewIdMobile] = useState<number | null>(null);
  const [defaultViewIdDesktop, setDefaultViewIdDesktop] = useState<number | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [overviewViewMobile, setOverviewViewMobile] = useState<MapToggleView | null>(null);
  const [overviewViewDesktop, setOverviewViewDesktop] = useState<MapToggleView | null>(null);
  const [focusViewMobile, setFocusViewMobile] = useState<MapToggleView | null>(null);
  const [focusViewDesktop, setFocusViewDesktop] = useState<MapToggleView | null>(null);
  const [zoomToggleMode, setZoomToggleMode] = useState<"overview" | "focus">("overview");

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

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/settings`);
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      const data = await response.json();
      const settings = data?.settings ?? {};
      const legacyId = settings.default_map_view_id ?? null;
      const hasMobile = Object.prototype.hasOwnProperty.call(
        settings,
        "default_map_view_id_mobile"
      );
      const hasDesktop = Object.prototype.hasOwnProperty.call(
        settings,
        "default_map_view_id_desktop"
      );
      const mobileId = hasMobile ? settings.default_map_view_id_mobile : legacyId;
      const desktopId = hasDesktop ? settings.default_map_view_id_desktop : legacyId;
      setDefaultViewIdMobile(typeof mobileId === "number" ? mobileId : null);
      setDefaultViewIdDesktop(typeof desktopId === "number" ? desktopId : null);
      setOverviewViewMobile(parseMapToggleView(settings.map_toggle_view_overview_mobile));
      setOverviewViewDesktop(parseMapToggleView(settings.map_toggle_view_overview_desktop));
      setFocusViewMobile(parseMapToggleView(settings.map_toggle_view_focus_mobile));
      setFocusViewDesktop(parseMapToggleView(settings.map_toggle_view_focus_desktop));
    } catch (error) {
      console.error(error);
    }
  }, [apiBase]);

  const activeDefaultViewId = isMobile ? defaultViewIdMobile : defaultViewIdDesktop;

  const loadStatesData = useCallback(async () => {
    if (statesRef.current && statesLookupRef.current) {
      return statesRef.current;
    }
    const response = await fetch("/data/states.geojson");
    if (!response.ok) {
      throw new Error("Failed to load states");
    }
    const data = (await response.json()) as GeoFeatureCollection;
    statesRef.current = data;
    statesLookupRef.current = buildStateLookup(data.features ?? []);
    return data;
  }, []);

  const loadCitiesData = useCallback(async () => {
    if (citiesRef.current && citiesLookupRef.current) {
      return citiesRef.current;
    }
    const response = await fetch("/data/cities.geojson");
    if (!response.ok) {
      throw new Error("Failed to load cities");
    }
    const data = (await response.json()) as GeoFeatureCollection;
    citiesRef.current = data;
    citiesLookupRef.current = buildCityLookup(data.features ?? []);
    return data;
  }, []);

  const rebuildCountryLabels = useCallback(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    const countries = countriesRef.current?.features ?? [];
    if (countries.length === 0) {
      return;
    }
    const labelCollection = buildCountryLabelCollection(
      countries,
      countryLabelPointsRef.current ?? undefined,
      useCentroidLabels
    );
    const hasAll = Boolean(map.getLayer("country-labels-all"));
    const hasSelected = Boolean(map.getLayer("country-labels-selected"));
    if (hasAll) {
      map.removeLayer("country-labels-all");
    }
    if (hasSelected) {
      map.removeLayer("country-labels-selected");
    }
    if (map.getSource("country-labels")) {
      map.removeSource("country-labels");
    }
    map.addSource("country-labels", {
      type: "geojson",
      data: labelCollection,
    });
    ensureLabelLayers(map);
    applyLabelState(
      map,
      labelsMode,
      selectedIso2,
      allLabelsFiltered,
      showExcludedCountries,
      allowLabelOverlap
    );
  }, [
    allowLabelOverlap,
    allLabelsFiltered,
    dataStatus,
    labelsMode,
    mapReady,
    selectedIso2,
    showExcludedCountries,
    useCentroidLabels,
  ]);

  const resolveCountryCode = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = normalizeKey(trimmed);
    const alias = COUNTRY_ALIAS_TO_ISO2[normalized];
    if (alias) {
      return alias;
    }
    if (trimmed.length === 2) {
      return trimmed.toUpperCase();
    }
    const feature = countriesIndexRef.current.get(normalized);
    if (!feature) {
      return null;
    }
    const iso2 = String(feature.properties?.["ISO3166-1-Alpha-2"] ?? "").trim();
    return iso2 ? iso2.toUpperCase() : null;
  }, []);

  const captureToggleView = useCallback((): MapToggleView | null => {
    const map = mapRef.current;
    if (!map) {
      return null;
    }
    const center = map.getCenter();
    return {
      center_lng: center.lng,
      center_lat: center.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      map_scale: mapScale ?? DEFAULT_MAP_SCALE,
    };
  }, [mapScale]);

  const applySavedView = useCallback(
    (view: SavedView) => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }
      const labelsModeValue = view.labels_mode ?? "all";
      const selected = view.selected_iso2 ?? [];
      const selectedStates = view.selected_state_codes ?? [];
      const selectedCities = view.selected_city_keys ?? [];
      setLabelsMode(labelsModeValue);
      setCitiesVisible(view.cities_visible);
      setStatesVisible(view.states_visible);
      setFocusSeasOnly(view.focus_seas_only);
      setSelectedIso2(selected);
      setSelectedStateCodes(selectedStates);
      setSelectedCityKeys(selectedCities);
      setMapScale(view.map_scale ?? DEFAULT_MAP_SCALE);
      applySelection(map, selected, selectedStates, showExcludedCountries);
      applyStateSelection(map, selectedStates);
      applyCitySelection(map, selectedCities);
      applyLabelState(
        map,
        labelsModeValue,
        selected,
        allLabelsFiltered,
        showExcludedCountries,
        allowLabelOverlap
      );
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

  const handleEditView = useCallback((view: SavedView) => {
    setEditingViewId(view.id);
    setEditingName(view.name);
  }, []);

  const handleRenameView = useCallback(
    async (view: SavedView) => {
      const trimmed = editingName.trim();
      if (!trimmed) {
        setStatus("Name is required.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }
      try {
        const response = await fetch(`${apiBase}/map-views/${view.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!response.ok) {
          throw new Error("Failed to update view");
        }
        const data = await response.json();
        const updated = data?.view as SavedView | undefined;
        if (updated) {
          setSavedViews((prev) =>
            prev.map((entry) => (entry.id === updated.id ? updated : entry))
          );
        }
        setEditingViewId(null);
        setEditingName("");
      } catch (error) {
        console.error(error);
        setStatus("Failed to update view.");
        window.setTimeout(() => setStatus(null), 2000);
      }
    },
    [apiBase, editingName]
  );

  const handleSetDefaultView = useCallback(
    async (view: SavedView) => {
      try {
        const field = isMobile ? "default_map_view_id_mobile" : "default_map_view_id_desktop";
        const response = await fetch(`${apiBase}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: view.id }),
        });
        if (!response.ok) {
          throw new Error("Failed to update settings");
        }
        if (isMobile) {
          setDefaultViewIdMobile(view.id);
        } else {
          setDefaultViewIdDesktop(view.id);
        }
        setStatus("Default view updated.");
        window.setTimeout(() => setStatus(null), 2000);
      } catch (error) {
        console.error(error);
        setStatus("Failed to update default view.");
        window.setTimeout(() => setStatus(null), 2000);
      }
    },
    [apiBase, isMobile]
  );

  const handleClearDefaultView = useCallback(async () => {
    try {
      const field = isMobile ? "default_map_view_id_mobile" : "default_map_view_id_desktop";
      const response = await fetch(`${apiBase}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: null }),
      });
      if (!response.ok) {
        throw new Error("Failed to update settings");
      }
      if (isMobile) {
        setDefaultViewIdMobile(null);
      } else {
        setDefaultViewIdDesktop(null);
      }
      setStatus("Default view cleared.");
      window.setTimeout(() => setStatus(null), 2000);
    } catch (error) {
      console.error(error);
      setStatus("Failed to clear default view.");
      window.setTimeout(() => setStatus(null), 2000);
    }
  }, [apiBase, isMobile]);

  const applyToggleView = useCallback((view: MapToggleView) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    setMapScale(view.map_scale ?? DEFAULT_MAP_SCALE);
    const center = map.getCenter();
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    map.flyTo({
      center: [center.lng, center.lat],
      zoom: view.zoom,
      bearing,
      pitch,
      duration: 800,
    });
  }, []);

  const handleSetToggleView = useCallback(
    async (kind: "overview" | "focus") => {
      const view = captureToggleView();
      if (!view) {
        return;
      }
      const field = isMobile
        ? `map_toggle_view_${kind}_mobile`
        : `map_toggle_view_${kind}_desktop`;
      try {
        const response = await fetch(`${apiBase}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: JSON.stringify(view) }),
        });
        if (!response.ok) {
          throw new Error("Failed to update settings");
        }
        if (isMobile) {
          if (kind === "overview") {
            setOverviewViewMobile(view);
          } else {
            setFocusViewMobile(view);
          }
        } else if (kind === "overview") {
          setOverviewViewDesktop(view);
        } else {
          setFocusViewDesktop(view);
        }
        setStatus(kind === "overview" ? "Overview view saved." : "Focus view saved.");
        window.setTimeout(() => setStatus(null), 2000);
      } catch (error) {
        console.error(error);
        setStatus("Failed to save view.");
        window.setTimeout(() => setStatus(null), 2000);
      }
    },
    [apiBase, captureToggleView, isMobile]
  );

  const handleToggleZoomView = useCallback(() => {
    const overview = isMobile ? overviewViewMobile : overviewViewDesktop;
    const focus = isMobile ? focusViewMobile : focusViewDesktop;
    if (!overview || !focus) {
      setStatus("Set overview and focus views first.");
      window.setTimeout(() => setStatus(null), 2200);
      return;
    }
    const nextMode = zoomToggleMode === "overview" ? "focus" : "overview";
    setZoomToggleMode(nextMode);
    applyToggleView(nextMode === "overview" ? overview : focus);
  }, [
    applyToggleView,
    focusViewDesktop,
    focusViewMobile,
    isMobile,
    overviewViewDesktop,
    overviewViewMobile,
    zoomToggleMode,
  ]);

  const handleOpenExplore = useCallback((prefill?: string) => {
    setExploreModalOpen(true);
    setMobilePanel(null);
    setScaleSliderOpen(false);
    setExploreMessage(null);
    setExploreStatus("idle");
    setExploreMatches(null);
    if (typeof prefill === "string") {
      setExploreInput(prefill);
    }
  }, []);

  const handleCloseExplore = useCallback(() => {
    setExploreModalOpen(false);
  }, []);

  const buildExploreMatches = useCallback(
    async (response: MapExploreResponse): Promise<MapExploreMatches> => {
      const countries: MapExploreCountryMatch[] = [];
      const states: MapExploreStateMatch[] = [];
      const cities: MapExploreCityMatch[] = [];
      const countryCodes = new Set<string>();
      const stateCodes = new Set<string>();
      const cityKeys = new Set<string>();
      const query = String(response.query ?? "").trim();
      const countryEntries = response.countries ?? [];
      const stateEntries = response.states ?? [];
      const cityEntries = response.cities ?? [];

      const countriesIndex = countriesIndexRef.current;
      countryEntries.forEach((entry) => {
        const name =
          typeof entry === "string"
            ? entry
            : String(entry.name ?? entry.code ?? "").trim();
        const resolvedCode = resolveCountryCode(
          typeof entry === "string" ? entry : String(entry.code ?? entry.name ?? "")
        );
        const feature =
          (resolvedCode
            ? countriesIndex.get(normalizeKey(resolvedCode))
            : undefined) ?? (name ? countriesIndex.get(normalizeKey(name)) : undefined);
        if (!feature) {
          return;
        }
        const iso2 = String(
          feature.properties?.["ISO3166-1-Alpha-2"] ?? resolvedCode ?? ""
        )
          .trim()
          .toUpperCase();
        if (!iso2 || countryCodes.has(iso2)) {
          return;
        }
        const displayName = String(feature.properties?.name ?? name ?? iso2).trim();
        countryCodes.add(iso2);
        countries.push({ name: displayName || iso2, code: iso2, feature });
      });

      if (stateEntries.length > 0) {
        await loadStatesData();
      }
      const stateLookup = statesLookupRef.current;
      if (stateLookup) {
        stateEntries.forEach((entry) => {
          const name =
            typeof entry === "string"
              ? entry
              : String(entry.name ?? entry.code ?? entry.postal ?? "").trim();
          const code =
            typeof entry === "string" ? "" : String(entry.code ?? "").trim().toUpperCase();
          const postal =
            typeof entry === "string" ? "" : String(entry.postal ?? "").trim().toUpperCase();
          const countryInput =
            typeof entry === "string"
              ? ""
              : String(entry.country_code ?? entry.country ?? "").trim();
          const countryCode = countryInput ? resolveCountryCode(countryInput) : null;

          let candidates: GeoFeature[] = [];
          if (code) {
            const match = stateLookup.byIso.get(code);
            if (match) {
              candidates = [match];
            }
          }
          if (!candidates.length && postal) {
            candidates = stateLookup.byPostal.get(normalizeKey(postal)) ?? [];
          }
          if (!candidates.length && name) {
            candidates = stateLookup.byName.get(normalizeKey(name)) ?? [];
          }
          if (countryCode) {
            candidates = candidates.filter(
              (feature) =>
                String(feature.properties?.iso_a2 ?? "")
                  .trim()
                  .toUpperCase() === countryCode
            );
          }
          candidates.forEach((feature) => {
            const iso2 = String(feature.properties?.iso_a2 ?? countryCode ?? "")
              .trim()
              .toUpperCase();
            const iso3166 = String(feature.properties?.iso_3166_2 ?? "")
              .trim()
              .toUpperCase();
            if (!iso3166 || stateCodes.has(iso3166)) {
              return;
            }
            const displayName = String(feature.properties?.name ?? name ?? iso3166).trim();
            stateCodes.add(iso3166);
            if (iso2 && !countryCodes.has(iso2)) {
              const countryFeature = countriesIndex.get(normalizeKey(iso2));
              if (countryFeature) {
                const countryName = String(countryFeature.properties?.name ?? iso2).trim();
                countryCodes.add(iso2);
                countries.push({ name: countryName || iso2, code: iso2, feature: countryFeature });
              }
            }
            states.push({
              name: displayName || iso3166,
              code: iso3166,
              countryCode: iso2 || "",
              feature,
            });
          });
        });
      }

      if (cityEntries.length > 0) {
        await loadCitiesData();
      }
      const cityLookup = citiesLookupRef.current;
      if (cityLookup) {
        cityEntries.forEach((entry) => {
          const name = typeof entry === "string" ? entry : String(entry.name ?? "").trim();
          if (!name) {
            return;
          }
          const countryInput =
            typeof entry === "string"
              ? ""
              : String(entry.country_code ?? entry.country ?? "").trim();
          const countryCode = countryInput ? resolveCountryCode(countryInput) : null;
          const normalized = normalizeKey(name);
          if (!normalized) {
            return;
          }
          let candidates: GeoFeature[] = [];
          if (countryCode) {
            const key = `${normalized}|${countryCode}`;
            candidates = cityLookup.byNameCountry.get(key) ?? [];
          }
          if (!candidates.length) {
            candidates = cityLookup.byName.get(normalized) ?? [];
          }
          candidates.forEach((feature) => {
            const iso2 = String(feature.properties?.iso_a2 ?? "")
              .trim()
              .toUpperCase();
            if (countryCode && iso2 && iso2 !== countryCode) {
              return;
            }
            const key = getCityKey(feature);
            if (!key || cityKeys.has(key)) {
              return;
            }
            const displayName = String(feature.properties?.name ?? name).trim();
            cityKeys.add(key);
            cities.push({
              name: displayName || name,
              key,
              countryCode: iso2 || countryCode || "",
              feature,
            });
          });
        });
      }

      return {
        query: query || [...states, ...countries].map((item) => item.name).join(", "),
        countries,
        states,
        cities,
      };
    },
    [loadCitiesData, loadStatesData, resolveCountryCode]
  );

  const handleExploreRequest = useCallback(async () => {
    const trimmed = exploreInput.trim();
    if (!trimmed) {
      setExploreMessage("Enter a passage to explore.");
      window.setTimeout(() => setExploreMessage(null), 2000);
      return;
    }
    if (countriesIndexRef.current.size === 0) {
      setExploreMessage("Countries data not ready.");
      window.setTimeout(() => setExploreMessage(null), 2000);
      return;
    }
    setExploreStatus("loading");
    setExploreMessage(null);
    setExploreMatches(null);
    try {
      const response = await fetch(`${apiBase}/explore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection_text: trimmed,
          instruction: MAP_EXPLORE_INSTRUCTION,
          mode: MAP_EXPLORE_MODE,
        }),
      });
      if (!response.ok) {
        throw new Error("Explore request failed");
      }
      const data = await response.json();
      const responseText = String(data?.response_text ?? "").trim();
      const parsed = parseMapExploreResponse(responseText);
      if (!parsed) {
        setExploreStatus("error");
        setExploreMessage("Could not parse the explore response.");
        return;
      }
      const matches = await buildExploreMatches(parsed);
      setExploreMatches(matches);
      if (
        matches.states.length === 0 &&
        matches.countries.length === 0 &&
        matches.cities.length === 0
      ) {
        setExploreMessage("No countries, states, or cities matched.");
      }
      setExploreStatus("ready");
    } catch (error) {
      console.error(error);
      setExploreStatus("error");
      setExploreMessage("Explore request failed.");
    }
  }, [apiBase, buildExploreMatches, exploreInput]);

  const handleExploreUse = useCallback(() => {
    if (!exploreMatches || !mapReady || dataStatus !== "ready") {
      return;
    }
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const cityKeys = exploreMatches.cities.map((entry) => entry.key);
    const cityCountryCodes = exploreMatches.cities
      .map((entry) => entry.countryCode)
      .filter(Boolean);
    if (exploreMatches.states.length > 0) {
      const stateCodes = exploreMatches.states.map((entry) => entry.code);
      const stateCountryCodes = exploreMatches.states
        .map((entry) => entry.countryCode)
        .filter(Boolean);
      const countryCodes = Array.from(
        new Set([
          ...exploreMatches.countries.map((entry) => entry.code),
          ...stateCountryCodes,
          ...cityCountryCodes,
        ])
      );
      setSelectedStateCodes(stateCodes);
      setSelectedCityKeys(cityKeys);
      setSelectedIso2(countryCodes);
      setLabelsMode("selected");
      applySelection(map, countryCodes, stateCodes, showExcludedCountries);
      applyStateSelection(map, stateCodes);
      applyCitySelection(map, cityKeys);
      applyLabelState(
        map,
        "selected",
        countryCodes,
        allLabelsFiltered,
        showExcludedCountries,
        allowLabelOverlap
      );
      applyCityFilter(map, "selected", countryCodes);
      applyStateFilter(map, "selected", countryCodes);
      const bbox = unionBounds(exploreMatches.states.map((entry) => entry.feature));
      if (bbox) {
        map.fitBounds(
          [
            [bbox.west, bbox.south],
            [bbox.east, bbox.north],
          ],
          { padding: 60, duration: 800 }
        );
      }
    } else if (exploreMatches.countries.length > 0 || cityKeys.length > 0) {
      const iso2Codes = exploreMatches.countries.map((entry) => entry.code);
      const combinedCodes = Array.from(new Set([...iso2Codes, ...cityCountryCodes]));
      setSelectedStateCodes([]);
      setSelectedCityKeys(cityKeys);
      setSelectedIso2(combinedCodes);
      setLabelsMode("selected");
      applySelection(map, combinedCodes, [], showExcludedCountries);
      applyStateSelection(map, []);
      applyCitySelection(map, cityKeys);
      applyLabelState(
        map,
        "selected",
        combinedCodes,
        allLabelsFiltered,
        showExcludedCountries,
        allowLabelOverlap
      );
      applyCityFilter(map, "selected", combinedCodes);
      applyStateFilter(map, "selected", combinedCodes);
      const bbox =
        exploreMatches.countries.length > 0
          ? unionBounds(exploreMatches.countries.map((entry) => entry.feature))
          : unionBounds(exploreMatches.cities.map((entry) => entry.feature));
      if (bbox) {
        map.fitBounds(
          [
            [bbox.west, bbox.south],
            [bbox.east, bbox.north],
          ],
          { padding: 60, duration: 800 }
        );
      }
    }
    if (exploreMatches.query) {
      setQuery(exploreMatches.query);
    }
    setExploreModalOpen(false);
  }, [allLabelsFiltered, dataStatus, exploreMatches, mapReady]);

  useEffect(() => {
    if (!initialExploreText) {
      return;
    }
    setExploreInput(initialExploreText);
    setExploreModalOpen(true);
    setExploreMessage(null);
    setExploreMatches(null);
    setExploreStatus("idle");
    autoExploreRequestedRef.current = false;
  }, [initialExploreText]);

  useEffect(() => {
    if (!autoExplore || !initialExploreText) {
      return;
    }
    if (autoExploreRequestedRef.current) {
      return;
    }
    if (dataStatus !== "ready") {
      return;
    }
    if (countriesIndexRef.current.size === 0) {
      return;
    }
    if (exploreStatus === "loading") {
      return;
    }
    autoExploreRequestedRef.current = true;
    void handleExploreRequest();
  }, [autoExplore, dataStatus, exploreStatus, handleExploreRequest, initialExploreText]);

  const handleDeleteView = useCallback(
    async (view: SavedView) => {
      const confirmed = window.confirm(`Delete "${view.name}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
      try {
        const response = await fetch(`${apiBase}/map-views/${view.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Failed to delete view");
        }
        setSavedViews((prev) => prev.filter((entry) => entry.id !== view.id));
        if (editingViewId === view.id) {
          setEditingViewId(null);
          setEditingName("");
        }
        const updates: Record<string, number | null> = {};
        if (defaultViewIdMobile === view.id) {
          updates.default_map_view_id_mobile = null;
        }
        if (defaultViewIdDesktop === view.id) {
          updates.default_map_view_id_desktop = null;
        }
        if (Object.keys(updates).length > 0) {
          const settingsResponse = await fetch(`${apiBase}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          if (!settingsResponse.ok) {
            setStatus("View deleted, but failed to clear defaults.");
            window.setTimeout(() => setStatus(null), 2500);
            return;
          }
          if (defaultViewIdMobile === view.id) {
            setDefaultViewIdMobile(null);
          }
          if (defaultViewIdDesktop === view.id) {
            setDefaultViewIdDesktop(null);
          }
        }
        setStatus("View deleted.");
        window.setTimeout(() => setStatus(null), 2000);
      } catch (error) {
        console.error(error);
        setStatus("Failed to delete view.");
        window.setTimeout(() => setStatus(null), 2000);
      }
    },
    [apiBase, defaultViewIdDesktop, defaultViewIdMobile, editingViewId]
  );

  const handleMobilePanel = useCallback(
    (panel: "views" | "settings") => {
      setMobileBarsVisible(true);
      setScaleSliderOpen(false);
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
          selected_state_codes: selectedStateCodes,
          selected_city_keys: selectedCityKeys,
          map_scale: mapScale,
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
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 1000);
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
              "text-font": ["Roboto Medium", "Arial Unicode MS Regular"],
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
        (data.features ?? []).forEach((feature: GeoFeature) => {
          const props = feature.properties ?? {};
          const name = String(props.name ?? "").trim();
          if (!name) {
            return;
          }
          const excluded = isExcludedCountryName(name);
          const polygonInfo = feature.geometry
            ? getLargestPolygonInfo(feature.geometry)
            : null;
          const largestArea = polygonInfo?.area ?? 0;
          const iso2 = String(props["ISO3166-1-Alpha-2"] ?? "").trim();
          if (iso2 && iso2 !== "-99") {
            feature.properties = {
              ...props,
              largest_area: largestArea,
              excluded_country: excluded,
            };
            return;
          }
          const override = COUNTRY_CODE_OVERRIDES[name];
          if (!override) {
            feature.properties = {
              ...props,
              largest_area: largestArea,
              excluded_country: excluded,
            };
            return;
          }
          feature.properties = {
            ...props,
            "ISO3166-1-Alpha-2": override.iso2,
            "ISO3166-1-Alpha-3": override.iso3,
            largest_area: largestArea,
            excluded_country: excluded,
          };
        });
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
          countryLabelPointsRef.current = labelPoints ?? null;
          const labelCollection = buildCountryLabelCollection(
            data.features ?? [],
            labelPoints,
            useCentroidLabels
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
            filter: [
              "all",
              [">=", ["get", "largest_area"], SMALL_ISLAND_AREA_CUTOFF],
              ["!=", ["get", "excluded_country"], true],
            ],
            paint: {
              "line-color": "#8c7b6f",
              "line-width": 1.1,
              "line-opacity": 0.75,
            },
          });
        }
        if (!map.getLayer("countries-selected-outline")) {
          map.addLayer({
            id: "countries-selected-outline",
            type: "line",
            source: "countries",
            paint: {
              "line-color": "#c24b3b",
              "line-width": 2,
              "line-opacity": 0.9,
            },
            filter: [
              "all",
              ["==", ["get", "ISO3166-1-Alpha-2"], ""],
              [">=", ["get", "largest_area"], SMALL_ISLAND_AREA_CUTOFF],
              ["!=", ["get", "excluded_country"], true],
            ],
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
      const initialZoom = isMobileScreen ? -2 : DEFAULT_ZOOM;
      const map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: DEFAULT_CENTER,
        zoom: initialZoom,
        minZoom: -2,
        attributionControl: false,
      });
      if (SHOW_MAP_CONTROLS) {
        map.addControl(new maplibre.NavigationControl(), "top-right");
      }
      map.setRenderWorldCopies(true);
      map.dragRotate.disable();
      map.touchPitch.disable();
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      if (scaleTest) {
        map.doubleClickZoom.disable();
        map.on("dblclick", (event) => {
          event.preventDefault();
          setScaleSliderOpen((prev) => !prev);
        });
      } else if (isMobileScreen) {
        map.setMinZoom(-2);
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
    setMobileBarsVisible(true);
    if (!matches) {
      setMobilePanel(null);
    } else {
      setSaveModalOpen(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedViews();
    void loadSettings();
  }, [loadSavedViews, loadSettings]);

  useEffect(() => {
    rebuildCountryLabels();
  }, [rebuildCountryLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    ensureLabelLayers(map);
    applyLabelState(
      map,
      labelsMode,
      selectedIso2,
      allLabelsFiltered,
      showExcludedCountries,
      allowLabelOverlap
    );
  }, [
    allLabelsFiltered,
    allowLabelOverlap,
    dataStatus,
    labelsMode,
    mapReady,
    selectedIso2,
    showExcludedCountries,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    applySelection(map, selectedIso2, selectedStateCodes, showExcludedCountries);
    applyCountryOutlineFilter(map, showExcludedCountries);
  }, [
    dataStatus,
    mapReady,
    selectedIso2,
    selectedStateCodes,
    showExcludedCountries,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    applyMarineFilter(map, focusSeasOnly);
  }, [dataStatus, focusSeasOnly, mapReady]);

  useEffect(() => {
    if (!mapReady || dataStatus !== "ready" || defaultApplied) {
      return;
    }
    if (!activeDefaultViewId) {
      setDefaultApplied(true);
      return;
    }
    const view = savedViews.find((entry) => entry.id === activeDefaultViewId);
    if (!view) {
      return;
    }
    applySavedView(view);
    setDefaultApplied(true);
  }, [
    applySavedView,
    dataStatus,
    defaultApplied,
    activeDefaultViewId,
    mapReady,
    savedViews,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    const needsCities = citiesVisible || selectedCityKeys.length > 0;
    if (!needsCities) {
      if (map.getLayer("city-labels")) {
        map.setLayoutProperty("city-labels", "visibility", "none");
      }
      if (map.getLayer("city-selection")) {
        applyCitySelection(map, []);
        map.setLayoutProperty("city-selection", "visibility", "none");
      }
      return;
    }
    const ensureCities = async () => {
      if (map.getSource("cities")) {
        map.setLayoutProperty("city-labels", "visibility", citiesVisible ? "visible" : "none");
        if (map.getLayer("city-selection")) {
          map.setLayoutProperty("city-selection", "visibility", "visible");
        }
        applyCityFilter(map, labelsMode, selectedIso2);
        applyCitySelection(map, selectedCityKeys);
        return;
      }
      setCitiesStatus("loading");
      try {
        const data = await loadCitiesData();
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
            "text-font": ["Roboto Regular", "Arial Unicode MS Regular"],
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
        map.addLayer({
          id: "city-selection",
          type: "circle",
          source: "cities",
          minzoom: 1.2,
          paint: {
            "circle-color": "rgba(47,120,208,0)",
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#2f78d0",
          },
          filter: ["==", ["to-string", ["get", "ne_id"]], ""],
        });
        map.setLayoutProperty("city-labels", "visibility", "visible");
        applyCityFilter(map, labelsMode, selectedIso2);
        applyCitySelection(map, selectedCityKeys);
        setCitiesStatus("ready");
      } catch (error) {
        console.error(error);
        setCitiesStatus("error");
      }
    };
    void ensureCities();
  }, [
    citiesVisible,
    dataStatus,
    labelsMode,
    loadCitiesData,
    mapReady,
    selectedCityKeys,
    selectedIso2,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || dataStatus !== "ready" || !map) {
      return;
    }
    const needsStates = statesVisible || selectedStateCodes.length > 0;
    if (!needsStates) {
      if (map.getLayer("state-selection")) {
        applyStateSelection(map, []);
      }
      if (map.getLayer("state-labels")) {
        map.setLayoutProperty("state-labels", "visibility", "none");
      }
      if (map.getLayer("state-borders")) {
        map.setLayoutProperty("state-borders", "visibility", "none");
      }
      return;
    }
    const ensureStates = async () => {
    if (map.getSource("state-labels") && map.getSource("states")) {
        applyStateLabelMode(map, stateAbbrevLabels, statesVisible);
        if (map.getLayer("state-borders")) {
          map.setLayoutProperty("state-borders", "visibility", statesVisible ? "visible" : "none");
        }
        if (map.getLayer("state-selection")) {
          map.setLayoutProperty("state-selection", "visibility", "visible");
        }
        applyStateFilter(map, labelsMode, selectedIso2);
        applyStateSelection(map, selectedStateCodes);
        return;
      }
      setStatesStatus("loading");
      try {
        const data = await loadStatesData();
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
        if (!map.getLayer("state-selection")) {
          map.addLayer(
            {
              id: "state-selection",
              type: "line",
              source: "states",
              minzoom: 1.2,
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#c24b3b",
                "line-width": 1.6,
                "line-opacity": 0.9,
              },
              filter: ["==", ["get", "iso_3166_2"], ""],
            },
            labelBefore
          );
        }
        if (!map.getLayer("state-labels-abbrev")) {
          map.addLayer(
            {
              id: "state-labels-abbrev",
              type: "symbol",
              source: "state-labels",
              minzoom: STATE_LABEL_ABBREV_MIN_ZOOM,
              maxzoom: STATE_LABEL_SWITCH_ZOOM,
              filter: [
                "in",
                ["get", "iso_a2"],
                ["literal", STATE_LABEL_ABBREV_COUNTRIES],
              ],
              layout: {
                "text-field": ["coalesce", ["get", "abbr"], ["get", "name"]],
                "text-size": 10,
                "text-font": ["Roboto Medium", "Arial Unicode MS Regular"],
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
        if (!map.getLayer("state-labels")) {
          map.addLayer(
            {
              id: "state-labels",
              type: "symbol",
              source: "state-labels",
              minzoom: STATE_LABEL_FULL_MIN_ZOOM,
              layout: {
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-font": ["Roboto Medium", "Arial Unicode MS Regular"],
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
        applyStateLabelMode(map, stateAbbrevLabels, statesVisible);
        map.setLayoutProperty("state-borders", "visibility", statesVisible ? "visible" : "none");
        applyStateFilter(map, labelsMode, selectedIso2);
        applyStateSelection(map, selectedStateCodes);
        setStatesStatus("ready");
      } catch (error) {
        console.error(error);
        setStatesStatus("error");
      }
    };
    void ensureStates();
  }, [
    dataStatus,
    labelsMode,
    loadStatesData,
    mapReady,
    selectedIso2,
    selectedStateCodes,
    stateAbbrevLabels,
    statesVisible,
  ]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
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
      if (terms.length === 0) {
        setStatus("No places found.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }
      const countryMatches: GeoFeature[] = [];
      const stateMatches: GeoFeature[] = [];
      const cityMatches: GeoFeature[] = [];
      const unmatchedTerms: string[] = [];

      terms.forEach((term) => {
        const feature = index.get(normalizeKey(term)) ?? null;
        if (feature) {
          countryMatches.push(feature);
        } else {
          unmatchedTerms.push(term);
        }
      });

      if (unmatchedTerms.length > 0) {
        try {
          await Promise.all([loadStatesData(), loadCitiesData()]);
        } catch (error) {
          console.warn("Failed to load states or cities", error);
        }
        const stateLookup = statesLookupRef.current;
        const cityLookup = citiesLookupRef.current;
        unmatchedTerms.forEach((term) => {
          const normalizedTerm = normalizeKey(term);
          if (!normalizedTerm) {
            return;
          }
          if (stateLookup) {
            const upper = term.trim().toUpperCase();
            let candidates: GeoFeature[] = [];
            if (upper.includes("-")) {
              const match = stateLookup.byIso.get(upper);
              if (match) {
                candidates = [match];
              }
            }
            if (!candidates.length && upper.length <= 3) {
              candidates = stateLookup.byPostal.get(normalizeKey(upper)) ?? [];
            }
            if (!candidates.length) {
              candidates = stateLookup.byName.get(normalizedTerm) ?? [];
            }
            candidates.forEach((feature) => {
              if (!feature.geometry) {
                return;
              }
              stateMatches.push(feature);
            });
          }
          if (cityLookup) {
            const candidates = cityLookup.byName.get(normalizedTerm) ?? [];
            candidates.forEach((feature) => {
              if (!feature.geometry) {
                return;
              }
              cityMatches.push(feature);
            });
          }
        });
      }

      if (countryMatches.length === 0 && stateMatches.length === 0 && cityMatches.length === 0) {
        setStatus("No matches found.");
        window.setTimeout(() => setStatus(null), 2000);
        return;
      }

      const stateCodes = Array.from(
        new Set(
          stateMatches
            .map((feature) => String(feature.properties?.iso_3166_2 ?? "").trim())
            .filter(Boolean)
        )
      );
      const cityKeys = Array.from(
        new Set(
          cityMatches.map((feature) => getCityKey(feature)).filter((key) => Boolean(key))
        )
      );
      const countryCodes = new Set<string>();
      countryMatches.forEach((feature) => {
        const iso2 = String(feature.properties?.["ISO3166-1-Alpha-2"] ?? "").trim();
        if (iso2) {
          countryCodes.add(iso2.toUpperCase());
        }
      });
      stateMatches.forEach((feature) => {
        const iso2 = String(feature.properties?.iso_a2 ?? "").trim();
        if (iso2) {
          countryCodes.add(iso2.toUpperCase());
        }
      });
      cityMatches.forEach((feature) => {
        const iso2 = String(feature.properties?.iso_a2 ?? "").trim();
        if (iso2) {
          countryCodes.add(iso2.toUpperCase());
        }
      });

      const iso2Codes = Array.from(countryCodes);
      setSelectedIso2(iso2Codes);
      setSelectedStateCodes(stateCodes);
      setSelectedCityKeys(cityKeys);
      setLabelsMode("selected");
      applySelection(map, iso2Codes, stateCodes, showExcludedCountries);
      applyStateSelection(map, stateCodes);
      applyCitySelection(map, cityKeys);
      applyLabelState(
        map,
        "selected",
        iso2Codes,
        allLabelsFiltered,
        showExcludedCountries,
        allowLabelOverlap
      );
      applyCityFilter(map, "selected", iso2Codes);
      applyStateFilter(map, "selected", iso2Codes);

      const bbox = unionBounds([...countryMatches, ...stateMatches, ...cityMatches]);
      if (bbox) {
        map.fitBounds(
          [
            [bbox.west, bbox.south],
            [bbox.east, bbox.north],
          ],
          { padding: 60, duration: 800 }
        );
      }
      const label = [
        stateCodes.length ? `${stateCodes.length} states` : null,
        cityKeys.length ? `${cityKeys.length} cities` : null,
        iso2Codes.length ? `${iso2Codes.length} countries` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setStatus(label ? `Showing ${label}.` : "Showing selection.");
      window.setTimeout(() => setStatus(null), 2000);
    },
    [allLabelsFiltered, dataStatus, labelsMode, loadCitiesData, loadStatesData, mapReady, query]
  );

  const savedViewsList =
    savedViewsStatus === "loading" ? (
      <div className="map-modal__empty">Loading saved views...</div>
    ) : savedViews.length === 0 ? (
      <div className="map-modal__empty">No saved views yet.</div>
    ) : (
      <div className="map-modal__list">
        {savedViews.map((view) => {
          const isEditing = editingViewId === view.id;
          const isDefault = activeDefaultViewId === view.id;
          return (
            <div key={view.id} className="map-view-card">
              {isEditing ? (
                <>
                  <input
                    className="map-view-card__input"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleRenameView(view);
                      }
                    }}
                  />
                  <div className="map-view-card__actions">
                    <button
                      type="button"
                      className="map-view-card__action"
                      onClick={() => void handleRenameView(view)}
                      aria-label="Save name"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          d="M4 10.5 8.2 14.5 16 6.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="map-view-card__action"
                      onClick={() => void handleSetDefaultView(view)}
                      disabled={isDefault}
                      aria-label="Set default view"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          d="M10 3.3 12.2 8l5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7L10 3.3Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {isDefault ? (
                      <button
                        type="button"
                        className="map-view-card__action"
                        onClick={() => void handleClearDefaultView()}
                        aria-label="Clear default view"
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path
                            d="M10 3.3 12.2 8l5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7L10 3.3Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M5 15.5 15 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="map-view-card__action"
                      onClick={() => void handleDeleteView(view)}
                      aria-label="Delete view"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          d="M5.5 6.5h9l-.6 9a1.2 1.2 0 0 1-1.2 1.1H7.3A1.2 1.2 0 0 1 6.1 15.5l-.6-9Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 6.5V5.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                        <path
                          d="M4 6.5h12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="map-view-card__action map-view-card__action--ghost"
                      onClick={() => {
                        setEditingViewId(null);
                        setEditingName("");
                      }}
                      aria-label="Cancel edit"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="map-view-card__main"
                    onClick={() => applySavedView(view)}
                  >
                    <span className="map-view-card__title-row">
                      <span className="map-view-card__title">{view.name}</span>
                      {isDefault ? (
                        <span className="map-view-card__default" aria-label="Default view">
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <path
                              d="M10 3.3 12.2 8l5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7L10 3.3Z"
                              fill="currentColor"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </span>
                    <span className="map-view-card__meta">
                      Zoom {Math.round(view.zoom * 10) / 10}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="map-view-card__edit"
                    aria-label={`Edit ${view.name}`}
                    onClick={() => handleEditView(view)}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="M4 13.5 13.4 4.1a1.4 1.4 0 0 1 2 2L6 15.5l-3.5.5.5-3.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          );
        })}
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
      <label
        className={`map-toggle${labelsMode !== "all" ? " map-toggle--disabled" : ""}`}
      >
        <input
          type="checkbox"
          checked={allLabelsFiltered}
          onChange={(event) => setAllLabelsFiltered(event.target.checked)}
          disabled={labelsMode !== "all"}
        />
        <span>Curated list only</span>
      </label>
      <label className="map-toggle">
        <input
          type="checkbox"
          checked={showExcludedCountries}
          onChange={(event) => setShowExcludedCountries(event.target.checked)}
        />
        <span>Show minor territories</span>
      </label>
      <label className="map-toggle">
        <input
          type="checkbox"
          checked={allowLabelOverlap}
          onChange={(event) => setAllowLabelOverlap(event.target.checked)}
        />
        <span>Allow label overlap</span>
      </label>
      <label className="map-toggle">
        <input
          type="checkbox"
          checked={useCentroidLabels}
          onChange={(event) => setUseCentroidLabels(event.target.checked)}
        />
        <span>Center labels (centroid)</span>
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
      <label
        className={`map-toggle${
          !mapReady || !statesVisible ? " map-toggle--disabled" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={stateAbbrevLabels}
          onChange={(event) => setStateAbbrevLabels(event.target.checked)}
          disabled={!mapReady || !statesVisible}
        />
        <span>Abbreviations when zoomed out</span>
      </label>
      <label className="map-toggle">
        <input
          type="checkbox"
          checked={focusSeasOnly}
          onChange={(event) => setFocusSeasOnly(event.target.checked)}
        />
        <span>Focus seas: Gulf of Mexico + Mediterranean</span>
      </label>
      <div className="map-sidepanel__divider" />
      <div className="map-sidepanel__row">
        <span>Scale</span>
        <button
          type="button"
          className="map-icon-button map-icon-button--inline"
          onClick={() =>
            setScaleSliderOpen((prev) => {
              const next = !prev;
              if (next && isMobile) {
                setMobilePanel(null);
              }
              return next;
            })
          }
          aria-label="Toggle scale slider"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M4 6h12M4 10h8M4 14h10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="map-sidepanel__row">
        <span>Toggle view</span>
        <div className="map-sidepanel__row-actions">
          <button
            type="button"
            className="map-action-button"
            onClick={() => void handleSetToggleView("overview")}
          >
            Set overview
          </button>
          <button
            type="button"
            className="map-action-button"
            onClick={() => void handleSetToggleView("focus")}
          >
            Set focus
          </button>
        </div>
      </div>
    </div>
  );

  const scaleValue = mapScale;
  const scaleSize = 100 / scaleValue;
  const scaleOffset = (scaleSize - 100) / 2;
  const mapCanvasStyle = {
    width: `${scaleSize}%`,
    height: `${scaleSize}%`,
    left: `-${scaleOffset}%`,
    top: `-${scaleOffset}%`,
    transform: `scale(${scaleValue})`,
  } as const;
  const hideMobileBars = isMobile && scaleSliderOpen;
  const showToolbar = !scaleTest;
  const showSidepanel = !scaleTest && (!isMobile || mobilePanel !== null);
  const showBottomNav = !scaleTest && isMobile && mobileBarsVisible && !scaleSliderOpen;
  const hasExploreMatches =
    !!exploreMatches &&
    (exploreMatches.states.length > 0 ||
      exploreMatches.countries.length > 0 ||
      exploreMatches.cities.length > 0);

  return (
    <div className="map-page">
      {showToolbar ? (
        <header
          className={`map-toolbar${isMobile ? " map-toolbar--mobile" : ""}${
            isMobile && (!mobileBarsVisible || hideMobileBars) ? " map-toolbar--hidden" : ""
          }`}
        >
          <div className="map-toolbar__title">Map</div>
          <form className="map-toolbar__controls" onSubmit={handleSubmit}>
            <button
              type="button"
              className={`map-button map-button--icon-only darkgrey ${
                saveSuccess ? " map-button--saved" : ""
              }`}
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
          </form>
          {onClose ? (
            <button
              type="button"
              className="map-icon-button map-icon-button--inline map-toolbar__close"
              onClick={onClose}
              aria-label="Close map"
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
          ) : null}
        </header>
      ) : null}
      <div className="map-shell">
        <div className="map-canvas" style={mapCanvasStyle} ref={containerRef} />
        {scaleSliderOpen ? (
          <button
            type="button"
            className="map-scale-scrim"
            onClick={() => setScaleSliderOpen(false)}
            aria-label="Close scale slider"
          />
        ) : null}
        {scaleSliderOpen ? (
          <div className="map-scale-slider">
            <div className="map-scale-slider__label">
              Scale {Math.round(scaleValue * 100)}%
            </div>
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.01}
              value={mapScale}
              onChange={(event) => setMapScale(Number(event.target.value))}
            />
          </div>
        ) : null}
        {isMobile && mobilePanel !== null ? (
          <button
            type="button"
            className="map-bottomsheet-scrim"
            onClick={() => setMobilePanel(null)}
            aria-label="Close panel"
          />
        ) : null}
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
        {showBottomNav ? (
          <div className="map-mobile-nav">
            <button
              type="button"
              className="map-mobile-nav__button"
              aria-label="Explore"
              onClick={() => handleOpenExplore()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M10.5 17.5a7 7 0 1 1 4.8-2L19 19"
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
            <button
              type="button"
              className="map-mobile-nav__button"
              onClick={() => handleToggleZoomView()}
              aria-label="Toggle view"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 9V5h4M19 15v4h-4M15 5h4v4M9 19H5v-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
        {exploreModalOpen ? (
          <div
            className="map-modal map-modal--explore"
            role="dialog"
            aria-modal="true"
            onClick={() => handleCloseExplore()}
          >
            <div
              className="map-modal__panel map-modal__panel--explore"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="map-modal__header">
                <div className="map-modal__title">Explore map</div>
                <button
                  type="button"
                  className="map-modal__close"
                  onClick={() => handleCloseExplore()}
                  aria-label="Close explore"
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
                <div className="map-modal__label">Passage</div>
                <textarea
                  className="map-modal__input map-modal__textarea"
                  value={exploreInput}
                  onChange={(event) => setExploreInput(event.target.value)}
                  placeholder="Paste text to extract places..."
                />
                <div className="map-modal__actions">
                  <button
                    type="button"
                    className="map-button map-button--icon-only"
                    onClick={() => void handleExploreRequest()}
                    disabled={exploreStatus === "loading"}
                    aria-label="Explore"
                  >
                    <span className="map-button__icon" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <path
                          d="M8.5 14.5a6 6 0 1 1 4.2-1.8L16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="map-button__text">
                      {exploreStatus === "loading" ? "Exploring..." : "Explore"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="map-button map-button--icon-only map-button--secondary"
                    onClick={() => handleExploreUse()}
                    disabled={!hasExploreMatches}
                    aria-label="Use selection"
                  >
                    <span className="map-button__icon" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <path
                          d="M4 10.5 8.2 14.5 16 6.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="map-button__text">Use</span>
                  </button>
                </div>
                {exploreMessage ? <div className="map-modal__status">{exploreMessage}</div> : null}
                {exploreMatches ? (
                  <>
                    <div className="map-modal__divider" />
                    <div className="map-modal__label">Matches</div>
                    <div className="map-modal__status">
                      States:{" "}
                      {exploreMatches.states.length > 0
                        ? exploreMatches.states.map((state) => state.name).join(", ")
                        : "none"}
                    </div>
                    <div className="map-modal__status">
                      Countries:{" "}
                      {exploreMatches.countries.length > 0
                        ? exploreMatches.countries.map((country) => country.name).join(", ")
                        : "none"}
                    </div>
                    {exploreMatches.cities.length > 0 ? (
                      <div className="map-modal__status">
                        Cities: {exploreMatches.cities.map((city) => city.name).join(", ")}
                      </div>
                    ) : null}
                    {exploreMatches.query ? (
                      <div className="map-modal__status">Map query: {exploreMatches.query}</div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
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
  const hasAbbrevLabels = map.getLayer("state-labels-abbrev");
  const hasBorders = map.getLayer("state-borders");
  if (!hasLabels && !hasAbbrevLabels && !hasBorders) {
    return;
  }
  const featuredIso2 = FEATURED_STATE_BORDER_ISO2.map((code) => code.toUpperCase());
  const abbrevFilter =
    STATE_LABEL_ABBREV_COUNTRIES.length === 0
      ? ["==", ["get", "iso_a2"], ""]
      : ["in", ["get", "iso_a2"], ["literal", STATE_LABEL_ABBREV_COUNTRIES]];
  const featuredFilter =
    featuredIso2.length === 0
      ? ["==", ["get", "iso_a2"], ""]
      : ["in", ["get", "iso_a2"], ["literal", featuredIso2]];
  if (mode === "none") {
    if (hasLabels) {
      map.setFilter("state-labels", ["==", ["get", "iso_a2"], ""]);
    }
    if (hasAbbrevLabels) {
      map.setFilter("state-labels-abbrev", ["==", ["get", "iso_a2"], ""]);
    }
    if (hasBorders) {
      map.setFilter("state-borders", ["==", ["get", "iso_a2"], ""]);
    }
    return;
  }
  if (mode === "selected") {
    if (selectedIso2.length === 0) {
      if (hasLabels) {
        map.setFilter("state-labels", ["==", ["get", "iso_a2"], ""]);
      }
      if (hasAbbrevLabels) {
        map.setFilter("state-labels-abbrev", ["==", ["get", "iso_a2"], ""]);
      }
      if (hasBorders) {
        map.setFilter("state-borders", featuredFilter);
      }
      return;
    }
    const normalized = selectedIso2.map((code) => code.toUpperCase());
    if (hasLabels) {
      map.setFilter("state-labels", ["in", ["get", "iso_a2"], ["literal", normalized]]);
    }
    if (hasAbbrevLabels) {
      map.setFilter("state-labels-abbrev", [
        "all",
        abbrevFilter,
        ["in", ["get", "iso_a2"], ["literal", normalized]],
      ]);
    }
    if (hasBorders) {
      map.setFilter("state-borders", ["in", ["get", "iso_a2"], ["literal", normalized]]);
    }
    return;
  }
  if (hasLabels) {
    map.setFilter("state-labels", null);
  }
  if (hasAbbrevLabels) {
    map.setFilter("state-labels-abbrev", abbrevFilter);
  }
  if (hasBorders) {
    map.setFilter("state-borders", featuredFilter);
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
