# Privacy Checker

A dashboard for seeing what a website can learn from a visit. It shows your public IP, approximate IP location and timezone, network and transport details, and a searchable table of browser and device attributes. The table includes display metrics, privacy preferences, permission states, codec support, visible media device counts, and Canvas, WebGL, audio, and font samples. The DNS and WebRTC probes run on demand. Device location and the local font list use browser permission controls.

The frontend uses plain HTML, CSS, and JavaScript with no build step. Browser measurements are displayed locally. The homepage shows IP details and links to dedicated DNS, WebRTC, fingerprint, and incognito pages. The incognito page submits a hash of selected readings when opened or when you start a test. The application keeps no visit history, and the optional DNS probe holds resolver results in memory for at most about 90 seconds. Cloudflare or any proxy in front of the probe may have its own logging settings. The WebRTC test uses Cloudflare's STUN server.

## Private window test

On **Incognito tracking demo**, enter a name or nickname and click **Remember me** in a regular window. Open that same test page in a private window within five minutes. If its browser readings match, the page shows a full-page greeting. **Forget me** deletes the matched name and returns to the test form.

Inspired by [Nothing Private](https://github.com/gautamkrishnar/nothing-private). The browser hashes selected device and rendering signals. The site uses that digest to find the submitted name, scoped to the current site. It stores the name and expiry, with a five-minute lifetime and automatic cleanup. A later submission from a browser with the same signals replaces the earlier name. The demo stores no raw readings, IP address, or browser storage contents. The same name can appear on different browsers with identical readings.

## Deploy to Cloudflare

Pick **Workers** or **Pages**. Both use the same API implementation.

### Workers

From the repository root, deploy with Wrangler.

```sh
npx wrangler deploy --config wrangler.worker.jsonc
```

For a Workers project connected to GitHub, use this as the deploy command with the repository root as the root directory and no build command. After deployment, add your subdomain under the Worker's **Settings → Domains & Routes**.

### Pages

Create a Pages project connected to this GitHub repo. Set the production branch to `main`, the framework preset to **None**, and the build output directory to `public`. Leave the root directory at the repository root and the build command blank. Pages picks up the API adapter from the top-level `functions/` directory. Add your subdomain under **Custom domains**.

### Enable the private window test

The included Workers config provisions the SQLite Durable Object for the test on deployment. The binding name is `PRIVATE_WINDOW_TESTS` and its class is `PrivateWindowTest`.

For a Pages deployment, first deploy the Worker, then add a **Durable Object namespace** binding named `PRIVATE_WINDOW_TESTS` to the Pages project. Select the Worker and its `PrivateWindowTest` namespace. Redeploy Pages after adding the binding. The rest of the dashboard works without the binding.

### Live DNS resolver check

The dashboard can run on Cloudflare by itself. To enable DNS results, run the companion probe on a host that can receive public **UDP and TCP on port 53**. The probe sees the recursive resolver or forwarder that actually reaches its authoritative zone. Each check uses three fresh hostnames and the probe answers them with NXDOMAIN after recording the query source. The probe hostnames therefore need no wildcard certificate or HTTP service.

The following example uses `check.example.com` for the dashboard and `dns-check.example.com` for the delegated measurement zone.

| Name | Record | Target |
| --- | --- | --- |
| `dns-ns.example.com` | `A` | Public IPv4 address of the probe host. Use DNS-only mode. |
| `dns-check.example.com` | `NS` | `dns-ns.example.com` |
| `dns-results.example.com` | Tunnel or reverse proxy | Forward HTTPS requests to `http://127.0.0.1:8788` on the probe host. |

On the probe host, from `dns-probe/`, install the dependency in a virtual environment.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Generate a shared secret with `openssl rand -hex 32` and set the following environment variables in the service manager on that host. Keep the secret outside the repository.

| Probe environment variable | Example |
| --- | --- |
| `DNS_PROBE_ZONE` | `dns-check.example.com` |
| `DNS_PROBE_NAMESERVERS` | `dns-ns.example.com` |
| `DNS_PROBE_SECRET` | The generated 64-character lowercase hex secret |
| `DNS_LISTEN_PORT` | `5353` if forwarding public UDP/TCP port 53 to an unprivileged port. Defaults to `53`. |

Start the service with `.venv/bin/python probe.py`. Run a single probe process so DNS observations and HTTPS result lookups share the same memory. The result server listens on loopback and requires the shared secret. A Cloudflare Tunnel can expose that loopback service over HTTPS.

In the Workers or Pages project’s **Variables and Secrets**, add these values to the deployment environment.

| Cloudflare setting | Example |
| --- | --- |
| `DNS_PROBE_ZONE` | `dns-check.example.com` |
| `DNS_PROBE_URL` | `https://dns-results.example.com/result` |
| `DNS_PROBE_SECRET` (secret) | The same secret set on the probe host |

Redeploy if your Cloudflare project requires it for environment changes. Until these values are configured, the DNS card shows **Setup required**. An observed resolver is a measurement of this request path. Interpreting a DNS leak depends on which resolver you expect your network or VPN to use.

[Workers static assets](https://developers.cloudflare.com/workers/static-assets/) · [Pages Functions](https://developers.cloudflare.com/pages/functions/) · [Cloudflare STUN](https://developers.cloudflare.com/realtime/turn/)
