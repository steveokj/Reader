"use client";

import { useCallback, useRef, useState } from "react";

const EDGE_PX = 80;
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 900;

type Zone = "top" | "middle" | "bottom" | "left" | "right" | "none";

type SwipeStart = {
  x: number;
  y: number;
  time: number;
  zone: Zone;
};

export default function SwipeTestPage() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<SwipeStart | null>(null);
  const [status, setStatus] = useState("Ready. Swipe from top, middle, or bottom zones.");
  const [events, setEvents] = useState<string[]>([]);

  const classifyZone = useCallback((x: number, y: number) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return "none" as Zone;
    }
    const rect = surface.getBoundingClientRect();
    const yFromTop = y - rect.top;
    const yFromBottom = rect.bottom - y;
    const xFromLeft = x - rect.left;
    const xFromRight = rect.right - x;
    if (yFromTop <= EDGE_PX) {
      return "top" as Zone;
    }
    if (yFromBottom <= EDGE_PX) {
      return "bottom" as Zone;
    }
    if (xFromLeft <= EDGE_PX) {
      return "left" as Zone;
    }
    if (xFromRight <= EDGE_PX) {
      return "right" as Zone;
    }
    const middleStart = rect.top + rect.height * 0.4;
    const middleEnd = rect.top + rect.height * 0.6;
    if (y >= middleStart && y <= middleEnd) {
      return "middle" as Zone;
    }
    return "none" as Zone;
  }, []);

  const logEvent = useCallback((label: string) => {
    setEvents((prev) => [label, ...prev].slice(0, 6));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const zone = classifyZone(event.clientX, event.clientY);
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
        zone,
      };
      setStatus(
        zone === "none"
          ? "Pointer down outside zones."
          : `Pointer down in ${zone} zone.`
      );
    },
    [classifyZone]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) {
        return;
      }

      const elapsed = Date.now() - start.time;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      const vertical = Math.abs(dy) >= Math.abs(dx) * 1.2;
      const horizontal = Math.abs(dx) >= Math.abs(dy) * 1.2;

      if (elapsed > SWIPE_MAX_MS || distance < SWIPE_MIN_PX) {
        setStatus("Swipe ignored (too short or slow).");
        return;
      }

      if (start.zone === "left" || start.zone === "right") {
        if (!horizontal) {
          setStatus("Swipe ignored (not horizontal).");
          return;
        }
      } else if (!vertical) {
        setStatus("Swipe ignored (not vertical).");
        return;
      }

      const direction = vertical ? (dy > 0 ? "down" : "up") : dx > 0 ? "right" : "left";
      let label = "Swipe detected";
      if (start.zone === "top" && direction === "down") {
        label = "Top edge swipe down";
      } else if (start.zone === "bottom" && direction === "up") {
        label = "Bottom edge swipe up";
      } else if (start.zone === "middle") {
        label = `Middle zone swipe ${direction}`;
      } else if (start.zone === "left" && direction === "right") {
        label = "Left edge swipe right";
      } else if (start.zone === "right" && direction === "left") {
        label = "Right edge swipe left";
      } else if (start.zone !== "none") {
        label = `${start.zone} zone swipe ${direction} (no binding)`;
      } else {
        label = `Swipe ${direction} (outside zones)`;
      }

      setStatus(`${label} · ${Math.round(distance)}px in ${elapsed}ms`);
      logEvent(label);
    },
    [logEvent]
  );

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Gestures</div>
        <h1 className="reader-title">Edge Zone Swipe Test</h1>
      </header>
      <section className="gesture-test">
        <div className="gesture-test__status">{status}</div>
        <div
          className="gesture-test__surface swipe-test__surface"
          ref={surfaceRef}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            startRef.current = null;
            setStatus("Pointer cancelled.");
          }}
        >
          <div className="swipe-zone swipe-zone--top">Top zone</div>
          <div className="swipe-zone swipe-zone--middle">Middle zone</div>
          <div className="swipe-zone swipe-zone--bottom">Bottom zone</div>
          <div className="swipe-zone swipe-zone--left">Left edge</div>
          <div className="swipe-zone swipe-zone--right">Right edge</div>
          <div className="swipe-test__hint">
            Swipe vertically from top/bottom/middle, or horizontally from left/right.
          </div>
        </div>
        <div className="swipe-test__events">
          <div className="swipe-test__events-title">Recent</div>
          {events.length === 0 ? (
            <div className="swipe-test__events-empty">No swipes yet.</div>
          ) : (
            events.map((entry, index) => (
              <div key={`${entry}-${index}`} className="swipe-test__event">
                {entry}
              </div>
            ))
          )}
        </div>
      </section>
      <style jsx>{`
        .gesture-test {
          max-width: 920px;
          margin: 24px auto 0;
          padding: 0 20px 80px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .gesture-test__status {
          font-size: 14px;
          color: rgba(31, 28, 22, 0.7);
        }
        .swipe-test__surface {
          position: relative;
          height: 420px;
          border-radius: 18px;
          border: 2px dashed rgba(31, 28, 22, 0.2);
          background: #fffaf5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          text-align: center;
          padding: 20px;
          touch-action: none;
          user-select: none;
          overflow: hidden;
        }
        .swipe-test__hint {
          font-size: 15px;
          color: rgba(31, 28, 22, 0.75);
          max-width: 360px;
        }
        .swipe-zone {
          position: absolute;
          left: 16px;
          right: 16px;
          border-radius: 12px;
          border: 1px solid rgba(31, 28, 22, 0.1);
          background: rgba(31, 28, 22, 0.04);
          color: rgba(31, 28, 22, 0.55);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 10px 12px;
          text-align: left;
          pointer-events: none;
        }
        .swipe-zone--top {
          top: 12px;
          height: ${EDGE_PX}px;
        }
        .swipe-zone--bottom {
          bottom: 12px;
          height: ${EDGE_PX}px;
        }
        .swipe-zone--middle {
          top: 40%;
          height: 20%;
        }
        .swipe-zone--left,
        .swipe-zone--right {
          top: ${EDGE_PX + 28}px;
          bottom: ${EDGE_PX + 28}px;
          width: ${EDGE_PX}px;
          left: 12px;
          right: auto;
        }
        .swipe-zone--right {
          left: auto;
          right: 12px;
        }
        .swipe-test__events {
          margin-top: 8px;
          display: grid;
          gap: 6px;
        }
        .swipe-test__events-title {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(31, 28, 22, 0.5);
        }
        .swipe-test__events-empty {
          font-size: 14px;
          color: rgba(31, 28, 22, 0.6);
        }
        .swipe-test__event {
          font-size: 14px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(31, 28, 22, 0.04);
          color: rgba(31, 28, 22, 0.8);
        }
      `}</style>
    </main>
  );
}
