import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, RefreshControl, Dimensions, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  background: '#0a0a0a', cardBg: '#1a1a1a', cardBgLight: '#252525',
  primary: '#FFCB05', secondary: '#3B4CCA', accent: '#FF5350',
  text: '#FFFFFF', textSecondary: '#9CA3AF', textMuted: '#6B7280',
  success: '#10B981', warning: '#F59E0B', danger: '#EF4444', vip: '#A855F7', border: '#333333',
  urgent: '#FF6B6B',
};

const CONDITIONS = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Poor'];
const TAG_COLORS = ['#FFCB05', '#3B4CCA', '#FF5350', '#10B981', '#A855F7', '#EC4899', '#06B6D4', '#84CC16'];

interface Card { id: string; name: string; image?: string; has_image?: boolean; price?: number; reward?: number; condition: string; tags: string[]; notes?: string; deadline?: string; found: boolean; found_by?: string; validated?: boolean; submission_count?: number; validated_submission?: any; photo_submissions?: any[]; is_urgent?: boolean; created_at: string; }
interface Tag { id: string; name: string; color: string; }
interface User { id: string; name: string; contact: string; role: string; paypal?: string; balance?: number; total_rewards?: number; validated_cards?: Card[]; pending_submissions?: Card[]; rejected_submissions?: Card[]; notifications?: any[]; created_at: string; }
interface Stats { total: number; found: number; validated: number; pending_validation: number; pending: number; found_today: number; urgent: number; top_hunters: {name: string; count: number; rewards: number}[]; }

// Helper to resolve image URLs (handles both base64 and file URLs)
const resolveImageUrl = (url: string | undefined | null): string | null => {
  if (!url) return null;
  if (url.startsWith('data:')) return url; // base64
  if (url.startsWith('http')) return url; // absolute URL
  if (url.startsWith('/api/uploads/')) return `${API_URL}${url}`; // relative file URL
  return url;
};

const CardImage = memo(({ cardId, hasImage }: { cardId: string; hasImage: boolean }) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (hasImage && !loaded && !loading) {
      setLoading(true);
      fetch(`${API_URL}/api/cards/${cardId}`).then(res => res.json()).then(card => { if (card.image) setImageData(resolveImageUrl(card.image)); }).catch(console.error).finally(() => { setLoading(false); setLoaded(true); });
    }
  }, [hasImage, loaded, loading, cardId]);

  if (!hasImage) return <View style={styles.cardImagePlaceholder}><Ionicons name="image-outline" size={40} color={COLORS.textMuted} /></View>;
  if (loading) return <View style={styles.cardImagePlaceholder}><ActivityIndicator size="small" color={COLORS.primary} /></View>;
  if (imageData) return <Image source={{ uri: imageData }} style={styles.cardImage} />;
  return <View style={styles.cardImagePlaceholder}><Ionicons name="image-outline" size={40} color={COLORS.textMuted} /></View>;
});

export default function Index() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userContact, setUserContact] = useState('');
  const [userId, setUserId] = useState('');
  const [userPaypal, setUserPaypal] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [loginMode, setLoginMode] = useState<'team' | 'admin'>('team');

  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const PAGE_SIZE = 20;
  const [cardsPage, setCardsPage] = useState(0);
  const [totalCards, setTotalCards] = useState(0);
  const [hasMoreCards, setHasMoreCards] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [showFoundOnly, setShowFoundOnly] = useState<boolean | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>('created_at');

  const [showCardModal, setShowCardModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showCardDetailModal, setShowCardDetailModal] = useState(false);
  const [showInstagramPopup, setShowInstagramPopup] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [cardForm, setCardForm] = useState({ name: '', image: '', price: '', reward: '', condition: 'Good', tags: [] as string[], notes: '', deadline: '' });
  const [frontPhoto, setFrontPhoto] = useState('');
  const [backPhoto, setBackPhoto] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPaypal, setEditPaypal] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => { checkSavedAuth(); }, []);
  useEffect(() => { if (isLoggedIn) loadData(); }, [isLoggedIn]);
  useEffect(() => { if (isLoggedIn) loadCards(); }, [searchQuery, selectedCondition, showFoundOnly, selectedTags, showPendingOnly, sortBy]);

  // Push notification listeners
  useEffect(() => {
    if (Platform.OS === 'web') return;
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Refresh data when notification received
      if (isLoggedIn) { loadCards(); loadNotifications(); }
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // User tapped on notification - refresh data
      if (isLoggedIn) { loadCards(); loadNotifications(); }
    });
    return () => {
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [isLoggedIn]);

  const registerForPushNotifications = async (uid: string) => {
    if (Platform.OS === 'web') return;
    try {
      if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return;
      }
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;
      console.log('Push token:', pushToken);
      // Register token with backend
      await fetch(`${API_URL}/api/users/${uid}/push-token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_token: pushToken })
      });
      // Set notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'PokéCollection',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFCB05',
        });
      }
    } catch (e) {
      console.log('Push notification registration error:', e);
    }
  };

  const checkSavedAuth = async () => {
    try {
      const [savedIsAdmin, savedIsVip, savedName, savedContact, savedUserId, savedPaypal] = await Promise.all([
        AsyncStorage.getItem('isAdmin'), AsyncStorage.getItem('isVip'), AsyncStorage.getItem('userName'),
        AsyncStorage.getItem('userContact'), AsyncStorage.getItem('userId'), AsyncStorage.getItem('userPaypal')
      ]);
      if (savedIsAdmin === 'true' || (savedName && savedContact)) {
        setIsAdmin(savedIsAdmin === 'true'); setIsVip(savedIsVip === 'true');
        setUserName(savedName || 'Admin'); setUserContact(savedContact || '');
        setUserId(savedUserId || ''); setUserPaypal(savedPaypal || '');
        setIsLoggedIn(true);
        // Re-register push token on app restart
        if (savedUserId) registerForPushNotifications(savedUserId);
      }
    } catch (error) { console.error('Error:', error); }
    finally { setAuthLoading(false); }
  };

  const validateContact = (contact: string): boolean => {
    return (contact.startsWith('@') && contact.length > 1) || /^0[67]\d{8}$/.test(contact.replace(/\s/g, ''));
  };

  const showAlert = (title: string, msg: string) => { Platform.OS === 'web' ? alert(msg) : Alert.alert(title, msg); };

  const handleAdminLogin = async () => {
    if (!password.trim()) { showAlert('Erreur', 'Mot de passe requis'); return; }
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (data.is_admin) {
        await AsyncStorage.setItem('isAdmin', 'true'); await AsyncStorage.setItem('userName', 'Admin');
        setIsAdmin(true); setUserName('Admin'); setIsLoggedIn(true);
      } else { showAlert('Erreur', 'Mot de passe incorrect'); }
    } catch (e) { showAlert('Erreur', 'Erreur de connexion'); }
    finally { setAuthLoading(false); }
  };

  const handleTeamLogin = async () => {
    if (!userName.trim()) { showAlert('Erreur', 'Nom requis'); return; }
    if (!validateContact(userContact)) { showAlert('Erreur', 'Utilisez @pseudo ou 06xxxxxxxx'); return; }
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: userName, contact: userContact }) });
      const data = await res.json();
      await AsyncStorage.multiSet([['userName', userName], ['userContact', userContact], ['isAdmin', 'false'], ['isVip', data.is_vip.toString()], ['userId', data.user_id]]);
      setIsVip(data.is_vip); setUserId(data.user_id); setIsLoggedIn(true);
      // Register push notifications for team users
      registerForPushNotifications(data.user_id);
    } catch (e) { showAlert('Erreur', 'Erreur de connexion'); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = async () => {
    // Remove push token from backend
    if (userId) {
      try { await fetch(`${API_URL}/api/users/${userId}/push-token`, { method: 'DELETE' }); } catch (e) { console.log('Push token removal error:', e); }
    }
    await AsyncStorage.multiRemove(['userName', 'userContact', 'isAdmin', 'isVip', 'userId', 'userPaypal']);
    setIsLoggedIn(false); setIsAdmin(false); setIsVip(false); setUserName(''); setUserContact(''); setPassword(''); setUserId(''); setUserPaypal(''); setLoginMode('team');
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCards(), loadTags()]);
    if (isAdmin) { await loadUsers(); await loadStats(); }
    if (userId) { await loadCurrentUser(); await loadNotifications(); }
    setLoading(false);
  };

  const loadCards = async (append = false) => {
    try {
      const page = append ? cardsPage : 0;
      let url = `${API_URL}/api/cards?sort_by=${sortBy}&skip=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (selectedCondition) url += `&condition=${encodeURIComponent(selectedCondition)}`;
      if (showFoundOnly !== null) url += `&found=${showFoundOnly}`;
      if (selectedTags.length > 0) url += `&tag=${encodeURIComponent(selectedTags[0])}`;
      if (showPendingOnly) url += `&pending_validation=true`;
      const res = await fetch(url);
      const newCards = await res.json();
      
      if (append) {
        setCards(prev => [...prev, ...newCards]);
      } else {
        setCards(newCards);
        setCardsPage(0);
      }
      setHasMoreCards(newCards.length >= PAGE_SIZE);
      
      // Get total count
      let countUrl = `${API_URL}/api/cards/count?`;
      if (searchQuery) countUrl += `search=${encodeURIComponent(searchQuery)}&`;
      if (selectedCondition) countUrl += `condition=${encodeURIComponent(selectedCondition)}&`;
      if (showFoundOnly !== null) countUrl += `found=${showFoundOnly}&`;
      if (selectedTags.length > 0) countUrl += `tag=${encodeURIComponent(selectedTags[0])}&`;
      if (showPendingOnly) countUrl += `pending_validation=true&`;
      const countRes = await fetch(countUrl);
      const countData = await countRes.json();
      setTotalCards(countData.total);
    } catch (e) { console.error('Error:', e); }
  };

  const loadMoreCards = async () => {
    if (!hasMoreCards || loadingMore) return;
    setLoadingMore(true);
    const nextPage = cardsPage + 1;
    setCardsPage(nextPage);
    try {
      let url = `${API_URL}/api/cards?sort_by=${sortBy}&skip=${nextPage * PAGE_SIZE}&limit=${PAGE_SIZE}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (selectedCondition) url += `&condition=${encodeURIComponent(selectedCondition)}`;
      if (showFoundOnly !== null) url += `&found=${showFoundOnly}`;
      if (selectedTags.length > 0) url += `&tag=${encodeURIComponent(selectedTags[0])}`;
      if (showPendingOnly) url += `&pending_validation=true`;
      const res = await fetch(url);
      const newCards = await res.json();
      setCards(prev => [...prev, ...newCards]);
      setHasMoreCards(newCards.length >= PAGE_SIZE);
    } catch (e) { console.error('Error:', e); }
    finally { setLoadingMore(false); }
  };

  const loadTags = async () => { try { setTags(await (await fetch(`${API_URL}/api/tags`)).json()); } catch (e) { console.error(e); } };
  const loadUsers = async () => { try { setUsers(await (await fetch(`${API_URL}/api/users`)).json()); } catch (e) { console.error(e); } };
  const loadStats = async () => { try { setStats(await (await fetch(`${API_URL}/api/stats`)).json()); } catch (e) { console.error(e); } };
  
  const loadCurrentUser = async () => {
    if (!userId) return;
    try {
      const data = await (await fetch(`${API_URL}/api/users/${userId}`)).json();
      setCurrentUser(data); setUserPaypal(data.paypal || '');
      await AsyncStorage.setItem('userPaypal', data.paypal || '');
    } catch (e) { console.error(e); }
  };

  const loadNotifications = async () => {
    if (!userId) return;
    try {
      const data = await (await fetch(`${API_URL}/api/users/${userId}/notifications`)).json();
      setNotifications(data || []);
      if (data && data.length > 0) setShowNotificationModal(true);
    } catch (e) { console.error(e); }
  };

  const clearNotifications = async () => {
    if (!userId) return;
    try { await fetch(`${API_URL}/api/users/${userId}/notifications`, { method: 'DELETE' }); setNotifications([]); setShowNotificationModal(false); } catch (e) { console.error(e); }
  };

  const updateUserRole = async (uid: string, role: string) => { try { await fetch(`${API_URL}/api/users/${uid}/role?role=${role}`, { method: 'PUT' }); loadUsers(); } catch (e) { showAlert('Erreur', 'Impossible'); } };
  const deleteUser = async (uid: string) => {
    const doIt = async () => { try { await fetch(`${API_URL}/api/users/${uid}`, { method: 'DELETE' }); loadUsers(); } catch (e) { showAlert('Erreur', 'Impossible'); } };
    Platform.OS === 'web' ? (window.confirm('Supprimer ?') && doIt()) : Alert.alert('Confirmer', 'Supprimer ?', [{ text: 'Non' }, { text: 'Oui', onPress: doIt, style: 'destructive' }]);
  };

  const updateProfile = async () => {
    if (!userId) return;
    try {
      await fetch(`${API_URL}/api/users/${userId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName || undefined, contact: editContact || undefined, paypal: editPaypal || undefined }) });
      if (editName) { setUserName(editName); await AsyncStorage.setItem('userName', editName); }
      if (editContact) { setUserContact(editContact); await AsyncStorage.setItem('userContact', editContact); }
      if (editPaypal) { setUserPaypal(editPaypal); await AsyncStorage.setItem('userPaypal', editPaypal); }
      loadCurrentUser(); showAlert('Succès', 'Profil mis à jour'); setShowProfileModal(false);
    } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  const openProfileModal = () => { setEditName(userName); setEditContact(userContact); setEditPaypal(userPaypal); loadCurrentUser(); setShowProfileModal(true); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  const pickImage = async (type: 'main' | 'front' | 'back') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [3, 4], quality: type === 'main' ? 0.5 : 0.9, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const img = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === 'main') setCardForm(p => ({ ...p, image: img })); else if (type === 'front') setFrontPhoto(img); else setBackPhoto(img);
    }
  };

  const openCardModal = (card?: Card) => {
    if (card) { setEditingCard(card); setCardForm({ name: card.name, image: card.image || '', price: card.price?.toString() || '', reward: card.reward?.toString() || '', condition: card.condition, tags: card.tags || [], notes: card.notes || '', deadline: card.deadline || '' }); }
    else { setEditingCard(null); setCardForm({ name: '', image: '', price: '', reward: '', condition: 'Good', tags: [], notes: '', deadline: '' }); }
    setShowCardModal(true);
  };

  const saveCard = async () => {
    if (!cardForm.name.trim()) { showAlert('Erreur', 'Nom requis'); return; }
    try {
      const payload = { name: cardForm.name, image: cardForm.image || null, price: cardForm.price ? parseFloat(cardForm.price) : null, reward: cardForm.reward ? parseFloat(cardForm.reward) : null, condition: cardForm.condition, tags: cardForm.tags, notes: cardForm.notes || null, deadline: cardForm.deadline || null };
      await fetch(editingCard ? `${API_URL}/api/cards/${editingCard.id}` : `${API_URL}/api/cards`, { method: editingCard ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setShowCardModal(false); loadCards();
    } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  const deleteCard = async (cardId: string) => {
    const doIt = async () => { try { await fetch(`${API_URL}/api/cards/${cardId}`, { method: 'DELETE' }); loadCards(); } catch (e) { showAlert('Erreur', 'Impossible'); } };
    Platform.OS === 'web' ? (window.confirm('Supprimer ?') && doIt()) : Alert.alert('Confirmer', 'Supprimer ?', [{ text: 'Non' }, { text: 'Oui', onPress: doIt, style: 'destructive' }]);
  };

  const openFoundModal = (card: Card) => {
    setSelectedCard(card); setFrontPhoto(''); setBackPhoto(''); setShowPhotoModal(true);
  };

  const submitFoundWithPhotos = async () => {
    if (!selectedCard) return;
    if (!isVip && (!frontPhoto || !backPhoto)) { showAlert('Erreur', 'Les deux photos sont requises'); return; }
    try {
      await fetch(`${API_URL}/api/cards/${selectedCard.id}/found`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ found_by: userName, user_contact: userContact, is_vip: isVip, front_image: frontPhoto || null, back_image: backPhoto || null })
      });
      setShowPhotoModal(false); loadCards(); setShowInstagramPopup(true);
    } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  const resubmitPhotos = async () => {
    if (!selectedCard) return;
    if (!frontPhoto || !backPhoto) { showAlert('Erreur', 'Les deux photos sont requises'); return; }
    try {
      await fetch(`${API_URL}/api/cards/${selectedCard.id}/submit-photos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front_image: frontPhoto, back_image: backPhoto, submitted_by: userName, user_contact: userContact })
      });
      setShowPhotoModal(false); loadCards(); setShowInstagramPopup(true);
    } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  const openCardDetail = async (cardId: string) => {
    try { setSelectedCard(await (await fetch(`${API_URL}/api/cards/${cardId}`)).json()); setShowCardDetailModal(true); } catch (e) { console.error(e); }
  };

  const validateSubmission = async (subId: string) => {
    if (!selectedCard) return;
    try {
      await fetch(`${API_URL}/api/cards/${selectedCard.id}/validate-photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id: subId }) });
      setSelectedCard(await (await fetch(`${API_URL}/api/cards/${selectedCard.id}`)).json());
      loadCards(); showAlert('Succès', 'Validé !');
    } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  const openRejectModal = (sub: any) => { setSelectedSubmission(sub); setRejectReason(''); setShowRejectModal(true); };

  const rejectSubmission = async () => {
    if (!selectedCard || !selectedSubmission) return;
    if (!rejectReason.trim()) { showAlert('Erreur', 'Motif requis'); return; }
    try {
      await fetch(`${API_URL}/api/cards/${selectedCard.id}/reject-photo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: selectedSubmission.id, reason: rejectReason })
      });
      setShowRejectModal(false);
      setSelectedCard(await (await fetch(`${API_URL}/api/cards/${selectedCard.id}`)).json());
      loadCards(); showAlert('Succès', 'Soumission refusée');
    } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  const markAsUnfound = async (cardId: string) => { try { await fetch(`${API_URL}/api/cards/${cardId}/unfound`, { method: 'POST' }); loadCards(); setShowCardDetailModal(false); } catch (e) { showAlert('Erreur', 'Impossible'); } };
  const createTag = async () => { if (!newTagName.trim()) return; try { await fetch(`${API_URL}/api/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTagName, color: newTagColor }) }); setNewTagName(''); setShowTagModal(false); loadTags(); } catch (e) {} };
  const deleteTag = async (tagId: string) => { try { await fetch(`${API_URL}/api/tags/${tagId}`, { method: 'DELETE' }); loadTags(); } catch (e) {} };

  const openInstagram = () => {
    const url = Platform.select({ ios: 'instagram://user?username=quintus_tcg', android: 'intent://instagram.com/_u/quintus_tcg#Intent;package=com.instagram.android;scheme=https;end', default: 'https://instagram.com/quintus_tcg' });
    Linking.canOpenURL('instagram://').then(ok => Linking.openURL(ok ? url : 'https://instagram.com/quintus_tcg')).catch(() => Linking.openURL('https://instagram.com/quintus_tcg'));
    setShowInstagramPopup(false);
  };

  const getConditionColor = (c: string) => { switch (c) { case 'Mint': return COLORS.success; case 'Near Mint': return '#34D399'; case 'Excellent': return COLORS.secondary; case 'Good': return COLORS.warning; case 'Poor': return COLORS.danger; default: return COLORS.textMuted; } };
  const getRoleBadge = () => { if (isAdmin) return { text: 'Admin', color: COLORS.accent }; if (isVip) return { text: 'VIP', color: COLORS.vip }; return { text: 'Équipe', color: COLORS.secondary }; };
  const getRoleColor = (r: string) => r === 'admin' ? COLORS.accent : r === 'vip' ? COLORS.vip : COLORS.secondary;

  if (authLoading) return <SafeAreaView style={styles.container}><View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View></SafeAreaView>;

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.authContainer}>
          <View style={styles.authCard}>
            <View style={styles.logoContainer}><Ionicons name="flash" size={48} color={COLORS.primary} /><Ionicons name="albums" size={48} color={COLORS.secondary} style={{ marginLeft: -10 }} /></View>
            <Text style={styles.authTitle}>PokéCollection</Text>
            <Text style={styles.authSubtitle}>Tracker de cartes</Text>
            <View style={styles.loginToggle}>
              <TouchableOpacity style={[styles.toggleButton, loginMode === 'team' && styles.toggleButtonActive]} onPress={() => setLoginMode('team')}><Text style={[styles.toggleButtonText, loginMode === 'team' && styles.toggleButtonTextActive]}>Équipe</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.toggleButton, loginMode === 'admin' && styles.toggleButtonActive]} onPress={() => setLoginMode('admin')}><Text style={[styles.toggleButtonText, loginMode === 'admin' && styles.toggleButtonTextActive]}>Admin</Text></TouchableOpacity>
            </View>
            {loginMode === 'team' ? (<>
              <TextInput style={styles.authInput} placeholder="Votre nom" placeholderTextColor={COLORS.textMuted} value={userName} onChangeText={setUserName} />
              <TextInput style={styles.authInput} placeholder="Instagram (@) ou Téléphone (06...)" placeholderTextColor={COLORS.textMuted} value={userContact} onChangeText={setUserContact} autoCapitalize="none" />
              <TouchableOpacity style={styles.authButton} onPress={handleTeamLogin}><Text style={styles.authButtonText}>Entrer</Text></TouchableOpacity>
            </>) : (<>
              <TextInput style={styles.authInput} placeholder="Mot de passe admin" placeholderTextColor={COLORS.textMuted} value={password} onChangeText={setPassword} secureTextEntry />
              <TouchableOpacity style={styles.authButton} onPress={handleAdminLogin}><Text style={styles.authButtonText}>Connexion Admin</Text></TouchableOpacity>
            </>)}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const roleBadge = getRoleBadge();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>PokéCollection</Text>
          <View style={[styles.roleTag, { backgroundColor: roleBadge.color }]}><Text style={styles.roleText}>{roleBadge.text}</Text></View>
        </View>
        <View style={styles.headerRight}>
          {!isAdmin && notifications.length > 0 && <View style={styles.notifBadge}><Text style={styles.notifBadgeText}>{notifications.length}</Text></View>}
          {!isAdmin && <TouchableOpacity style={styles.headerButton} onPress={openProfileModal}><Ionicons name="person-circle" size={24} color={COLORS.primary} /></TouchableOpacity>}
          {isAdmin && <TouchableOpacity style={styles.headerButton} onPress={() => { loadStats(); setShowStatsModal(true); }}><Ionicons name="stats-chart" size={22} color={COLORS.primary} /></TouchableOpacity>}
          {isAdmin && <TouchableOpacity style={styles.headerButton} onPress={() => { loadUsers(); setShowUsersModal(true); }}><Ionicons name="people" size={22} color={COLORS.text} /></TouchableOpacity>}
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowFilters(!showFilters)}><Ionicons name="filter" size={22} color={COLORS.text} /></TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}><Ionicons name="log-out-outline" size={22} color={COLORS.text} /></TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} />
        <TextInput style={styles.searchInput} placeholder="Rechercher..." placeholderTextColor={COLORS.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
        {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={20} color={COLORS.textMuted} /></TouchableOpacity> : null}
      </View>

      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Tri</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[{v: 'created_at', l: 'Récent'}, {v: 'reward_desc', l: 'Récompense ↓'}, {v: 'reward_asc', l: 'Récompense ↑'}, {v: 'deadline', l: 'Deadline'}].map(s => (
              <TouchableOpacity key={s.v} style={[styles.filterTag, sortBy === s.v && { backgroundColor: COLORS.primary }]} onPress={() => setSortBy(s.v)}><Text style={styles.filterTagText}>{s.l}</Text></TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.filterLabel}>Tags</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{tags.map(t => <TouchableOpacity key={t.id} style={[styles.filterTag, { backgroundColor: selectedTags.includes(t.name) ? t.color : COLORS.cardBgLight }]} onPress={() => setSelectedTags(p => p.includes(t.name) ? p.filter(x => x !== t.name) : [...p, t.name])}><Text style={styles.filterTagText}>{t.name}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.filterLabel}>Condition</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{CONDITIONS.map(c => <TouchableOpacity key={c} style={[styles.filterTag, { backgroundColor: selectedCondition === c ? getConditionColor(c) : COLORS.cardBgLight }]} onPress={() => setSelectedCondition(selectedCondition === c ? null : c)}><Text style={styles.filterTagText}>{c}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.filterLabel}>Statut</Text>
          <View style={styles.statusFilters}>
            {[{v: null, l: 'Tous'}, {v: false, l: 'À trouver'}, {v: true, l: 'Trouvés'}].map(s => <TouchableOpacity key={String(s.v)} style={[styles.statusButton, showFoundOnly === s.v && !showPendingOnly && styles.statusButtonActive]} onPress={() => { setShowFoundOnly(s.v); setShowPendingOnly(false); }}><Text style={styles.statusButtonText}>{s.l}</Text></TouchableOpacity>)}
            {isAdmin && <TouchableOpacity style={[styles.statusButton, showPendingOnly && styles.statusButtonActive, { backgroundColor: showPendingOnly ? COLORS.warning : COLORS.cardBgLight }]} onPress={() => { setShowPendingOnly(!showPendingOnly); setShowFoundOnly(null); }}><Text style={styles.statusButtonText}>En attente</Text></TouchableOpacity>}
          </View>
        </View>
      )}

      <ScrollView style={styles.cardsList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 48 }} /> : cards.length === 0 ? <View style={styles.emptyState}><Ionicons name="albums-outline" size={64} color={COLORS.textMuted} /><Text style={styles.emptyText}>Aucune carte</Text></View> : cards.map(card => (
          <TouchableOpacity key={card.id} style={[styles.card, card.found && styles.cardFound, card.validated && styles.cardValidated, card.is_urgent && styles.cardUrgent]} onPress={() => openCardDetail(card.id)}>
            {card.is_urgent && <View style={styles.urgentBadge}><Ionicons name="time" size={12} color="#FFF" /><Text style={styles.urgentText}>URGENT</Text></View>}
            <CardImage cardId={card.id} hasImage={card.has_image || !!card.image} />
            <View style={styles.cardContent}>
              <Text style={styles.cardName}>{card.name}</Text>
              <View style={styles.cardMeta}><View style={[styles.conditionBadge, { backgroundColor: getConditionColor(card.condition) }]}><Text style={styles.conditionText}>{card.condition}</Text></View></View>
              <View style={styles.priceRowCard}>{card.price != null && <View style={styles.priceBox}><Text style={styles.priceLabel}>Prix</Text><Text style={styles.priceValue}>{card.price}€</Text></View>}{card.reward != null && <View style={[styles.priceBox, styles.rewardBox]}><Text style={styles.priceLabel}>Récompense</Text><Text style={[styles.priceValue, styles.rewardValue]}>{card.reward}€</Text></View>}</View>
              {card.tags.length > 0 && <View style={styles.cardTags}>{card.tags.map(tn => { const t = tags.find(x => x.name === tn); return <View key={tn} style={[styles.cardTag, { backgroundColor: t?.color || COLORS.cardBgLight }]}><Text style={styles.cardTagText}>{tn}</Text></View>; })}</View>}
              {card.found && <View style={styles.foundInfo}><Ionicons name={card.validated ? "checkmark-done-circle" : "checkmark-circle"} size={16} color={card.validated ? COLORS.primary : COLORS.success} /><Text style={[styles.foundText, card.validated && styles.validatedText]}>{card.validated ? 'Validé' : 'Trouvé'} par {card.found_by}</Text>{!card.validated && card.submission_count > 0 && <Text style={styles.submissionCount}>({card.submission_count})</Text>}</View>}
            </View>
            <View style={styles.cardActions}>
              {!card.found && <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); isVip ? submitFoundWithPhotos() : openFoundModal(card); }}><Ionicons name="checkmark-circle-outline" size={28} color={COLORS.success} /></TouchableOpacity>}
              {isAdmin && card.found && !card.validated && <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); markAsUnfound(card.id); }}><Ionicons name="refresh" size={24} color={COLORS.warning} /></TouchableOpacity>}
              {isAdmin && <><TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); openCardModal(card); }}><Ionicons name="create-outline" size={24} color={COLORS.secondary} /></TouchableOpacity><TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); deleteCard(card.id); }}><Ionicons name="trash-outline" size={24} color={COLORS.danger} /></TouchableOpacity></>}
            </View>
          </TouchableOpacity>
        ))}
        {hasMoreCards && cards.length > 0 && (
          <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreCards} disabled={loadingMore}>
            {loadingMore ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.loadMoreText}>Charger plus...</Text>}
          </TouchableOpacity>
        )}
        {cards.length > 0 && <Text style={styles.cardCountText}>{cards.length} / {totalCards} cartes</Text>}
        <View style={{ height: 100 }} />
      </ScrollView>

      {isAdmin && <View style={styles.fabContainer}><TouchableOpacity style={[styles.fab, styles.fabSecondary]} onPress={() => setShowTagModal(true)}><Ionicons name="pricetag" size={24} color={COLORS.text} /></TouchableOpacity><TouchableOpacity style={styles.fab} onPress={() => openCardModal()}><Ionicons name="add" size={32} color={COLORS.background} /></TouchableOpacity></View>}

      {/* Notifications Modal */}
      <Modal visible={showNotificationModal} animationType="fade" transparent>
        <View style={styles.popupOverlay}>
          <View style={styles.popupContent}>
            <Ionicons name="notifications" size={48} color={COLORS.primary} />
            <Text style={styles.popupTitle}>Notifications</Text>
            <ScrollView style={{ maxHeight: 300, width: '100%' }}>
              {notifications.map((n, i) => (
                <View key={i} style={[styles.notifItem, n.type === 'error' && styles.notifError, n.type === 'success' && styles.notifSuccess]}>
                  <Text style={styles.notifText}>{n.message}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.authButton} onPress={clearNotifications}><Text style={styles.authButtonText}>Compris</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stats Modal */}
      <Modal visible={showStatsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.statsModalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Statistiques</Text><TouchableOpacity onPress={() => setShowStatsModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <ScrollView style={styles.modalBody}>
              {stats && (<>
                <View style={styles.statsGrid}>
                  <View style={styles.statBox}><Text style={styles.statValue}>{stats.total}</Text><Text style={styles.statLabel}>Total</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: COLORS.success }]}>{stats.found}</Text><Text style={styles.statLabel}>Trouvées</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: COLORS.primary }]}>{stats.validated}</Text><Text style={styles.statLabel}>Validées</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: COLORS.warning }]}>{stats.pending_validation}</Text><Text style={styles.statLabel}>En attente</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: COLORS.secondary }]}>{stats.pending}</Text><Text style={styles.statLabel}>À trouver</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: COLORS.urgent }]}>{stats.urgent}</Text><Text style={styles.statLabel}>Urgentes</Text></View>
                </View>
                <Text style={styles.sectionTitle}>🏆 Top Hunters</Text>
                {stats.top_hunters.map((h, i) => (
                  <View key={i} style={styles.hunterItem}><Text style={styles.hunterRank}>#{i + 1}</Text><Text style={styles.hunterName}>{h.name}</Text><Text style={styles.hunterStats}>{h.count} cartes • {h.rewards}€</Text></View>
                ))}
              </>)}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Profile Modal */}
      <Modal visible={showProfileModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Mon Espace</Text><TouchableOpacity onPress={() => setShowProfileModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.balanceCard}><Text style={styles.balanceLabel}>Récompenses gagnées</Text><Text style={styles.balanceValue}>{currentUser?.total_rewards || 0}€</Text></View>
              {currentUser?.validated_cards && currentUser.validated_cards.length > 0 && <View style={styles.profileSection}><Text style={styles.profileSectionTitle}>✅ Cartes validées ({currentUser.validated_cards.length})</Text>{currentUser.validated_cards.map(c => <View key={c.id} style={styles.validatedCardItem}><Text style={styles.validatedCardName}>{c.name}</Text><Text style={styles.validatedCardReward}>+{c.reward || 0}€</Text></View>)}</View>}
              {currentUser?.pending_submissions && currentUser.pending_submissions.length > 0 && <View style={styles.profileSection}><Text style={styles.profileSectionTitle}>⏳ En attente ({currentUser.pending_submissions.length})</Text>{currentUser.pending_submissions.map(c => <View key={c.id} style={styles.pendingCardItem}><Text style={styles.pendingCardName}>{c.name}</Text><TouchableOpacity onPress={() => { setSelectedCard(c); setFrontPhoto(''); setBackPhoto(''); setShowProfileModal(false); setShowPhotoModal(true); }}><Text style={styles.resubmitLink}>Renvoyer photos</Text></TouchableOpacity></View>)}</View>}
              <View style={styles.profileSection}>
                <Text style={styles.profileSectionTitle}>Mes informations</Text>
                <Text style={styles.inputLabel}>Nom</Text><TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder={userName} placeholderTextColor={COLORS.textMuted} />
                <Text style={styles.inputLabel}>Contact</Text><TextInput style={styles.input} value={editContact} onChangeText={setEditContact} placeholder={userContact} placeholderTextColor={COLORS.textMuted} autoCapitalize="none" />
                <Text style={styles.inputLabel}>PayPal (email)</Text><TextInput style={styles.input} value={editPaypal} onChangeText={setEditPaypal} placeholder="email@paypal.com" placeholderTextColor={COLORS.textMuted} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <TouchableOpacity style={styles.saveButton} onPress={updateProfile}><Text style={styles.saveButtonText}>Enregistrer</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Users Modal */}
      <Modal visible={showUsersModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.usersModalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Utilisateurs</Text><TouchableOpacity onPress={() => setShowUsersModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <ScrollView style={styles.modalBody}>{users.map(u => (
              <View key={u.id} style={styles.userItem}>
                <View style={styles.userInfo}><Text style={styles.userName}>{u.name}</Text><Text style={styles.userContact}>{u.contact}</Text>{u.paypal && <Text style={styles.userPaypal}>PayPal: {u.paypal}</Text>}</View>
                <View style={styles.roleButtons}>{['team', 'vip', 'admin'].map(r => <TouchableOpacity key={r} style={[styles.roleButton, u.role === r && { backgroundColor: getRoleColor(r) }]} onPress={() => updateUserRole(u.id, r)}><Text style={[styles.roleButtonText, u.role === r && { color: COLORS.text }]}>{r.toUpperCase()}</Text></TouchableOpacity>)}</View>
                <TouchableOpacity style={styles.deleteUserBtn} onPress={() => deleteUser(u.id)}><Ionicons name="trash-outline" size={20} color={COLORS.danger} /></TouchableOpacity>
              </View>
            ))}</ScrollView>
          </View>
        </View>
      </Modal>

      {/* Card Modal */}
      <Modal visible={showCardModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}><Text style={styles.modalTitle}>{editingCard ? 'Modifier' : 'Nouvelle carte'}</Text><TouchableOpacity onPress={() => setShowCardModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
              <ScrollView style={styles.modalBody}>
                <Text style={styles.inputLabel}>Nom *</Text><TextInput style={styles.input} value={cardForm.name} onChangeText={t => setCardForm(p => ({ ...p, name: t }))} placeholder="Ex: Pikachu VMAX" placeholderTextColor={COLORS.textMuted} />
                <Text style={styles.inputLabel}>Image</Text><TouchableOpacity style={styles.imagePicker} onPress={() => pickImage('main')}>{cardForm.image ? <Image source={{ uri: cardForm.image }} style={styles.previewImage} /> : <View style={styles.imagePickerPlaceholder}><Ionicons name="camera" size={32} color={COLORS.textMuted} /></View>}</TouchableOpacity>
                <View style={styles.priceRow}><View style={styles.priceField}><Text style={styles.inputLabel}>Prix (€)</Text><TextInput style={styles.input} value={cardForm.price} onChangeText={t => setCardForm(p => ({ ...p, price: t }))} keyboardType="decimal-pad" placeholder="50" placeholderTextColor={COLORS.textMuted} /></View><View style={styles.priceField}><Text style={styles.inputLabel}>Récompense (€)</Text><TextInput style={styles.input} value={cardForm.reward} onChangeText={t => setCardForm(p => ({ ...p, reward: t }))} keyboardType="decimal-pad" placeholder="5" placeholderTextColor={COLORS.textMuted} /></View></View>
                <Text style={styles.inputLabel}>Deadline (optionnel)</Text><TextInput style={styles.input} value={cardForm.deadline} onChangeText={t => setCardForm(p => ({ ...p, deadline: t }))} placeholder="2026-04-15" placeholderTextColor={COLORS.textMuted} />
                <Text style={styles.inputLabel}>Condition</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{CONDITIONS.map(c => <TouchableOpacity key={c} style={[styles.conditionOption, { backgroundColor: cardForm.condition === c ? getConditionColor(c) : COLORS.cardBgLight }]} onPress={() => setCardForm(p => ({ ...p, condition: c }))}><Text style={styles.conditionOptionText}>{c}</Text></TouchableOpacity>)}</ScrollView>
                <Text style={styles.inputLabel}>Tags</Text><View style={styles.tagsContainer}>{tags.map(t => <TouchableOpacity key={t.id} style={[styles.tagOption, { backgroundColor: cardForm.tags.includes(t.name) ? t.color : COLORS.cardBgLight }]} onPress={() => setCardForm(p => ({ ...p, tags: p.tags.includes(t.name) ? p.tags.filter(x => x !== t.name) : [...p.tags, t.name] }))}><Text style={styles.tagOptionText}>{t.name}</Text></TouchableOpacity>)}</View>
                <Text style={styles.inputLabel}>Notes</Text><TextInput style={[styles.input, styles.textArea]} value={cardForm.notes} onChangeText={t => setCardForm(p => ({ ...p, notes: t }))} placeholder="Notes..." placeholderTextColor={COLORS.textMuted} multiline />
              </ScrollView>
              <View style={styles.modalFooter}><TouchableOpacity style={styles.cancelButton} onPress={() => setShowCardModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.saveButton} onPress={saveCard}><Text style={styles.saveButtonText}>Sauvegarder</Text></TouchableOpacity></View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Photo Modal */}
      <Modal visible={showPhotoModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.photoModalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{selectedCard?.found ? 'Renvoyer des photos' : 'Photos de la carte'}</Text><TouchableOpacity onPress={() => setShowPhotoModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <Text style={styles.photoInstructions}>📸 Prenez des photos HD du recto et verso</Text>
            <View style={styles.photoRow}>
              <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('front')}>{frontPhoto ? <Image source={{ uri: frontPhoto }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Ionicons name="camera" size={40} color={COLORS.textMuted} /><Text style={styles.photoLabel}>Recto</Text></View>}</TouchableOpacity>
              <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('back')}>{backPhoto ? <Image source={{ uri: backPhoto }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Ionicons name="camera" size={40} color={COLORS.textMuted} /><Text style={styles.photoLabel}>Verso</Text></View>}</TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.submitButton, (!frontPhoto || !backPhoto) && styles.submitButtonDisabled]} onPress={selectedCard?.found ? resubmitPhotos : submitFoundWithPhotos} disabled={!frontPhoto || !backPhoto}><Text style={styles.submitButtonText}>Envoyer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Card Detail Modal */}
      <Modal visible={showCardDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{selectedCard?.name}</Text><TouchableOpacity onPress={() => setShowCardDetailModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <ScrollView style={styles.modalBody}>
              {selectedCard?.validated_submission ? (
                <View><Text style={styles.sectionTitle}>✅ Photos validées</Text><View style={styles.photoRow}><Image source={{ uri: resolveImageUrl(selectedCard.validated_submission.front_image) || '' }} style={styles.detailPhoto} /><Image source={{ uri: resolveImageUrl(selectedCard.validated_submission.back_image) || '' }} style={styles.detailPhoto} /></View><Text style={styles.submittedBy}>Par {selectedCard.validated_submission.submitted_by}</Text></View>
              ) : selectedCard?.photo_submissions && selectedCard.photo_submissions.filter(s => !s.rejected).length > 0 ? (
                <View><Text style={styles.sectionTitle}>📷 Soumissions ({selectedCard.photo_submissions.filter(s => !s.rejected).length})</Text>
                  {selectedCard.photo_submissions.filter(s => !s.rejected).map(sub => (
                    <View key={sub.id} style={styles.submissionCard}>
                      <Text style={styles.submissionBy}>{sub.submitted_by} ({sub.user_contact})</Text>
                      <View style={styles.photoRow}><Image source={{ uri: resolveImageUrl(sub.front_image) || '' }} style={styles.submissionPhoto} /><Image source={{ uri: resolveImageUrl(sub.back_image) || '' }} style={styles.submissionPhoto} /></View>
                      {isAdmin && <View style={styles.submissionActions}>
                        <TouchableOpacity style={styles.validateButton} onPress={() => validateSubmission(sub.id)}><Ionicons name="checkmark-circle" size={20} color={COLORS.text} /><Text style={styles.validateButtonText}>Valider</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.rejectButton} onPress={() => openRejectModal(sub)}><Ionicons name="close-circle" size={20} color={COLORS.text} /><Text style={styles.rejectButtonText}>Refuser</Text></TouchableOpacity>
                      </View>}
                    </View>
                  ))}
                </View>
              ) : <View style={styles.noPhotos}><Ionicons name="images-outline" size={48} color={COLORS.textMuted} /><Text style={styles.noPhotosText}>Aucune photo</Text></View>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={showRejectModal} animationType="fade" transparent>
        <View style={styles.popupOverlay}>
          <View style={styles.rejectModalContent}>
            <Text style={styles.rejectTitle}>Motif du refus</Text>
            <TextInput style={[styles.input, styles.textArea]} value={rejectReason} onChangeText={setRejectReason} placeholder="Ex: Photos floues, mauvais angle..." placeholderTextColor={COLORS.textMuted} multiline />
            <View style={styles.rejectActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowRejectModal(false)}><Text style={styles.cancelButtonText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={styles.rejectConfirmButton} onPress={rejectSubmission}><Text style={styles.rejectConfirmText}>Refuser</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Instagram Popup */}
      <Modal visible={showInstagramPopup} animationType="fade" transparent>
        <View style={styles.popupOverlay}>
          <View style={styles.popupContent}>
            <Ionicons name="logo-instagram" size={48} color="#E1306C" />
            <Text style={styles.popupTitle}>Contactez-nous !</Text>
            <Text style={styles.popupText}>Envoyez un message sur Instagram pour confirmer</Text>
            <TouchableOpacity style={styles.instagramButton} onPress={openInstagram}><Ionicons name="logo-instagram" size={24} color={COLORS.text} /><Text style={styles.instagramButtonText}>@quintus_tcg</Text></TouchableOpacity>
            <TouchableOpacity style={styles.popupClose} onPress={() => setShowInstagramPopup(false)}><Text style={styles.popupCloseText}>Plus tard</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tag Modal */}
      <Modal visible={showTagModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.tagModalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Tags</Text><TouchableOpacity onPress={() => setShowTagModal(false)}><Ionicons name="close" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <View style={styles.newTagForm}><TextInput style={[styles.input, { flex: 1 }]} value={newTagName} onChangeText={setNewTagName} placeholder="Nouveau tag..." placeholderTextColor={COLORS.textMuted} /><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPicker}>{TAG_COLORS.map(c => <TouchableOpacity key={c} style={[styles.colorOption, { backgroundColor: c }, newTagColor === c && styles.colorOptionSelected]} onPress={() => setNewTagColor(c)} />)}</ScrollView><TouchableOpacity style={styles.addTagButton} onPress={createTag}><Ionicons name="add" size={24} color={COLORS.background} /></TouchableOpacity></View>
            <ScrollView style={styles.tagsList}>{tags.map(t => <View key={t.id} style={styles.tagItem}><View style={[styles.tagColorDot, { backgroundColor: t.color }]} /><Text style={styles.tagItemName}>{t.name}</Text><TouchableOpacity onPress={() => deleteTag(t.id)}><Ionicons name="trash-outline" size={20} color={COLORS.danger} /></TouchableOpacity></View>)}</ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  authCard: { backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  authTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginTop: 8 },
  authSubtitle: { fontSize: 16, color: COLORS.textSecondary, marginTop: 4, marginBottom: 24 },
  loginToggle: { flexDirection: 'row', backgroundColor: COLORS.cardBgLight, borderRadius: 12, padding: 4, marginBottom: 24, width: '100%' },
  toggleButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  toggleButtonActive: { backgroundColor: COLORS.primary },
  toggleButtonText: { color: COLORS.textMuted, fontWeight: '600' },
  toggleButtonTextActive: { color: COLORS.background },
  authInput: { width: '100%', backgroundColor: COLORS.cardBgLight, borderRadius: 12, padding: 16, color: COLORS.text, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  authButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginTop: 8 },
  authButtonText: { color: COLORS.background, fontSize: 16, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: COLORS.cardBg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  roleTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleText: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  headerRight: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  headerButton: { padding: 8 },
  notifBadge: { position: 'absolute', top: 0, right: 70, backgroundColor: COLORS.danger, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  notifBadgeText: { color: COLORS.text, fontSize: 11, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBg, margin: 16, marginTop: 8, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16 },
  filtersPanel: { backgroundColor: COLORS.cardBg, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  filterLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  filterTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  filterTagText: { color: COLORS.text, fontSize: 13, fontWeight: '500' },
  statusFilters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.cardBgLight, alignItems: 'center' },
  statusButtonActive: { backgroundColor: COLORS.secondary },
  statusButtonText: { color: COLORS.text, fontSize: 12, fontWeight: '500' },
  cardsList: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingTop: 64 },
  emptyText: { color: COLORS.textMuted, fontSize: 18, marginTop: 16 },
  card: { flexDirection: 'row', backgroundColor: COLORS.cardBg, borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, position: 'relative' },
  cardFound: { borderColor: COLORS.success, borderWidth: 2 },
  cardValidated: { borderColor: COLORS.primary, borderWidth: 2 },
  cardUrgent: { borderColor: COLORS.urgent, borderWidth: 2 },
  urgentBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: COLORS.urgent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 10 },
  urgentText: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
  cardImage: { width: 100, height: 140 },
  cardImagePlaceholder: { width: 100, height: 140, backgroundColor: COLORS.cardBgLight, justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  conditionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  conditionText: { color: COLORS.text, fontSize: 11, fontWeight: '600' },
  priceRowCard: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  priceBox: { backgroundColor: COLORS.cardBgLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  rewardBox: { backgroundColor: 'rgba(255, 203, 5, 0.2)' },
  priceLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '500' },
  priceValue: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  rewardValue: { color: COLORS.primary },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  cardTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cardTagText: { color: COLORS.text, fontSize: 11, fontWeight: '500' },
  foundInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  foundText: { color: COLORS.success, fontSize: 12, fontWeight: '500' },
  validatedText: { color: COLORS.primary },
  submissionCount: { color: COLORS.textMuted, fontSize: 11 },
  cardActions: { padding: 8, justifyContent: 'center', gap: 8 },
  actionBtn: { padding: 4 },
  fabContainer: { position: 'absolute', right: 16, bottom: 24, gap: 12, zIndex: 999, elevation: 10 },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...Platform.select({ ios: { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 8 }, web: { boxShadow: '0px 4px 8px rgba(255, 203, 5, 0.3)' } }) },
  fabSecondary: { backgroundColor: COLORS.cardBgLight, width: 48, height: 48, borderRadius: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContainer: { maxHeight: '90%' },
  modalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '100%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  modalBody: { padding: 20 },
  modalFooter: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  cancelButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.cardBgLight, alignItems: 'center' },
  cancelButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '500' },
  saveButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveButtonText: { color: COLORS.background, fontSize: 16, fontWeight: '700' },
  inputLabel: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 8, marginTop: 16, fontWeight: '500' },
  input: { backgroundColor: COLORS.cardBgLight, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', gap: 12 },
  priceField: { flex: 1 },
  imagePicker: { backgroundColor: COLORS.cardBgLight, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  imagePickerPlaceholder: { height: 120, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: 200, resizeMode: 'contain' },
  conditionOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginRight: 8 },
  conditionOptionText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  tagOptionText: { color: COLORS.text, fontSize: 13, fontWeight: '500' },
  profileModalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  balanceCard: { backgroundColor: COLORS.cardBgLight, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: COLORS.primary },
  balanceLabel: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 8 },
  balanceValue: { color: COLORS.primary, fontSize: 36, fontWeight: 'bold' },
  profileSection: { marginBottom: 20 },
  profileSectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  validatedCardItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.cardBgLight, padding: 12, borderRadius: 8, marginBottom: 8 },
  validatedCardName: { color: COLORS.text, fontSize: 14, flex: 1 },
  validatedCardReward: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  pendingCardItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.cardBgLight, padding: 12, borderRadius: 8, marginBottom: 8 },
  pendingCardName: { color: COLORS.text, fontSize: 14, flex: 1 },
  resubmitLink: { color: COLORS.secondary, fontSize: 12, fontWeight: '600' },
  statsModalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statBox: { width: '30%', backgroundColor: COLORS.cardBgLight, borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue: { color: COLORS.text, fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  hunterItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBgLight, padding: 12, borderRadius: 8, marginBottom: 8 },
  hunterRank: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold', width: 40 },
  hunterName: { color: COLORS.text, fontSize: 14, flex: 1 },
  hunterStats: { color: COLORS.textSecondary, fontSize: 12 },
  usersModalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  userItem: { backgroundColor: COLORS.cardBgLight, borderRadius: 12, padding: 16, marginBottom: 12, position: 'relative' },
  userInfo: { marginBottom: 12 },
  userName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  userContact: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },
  userPaypal: { color: COLORS.primary, fontSize: 12, marginTop: 4 },
  roleButtons: { flexDirection: 'row', gap: 8 },
  roleButton: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.cardBg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  roleButtonText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  deleteUserBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
  photoModalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  photoInstructions: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginVertical: 16 },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photoBox: { flex: 1, aspectRatio: 3/4, backgroundColor: COLORS.cardBgLight, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoLabel: { color: COLORS.textMuted, marginTop: 8, fontSize: 14 },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  submitButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: COLORS.cardBgLight },
  submitButtonText: { color: COLORS.background, fontSize: 16, fontWeight: '700' },
  detailModalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  detailPhoto: { flex: 1, aspectRatio: 3/4, borderRadius: 8, resizeMode: 'cover' },
  submittedBy: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8 },
  submissionCard: { backgroundColor: COLORS.cardBgLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  submissionBy: { color: COLORS.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  submissionPhoto: { flex: 1, aspectRatio: 3/4, borderRadius: 8, resizeMode: 'cover' },
  submissionActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  validateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.success, borderRadius: 8, padding: 12 },
  validateButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  rejectButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.danger, borderRadius: 8, padding: 12 },
  rejectButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  noPhotos: { alignItems: 'center', padding: 32 },
  noPhotosText: { color: COLORS.textMuted, fontSize: 14, marginTop: 12 },
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  popupContent: { backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 32, alignItems: 'center', width: '100%', maxWidth: 320 },
  popupTitle: { color: COLORS.text, fontSize: 22, fontWeight: 'bold', marginTop: 16 },
  popupText: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  instagramButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E1306C', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, width: '100%', justifyContent: 'center' },
  instagramButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  popupClose: { marginTop: 16 },
  popupCloseText: { color: COLORS.textMuted, fontSize: 14 },
  rejectModalContent: { backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 },
  rejectTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  rejectActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  rejectConfirmButton: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.danger, alignItems: 'center' },
  rejectConfirmText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  notifItem: { backgroundColor: COLORS.cardBgLight, padding: 12, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: COLORS.secondary },
  notifError: { borderLeftColor: COLORS.danger },
  notifSuccess: { borderLeftColor: COLORS.success },
  notifText: { color: COLORS.text, fontSize: 14 },
  tagModalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  newTagForm: { marginTop: 16, gap: 12 },
  colorPicker: { flexDirection: 'row', marginVertical: 8 },
  colorOption: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  colorOptionSelected: { borderWidth: 3, borderColor: COLORS.text },
  addTagButton: { backgroundColor: COLORS.primary, width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tagsList: { marginTop: 20 },
  tagItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBgLight, padding: 12, borderRadius: 10, marginBottom: 8 },
  tagColorDot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
  tagItemName: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '500' },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 16, marginHorizontal: 16, marginVertical: 8, backgroundColor: COLORS.cardBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  loadMoreText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  cardCountText: { textAlign: 'center', color: COLORS.textMuted, fontSize: 13, paddingVertical: 8 },
});
