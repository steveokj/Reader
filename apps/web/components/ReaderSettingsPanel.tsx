"use client";

import type { ChangeEvent } from "react";

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
        <div className="settings-row">
          <span>Theme</span>
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
          <span>Center tap menu</span>
          <input
            type="checkbox"
            checked={settings.gesture_center_tap}
            onChange={(event) => apply({ gesture_center_tap: event.target.checked })}
          />
        </label>
        <label className="settings-toggle">
          <span>Triple click</span>
          <input
            type="checkbox"
            checked={settings.gesture_triple_click}
            onChange={(event) => apply({ gesture_triple_click: event.target.checked })}
          />
        </label>
        <label className="settings-toggle">
          <span>Two-point long-press</span>
          <input
            type="checkbox"
            checked={settings.gesture_two_point_long_press}
            onChange={(event) => apply({ gesture_two_point_long_press: event.target.checked })}
          />
        </label>
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
