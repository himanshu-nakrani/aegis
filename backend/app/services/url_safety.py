from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata.goog",
    }
)


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
    )


def validate_http_url(url: str) -> str:
    """Reject URLs that target private networks or local services (SSRF mitigation)."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("HTTP tool only supports http:// and https:// URLs")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("HTTP URL must include a hostname")

    host = hostname.lower().rstrip(".")
    if host in BLOCKED_HOSTNAMES or host.endswith(".local") or host.endswith(".internal"):
        raise ValueError(f"HTTP URL hostname '{hostname}' is not allowed")

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        if _is_blocked_ip(literal):
            raise ValueError(f"HTTP URL resolves to blocked address: {host}")
        return url

    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            infos = socket.getaddrinfo(host, parsed.port or 443, family, socket.SOCK_STREAM)
        except socket.gaierror:
            continue
        for info in infos:
            resolved = ipaddress.ip_address(info[4][0])
            if _is_blocked_ip(resolved):
                raise ValueError(f"HTTP URL hostname '{hostname}' resolves to a private address")

    return url