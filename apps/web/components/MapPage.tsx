"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

type MapLibreModule = typeof import("maplibre-gl");

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

export default function MapPage() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

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
      try {
        map.setMaxBounds([
          [-180, -85],
          [180, 85],
        ]);
      } catch (error) {
        console.warn("Map bounds not ready yet", error);
      }
      map.on("load", () => {
        void addCountries(map);
        try {
          map.setMaxBounds([
            [-180, -85],
            [180, 85],
          ]);
        } catch (error) {
          console.warn("Map bounds failed on load", error);
        }
        map.resize();
      });
      map.on("error", (event) => {
        console.error(event?.error ?? event);
        setDataStatus("error");
      });
      mapRef.current = map;
      handleResize = () => {
        if (!cancelled) {
          map.resize();
        }
      };
      window.addEventListener("resize", handleResize);
    };

    void init();

    return () => {
      cancelled = true;
      if (handleResize) {
        window.removeEventListener("resize", handleResize);
      }
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
      setStatus(`Saved query coming soon: "${trimmed}"`);
      window.setTimeout(() => setStatus(null), 2000);
    },
    [query]
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
          <button type="submit" className="map-button" disabled={!query.trim()}>
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
        {status ? <div className="map-toast">{status}</div> : null}
        {dataStatus === "error" ? (
          <div className="map-toast map-toast--error">Failed to load map data.</div>
        ) : null}
      </div>
    </div>
  );
}
