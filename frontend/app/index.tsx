import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Pokecollection.fr inspired colors
const COLORS = {
  background: '#0a0a0a',
  cardBg: '#1a1a1a',
  cardBgLight: '#252525',
  primary: '#FFCB05',      // Pokemon Yellow
  secondary: '#3B4CCA',    // Pokemon Blue
  accent: '#FF5350',       // Pokemon Red
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  vip: '#A855F7',          // Purple for VIP
  border: '#333333',
};

// Condition options
const CONDITIONS = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Poor'];

// Tag colors - Pokemon themed
const TAG_COLORS = [
  '#FFCB05', '#3B4CCA', '#FF5350', '#10B981', '#A855F7',
  '#EC4899', '#06B6D4', '#84CC16'
];

interface Card {
  id: string;
  name: string;
  image?: string;
  has_image?: boolean;
  price?: number;
  reward?: number;
  condition: string;
  tags: string[];
  notes?: string;
  deadline?: string;
  found: boolean;
  found_by?: string;
  found_at?: string;
  validated?: boolean;
  submission_count?: number;
  validated_submission?: PhotoSubmission;
  photo_submissions?: PhotoSubmission[];
  created_at: string;
}

interface PhotoSubmission {
  id: string;
  front_image: string;
  back_image: string;
  submitted_by: string;
  user_contact: string;
  submitted_at: string;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface User {
  id: string;
  name: string;
  contact: string;
  role: string;
}

// Lazy loading card image component
const CardImage = memo(({ cardId, hasImage }: { cardId: string; hasImage: boolean }) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadImage = async () => {
    if (loaded || loading || !hasImage) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/cards/${cardId}`);
      const card = await response.json();
      if (card.image) {
        setImageData(card.image);
      }
    } catch (error) {
      console.error('Error loading image:', error);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (hasImage && !loaded) {
      loadImage();
    }
  }, [hasImage]);

  if (!hasImage) {
    return (
      <View style={styles.cardImagePlaceholder}>
        <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.cardImagePlaceholder}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (imageData) {
    return <Image source={{ uri: imageData }} style={styles.cardImage} />;
  }

  return (
    <View style={styles.cardImagePlaceholder}>
      <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
    </View>
  );
});

export default function Index() {
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userContact, setUserContact] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [showFoundOnly, setShowFoundOnly] = useState<boolean | null>(null);

  // Modal state
  const [showCardModal, setShowCardModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showCardDetailModal, setShowCardDetailModal] = useState(false);
  const [showInstagramPopup, setShowInstagramPopup] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Card form state
  const [cardForm, setCardForm] = useState({
    name: '',
    image: '',
    price: '',
    reward: '',
    condition: 'Good',
    tags: [] as string[],
    notes: '',
    deadline: '',
  });

  // Photo submission state
  const [frontPhoto, setFrontPhoto] = useState('');
  const [backPhoto, setBackPhoto] = useState('');

  // Tag form state
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  // Check saved auth on mount
  useEffect(() => {
    checkSavedAuth();
  }, []);

  // Load data when logged in
  useEffect(() => {
    if (isLoggedIn) {
      loadData();
    }
  }, [isLoggedIn]);

  const checkSavedAuth = async () => {
    try {
      const savedName = await AsyncStorage.getItem('userName');
      const savedContact = await AsyncStorage.getItem('userContact');
      const savedIsAdmin = await AsyncStorage.getItem('isAdmin');
      const savedIsVip = await AsyncStorage.getItem('isVip');
      const savedUserId = await AsyncStorage.getItem('userId');
      
      if (savedName && savedContact) {
        setUserName(savedName);
        setUserContact(savedContact);
        setIsAdmin(savedIsAdmin === 'true');
        setIsVip(savedIsVip === 'true');
        setUserId(savedUserId || '');
        setIsLoggedIn(true);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const validateContact = (contact: string): boolean => {
    // Check if it's an Instagram handle (starts with @) or a French phone number (starts with 06 or 07)
    const isInstagram = contact.startsWith('@') && contact.length > 1;
    const isPhone = /^0[67]\d{8}$/.test(contact.replace(/\s/g, ''));
    return isInstagram || isPhone;
  };

  const handleLogin = async () => {
    if (!userName.trim()) {
      if (Platform.OS === 'web') {
        alert('Veuillez entrer votre nom');
      } else {
        Alert.alert('Erreur', 'Veuillez entrer votre nom');
      }
      return;
    }

    if (!userContact.trim()) {
      if (Platform.OS === 'web') {
        alert('Veuillez entrer votre Instagram (@pseudo) ou téléphone (06...)');
      } else {
        Alert.alert('Erreur', 'Veuillez entrer votre Instagram (@pseudo) ou téléphone (06...)');
      }
      return;
    }

    if (!validateContact(userContact)) {
      if (Platform.OS === 'web') {
        alert('Contact invalide. Utilisez @pseudo pour Instagram ou 06/07xxxxxxxx pour le téléphone');
      } else {
        Alert.alert('Erreur', 'Contact invalide. Utilisez @pseudo pour Instagram ou 06/07xxxxxxxx pour le téléphone');
      }
      return;
    }

    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: userName,
          contact: userContact,
          password: password || null 
        }),
      });
      
      const data = await response.json();
      
      await AsyncStorage.setItem('userName', userName);
      await AsyncStorage.setItem('userContact', userContact);
      await AsyncStorage.setItem('isAdmin', data.is_admin.toString());
      await AsyncStorage.setItem('isVip', data.is_vip.toString());
      await AsyncStorage.setItem('userId', data.user_id);
      
      setIsAdmin(data.is_admin);
      setIsVip(data.is_vip);
      setUserId(data.user_id);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Login error:', error);
      if (Platform.OS === 'web') {
        alert('Erreur de connexion');
      } else {
        Alert.alert('Erreur', 'Erreur de connexion');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userName', 'userContact', 'isAdmin', 'isVip', 'userId']);
    setIsLoggedIn(false);
    setIsAdmin(false);
    setIsVip(false);
    setUserName('');
    setUserContact('');
    setPassword('');
    setUserId('');
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadCards(), loadTags()]);
    } finally {
      setLoading(false);
    }
  };

  const loadCards = async () => {
    try {
      let url = `${API_URL}/api/cards?`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      if (selectedCondition) url += `condition=${encodeURIComponent(selectedCondition)}&`;
      if (showFoundOnly !== null) url += `found=${showFoundOnly}&`;
      if (selectedTags.length > 0) url += `tag=${encodeURIComponent(selectedTags[0])}&`;
      
      const response = await fetch(url);
      const data = await response.json();
      setCards(data);
    } catch (error) {
      console.error('Error loading cards:', error);
    }
  };

  const loadTags = async () => {
    try {
      const response = await fetch(`${API_URL}/api/tags`);
      const data = await response.json();
      setTags(data);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [searchQuery, selectedCondition, showFoundOnly, selectedTags]);

  useEffect(() => {
    if (isLoggedIn) {
      loadCards();
    }
  }, [searchQuery, selectedCondition, showFoundOnly, selectedTags]);

  const pickImage = async (type: 'main' | 'front' | 'back') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'main' ? [3, 4] : [3, 4],
      quality: type === 'main' ? 0.5 : 0.9, // High quality for front/back
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const imageData = `data:image/jpeg;base64,${result.assets[0].base64}`;
      
      if (type === 'main') {
        setCardForm(prev => ({ ...prev, image: imageData }));
      } else if (type === 'front') {
        setFrontPhoto(imageData);
      } else {
        setBackPhoto(imageData);
      }
    }
  };

  const openCardModal = (card?: Card) => {
    if (card) {
      setEditingCard(card);
      setCardForm({
        name: card.name,
        image: card.image || '',
        price: card.price?.toString() || '',
        reward: card.reward?.toString() || '',
        condition: card.condition,
        tags: card.tags || [],
        notes: card.notes || '',
        deadline: card.deadline || '',
      });
    } else {
      setEditingCard(null);
      setCardForm({
        name: '',
        image: '',
        price: '',
        reward: '',
        condition: 'Good',
        tags: [],
        notes: '',
        deadline: '',
      });
    }
    setShowCardModal(true);
  };

  const saveCard = async () => {
    if (!cardForm.name.trim()) {
      if (Platform.OS === 'web') {
        alert('Le nom de la carte est requis');
      } else {
        Alert.alert('Erreur', 'Le nom de la carte est requis');
      }
      return;
    }

    try {
      const payload = {
        name: cardForm.name,
        image: cardForm.image || null,
        price: cardForm.price ? parseFloat(cardForm.price) : null,
        reward: cardForm.reward ? parseFloat(cardForm.reward) : null,
        condition: cardForm.condition,
        tags: cardForm.tags,
        notes: cardForm.notes || null,
        deadline: cardForm.deadline || null,
      };

      const url = editingCard
        ? `${API_URL}/api/cards/${editingCard.id}`
        : `${API_URL}/api/cards`;
      
      const response = await fetch(url, {
        method: editingCard ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowCardModal(false);
        loadCards();
      } else {
        throw new Error('Failed to save card');
      }
    } catch (error) {
      console.error('Error saving card:', error);
      if (Platform.OS === 'web') {
        alert('Impossible de sauvegarder la carte');
      } else {
        Alert.alert('Erreur', 'Impossible de sauvegarder la carte');
      }
    }
  };

  const deleteCard = async (cardId: string) => {
    const confirmDelete = async () => {
      try {
        await fetch(`${API_URL}/api/cards/${cardId}`, { method: 'DELETE' });
        loadCards();
      } catch (error) {
        if (Platform.OS === 'web') {
          alert('Impossible de supprimer la carte');
        } else {
          Alert.alert('Erreur', 'Impossible de supprimer la carte');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Voulez-vous vraiment supprimer cette carte ?')) {
        await confirmDelete();
      }
    } else {
      Alert.alert('Confirmer', 'Voulez-vous vraiment supprimer cette carte ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const markAsFound = async (card: Card) => {
    try {
      await fetch(`${API_URL}/api/cards/${card.id}/found`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          found_by: userName,
          user_contact: userContact,
          is_vip: isVip
        }),
      });
      
      loadCards();
      
      // Show photo modal for non-VIP users
      if (!isVip) {
        setSelectedCard(card);
        setFrontPhoto('');
        setBackPhoto('');
        setShowPhotoModal(true);
      } else {
        // VIP users - show Instagram popup
        setShowInstagramPopup(true);
      }
    } catch (error) {
      if (Platform.OS === 'web') {
        alert('Impossible de marquer comme trouvé');
      } else {
        Alert.alert('Erreur', 'Impossible de marquer comme trouvé');
      }
    }
  };

  const submitPhotos = async () => {
    if (!frontPhoto || !backPhoto) {
      if (Platform.OS === 'web') {
        alert('Veuillez prendre les deux photos (recto et verso)');
      } else {
        Alert.alert('Erreur', 'Veuillez prendre les deux photos (recto et verso)');
      }
      return;
    }

    if (!selectedCard) return;

    try {
      await fetch(`${API_URL}/api/cards/${selectedCard.id}/submit-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front_image: frontPhoto,
          back_image: backPhoto,
          submitted_by: userName,
          user_contact: userContact,
        }),
      });
      
      setShowPhotoModal(false);
      setShowInstagramPopup(true);
      loadCards();
    } catch (error) {
      if (Platform.OS === 'web') {
        alert('Impossible d\'envoyer les photos');
      } else {
        Alert.alert('Erreur', 'Impossible d\'envoyer les photos');
      }
    }
  };

  const openInstagram = () => {
    Linking.openURL('https://instagram.com/quintus_tcg');
    setShowInstagramPopup(false);
  };

  const openCardDetail = async (cardId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/cards/${cardId}`);
      const card = await response.json();
      setSelectedCard(card);
      setShowCardDetailModal(true);
    } catch (error) {
      console.error('Error loading card details:', error);
    }
  };

  const validateSubmission = async (submissionId: string) => {
    if (!selectedCard) return;
    
    try {
      await fetch(`${API_URL}/api/cards/${selectedCard.id}/validate-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      
      // Reload card details
      const response = await fetch(`${API_URL}/api/cards/${selectedCard.id}`);
      const card = await response.json();
      setSelectedCard(card);
      loadCards();
    } catch (error) {
      if (Platform.OS === 'web') {
        alert('Impossible de valider');
      } else {
        Alert.alert('Erreur', 'Impossible de valider');
      }
    }
  };

  const markAsUnfound = async (cardId: string) => {
    try {
      await fetch(`${API_URL}/api/cards/${cardId}/unfound`, { method: 'POST' });
      loadCards();
      setShowCardDetailModal(false);
    } catch (error) {
      if (Platform.OS === 'web') {
        alert('Impossible de réinitialiser');
      } else {
        Alert.alert('Erreur', 'Impossible de réinitialiser');
      }
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });

      if (response.ok) {
        setNewTagName('');
        setShowTagModal(false);
        loadTags();
      }
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  const deleteTag = async (tagId: string) => {
    try {
      await fetch(`${API_URL}/api/tags/${tagId}`, { method: 'DELETE' });
      loadTags();
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  };

  const toggleFormTag = (tagName: string) => {
    setCardForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tagName)
        ? prev.tags.filter(t => t !== tagName)
        : [...prev.tags, tagName]
    }));
  };

  const toggleFilterTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'Mint': return COLORS.success;
      case 'Near Mint': return '#34D399';
      case 'Excellent': return COLORS.secondary;
      case 'Good': return COLORS.warning;
      case 'Poor': return COLORS.danger;
      default: return COLORS.textMuted;
    }
  };

  const getRoleBadge = () => {
    if (isAdmin) return { text: 'Admin', color: COLORS.accent };
    if (isVip) return { text: 'VIP', color: COLORS.vip };
    return { text: 'Équipe', color: COLORS.secondary };
  };

  // Auth loading screen
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Login screen
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.authContainer}
        >
          <View style={styles.authCard}>
            <View style={styles.logoContainer}>
              <Ionicons name="flash" size={48} color={COLORS.primary} />
              <Ionicons name="albums" size={48} color={COLORS.secondary} style={{ marginLeft: -10 }} />
            </View>
            <Text style={styles.authTitle}>PokéCollection</Text>
            <Text style={styles.authSubtitle}>Tracker de cartes</Text>

            <TextInput
              style={styles.authInput}
              placeholder="Votre nom"
              placeholderTextColor={COLORS.textMuted}
              value={userName}
              onChangeText={setUserName}
            />

            <TextInput
              style={styles.authInput}
              placeholder="Instagram (@pseudo) ou Téléphone (06...)"
              placeholderTextColor={COLORS.textMuted}
              value={userContact}
              onChangeText={setUserContact}
              autoCapitalize="none"
            />

            <TextInput
              style={styles.authInput}
              placeholder="Mot de passe admin (optionnel)"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.authButton} onPress={handleLogin}>
              <Text style={styles.authButtonText}>Entrer</Text>
            </TouchableOpacity>

            <Text style={styles.authHint}>
              Laissez le mot de passe vide pour un accès équipe
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const roleBadge = getRoleBadge();

  // Main app
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>PokéCollection</Text>
          <View style={[styles.roleTag, { backgroundColor: roleBadge.color }]}>
            <Text style={styles.roleText}>{roleBadge.text}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="filter" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher une carte..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Tags</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
            {tags.map(tag => (
              <TouchableOpacity
                key={tag.id}
                style={[
                  styles.filterTag,
                  { backgroundColor: selectedTags.includes(tag.name) ? tag.color : COLORS.cardBgLight }
                ]}
                onPress={() => toggleFilterTag(tag.name)}
              >
                <Text style={styles.filterTagText}>{tag.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>Condition</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
            {CONDITIONS.map(cond => (
              <TouchableOpacity
                key={cond}
                style={[
                  styles.filterTag,
                  { backgroundColor: selectedCondition === cond ? getConditionColor(cond) : COLORS.cardBgLight }
                ]}
                onPress={() => setSelectedCondition(selectedCondition === cond ? null : cond)}
              >
                <Text style={styles.filterTagText}>{cond}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>Statut</Text>
          <View style={styles.statusFilters}>
            <TouchableOpacity
              style={[styles.statusButton, showFoundOnly === null && styles.statusButtonActive]}
              onPress={() => setShowFoundOnly(null)}
            >
              <Text style={styles.statusButtonText}>Tous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusButton, showFoundOnly === false && styles.statusButtonActive]}
              onPress={() => setShowFoundOnly(false)}
            >
              <Text style={styles.statusButtonText}>À trouver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusButton, showFoundOnly === true && styles.statusButtonActive]}
              onPress={() => setShowFoundOnly(true)}
            >
              <Text style={styles.statusButtonText}>Trouvés</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cards List */}
      <ScrollView
        style={styles.cardsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
        ) : cards.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="albums-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucune carte</Text>
            {isAdmin && (
              <Text style={styles.emptyHint}>Appuyez sur + pour ajouter une carte</Text>
            )}
          </View>
        ) : (
          cards.map(card => (
            <TouchableOpacity
              key={card.id}
              style={[styles.card, card.found && styles.cardFound, card.validated && styles.cardValidated]}
              onPress={() => openCardDetail(card.id)}
            >
              <CardImage cardId={card.id} hasImage={card.has_image || !!card.image} />
              
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{card.name}</Text>
                
                <View style={styles.cardMeta}>
                  <View style={[styles.conditionBadge, { backgroundColor: getConditionColor(card.condition) }]}>
                    <Text style={styles.conditionText}>{card.condition}</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  {card.price && (
                    <View style={styles.priceBox}>
                      <Text style={styles.priceLabel}>Prix</Text>
                      <Text style={styles.priceValue}>{card.price}€</Text>
                    </View>
                  )}
                  {card.reward && (
                    <View style={[styles.priceBox, styles.rewardBox]}>
                      <Text style={styles.priceLabel}>Récompense</Text>
                      <Text style={[styles.priceValue, styles.rewardValue]}>{card.reward}€</Text>
                    </View>
                  )}
                </View>

                {card.tags.length > 0 && (
                  <View style={styles.cardTags}>
                    {card.tags.map(tagName => {
                      const tag = tags.find(t => t.name === tagName);
                      return (
                        <View
                          key={tagName}
                          style={[styles.cardTag, { backgroundColor: tag?.color || COLORS.cardBgLight }]}
                        >
                          <Text style={styles.cardTagText}>{tagName}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {card.found && (
                  <View style={styles.foundInfo}>
                    <Ionicons 
                      name={card.validated ? "checkmark-done-circle" : "checkmark-circle"} 
                      size={16} 
                      color={card.validated ? COLORS.primary : COLORS.success} 
                    />
                    <Text style={[styles.foundText, card.validated && styles.validatedText]}>
                      {card.validated ? 'Validé' : 'Trouvé'} par {card.found_by}
                    </Text>
                    {!card.validated && card.submission_count && card.submission_count > 0 && (
                      <Text style={styles.submissionCount}>({card.submission_count} photo{card.submission_count > 1 ? 's' : ''})</Text>
                    )}
                  </View>
                )}

                {card.notes && (
                  <Text style={styles.cardNotes} numberOfLines={2}>{card.notes}</Text>
                )}
              </View>

              <View style={styles.cardActions}>
                {!card.found ? (
                  <TouchableOpacity
                    style={styles.foundButton}
                    onPress={(e) => { e.stopPropagation(); markAsFound(card); }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={28} color={COLORS.success} />
                  </TouchableOpacity>
                ) : isAdmin ? (
                  <TouchableOpacity
                    style={styles.unfoundButton}
                    onPress={(e) => { e.stopPropagation(); markAsUnfound(card.id); }}
                  >
                    <Ionicons name="refresh" size={24} color={COLORS.warning} />
                  </TouchableOpacity>
                ) : null}

                {isAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={(e) => { e.stopPropagation(); openCardModal(card); }}
                    >
                      <Ionicons name="create-outline" size={24} color={COLORS.secondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={(e) => { e.stopPropagation(); deleteCard(card.id); }}
                    >
                      <Ionicons name="trash-outline" size={24} color={COLORS.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Admin FAB */}
      {isAdmin && (
        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={[styles.fab, styles.fabSecondary]}
            onPress={() => setShowTagModal(true)}
          >
            <Ionicons name="pricetag" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => openCardModal()}
          >
            <Ionicons name="add" size={32} color={COLORS.background} />
          </TouchableOpacity>
        </View>
      )}

      {/* Card Modal */}
      <Modal visible={showCardModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingCard ? 'Modifier la carte' : 'Nouvelle carte'}
                </Text>
                <TouchableOpacity onPress={() => setShowCardModal(false)}>
                  <Ionicons name="close" size={28} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.inputLabel}>Nom *</Text>
                <TextInput
                  style={styles.input}
                  value={cardForm.name}
                  onChangeText={text => setCardForm(prev => ({ ...prev, name: text }))}
                  placeholder="Ex: Pikachu VMAX"
                  placeholderTextColor={COLORS.textMuted}
                />

                <Text style={styles.inputLabel}>Image</Text>
                <TouchableOpacity style={styles.imagePicker} onPress={() => pickImage('main')}>
                  {cardForm.image ? (
                    <Image source={{ uri: cardForm.image }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.imagePickerPlaceholder}>
                      <Ionicons name="camera" size={32} color={COLORS.textMuted} />
                      <Text style={styles.imagePickerText}>Choisir une image</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <Text style={styles.inputLabel}>Prix demandé (€)</Text>
                    <TextInput
                      style={styles.input}
                      value={cardForm.price}
                      onChangeText={text => setCardForm(prev => ({ ...prev, price: text }))}
                      keyboardType="decimal-pad"
                      placeholder="50"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.priceField}>
                    <Text style={styles.inputLabel}>Récompense (€)</Text>
                    <TextInput
                      style={styles.input}
                      value={cardForm.reward}
                      onChangeText={text => setCardForm(prev => ({ ...prev, reward: text }))}
                      keyboardType="decimal-pad"
                      placeholder="5"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Condition</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.conditionRow}>
                  {CONDITIONS.map(cond => (
                    <TouchableOpacity
                      key={cond}
                      style={[
                        styles.conditionOption,
                        { backgroundColor: cardForm.condition === cond ? getConditionColor(cond) : COLORS.cardBgLight }
                      ]}
                      onPress={() => setCardForm(prev => ({ ...prev, condition: cond }))}
                    >
                      <Text style={styles.conditionOptionText}>{cond}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Tags</Text>
                <View style={styles.tagsContainer}>
                  {tags.map(tag => (
                    <TouchableOpacity
                      key={tag.id}
                      style={[
                        styles.tagOption,
                        { backgroundColor: cardForm.tags.includes(tag.name) ? tag.color : COLORS.cardBgLight }
                      ]}
                      onPress={() => toggleFormTag(tag.name)}
                    >
                      <Text style={styles.tagOptionText}>{tag.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={cardForm.notes}
                  onChangeText={text => setCardForm(prev => ({ ...prev, notes: text }))}
                  placeholder="Instructions supplémentaires..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCardModal(false)}>
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveCard}>
                  <Text style={styles.saveButtonText}>Sauvegarder</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Photo Submission Modal */}
      <Modal visible={showPhotoModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.photoModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Photos de la carte</Text>
              <TouchableOpacity onPress={() => setShowPhotoModal(false)}>
                <Ionicons name="close" size={28} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.photoInstructions}>
              Prenez des photos haute résolution du recto et verso de la carte
            </Text>

            <View style={styles.photoRow}>
              <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('front')}>
                {frontPhoto ? (
                  <Image source={{ uri: frontPhoto }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera" size={40} color={COLORS.textMuted} />
                    <Text style={styles.photoLabel}>Recto</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('back')}>
                {backPhoto ? (
                  <Image source={{ uri: backPhoto }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera" size={40} color={COLORS.textMuted} />
                    <Text style={styles.photoLabel}>Verso</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, (!frontPhoto || !backPhoto) && styles.submitButtonDisabled]} 
              onPress={submitPhotos}
              disabled={!frontPhoto || !backPhoto}
            >
              <Text style={styles.submitButtonText}>Envoyer les photos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Card Detail Modal */}
      <Modal visible={showCardDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCard?.name}</Text>
              <TouchableOpacity onPress={() => setShowCardDetailModal(false)}>
                <Ionicons name="close" size={28} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedCard?.validated_submission ? (
                <View>
                  <Text style={styles.sectionTitle}>Photos validées</Text>
                  <View style={styles.photoRow}>
                    <Image source={{ uri: selectedCard.validated_submission.front_image }} style={styles.detailPhoto} />
                    <Image source={{ uri: selectedCard.validated_submission.back_image }} style={styles.detailPhoto} />
                  </View>
                  <Text style={styles.submittedBy}>
                    Par {selectedCard.validated_submission.submitted_by}
                  </Text>
                </View>
              ) : selectedCard?.photo_submissions && selectedCard.photo_submissions.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>Soumissions en attente ({selectedCard.photo_submissions.length})</Text>
                  {selectedCard.photo_submissions.map((sub, index) => (
                    <View key={sub.id} style={styles.submissionCard}>
                      <Text style={styles.submissionBy}>
                        {sub.submitted_by} ({sub.user_contact})
                      </Text>
                      <View style={styles.photoRow}>
                        <Image source={{ uri: sub.front_image }} style={styles.submissionPhoto} />
                        <Image source={{ uri: sub.back_image }} style={styles.submissionPhoto} />
                      </View>
                      {isAdmin && (
                        <TouchableOpacity 
                          style={styles.validateButton}
                          onPress={() => validateSubmission(sub.id)}
                        >
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.text} />
                          <Text style={styles.validateButtonText}>Valider cette soumission</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.noPhotos}>
                  <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
                  <Text style={styles.noPhotosText}>Aucune photo soumise</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Instagram Popup */}
      <Modal visible={showInstagramPopup} animationType="fade" transparent>
        <View style={styles.popupOverlay}>
          <View style={styles.popupContent}>
            <Ionicons name="logo-instagram" size={48} color="#E1306C" />
            <Text style={styles.popupTitle}>Contactez-nous !</Text>
            <Text style={styles.popupText}>
              Envoyez-nous un message sur Instagram pour confirmer votre trouvaille
            </Text>
            <TouchableOpacity style={styles.instagramButton} onPress={openInstagram}>
              <Ionicons name="logo-instagram" size={24} color={COLORS.text} />
              <Text style={styles.instagramButtonText}>@quintus_tcg</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.popupClose} onPress={() => setShowInstagramPopup(false)}>
              <Text style={styles.popupCloseText}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tag Modal */}
      <Modal visible={showTagModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.tagModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gérer les tags</Text>
              <TouchableOpacity onPress={() => setShowTagModal(false)}>
                <Ionicons name="close" size={28} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.newTagForm}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newTagName}
                onChangeText={setNewTagName}
                placeholder="Nouveau tag..."
                placeholderTextColor={COLORS.textMuted}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPicker}>
                {TAG_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newTagColor === color && styles.colorOptionSelected
                    ]}
                    onPress={() => setNewTagColor(color)}
                  />
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.addTagButton} onPress={createTag}>
                <Ionicons name="add" size={24} color={COLORS.background} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tagsList}>
              {tags.map(tag => (
                <View key={tag.id} style={styles.tagItem}>
                  <View style={[styles.tagColorDot, { backgroundColor: tag.color }]} />
                  <Text style={styles.tagItemName}>{tag.name}</Text>
                  <TouchableOpacity onPress={() => deleteTag(tag.id)}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Auth styles
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  authCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 8,
  },
  authSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 32,
  },
  authInput: {
    width: '100%',
    backgroundColor: COLORS.cardBgLight,
    borderRadius: 12,
    padding: 16,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  authButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  authButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '700',
  },
  authHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },

  // Header styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  roleTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },

  // Search styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
  },

  // Filter styles
  filtersPanel: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  tagsRow: {
    flexDirection: 'row',
  },
  filterTag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterTagText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  statusFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.cardBgLight,
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: COLORS.secondary,
  },
  statusButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },

  // Cards list styles
  cardsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 48,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 18,
    marginTop: 16,
  },
  emptyHint: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
  },

  // Card styles
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardFound: {
    borderColor: COLORS.success,
    borderWidth: 2,
  },
  cardValidated: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  cardImage: {
    width: 100,
    height: 140,
  },
  cardImagePlaceholder: {
    width: 100,
    height: 140,
    backgroundColor: COLORS.cardBgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  conditionText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  priceBox: {
    backgroundColor: COLORS.cardBgLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rewardBox: {
    backgroundColor: 'rgba(255, 203, 5, 0.2)',
  },
  priceLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '500',
  },
  priceValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  rewardValue: {
    color: COLORS.primary,
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  cardTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardTagText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '500',
  },
  foundInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  foundText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '500',
  },
  validatedText: {
    color: COLORS.primary,
  },
  submissionCount: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  cardNotes: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  cardActions: {
    padding: 8,
    justifyContent: 'center',
    gap: 8,
  },
  foundButton: {
    padding: 4,
  },
  unfoundButton: {
    padding: 4,
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },

  // FAB styles
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    gap: 12,
    zIndex: 999,
    elevation: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(255, 203, 5, 0.3)',
      },
    }),
  },
  fabSecondary: {
    backgroundColor: COLORS.cardBgLight,
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '90%',
  },
  modalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.cardBgLight,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '700',
  },

  // Form styles
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.cardBgLight,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  priceField: {
    flex: 1,
  },
  imagePicker: {
    backgroundColor: COLORS.cardBgLight,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  imagePickerPlaceholder: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerText: {
    color: COLORS.textMuted,
    marginTop: 8,
  },
  previewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
  },
  conditionRow: {
    flexDirection: 'row',
  },
  conditionOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
  },
  conditionOptionText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  tagOptionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },

  // Photo modal styles
  photoModalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  photoInstructions: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 16,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  photoBox: {
    flex: 1,
    aspectRatio: 3/4,
    backgroundColor: COLORS.cardBgLight,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoLabel: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontSize: 14,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.cardBgLight,
  },
  submitButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '700',
  },

  // Detail modal styles
  detailModalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  detailPhoto: {
    flex: 1,
    aspectRatio: 3/4,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  submittedBy: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  submissionCard: {
    backgroundColor: COLORS.cardBgLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  submissionBy: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  submissionPhoto: {
    flex: 1,
    aspectRatio: 3/4,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  validateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  validateButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  noPhotos: {
    alignItems: 'center',
    padding: 32,
  },
  noPhotosText: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 12,
  },

  // Instagram popup styles
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupContent: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  popupTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
  },
  popupText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  instagramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E1306C',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    justifyContent: 'center',
  },
  instagramButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  popupClose: {
    marginTop: 16,
  },
  popupCloseText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Tag modal styles
  tagModalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  newTagForm: {
    marginTop: 16,
    gap: 12,
  },
  colorPicker: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: COLORS.text,
  },
  addTagButton: {
    backgroundColor: COLORS.primary,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagsList: {
    marginTop: 20,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBgLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  tagColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  tagItemName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
});
