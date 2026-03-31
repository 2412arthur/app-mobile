#!/usr/bin/env python3
"""
Comprehensive Backend Regression Test for PokéCollection
Tests all 25 endpoints after major backend refactoring and new features
Focus: Verify nothing is broken, test image storage migration (base64 → files)
"""

import asyncio
import httpx
import json
import os
import base64
from datetime import datetime
import uuid

# Backend URL from frontend environment
BACKEND_URL = "https://pokemon-market-12.preview.emergentagent.com/api"
ADMIN_PASSWORD = "1234"

class ComprehensiveRegressionTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.test_results = []
        self.test_user_id = None
        self.test_card_id = None
        self.test_tag_id = None
        self.submission_id = None
        
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
        
    # Test 1: GET /api/health
    async def test_health_check(self):
        """Test basic health endpoint"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/health")
            success = response.status_code == 200
            data = response.json() if success else {}
            await self.log_result("1. GET /api/health", success, 
                                f"Status: {response.status_code}, Response: {data}")
            return success
        except Exception as e:
            await self.log_result("1. GET /api/health", False, f"Error: {str(e)}")
            return False
            
    # Test 2: POST /api/auth/admin
    async def test_admin_auth(self):
        """Test admin authentication"""
        try:
            response = await self.client.post(f"{BACKEND_URL}/auth/admin", 
                                            json={"password": ADMIN_PASSWORD})
            success = response.status_code == 200 and response.json().get("is_admin") == True
            await self.log_result("2. POST /api/auth/admin", success, 
                                f"Status: {response.status_code}, is_admin: {response.json().get('is_admin') if response.status_code == 200 else 'N/A'}")
            return success
        except Exception as e:
            await self.log_result("2. POST /api/auth/admin", False, f"Error: {str(e)}")
            return False
            
    # Test 3: POST /api/auth/login
    async def test_team_login(self):
        """Test team login and create test user"""
        try:
            user_data = {
                "name": "RegTestUser",
                "contact": "@regtest"
            }
            response = await self.client.post(f"{BACKEND_URL}/auth/login", json=user_data)
            if response.status_code == 200:
                data = response.json()
                self.test_user_id = data.get("user_id")
                success = self.test_user_id is not None
                await self.log_result("3. POST /api/auth/login", success, 
                                    f"Status: {response.status_code}, User ID: {self.test_user_id}")
                return success
            else:
                await self.log_result("3. POST /api/auth/login", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("3. POST /api/auth/login", False, f"Error: {str(e)}")
            return False
            
    # Test 4: GET /api/cards (with pagination)
    async def test_get_cards_pagination(self):
        """Test GET /api/cards with pagination parameters"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/cards?skip=0&limit=5")
            success = response.status_code == 200
            data = response.json() if success else []
            await self.log_result("4. GET /api/cards (pagination)", success, 
                                f"Status: {response.status_code}, Cards returned: {len(data) if isinstance(data, list) else 'N/A'}")
            return success
        except Exception as e:
            await self.log_result("4. GET /api/cards (pagination)", False, f"Error: {str(e)}")
            return False
            
    # Test 5: GET /api/cards/count
    async def test_get_cards_count(self):
        """Test GET /api/cards/count endpoint"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/cards/count")
            success = response.status_code == 200
            data = response.json() if success else {}
            count = data.get("total") if success else "N/A"  # Fixed: was checking "count" instead of "total"
            await self.log_result("5. GET /api/cards/count", success, 
                                f"Status: {response.status_code}, Count: {count}")
            return success
        except Exception as e:
            await self.log_result("5. GET /api/cards/count", False, f"Error: {str(e)}")
            return False
            
    # Test 6: POST /api/cards
    async def test_create_card(self):
        """Test POST /api/cards - create test card"""
        try:
            card_data = {
                "name": "TestCard",
                "price": 50,
                "reward": 10,
                "condition": "Mint",
                "tags": ["Test"],
                "notes": "Regression test card"
            }
            response = await self.client.post(f"{BACKEND_URL}/cards", json=card_data)
            if response.status_code == 200:
                card = response.json()
                self.test_card_id = card.get("id")
                success = self.test_card_id is not None
                await self.log_result("6. POST /api/cards", success, 
                                    f"Status: {response.status_code}, Card ID: {self.test_card_id}")
                return success
            else:
                await self.log_result("6. POST /api/cards", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("6. POST /api/cards", False, f"Error: {str(e)}")
            return False
            
    # Test 7: GET /api/cards/{id}
    async def test_get_card_by_id(self):
        """Test GET /api/cards/{id}"""
        if not self.test_card_id:
            await self.log_result("7. GET /api/cards/{id}", False, "No test card available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/cards/{self.test_card_id}")
            success = response.status_code == 200
            data = response.json() if success else {}
            card_name = data.get("name") if success else "N/A"
            await self.log_result("7. GET /api/cards/{id}", success, 
                                f"Status: {response.status_code}, Card name: {card_name}")
            return success
        except Exception as e:
            await self.log_result("7. GET /api/cards/{id}", False, f"Error: {str(e)}")
            return False
            
    # Test 8: PUT /api/cards/{id}
    async def test_update_card(self):
        """Test PUT /api/cards/{id}"""
        if not self.test_card_id:
            await self.log_result("8. PUT /api/cards/{id}", False, "No test card available")
            return False
            
        try:
            update_data = {
                "name": "UpdatedCard"
            }
            response = await self.client.put(f"{BACKEND_URL}/cards/{self.test_card_id}", 
                                           json=update_data)
            success = response.status_code == 200
            await self.log_result("8. PUT /api/cards/{id}", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("8. PUT /api/cards/{id}", False, f"Error: {str(e)}")
            return False
            
    # Test 9: POST /api/cards/{id}/found (CRITICAL - Image Storage Migration Test)
    async def test_mark_card_found_with_images(self):
        """Test POST /api/cards/{id}/found - CRITICAL: Verify image storage migration"""
        if not self.test_card_id or not self.test_user_id:
            await self.log_result("9. POST /api/cards/{id}/found", False, "Missing test card or user")
            return False
            
        try:
            # Create realistic base64 image data (small JPEG)
            dummy_jpeg = base64.b64encode(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9').decode()
            
            found_data = {
                "found_by": "RegTestUser",
                "user_contact": "@regtest",
                "is_vip": False,
                "front_image": f"data:image/jpeg;base64,{dummy_jpeg}",
                "back_image": f"data:image/jpeg;base64,{dummy_jpeg}"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/cards/{self.test_card_id}/found",
                json=found_data
            )
            success = response.status_code == 200
            await self.log_result("9. POST /api/cards/{id}/found", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("9. POST /api/cards/{id}/found", False, f"Error: {str(e)}")
            return False
            
    # Test 10: Verify image storage migration (CRITICAL)
    async def test_verify_image_storage_migration(self):
        """CRITICAL: Verify images are stored as /api/uploads/ URLs, NOT base64"""
        if not self.test_card_id:
            await self.log_result("10. Verify Image Storage Migration", False, "No test card available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/cards/{self.test_card_id}")
            if response.status_code == 200:
                card_data = response.json()
                submissions = card_data.get("photo_submissions", [])
                
                if not submissions:
                    await self.log_result("10. Verify Image Storage Migration", False, "No photo submissions found")
                    return False
                    
                submission = submissions[0]
                front_image = submission.get("front_image", "")
                back_image = submission.get("back_image", "")
                
                # Check if images are URLs (not base64)
                front_is_url = front_image.startswith("/api/uploads/") or front_image.startswith("http")
                back_is_url = back_image.startswith("/api/uploads/") or back_image.startswith("http")
                front_not_base64 = not front_image.startswith("data:image")
                back_not_base64 = not back_image.startswith("data:image")
                
                success = front_is_url and back_is_url and front_not_base64 and back_not_base64
                
                if submission:
                    self.submission_id = submission.get("id")
                
                await self.log_result("10. Verify Image Storage Migration", success, 
                                    f"Front: {front_image[:50]}{'...' if len(front_image) > 50 else ''}, Back: {back_image[:50]}{'...' if len(back_image) > 50 else ''}")
                return success
            else:
                await self.log_result("10. Verify Image Storage Migration", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("10. Verify Image Storage Migration", False, f"Error: {str(e)}")
            return False
            
    # Test 11: POST /api/cards/{id}/validate-photo
    async def test_validate_photo(self):
        """Test POST /api/cards/{id}/validate-photo"""
        if not self.test_card_id or not self.submission_id:
            await self.log_result("11. POST /api/cards/{id}/validate-photo", False, "Missing card or submission ID")
            return False
            
        try:
            validate_data = {
                "submission_id": self.submission_id
            }
            response = await self.client.post(
                f"{BACKEND_URL}/cards/{self.test_card_id}/validate-photo",
                json=validate_data
            )
            success = response.status_code == 200
            await self.log_result("11. POST /api/cards/{id}/validate-photo", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("11. POST /api/cards/{id}/validate-photo", False, f"Error: {str(e)}")
            return False
            
    # Test 12: POST /api/cards/{id}/reject-photo
    async def test_reject_photo(self):
        """Test POST /api/cards/{id}/reject-photo"""
        if not self.test_card_id:
            await self.log_result("12. POST /api/cards/{id}/reject-photo", False, "No test card available")
            return False
            
        # First create another submission to reject
        try:
            dummy_jpeg = base64.b64encode(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9').decode()
            
            # Submit another photo to reject
            submit_data = {
                "front_image": f"data:image/jpeg;base64,{dummy_jpeg}",
                "back_image": f"data:image/jpeg;base64,{dummy_jpeg}",
                "submitted_by": "RegTestUser",
                "user_contact": "@regtest"
            }
            submit_response = await self.client.post(
                f"{BACKEND_URL}/cards/{self.test_card_id}/submit-photos",
                json=submit_data
            )
            
            if submit_response.status_code == 200:
                # Get the new submission ID
                card_response = await self.client.get(f"{BACKEND_URL}/cards/{self.test_card_id}")
                if card_response.status_code == 200:
                    card_data = card_response.json()
                    submissions = card_data.get("photo_submissions", [])
                    if len(submissions) > 1:
                        new_submission_id = submissions[-1].get("id")  # Get the latest submission
                        
                        # Now reject it
                        reject_data = {
                            "submission_id": new_submission_id,
                            "reason": "Bad quality"
                        }
                        response = await self.client.post(
                            f"{BACKEND_URL}/cards/{self.test_card_id}/reject-photo",
                            json=reject_data
                        )
                        success = response.status_code == 200
                        await self.log_result("12. POST /api/cards/{id}/reject-photo", success, 
                                            f"Status: {response.status_code}")
                        return success
                        
            await self.log_result("12. POST /api/cards/{id}/reject-photo", False, "Could not create submission to reject")
            return False
        except Exception as e:
            await self.log_result("12. POST /api/cards/{id}/reject-photo", False, f"Error: {str(e)}")
            return False
            
    # Test 13: GET /api/users
    async def test_get_users(self):
        """Test GET /api/users"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/users")
            success = response.status_code == 200
            data = response.json() if success else []
            await self.log_result("13. GET /api/users", success, 
                                f"Status: {response.status_code}, Users count: {len(data) if isinstance(data, list) else 'N/A'}")
            return success
        except Exception as e:
            await self.log_result("13. GET /api/users", False, f"Error: {str(e)}")
            return False
            
    # Test 14: GET /api/users/{id}
    async def test_get_user_by_id(self):
        """Test GET /api/users/{id}"""
        if not self.test_user_id:
            await self.log_result("14. GET /api/users/{id}", False, "No test user available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/users/{self.test_user_id}")
            success = response.status_code == 200
            data = response.json() if success else {}
            user_name = data.get("name") if success else "N/A"
            await self.log_result("14. GET /api/users/{id}", success, 
                                f"Status: {response.status_code}, User name: {user_name}")
            return success
        except Exception as e:
            await self.log_result("14. GET /api/users/{id}", False, f"Error: {str(e)}")
            return False
            
    # Test 15: PUT /api/users/{id}/role
    async def test_update_user_role(self):
        """Test PUT /api/users/{id}/role"""
        if not self.test_user_id:
            await self.log_result("15. PUT /api/users/{id}/role", False, "No test user available")
            return False
            
        try:
            response = await self.client.put(f"{BACKEND_URL}/users/{self.test_user_id}/role?role=vip")
            success = response.status_code == 200
            await self.log_result("15. PUT /api/users/{id}/role", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("15. PUT /api/users/{id}/role", False, f"Error: {str(e)}")
            return False
            
    # Test 16: POST /api/users/{id}/push-token
    async def test_register_push_token(self):
        """Test POST /api/users/{id}/push-token"""
        if not self.test_user_id:
            await self.log_result("16. POST /api/users/{id}/push-token", False, "No test user available")
            return False
            
        try:
            token_data = {
                "push_token": "ExponentPushToken[regtest]"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/users/{self.test_user_id}/push-token",
                json=token_data
            )
            success = response.status_code == 200
            await self.log_result("16. POST /api/users/{id}/push-token", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("16. POST /api/users/{id}/push-token", False, f"Error: {str(e)}")
            return False
            
    # Test 17: GET /api/users/{id}/notifications
    async def test_get_user_notifications(self):
        """Test GET /api/users/{id}/notifications"""
        if not self.test_user_id:
            await self.log_result("17. GET /api/users/{id}/notifications", False, "No test user available")
            return False
            
        try:
            response = await self.client.get(f"{BACKEND_URL}/users/{self.test_user_id}/notifications")
            success = response.status_code == 200
            data = response.json() if success else []
            await self.log_result("17. GET /api/users/{id}/notifications", success, 
                                f"Status: {response.status_code}, Notifications: {len(data) if isinstance(data, list) else 'N/A'}")
            return success
        except Exception as e:
            await self.log_result("17. GET /api/users/{id}/notifications", False, f"Error: {str(e)}")
            return False
            
    # Test 18: DELETE /api/users/{id}/notifications
    async def test_clear_user_notifications(self):
        """Test DELETE /api/users/{id}/notifications"""
        if not self.test_user_id:
            await self.log_result("18. DELETE /api/users/{id}/notifications", False, "No test user available")
            return False
            
        try:
            response = await self.client.delete(f"{BACKEND_URL}/users/{self.test_user_id}/notifications")
            success = response.status_code == 200
            await self.log_result("18. DELETE /api/users/{id}/notifications", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("18. DELETE /api/users/{id}/notifications", False, f"Error: {str(e)}")
            return False
            
    # Test 19: DELETE /api/users/{id}/push-token
    async def test_remove_push_token(self):
        """Test DELETE /api/users/{id}/push-token"""
        if not self.test_user_id:
            await self.log_result("19. DELETE /api/users/{id}/push-token", False, "No test user available")
            return False
            
        try:
            response = await self.client.delete(f"{BACKEND_URL}/users/{self.test_user_id}/push-token")
            success = response.status_code == 200
            await self.log_result("19. DELETE /api/users/{id}/push-token", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("19. DELETE /api/users/{id}/push-token", False, f"Error: {str(e)}")
            return False
            
    # Test 20: GET /api/stats
    async def test_get_stats(self):
        """Test GET /api/stats"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/stats")
            success = response.status_code == 200
            data = response.json() if success else {}
            total = data.get("total") if success else "N/A"
            await self.log_result("20. GET /api/stats", success, 
                                f"Status: {response.status_code}, Total cards: {total}")
            return success
        except Exception as e:
            await self.log_result("20. GET /api/stats", False, f"Error: {str(e)}")
            return False
            
    # Test 21: GET /api/tags
    async def test_get_tags(self):
        """Test GET /api/tags"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/tags")
            success = response.status_code == 200
            data = response.json() if success else []
            await self.log_result("21. GET /api/tags", success, 
                                f"Status: {response.status_code}, Tags count: {len(data) if isinstance(data, list) else 'N/A'}")
            return success
        except Exception as e:
            await self.log_result("21. GET /api/tags", False, f"Error: {str(e)}")
            return False
            
    # Test 22: POST /api/tags
    async def test_create_tag(self):
        """Test POST /api/tags"""
        try:
            tag_data = {
                "name": "RegTest",
                "color": "#FF0000"
            }
            response = await self.client.post(f"{BACKEND_URL}/tags", json=tag_data)
            if response.status_code == 200:
                tag = response.json()
                self.test_tag_id = tag.get("id")
                success = self.test_tag_id is not None
                await self.log_result("22. POST /api/tags", success, 
                                    f"Status: {response.status_code}, Tag ID: {self.test_tag_id}")
                return success
            else:
                await self.log_result("22. POST /api/tags", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("22. POST /api/tags", False, f"Error: {str(e)}")
            return False
            
    # Test 23: DELETE /api/tags/{id}
    async def test_delete_tag(self):
        """Test DELETE /api/tags/{id}"""
        if not self.test_tag_id:
            await self.log_result("23. DELETE /api/tags/{id}", False, "No test tag available")
            return False
            
        try:
            response = await self.client.delete(f"{BACKEND_URL}/tags/{self.test_tag_id}")
            success = response.status_code == 200
            await self.log_result("23. DELETE /api/tags/{id}", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("23. DELETE /api/tags/{id}", False, f"Error: {str(e)}")
            return False
            
    # Test 24: POST /api/upload
    async def test_upload_image(self):
        """Test POST /api/upload - verify returns /api/uploads/ URL"""
        try:
            dummy_jpeg = base64.b64encode(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9').decode()
            
            upload_data = {
                "image": f"data:image/jpeg;base64,{dummy_jpeg}"
            }
            response = await self.client.post(f"{BACKEND_URL}/upload", json=upload_data)
            if response.status_code == 200:
                data = response.json()
                image_url = data.get("url", "")  # Fixed: was checking "image_url" instead of "url"
                success = image_url.startswith("/api/uploads/")
                await self.log_result("24. POST /api/upload", success, 
                                    f"Status: {response.status_code}, URL: {image_url}")
                return success
            else:
                await self.log_result("24. POST /api/upload", False, 
                                    f"Status: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("24. POST /api/upload", False, f"Error: {str(e)}")
            return False
            
    # Test 25: DELETE /api/cards/{id}
    async def test_delete_card(self):
        """Test DELETE /api/cards/{id}"""
        if not self.test_card_id:
            await self.log_result("25. DELETE /api/cards/{id}", False, "No test card available")
            return False
            
        try:
            response = await self.client.delete(f"{BACKEND_URL}/cards/{self.test_card_id}")
            success = response.status_code == 200
            await self.log_result("25. DELETE /api/cards/{id}", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("25. DELETE /api/cards/{id}", False, f"Error: {str(e)}")
            return False
            
    # Test 26: DELETE /api/users/{id}
    async def test_delete_user(self):
        """Test DELETE /api/users/{id}"""
        if not self.test_user_id:
            await self.log_result("26. DELETE /api/users/{id}", False, "No test user available")
            return False
            
        try:
            response = await self.client.delete(f"{BACKEND_URL}/users/{self.test_user_id}")
            success = response.status_code == 200
            await self.log_result("26. DELETE /api/users/{id}", success, 
                                f"Status: {response.status_code}")
            return success
        except Exception as e:
            await self.log_result("26. DELETE /api/users/{id}", False, f"Error: {str(e)}")
            return False
            
    async def run_comprehensive_test(self):
        """Run all 26 regression tests"""
        print("🚀 Starting Comprehensive Backend Regression Test")
        print("📋 Testing all 25+ endpoints after major refactoring")
        print("🔍 Focus: Image storage migration (base64 → files)")
        print("=" * 80)
        
        # Run all tests in sequence
        await self.test_health_check()
        await self.test_admin_auth()
        await self.test_team_login()
        await self.test_get_cards_pagination()
        await self.test_get_cards_count()
        await self.test_create_card()
        await self.test_get_card_by_id()
        await self.test_update_card()
        await self.test_mark_card_found_with_images()
        await self.test_verify_image_storage_migration()  # CRITICAL TEST
        await self.test_validate_photo()
        await self.test_reject_photo()
        await self.test_get_users()
        await self.test_get_user_by_id()
        await self.test_update_user_role()
        await self.test_register_push_token()
        await self.test_get_user_notifications()
        await self.test_clear_user_notifications()
        await self.test_remove_push_token()
        await self.test_get_stats()
        await self.test_get_tags()
        await self.test_create_tag()
        await self.test_delete_tag()
        await self.test_upload_image()
        await self.test_delete_card()
        await self.test_delete_user()
        
        # Summary
        print("\n" + "=" * 80)
        print("📊 COMPREHENSIVE REGRESSION TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for result in self.test_results if result['success'])
        total = len(self.test_results)
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Show critical results
        print(f"\n🔍 CRITICAL IMAGE STORAGE MIGRATION:")
        image_test = next((r for r in self.test_results if "Image Storage Migration" in r['test']), None)
        if image_test:
            status = "✅ WORKING" if image_test['success'] else "❌ FAILED"
            print(f"   {status} - {image_test['details']}")
        
        if total - passed > 0:
            print(f"\n❌ FAILED TESTS ({total - passed}):")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
                    
        await self.client.aclose()
        return success_rate >= 90  # Consider successful if 90%+ tests pass

async def main():
    """Main test runner"""
    tester = ComprehensiveRegressionTester()
    success = await tester.run_comprehensive_test()
    return success

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)