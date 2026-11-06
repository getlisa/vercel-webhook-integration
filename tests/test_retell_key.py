"""The Retell API key comes only from RETELL_API_KEY, in both handlers.

Before: api/braconier.py and api/adaptiveclimate.py fell back to a key written in source,
in a public repository. After: no literal; an unset or blank variable skips the re-fetch.
Run with: python3 -m pytest tests/ -q
"""
import importlib.util
import io
import json
import os
import re
import subprocess
import urllib.error

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, 'api', filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


braconier = _load('braconier_key_test', 'braconier.py')
adaptive = _load('adaptive_key_test', 'adaptiveclimate.py')

HANDLERS = [
    pytest.param(braconier, braconier.extract_variables_v3, id='braconier'),
    pytest.param(adaptive, adaptive.extract_variables_v4, id='adaptiveclimate'),
]

# Missing every critical field and no analysis yet, so both handlers want to re-fetch.
INCOMPLETE = {'call_id': 'call_incomplete', 'collected_dynamic_variables': {}}

COMPLETE = {
    'call_id': 'call_incomplete',
    'from_number': '+13035551212',
    'collected_dynamic_variables': {'customerName': 'Dana Reyes', 'isitEmergency': 'TRUE'},
    'call_analysis': {'custom_analysis_data': {'customerName': 'Dana Reyes',
                                               'is_emergency': True}},
}


class _FakeRetell:
    """Stands in for urllib.request.urlopen and records every request it is handed."""

    def __init__(self, status=200, body=COMPLETE):
        self.status, self.body, self.requests = status, body, []

    def __call__(self, req, timeout=None, context=None):
        self.requests.append(req)
        if self.status != 200:
            raise urllib.error.HTTPError(req.full_url, self.status, 'error', None, None)
        return io.BytesIO(json.dumps(self.body).encode())


@pytest.fixture
def no_sleep(monkeypatch):
    slept = []
    monkeypatch.setattr(braconier.time, 'sleep', slept.append)
    monkeypatch.setattr(adaptive.time, 'sleep', slept.append)
    return slept


def test_no_retell_key_literal_in_api_source():
    leaks = []
    for name in sorted(os.listdir(os.path.join(REPO, 'api'))):
        if name.endswith('.py'):
            with open(os.path.join(REPO, 'api', name)) as fh:
                leaks += [f'{name}: {m}' for m in re.findall(r'key_[0-9a-f]{16,}', fh.read())]
    assert leaks == []


# A Retell API key is "key_" plus 28 hex characters.
RETELL_KEY = r'key_[0-9a-f]{28}'


def _git(*args):
    try:
        return subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True,
                              check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        pytest.skip('not inside a git checkout')


def test_no_retell_key_in_any_tracked_file():
    _git('rev-parse', '--git-dir')
    found = subprocess.run(['git', '-C', REPO, 'grep', '-lE', RETELL_KEY],
                           capture_output=True, text=True).stdout.split()
    assert found == []


def test_no_retell_key_anywhere_in_api_history():
    """The key was purged from every commit on this branch. A new one must not slip back in."""
    commits = _git('log', 'HEAD', '--format=%h', '-G', RETELL_KEY, '--', 'api/').split()
    assert commits == []


@pytest.mark.parametrize('module, extract', HANDLERS)
@pytest.mark.parametrize('value', [None, '', '   '])
def test_missing_key_skips_the_refetch(monkeypatch, no_sleep, capsys, module, extract, value):
    if value is None:
        monkeypatch.delenv('RETELL_API_KEY', raising=False)
    else:
        monkeypatch.setenv('RETELL_API_KEY', value)
    retell = _FakeRetell()
    monkeypatch.setattr(module.urllib.request, 'urlopen', retell)

    variables = extract(INCOMPLETE)
    call_data, result = module.ensure_complete_data(INCOMPLETE, variables)

    assert retell.requests == [], 'no request may go out without a key'
    assert no_sleep == [], 'no point waiting for a fetch that will not happen'
    assert call_data is INCOMPLETE and result is variables
    assert 'RETELL_API_KEY is not set' in capsys.readouterr().out


@pytest.mark.parametrize('module, extract', HANDLERS)
def test_env_key_is_sent_as_the_bearer_token(monkeypatch, no_sleep, module, extract):
    monkeypatch.setenv('RETELL_API_KEY', '  key_from_the_environment  ')
    retell = _FakeRetell()
    monkeypatch.setattr(module.urllib.request, 'urlopen', retell)

    call_data, result = module.ensure_complete_data(INCOMPLETE, extract(INCOMPLETE))

    assert len(retell.requests) == 1
    req = retell.requests[0]
    assert req.full_url == 'https://api.retellai.com/v2/get-call/call_incomplete'
    assert req.get_header('Authorization') == 'Bearer key_from_the_environment'
    assert call_data == COMPLETE
    assert result['customerName'] == 'Dana Reyes'
    assert result['isitEmergency'] == 'TRUE'


@pytest.mark.parametrize('module, extract', HANDLERS)
def test_complete_call_never_needs_a_key(monkeypatch, no_sleep, module, extract):
    monkeypatch.delenv('RETELL_API_KEY', raising=False)
    retell = _FakeRetell()
    monkeypatch.setattr(module.urllib.request, 'urlopen', retell)

    variables = extract(COMPLETE)
    call_data, result = module.ensure_complete_data(COMPLETE, variables)

    assert retell.requests == [] and no_sleep == []
    assert call_data is COMPLETE and result is variables


@pytest.mark.parametrize('module, extract', HANDLERS)
def test_a_rejected_env_key_returns_the_original_data(monkeypatch, no_sleep, module, extract):
    monkeypatch.setenv('RETELL_API_KEY', 'key_revoked')
    retell = _FakeRetell(status=401)
    monkeypatch.setattr(module.urllib.request, 'urlopen', retell)

    variables = extract(INCOMPLETE)
    call_data, result = module.ensure_complete_data(INCOMPLETE, variables)

    assert call_data is INCOMPLETE and result is variables
    assert all(r.get_header('Authorization') == 'Bearer key_revoked' for r in retell.requests)
