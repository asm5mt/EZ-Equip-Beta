export type PlateJurisdiction = {
  code: string;
  label: string;
  country: "US" | "CA";
  short: string;
};

const US_STATES: Array<[string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

const CA_REGIONS: Array<[string, string]> = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"],
  ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
  ["SK", "Saskatchewan"], ["YT", "Yukon"],
];

export const PLATE_JURISDICTIONS: PlateJurisdiction[] = [
  ...US_STATES.map(([short, label]) => ({ code: `US-${short}`, label, country: "US" as const, short })),
  ...CA_REGIONS.map(([short, label]) => ({ code: `CA-${short}`, label, country: "CA" as const, short })),
];

export function plateJurisdictionLabel(code?: string | null) {
  if (!code) return "";
  return PLATE_JURISDICTIONS.find(j => j.code === code)?.label ?? code;
}

export function plateJurisdictionShort(code?: string | null) {
  if (!code) return "";
  return PLATE_JURISDICTIONS.find(j => j.code === code)?.short ?? code.replace(/^[A-Z]{2}-/, "");
}

export function plateAccentClass(code?: string | null) {
  if (code === "US-NY") return "from-blue-200 via-white to-amber-100 text-blue-950 border-blue-300";
  if (code === "US-PA") return "from-blue-100 via-white to-yellow-100 text-blue-950 border-blue-300";
  if (code === "CA-ON") return "from-sky-100 via-white to-blue-100 text-blue-950 border-sky-300";
  if (code?.startsWith("CA-")) return "from-red-50 via-white to-red-100 text-red-950 border-red-200";
  return "from-slate-100 via-white to-slate-50 text-slate-900 border-slate-300";
}

export type PlateBadgeStyle = {
  background: string;
  band: string;
  accent?: string;
  text: string;
};

const PLATE_BADGE_STYLES: Record<string, PlateBadgeStyle> = {
  "US-NY": { background: "#ffffff", band: "#1d3f72", accent: "#f4b247", text: "#1d3f72" },
  "US-CA": { background: "#ffffff", band: "#b21f2d", accent: "#1e7c55", text: "#1b3f8b" },
  "US-TX": { background: "#ffffff", band: "#0f3d75", accent: "#c3262f", text: "#0f3d75" },
  "US-FL": { background: "#fff8df", band: "#f08a24", accent: "#3aa85f", text: "#0d5f99" },
  "US-PA": { background: "#ffffff", band: "#1f4e8c", accent: "#f1c84b", text: "#1f4e8c" },
  "US-OH": { background: "#ffffff", band: "#1f5f9d", accent: "#d13b35", text: "#1f4e8c" },
  "US-IL": { background: "#ffffff", band: "#1f4f93", accent: "#c33c3c", text: "#1f4f93" },
  "US-MI": { background: "#f3fbff", band: "#1d5d8f", accent: "#74a95c", text: "#1d5d8f" },
  "US-GA": { background: "#fff7e8", band: "#d86b32", accent: "#5ba35b", text: "#7b3d20" },
  "US-NJ": { background: "#f9d66b", band: "#1f1f1f", accent: "#ffffff", text: "#1f1f1f" },
};

export function plateBadgeStyle(code?: string | null): PlateBadgeStyle {
  return PLATE_BADGE_STYLES[code ?? ""] ?? {
    background: "#f3f4f6",
    band: "#9ca3af",
    accent: "#d1d5db",
    text: "#374151",
  };
}
