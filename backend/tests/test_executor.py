import json
from types import SimpleNamespace

from app.services.executor import _extract_text_parts, _stringify_value


def test_stringify_bytes():
    assert _stringify_value(b"hello") == "hello"


def test_stringify_extracts_function_call_response():
    message = SimpleNamespace(
        parts=[
            SimpleNamespace(
                text=None,
                function_call=SimpleNamespace(
                    args={"response": "15 * 7 = 105"},
                ),
            )
        ]
    )
    assert _stringify_value(message) == "15 * 7 = 105"


def test_stringify_extracts_quoted_json_text():
    message = SimpleNamespace(parts=[SimpleNamespace(text='"105"', function_call=None)])
    assert _stringify_value(message) == "105"


def test_stringify_model_dump_with_bytes_field():
    message = SimpleNamespace(
        parts=[
            SimpleNamespace(
                text="done",
                thought_signature=b"\x00\x01",
                function_call=None,
            )
        ]
    )
    assert _extract_text_parts(message) == "done"
    serialized = _stringify_value(message)
    assert serialized == "done"


def test_stringify_dict_with_bytes_uses_default():
    payload = {"blob": b"abc"}
    assert json.loads(_stringify_value(payload)) == {"blob": "abc"}