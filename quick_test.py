#!/usr/bin/env python3
"""
Quick test for the specific failing endpoint
"""

import requests
import json

BACKEND_URL = "https://pokemon-market-12.preview.emergentagent.com/api"

def test_non_vip_without_photos():
    # First create a test card
    card_data = {
        'name': 'Test Card for Photo Validation',
        'price': 50.0,
        'reward': 10.0,
        'condition': 'Good'
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/cards", json=card_data, timeout=30)
        if response.status_code != 200:
            print(f"Failed to create test card: {response.status_code}")
            return
        
        card_id = response.json().get('id')
        print(f"Created test card with ID: {card_id}")
        
        # Test non-VIP without photos
        found_data = {
            'found_by': 'TestUser',
            'user_contact': '@testinsta',
            'is_vip': False
        }
        
        response = requests.post(f"{BACKEND_URL}/cards/{card_id}/found", json=found_data, timeout=30)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        
        if response.status_code == 400:
            print("✅ PASS: Correctly rejected non-VIP without photos")
        else:
            print(f"❌ FAIL: Expected 400, got {response.status_code}")
        
        # Cleanup
        requests.delete(f"{BACKEND_URL}/cards/{card_id}")
        print("Test card cleaned up")
        
    except requests.exceptions.Timeout:
        print("❌ FAIL: Request timed out")
    except requests.exceptions.RequestException as e:
        print(f"❌ FAIL: Request failed: {e}")
    except Exception as e:
        print(f"❌ FAIL: Unexpected error: {e}")

if __name__ == "__main__":
    test_non_vip_without_photos()