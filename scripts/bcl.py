#!/usr/bin/env python3
"""Load Box Dispatch BCL config artifacts into Python objects.

BCL is the single admin-facing interchange format for LOS configuration
(see the ``59325b2`` migration). Every ``config/*.bcl`` file wraps exactly one
artifact in the canonical form ``bcl.LoadBCL`` parses::

    locals {
      "bcl" = {
        ...inventory...
        "resources" = [
          { "config" = { <payload> }, "metadata" = { ... }, ... }
        ]
      }
    }

The ``<payload>`` under ``resources[0].config`` mirrors the pre-migration JSON
shape plus injected identity fields (``artifact_name``, ``artifact_type``,
``created_at``, ``enterprise_id``, ``provider``, ``provider_object_id``). Those
extra keys are harmless to consumers that read named keys.

The grammar is an HCL2 subset produced by a generator, so it is regular:
double-quoted strings (with JSON escapes and ``${...}`` interpolations kept
verbatim), numbers, ``true``/``false``/``null``, objects ``{ }``, arrays
``[ ]``, ``#`` and ``//`` comments, and elements separated by newlines (commas
are tolerated but not required). This module parses that subset directly so the
repository keeps a dependency-free config path.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

__all__ = ["BCLError", "load_bcl", "parse_bcl", "load_artifact"]


class BCLError(ValueError):
    """Raised when a ``.bcl`` file cannot be parsed or lacks an artifact."""


_PUNCT = {"{", "}", "[", "]", "="}
# Characters that terminate a bare word (identifier / number / keyword).
_WORD_STOP = set(' \t\r\n,{}[]=#"')


def _tokenize(text: str) -> list[tuple[str, Any]]:
    tokens: list[tuple[str, Any]] = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n,":  # whitespace and stray commas are insignificant
            i += 1
            continue
        if c == "#" or (c == "/" and i + 1 < n and text[i + 1] == "/"):
            newline = text.find("\n", i)
            i = n if newline == -1 else newline + 1
            continue
        if c in _PUNCT:
            tokens.append((c, c))
            i += 1
            continue
        if c == '"':
            value, i = _read_string(text, i)
            tokens.append(("str", value))
            continue
        j = i
        while j < n and text[j] not in _WORD_STOP:
            j += 1
        tokens.append(("word", text[i:j]))
        i = j
    tokens.append(("eof", None))
    return tokens


def _read_string(text: str, i: int) -> tuple[str, int]:
    """Read a double-quoted string starting at ``i``; return (value, next_i)."""
    n = len(text)
    j = i + 1
    while j < n:
        c = text[j]
        if c == "\\":  # escape: skip the escaped character
            j += 2
            continue
        if c == '"':
            # Hand the exact quoted span to json so every escape decodes once.
            return json.loads(text[i : j + 1]), j + 1
        j += 1
    raise BCLError("unterminated string literal")


def _classify_word(word: str) -> Any:
    if word == "true":
        return True
    if word == "false":
        return False
    if word in ("null", "nil"):
        return None
    try:
        return int(word)
    except ValueError:
        pass
    try:
        return float(word)
    except ValueError:
        # A bare identifier used as a value (rare); keep it as text.
        return word


class _Parser:
    def __init__(self, tokens: list[tuple[str, Any]]):
        self._toks = tokens
        self._pos = 0

    def _peek(self) -> tuple[str, Any]:
        return self._toks[self._pos]

    def _next(self) -> tuple[str, Any]:
        tok = self._toks[self._pos]
        self._pos += 1
        return tok

    def _expect(self, kind: str) -> tuple[str, Any]:
        tok = self._next()
        if tok[0] != kind:
            raise BCLError(f"expected {kind!r}, got {tok!r}")
        return tok

    def parse_document(self) -> dict[str, Any]:
        """Parse ``locals { ... }`` (or a bare object) into a dict."""
        kind, _ = self._peek()
        if kind == "word":  # leading `locals` block label
            self._next()
        return self._parse_object()

    def _parse_value(self) -> Any:
        kind, value = self._peek()
        if kind == "{":
            return self._parse_object()
        if kind == "[":
            return self._parse_array()
        if kind == "str":
            self._next()
            return value
        if kind == "word":
            self._next()
            return _classify_word(value)
        raise BCLError(f"unexpected token {self._peek()!r}")

    def _parse_object(self) -> dict[str, Any]:
        self._expect("{")
        obj: dict[str, Any] = {}
        while True:
            kind, value = self._peek()
            if kind == "}":
                self._next()
                return obj
            if kind not in ("str", "word"):
                raise BCLError(f"expected object key, got {self._peek()!r}")
            self._next()
            key = value if kind == "str" else str(value)
            self._expect("=")
            obj[key] = self._parse_value()

    def _parse_array(self) -> list[Any]:
        self._expect("[")
        arr: list[Any] = []
        while True:
            if self._peek()[0] == "]":
                self._next()
                return arr
            arr.append(self._parse_value())


def parse_bcl(text: str) -> dict[str, Any]:
    """Parse BCL source text and return the ``bcl`` inventory dict."""
    document = _Parser(_tokenize(text)).parse_document()
    inventory = document.get("bcl")
    if inventory is None:
        raise BCLError("missing locals.bcl block")
    return inventory


def load_artifact(path: str | Path) -> dict[str, Any]:
    """Return the full first resource (config + metadata) from a ``.bcl`` file."""
    inventory = parse_bcl(Path(path).read_text(encoding="utf-8"))
    resources = inventory.get("resources") or []
    if not resources:
        raise BCLError(f"{path}: no resources in locals.bcl")
    return resources[0]


def load_bcl(path: str | Path) -> dict[str, Any]:
    """Return the config payload (``resources[0].config``) from a ``.bcl`` file.

    This is the pre-migration JSON shape a consumer expects, so call sites that
    previously did ``load_json(...".json")`` become ``load_bcl(...".bcl")``.
    """
    resource = load_artifact(path)
    config = resource.get("config")
    if config is None:
        raise BCLError(f"{path}: first resource has no config block")
    return config


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import sys

    for arg in sys.argv[1:]:
        print(json.dumps(load_bcl(arg), indent=2, sort_keys=True))
