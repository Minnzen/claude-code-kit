import type React from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type ThemeName = "dark" | "light" | "light-high-contrast" | "dark-dimmed";
export type ThemeSetting = ThemeName | "auto";

export type Theme = {
  text: string;
  dimText: string;
  border: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  assistant: string;
  inactive: string;
  inverseText: string;
  permission: string;

  diffAdded: string;
  diffRemoved: string;
  diffAddedWord: string;
  diffRemovedWord: string;
  diffHeader: string;

  userMessage: string;
  assistantMessage: string;
  systemMessage: string;
  toolUseMessage: string;

  permissionAllow: string;
  permissionDeny: string;
  permissionAlways: string;

  focus: string;
  selection: string;
  placeholder: string;
  link: string;
  code: string;
  codeBackground: string;
  blockquote: string;

  info: string;

  spinnerColor: string;
  shimmer: string;
};

const themes: Record<ThemeName, Theme> = {
  dark: {
    text: "#E0E0E0",
    dimText: "#666666",
    border: "#444444",
    accent: "#5B9BD5",
    success: "#6BC76B",
    warning: "#E5C07B",
    error: "#E06C75",
    assistant: "#DA7756",
    inactive: "#666666",
    inverseText: "#1E1E1E",
    permission: "#5B9BD5",
    diffAdded: "#1a3a1a",
    diffRemoved: "#3a1a1a",
    diffAddedWord: "#2d5a2d",
    diffRemovedWord: "#5a2d2d",
    diffHeader: "#1e2d3d",
    userMessage: "#2B4A6F",
    assistantMessage: "#3D2614",
    systemMessage: "#2D2D2D",
    toolUseMessage: "#1E3A2D",
    permissionAllow: "#1B4332",
    permissionDeny: "#3B1014",
    permissionAlways: "#1B2F4D",
    focus: "#5B9BD5",
    selection: "#264F78",
    placeholder: "#555555",
    link: "#79B8FF",
    code: "#F8BFB0",
    codeBackground: "#2D2D2D",
    blockquote: "#444444",
    info: "#5B9BD5",
    spinnerColor: "#DA7756",
    shimmer: "#3A3A3A",
  },

  light: {
    text: "#1E1E1E",
    dimText: "#999999",
    border: "#CCCCCC",
    accent: "#0066CC",
    success: "#2E7D32",
    warning: "#F57C00",
    error: "#C62828",
    assistant: "#DA7756",
    inactive: "#999999",
    inverseText: "#FFFFFF",
    permission: "#0066CC",
    diffAdded: "#E6FFEC",
    diffRemoved: "#FFEBE9",
    diffAddedWord: "#CCFFD8",
    diffRemovedWord: "#FFD7D5",
    diffHeader: "#DDF4FF",
    userMessage: "#E8F0FE",
    assistantMessage: "#FDF2EE",
    systemMessage: "#F5F5F5",
    toolUseMessage: "#EAF5EE",
    permissionAllow: "#E6F4EA",
    permissionDeny: "#FCE8E6",
    permissionAlways: "#E8F0FE",
    focus: "#0066CC",
    selection: "#B3D4FF",
    placeholder: "#AAAAAA",
    link: "#0066CC",
    code: "#C7522A",
    codeBackground: "#F5F5F5",
    blockquote: "#EEEEEE",
    info: "#0066CC",
    spinnerColor: "#DA7756",
    shimmer: "#E8E8E8",
  },

  "light-high-contrast": {
    text: "#000000",
    dimText: "#595959",
    border: "#767676",
    accent: "#0000EE",
    success: "#006400",
    warning: "#7A4000",
    error: "#AE1818",
    assistant: "#B55530",
    inactive: "#767676",
    inverseText: "#FFFFFF",
    permission: "#0000EE",
    diffAdded: "#CCF0D0",
    diffRemoved: "#F5C6C6",
    diffAddedWord: "#99E0A0",
    diffRemovedWord: "#EBA0A0",
    diffHeader: "#B8DEFF",
    userMessage: "#C8DCFF",
    assistantMessage: "#FCDAC8",
    systemMessage: "#E0E0E0",
    toolUseMessage: "#C4EED0",
    permissionAllow: "#C4EED0",
    permissionDeny: "#F5C6C6",
    permissionAlways: "#C8DCFF",
    focus: "#0000EE",
    selection: "#80BFFF",
    placeholder: "#767676",
    link: "#0000EE",
    code: "#8B0000",
    codeBackground: "#E8E8E8",
    blockquote: "#D0D0D0",
    info: "#0000EE",
    spinnerColor: "#B55530",
    shimmer: "#D0D0D0",
  },

  "dark-dimmed": {
    text: "#ADBAC7",
    dimText: "#545D68",
    border: "#373E47",
    accent: "#539BF5",
    success: "#57AB5A",
    warning: "#C69026",
    error: "#E5534B",
    assistant: "#DA7756",
    inactive: "#545D68",
    inverseText: "#22272E",
    permission: "#539BF5",
    diffAdded: "#1B2F23",
    diffRemoved: "#2F1B1E",
    diffAddedWord: "#264D30",
    diffRemovedWord: "#4D2628",
    diffHeader: "#1C2B3A",
    userMessage: "#1C2B3A",
    assistantMessage: "#2F211A",
    systemMessage: "#2D333B",
    toolUseMessage: "#1B2B23",
    permissionAllow: "#1B2B23",
    permissionDeny: "#2F1B1E",
    permissionAlways: "#1C2B3A",
    focus: "#539BF5",
    selection: "#1C4066",
    placeholder: "#545D68",
    link: "#6CB6FF",
    code: "#F0A070",
    codeBackground: "#2D333B",
    blockquote: "#373E47",
    info: "#539BF5",
    spinnerColor: "#DA7756",
    shimmer: "#373E47",
  },
};

export function getTheme(name: ThemeName): Theme {
  return themes[name] ?? themes.dark;
}

type ThemeContextValue = {
  themeSetting: ThemeSetting;
  setThemeSetting: (setting: ThemeSetting) => void;
  setPreviewTheme: (setting: ThemeSetting) => void;
  savePreview: () => void;
  cancelPreview: () => void;
  currentTheme: ThemeName;
};

const DEFAULT_THEME: ThemeName = "dark";

const ThemeContext = createContext<ThemeContextValue>({
  themeSetting: DEFAULT_THEME,
  setThemeSetting: () => {},
  setPreviewTheme: () => {},
  savePreview: () => {},
  cancelPreview: () => {},
  currentTheme: DEFAULT_THEME,
});

type Props = {
  children: React.ReactNode;
  initialState?: ThemeSetting;
  onThemeSave?: (setting: ThemeSetting) => void;
};

export function ThemeProvider({ children, initialState = "dark", onThemeSave }: Props) {
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(initialState);
  const [previewTheme, setPreviewTheme] = useState<ThemeSetting | null>(null);

  const activeSetting = previewTheme ?? themeSetting;
  const currentTheme: ThemeName = activeSetting === "auto" ? "dark" : activeSetting;

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeSetting,
      setThemeSetting: (newSetting: ThemeSetting) => {
        setThemeSetting(newSetting);
        setPreviewTheme(null);
        onThemeSave?.(newSetting);
      },
      setPreviewTheme: (newSetting: ThemeSetting) => {
        setPreviewTheme(newSetting);
      },
      savePreview: () => {
        if (previewTheme !== null) {
          setThemeSetting(previewTheme);
          setPreviewTheme(null);
          onThemeSave?.(previewTheme);
        }
      },
      cancelPreview: () => {
        if (previewTheme !== null) {
          setPreviewTheme(null);
        }
      },
      currentTheme,
    }),
    [themeSetting, previewTheme, currentTheme, onThemeSave],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): [ThemeName, (setting: ThemeSetting) => void] {
  const { currentTheme, setThemeSetting } = useContext(ThemeContext);
  return [currentTheme, setThemeSetting];
}

export function useThemeSetting(): ThemeSetting {
  return useContext(ThemeContext).themeSetting;
}

export function usePreviewTheme() {
  const { setPreviewTheme, savePreview, cancelPreview } = useContext(ThemeContext);
  return { setPreviewTheme, savePreview, cancelPreview };
}
