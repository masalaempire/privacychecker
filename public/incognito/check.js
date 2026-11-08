import { api, element, show } from "../ui.js";
import { privateWindowReady, readPrivateWindowSignature } from "../site-match.js";

const form = element("private-test-form");
const input = element("private-test-input");
const start = element("start-private-test");
const message = element("private-test-message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  delete message.dataset.state;
  if (!name) {
    show("private-test-message", "Enter a name or nickname first.");
    return;
  }

  start.disabled = true;
  show("private-test-message", "Measuring browser signals…");
  try {
    await api("private-window/start", { signature: await readPrivateWindowSignature(), name });
    message.dataset.state = "started";
    show("private-test-message", "Now open an incognito or private window and revisit this website within five minutes.");
  } catch (error) {
    show("private-test-message", error.message || "The test couldn’t start.");
  } finally {
    start.disabled = false;
  }
});

privateWindowReady.then((error) => {
  show("private-test-message", error ?? "");
  start.disabled = Boolean(error);
});
