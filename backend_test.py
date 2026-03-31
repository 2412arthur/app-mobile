#!/usr/bin/env python3
"""
Backend API Testing for PokéCollection Push Notification Endpoints
Tests the new push token registration/removal endpoints and integration with validate/reject flows
"""

import asyncio
import httpx
import json
import os
from datetime import datetime
import base64

# Backend URL from environment
BACKEND_URL = "https://pokemon-market-12.preview.emergentagent.com/api"
ADMIN_PASSWORD = "1234"

class PushNotificationTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.test_results = []
        self.admin_user_id = None
        self.test_user_id = None
        self.test_card_id = None
        
    async def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = f"{status} {test_name}"
        if details:
            result += f" - {details}"
        print(result)
        self.test_results.append({
            'test': test_name,
            'success': success,
            'details': details
        })
        
    async def test_health_check(self):
        """Test basic health endpoint"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/health")
            success = response.status_code == 200
            await self.log_result("Health Check", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("Health Check", False, f"Error: {str(e)}")
            return False
            
    async def test_admin_auth(self):
        """Test admin authentication"""
        try:
            response = await self.client.post(f"{BACKEND_URL}/auth/admin", 
                                            json={"password": ADMIN_PASSWORD})
            success = response.status_code == 200 and response.json().get("is_admin") == True
            await self.log_result("Admin Authentication", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("Admin Authentication", False, f"Error: {str(e)}")
            return False
            
    async def create_test_user(self):
        """Create a test user for push notification testing"""
        try:
            user_data = {
                "name": "PushNotifUser",
                "contact": "@pushnotif"
            }
            response = await self.client.post(f"{BACKEND_URL}/auth/login", json=user_data)
            if response.status_code == 200:
                data = response.json()
                self.test_user_id = data.get("user_id")
                success = self.test_user_id is not None
                await self.log_result("Create Test User", success, 
                                    f"User ID: {self.test_user_id}")
                return success
            else:
                await self.log_result("Create Test User", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Create Test User", False, f"Error: {str(e)}")
            return False
            
    async def test_register_push_token(self):
        """Test POST /api/users/{user_id}/push-token"""
        if not self.test_user_id:
            await self.log_result("Register Push Token", False, "No test user available")
            return False
            
        try:
            token_data = {
                "push_token": "ExponentPushToken[test_token_123]"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/users/{self.test_user_id}/push-token",
                json=token_data
            )
            success = (response.status_code == 200 and 
                      response.json().get("message") == "Push token registered")
            await self.log_result("Register Push Token", success, 
                                f"Status: {response.status_code}, Response: {response.json()}")
            return success
        except Exception as e:
            await self.log_result("Register Push Token", False, f"Error: {str(e)}")
            return False
            
    async def test_verify_push_token_saved(self):
        """Verify push token is saved on user object via GET /api/users/{user_id}"""
        if not self.test_user_id:
            await self.log_result("Verify Push Token Saved", False, "No test user available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/users/{self.test_user_id}")
            if response.status_code == 200:
                user_data = response.json()
                push_token = user_data.get("push_token")
                success = push_token == "ExponentPushToken[test_token_123]"
                await self.log_result("Verify Push Token Saved", success, 
                                    f"Token: {push_token}")
                return success
            else:
                await self.log_result("Verify Push Token Saved", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Verify Push Token Saved", False, f"Error: {str(e)}")
            return False
            
    async def test_register_push_token_invalid_user(self):
        """Test push token registration with invalid user ID"""
        try:
            token_data = {
                "push_token": "ExponentPushToken[invalid_test]"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/users/invalid_user_id/push-token",
                json=token_data
            )
            success = response.status_code == 404
            await self.log_result("Register Push Token (Invalid User)", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("Register Push Token (Invalid User)", False, f"Error: {str(e)}")
            return False
            
    async def create_test_card(self):
        """Create a test card for photo submission testing"""
        try:
            card_data = {
                "name": "Test Pikachu Card",
                "price": 50.0,
                "reward": 25.0,
                "condition": "Mint",
                "tags": ["Pikachu", "Base Set"],
                "notes": "Test card for push notifications"
            }
            response = await self.client.post(f"{BACKEND_URL}/cards", json=card_data)
            if response.status_code == 200:
                card = response.json()
                self.test_card_id = card.get("id")
                success = self.test_card_id is not None
                await self.log_result("Create Test Card", success, 
                                    f"Card ID: {self.test_card_id}")
                return success
            else:
                await self.log_result("Create Test Card", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Create Test Card", False, f"Error: {str(e)}")
            return False
            
    async def test_mark_card_found_with_photos(self):
        """Mark test card as found with photos by test user"""
        if not self.test_card_id or not self.test_user_id:
            await self.log_result("Mark Card Found", False, "Missing test card or user")
            return False
            
        try:
            # Create dummy base64 images
            dummy_image = base64.b64encode(b"dummy_image_data").decode()
            
            found_data = {
                "found_by": "PushNotifUser",
                "user_contact": "@pushnotif",
                "is_vip": False,
                "front_image": f"data:image/jpeg;base64,{dummy_image}",
                "back_image": f"data:image/jpeg;base64,{dummy_image}"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/cards/{self.test_card_id}/found",
                json=found_data
            )
            success = response.status_code == 200
            await self.log_result("Mark Card Found", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("Mark Card Found", False, f"Error: {str(e)}")
            return False
            
    async def test_admin_validate_photo_with_push_notification(self):
        """Test admin validate photo and verify notification creation"""
        if not self.test_card_id:
            await self.log_result("Admin Validate Photo", False, "No test card available")
            return False
            
        try:
            # First get the card to find submission ID
            card_response = await self.client.get(f"{BACKEND_URL}/cards/{self.test_card_id}")
            if card_response.status_code != 200:
                await self.log_result("Admin Validate Photo", False, "Could not fetch card")
                return False
                
            card_data = card_response.json()
            submissions = card_data.get("photo_submissions", [])
            if not submissions:
                await self.log_result("Admin Validate Photo", False, "No photo submissions found")
                return False
                
            submission_id = submissions[0].get("id")
            if not submission_id:
                await self.log_result("Admin Validate Photo", False, "No submission ID found")
                return False
                
            # Validate the photo
            validate_data = {
                "submission_id": submission_id
            }
            response = await self.client.post(
                f"{BACKEND_URL}/cards/{self.test_card_id}/validate-photo",
                json=validate_data
            )
            success = response.status_code == 200
            await self.log_result("Admin Validate Photo", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("Admin Validate Photo", False, f"Error: {str(e)}")
            return False
            
    async def test_verify_notification_created(self):
        """Verify that notification was created for the user"""
        if not self.test_user_id:
            await self.log_result("Verify Notification Created", False, "No test user available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/users/{self.test_user_id}/notifications")
            if response.status_code == 200:
                notifications = response.json()
                success = len(notifications) > 0
                if success:
                    latest_notification = notifications[-1]
                    message = latest_notification.get("message", "")
                    notification_type = latest_notification.get("type", "")
                    success = "validée" in message and notification_type == "success"
                await self.log_result("Verify Notification Created", success, 
                                    f"Notifications count: {len(notifications)}")
                return success
            else:
                await self.log_result("Verify Notification Created", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Verify Notification Created", False, f"Error: {str(e)}")
            return False
            
    async def test_remove_push_token(self):
        """Test DELETE /api/users/{user_id}/push-token"""
        if not self.test_user_id:
            await self.log_result("Remove Push Token", False, "No test user available")
            return False
            
        try:
            response = await self.client.delete(f"{BACKEND_URL}/users/{self.test_user_id}/push-token")
            success = (response.status_code == 200 and 
                      response.json().get("message") == "Push token removed")
            await self.log_result("Remove Push Token", success, 
                                f"Status: {response.status_code}, Response: {response.json()}")
            return success
        except Exception as e:
            await self.log_result("Remove Push Token", False, f"Error: {str(e)}")
            return False
            
    async def test_verify_push_token_removed(self):
        """Verify push token is removed from user object"""
        if not self.test_user_id:
            await self.log_result("Verify Push Token Removed", False, "No test user available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/users/{self.test_user_id}")
            if response.status_code == 200:
                user_data = response.json()
                push_token = user_data.get("push_token")
                success = push_token is None
                await self.log_result("Verify Push Token Removed", success, 
                                    f"Token: {push_token}")
                return success
            else:
                await self.log_result("Verify Push Token Removed", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Verify Push Token Removed", False, f"Error: {str(e)}")
            return False
            
    async def test_existing_endpoints_still_working(self):
        """Quick test of existing endpoints to ensure nothing is broken"""
        tests = []
        
        # Test GET /api/cards
        try:
            response = await self.client.get(f"{BACKEND_URL}/cards")
            success = response.status_code == 200
            tests.append(("GET /api/cards", success))
        except Exception as e:
            tests.append(("GET /api/cards", False))
            
        # Test GET /api/stats
        try:
            response = await self.client.get(f"{BACKEND_URL}/stats")
            success = response.status_code == 200
            tests.append(("GET /api/stats", success))
        except Exception as e:
            tests.append(("GET /api/stats", False))
            
        # Test GET /api/health
        try:
            response = await self.client.get(f"{BACKEND_URL}/health")
            success = response.status_code == 200
            tests.append(("GET /api/health", success))
        except Exception as e:
            tests.append(("GET /api/health", False))
            
        all_success = all(success for _, success in tests)
        details = ", ".join([f"{name}: {'✅' if success else '❌'}" for name, success in tests])
        await self.log_result("Existing Endpoints Still Working", all_success, details)
        return all_success
        
    async def cleanup(self):
        """Clean up test data"""
        try:
            # Delete test card if created
            if self.test_card_id:
                await self.client.delete(f"{BACKEND_URL}/cards/{self.test_card_id}")
                
            # Delete test user if created
            if self.test_user_id:
                await self.client.delete(f"{BACKEND_URL}/users/{self.test_user_id}")
                
        except Exception as e:
            print(f"Cleanup error: {e}")
            
    async def run_all_tests(self):
        """Run all push notification tests"""
        print("🚀 Starting Push Notification Backend Tests")
        print("=" * 60)
        
        # Basic connectivity tests
        await self.test_health_check()
        await self.test_admin_auth()
        await self.test_existing_endpoints_still_working()
        
        # Create test user
        await self.create_test_user()
        
        # Push token registration tests
        await self.test_register_push_token()
        await self.test_verify_push_token_saved()
        await self.test_register_push_token_invalid_user()
        
        # Integration tests with photo validation
        await self.create_test_card()
        await self.test_mark_card_found_with_photos()
        await self.test_admin_validate_photo_with_push_notification()
        await self.test_verify_notification_created()
        
        # Push token removal tests
        await self.test_remove_push_token()
        await self.test_verify_push_token_removed()
        
        # Cleanup
        await self.cleanup()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result['success'])
        total = len(self.test_results)
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
                    
        await self.client.aclose()
        return success_rate >= 90  # Consider successful if 90%+ tests pass

async def main():
    """Main test runner"""
    tester = PushNotificationTester()
    success = await tester.run_all_tests()
    return success

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)