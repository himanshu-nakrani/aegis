from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

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


def _hostname_blocked(hostname: str) -> bool:
    host = hostname.lower().rstrip(".")
    return host in BLOCKED_HOSTNAMES or host.endswith(".local") or host.endswith(".internal")


def _validate_resolved_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address, label: str) -> None:
    if _is_blocked_ip(ip):
        raise ValueError(f"{label} resolves to blocked address: {ip}")


def validate_hostname_public(hostname: str, port: int = 443) -> None:
    """Ensure a hostname does not resolve to private or local addresses."""
    if not hostname:
        raise ValueError("Hostname is required")

    if _hostname_blocked(hostname):
        raise ValueError(f"Hostname '{hostname}' is not allowed")

    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        literal = None

    if literal is not None:
        _validate_resolved_ip(literal, f"Host '{hostname}'")
        return

    resolved_any = False
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            infos = socket.getaddrinfo(hostname, port, family, socket.SOCK_STREAM)
        except socket.gaierror:
            continue
        for info in infos:
            resolved_any = True
            resolved = ipaddress.ip_address(info[4][0])
            _validate_resolved_ip(resolved, f"Hostname '{hostname}'")

    if not resolved_any:
        raise ValueError(f"Hostname '{hostname}' could not be resolved")


def resolve_public_ip(hostname: str, port: int) -> str:
    """Resolve hostname once and return the first public IP address."""
    validate_hostname_public(hostname, port)

    try:
        literal = ipaddress.ip_address(hostname)
        return str(literal)
    except ValueError:
        pass

    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            infos = socket.getaddrinfo(hostname, port, family, socket.SOCK_STREAM)
        except socket.gaierror:
            continue
        for info in infos:
            resolved = ipaddress.ip_address(info[4][0])
            if not _is_blocked_ip(resolved):
                return str(resolved)

    raise ValueError(f"Hostname '{hostname}' could not be resolved to a public address")


_METADATA_HOSTNAMES = frozenset({"metadata.google.internal", "metadata.goog"})


def validate_lan_endpoint(url: str) -> str:
    """DNS-resolving endpoint check for keyless providers (Ollama).

    Resolves the hostname and refuses metadata/link-local targets, while
    permitting loopback/LAN addresses that keyless local models
    legitimately use. Blocks DNS aliases that plain hostname checks miss
    (e.g. ``attacker.example`` → 169.254.169.254). Blocking I/O — call from
    threads or sync handlers only.
    """
    from urllib.parse import urlparse

    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Endpoint must use http:// or https://")
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname:
        raise ValueError("Endpoint must include a hostname")
    if parsed.username or parsed.password:
        raise ValueError("Endpoint must not embed credentials")
    if hostname in _METADATA_HOSTNAMES:
        raise ValueError(f"Hostname '{hostname}' is not allowed")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    validate_hostname_public_lan(hostname, port)
    return url


def validate_hostname_public_lan(hostname: str, port: int = 443) -> None:
    """Like :func:`validate_hostname_public` but permits loopback/private IPs.

    Still refuses link-local (cloud metadata), multicast, and reserved
    addresses plus blocked/metadata hostnames.
    """
    if not hostname:
        raise ValueError("Hostname is required")
    lowered = hostname.lower().rstrip(".")
    if lowered in _METADATA_HOSTNAMES:
        raise ValueError(f"Hostname '{hostname}' is not allowed")
    # Note: unlike _hostname_blocked, localhost/.local/.internal are allowed
    # here — mDNS and loopback are the documented keyless flows. The
    # metadata-service vector is closed by _METADATA_HOSTNAMES above and by
    # rejecting link-local resolutions below.
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        literal = None
    if literal is not None:
        if literal.is_link_local or literal.is_multicast or literal.is_reserved:
            raise ValueError(f"Host '{hostname}' is not allowed")
        return
    resolved_any = False
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            infos = socket.getaddrinfo(hostname, port, family, socket.SOCK_STREAM)
        except socket.gaierror:
            continue
        for info in infos:
            resolved_any = True
            resolved = ipaddress.ip_address(info[4][0])
            if resolved.is_link_local or resolved.is_multicast or resolved.is_reserved:
                raise ValueError(f"Hostname '{hostname}' resolves to blocked address: {resolved}")
    if not resolved_any:
        raise ValueError(f"Hostname '{hostname}' could not be resolved")


def validate_http_url(url: str) -> str:
    """Reject URLs that target private networks or local services (SSRF mitigation)."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("HTTP tool only supports http:// and https:// URLs")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("HTTP URL must include a hostname")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    validate_hostname_public(hostname, port)
    return url


def _url_with_pinned_host(parsed, ip: str, port: int) -> str:
    hostpart = f"[{ip}]" if ":" in ip else ip
    default_port = 443 if parsed.scheme == "https" else 80
    netloc = f"{hostpart}:{port}" if port != default_port else hostpart
    return urlunparse(
        (parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment)
    )


async def safe_http_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    content: bytes | None = None,
    max_redirects: int = 5,
    max_body_bytes: int | None = None,
) -> httpx.Response:
    """HTTP request with DNS pinning to prevent TOCTOU rebinding attacks.

    When ``max_body_bytes`` is set the response body is streamed and truncated
    so a huge payload cannot exhaust process memory before the caller slices it.
    """
    # validate_http_url / resolve_public_ip do blocking socket.getaddrinfo —
    # keep the event loop free by running the DNS work off-thread.
    current_url = await asyncio.to_thread(validate_http_url, url)
    current_method = method.upper()
    body = content
    redirects = 0

    while True:
        parsed = urlparse(current_url)
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("HTTP URL must include a hostname")

        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        resolved_ip = await asyncio.to_thread(resolve_public_ip, hostname, port)
        pinned_url = _url_with_pinned_host(parsed, resolved_ip, port)

        request_headers = dict(headers or {})
        request_headers.setdefault("Host", parsed.netloc.split("@")[-1])
        # httpx derives TLS SNI + cert-verification hostname from url.host,
        # which is the pinned IP literal here — pass the real hostname so
        # HTTPS verification succeeds (cf. MCPPinnedTransport).
        request_extensions = {"sni_hostname": hostname} if parsed.scheme == "https" else None

        if max_body_bytes is not None:
            stream_kwargs: dict = {
                "headers": request_headers,
                "content": body,
                "follow_redirects": False,
            }
            if request_extensions:
                stream_kwargs["extensions"] = request_extensions
            async with client.stream(
                current_method,
                pinned_url,
                **stream_kwargs,
            ) as response:
                if (
                    response.status_code in {301, 302, 303, 307, 308}
                    and redirects < max_redirects
                ):
                    location = response.headers.get("location")
                    await response.aread()
                    if not location:
                        # Build a fully-buffered response for the caller.
                        return await client.request(
                            current_method,
                            pinned_url,
                            headers=request_headers,
                            content=body,
                            follow_redirects=False,
                        )
                    redirects += 1
                    next_url = urljoin(current_url, location)
                    if urlparse(next_url).hostname != urlparse(current_url).hostname:
                        request_headers.pop("Authorization", None)
                        for key in [k for k in request_headers if k.lower() == "proxy-authorization"]:
                            request_headers.pop(key, None)
                        headers = {k: v for k, v in (headers or {}).items() if k.lower() not in ("authorization", "proxy-authorization")}
                    current_url = await asyncio.to_thread(
                        validate_http_url, next_url
                    )
                    if response.status_code == 303:
                        current_method = "GET"
                        body = None
                    continue
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    remain = max_body_bytes - total
                    if remain <= 0:
                        break
                    if len(chunk) > remain:
                        chunks.append(chunk[:remain])
                        total += remain
                        break
                    chunks.append(chunk)
                    total += len(chunk)
                # Materialize a Response the caller can treat like a normal one.
                return httpx.Response(
                    status_code=response.status_code,
                    headers=response.headers,
                    content=b"".join(chunks),
                    request=response.request,
                )

        request_kwargs: dict = {
            "headers": request_headers,
            "content": body,
            "follow_redirects": False,
        }
        if request_extensions:
            request_kwargs["extensions"] = request_extensions
        response = await client.request(
            current_method,
            pinned_url,
            **request_kwargs,
        )

        if response.status_code not in {301, 302, 303, 307, 308} or redirects >= max_redirects:
            return response

        location = response.headers.get("location")
        if not location:
            return response

        next_url = urljoin(current_url, location)
        if urlparse(next_url).hostname != urlparse(current_url).hostname:
            # httpx strips Authorization on cross-host redirects; our manual
            # loop must do the same or caller credentials replay to the new host.
            request_headers.pop("Authorization", None)
            for key in [k for k in request_headers if k.lower() == "proxy-authorization"]:
                request_headers.pop(key, None)
            headers = {k: v for k, v in (headers or {}).items() if k.lower() not in ("authorization", "proxy-authorization")}
        current_url = await asyncio.to_thread(validate_http_url, next_url)
        if response.status_code in {301, 302, 303}:
            current_method = "GET"
            body = None
        redirects += 1