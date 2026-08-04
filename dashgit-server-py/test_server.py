#!/usr/bin/env python3
"""Self-contained unit tests for server.py's exchange decision logic.

Mirrors dashgit-updater's TestUt* style: pure logic, no live server,
no network access. Run with: python3 -m unittest test_server.py
"""
import unittest

from server import prepare_exchange, load_env_file

ENV = {
    "CLIENT_SECRET_myclientid": "mysecret",
    "TOKEN_URL_myclientid": "https://example.test/oauth/token",
}


class TestUtPrepareExchangeForbidden(unittest.TestCase):
    def test_unknown_client_id_is_forbidden(self):
        outcome = prepare_exchange(
            {"grant_type": "authorization_code", "client_id": "nope"}, ENV
        )
        self.assertTrue(outcome.error)
        self.assertEqual(outcome.status, 403)
        self.assertEqual(outcome.body["error"], "forbidden")
        self.assertEqual(outcome.body["error_description"], "Exchange not allowed")

    def test_missing_client_id_is_forbidden(self):
        outcome = prepare_exchange({"grant_type": "authorization_code"}, ENV)
        self.assertTrue(outcome.error)
        self.assertEqual(outcome.status, 403)

    def test_unsupported_grant_type_is_forbidden(self):
        outcome = prepare_exchange(
            {"grant_type": "client_credentials", "client_id": "myclientid"}, ENV
        )
        self.assertTrue(outcome.error)
        self.assertEqual(outcome.status, 403)
        self.assertEqual(outcome.body["error_description"], "Grant type not supported")


class TestUtPrepareExchangeAuthorizationCode(unittest.TestCase):
    def test_builds_forward_body_with_secret_and_code(self):
        outcome = prepare_exchange(
            {
                "grant_type": "authorization_code",
                "client_id": "myclientid",
                "code": "AUTHCODE",
                "code_verifier": "VERIFIER",
                "redirect_uri": "http://127.0.0.1:8080/?oapp=github",
            },
            ENV,
        )
        self.assertFalse(outcome.error)
        self.assertEqual(outcome.token_url, "https://example.test/oauth/token")
        self.assertEqual(
            outcome.body,
            {
                "client_secret": "mysecret",
                "client_id": "myclientid",
                "grant_type": "authorization_code",
                "redirect_uri": "http://127.0.0.1:8080/?oapp=github",
                "code": "AUTHCODE",
                "code_verifier": "VERIFIER",
            },
        )

    def test_client_secret_never_appears_in_a_client_supplied_field(self):
        # The secret must come only from the environment, never be echoed
        # back from anything the caller sent in the payload.
        outcome = prepare_exchange(
            {
                "grant_type": "authorization_code",
                "client_id": "myclientid",
                "client_secret": "attacker-supplied",
                "code": "AUTHCODE",
            },
            ENV,
        )
        self.assertEqual(outcome.body["client_secret"], "mysecret")


class TestUtPrepareExchangeRefreshToken(unittest.TestCase):
    def test_builds_forward_body_with_refresh_token(self):
        outcome = prepare_exchange(
            {
                "grant_type": "refresh_token",
                "client_id": "myclientid",
                "refresh_token": "REFRESHTOKEN",
                "redirect_uri": "http://127.0.0.1:8080/?oapp=github",
            },
            ENV,
        )
        self.assertFalse(outcome.error)
        self.assertEqual(
            outcome.body,
            {
                "client_secret": "mysecret",
                "refresh_token": "REFRESHTOKEN",
                "client_id": "myclientid",
                "grant_type": "refresh_token",
                "redirect_uri": "http://127.0.0.1:8080/?oapp=github",
            },
        )


class TestUtLoadEnvFile(unittest.TestCase):
    def test_parses_key_value_lines_and_skips_comments_and_blanks(self):
        import tempfile
        import os
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text(
                "# a comment\n"
                "\n"
                "CLIENT_SECRET_x=abc\n"
                "TOKEN_URL_x=https://example.test/token\n"
            )
            marker = "CLIENT_SECRET_x"
            os.environ.pop(marker, None)
            try:
                load_env_file(env_path)
                self.assertEqual(os.environ.get("CLIENT_SECRET_x"), "abc")
                self.assertEqual(os.environ.get("TOKEN_URL_x"), "https://example.test/token")
            finally:
                os.environ.pop("CLIENT_SECRET_x", None)
                os.environ.pop("TOKEN_URL_x", None)

    def test_does_not_override_an_already_set_shell_env_var(self):
        import tempfile
        import os
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("CLIENT_SECRET_x=from_dotenv\n")
            os.environ["CLIENT_SECRET_x"] = "from_shell_or_secret_store"
            try:
                load_env_file(env_path)
                self.assertEqual(os.environ["CLIENT_SECRET_x"], "from_shell_or_secret_store")
            finally:
                os.environ.pop("CLIENT_SECRET_x", None)


if __name__ == "__main__":
    unittest.main()
