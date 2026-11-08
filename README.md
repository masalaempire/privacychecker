# Privacy Checker

A dashboard for seeing what a website can learn from a visit. It shows your public IP, approximate IP location and timezone, network and transport details, and a searchable table of browser and device attributes. The table includes display metrics, privacy preferences, permission states, codec support, visible media device counts, and Canvas, WebGL, audio, and font samples. The DNS and WebRTC probes run on demand. Device location and the local font list use browser permission controls.

The frontend uses plain HTML, CSS, and JavaScript with no build step. Browser measurements are displayed locally. The homepage shows IP details and links to dedicated DNS, WebRTC, fingerprint, incognito, and VPN pages. Each page submits a hash of selected readings to check for a remembered name when the incognito demo is enabled. The application keeps no visit history, and the optional DNS probe holds resolver results in memory for at most about 90 seconds. Cloudflare or any proxy in front of the probe may have its own logging settings. The WebRTC test uses Cloudflare's STUN server.

## Private window test

On **Incognito tracking demo**, enter a name or nickname and click **Remember me** in a regular window. Open an incognito or private window and revisit any page on the same site within five minutes. If its browser readings match, the page shows a full-page greeting. **Forget me** deletes the matched name and restores the page.

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

You need a domain you manage and a probe host with public access on **UDP and TCP port 53**. The Worker can stay on its existing address. The probe sees which resolver reaches the delegated DNS zone and returns the results to the Worker over HTTPS.

#### 1. Run the probe

Clone the repository on the probe host. From the `dns-probe/` directory, install the dependency and generate a shared secret.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
openssl rand -hex 32
```

Set these environment variables for the probe, substituting your domain. Keep the secret out of Git.

```ini
DNS_PROBE_ZONE=dns-check.example.com
DNS_PROBE_NAMESERVERS=dns-ns.example.com
DNS_PROBE_SECRET=PASTE_THE_GENERATED_SECRET_HERE
```

The probe defaults to port 53 for DNS and `127.0.0.1:8788` for its results API. If the host has a local DNS stub on port 53, set `DNS_LISTEN_ADDRESS` to the IPv4 address assigned to the host’s external network interface. If you forward public port 53 to a different local port, set `DNS_LISTEN_PORT` to that port.

On Linux with systemd, save the environment variables to `/etc/privacychecker-dns.env` with root-only read access. Create `/etc/systemd/system/privacychecker-dns.service` with the following content. Replace `LINUX_USER` with your username and use the absolute path to your checkout.

```ini
[Unit]
Description=Privacy Checker authoritative DNS probe
After=network.target

[Service]
User=LINUX_USER
WorkingDirectory=/home/LINUX_USER/privacychecker/dns-probe
EnvironmentFile=/etc/privacychecker-dns.env
ExecStart=/home/LINUX_USER/privacychecker/dns-probe/.venv/bin/python /home/LINUX_USER/privacychecker/dns-probe/probe.py
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now privacychecker-dns
sudo journalctl -u privacychecker-dns -n 30
```

Allow inbound UDP and TCP on port 53 in your host firewall and provider firewall. Run one probe process so DNS queries and HTTPS result lookups share the same in-memory data.

#### 2. Delegate the test zone

Add these records under the DNS settings for `example.com`.

| Type | Name | Target |
| --- | --- | --- |
| A | `dns-ns` | The probe host’s public IPv4 address. Set this record to **DNS only**. |
| NS | `dns-check` | `dns-ns.example.com` |

The test uses fresh names under `dns-check.example.com` and stops them at DNS, so no wildcard certificate is needed. From another machine you can confirm the nameserver answers on both transports and the delegation resolves.

```sh
dig @dns-ns.example.com dns-check.example.com SOA +norecurse
dig @dns-ns.example.com dns-check.example.com SOA +norecurse +tcp
dig dns-check.example.com SOA
```

[Cloudflare subdomain delegation](https://developers.cloudflare.com/dns/manage-dns-records/how-to/subdomains-outside-cloudflare/)

#### 3. Publish the HTTPS results endpoint

Set up a Cloudflare Tunnel with `cloudflared` on the probe host. Add a **Published application** route for `dns-results.example.com` with the service URL `http://127.0.0.1:8788`. This route serves the results API. DNS queries use the public port 53 configured above. The API authenticates requests with the shared secret.

[Set up Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/)

#### 4. Configure the Worker

Under the deployed project’s **Settings → Variables and Secrets**, add these values to the production environment and deploy the changes.

| Setting | Type | Example |
| --- | --- | --- |
| `DNS_PROBE_ZONE` | Text | `dns-check.example.com` |
| `DNS_PROBE_URL` | Text | `https://dns-results.example.com/result` |
| `DNS_PROBE_SECRET` | Secret | The same 64-character secret configured on the host |

Open the site’s **DNS leak test** and click **Run DNS check**. **Ready** means the Worker sees the settings. **Detected** means the probe observed a resolver. Whether that resolver indicates a leak depends on which resolver you expect your VPN or network to use.

[Cloudflare Worker variables and secrets](https://developers.cloudflare.com/workers/configuration/environment-variables/)

[Workers static assets](https://developers.cloudflare.com/workers/static-assets/) · [Pages Functions](https://developers.cloudflare.com/pages/functions/) · [Cloudflare STUN](https://developers.cloudflare.com/realtime/turn/)
