const unavailable = "Unavailable";
const table = document.getElementById("fingerprint-table");
const search = document.getElementById("attribute-search");
const count = document.getElementById("attribute-count");
const empty = document.getElementById("no-attributes");

function filterAttributes() {
  const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const group of table.tBodies) {
    let hasMatches = false;
    for (const row of group.rows) {
      if (!row.classList.contains("signal")) continue;
      const text = [group.dataset.name, ...Array.from(row.cells, (cell) => cell.textContent)].join(" ").toLowerCase();
      row.hidden = !terms.every((term) => text.includes(term));
      if (!row.hidden) {
        hasMatches = true;
        visible++;
      }
    }
    group.hidden = !hasMatches;
  }
  count.textContent = visible + (visible === 1 ? " attribute" : " attributes");
  empty.hidden = visible !== 0;
}

function addGroup(name, entries) {
  const body = table.createTBody();
  body.dataset.name = name;
  const heading = document.createElement("th");
  heading.scope = "rowgroup";
  heading.colSpan = 2;
  heading.className = "group-label";
  heading.textContent = name;
  body.insertRow().append(heading);

  for (const [label, value] of entries) {
    const row = body.insertRow();
    row.className = "signal";
    const title = document.createElement("th");
    title.scope = "row";
    title.textContent = label;
    row.append(title);
    row.insertCell().append(value ?? unavailable);
  }
}

function reading(measure) {
  const value = document.createElement("div");
  value.textContent = "Reading…";
  Promise.resolve().then(measure).then((result) => {
    value.replaceChildren(result ?? unavailable);
  }).catch(() => {
    value.textContent = unavailable;
  }).finally(filterAttributes);
  return value;
}

function annotated(value, note) {
  const content = document.createElement("div");
  const detail = document.createElement("small");
  detail.textContent = note;
  content.append(value, detail);
  return content;
}

function expandable(label, items, scroll = false) {
  const details = document.createElement("details");
  const title = document.createElement("summary");
  const list = document.createElement("ul");
  title.textContent = label;
  if (scroll) list.className = "font-list";
  for (const item of items) {
    const line = document.createElement("li");
    line.textContent = item;
    list.append(line);
  }
  details.append(title, list);
  return details;
}

function reportedBoolean(value) {
  if (typeof value !== "boolean") return unavailable;
  return value ? "Yes" : "No";
}

function withUnit(value, unit) {
  return Number.isFinite(value) ? value + " " + unit : unavailable;
}

function size(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) ? width + " × " + height + " px" : unavailable;
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
  return unavailable;
}

function timezoneOffset() {
  const minutes = -new Date().getTimezoneOffset();
  const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0");
  const remainder = String(Math.abs(minutes) % 60).padStart(2, "0");
  return "UTC" + (minutes < 0 ? "−" : "+") + hours + ":" + remainder;
}

function navigatorProperties() {
  const properties = new Set([
    ...Object.getOwnPropertyNames(navigator),
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(navigator))
  ]);
  properties.delete("constructor");
  const names = [...properties].sort((a, b) => a.localeCompare(b));
  return expandable(names.length + " properties", names, true);
}

function pluginNames() {
  if (!navigator.plugins) return unavailable;
  const names = Array.from(navigator.plugins, (plugin) => plugin.name);
  if (!names.length) return "None reported";
  return annotated(expandable(names.length + " entries", names), "Browsers may report standardized PDF viewer names.");
}

function doNotTrack() {
  const value = navigator.doNotTrack ?? window.doNotTrack;
  if (value === "1" || value === "yes") return "Enabled";
  if (value === "0" || value === "no") return "Disabled";
  return "No preference reported";
}

function contentBlocking() {
  const bait = document.createElement("div");
  bait.className = "fingerprint-bait ad-banner adsbox";
  bait.setAttribute("aria-hidden", "true");
  document.body.append(bait);
  try {
    const style = getComputedStyle(bait);
    const hidden = !bait.offsetWidth || !bait.offsetHeight || style.visibility === "hidden";
    return annotated(hidden ? "Test element hidden" : "Test element visible",
      "This checks one ad-like element on the page. Results can vary by filter list.");
  } finally {
    bait.remove();
  }
}

function permission(name) {
  if (!navigator.permissions?.query) return unavailable;
  const value = document.createElement("span");
  value.textContent = "Reading…";
  navigator.permissions.query({ name }).then((status) => {
    const update = () => {
      const labels = { granted: "Allowed", denied: "Denied", prompt: "Ask on use" };
      value.textContent = labels[status.state] ?? status.state;
      filterAttributes();
    };
    status.addEventListener("change", update);
    update();
  }).catch(() => {
    value.textContent = unavailable;
    filterAttributes();
  });
  return value;
}

const audioFormats = [
  ["MP3", "audio/mpeg"], ["AAC", 'audio/mp4; codecs="mp4a.40.2"'],
  ["Ogg Opus", 'audio/ogg; codecs="opus"'], ["Ogg Vorbis", 'audio/ogg; codecs="vorbis"'],
  ["WebM Opus", 'audio/webm; codecs="opus"'], ["FLAC", "audio/flac"], ["WAV", "audio/wav"]
];
const videoFormats = [
  ["H.264", 'video/mp4; codecs="avc1.42E01E"'], ["HEVC", 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
  ["AV1", 'video/mp4; codecs="av01.0.05M.08"'], ["VP8", 'video/webm; codecs="vp8"'],
  ["VP9", 'video/webm; codecs="vp9"'], ["Theora", 'video/ogg; codecs="theora"']
];

function codecSupport(kind, formats) {
  const media = document.createElement(kind);
  if (!media.canPlayType) return unavailable;
  const responses = formats.map(([label, type]) => [label, media.canPlayType(type)]);
  const labels = { probably: "Probably playable", maybe: "Possibly playable", "": "Unsupported" };
  const playable = responses.filter(([, support]) => support).length;
  return expandable(playable + " of " + formats.length + " reported playable",
    responses.map(([label, support]) => label + " — " + labels[support]));
}

async function mediaDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return unavailable;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const counts = [
    ["audioinput", "microphone"], ["videoinput", "camera"], ["audiooutput", "audio output"]
  ].map(([kind, label]) => {
    const total = devices.filter((device) => device.kind === kind).length;
    return total + " " + label + (total === 1 ? "" : "s");
  });
  return annotated(counts.join(", "), "Counts reflect what this page can see under its permissions policy.");
}

async function digest(data, length = 8) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(bytes.subarray(0, length), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 72;
  canvas.className = "sample";
  canvas.setAttribute("aria-label", "Canvas rendering sample");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f7faff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#d6e7f7";
  ctx.fillRect(160, 12, 104, 37);
  ctx.fillStyle = "#234d77";
  ctx.font = "italic 21px Georgia, serif";
  ctx.fillText("Sphinx of black quartz, judge my vow.", 11, 32);
  ctx.font = "16px sans-serif";
  ctx.fillText("0123456789  Ω  😀", 12, 58);
  const hash = await digest(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 32);
  return { canvas, hash };
}

async function canvasSample() {
  const sample = await readCanvas();
  return sample ? annotated(sample.canvas, "Sample hash " + sample.hash.slice(0, 16)) : unavailable;
}

function readGraphics() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return null;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
  const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { renderer, vendor, maxTexture, masked: !debug };
}

function graphics() {
  const info = readGraphics();
  if (!info) return unavailable;
  const { renderer, vendor, maxTexture, masked } = info;
  return annotated(renderer ?? unavailable,
    [vendor, "Max texture " + maxTexture + " px", masked ? "Generic renderer information" : null].filter(Boolean).join(" · "));
}

function waveform(samples) {
  const namespace = "http://www.w3.org/2000/svg";
  const width = 320;
  const height = 62;
  const center = height / 2;
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("class", "sample waveform");
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Waveform from the rendered audio sample");
  const axis = document.createElementNS(namespace, "path");
  axis.setAttribute("class", "axis");
  axis.setAttribute("d", "M0 " + center + "H" + width);
  const line = document.createElementNS(namespace, "polyline");
  const points = Array.from(samples, (amplitude, index) => {
    const x = index * width / (samples.length - 1);
    const y = center - amplitude * (center - 2);
    return x.toFixed(2) + "," + y.toFixed(2);
  });
  line.setAttribute("points", points.join(" "));
  svg.append(axis, line);
  return svg;
}

async function audioSample() {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) return unavailable;
  const context = new OfflineContext(1, 4096, 44100);
  const oscillator = context.createOscillator();
  const compressor = context.createDynamicsCompressor();
  oscillator.type = "triangle";
  oscillator.frequency.value = 1000;
  oscillator.connect(compressor);
  compressor.connect(context.destination);
  oscillator.start();
  const rendered = await context.startRendering();
  const samples = rendered.getChannelData(0);
  const hash = await digest(samples);
  return annotated(waveform(samples.subarray(2048, 2268)), "Silent " + rendered.sampleRate + " Hz sample · Hash " + hash);
}

const fontNames = [
  "American Typewriter", "Andale Mono", "Arial", "Arial Black", "Avenir", "Baskerville",
  "Big Caslon", "Calibri", "Cambria", "Candara", "Chalkboard", "Charter", "Cochin",
  "Comic Sans MS", "Consolas", "Constantia", "Copperplate", "Courier New", "DejaVu Sans",
  "DejaVu Serif", "Didot", "DIN Alternate", "Futura", "Garamond", "Geneva", "Georgia",
  "Gill Sans", "Helvetica", "Helvetica Neue", "Hiragino Sans", "Impact", "Inter",
  "Liberation Mono", "Liberation Sans", "Lucida Console", "Lucida Grande", "Menlo",
  "Microsoft YaHei", "Monaco", "Noto Sans", "Noto Serif", "Optima", "Palatino", "PingFang SC",
  "Roboto", "Rockwell", "Segoe UI", "SimSun", "Tahoma", "Times New Roman", "Trebuchet MS",
  "Ubuntu", "Verdana", "Yu Gothic"
];

function readFonts() {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  const measure = (family) => {
    ctx.font = "72px " + family;
    return ctx.measureText("mWiIl1f0GQ&@8").width;
  };
  const fallbacks = ["serif", "sans-serif", "monospace"].map((family) => [family, measure(family)]);
  return fontNames.filter((font) =>
    fallbacks.some(([family, baseline]) => measure('"' + font + '", ' + family) !== baseline)
  );
}

function commonFonts() {
  const names = readFonts();
  if (!names) return unavailable;
  const summary = names.length + " of " + fontNames.length + " tested families";
  return annotated(names.length ? expandable(summary, names, true) : summary, "Inferred from text widths.");
}

function localFonts() {
  if (!window.queryLocalFonts) return unavailable;
  const content = document.createElement("div");
  const controls = document.createElement("div");
  controls.className = "inline-action";
  const button = document.createElement("button");
  button.className = "button";
  button.type = "button";
  button.textContent = "List local fonts";
  const status = document.createElement("span");
  status.className = "muted";
  status.setAttribute("role", "status");
  status.textContent = "May ask for permission.";
  const result = document.createElement("div");
  controls.append(button, status);
  content.append(controls, result);

  button.addEventListener("click", async () => {
    button.disabled = true;
    result.replaceChildren();
    status.textContent = "Waiting for browser permission…";
    try {
      const fonts = await window.queryLocalFonts();
      const names = [...new Set(fonts.map(({ family }) => family))].sort((a, b) => a.localeCompare(b));
      status.textContent = names.length + " accessible font families.";
      if (names.length) result.append(expandable("View local font names", names, true));
    } catch (error) {
      status.textContent = error.name === "NotAllowedError" ? "Font access was declined." : unavailable;
    } finally {
      button.disabled = false;
      filterAttributes();
    }
  });
  return content;
}

export async function privateWindowSignature() {
  const results = await Promise.allSettled(
    [readCanvas, readGraphics, readFonts].map((read) => Promise.resolve().then(read))
  );
  const [canvas, graphics, fonts] = results.map((result) => result.status === "fulfilled" ? result.value : null);
  if (!canvas && !graphics?.renderer && !fonts?.length) return null;

  // Sample device and rendering properties without network data or stored browser state.
  const values = [
    "v1", navigator.userAgent, navigator.platform, navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width, screen.height, screen.colorDepth, navigator.hardwareConcurrency,
    navigator.maxTouchPoints, canvas?.hash, graphics, fonts
  ];
  return digest(new TextEncoder().encode(JSON.stringify(values)), 32);
}

export function mountFingerprint() {
  const nav = navigator;
  addGroup("Browser", [
    ["Browser from user agent", browserName(nav.userAgent)],
    ["User agent", nav.userAgent],
    ["Platform", nav.userAgentData?.platform || nav.platform || null],
    ["Browser timezone", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["UTC offset", timezoneOffset()],
    ["Preferred language", nav.language],
    ["Languages", nav.languages?.join(", ") || null],
    ["Cookies enabled", reportedBoolean(nav.cookieEnabled)],
    ["Online", reportedBoolean(nav.onLine)],
    ["Browser vendor", nav.vendor || null],
    ["Product (legacy)", nav.product || null],
    ["Build ID (legacy)", nav.buildID || null],
    ["Navigator properties", navigatorProperties()],
    ["PDF viewer enabled", reportedBoolean(nav.pdfViewerEnabled)],
    ["Reported plugins", pluginNames()]
  ]);

  addGroup("Display and hardware", [
    ["Screen size", size(screen.width, screen.height)],
    ["Available screen size", size(screen.availWidth, screen.availHeight)],
    ["Available screen top", withUnit(screen.availTop, "px")],
    ["Available screen left", withUnit(screen.availLeft, "px")],
    ["Screen orientation", screen.orientation?.type],
    ["Viewport", size(innerWidth, innerHeight)],
    ["Device pixel ratio", withUnit(devicePixelRatio, "×")],
    ["Color depth", withUnit(screen.colorDepth, "bits")],
    ["Pixel depth", withUnit(screen.pixelDepth, "bits")],
    ["Logical CPU cores", nav.hardwareConcurrency],
    ["Approximate device memory", withUnit(nav.deviceMemory, "GB")],
    ["Max touch points", nav.maxTouchPoints],
    ["Accelerometer API exposed", reportedBoolean(typeof window.Accelerometer === "function")],
    ["Gyroscope API exposed", reportedBoolean(typeof window.Gyroscope === "function")],
    ["Keyboard layout API exposed", reportedBoolean(typeof nav.keyboard?.getLayoutMap === "function")],
    ["Color scheme preference", matchMedia("(prefers-color-scheme: dark)").matches ? "Dark" : "Light"],
    ["Reduced motion preference", matchMedia("(prefers-reduced-motion: reduce)").matches ? "Reduce" : "No preference"]
  ]);

  addGroup("Permissions and privacy", [
    ["Do Not Track", doNotTrack()],
    ["Global Privacy Control", reportedBoolean(nav.globalPrivacyControl)],
    ["Content blocking", reading(contentBlocking)],
    ["Geolocation permission", permission("geolocation")],
    ["Notifications permission", permission("notifications")],
    ["Clipboard read permission", permission("clipboard-read")],
    ["Clipboard write permission", permission("clipboard-write")],
    ["Persistent storage permission", permission("persistent-storage")],
    ["Local fonts permission", permission("local-fonts")],
    ["Camera and microphone", "Blocked by this site’s permissions policy"]
  ]);

  addGroup("Media and rendering", [
    ["Canvas rendering", reading(canvasSample)],
    ["WebGL renderer", reading(graphics)],
    ["Audio rendering", reading(audioSample)],
    ["Audio formats", codecSupport("audio", audioFormats)],
    ["Video formats", codecSupport("video", videoFormats)],
    ["Visible media devices", reading(mediaDevices)]
  ]);

  addGroup("Fonts", [
    ["Common fonts", reading(commonFonts)],
    ["Local font list", localFonts()]
  ]);

  search.addEventListener("input", filterAttributes);
  filterAttributes();
}
