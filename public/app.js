import { api, element, rows, show } from "./ui.js";

function renderConnection(info) {
  show("public-ip", info.ip);
  element("copy-ip").disabled = !info.ip;
  if (info.ip) {
    element("copy-ip").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(info.ip);
        show("copy-status", "Copied.");
      } catch {
        show("copy-status", "Select the address to copy it.");
      }
    });
  }

  const region = [...new Set([info.city, info.region, info.country].filter(Boolean))];
  show("ip-location", region.join(", ") || null);
  if (info.latitude != null && info.longitude != null) {
    const latitude = Number(info.latitude);
    const longitude = Number(info.longitude);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      const marker = element("map-marker");
      marker.setAttribute("transform", "translate(" + (longitude + 180) + " " + (90 - latitude) + ")");
      marker.removeAttribute("visibility");
    }
  }

  rows("network-rows", [
    ["IP version", info.ip ? (info.ip.includes(":") ? "IPv6" : "IPv4") : null],
    ["Network", info.network],
    ["Country", info.country],
    ["Region", info.region],
    ["City", info.city],
    ["ASN", info.asn ? "AS" + info.asn : null],
    ["IP timezone", info.timezone],
    ["HTTP / TLS", [info.http, info.tls].filter(Boolean).join(" / ") || null]
  ]);
}

const legacyPage = {
  "#private-window": "/incognito/",
  "#fingerprint": "/fingerprint/",
  "#browser": "/fingerprint/"
}[location.hash];

if (legacyPage) location.replace(legacyPage);
else api("connection").then(renderConnection).catch(() => renderConnection({}));
