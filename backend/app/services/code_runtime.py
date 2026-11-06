"""Explicit provisioning and offline validation of the Code node's WASI runtime.

Run ``python -m app.services.code_runtime --fetch`` from backend/ to install.
Serialized Wasmtime modules are trusted native code: only this checksum-pinned
provisioner creates them, and request paths validate the managed installation.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import platform
import re
import shutil
import stat
import tempfile
import threading
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


RUNTIME_ROOT = Path(__file__).resolve().parents[2] / ".code-runtime"
RUNTIME_URL = (
    "https://github.com/brettcannon/cpython-wasi-build/releases/download/"
    "v3.13.15/python-3.13.15-wasi_sdk-24.zip"
)
RUNTIME_ARCHIVE_BYTES = 13_844_674
RUNTIME_ARCHIVE_SHA256 = "67e1c32a85d5e0600c0939f5fd4023ca0127f1a9e81f5499697467bda67af78d"
_MAX_EXTRACTED_BYTES = 256 * 1024 * 1024
_MANIFEST_NAME = "manifest.json"
_REQUIRED_FILES = {
    "python.wasm",
    "python.cwasm",
    "lib/python3.13/os.py",
    "lib/python3.13/encodings/__init__.py",
    "lib/python3.13/json/__init__.py",
}
_FETCH_COMMAND = "python -m app.services.code_runtime --fetch"
_VALIDATED_INSTALLS: dict[tuple[Path, str], tuple] = {}
_VALIDATION_LOCK = threading.Lock()


def _runtime_error(detail: str) -> ValueError:
    return ValueError(
        f"Code node WASI runtime {detail}. Run `{_FETCH_COMMAND}` from backend/."
    )


def _identity() -> dict:
    try:
        version = importlib.metadata.version("wasmtime")
    except importlib.metadata.PackageNotFoundError as exc:
        raise _runtime_error("requires wasmtime>=50.0.1,<51") from exc
    match = re.fullmatch(r"50\.(\d+)\.(\d+)", version)
    if match is None or (50, int(match[1]), int(match[2])) < (50, 0, 1):
        raise _runtime_error("requires wasmtime>=50.0.1,<51")
    system = platform.system().lower()
    machine = platform.machine().lower()
    if not all(re.fullmatch(r"[a-z0-9_-]+", value) for value in (system, machine)):
        raise _runtime_error("has an unsupported platform identity")
    return {
        "schema": 1,
        "archive_url": RUNTIME_URL,
        "archive_sha256": RUNTIME_ARCHIVE_SHA256,
        "archive_bytes": RUNTIME_ARCHIVE_BYTES,
        "wasmtime_version": version,
        "os": system,
        "architecture": machine,
        "engine": {"consume_fuel": True, "epoch_interruption": True},
    }


def _install_path(identity: dict) -> Path:
    key = (
        f"cpython-3.13.15-wasmtime-{identity['wasmtime_version']}-"
        f"{identity['os']}-{identity['architecture']}"
    )
    return RUNTIME_ROOT / key


def _safe_member(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if (
        not name
        or "\\" in name
        or "\x00" in name
        or path.is_absolute()
        or any(part in (".", "..") or ":" in part for part in name.rstrip("/").split("/"))
    ):
        raise _runtime_error("archive contains an unsafe path")
    return path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _installed_files(directory: Path) -> dict[str, Path]:
    if directory.is_symlink() or not directory.is_dir():
        raise _runtime_error("installation is missing or is not a regular directory")
    files = {}
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise _runtime_error("installation contains a symbolic link")
        mode = path.stat().st_mode
        if stat.S_ISDIR(mode):
            continue
        if not stat.S_ISREG(mode):
            raise _runtime_error("installation contains a non-regular file")
        relative = path.relative_to(directory).as_posix()
        if relative != _MANIFEST_NAME:
            files[relative] = path
    return files


def _required_stats(directory: Path) -> tuple:
    if RUNTIME_ROOT.is_symlink():
        raise _runtime_error("installation root must not be a symbolic link")
    directories = ("", "lib", "lib/python3.13", "lib/python3.13/encodings", "lib/python3.13/json")
    signature = []
    for name in (*directories, _MANIFEST_NAME, *sorted(_REQUIRED_FILES)):
        path = directory / name
        info = path.lstat()
        expected_type = stat.S_IFDIR if name in directories else stat.S_IFREG
        if stat.S_IFMT(info.st_mode) != expected_type:
            raise _runtime_error("is incomplete or contains a symbolic link")
        signature.append((name, info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns, info.st_ctime_ns))
    return tuple(signature)


def runtime_paths() -> tuple[Path, Path]:
    """Return only provisioner-managed paths, without downloads or compilation.

    Full digest validation runs once per installation and engine identity in
    this process. Later calls check essential file/directory stats; replacing
    a validated installation fails closed and requires a process restart.
    No guest has the capability to mutate this trusted host installation.
    """
    try:
        identity = _identity()
        directory = _install_path(identity)
        key = (directory, json.dumps(identity, sort_keys=True))
        signature = _required_stats(directory)
        with _VALIDATION_LOCK:
            trusted = _VALIDATED_INSTALLS.get(key)
            if trusted is None:
                paths = _validate_runtime_paths()
                if _required_stats(directory) != signature:
                    raise _runtime_error("changed during validation")
                _VALIDATED_INSTALLS[key] = signature
                return paths
            if trusted != signature:
                raise _runtime_error("changed after validation; restart after reprovisioning")
        return directory / "python.cwasm", directory / "lib"
    except OSError as exc:
        raise _runtime_error("is missing, incomplete, or unreadable") from exc


def _validate_runtime_paths() -> tuple[Path, Path]:
    """Return validated native module and library paths; never fetch or compile.

    The installation is trusted host code, not a user-supplied artifact cache.
    Its version/platform/engine manifest and every installed file's digest must
    match before a serialized module can reach Wasmtime's unsafe deserializer.
    """
    try:
        identity = _identity()
        directory = _install_path(identity)
        if RUNTIME_ROOT.is_symlink() or directory.is_symlink():
            raise _runtime_error("installation root must not be a symbolic link")
        manifest_path = directory / _MANIFEST_NAME
        if manifest_path.is_symlink() or not manifest_path.is_file():
            raise _runtime_error("is missing or incomplete")
        if manifest_path.stat().st_size > 1024 * 1024:
            raise _runtime_error("has an invalid manifest")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or set(manifest) != {"identity", "files"}:
            raise _runtime_error("has an invalid manifest")
        if manifest["identity"] != identity:
            raise _runtime_error("is incompatible with this Wasmtime version or platform")
        expected_files = manifest["files"]
        if not isinstance(expected_files, dict) or not _REQUIRED_FILES <= expected_files.keys():
            raise _runtime_error("is incomplete")
        if any(
            not isinstance(name, str)
            or not isinstance(digest, str)
            or re.fullmatch(r"[0-9a-f]{64}", digest) is None
            or (name not in {"python.wasm", "python.cwasm"} and not name.startswith("lib/"))
            for name, digest in expected_files.items()
        ):
            raise _runtime_error("has an invalid file manifest")
        files = _installed_files(directory)
        if files.keys() != expected_files.keys():
            raise _runtime_error("is incomplete or contains unexpected files")
        for name, path in files.items():
            if _sha256(path) != expected_files[name]:
                raise _runtime_error("failed its installed-file checksum")
        return directory / "python.cwasm", directory / "lib"
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise _runtime_error("is missing, incomplete, or unreadable") from exc


def _download_archive(destination: Path) -> None:
    # Disable environment-derived proxies; provisioning never sends app secrets.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    digest = hashlib.sha256()
    total = 0
    request = urllib.request.Request(RUNTIME_URL, headers={"User-Agent": "Aegis-WASI-Provisioner"})
    with opener.open(request, timeout=60) as response, destination.open("xb") as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > RUNTIME_ARCHIVE_BYTES:
                raise _runtime_error("download exceeds the pinned archive size")
            digest.update(chunk)
            output.write(chunk)
    if total != RUNTIME_ARCHIVE_BYTES or digest.hexdigest() != RUNTIME_ARCHIVE_SHA256:
        raise _runtime_error("download failed its pinned size or SHA256 verification")


def _extract_archive(archive_path: Path, destination: Path) -> None:
    # Verification happens before ZipFile examines or extracts the archive.
    if (
        archive_path.stat().st_size != RUNTIME_ARCHIVE_BYTES
        or _sha256(archive_path) != RUNTIME_ARCHIVE_SHA256
    ):
        raise _runtime_error("archive failed its pinned size or SHA256 verification")
    with zipfile.ZipFile(archive_path) as archive:
        members = []
        names = set()
        extracted_bytes = 0
        for member in archive.infolist():
            path = _safe_member(member.filename)
            name = path.as_posix()
            mode = stat.S_IFMT(member.external_attr >> 16)
            if (
                name in names
                or mode not in (0, stat.S_IFREG, stat.S_IFDIR)
                or member.flag_bits & 1
                or (mode == stat.S_IFDIR and not member.is_dir())
                or (mode == stat.S_IFREG and member.is_dir())
            ):
                raise _runtime_error("archive contains duplicate, encrypted, or unsafe entries")
            names.add(name)
            extracted_bytes += member.file_size
            if extracted_bytes > _MAX_EXTRACTED_BYTES:
                raise _runtime_error("archive exceeds the extraction size limit")
            if name == "python.wasm" or path.parts[0] == "lib":
                members.append((member, path))
        required = _REQUIRED_FILES - {"python.cwasm"}
        if not required <= names:
            raise _runtime_error("archive is missing the expected CPython interpreter or library")
        for member, path in members:
            target = destination.joinpath(*path.parts)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output, length=1024 * 1024)


def _make_readable(directory: Path) -> None:
    # nobody can traverse and read, but no guest-writable content is installed.
    for path in directory.rglob("*"):
        path.chmod(0o755 if path.is_dir() else 0o444)
    directory.chmod(0o755)


def fetch_runtime() -> tuple[Path, Path]:
    """Provision the pinned runtime explicitly; publish only a complete install."""
    identity = _identity()
    directory = _install_path(identity)
    try:
        return runtime_paths()
    except ValueError:
        if directory.exists() or directory.is_symlink():
            raise _runtime_error(
                f"installation at {directory} is invalid; move it aside before provisioning"
            ) from None
    if RUNTIME_ROOT.is_symlink():
        raise _runtime_error("installation root must not be a symbolic link")
    RUNTIME_ROOT.mkdir(mode=0o755, exist_ok=True)
    RUNTIME_ROOT.chmod(0o755)
    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=RUNTIME_ROOT))
    try:
        archive_path = staging / ".download.zip"
        _download_archive(archive_path)
        _extract_archive(archive_path, staging)
        archive_path.unlink()
        import wasmtime

        config = wasmtime.Config()
        config.consume_fuel = True
        config.epoch_interruption = True
        config.parallel_compilation = False
        engine = wasmtime.Engine(config)
        module = wasmtime.Module.from_file(engine, str(staging / "python.wasm"))
        (staging / "python.cwasm").write_bytes(module.serialize())
        manifest = {
            "identity": identity,
            "files": {name: _sha256(path) for name, path in sorted(_installed_files(staging).items())},
        }
        (staging / _MANIFEST_NAME).write_text(
            json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8"
        )
        _make_readable(staging)
        if directory.exists() or directory.is_symlink():
            raise _runtime_error("installation destination appeared during provisioning")
        staging.rename(directory)
    except Exception as exc:
        if isinstance(exc, ValueError):
            raise
        raise _runtime_error(f"provisioning failed ({type(exc).__name__})") from exc
    finally:
        if staging.exists():
            # Only our unpublished temporary directory is ever removed.
            for path in staging.rglob("*"):
                path.chmod(0o700 if path.is_dir() else 0o600)
            staging.chmod(0o700)
            shutil.rmtree(staging)
    return runtime_paths()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="provision the pinned CPython/WASI runtime")
    args = parser.parse_args()
    try:
        module_path, stdlib_dir = fetch_runtime() if args.fetch else runtime_paths()
    except ValueError as exc:
        parser.exit(1, f"{exc}\n")
    print(f"module: {module_path}\nstdlib: {stdlib_dir}")


if __name__ == "__main__":
    main()
