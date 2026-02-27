#!/usr/bin/env python3
"""Debug script to test upload endpoint."""

import requests
import io

BASE = 'http://localhost:8000/api'

try:
    print('Testing login...')
    r = requests.post(
        f'{BASE}/auth/token',
        json={'username': 'admin', 'password': 'admin@gst123'},
        timeout=10
    )
    print(f'Login status: {r.status_code}')
    
    if r.status_code == 200:
        token = r.json()['access_token']
        print(f'✓ Token received: {token[:20]}...')
        
        print('\nTesting upload...')
        csv_data = b'''gstin,legal_name,state_code
10AABXZ0000A1Z0,Test Company,MH
10BBCXZ0000A1Z0,Another Co,DL'''
        
        files = {'file': ('test.csv', io.BytesIO(csv_data))}
        headers = {'Authorization': f'Bearer {token}'}
        
        r = requests.post(
            f'{BASE}/upload/taxpayers',
            files=files,
            headers=headers,
            timeout=10
        )
        print(f'✓ Upload status: {r.status_code}')
        print(f'Response:')
        print(r.text)
        
    else:
        print(f'✗ Login failed: {r.status_code}')
        print(f'Response: {r.text}')
        
except Exception as e:
    print(f'ERROR: {e}')
    import traceback
    traceback.print_exc()
