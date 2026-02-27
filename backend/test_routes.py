#!/usr/bin/env python3
"""Test if main module imports and has proper routes."""

import sys
sys.path.insert(0, '.')

try:
    from main import app
    print("✓ App imported successfully")
    print(f"✓ App has {len([r for r in app.routes if hasattr(r, 'path')])} routes")
    
    # Check auth router
    auth_routes = [r for r in app.routes if hasattr(r, 'path') and '/api/auth' in r.path]
    print(f"✓ Auth routes: {len(auth_routes)}")
    for r in auth_routes[:3]:
        print(f"  - {r.path}")
        
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
