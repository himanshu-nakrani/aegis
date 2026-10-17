import pytest

from app.services.url_safety import validate_http_url


def test_validate_http_url_allows_public_https():
    assert validate_http_url("https://httpbin.org/get") == "https://httpbin.org/get"


def test_validate_http_url_blocks_localhost():
    with pytest.raises(ValueError, match="not allowed"):
        validate_http_url("http://localhost/admin")


def test_validate_http_url_blocks_private_ip_literal():
    with pytest.raises(ValueError, match="blocked"):
        validate_http_url("http://127.0.0.1/secret")


def test_validate_http_url_blocks_metadata_ip():
    with pytest.raises(ValueError, match="blocked"):
        validate_http_url("http://169.254.169.254/latest/meta-data/")


def test_validate_http_url_rejects_non_http_scheme():
    with pytest.raises(ValueError, match="only supports"):
        validate_http_url("file:///etc/passwd")

def test_redirect_drops_auth_on_scheme_downgrade():
    from app.services.url_safety import _redirect_drops_auth

    assert _redirect_drops_auth("https://api.example.com/a", "http://api.example.com/a") is True
    assert _redirect_drops_auth("https://api.example.com:443/a", "https://api.example.com/a") is False
    assert _redirect_drops_auth("https://api.example.com/a", "https://api.example.com:8443/a") is True
    assert _redirect_drops_auth("https://a.example.com/", "https://b.example.com/") is True
    assert _redirect_drops_auth("https://api.example.com/a", "https://api.example.com/b") is False


def test_lan_validator_allows_ipv6_loopback():
    from app.services.url_safety import validate_hostname_public_lan

    # ::1 reports is_reserved=True on this Python; loopback must still pass.
    validate_hostname_public_lan("::1")
    validate_hostname_public_lan("127.0.0.1")
