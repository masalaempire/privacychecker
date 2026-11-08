import { connectionInfo, element, rows, show } from "../ui.js";

function renderHeaders(info) {
  rows("header-rows", [
    ["User-Agent", info.userAgent],
    ["Accept-Language", info.acceptLanguage]
  ]);
}

connectionInfo().then(renderHeaders).catch(() => renderHeaders({}));
// A blocked or unavailable readings module should never stop the connection checks.
import("../browser-readings.js").then(({ mountFingerprint }) => mountFingerprint()).catch(() => {
  element("attribute-search").disabled = true;
  const message = element("no-attributes");
  message.textContent = "Browser readings could not load.";
  message.hidden = false;
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
