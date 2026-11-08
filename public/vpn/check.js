import { connectionInfo, element, list, rows, show } from "../ui.js";

function countryCode(value) {
  return /^[A-Z]{2}$/.test(value ?? "") && !["EU", "XX", "ZZ"].includes(value) ? value : null;
}

function languageRegion(language) {
  try {
    return countryCode(new Intl.Locale(language).region);
  } catch {
    return null;
  }
}

function utcOffset(zone, date) {
  if (!zone) return null;
  try {
    const format = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset", hour: "numeric" });
    return format.formatToParts(date).find(({ type }) => type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

function withOffset(zone, offset) {
  return zone && (offset ? zone + " (" + offset + ")" : zone);
}

function render(info) {
  const now = new Date();
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const browserOffset = utcOffset(browserZone, now);
  const ipOffset = utcOffset(info.timezone, now);
  const language = navigator.languages?.[0] || navigator.language;
  const region = languageRegion(language);
  const country = countryCode(info.country);
  const timeComparable = Boolean(browserOffset && ipOffset);
  const regionComparable = Boolean(region && country);
  const timeDiffers = timeComparable && browserOffset !== ipOffset;
  const regionDiffers = regionComparable && region !== country;

  if (timeDiffers) {
    element("vpn-outcome").dataset.state = "mismatch";
    show("vpn-verdict", "Possible VPN or proxy");
    show("vpn-summary", regionDiffers
      ? "Both the browser’s UTC offset and its language region differ from the location inferred from your IP."
      : "Your browser’s UTC offset differs from the offset at the location inferred from your IP.");
  } else if (regionDiffers) {
    show("vpn-verdict", "Language region differs");
    show("vpn-summary", "A language preference is weak evidence of a VPN. People often keep their preferred language while travelling or living abroad.");
  } else if (timeComparable && regionComparable) {
    show("vpn-verdict", "No location mismatch found");
    show("vpn-summary", "The browser’s current UTC offset and preferred language region agree with the IP-based location.");
  } else {
    show("vpn-verdict", "Limited evidence");
    show("vpn-summary", "Some of the location signals needed for this comparison are unavailable.");
  }

  const timeReason = timeComparable
    ? "Time zone offsets " + (timeDiffers ? "differ" : "agree") + " right now (" + browserOffset + " in your browser, " + ipOffset + " from your IP)."
    : "The browser and IP time zones could not both be compared.";
  const regionReason = regionComparable
    ? "Your browser language region " + region + (regionDiffers ? " differs from " : " matches ") + "the IP country " + country + "."
    : "A country comparison requires both an IP country and a preferred language with an explicit country or region code.";
  list("vpn-reasons", [timeReason, regionReason]);

  const location = [...new Set([info.city, info.region, country].filter(Boolean))];
  rows("vpn-details", [
    ["Public IP", info.ip],
    ["IP network", info.network],
    ["IP-based location", location.join(", ") || null],
    ["IP time zone", withOffset(info.timezone, ipOffset)],
    ["Browser time zone", withOffset(browserZone, browserOffset)],
    ["Preferred browser language", language]
  ]);
}

connectionInfo().then(render).catch(() => {
  show("vpn-verdict", "Comparison unavailable");
  show("vpn-summary", "Couldn’t load the information needed to compare your browser and IP location.");
});
