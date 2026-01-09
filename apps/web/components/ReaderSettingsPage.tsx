"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import ReaderDocument from "@/components/ReaderDocument";
import ReaderSettingsPanel from "@/components/ReaderSettingsPanel";
import { getClientApiBase } from "@/lib/apiBase";
import {
  defaultReaderSettings,
  getFontFamilyCss,
  getThemeOverride,
  getThemeTokens,
  getTextWidthStyles,
  type ReaderSettings,
  type ReaderSettingsUpdate,
} from "@/lib/reader/settings";

const PREVIEW_TEXT =
  "The rain arrived in the late afternoon, thin at first, then steady. From the window, the street looked like a soft sketch, its lines blurred by water and light.\n\nInside, the room felt smaller but calmer. A kettle hissed, a book lay open on a table, and the world outside slowed to a gentle rhythm.\n\nWhen the storm passed, the city seemed freshly rinsed. Leaves shone, sidewalks darkened, and the air held the quiet scent of wet stone.";

export default function ReaderSettingsPage() {
  const apiBase = getClientApiBase();
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(defaultReaderSettings);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const settingsSaveTimerRef = useRef<number | null>(null);
  const pendingSettingsRef = useRef<ReaderSettingsUpdate>({});
  const settingsTouchedRef = useRef(false);
  const themeOverride = useMemo(() => getThemeOverride(readerSettings), [readerSettings]);

  const themeTokens = useMemo(
    () => getThemeTokens(readerSettings.theme, themeOverride),
    [readerSettings.theme, themeOverride]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      setStatus("loading");
      try {
        const response = await fetch(`${apiBase}/settings`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load settings.");
        }
        const data = (await response.json()) as { settings?: ReaderSettings };
        if (cancelled) {
          return;
        }
        if (data.settings) {
          setReaderSettings((prev) =>
            settingsTouchedRef.current ? { ...data.settings, ...prev } : { ...prev, ...data.settings }
          );
        }
        setStatus("idle");
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    return () => {
      if (settingsSaveTimerRef.current !== null) {
        window.clearTimeout(settingsSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const bodyStyle = document.body.style;
    const previous = {
      backgroundColor: bodyStyle.backgroundColor,
      backgroundImage: bodyStyle.backgroundImage,
      color: bodyStyle.color,
    };
    bodyStyle.backgroundImage = "none";
    bodyStyle.backgroundColor = themeTokens.paper;
    bodyStyle.color = themeTokens.ink;
    return () => {
      bodyStyle.backgroundColor = previous.backgroundColor;
      bodyStyle.backgroundImage = previous.backgroundImage;
      bodyStyle.color = previous.color;
    };
  }, [themeTokens]);

  const queueSettingsUpdate = useCallback(
    (update: ReaderSettingsUpdate) => {
      settingsTouchedRef.current = true;
      setReaderSettings((prev) => ({ ...prev, ...update }));
      pendingSettingsRef.current = { ...pendingSettingsRef.current, ...update };

      if (settingsSaveTimerRef.current !== null) {
        window.clearTimeout(settingsSaveTimerRef.current);
      }

      settingsSaveTimerRef.current = window.setTimeout(async () => {
        const payload = pendingSettingsRef.current;
        pendingSettingsRef.current = {};
        if (!Object.keys(payload).length) {
          return;
        }
        setStatus("saving");
        try {
          const response = await fetch(`${apiBase}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            throw new Error("Failed to save settings.");
          }
          const data = (await response.json()) as { settings?: ReaderSettings };
          if (data.settings) {
            setReaderSettings((prev) => ({ ...prev, ...data.settings }));
          }
          setStatus("idle");
        } catch (error) {
          setStatus("error");
        }
      }, 320);
    },
    [apiBase]
  );

  const widthStyles = useMemo(
    () => getTextWidthStyles(readerSettings.text_width),
    [readerSettings.text_width]
  );

  const previewStyle = useMemo<CSSProperties>(() => {
    return {
      "--reader-font-size": `${readerSettings.font_size}px`,
      "--reader-line-height": String(readerSettings.line_height),
      "--reader-paragraph-spacing": `${readerSettings.paragraph_spacing}rem`,
      "--reader-font-family": getFontFamilyCss(readerSettings.font_family),
      "--reader-content-max-width": widthStyles.maxWidth,
      "--reader-side-padding": widthStyles.sidePadding,
      "--reader-ink": themeTokens.ink,
      "--reader-paper": themeTokens.paper,
      "--reader-panel": themeTokens.panel,
      "--reader-border": themeTokens.border,
      "--reader-shadow": themeTokens.shadow,
      "--reader-accent": themeTokens.accent,
      "--reader-highlight": themeTokens.highlight,
      "--reader-highlight-active": themeTokens.highlightActive,
      "--reader-ink-muted": themeTokens.inkMuted,
      "--reader-ink-subtle": themeTokens.inkSubtle,
      backgroundColor: themeTokens.paper,
      color: themeTokens.ink,
    } as CSSProperties;
  }, [readerSettings, themeTokens, widthStyles]);

  const readerSectionStyle = useMemo<CSSProperties>(
    () => ({
      maxWidth: widthStyles.maxWidth,
      width: "100%",
      marginLeft: "auto",
      marginRight: "auto",
    }),
    [widthStyles.maxWidth]
  );

  const readerArticleStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${readerSettings.font_size}px`,
      lineHeight: readerSettings.line_height,
      fontFamily: getFontFamilyCss(readerSettings.font_family),
    }),
    [readerSettings.font_family, readerSettings.font_size, readerSettings.line_height]
  );

  const readerParagraphStyle = useMemo<CSSProperties>(
    () => ({
      marginBottom: `${readerSettings.paragraph_spacing}rem`,
    }),
    [readerSettings.paragraph_spacing]
  );

  return (
    <main className="reader-main settings-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Settings</div>
        <h1 className="reader-title">Reader settings</h1>
      </header>
      <div className="settings-page__layout">
        <section className="settings-page__panel">
          <ReaderSettingsPanel
            settings={readerSettings}
            onChange={queueSettingsUpdate}
            status={status}
          />
        </section>
        <section
          className={`settings-preview reader-layout reader-theme--${readerSettings.theme}`}
          data-highlight-style={readerSettings.ui_highlight_style}
          style={previewStyle}
        >
          <div className="settings-preview__content">
            <div className="reader-kicker">Preview</div>
            <div className="reader-title">A Rainy Afternoon</div>
            <section className="reader-section" style={readerSectionStyle}>
              <ReaderDocument
                contentText={PREVIEW_TEXT}
                articleStyle={readerArticleStyle}
                paragraphStyle={readerParagraphStyle}
              />
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
