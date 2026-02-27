#!/usr/bin/env python3
"""Test backend endpoints."""

import requests
import time

time.sleep(3)  # Wait for servers to start

endpoints = [
    '/api/reconcile/stats',
    '/api/vendors/?limit=10',
    '/api/invoices/?page=1&per_page=10',
    '/api/graph/stats',
]

token = 'dummy-token'
headers = {'Authorization': f'Bearer {token}'}

print('\nTesting Backend Endpoints:')
print('-' * 60)

for endpoint in endpoints:
    try:
        r = requests.get(f'http://localhost:8000{endpoint}', headers=headers, timeout=3)
        status = f'{r.status_code}'
        print(f'{endpoint:50s} → {status}')
    except requests.exceptions.ConnectionError:
        print(f'{endpoint:50s} → CONNECTION REFUSED')
    except requests.exceptions.Timeout:
        print(f'{endpoint:50s} → TIMEOUT')
    except Exception as e:
        print(f'{endpoint:50s} → ERROR: {str(e)[:30]}')

print('-' * 60)
