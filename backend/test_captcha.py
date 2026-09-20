import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))

from captcha import CaptchaError, verify_turnstile


class CaptchaTests(unittest.TestCase):
    def test_local_environment_does_not_require_captcha(self):
        with patch.dict(os.environ, {}, clear=True):
            verify_turnstile(None)

    def test_configured_environment_requires_token(self):
        with patch.dict(os.environ, {"TURNSTILE_SECRET_KEY": "test-secret"}, clear=True):
            with self.assertRaises(CaptchaError):
                verify_turnstile(None)


if __name__ == "__main__":
    unittest.main()
