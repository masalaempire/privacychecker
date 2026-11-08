import { api, element, show } from "../ui.js";

const form = element("private-test-form");
const input = element("private-test-input");
const start = element("start-private-test");
const forget = element("forget-private-test");
let signature;
let matched;

async function measureSignature() {
  if (!signature) {
    const { privateWindowSignature } = await import("../browser-readings.js");
    signature = await privateWindowSignature();
  }
  if (!signature) throw new Error("This browser didn’t expose enough readings for a match.");
  return signature;
}

function revealMatch(test) {
  matched = test;
  show("private-test-name", test.name);
  element("private-test-normal").hidden = true;
  element("private-test-reveal").hidden = false;
  element("private-test-greeting").focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    show("private-test-message", "Enter a name or nickname first.");
    return;
  }

  start.disabled = true;
  show("private-test-message", "Measuring browser signals…");
  try {
    await api("private-window/start", { signature: await measureSignature(), name });
    element("copy-private-test-link").hidden = false;
    show("private-test-message", "Open this page in a private window within five minutes.");
  } catch (error) {
    show("private-test-message", error.message || "The test couldn’t start.");
  } finally {
    start.disabled = false;
  }
});

element("copy-private-test-link").addEventListener("click", async () => {
  const url = new URL("/incognito/", location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    show("private-test-message", "Link copied. Paste it into a private window.");
  } catch {
    const link = element("private-test-link");
    link.value = url;
    link.hidden = false;
    link.focus();
    link.select();
    show("private-test-message", "Copy the selected link and open it in a private window.");
  }
});

forget.addEventListener("click", async () => {
  forget.disabled = true;
  try {
    const { name, expiresAt } = matched;
    await api("private-window/forget", { signature, name, expiresAt });
    matched = null;
    signature = null;
    input.value = "";
    show("private-test-name", "");
    show("private-forget-message", "");
    element("copy-private-test-link").hidden = true;
    element("private-test-link").hidden = true;
    element("private-test-reveal").hidden = true;
    element("private-test-normal").hidden = false;
    show("private-test-message", "Forgot your name.");
    input.focus();
  } catch (error) {
    show("private-forget-message", error.message || "The name couldn’t be forgotten. Try again.");
  } finally {
    forget.disabled = false;
  }
});

async function initialize() {
  if (!globalThis.crypto?.subtle) {
    show("private-test-message", "The private window test requires HTTPS and Web Crypto.");
    return;
  }
  try {
    const { privateTestConfigured } = await api("connection");
    if (!privateTestConfigured) {
      show("private-test-message", "Private window testing is unavailable on this deployment.");
      return;
    }

    try {
      const { test } = await api("private-window/match", { signature: await measureSignature() });
      if (test) revealMatch(test);
      show("private-test-message", "");
    } catch (error) {
      show("private-test-message", error.message || "The browser couldn’t check for a match.");
    }
    start.disabled = false;
  } catch {
    show("private-test-message", "Couldn’t reach the dashboard’s connection endpoint.");
  }
}

initialize();
