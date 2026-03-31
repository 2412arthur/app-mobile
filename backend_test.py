#!/usr/bin/env python3
"""
Comprehensive backend API testing for PokéCollection Pokémon card management app
Tests all endpoints with realistic data and scenarios
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Backend URL from environment
BACKEND_URL = "https://pokemon-market-12.preview.emergentagent.com/api"

# Test credentials
ADMIN_PASSWORD = "1234"
TEST_USER_NAME = "TestUser"
TEST_USER_CONTACT = "@testinsta"
VIP_USER_NAME = "VIPUser"
VIP_USER_CONTACT = "@vipuser"

# Test data
TEST_BASE64_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_authenticated = False
        self.test_user_id = None
        self.vip_user_id = None
        self.test_card_id = None
        self.test_tag_id = None
        self.test_submission_id = None
        self.results = []
        
    def log_result(self, test_name, success, message="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        self.results.append({
            'test': test_name,
            'success': success,
            'message': message,
            'response_data': response_data
        })
        
    def make_request(self, method, endpoint, data=None, params=None):
        """Make HTTP request with error handling"""
        url = f"{BACKEND_URL}{endpoint}"
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, params=params)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data, params=params)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, params=params)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except Exception as e:
            print(f"Request failed: {e}")
            return None
    
    def test_health_check(self):
        """Test health endpoint"""
        response = self.make_request('GET', '/health')
        if response and response.status_code == 200:
            data = response.json()
            self.log_result("Health Check", True, f"Status: {data.get('status')}")
        else:
            self.log_result("Health Check", False, f"Status code: {response.status_code if response else 'No response'}")
    
    def test_admin_auth(self):
        """Test admin authentication"""
        # Test correct password
        response = self.make_request('POST', '/auth/admin', {'password': ADMIN_PASSWORD})
        if response and response.status_code == 200:
            data = response.json()
            if data.get('is_admin') == True:
                self.admin_authenticated = True
                self.log_result("Admin Auth - Correct Password", True, "Admin authenticated successfully")
            else:
                self.log_result("Admin Auth - Correct Password", False, "is_admin should be True")
        else:
            self.log_result("Admin Auth - Correct Password", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test wrong password
        response = self.make_request('POST', '/auth/admin', {'password': 'wrong'})
        if response and response.status_code == 200:
            data = response.json()
            if data.get('is_admin') == False:
                self.log_result("Admin Auth - Wrong Password", True, "Correctly rejected wrong password")
            else:
                self.log_result("Admin Auth - Wrong Password", False, "Should reject wrong password")
        else:
            self.log_result("Admin Auth - Wrong Password", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_team_auth(self):
        """Test team authentication and user creation"""
        # Test team login (creates user)
        auth_data = {
            'name': TEST_USER_NAME,
            'contact': TEST_USER_CONTACT
        }
        response = self.make_request('POST', '/auth/login', auth_data)
        if response and response.status_code == 200:
            data = response.json()
            if data.get('role') == 'team' and data.get('user_id'):
                self.test_user_id = data['user_id']
                self.log_result("Team Auth - User Creation", True, f"User created with ID: {self.test_user_id}")
            else:
                self.log_result("Team Auth - User Creation", False, f"Expected team role, got: {data}")
        else:
            self.log_result("Team Auth - User Creation", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test VIP user creation
        vip_auth_data = {
            'name': VIP_USER_NAME,
            'contact': VIP_USER_CONTACT
        }
        response = self.make_request('POST', '/auth/login', vip_auth_data)
        if response and response.status_code == 200:
            data = response.json()
            if data.get('user_id'):
                self.vip_user_id = data['user_id']
                self.log_result("VIP User Creation", True, f"VIP user created with ID: {self.vip_user_id}")
            else:
                self.log_result("VIP User Creation", False, f"No user_id returned: {data}")
        else:
            self.log_result("VIP User Creation", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_user_management(self):
        """Test user management endpoints"""
        if not self.test_user_id:
            self.log_result("User Management", False, "No test user ID available")
            return
        
        # Test get all users
        response = self.make_request('GET', '/users')
        if response and response.status_code == 200:
            users = response.json()
            if isinstance(users, list) and len(users) > 0:
                self.log_result("Get All Users", True, f"Retrieved {len(users)} users")
            else:
                self.log_result("Get All Users", False, "No users returned")
        else:
            self.log_result("Get All Users", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test get specific user
        response = self.make_request('GET', f'/users/{self.test_user_id}')
        if response and response.status_code == 200:
            user = response.json()
            if user.get('name') == TEST_USER_NAME:
                self.log_result("Get Specific User", True, f"User profile retrieved with rewards tracking")
            else:
                self.log_result("Get Specific User", False, f"Wrong user data: {user}")
        else:
            self.log_result("Get Specific User", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test update user
        update_data = {
            'paypal': 'test@paypal.com'
        }
        response = self.make_request('PUT', f'/users/{self.test_user_id}', update_data)
        if response and response.status_code == 200:
            user = response.json()
            if user.get('paypal') == 'test@paypal.com':
                self.log_result("Update User", True, "PayPal info updated successfully")
            else:
                self.log_result("Update User", False, f"PayPal not updated: {user}")
        else:
            self.log_result("Update User", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test change user role to VIP
        if self.vip_user_id:
            response = self.make_request('PUT', f'/users/{self.vip_user_id}/role', params={'role': 'vip'})
            if response and response.status_code == 200:
                self.log_result("Change User Role to VIP", True, "Role updated to VIP")
            else:
                self.log_result("Change User Role to VIP", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_tags_crud(self):
        """Test tags CRUD operations"""
        # Create tag
        tag_data = {
            'name': 'Rare',
            'color': '#ff0000'
        }
        response = self.make_request('POST', '/tags', tag_data)
        if response and response.status_code == 200:
            tag = response.json()
            if tag.get('name') == 'Rare':
                self.test_tag_id = tag.get('id')
                self.log_result("Create Tag", True, f"Tag created with ID: {self.test_tag_id}")
            else:
                self.log_result("Create Tag", False, f"Wrong tag data: {tag}")
        else:
            self.log_result("Create Tag", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Get all tags
        response = self.make_request('GET', '/tags')
        if response and response.status_code == 200:
            tags = response.json()
            if isinstance(tags, list):
                self.log_result("Get All Tags", True, f"Retrieved {len(tags)} tags")
            else:
                self.log_result("Get All Tags", False, "Invalid tags response")
        else:
            self.log_result("Get All Tags", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_cards_crud(self):
        """Test cards CRUD operations"""
        # Create card
        deadline = (datetime.utcnow() + timedelta(days=3)).isoformat()
        card_data = {
            'name': 'Charizard Base Set',
            'price': 150.0,
            'reward': 25.0,
            'condition': 'Near Mint',
            'tags': ['Rare', 'Base Set'],
            'notes': 'Looking for shadowless version',
            'deadline': deadline
        }
        response = self.make_request('POST', '/cards', card_data)
        if response and response.status_code == 200:
            card = response.json()
            if card.get('name') == 'Charizard Base Set':
                self.test_card_id = card.get('id')
                self.log_result("Create Card", True, f"Card created with ID: {self.test_card_id}")
            else:
                self.log_result("Create Card", False, f"Wrong card data: {card}")
        else:
            self.log_result("Create Card", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Get all cards
        response = self.make_request('GET', '/cards')
        if response and response.status_code == 200:
            cards = response.json()
            if isinstance(cards, list):
                self.log_result("Get All Cards", True, f"Retrieved {len(cards)} cards")
            else:
                self.log_result("Get All Cards", False, "Invalid cards response")
        else:
            self.log_result("Get All Cards", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test cards with filters
        response = self.make_request('GET', '/cards', params={'condition': 'Near Mint'})
        if response and response.status_code == 200:
            self.log_result("Get Cards with Filter", True, "Filter by condition working")
        else:
            self.log_result("Get Cards with Filter", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Get specific card
        if self.test_card_id:
            response = self.make_request('GET', f'/cards/{self.test_card_id}')
            if response and response.status_code == 200:
                card = response.json()
                if card.get('name') == 'Charizard Base Set':
                    self.log_result("Get Specific Card", True, "Card retrieved successfully")
                else:
                    self.log_result("Get Specific Card", False, f"Wrong card: {card}")
            else:
                self.log_result("Get Specific Card", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Update card
        if self.test_card_id:
            update_data = {
                'price': 175.0,
                'notes': 'Updated price due to market conditions'
            }
            response = self.make_request('PUT', f'/cards/{self.test_card_id}', update_data)
            if response and response.status_code == 200:
                card = response.json()
                if card.get('price') == 175.0:
                    self.log_result("Update Card", True, "Card updated successfully")
                else:
                    self.log_result("Update Card", False, f"Price not updated: {card}")
            else:
                self.log_result("Update Card", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_photo_submission_flow(self):
        """Test the critical photo submission flow"""
        if not self.test_card_id or not self.test_user_id:
            self.log_result("Photo Submission Flow", False, "Missing test card or user ID")
            return
        
        # Test non-VIP marking found WITHOUT photos (should fail)
        found_data_no_photos = {
            'found_by': TEST_USER_NAME,
            'user_contact': TEST_USER_CONTACT,
            'is_vip': False
        }
        response = self.make_request('POST', f'/cards/{self.test_card_id}/found', found_data_no_photos)
        if response and response.status_code == 400:
            self.log_result("Non-VIP Without Photos", True, "Correctly rejected non-VIP without photos")
        else:
            self.log_result("Non-VIP Without Photos", False, f"Should return 400, got: {response.status_code if response else 'No response'}")
        
        # Test non-VIP marking found WITH photos (should succeed)
        found_data_with_photos = {
            'found_by': TEST_USER_NAME,
            'user_contact': TEST_USER_CONTACT,
            'is_vip': False,
            'front_image': TEST_BASE64_IMAGE,
            'back_image': TEST_BASE64_IMAGE
        }
        response = self.make_request('POST', f'/cards/{self.test_card_id}/found', found_data_with_photos)
        if response and response.status_code == 200:
            card = response.json()
            if card.get('found') == True and len(card.get('photo_submissions', [])) > 0:
                self.test_submission_id = card['photo_submissions'][0]['id']
                self.log_result("Non-VIP With Photos", True, f"Card marked found with submission ID: {self.test_submission_id}")
            else:
                self.log_result("Non-VIP With Photos", False, f"Card not properly marked: {card}")
        else:
            self.log_result("Non-VIP With Photos", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test VIP marking found without photos (should succeed)
        if self.vip_user_id:
            # Create another card for VIP test
            vip_card_data = {
                'name': 'Blastoise Base Set',
                'price': 120.0,
                'reward': 20.0,
                'condition': 'Excellent',
                'tags': ['Base Set']
            }
            response = self.make_request('POST', '/cards', vip_card_data)
            if response and response.status_code == 200:
                vip_card_id = response.json().get('id')
                
                vip_found_data = {
                    'found_by': VIP_USER_NAME,
                    'user_contact': VIP_USER_CONTACT,
                    'is_vip': True
                }
                response = self.make_request('POST', f'/cards/{vip_card_id}/found', vip_found_data)
                if response and response.status_code == 200:
                    card = response.json()
                    if card.get('found') == True and card.get('validated') == True:
                        self.log_result("VIP Without Photos", True, "VIP can mark found without photos and auto-validate")
                    else:
                        self.log_result("VIP Without Photos", False, f"VIP card not properly processed: {card}")
                else:
                    self.log_result("VIP Without Photos", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_photo_validation_rejection(self):
        """Test photo validation and rejection by admin"""
        if not self.test_card_id or not self.test_submission_id:
            self.log_result("Photo Validation/Rejection", False, "Missing test card or submission ID")
            return
        
        # Test validate photo submission
        validate_data = {
            'submission_id': self.test_submission_id
        }
        response = self.make_request('POST', f'/cards/{self.test_card_id}/validate-photo', validate_data)
        if response and response.status_code == 200:
            card = response.json()
            if card.get('validated') == True:
                self.log_result("Validate Photo Submission", True, "Photo submission validated successfully")
            else:
                self.log_result("Validate Photo Submission", False, f"Card not validated: {card}")
        else:
            self.log_result("Validate Photo Submission", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Create another card and submission for rejection test
        reject_card_data = {
            'name': 'Venusaur Base Set',
            'price': 100.0,
            'reward': 15.0,
            'condition': 'Good'
        }
        response = self.make_request('POST', '/cards', reject_card_data)
        if response and response.status_code == 200:
            reject_card_id = response.json().get('id')
            
            # Mark as found with photos
            found_data = {
                'found_by': TEST_USER_NAME,
                'user_contact': TEST_USER_CONTACT,
                'is_vip': False,
                'front_image': TEST_BASE64_IMAGE,
                'back_image': TEST_BASE64_IMAGE
            }
            response = self.make_request('POST', f'/cards/{reject_card_id}/found', found_data)
            if response and response.status_code == 200:
                card = response.json()
                reject_submission_id = card['photo_submissions'][0]['id']
                
                # Test reject photo submission
                reject_data = {
                    'submission_id': reject_submission_id,
                    'reason': 'Photos are blurry, please resubmit with clearer images'
                }
                response = self.make_request('POST', f'/cards/{reject_card_id}/reject-photo', reject_data)
                if response and response.status_code == 200:
                    card = response.json()
                    rejected_submission = next((s for s in card.get('photo_submissions', []) if s['id'] == reject_submission_id), None)
                    if rejected_submission and rejected_submission.get('rejected') == True:
                        self.log_result("Reject Photo Submission", True, "Photo submission rejected with reason")
                    else:
                        self.log_result("Reject Photo Submission", False, f"Submission not properly rejected: {card}")
                else:
                    self.log_result("Reject Photo Submission", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_resubmit_photos(self):
        """Test photo resubmission endpoint"""
        if not self.test_card_id:
            self.log_result("Photo Resubmission", False, "Missing test card ID")
            return
        
        resubmit_data = {
            'front_image': TEST_BASE64_IMAGE,
            'back_image': TEST_BASE64_IMAGE,
            'submitted_by': TEST_USER_NAME,
            'user_contact': TEST_USER_CONTACT
        }
        response = self.make_request('POST', f'/cards/{self.test_card_id}/submit-photos', resubmit_data)
        if response and response.status_code == 200:
            card = response.json()
            if len(card.get('photo_submissions', [])) > 1:  # Should have multiple submissions now
                self.log_result("Photo Resubmission", True, "Photos resubmitted successfully")
            else:
                self.log_result("Photo Resubmission", False, f"Resubmission not added: {card}")
        else:
            self.log_result("Photo Resubmission", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_unfound_card(self):
        """Test marking card as unfound"""
        if not self.test_card_id:
            self.log_result("Mark Card Unfound", False, "Missing test card ID")
            return
        
        response = self.make_request('POST', f'/cards/{self.test_card_id}/unfound')
        if response and response.status_code == 200:
            card = response.json()
            if card.get('found') == False and len(card.get('photo_submissions', [])) == 0:
                self.log_result("Mark Card Unfound", True, "Card reset to unfound state")
            else:
                self.log_result("Mark Card Unfound", False, f"Card not properly reset: {card}")
        else:
            self.log_result("Mark Card Unfound", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_notifications(self):
        """Test notifications endpoints"""
        if not self.test_user_id:
            self.log_result("Notifications", False, "Missing test user ID")
            return
        
        # Get notifications
        response = self.make_request('GET', f'/users/{self.test_user_id}/notifications')
        if response and response.status_code == 200:
            notifications = response.json()
            if isinstance(notifications, list):
                self.log_result("Get Notifications", True, f"Retrieved {len(notifications)} notifications")
                
                # Clear notifications
                response = self.make_request('DELETE', f'/users/{self.test_user_id}/notifications')
                if response and response.status_code == 200:
                    self.log_result("Clear Notifications", True, "Notifications cleared successfully")
                else:
                    self.log_result("Clear Notifications", False, f"Status: {response.status_code if response else 'No response'}")
            else:
                self.log_result("Get Notifications", False, "Invalid notifications response")
        else:
            self.log_result("Get Notifications", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_stats_dashboard(self):
        """Test stats dashboard endpoint"""
        response = self.make_request('GET', '/stats')
        if response and response.status_code == 200:
            stats = response.json()
            required_fields = ['total', 'found', 'validated', 'pending_validation', 'pending', 'found_today', 'urgent', 'top_hunters']
            if all(field in stats for field in required_fields):
                self.log_result("Stats Dashboard", True, f"All stats fields present: {stats}")
            else:
                missing = [f for f in required_fields if f not in stats]
                self.log_result("Stats Dashboard", False, f"Missing fields: {missing}")
        else:
            self.log_result("Stats Dashboard", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_pending_validation_filter(self):
        """Test pending validation filter"""
        response = self.make_request('GET', '/cards', params={'pending_validation': True})
        if response and response.status_code == 200:
            cards = response.json()
            self.log_result("Pending Validation Filter", True, f"Retrieved {len(cards)} pending validation cards")
        else:
            self.log_result("Pending Validation Filter", False, f"Status: {response.status_code if response else 'No response'}")
    
    def cleanup_test_data(self):
        """Clean up test data"""
        # Delete test card
        if self.test_card_id:
            response = self.make_request('DELETE', f'/cards/{self.test_card_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup - Delete Test Card", True, "Test card deleted")
        
        # Delete test tag
        if self.test_tag_id:
            response = self.make_request('DELETE', f'/tags/{self.test_tag_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup - Delete Test Tag", True, "Test tag deleted")
        
        # Delete test users
        if self.test_user_id:
            response = self.make_request('DELETE', f'/users/{self.test_user_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup - Delete Test User", True, "Test user deleted")
        
        if self.vip_user_id:
            response = self.make_request('DELETE', f'/users/{self.vip_user_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup - Delete VIP User", True, "VIP user deleted")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting comprehensive backend API testing...")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        # Core functionality tests
        self.test_health_check()
        self.test_admin_auth()
        self.test_team_auth()
        self.test_user_management()
        self.test_tags_crud()
        self.test_cards_crud()
        
        # Critical photo flow tests
        self.test_photo_submission_flow()
        self.test_photo_validation_rejection()
        self.test_resubmit_photos()
        self.test_unfound_card()
        
        # Additional features
        self.test_notifications()
        self.test_stats_dashboard()
        self.test_pending_validation_filter()
        
        # Cleanup
        self.cleanup_test_data()
        
        # Summary
        print("=" * 80)
        print("📊 TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for r in self.results if r['success'])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['message']}")
        
        return passed == total

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)