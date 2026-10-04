export const palette = {
  light: {
    canvas: "#E9B48F", panel: "#FFFCF8", sidebar: "#F6ECE0", card: "#FBF4EC",
    ink: "#33281F", inkSoft: "#6E6156", inkFaint: "#9C8E80", hair: "#EADFD1",
    accent: "#E1552F", accentPressed: "#C94420", amber: "#E39A2B",
    ok: "#3E7A5E", okBg: "#E1EEE6", warn: "#96601A", warnBg: "#F8E7C9",
    danger: "#B23A1F", dangerBg: "#F8DED4",
  },
  dark: {
    canvas: "#241C16", panel: "#2C231C", sidebar: "#271F18", card: "#342A21",
    ink: "#F3E9DF", inkSoft: "#C3B4A5", inkFaint: "#8E7F70", hair: "#3D3128",
    accent: "#F0714E", accentPressed: "#F5866B", amber: "#EBA744",
    ok: "#8FCDAF", okBg: "#253A31", warn: "#E7B25E", warnBg: "#3E301A",
    danger: "#EE8064", dangerBg: "#43261D",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };

export const radii = { panel: 30, card: 18, button: 12 } as const;

export const fonts = {
  display: "Bitter_700Bold",
  displaySemi: "Bitter_600SemiBold",
  displayRegular: "Bitter_400Regular",
} as const;

export type ThemePreference = "light" | "dark" | "system";

/** Resolves the effective scheme from the user's preference and the OS appearance. */
export function resolveScheme(
  preference: ThemePreference,
  /** The OS appearance; React Native may also report e.g. "unspecified". */
  system: string | null | undefined
): ColorScheme {
  if (preference === "system") return system === "dark" ? "dark" : "light";
  return preference;
}
