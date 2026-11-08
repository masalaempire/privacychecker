import { element, list, show, status } from "../ui.js";

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
