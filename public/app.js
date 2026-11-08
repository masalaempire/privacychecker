const unavailable = "Unavailable";
const element = (id) => document.getElementById(id);
const show = (id, value) => { element(id).textContent = value ?? unavailable; };

function rows(id, values) {
  const items = values.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value ?? unavailable;
    row.append(term, detail);
    return row;
  });
  element(id).replaceChildren(...items);
}

function list(id, values) {
  const items = values.map((value) => {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  });
  element(id).replaceChildren(...items);
}

function status(id, label, state = "") {
  const badge = element(id + "-status");
  badge.textContent = label;
  badge.dataset.state = state;
}

async function api(path, payload) {
  const options = {
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  };
  if (payload !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch("/api/" + path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The request failed.");
  }
  return data;
}

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
  rows("header-rows", [
    ["User-Agent", info.userAgent],
    ["Accept-Language", info.acceptLanguage]
  ]);
  if (info.dnsConfigured) {
    element("run-dns").disabled = false;
    status("dns", "Ready");
  } else {
    status("dns", "Setup required");
    show("dns-message", "Live DNS testing needs a configured probe service.");
  }
}

if (!navigator.geolocation) {
  element("run-geo").disabled = true;
  show("geo-message", "This browser doesn’t expose device location.");
} else {
  element("run-geo").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    show("geo-message", "Waiting for a device location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = coords.latitude.toFixed(4) + ", " + coords.longitude.toFixed(4);
        show("geo-message", point + " · estimated accuracy " + Math.round(coords.accuracy) + " m");
        button.disabled = false;
      },
      ({ code }) => {
        show("geo-message", code === 1 ? "Location permission was declined." : "The browser couldn’t determine a location.");
        button.disabled = false;
      },
      { timeout: 12000, maximumAge: 0, enableHighAccuracy: false }
    );
  });
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

element("run-dns").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  list("dns-results", []);
  status("dns", "Resolving…", "running");
  show("dns-message", "Waiting for the probe to see your DNS queries.");
  let probes = [];
  try {
    const { token, hosts } = await api("dns/start", {});
    probes = hosts.map((host) => {
      const image = new Image();
      image.referrerPolicy = "no-referrer";
      image.src = "https://" + host + "/dns-probe";
      return image;
    });
    let resolvers = [];
    const deadline = Date.now() + 9500;
    await pause(1500);
    do {
      ({ resolvers } = await api("dns/result", { token }));
      list("dns-results", resolvers);
      if (resolvers.length) {
        await pause(1100);
        ({ resolvers } = await api("dns/result", { token }));
        break;
      }
      await pause(950);
    } while (Date.now() < deadline);

    list("dns-results", resolvers);
    if (resolvers.length) {
      status("dns", "Detected", "success");
      show("dns-message", "Source addresses observed by the DNS probe. Forwarders can affect what appears here.");
    } else {
      status("dns", "Inconclusive");
      show("dns-message", "The probe didn’t observe a resolver during this run.");
    }
  } catch (error) {
    status("dns", "Unavailable");
    show("dns-message", error.message || "The DNS check couldn’t complete.");
  } finally {
    for (const image of probes) image.removeAttribute("src");
    button.disabled = false;
  }
});

async function gatherAddresses() {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }]
  });
  const addresses = new Set();
  let timer;
  try {
    const gathering = new Promise((resolve) => {
      timer = setTimeout(resolve, 6500);
      peer.onicecandidate = ({ candidate }) => {
        if (!candidate) {
          resolve();
          return;
        }
        const fields = candidate.candidate.split(" ");
        const address = candidate.address || fields[4];
        const type = candidate.type || fields[7];
        if (address) {
          const labels = { host: "host", srflx: "STUN", prflx: "peer reflexive", relay: "relay" };
          addresses.add(address + " · " + (labels[type] || "candidate"));
        }
      };
    });
    peer.createDataChannel("address-check");
    await peer.setLocalDescription(await peer.createOffer());
    await gathering;
    return [...addresses];
  } finally {
    clearTimeout(timer);
    peer.close();
  }
}

if (!window.RTCPeerConnection) {
  element("run-rtc").disabled = true;
  status("rtc", "Unavailable");
  show("rtc-message", "This browser doesn’t expose WebRTC.");
} else {
  element("run-rtc").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    list("rtc-results", []);
    show("rtc-message", "");
    status("rtc", "Gathering…", "running");
    try {
      const addresses = await gatherAddresses();
      list("rtc-results", addresses);
      if (addresses.length) {
        status("rtc", "Detected", "success");
        show("rtc-message", "Host entries can be masked as .local names. STUN entries show addresses seen by the STUN server.");
      } else {
        status("rtc", "Inconclusive");
        show("rtc-message", "No addresses were exposed during this run.");
      }
    } catch {
      status("rtc", "Unavailable");
      show("rtc-message", "The browser couldn’t complete the WebRTC check.");
    } finally {
      button.disabled = false;
    }
  });
}

api("connection").then(renderConnection).catch(() => {
  renderConnection({});
  status("dns", "Unavailable");
  show("dns-message", "Couldn’t reach the dashboard’s connection endpoint.");
});
// A blocked or unavailable readings module should never stop the connection checks.
import("./browser-readings.js").then(({ mountFingerprint }) => mountFingerprint()).catch(() => {
  element("attribute-search").disabled = true;
  const message = element("no-attributes");
  message.textContent = "Browser readings could not load.";
  message.hidden = false;
});
