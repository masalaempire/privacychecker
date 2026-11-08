import { api, connectionInfo, element, show } from "./ui.js";

let signatureRequest;

export function readPrivateWindowSignature() {
  return signatureRequest ??= import("./browser-readings.js").then(async ({ privateWindowSignature }) => {
    const signature = await privateWindowSignature();
    if (!signature) throw new Error("This browser didn’t expose enough readings for a match.");
    return signature;
  });
}

function revealMatch(test, signature) {
  const content = element("site-content");
  const reveal = document.createElement("main");
  reveal.className = "shell private-reveal";

  const heading = document.createElement("h1");
  heading.tabIndex = -1;
  const name = document.createElement("bdi");
  name.textContent = test.name;
  heading.append("Hi ", name, ", surprised?");

  const forget = document.createElement("button");
  forget.className = "button";
  forget.type = "button";
  forget.textContent = "Forget me";

  const feedback = document.createElement("p");
  feedback.className = "probe-message";
  feedback.setAttribute("role", "status");

  forget.addEventListener("click", async () => {
    forget.disabled = true;
    try {
      await api("private-window/forget", { signature, name: test.name, expiresAt: test.expiresAt });
      signatureRequest = undefined;
      reveal.remove();
      content.hidden = false;
      if (element("private-test-message")) show("private-test-message", "Forgot your name.");
      const focus = element("private-test-input") ?? content.querySelector("main h1");
      if (focus) {
        if (focus.tagName === "H1") focus.tabIndex = -1;
        focus.focus();
      }
    } catch (error) {
      feedback.textContent = error.message || "The name couldn’t be forgotten. Try again.";
    } finally {
      forget.disabled = false;
    }
  });

  reveal.append(heading, forget, feedback);
  content.hidden = true;
  document.body.append(reveal);
  heading.focus();
}

async function checkForMatch() {
  if (!globalThis.crypto?.subtle) throw new Error("The private window test requires HTTPS and Web Crypto.");
  const { privateTestConfigured } = await connectionInfo();
  if (!privateTestConfigured) throw new Error("Private window testing is unavailable on this deployment.");

  const signature = await readPrivateWindowSignature();
  const { test } = await api("private-window/match", { signature });
  if (test) revealMatch(test, signature);
}

export const privateWindowReady = checkForMatch().catch((error) =>
  error.message || "The browser couldn’t check for a match."
);
