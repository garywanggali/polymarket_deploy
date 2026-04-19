import type { MarketIndex, NormalizedMarket } from "./types";

export type CountryAgg = {
  iso2: string;
  name: string;
  totalVolume24hr: number;
  categories: Record<"sports" | "politics" | "crypto" | "macro" | "tech" | "other", number>;
};

const MAPPING_URL = "https://raw.githubusercontent.com/flekschas/simple-world-map/a36dece5/mapping.csv";

const FALLBACK_MAPPING_CSV = `"Country Code","Country Name"
"_somaliland","Somaliland"
"ae","United Arab Emirates"
"af","Afghanistan"
"al","Albania"
"am","Armenia"
"ao","Angola"
"ar","Argentina"
"at","Austria"
"au","Australia"
"az","Azerbaijan"
"ba","Bosnia and Herzegowina"
"bd","Bangladesh"
"be","Belgium"
"bf","Burkina Faso"
"bg","Bulgaria"
"bi","Burundi"
"bj","Benin"
"bn","Brunei"
"bo","Bolivia"
"br","Brazil"
"bs","Bahamas"
"bt","Bhutan"
"bw","Botswana"
"by","Belarus"
"bz","Belize"
"ca","Canada"
"cd","Democratic Republic of the Congo"
"cf","Central African Republic"
"cg","Congo"
"ch","Switzerland"
"ci","Cote d'Ivoire"
"cl","Chile"
"cm","Cameroon"
"cn","China"
"co","Colombia"
"cr","Costa Rica"
"cu","Cuba"
"cy","Cyprus"
"cz","Czech"
"de","Germany"
"dj","Djibouti"
"dk","Denmark"
"do","Dominican Republic"
"dz","Algeria"
"ec","Ecuador"
"ee","Estonia"
"eg","Egypt"
"eh","West Sahara"
"er","Eritrea"
"es","Spain"
"et","Ethiopia"
"fi","Finland"
"fj","Fiji"
"fk","Falkland Islands"
"fr","France"
"ga","Gabon"
"gb","United Kingdom"
"ge","Georgia"
"gh","Ghana"
"gl","Greenland"
"gm","Gambia"
"gn","Guinea"
"gq","Equatorial Guinea"
"gr","Greece"
"gt","Guatemala"
"gw","Guinea-Bissau"
"gy","Guyana"
"hn","Honduras"
"hr","Croatia"
"ht","Haiti"
"hu","Hungary"
"id","Indonesia"
"ie","Ireland"
"il","Israel"
"in","India"
"iq","Iraq"
"ir","Iran"
"is","Iceland"
"it","Italy"
"jm","Jamaica"
"jo","Jordan"
"jp","Japan"
"ke","Kenya"
"kg","Kyrgyzstan"
"kh","Cambodia"
"kp","North Korea"
"kr","South Korea"
"kw","Kuwait"
"kz","Kazakhstan"
"la","Laos"
"lb","Lebanon"
"lk","Sri Lanka"
"lr","Liberia"
"ls","Lesotho"
"lt","Lithuania"
"lu","Luxembourg"
"lv","Latvia"
"ly","Libya"
"ma","Morocco"
"md","Moldova"
"me","Montenegro"
"mg","Madagascar"
"mk","Macedonia"
"ml","Mali"
"mm","Myanmar"
"mn","Mongolia"
"mr","Mauritania"
"mw","Malawi"
"mx","Mexico"
"my","Malaysia"
"mz","Mozambique"
"na","Namibia"
"nc","New Caledonia"
"ne","Niger"
"ng","Nigeria"
"ni","Nicaragua"
"nl","Netherlands"
"no","Norway"
"np","Nepal"
"nz","New Zealand"
"om","Oman"
"pa","Panama"
"pe","Peru"
"pg","Papua New Guinea"
"ph","Philippines"
"pk","Pakistan"
"pl","Poland"
"pr","Puerto Rico"
"ps","Palestine"
"pt","Portugal"
"py","Paraguay"
"qa","Qatar"
"ro","Romania"
"rs","Serbia"
"ru","Russia"
"rw","Rwanda"
"sa","Saudi Arabia"
"sb","Solomon Islands"
"sd","Sudan"
"se","Sweden"
"sg","Singapore"
"si","Slovenia"
"sk","Slovakia"
"sl","Sierra Leone"
"sn","Senegal"
"so","Somalia"
"sr","Suriname"
"ss","South Sudan"
"sv","El Salvador"
"sy","Syria"
"sz","Swaziland"
"td","Chad"
"tf","Fr. S. Antarctic Lands"
"tg","Togo"
"th","Thailand"
"tj","Tajikistan"
"tl","Timor-Leste"
"tm","Turkmenistan"
"tn","Tunisia"
"tr","Turkey"
"tt","Trinidad and Tobago"
"tw","Taiwan"
"tz","Tanzania"
"ua","Ukraine"
"ug","Uganda"
"us","United States"
"uy","Uruguay"
"uz","Uzbekistan"
"ve","Venezuela"
"vn","Vietnam"
"vu","Vanuatu"
"ye","Yemen"
"za","South Africa"
"zm","Zambia"
"zw","Zimbabwe"
`;

let countryMappingCache: { loadedAtMs: number; countries: { iso2: string; name: string }[] } | null = null;

function normalizeTextForMatch(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMappingCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out: { iso2: string; name: string }[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes("Country Code") && trimmed.includes("Country Name")) continue;

    const m = trimmed.match(/^"([^"]+)","([^"]+)"$/);
    const rawIso2 = (m?.[1] ?? "").trim();
    const rawName = (m?.[2] ?? "").trim();

    const fallbackParts = trimmed.split(",");
    const iso2 = rawIso2 || (fallbackParts[0] ?? "").trim().replaceAll('"', "");
    const name = rawName || (fallbackParts.slice(1).join(",") ?? "").trim().replaceAll('"', "");
    if (!iso2 || !name) continue;

    const code = iso2.trim().toLowerCase();
    const cleanedName = name.trim();
    if (code.length !== 2) continue;
    out.push({ iso2: code, name: cleanedName });
  }
  return out;
}

export async function getCountryMapping() {
  const now = Date.now();
  if (countryMappingCache && now - countryMappingCache.loadedAtMs < 1000 * 60 * 60) {
    return countryMappingCache.countries;
  }

  const fallbackMapping = () => {
    const countries = parseMappingCsv(FALLBACK_MAPPING_CSV);
    countryMappingCache = { loadedAtMs: now, countries };
    return countries;
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(MAPPING_URL, { headers: { accept: "text/csv" }, signal: controller.signal });
    if (!res.ok) return fallbackMapping();
    const text = await res.text();
    const countries = parseMappingCsv(text);
    if (countries.length < 50) return fallbackMapping();
    countryMappingCache = { loadedAtMs: now, countries };
    return countries;
  } catch {
    return fallbackMapping();
  } finally {
    clearTimeout(timeout);
  }
}

function getPrimaryCategory(market: NormalizedMarket): keyof CountryAgg["categories"] {
  const tags = market.tags;
  const has = (prefix: string) => tags.some((t) => t === prefix || t.startsWith(`${prefix}/`));

  if (has("体育")) return "sports";
  if (has("政治")) return "politics";
  if (has("加密")) return "crypto";
  if (has("宏观")) return "macro";
  if (has("科技")) return "tech";
  return "other";
}

function buildCountryMatchers(countries: { iso2: string; name: string }[]) {
  const aliases: Record<string, string[]> = {
    us: ["united states", "u s", "u s a", "usa", "u s.", "u.s.", "america", "american"],
    gb: ["united kingdom", "u k", "u k.", "uk", "great britain", "britain", "british"],
    br: ["brazilian"],
    fr: ["french"],
    de: ["german"],
    es: ["spanish"],
    it: ["italian"],
    cn: ["chinese"],
    jp: ["japanese"],
    ca: ["canadian"],
    mx: ["mexican"],
    in: ["indian"],
    ua: ["ukrainian"],
    ru: ["russia", "russian federation"],
    kr: ["south korea", "republic of korea", "korea"],
    kp: ["north korea", "democratic people's republic of korea"],
    ir: ["iran", "iran islamic republic"],
    sy: ["syria", "syrian arab republic"],
    ve: ["venezuela", "venezuela bolivarian republic"],
    tz: ["tanzania", "united republic of tanzania"],
    ci: ["cote d ivoire", "cote d'ivoire", "ivory coast"],
    vn: ["vietnam", "viet nam"],
    tw: ["taiwan", "taiwan province of china"],
    ps: ["palestine", "state of palestine"],
    cd: ["democratic republic of the congo", "drc", "congo kinshasa"],
    cg: ["republic of the congo", "congo brazzaville"],
    cz: ["czech republic", "czechia"],
    ae: ["united arab emirates", "uae"],
  };

  const entries = countries.map((c) => {
    const normalizedName = normalizeTextForMatch(c.name);
    const extra = (aliases[c.iso2] ?? []).map(normalizeTextForMatch);
    const needles = Array.from(new Set([normalizedName, ...extra])).filter((x) => x.length >= 3);
    const pattern = new RegExp(`\\b(${needles.map(escapeRegExp).join("|")})\\b`, "i");
    return { iso2: c.iso2, name: c.name, needles, pattern, weight: Math.max(...needles.map((n) => n.length)) };
  });

  entries.sort((a, b) => b.weight - a.weight);
  return entries;
}

function detectCountryIso2(market: NormalizedMarket, matchers: ReturnType<typeof buildCountryMatchers>) {
  for (const tag of market.tags) {
    const normalizedTag = normalizeTextForMatch(tag);
    if (!normalizedTag) continue;
    for (const m of matchers) {
      if (m.needles.includes(normalizedTag)) return m.iso2;
    }
  }

  const text = normalizeTextForMatch(`${market.title}\n${market.description ?? ""}`);
  for (const m of matchers) {
    if (m.pattern.test(text)) return m.iso2;
  }
  return null;
}

export async function aggregateMarketsByCountry(index: MarketIndex): Promise<CountryAgg[]> {
  const countries = await getCountryMapping();
  const matchers = buildCountryMatchers(countries);
  const nameByIso2 = new Map(countries.map((c) => [c.iso2, c.name]));

  const byIso2 = new Map<string, CountryAgg>();

  const ensure = (iso2: string) => {
    const existing = byIso2.get(iso2);
    if (existing) return existing;
    const name = nameByIso2.get(iso2) ?? iso2.toUpperCase();
    const created: CountryAgg = {
      iso2,
      name,
      totalVolume24hr: 0,
      categories: { sports: 0, politics: 0, crypto: 0, macro: 0, tech: 0, other: 0 },
    };
    byIso2.set(iso2, created);
    return created;
  };

  for (const market of index.markets) {
    const iso2 = detectCountryIso2(market, matchers);
    if (!iso2) continue;

    const v24 = market.volume24hr ?? 0;
    const vAll = market.volume ?? 0;
    const v = v24 > 0 ? v24 : vAll;
    if (v <= 0) continue;

    const agg = ensure(iso2);
    agg.totalVolume24hr += v;
    const cat = getPrimaryCategory(market);
    agg.categories[cat] += v;
  }

  return Array.from(byIso2.values()).sort((a, b) => b.totalVolume24hr - a.totalVolume24hr);
}
