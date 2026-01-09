"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";

import {
  defaultReaderSettings,
  fontFamilies,
  fontSizeRange,
  lineHeightOptions,
  paragraphSpacingRange,
  type HighlightStyle,
  type ReaderSettings,
  type ReaderSettingsUpdate,
  type ReaderTheme,
  type SelectionSnapping,
  textWidthOptions,
} from "@/lib/reader/settings";

const themeOptions: { value: ReaderTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
];

const snappingOptions: { value: SelectionSnapping; label: string }[] = [
  { value: "exact", label: "Exact" },
  { value: "sentence", label: "Sentence" },
  { value: "paragraph", label: "Paragraph" },
];

const highlightOptions: { value: HighlightStyle; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "solid", label: "Solid" },
  { value: "underline", label: "Underline" },
];

const themeColorKeys = {
  light: { ink: "theme_light_ink", paper: "theme_light_paper" },
  sepia: { ink: "theme_sepia_ink", paper: "theme_sepia_paper" },
  dark: { ink: "theme_dark_ink", paper: "theme_dark_paper" },
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type ReaderSettingsPanelProps = {
  settings: ReaderSettings;
  onChange: (update: ReaderSettingsUpdate) => void;
  status?: "idle" | "loading" | "saving" | "error";
};

export default function ReaderSettingsPanel({
  settings,
  onChange,
  status = "idle",
}: ReaderSettingsPanelProps) {
  const apply = (update: ReaderSettingsUpdate) => onChange(update);
  const [showThemeCustomizer, setShowThemeCustomizer] = useState(false);
  const themeKeys = useMemo(() => themeColorKeys[settings.theme], [settings.theme]);
  const inkKey = themeKeys.ink as keyof ReaderSettings;
  const paperKey = themeKeys.paper as keyof ReaderSettings;
  const inkValue = String(settings[inkKey] ?? "");
  const paperValue = String(settings[paperKey] ?? "");
  const canUseEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  const updateThemeColor = (key: keyof ReaderSettingsUpdate, value: string) => {
    apply({ [key]: value } as ReaderSettingsUpdate);
  };

  const handleThemeColorInput =
    (key: keyof ReaderSettingsUpdate) => (event: FormEvent<HTMLInputElement>) => {
      updateThemeColor(key, event.currentTarget.value);
    };

  const handleEyeDropper = async (key: keyof ReaderSettingsUpdate) => {
    const win = window as Window & {
      EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
    };
    if (!win.EyeDropper) {
      return;
    }
    try {
      const dropper = new win.EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) {
        updateThemeColor(key, result.sRGBHex);
      }
    } catch (error) {
      // ignore
    }
  };

  const handleFontSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    apply({ font_size: Number(event.target.value) || defaultReaderSettings.font_size });
  };

  const handleParagraphSpacingChange = (event: ChangeEvent<HTMLInputElement>) => {
    apply({
      paragraph_spacing: Number(event.target.value) || defaultReaderSettings.paragraph_spacing,
    });
  };

  return (
    <div className="settings-sheet">
      <div className="settings-sheet__section">
        <div className="settings-sheet__title">Reading</div>
        <div className="settings-row settings-row--stack">
          <div className="settings-theme-row">
            <span>Theme</span>
            <div className="settings-theme-actions">
              <div className="settings-pill-group">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      settings.theme === option.value ? "settings-pill is-active" : "settings-pill"
                    }
                    onClick={() => apply({ theme: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="settings-theme-customize"
                onClick={() => setShowThemeCustomizer((prev) => !prev)}
              >
                <span className="settings-theme-customize__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3a9 9 0 1 0 9 9c0-1.2-.27-2.35-.78-3.38-.2-.41-.7-.56-1.1-.35l-1.3.67a2.2 2.2 0 0 1-2.98-1.02 2.2 2.2 0 0 1 1.02-2.98l1.28-.65c.4-.2.55-.69.34-1.09A8.98 8.98 0 0 0 12 3z" />
                    <circle cx="8.2" cy="12" r="1.4" />
                    <circle cx="12" cy="16.4" r="1.4" />
                    <circle cx="16.2" cy="12.4" r="1.4" />
                  </svg>
                </span>
                {showThemeCustomizer ? "Hide" : "Customize"}
              </button>
            </div>
          </div>
          {showThemeCustomizer ? (
            <div className="settings-theme-custom">
              <div className="settings-theme-custom__item">
                <div className="settings-theme-custom__label">Ink</div>
                <div className="settings-theme-custom__controls">
                  <input
                    type="color"
                    value={inkValue}
                    onChange={handleThemeColorInput(inkKey)}
                    onInput={handleThemeColorInput(inkKey)}
                    aria-label="Ink color"
                  />
                  {canUseEyeDropper ? (
                    <button
                      type="button"
                      className="settings-theme-custom__picker"
                      onClick={() => handleEyeDropper(inkKey)}
                      aria-label="Pick ink color"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M14.5 4.5l5 5-7.1 7.1-5.8 1.2 1.2-5.8L14.5 4.5z" />
                        <path d="M13.1 6l5 5" />
                      </svg>
                    </button>
                  ) : null}
                  <span className="settings-theme-custom__value">{inkValue.toUpperCase()}</span>
                </div>
              </div>
              <div className="settings-theme-custom__item">
                <div className="settings-theme-custom__label">Paper</div>
                <div className="settings-theme-custom__controls">
                  <input
                    type="color"
                    value={paperValue}
                    onChange={handleThemeColorInput(paperKey)}
                    onInput={handleThemeColorInput(paperKey)}
                    aria-label="Paper color"
                  />
                  {canUseEyeDropper ? (
                    <button
                      type="button"
                      className="settings-theme-custom__picker"
                      onClick={() => handleEyeDropper(paperKey)}
                      aria-label="Pick paper color"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M14.5 4.5l5 5-7.1 7.1-5.8 1.2 1.2-5.8L14.5 4.5z" />
                        <path d="M13.1 6l5 5" />
                      </svg>
                    </button>
                  ) : null}
                  <span className="settings-theme-custom__value">{paperValue.toUpperCase()}</span>
                </div>
              </div>
              <div className="settings-theme-custom__hint">
                Adjust colors for the {settings.theme} theme.
              </div>
            </div>
          ) : null}
        </div>
        <div className="settings-row">
          <span>Font size</span>
          <div className="settings-stepper">
            <button
              type="button"
              onClick={() =>
                apply({
                  font_size: clamp(
                    settings.font_size - fontSizeRange.step,
                    fontSizeRange.min,
                    fontSizeRange.max
                  ),
                })
              }
            >
              A-
            </button>
            <input
              type="range"
              min={fontSizeRange.min}
              max={fontSizeRange.max}
              step={fontSizeRange.step}
              value={settings.font_size}
              onChange={handleFontSizeChange}
            />
            <button
              type="button"
              onClick={() =>
                apply({
                  font_size: clamp(
                    settings.font_size + fontSizeRange.step,
                    fontSizeRange.min,
                    fontSizeRange.max
                  ),
                })
              }
            >
              A+
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span>Line height</span>
          <div className="settings-pill-group">
            {lineHeightOptions.map((value) => (
              <button
                key={value}
                type="button"
                className={
                  settings.line_height === value ? "settings-pill is-active" : "settings-pill"
                }
                onClick={() => apply({ line_height: value })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span>Font</span>
          <select
            className="settings-select"
            value={settings.font_family}
            onChange={(event) =>
              apply({ font_family: event.target.value as ReaderSettings["font_family"] })
            }
          >
            {fontFamilies.map((family) => (
              <option key={family.value} value={family.value}>
                {family.label}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <span>Text width</span>
          <div className="settings-pill-group">
            {textWidthOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  settings.text_width === option.value ? "settings-pill is-active" : "settings-pill"
                }
                onClick={() => apply({ text_width: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span>Paragraph spacing</span>
          <div className="settings-slider">
            <input
              type="range"
              min={paragraphSpacingRange.min}
              max={paragraphSpacingRange.max}
              step={paragraphSpacingRange.step}
              value={settings.paragraph_spacing}
              onChange={handleParagraphSpacingChange}
            />
            <span className="settings-value">{settings.paragraph_spacing.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="settings-sheet__section">
        <div className="settings-sheet__title">Interaction</div>
        <div className="settings-row settings-row--stack">
          <span>Selection snapping</span>
          <div className="settings-pill-group">
            {snappingOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  settings.selection_snapping === option.value
                    ? "settings-pill is-active"
                    : "settings-pill"
                }
                onClick={() => apply({ selection_snapping: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="settings-toggle">
          <span>Swipe sequences</span>
          <input
            type="checkbox"
            checked={settings.gesture_swipe_sequences}
            onChange={(event) => apply({ gesture_swipe_sequences: event.target.checked })}
          />
        </label>
        <label className="settings-toggle">
          <span>Edge swipes</span>
          <input
            type="checkbox"
            checked={settings.gesture_edge_swipes}
            onChange={(event) => apply({ gesture_edge_swipes: event.target.checked })}
          />
        </label>
      </div>

      <div className="settings-sheet__section">
        <div className="settings-sheet__title">UI</div>
        <label className="settings-toggle">
          <span>Show side panel</span>
          <input
            type="checkbox"
            checked={settings.ui_show_side_panel}
            onChange={(event) => apply({ ui_show_side_panel: event.target.checked })}
          />
        </label>
        <div className="settings-row">
          <span>Action menu</span>
          <div className="settings-pill-group">
            {[
              { value: "above" as const, label: "Above" },
              { value: "below" as const, label: "Below" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  settings.ui_action_menu_placement === option.value
                    ? "settings-pill is-active"
                    : "settings-pill"
                }
                onClick={() => apply({ ui_action_menu_placement: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span>Highlight style</span>
          <div className="settings-pill-group">
            {highlightOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  settings.ui_highlight_style === option.value
                    ? "settings-pill is-active"
                    : "settings-pill"
                }
                onClick={() => apply({ ui_highlight_style: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-sheet__section">
        <div className="settings-sheet__title">Defaults</div>
        <button
          type="button"
          className="settings-reset"
          onClick={() => apply(defaultReaderSettings)}
        >
          Reset to defaults
        </button>
      </div>

      <div className="settings-sheet__section">
        <div className="settings-sheet__title">Data</div>
        <div className="settings-row settings-row--stack">
          <button type="button" className="settings-ghost" disabled>
            Export highlights (coming soon)
          </button>
          <button type="button" className="settings-ghost" disabled>
            Import library (coming soon)
          </button>
          <button type="button" className="settings-ghost" disabled>
            Clear local cache (coming soon)
          </button>
        </div>
      </div>

      {status !== "idle" ? (
        <div className={status === "error" ? "settings-status is-error" : "settings-status"}>
          {status === "loading" ? "Loading settings..." : null}
          {status === "saving" ? "Saving..." : null}
          {status === "error" ? "Couldn't save settings." : null}
        </div>
      ) : null}
    </div>
  );
}
