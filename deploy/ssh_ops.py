#!/usr/bin/env python3
"""SSH/SCP over password (paramiko) for Windows deploy when no SSH key is set."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import paramiko


def load_deploy_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def connect() -> paramiko.SSHClient:
    env_path = Path(os.environ.get("DEPLOY_ENV_FILE", Path(__file__).parent / "deploy.local.env"))
    cfg = load_deploy_env(env_path)
    host = cfg.get("VPS_HOST") or os.environ.get("VPS_HOST")
    user = cfg.get("VPS_USER") or os.environ.get("VPS_USER", "root")
    password = cfg.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    port = int(cfg.get("SSH_PORT") or os.environ.get("SSH_PORT") or "22")
    key = cfg.get("SSH_KEY") or os.environ.get("SSH_KEY")

    if not host:
        sys.exit("Missing VPS_HOST in deploy.local.env")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    pkey = None
    if key and Path(key).is_file():
        for key_cls in (
            paramiko.Ed25519Key,
            paramiko.RSAKey,
            paramiko.ECDSAKey,
        ):
            try:
                pkey = key_cls.from_private_key_file(key)
                break
            except Exception:
                continue
        if pkey is None:
            sys.exit(f"Could not load SSH key: {key}")

    client.connect(
        hostname=host,
        port=port,
        username=user,
        password=password if password else None,
        pkey=pkey,
        timeout=30,
        allow_agent=not password,
        look_for_keys=not password,
    )
    return client


def cmd_ssh(command: str) -> int:
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(command, get_pty=True)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        if out:
            sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
            if not out.endswith("\n"):
                sys.stdout.buffer.write(b"\n")
        if err:
            sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
            if not err.endswith("\n"):
                sys.stderr.buffer.write(b"\n")
        return exit_code
    finally:
        client.close()


def cmd_scp(local: str, remote: str) -> int:
    client = connect()
    try:
        sftp = client.open_sftp()
        local_path = Path(local)
        if local_path.is_dir():
            sys.exit("scp via ssh_ops.py supports files only; use tar for directories")
        sftp.put(str(local_path), remote)
        return 0
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("ssh", "scp"))
    parser.add_argument("arg1")
    parser.add_argument("arg2", nargs="?")
    args = parser.parse_args()
    if args.mode == "ssh":
        raise SystemExit(cmd_ssh(args.arg1))
    if not args.arg2:
        sys.exit("scp requires local and remote paths")
    raise SystemExit(cmd_scp(args.arg1, args.arg2))


if __name__ == "__main__":
    main()
