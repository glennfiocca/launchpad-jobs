/**
 * Foreign country names (and common abbreviations) → ISO-3166-1 alpha-2 code.
 *
 * Used to detect non-US locations in free-text strings. Only countries that
 * frequently appear in ATS location data are included; the classifier falls
 * through to UNKNOWN for obscure locations rather than carrying a 250-entry
 * list.
 */

export const FOREIGN_COUNTRY_LOOKUP: Readonly<Record<string, string>> = {
  // Major English-speaking
  "United Kingdom": "GB",
  UK: "GB",
  "U.K.": "GB",
  "Great Britain": "GB",
  England: "GB",
  Scotland: "GB",
  Wales: "GB",
  "Northern Ireland": "GB",
  Ireland: "IE",
  Canada: "CA",
  Australia: "AU",
  "New Zealand": "NZ",

  // Western Europe
  Germany: "DE",
  Deutschland: "DE",
  France: "FR",
  Spain: "ES",
  España: "ES",
  Portugal: "PT",
  Italy: "IT",
  Netherlands: "NL",
  Holland: "NL",
  Belgium: "BE",
  Switzerland: "CH",
  Austria: "AT",
  Luxembourg: "LU",

  // Nordics
  Sweden: "SE",
  Norway: "NO",
  Denmark: "DK",
  Finland: "FI",
  Iceland: "IS",

  // Eastern Europe
  Poland: "PL",
  "Czech Republic": "CZ",
  Czechia: "CZ",
  Hungary: "HU",
  Romania: "RO",
  Bulgaria: "BG",
  Ukraine: "UA",
  Estonia: "EE",
  Latvia: "LV",
  Lithuania: "LT",
  Greece: "GR",

  // APAC
  India: "IN",
  Singapore: "SG",
  Japan: "JP",
  "South Korea": "KR",
  Korea: "KR",
  China: "CN",
  "Hong Kong": "HK",
  Taiwan: "TW",
  Thailand: "TH",
  Vietnam: "VN",
  Indonesia: "ID",
  Philippines: "PH",
  Malaysia: "MY",
  Pakistan: "PK",
  Bangladesh: "BD",

  // LATAM
  Mexico: "MX",
  Brazil: "BR",
  Brasil: "BR",
  Argentina: "AR",
  Chile: "CL",
  Colombia: "CO",
  Peru: "PE",
  Uruguay: "UY",
  "Costa Rica": "CR",

  // Middle East / Africa
  Israel: "IL",
  "United Arab Emirates": "AE",
  UAE: "AE",
  "Saudi Arabia": "SA",
  Turkey: "TR",
  Türkiye: "TR",
  "South Africa": "ZA",
  Egypt: "EG",
  Nigeria: "NG",
  Kenya: "KE",

  // Misc
  Russia: "RU",
};

/**
 * Common foreign cities that appear in ATS data. Maps to an ISO-2 code.
 * Curated for cities that are unambiguous and frequent — adding more is fine,
 * but the classifier's safety is preserved by falling through to UNKNOWN
 * for unrecognized strings.
 */
export const FOREIGN_CITY_LOOKUP: Readonly<Record<string, string>> = {
  // UK + Ireland
  London: "GB",
  Manchester: "GB",
  Edinburgh: "GB",
  Glasgow: "GB",
  Birmingham: "GB",
  Bristol: "GB",
  Leeds: "GB",
  Liverpool: "GB",
  Cambridge: "GB",
  Oxford: "GB",
  Dublin: "IE",
  Cork: "IE",

  // Continental Europe
  Berlin: "DE",
  Munich: "DE",
  München: "DE",
  Hamburg: "DE",
  Frankfurt: "DE",
  Cologne: "DE",
  Köln: "DE",
  Stuttgart: "DE",
  Düsseldorf: "DE",
  Dusseldorf: "DE",
  Paris: "FR",
  Lyon: "FR",
  Marseille: "FR",
  Toulouse: "FR",
  Madrid: "ES",
  Barcelona: "ES",
  Valencia: "ES",
  Seville: "ES",
  Lisbon: "PT",
  Porto: "PT",
  Rome: "IT",
  Milan: "IT",
  Turin: "IT",
  Florence: "IT",
  Naples: "IT",
  Amsterdam: "NL",
  Rotterdam: "NL",
  "The Hague": "NL",
  Eindhoven: "NL",
  Brussels: "BE",
  Antwerp: "BE",
  Zurich: "CH",
  Zürich: "CH",
  Geneva: "CH",
  Bern: "CH",
  Basel: "CH",
  Vienna: "AT",
  Stockholm: "SE",
  Gothenburg: "SE",
  Malmö: "SE",
  Oslo: "NO",
  Bergen: "NO",
  Copenhagen: "DK",
  Aarhus: "DK",
  Helsinki: "FI",
  Reykjavik: "IS",

  // Eastern Europe
  Warsaw: "PL",
  Krakow: "PL",
  Kraków: "PL",
  Gdansk: "PL",
  Prague: "CZ",
  Budapest: "HU",
  Bucharest: "RO",
  Sofia: "BG",
  Athens: "GR",
  Tallinn: "EE",
  Riga: "LV",
  Vilnius: "LT",
  Kyiv: "UA",
  Kiev: "UA",

  // North America (non-US)
  Toronto: "CA",
  Vancouver: "CA",
  Montreal: "CA",
  Montréal: "CA",
  Calgary: "CA",
  Ottawa: "CA",
  Edmonton: "CA",
  Quebec: "CA",
  "Mexico City": "MX",
  Guadalajara: "MX",
  Monterrey: "MX",

  // APAC
  Bangalore: "IN",
  Bengaluru: "IN",
  Mumbai: "IN",
  Delhi: "IN",
  "New Delhi": "IN",
  Hyderabad: "IN",
  Chennai: "IN",
  Pune: "IN",
  Gurgaon: "IN",
  Gurugram: "IN",
  Noida: "IN",
  Tokyo: "JP",
  Osaka: "JP",
  Kyoto: "JP",
  Seoul: "KR",
  Busan: "KR",
  Beijing: "CN",
  Shanghai: "CN",
  Shenzhen: "CN",
  Guangzhou: "CN",
  "Hong Kong": "HK",
  Taipei: "TW",
  Singapore: "SG",
  Bangkok: "TH",
  "Ho Chi Minh City": "VN",
  Hanoi: "VN",
  Jakarta: "ID",
  Manila: "PH",
  "Kuala Lumpur": "MY",
  Sydney: "AU",
  Melbourne: "AU",
  Brisbane: "AU",
  Perth: "AU",
  Adelaide: "AU",
  Auckland: "NZ",
  Wellington: "NZ",

  // LATAM
  "São Paulo": "BR",
  "Sao Paulo": "BR",
  "Rio de Janeiro": "BR",
  Brasília: "BR",
  "Buenos Aires": "AR",
  Santiago: "CL",
  Bogotá: "CO",
  Bogota: "CO",
  Lima: "PE",

  // Middle East / Africa
  "Tel Aviv": "IL",
  Jerusalem: "IL",
  Haifa: "IL",
  Dubai: "AE",
  "Abu Dhabi": "AE",
  Riyadh: "SA",
  Istanbul: "TR",
  Ankara: "TR",
  "Cape Town": "ZA",
  Johannesburg: "ZA",
  Cairo: "EG",
  Lagos: "NG",
  Nairobi: "KE",
};

/**
 * Generic regional phrases that indicate a non-US location. Examples:
 * "EMEA", "APAC", "Latin America". Matched case-insensitively as standalone
 * tokens.
 */
export const FOREIGN_REGION_PHRASES: ReadonlyArray<string> = [
  "EMEA",
  "APAC",
  "EU only",
  "EU-only",
  "European Union",
  "Latin America",
  "LATAM",
  "Middle East",
  "Sub-Saharan Africa",
  "Asia Pacific",
  "Asia-Pacific",
  "Eurozone",
];

/**
 * Look up a recognized country name and return its ISO-2 code.
 * Case-insensitive, matches whole-string phrases (not substrings).
 */
export function lookupCountryByName(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Exact case-insensitive match
  for (const [name, code] of Object.entries(FOREIGN_COUNTRY_LOOKUP)) {
    if (name.toLowerCase() === trimmed.toLowerCase()) return code;
  }
  // The Ashby `addressCountry` field reports "United States" verbatim.
  if (
    trimmed.toLowerCase() === "united states" ||
    trimmed.toLowerCase() === "united states of america" ||
    trimmed.toLowerCase() === "usa" ||
    trimmed.toLowerCase() === "us"
  ) {
    return "US";
  }
  return undefined;
}

/**
 * Returns the first foreign-country code detected in a free-text location
 * string, or undefined if no foreign signal is present. Checks city names
 * first (more specific) then country names then regional phrases.
 */
export function detectForeignCountry(input: string): string | undefined {
  if (!input) return undefined;

  for (const [city, code] of Object.entries(FOREIGN_CITY_LOOKUP)) {
    const re = new RegExp(`\\b${escapeRegex(city)}\\b`, "i");
    if (re.test(input)) return code;
  }
  for (const [country, code] of Object.entries(FOREIGN_COUNTRY_LOOKUP)) {
    const re = new RegExp(`\\b${escapeRegex(country)}\\b`, "i");
    if (re.test(input)) return code;
  }
  for (const phrase of FOREIGN_REGION_PHRASES) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
    // Region phrases imply non-US but aren't a real country code; surface
    // a sentinel "ZZ" so the classifier can flag the row as foreign without
    // pinning a specific country.
    if (re.test(input)) return "ZZ";
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
