"""Thin wrapper for calling the Google Gemini API server-side (free tier). Every
caller in this app is a single, manually-triggered, non-agentic request — no
tool use, no loop, no background/scheduled calls. See ai_insights/services.py
for the three call sites.

Uses Gemini rather than a paid model because the user specifically wants a
free-tier, no-cost provider for this lightweight, infrequent feature. Gemini's
API tier does not train on API requests by default (as of when this was
written) — worth re-confirming Google's current data-use terms periodically.
"""
from __future__ import annotations

from google import genai

from core.integration_credentials import get_global_secret

CLASSIFY_MODEL = 'gemini-3.6-flash'
EXPLAIN_MODEL = 'gemini-3.6-flash'


class GeminiNotConfigured(Exception):
    """No GEMINI_API_KEY IntegrationCredential is configured."""


def get_client() -> genai.Client:
    api_key = get_global_secret('GEMINI_API_KEY')
    if not api_key:
        raise GeminiNotConfigured(
            'No GEMINI_API_KEY configured — add one via Admin → API Keys '
            '(get a free key from aistudio.google.com/apikey).'
        )
    return genai.Client(api_key=api_key)
