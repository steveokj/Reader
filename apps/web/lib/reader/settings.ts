export const fontFamilies = [
  {
    value: "iowan",
    label: "Iowan Old Style",
    css: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif',
  },
  {
    value: "georgia",
    label: "Georgia",
    css: "Georgia, 'Times New Roman', serif",
  },
  {
    value: "baskerville",
    label: "Baskerville",
    css: "Baskerville, 'Baskerville Old Face', 'Times New Roman', serif",
  },
  {
    value: "atkinson",
    label: "Atkinson Hyperlegible",
    css: '"Atkinson Hyperlegible", "Segoe UI", sans-serif',
  },
  {
    value: "system",
    label: "System Sans",
    css: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
] as const;

export type FontFamily = (typeof fontFamilies)[number]["value"];

export const textWidthOptions = [
  { value: "narrow", label: "Narrow", maxWidth: "520px", sidePadding: "2px" },
  { value: "medium", label: "Medium", maxWidth: "640px", sidePadding: "16px" },
  { value: "wide", label: "Wide", maxWidth: "760px", sidePadding: "22px" },
] as const;

export type TextWidth = (typeof textWidthOptions)[number]["value"];

export type ReaderTheme = "light" | "dark" | "sepia";
export type SelectionSnapping = "exact" | "sentence" | "paragraph";
export type ActionMenuPlacement = "above" | "below";
export type HighlightStyle = "soft" | "solid" | "underline";
export type ThemeOverride = {
  ink?: string;
  paper?: string;
};
export type ThemeTokens = {
  ink: string;
  paper: string;
  panel: string;
  border: string;
  shadow: string;
  accent: string;
  highlight: string;
  highlightActive: string;
  inkMuted: string;
  inkSubtle: string;
};

export type ReaderSettings = {
  font_size: number;
  line_height: number;
  font_family: FontFamily;
  text_width: TextWidth;
  theme: ReaderTheme;
  theme_light_ink: string;
  theme_light_paper: string;
  theme_sepia_ink: string;
  theme_sepia_paper: string;
  theme_dark_ink: string;
  theme_dark_paper: string;
  paragraph_spacing: number;
  selection_snapping: SelectionSnapping;
  gesture_center_tap: boolean;
  gesture_triple_click: boolean;
  gesture_two_point_long_press: boolean;
  gesture_swipe_sequences: boolean;
  gesture_edge_swipes: boolean;
  ui_show_side_panel: boolean;
  ui_action_menu_placement: ActionMenuPlacement;
  ui_highlight_style: HighlightStyle;
};

export type ReaderSettingsUpdate = Partial<ReaderSettings>;

export const defaultReaderSettings: ReaderSettings = {
  font_size: 18,
  line_height: 1.7,
  font_family: "iowan",
  text_width: "medium",
  theme: "light",
  theme_light_ink: "#1f1c16",
  theme_light_paper: "#f6f1e9",
  theme_sepia_ink: "#3b2f24",
  theme_sepia_paper: "#f3e6d6",
  theme_dark_ink: "#e2e1de",
  theme_dark_paper: "#424547",
  paragraph_spacing: 1.0,
  selection_snapping: "exact",
  gesture_center_tap: true,
  gesture_triple_click: true,
  gesture_two_point_long_press: true,
  gesture_swipe_sequences: false,
  gesture_edge_swipes: false,
  ui_show_side_panel: true,
  ui_action_menu_placement: "above",
  ui_highlight_style: "soft",
};

export const lineHeightOptions = [1.4, 1.6, 1.7, 1.8, 2.0] as const;
export const paragraphSpacingRange = { min: 0.6, max: 1.8, step: 0.1 } as const;
export const fontSizeRange = { min: 14, max: 28, step: 1 } as const;

export function getFontFamilyCss(value: string) {
  return fontFamilies.find((family) => family.value === value)?.css ?? fontFamilies[0].css;
}

export function getTextWidthStyles(value: string) {
  return textWidthOptions.find((option) => option.value === value) ?? textWidthOptions[1];
}

export function getThemeOverride(settings: ReaderSettings): ThemeOverride {
  if (settings.theme === "dark") {
    return {
      ink: settings.theme_dark_ink,
      paper: settings.theme_dark_paper,
    };
  }
  if (settings.theme === "sepia") {
    return {
      ink: settings.theme_sepia_ink,
      paper: settings.theme_sepia_paper,
    };
  }
  return {
    ink: settings.theme_light_ink,
    paper: settings.theme_light_paper,
  };
}

export function getThemeTokens(theme: ReaderTheme, overrides?: ThemeOverride): ThemeTokens {
  const base =
    theme === "dark"
      ? {
          ink: "#e2e1de",
          paper: "#424547",
          panel: "#3a3d3f",
          border: "rgba(255, 255, 255, 0.14)",
          shadow: "rgba(0, 0, 0, 0.5)",
          accent: "#f29b7c",
          highlight: "rgba(242, 155, 124, 0.25)",
          highlightActive: "rgba(242, 155, 124, 0.45)",
          inkMuted: "rgba(191, 189, 184, 0.6)",
          inkSubtle: "rgba(191, 189, 184, 0.45)",
        }
      : theme === "sepia"
        ? {
            ink: "#3b2f24",
            paper: "#f3e6d6",
            panel: "#f8efe3",
            border: "rgba(59, 47, 36, 0.18)",
            shadow: "rgba(59, 47, 36, 0.18)",
            accent: "#d9663f",
            highlight: "rgba(200, 120, 72, 0.25)",
            highlightActive: "rgba(200, 120, 72, 0.45)",
            inkMuted: "rgba(59, 47, 36, 0.6)",
            inkSubtle: "rgba(59, 47, 36, 0.5)",
          }
        : {
            ink: "#1f1c16",
            paper: "#f6f1e9",
            panel: "#fbf8f2",
            border: "rgba(31, 28, 22, 0.12)",
            shadow: "rgba(31, 28, 22, 0.18)",
            accent: "#d9663f",
            highlight: "rgba(217, 102, 63, 0.2)",
            highlightActive: "rgba(217, 102, 63, 0.35)",
            inkMuted: "rgba(31, 28, 22, 0.6)",
            inkSubtle: "rgba(31, 28, 22, 0.5)",
          };

  return {
    ...base,
    ink: overrides?.ink ?? base.ink,
    paper: overrides?.paper ?? base.paper,
  };
}
