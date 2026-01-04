"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Test page for debugging text selection on mobile.
 * Automatically selects text after 5 seconds and shows the action menu.
 */
export default function BooksTwPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(5);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  // Custom highlight overlay to show selection visually (since mobile doesn't show native selection)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const targetWordRef = useRef<HTMLSpanElement>(null);

  // Get API base URL
  const apiBase =
    typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL
      : "http://localhost:8002";

  // Send log to server and update local logs
  const addLog = useCallback(
    async (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = `[${timestamp}] ${message}`;
      setLogs((prev) => [...prev, logEntry]);

      try {
        await fetch(`${apiBase}/debug/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "books-tw", message }),
        });
      } catch (e) {
        console.error("Failed to send log:", e);
      }
    },
    [apiBase]
  );

  // Countdown effect
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  // Auto-select text when countdown reaches 0
  useEffect(() => {
    if (countdown !== 0) return;

    const selectText = async () => {
      await addLog("Countdown done! Starting selection...");

      const targetWord = targetWordRef.current;
      if (!targetWord) {
        await addLog("ERROR: Target word element not found");
        return;
      }

      await addLog(`Target word element found: "${targetWord.textContent}"`);

      // Create a range for the target word
      const range = document.createRange();
      try {
        range.selectNodeContents(targetWord);
        await addLog(`Range created: "${range.toString()}"`);
      } catch (e) {
        await addLog(`ERROR creating range: ${e}`);
        return;
      }

      // Get the selection object
      const selection = window.getSelection();
      if (!selection) {
        await addLog("ERROR: window.getSelection() returned null");
        return;
      }

      await addLog(`Selection object exists, rangeCount before: ${selection.rangeCount}`);

      // Clear existing selection
      selection.removeAllRanges();
      await addLog("Cleared existing ranges");

      // Add our range
      try {
        selection.addRange(range);
        await addLog(`Added range, rangeCount after: ${selection.rangeCount}`);
      } catch (e) {
        await addLog(`ERROR adding range: ${e}`);
        return;
      }

      // Check what was selected
      const selectedStr = selection.toString();
      await addLog(`Selection.toString(): "${selectedStr}"`);
      setSelectedText(selectedStr);

      if (selection.rangeCount > 0) {
        const selectedRange = selection.getRangeAt(0);
        const rect = selectedRange.getBoundingClientRect();
        await addLog(`Range rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);

        // Show custom highlight overlay (mobile doesn't show native selection)
        setHighlightRect(rect);
        await addLog("Custom highlight overlay shown (blue rectangle)");

        // Position menu above the selection
        setMenuPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
        setShowMenu(true);
        await addLog("Action menu shown!");
      } else {
        await addLog("ERROR: No range after adding - selection may have been cleared");
      }

      // Check again after a short delay
      setTimeout(async () => {
        const sel = window.getSelection();
        if (sel) {
          await addLog(`After 100ms - rangeCount: ${sel.rangeCount}, text: "${sel.toString()}"`);
        } else {
          await addLog("After 100ms - selection is null!");
        }
      }, 100);
    };

    selectText();
  }, [countdown, addLog]);

  // Handle menu action
  const handleMenuAction = async (action: string) => {
    await addLog(`Menu action clicked: ${action}`);
    setShowMenu(false);
  };

  // Manual retry button
  const handleRetry = () => {
    setCountdown(5);
    setSelectedText(null);
    setShowMenu(false);
    setHighlightRect(null);
    setLogs([]);
    addLog("Retry started");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "10px" }}>Text Selection Test</h1>
      <p style={{ color: "#666", marginBottom: "20px" }}>
        This page will automatically select the word &quot;TARGETWORD&quot; after 5 seconds.
      </p>

      {/* Countdown display */}
      <div
        style={{
          fontSize: "48px",
          fontWeight: "bold",
          textAlign: "center",
          marginBottom: "20px",
          color: countdown > 0 ? "#007bff" : "#28a745",
        }}
      >
        {countdown > 0 ? countdown : "Done!"}
      </div>

      {/* Sample text with target word */}
      <div
        style={{
          background: "#f5f5f5",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "20px",
          fontSize: "18px",
          lineHeight: "1.8",
          position: "relative",
        }}
      >
        <p ref={textRef}>
          This is some sample text. The word{" "}
          <span
            ref={targetWordRef}
            style={{ background: "#ffeb3b", padding: "2px 4px", borderRadius: "3px" }}
          >
            TARGETWORD
          </span>{" "}
          should be automatically selected after the countdown. If you see it highlighted with a
          blue selection, the selection API is working on your device.
        </p>
      </div>

      {/* Custom Selection Highlight Overlay (since mobile doesn't show native selection) */}
      {highlightRect && (
        <div
          style={{
            position: "fixed",
            left: highlightRect.left,
            top: highlightRect.top,
            width: highlightRect.width,
            height: highlightRect.height,
            background: "rgba(0, 123, 255, 0.3)",
            border: "2px solid #007bff",
            borderRadius: "3px",
            pointerEvents: "none",
            zIndex: 9998,
          }}
        />
      )}

      {/* Action Menu (positioned above selection) */}
      {showMenu && (
        <div
          style={{
            position: "fixed",
            left: menuPosition.x,
            top: menuPosition.y,
            transform: "translate(-50%, -100%)",
            background: "#333",
            color: "white",
            borderRadius: "8px",
            padding: "8px",
            display: "flex",
            gap: "8px",
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={() => handleMenuAction("highlight")}
            style={{
              background: "#ffc107",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Highlight
          </button>
          <button
            onClick={() => handleMenuAction("note")}
            style={{
              background: "#17a2b8",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Note
          </button>
          <button
            onClick={() => handleMenuAction("copy")}
            style={{
              background: "#6c757d",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Copy
          </button>
        </div>
      )}

      {/* Selected text display */}
      {selectedText && (
        <div
          style={{
            background: "#d4edda",
            border: "1px solid #c3e6cb",
            padding: "10px",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          <strong>Selected text:</strong> &quot;{selectedText}&quot;
        </div>
      )}

      {/* Retry button */}
      <button
        onClick={handleRetry}
        style={{
          background: "#007bff",
          color: "white",
          border: "none",
          padding: "12px 24px",
          borderRadius: "6px",
          fontSize: "16px",
          cursor: "pointer",
          marginBottom: "20px",
        }}
      >
        Retry Test
      </button>

      {/* Debug logs */}
      <div
        style={{
          background: "#1e1e1e",
          color: "#00ff00",
          padding: "15px",
          borderRadius: "8px",
          fontFamily: "monospace",
          fontSize: "12px",
          maxHeight: "300px",
          overflowY: "auto",
        }}
      >
        <div style={{ marginBottom: "10px", color: "#888" }}>Debug Logs:</div>
        {logs.length === 0 ? (
          <div style={{ color: "#666" }}>Waiting for countdown...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: "4px" }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

