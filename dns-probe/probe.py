"""Observe recursive resolver addresses for a dedicated DNS measurement zone."""

import hashlib
import hmac
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address

from dnslib import CLASS, NS, QTYPE, RCODE, RR, SOA
from dnslib.server import BaseResolver, DNSLogger, DNSServer

ZONE = os.environ["DNS_PROBE_ZONE"].lower().rstrip(".") + "."
NAMESERVERS = tuple(
    name.lower().strip().rstrip(".") + "."
    for name in os.environ["DNS_PROBE_NAMESERVERS"].split(",")
)
SECRET = os.environ["DNS_PROBE_SECRET"].encode("ascii")
if not re.fullmatch(rb"[a-f0-9]{64}", SECRET):
    raise ValueError("DNS_PROBE_SECRET must contain 64 lowercase hexadecimal characters.")

TOKEN = re.compile(r"([a-f0-9]{24})-([a-f0-9]{8})-([a-f0-9]{24})")
PROBE_LABEL = re.compile(r"[abc]-(.+)")
QUERY_TYPES = {QTYPE.A, QTYPE.AAAA, QTYPE.HTTPS, QTYPE.SVCB}
MAX_SESSIONS = 4096
MAX_RESOLVERS = 16
sessions = {}
session_lock = threading.Lock()


def token_expiry(token):
    if not isinstance(token, str) or not (match := TOKEN.fullmatch(token)):
        return None
    nonce, expiry, mac = match.groups()
    expected = hmac.new(SECRET, f"{nonce}-{expiry}".encode(), hashlib.sha256).hexdigest()[:24]
    if not hmac.compare_digest(mac, expected):
        return None
    expires_at = int(expiry, 16)
    return expires_at if time.time() < expires_at <= time.time() + 120 else None


def purge_expired(now):
    for token, (expires_at, _) in list(sessions.items()):
        if expires_at <= now:
            del sessions[token]


def observe(token, address):
    expires_at = token_expiry(token)
    if expires_at is None:
        return
    address = str(ip_address(address))
    with session_lock:
        if token not in sessions and len(sessions) >= MAX_SESSIONS:
            purge_expired(time.time())
            if len(sessions) >= MAX_SESSIONS:
                return
        _, addresses = sessions.setdefault(token, (expires_at, set()))
        if len(addresses) < MAX_RESOLVERS:
            addresses.add(address)


class ProbeResolver(BaseResolver):
    def resolve(self, request, handler):
        reply = request.reply(ra=0, aa=0)
        if request.header.opcode != 0 or len(request.questions) != 1:
            reply.header.rcode = RCODE.FORMERR
            return reply

        question = request.q
        name = str(question.qname).lower()
        if question.qclass != CLASS.IN or (name != ZONE and not name.endswith("." + ZONE)):
            reply.header.rcode = RCODE.REFUSED
            return reply

        reply.header.aa = 1
        soa = RR(ZONE, QTYPE.SOA, ttl=0, rdata=SOA(
            NAMESERVERS[0], "hostmaster." + ZONE, (1, 3600, 600, 86400, 0)
        ))
        if name == ZONE:
            if question.qtype == QTYPE.NS:
                reply.add_answer(*(RR(ZONE, QTYPE.NS, ttl=300, rdata=NS(ns)) for ns in NAMESERVERS))
            elif question.qtype == QTYPE.SOA:
                reply.add_answer(soa)
            else:
                reply.add_auth(soa)
            return reply

        label = name[:-(len(ZONE) + 1)]
        match = PROBE_LABEL.fullmatch(label)
        if match and question.qtype in QUERY_TYPES:
            observe(match[1], handler.client_address[0])

        # Terminate the browser's probe at DNS. No wildcard HTTP host is needed.
        reply.header.rcode = RCODE.NXDOMAIN
        reply.add_auth(soa)
        return reply


class ResultHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/result":
            self.send_json(404, {"error": "Unknown endpoint."})
            return

        auth = self.headers.get("Authorization", "").encode("utf-8")
        if not hmac.compare_digest(auth, b"Bearer " + SECRET):
            self.send_json(401, {"error": "Unauthorized."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 256:
                raise ValueError("Invalid length.")
            body = json.loads(self.rfile.read(length))
            token = body["token"]
        except (ValueError, KeyError, TypeError):
            self.send_json(400, {"error": "Invalid session."})
            return

        if token_expiry(token) is None:
            self.send_json(410, {"error": "Session expired."})
            return

        with session_lock:
            session = sessions.get(token)
            addresses = sorted(session[1]) if session else []
        self.send_json(200, {"resolvers": addresses})

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    resolver = ProbeResolver()
    logger = DNSLogger(log="-request,-reply,-truncated,-error")
    address = os.environ.get("DNS_LISTEN_ADDRESS", "0.0.0.0")
    port = int(os.environ.get("DNS_LISTEN_PORT", "53"))
    servers = [
        DNSServer(resolver, address=address, port=port, tcp=tcp, logger=logger)
        for tcp in (False, True)
    ]
    http_port = int(os.environ.get("DNS_RESULTS_PORT", "8788"))
    http = ThreadingHTTPServer(("127.0.0.1", http_port), ResultHandler)
    for server in servers:
        server.start_thread()
    threading.Thread(target=http.serve_forever, daemon=True).start()
    print(f"Authoritative DNS for {ZONE} on {address}:{port} (UDP and TCP)", flush=True)
    print(f"Results API at http://127.0.0.1:{http_port}/result", flush=True)
    try:
        while True:
            time.sleep(5)
            with session_lock:
                purge_expired(time.time())
    except KeyboardInterrupt:
        http.shutdown()
        for server in servers:
            server.stop()


if __name__ == "__main__":
    main()
