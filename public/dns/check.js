import { api, connectionInfo, element, list, show, status } from "../ui.js";

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

connectionInfo().then(({ dnsConfigured }) => {
  if (dnsConfigured) {
    element("run-dns").disabled = false;
    status("dns", "Ready");
  } else {
    status("dns", "Setup required");
    show("dns-message", "Live DNS testing needs a configured probe service.");
  }
}).catch(() => {
  status("dns", "Unavailable");
  show("dns-message", "Couldn’t reach the dashboard’s connection endpoint.");
});
