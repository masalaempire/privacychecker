const tokenPattern = /^[a-f0-9]{24}-[a-f0-9]{8}-[a-f0-9]{24}$/;
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const encoder = new TextEncoder();

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function dnsConfig(env) {
  const zone = env.DNS_PROBE_ZONE?.trim().toLowerCase();
  const secret = env.DNS_PROBE_SECRET;
  if (!zone || zone.length > 190 || !domainPattern.test(zone) || !/^[a-f0-9]{64}$/.test(secret ?? "")) {
    return null;
  }

  try {
    const url = new URL(env.DNS_PROBE_URL);
    if (url.protocol === "https:" && !url.username && !url.password) {
      return { zone, url, secret };
    }
  } catch {
    return null;
  }

  return null;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signToken(secret) {
  const id = hex(crypto.getRandomValues(new Uint8Array(12)));
  const expires = (Math.floor(Date.now() / 1000) + 90).toString(16);
  const value = id + "-" + expires;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return value + "-" + hex(signature.subarray(0, 12));
}

function connectionInfo(request, env) {
  const edge = request.cf ?? {};
  return {
    ip: request.headers.get("CF-Connecting-IP"),
    city: edge.city ?? null,
    region: edge.region ?? null,
    country: edge.country ?? null,
    latitude: edge.latitude ?? null,
    longitude: edge.longitude ?? null,
    timezone: edge.timezone ?? null,
    asn: edge.asn ?? null,
    network: edge.asOrganization ?? null,
    http: edge.httpProtocol ?? null,
    tls: edge.tlsVersion ?? null,
    userAgent: request.headers.get("User-Agent"),
    acceptLanguage: request.headers.get("Accept-Language"),
    dnsConfigured: Boolean(dnsConfig(env)),
    privateTestConfigured: Boolean(env.PRIVATE_WINDOW_TESTS)
  };
}

async function dnsResults(request, config) {
  let token;
  try {
    token = (await request.json())?.token;
  } catch {
    return json({ error: "Invalid DNS session." }, 400);
  }
  if (typeof token !== "string" || !tokenPattern.test(token)) {
    return json({ error: "Invalid DNS session." }, 400);
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Authorization": "Bearer " + config.secret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(4000)
    });
    if (response.status === 410) {
      return json({ error: "DNS session expired." }, 410);
    }
    if (!response.ok) {
      throw new Error("DNS probe returned an error.");
    }
    const { resolvers } = await response.json();
    return json({ resolvers });
  } catch {
    return json({ error: "The DNS probe service is unreachable." }, 502);
  }
}

async function privateWindowTest(request, env, action) {
  const tests = env.PRIVATE_WINDOW_TESTS;
  if (!tests) {
    return json({ error: "Private window testing hasn’t been configured on this deployment." }, 503);
  }
  const { origin } = new URL(request.url);
  if (request.headers.get("Origin") !== origin) {
    return json({ error: "Start or check a test from this site." }, 403);
  }

  let signature;
  try {
    signature = (await request.json())?.signature;
  } catch {
    return json({ error: "Invalid browser signature." }, 400);
  }
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) {
    return json({ error: "Invalid browser signature." }, 400);
  }

  try {
    const test = tests.getByName("private-window-test:v1:" + origin + ":" + signature);
    return json({ test: await test.run(action) });
  } catch {
    return json({ error: "The private window test is temporarily unavailable." }, 503);
  }
}

export async function handleApi(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/connection" && request.method === "GET") {
    return json(connectionInfo(request, env));
  }

  if ((pathname === "/api/dns/start" || pathname === "/api/dns/result") && request.method === "POST") {
    const config = dnsConfig(env);
    if (!config) {
      return json({ error: "Live DNS testing hasn’t been configured on this deployment." }, 503);
    }

    if (pathname === "/api/dns/start") {
      const token = await signToken(config.secret);
      return json({ token, hosts: ["a", "b", "c"].map((label) => label + "-" + token + "." + config.zone) });
    }

    return dnsResults(request, config);
  }

  if ((pathname === "/api/private-window/start" || pathname === "/api/private-window/match") && request.method === "POST") {
    const action = pathname.endsWith("/start") ? "start" : "match";
    return privateWindowTest(request, env, action);
  }

  return json({ error: "Endpoint not found." }, 404);
}
