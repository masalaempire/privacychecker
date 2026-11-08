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
    ["Network", info.network],
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

function browserName(agent) {
  const families = [
    ["Edge", /(?:Edg|EdgiOS|EdgA)\/([\d.]+)/],
    ["Opera", /(?:OPR|OPiOS)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/]
  ];
  for (const [name, pattern] of families) {
    const match = agent.match(pattern);
    if (match) return name + " " + match[1];
  }
  return null;
}

function utcOffset() {
  const minutes = -new Date().getTimezoneOffset();
  const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0");
  const remainder = String(Math.abs(minutes) % 60).padStart(2, "0");
  return "UTC" + (minutes < 0 ? "−" : "+") + hours + ":" + remainder;
}

function renderBrowser() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const screenSize = screen.width + " × " + screen.height;
  show("browser-timezone", timezone);
  show("screen-size", screenSize + " px");
  rows("browser-rows", [
    ["Browser from user agent", browserName(navigator.userAgent)],
    ["Platform", navigator.userAgentData?.platform || navigator.platform || null],
    ["UTC offset", utcOffset()],
    ["Languages", navigator.languages?.join(", ") || navigator.language || null],
    ["Color scheme", matchMedia("(prefers-color-scheme: dark)").matches ? "Dark" : "Light or unset"],
    ["Reduced motion", matchMedia("(prefers-reduced-motion: reduce)").matches ? "Preferred" : "No preference"]
  ]);
  rows("device-rows", [
    ["Viewport", innerWidth + " × " + innerHeight + " px"],
    ["Device pixel ratio", devicePixelRatio + "×"],
    ["Color depth", screen.colorDepth + " bits"],
    ["Logical CPU cores", navigator.hardwareConcurrency],
    ["Approx. memory", navigator.deviceMemory ? navigator.deviceMemory + " GB" : null],
    ["Max touch points", navigator.maxTouchPoints]
  ]);
}

async function digest(buffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes.subarray(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function renderCanvas() {
  const ctx = element("canvas-sample").getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#131d1b";
  ctx.fillRect(0, 0, 420, 132);
  ctx.fillStyle = "#3f6251";
  ctx.beginPath();
  ctx.ellipse(330, 61, 62, 38, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "#7767b2";
  ctx.beginPath();
  ctx.arc(356, 72, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "italic 39px Georgia, serif";
  ctx.fillStyle = "#baf79a";
  ctx.fillText("Hello, web.", 23, 77);
  ctx.font = "13px monospace";
  ctx.fillStyle = "#a9bdb4";
  ctx.fillText("CANVAS / SAMPLE", 26, 105);
  show("canvas-reading", await digest(ctx.getImageData(0, 0, 420, 132).data));
}

function renderGraphics() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
  const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  show("webgl-reading", renderer);
  show("webgl-detail", [vendor, "Max texture " + gl.getParameter(gl.MAX_TEXTURE_SIZE) + " px"].filter(Boolean).join(" · "));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

async function renderAudio() {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) return;
  const context = new OfflineContext(1, 4096, 44100);
  const oscillator = context.createOscillator();
  const compressor = context.createDynamicsCompressor();
  oscillator.type = "triangle";
  oscillator.frequency.value = 1000;
  oscillator.connect(compressor);
  compressor.connect(context.destination);
  oscillator.start();
  const result = await context.startRendering();
  show("audio-reading", await digest(result.getChannelData(0)));
}

const fontNames = [
  "Arial", "Arial Black", "Avenir", "Calibri", "Cambria", "Comic Sans MS", "Consolas",
  "Courier New", "DejaVu Sans", "Futura", "Georgia", "Helvetica", "Helvetica Neue",
  "Inter", "Menlo", "Noto Sans", "Palatino", "Roboto", "Segoe UI", "Times New Roman",
  "Trebuchet MS", "Verdana"
];

function measureFonts() {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  const text = "mWiIl1f0GQ&@8";
  const width = (family) => {
    context.font = "72px " + family;
    return context.measureText(text).width;
  };
  const fallbacks = ["serif", "sans-serif", "monospace"].map((family) => [family, width(family)]);
  return fontNames.filter((font) =>
    fallbacks.some(([family, baseline]) => width('"' + font + '", ' + family) !== baseline)
  );
}

function renderFonts() {
  const detected = measureFonts();
  if (detected) {
    show("font-summary", detected.length + " of " + fontNames.length + " tested font families inferred from text widths.");
    list("font-tags", detected);
  } else {
    show("font-summary", "Font width measurements are unavailable.");
  }
  if (!window.queryLocalFonts) {
    element("run-fonts").disabled = true;
    show("font-message", "This browser doesn’t expose its local font list.");
  }
}

element("run-fonts").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const details = element("local-fonts");
  button.disabled = true;
  details.hidden = true;
  list("local-font-results", []);
  show("font-message", "Waiting for browser permission…");
  try {
    const fonts = await window.queryLocalFonts();
    const names = [...new Set(fonts.map(({ family }) => family))].sort((a, b) => a.localeCompare(b));
    list("local-font-results", names);
    details.hidden = !names.length;
    details.open = Boolean(names.length);
    show("font-message", names.length + " accessible font families.");
  } catch (error) {
    show("font-message", error.name === "NotAllowedError" ? "Font access was declined." : "The local font list is unavailable.");
  } finally {
    button.disabled = false;
  }
});

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
  const activity = element("dns-activity");
  button.disabled = true;
  activity.hidden = false;
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
    activity.hidden = true;
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
renderBrowser();
renderFonts();

for (const [id, measure] of [
  ["canvas-reading", renderCanvas],
  ["webgl-reading", renderGraphics],
  ["audio-reading", renderAudio]
]) {
  show(id, unavailable);
  Promise.resolve().then(measure).catch(() => show(id, unavailable));
}
