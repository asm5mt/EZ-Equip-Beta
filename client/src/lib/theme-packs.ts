// Theme Packs — a named set of CSS custom property overrides (see index.css),
// applied via an additional class on <html> alongside whatever light/dark
// mode is already resolved (e.g. "dark theme-neon"). Independent of the
// Auto/Light/Dark mode toggle. The default "ezequip" pack applies no class
// at all, so it is exactly today's existing palette.

export type ThemePackId = "ezequip" | "neon" | "shop" | "forest" | "glass" | "winclassic";

interface ThemePackSwatch {
  background: string;
  primary: string;
}

export interface ThemePackDef {
  id: ThemePackId;
  name: string;
  description: string;
  className: string | null;
  swatch: { light: ThemePackSwatch; dark: ThemePackSwatch };
}

export const THEME_PACKS: ThemePackDef[] = [
  {
    id: "ezequip",
    name: "EZ-EQUIP Classic",
    description: "The original fleet ops palette.",
    className: null,
    swatch: {
      light: { background: "#f5f4f1", primary: "#1f9188" },
      dark: { background: "#12161c", primary: "#33c9b6" },
    },
  },
  {
    id: "neon",
    name: "80s Neon",
    description: "Hot pink and cyan neon on near-black, or CRT daylight.",
    className: "theme-neon",
    swatch: {
      light: { background: "#f7f0e2", primary: "#c1157f" },
      dark: { background: "#0e0816", primary: "#ff3ec8" },
    },
  },
  {
    id: "shop",
    name: "Shop Floor",
    description: "Safety yellow, steel gray, grease black.",
    className: "theme-shop",
    swatch: {
      light: { background: "#f2efe6", primary: "#e0a80d" },
      dark: { background: "#131415", primary: "#f2c40c" },
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Earthy greens and bark browns, or warm sage and cream.",
    className: "theme-forest",
    swatch: {
      light: { background: "#f6f2e0", primary: "#3a7a34" },
      dark: { background: "#0e1710", primary: "#5a9c4e" },
    },
  },
  {
    id: "glass",
    name: "Glass",
    description: "Glossy translucent blue and silver, early-2000s Aero/Aqua style.",
    className: "theme-glass",
    swatch: {
      light: { background: "#eef4f8", primary: "#1f6fa8" },
      dark: { background: "#0d1420", primary: "#2e9ee0" },
    },
  },
  {
    id: "winclassic",
    name: "Windows Classic",
    description: "Squared corners and beveled 3D buttons, straight out of the 90s.",
    className: "theme-winclassic",
    swatch: {
      light: { background: "#c0c0c0", primary: "#000080" },
      dark: { background: "#333333", primary: "#1111d4" },
    },
  },
];

export function findThemePack(id: string | null | undefined): ThemePackDef {
  return THEME_PACKS.find(p => p.id === id) ?? THEME_PACKS[0];
}
