import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Condition options
const CONDITIONS = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Poor'];

// Tag colors
const TAG_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16'
];

interface Card {
  id: string;
  name: string;
  image?: string;
  price_min?: number;
  price_max?: number;
  condition: string;
  tags: string[];
  notes?: string;
  deadline?: string;
  found: boolean;
  found_by?: string;
  found_at?: string;
  created_at: string;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

export default function Index() {
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
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
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Card form state
  const [cardForm, setCardForm] = useState({
    name: '',
    image: '',
    price_min: '',
    price_max: '',
    condition: 'Good',
    tags: [] as string[],
    notes: '',
    deadline: '',
  });

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
      const savedIsAdmin = await AsyncStorage.getItem('isAdmin');
      if (savedName) {
        setUserName(savedName);
        setIsAdmin(savedIsAdmin === 'true');
        setIsLoggedIn(true);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!userName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer votre nom');
      return;
    }

    setAuthLoading(true);
    try {
      // Check if admin
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password || '' }),
      });
      
      const data = await response.json();
      const adminStatus = data.is_admin || false;
      
      await AsyncStorage.setItem('userName', userName);
      await AsyncStorage.setItem('isAdmin', adminStatus.toString());
      
      setIsAdmin(adminStatus);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Login error:', error);
      // Allow login even if API fails (offline mode)
      await AsyncStorage.setItem('userName', userName);
      await AsyncStorage.setItem('isAdmin', 'false');
      setIsAdmin(false);
      setIsLoggedIn(true);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userName');
    await AsyncStorage.removeItem('isAdmin');
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUserName('');
    setPassword('');
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
      Alert.alert('Erreur', 'Impossible de charger les cartes');
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

  // Reload when filters change
  useEffect(() => {
    if (isLoggedIn) {
      loadCards();
    }
  }, [searchQuery, selectedCondition, showFoundOnly, selectedTags]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCardForm(prev => ({
        ...prev,
        image: `data:image/jpeg;base64,${result.assets[0].base64}`
      }));
    }
  };

  const openCardModal = (card?: Card) => {
    if (card) {
      setEditingCard(card);
      setCardForm({
        name: card.name,
        image: card.image || '',
        price_min: card.price_min?.toString() || '',
        price_max: card.price_max?.toString() || '',
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
        price_min: '',
        price_max: '',
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
      Alert.alert('Erreur', 'Le nom de la carte est requis');
      return;
    }

    try {
      const payload = {
        name: cardForm.name,
        image: cardForm.image || null,
        price_min: cardForm.price_min ? parseFloat(cardForm.price_min) : null,
        price_max: cardForm.price_max ? parseFloat(cardForm.price_max) : null,
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
      Alert.alert('Erreur', 'Impossible de sauvegarder la carte');
    }
  };

  const deleteCard = async (cardId: string) => {
    // Use window.confirm on web, Alert on mobile
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Voulez-vous vraiment supprimer cette carte ?');
      if (confirmed) {
        try {
          const response = await fetch(`${API_URL}/api/cards/${cardId}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            loadCards();
          } else {
            alert('Erreur: Impossible de supprimer la carte');
          }
        } catch (error) {
          alert('Erreur: Impossible de supprimer la carte');
        }
      }
    } else {
      Alert.alert(
        'Confirmer',
        'Voulez-vous vraiment supprimer cette carte ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: async () => {
              try {
                await fetch(`${API_URL}/api/cards/${cardId}`, {
                  method: 'DELETE',
                });
                loadCards();
              } catch (error) {
                Alert.alert('Erreur', 'Impossible de supprimer la carte');
              }
            },
          },
        ]
      );
    }
  };

  const markAsFound = async (cardId: string) => {
    try {
      await fetch(`${API_URL}/api/cards/${cardId}/found`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ found_by: userName }),
      });
      loadCards();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de marquer comme trouvé');
    }
  };

  const markAsUnfound = async (cardId: string) => {
    try {
      await fetch(`${API_URL}/api/cards/${cardId}/unfound`, {
        method: 'POST',
      });
      loadCards();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de réinitialiser');
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) {
      Alert.alert('Erreur', 'Le nom du tag est requis');
      return;
    }

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
      } else {
        const error = await response.json();
        Alert.alert('Erreur', error.detail || 'Tag déjà existant');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de créer le tag');
    }
  };

  const deleteTag = async (tagId: string) => {
    try {
      await fetch(`${API_URL}/api/tags/${tagId}`, { method: 'DELETE' });
      loadTags();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de supprimer le tag');
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
      case 'Mint': return '#10B981';
      case 'Near Mint': return '#34D399';
      case 'Excellent': return '#3B82F6';
      case 'Good': return '#F59E0B';
      case 'Poor': return '#EF4444';
      default: return '#6B7280';
    }
  };

  // Auth loading screen
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
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
            <Ionicons name="albums" size={64} color="#3B82F6" />
            <Text style={styles.authTitle}>Pokémon Card Tracker</Text>
            <Text style={styles.authSubtitle}>Gérez votre recherche de cartes</Text>

            <TextInput
              style={styles.authInput}
              placeholder="Votre nom"
              placeholderTextColor="#9CA3AF"
              value={userName}
              onChangeText={setUserName}
            />

            <TextInput
              style={styles.authInput}
              placeholder="Mot de passe admin (optionnel)"
              placeholderTextColor="#9CA3AF"
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

  // Main app
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Cartes Pokémon</Text>
          <View style={styles.roleTag}>
            <Text style={styles.roleText}>
              {isAdmin ? 'Admin' : 'Équipe'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="filter" size={22} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher une carte..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          {/* Tags Filter */}
          <Text style={styles.filterLabel}>Tags</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
            {tags.map(tag => (
              <TouchableOpacity
                key={tag.id}
                style={[
                  styles.filterTag,
                  { backgroundColor: selectedTags.includes(tag.name) ? tag.color : '#374151' }
                ]}
                onPress={() => toggleFilterTag(tag.name)}
              >
                <Text style={styles.filterTagText}>{tag.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Condition Filter */}
          <Text style={styles.filterLabel}>Condition</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
            {CONDITIONS.map(cond => (
              <TouchableOpacity
                key={cond}
                style={[
                  styles.filterTag,
                  { backgroundColor: selectedCondition === cond ? getConditionColor(cond) : '#374151' }
                ]}
                onPress={() => setSelectedCondition(selectedCondition === cond ? null : cond)}
              >
                <Text style={styles.filterTagText}>{cond}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Found Status Filter */}
          <Text style={styles.filterLabel}>Statut</Text>
          <View style={styles.statusFilters}>
            <TouchableOpacity
              style={[
                styles.statusButton,
                showFoundOnly === null && styles.statusButtonActive
              ]}
              onPress={() => setShowFoundOnly(null)}
            >
              <Text style={styles.statusButtonText}>Tous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statusButton,
                showFoundOnly === false && styles.statusButtonActive
              ]}
              onPress={() => setShowFoundOnly(false)}
            >
              <Text style={styles.statusButtonText}>À trouver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statusButton,
                showFoundOnly === true && styles.statusButtonActive
              ]}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#3B82F6" style={styles.loader} />
        ) : cards.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="albums-outline" size={64} color="#4B5563" />
            <Text style={styles.emptyText}>Aucune carte</Text>
            {isAdmin && (
              <Text style={styles.emptyHint}>Appuyez sur + pour ajouter une carte</Text>
            )}
          </View>
        ) : (
          cards.map(card => (
            <View
              key={card.id}
              style={[
                styles.card,
                card.found && styles.cardFound
              ]}
            >
              {card.image ? (
                <Image source={{ uri: card.image }} style={styles.cardImage} />
              ) : (
                <View style={styles.cardImagePlaceholder}>
                  <Ionicons name="image-outline" size={40} color="#6B7280" />
                </View>
              )}
              
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{card.name}</Text>
                
                <View style={styles.cardMeta}>
                  <View style={[styles.conditionBadge, { backgroundColor: getConditionColor(card.condition) }]}>
                    <Text style={styles.conditionText}>{card.condition}</Text>
                  </View>
                  
                  {(card.price_min || card.price_max) && (
                    <Text style={styles.priceText}>
                      {card.price_min && card.price_max
                        ? `${card.price_min}€ - ${card.price_max}€`
                        : card.price_min
                          ? `Min: ${card.price_min}€`
                          : `Max: ${card.price_max}€`
                      }
                    </Text>
                  )}
                </View>

                {card.tags.length > 0 && (
                  <View style={styles.cardTags}>
                    {card.tags.map(tagName => {
                      const tag = tags.find(t => t.name === tagName);
                      return (
                        <View
                          key={tagName}
                          style={[styles.cardTag, { backgroundColor: tag?.color || '#374151' }]}
                        >
                          <Text style={styles.cardTagText}>{tagName}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {card.found && (
                  <View style={styles.foundInfo}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.foundText}>Trouvé par {card.found_by}</Text>
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
                    onPress={() => markAsFound(card.id)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={28} color="#10B981" />
                  </TouchableOpacity>
                ) : isAdmin ? (
                  <TouchableOpacity
                    style={styles.unfoundButton}
                    onPress={() => markAsUnfound(card.id)}
                  >
                    <Ionicons name="refresh" size={24} color="#F59E0B" />
                  </TouchableOpacity>
                ) : null}

                {isAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => openCardModal(card)}
                    >
                      <Ionicons name="create-outline" size={24} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteCard(card.id)}
                    >
                      <Ionicons name="trash-outline" size={24} color="#EF4444" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
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
            <Ionicons name="pricetag" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => openCardModal()}
          >
            <Ionicons name="add" size={32} color="#FFF" />
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
                  <Ionicons name="close" size={28} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.inputLabel}>Nom *</Text>
                <TextInput
                  style={styles.input}
                  value={cardForm.name}
                  onChangeText={text => setCardForm(prev => ({ ...prev, name: text }))}
                  placeholder="Ex: Pikachu VMAX"
                  placeholderTextColor="#6B7280"
                />

                <Text style={styles.inputLabel}>Image</Text>
                <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                  {cardForm.image ? (
                    <Image source={{ uri: cardForm.image }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.imagePickerPlaceholder}>
                      <Ionicons name="camera" size={32} color="#6B7280" />
                      <Text style={styles.imagePickerText}>Choisir une image</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <Text style={styles.inputLabel}>Prix min (€)</Text>
                    <TextInput
                      style={styles.input}
                      value={cardForm.price_min}
                      onChangeText={text => setCardForm(prev => ({ ...prev, price_min: text }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#6B7280"
                    />
                  </View>
                  <View style={styles.priceField}>
                    <Text style={styles.inputLabel}>Prix max (€)</Text>
                    <TextInput
                      style={styles.input}
                      value={cardForm.price_max}
                      onChangeText={text => setCardForm(prev => ({ ...prev, price_max: text }))}
                      keyboardType="decimal-pad"
                      placeholder="100"
                      placeholderTextColor="#6B7280"
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
                        { backgroundColor: cardForm.condition === cond ? getConditionColor(cond) : '#374151' }
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
                        { backgroundColor: cardForm.tags.includes(tag.name) ? tag.color : '#374151' }
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
                  placeholderTextColor="#6B7280"
                  multiline
                  numberOfLines={3}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowCardModal(false)}
                >
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

      {/* Tag Modal */}
      <Modal visible={showTagModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.tagModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gérer les tags</Text>
              <TouchableOpacity onPress={() => setShowTagModal(false)}>
                <Ionicons name="close" size={28} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.newTagForm}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newTagName}
                onChangeText={setNewTagName}
                placeholder="Nouveau tag..."
                placeholderTextColor="#6B7280"
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
                <Ionicons name="add" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tagsList}>
              {tags.map(tag => (
                <View key={tag.id} style={styles.tagItem}>
                  <View style={[styles.tagColorDot, { backgroundColor: tag.color }]} />
                  <Text style={styles.tagItemName}>{tag.name}</Text>
                  <TouchableOpacity onPress={() => deleteTag(tag.id)}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
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
    backgroundColor: '#111827',
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
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
  },
  authSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    marginBottom: 32,
  },
  authInput: {
    width: '100%',
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 16,
    color: '#FFF',
    fontSize: 16,
    marginBottom: 16,
  },
  authButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  authButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  authHint: {
    color: '#6B7280',
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
    backgroundColor: '#1F2937',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  roleTag: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
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
    backgroundColor: '#1F2937',
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
  },

  // Filter styles
  filtersPanel: {
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  filterLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 12,
  },
  tagsRow: {
    flexDirection: 'row',
  },
  filterTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  filterTagText: {
    color: '#FFF',
    fontSize: 13,
  },
  statusFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#3B82F6',
  },
  statusButtonText: {
    color: '#FFF',
    fontSize: 13,
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
    color: '#6B7280',
    fontSize: 18,
    marginTop: 16,
  },
  emptyHint: {
    color: '#4B5563',
    fontSize: 14,
    marginTop: 8,
  },

  // Card styles
  card: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardFound: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  cardImage: {
    width: 100,
    height: 140,
  },
  cardImagePlaceholder: {
    width: 100,
    height: 140,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
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
    color: '#FFF',
    fontSize: 11,
    fontWeight: '500',
  },
  priceText: {
    color: '#9CA3AF',
    fontSize: 13,
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
    color: '#FFF',
    fontSize: 11,
  },
  foundInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  foundText: {
    color: '#10B981',
    fontSize: 12,
  },
  cardNotes: {
    color: '#6B7280',
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
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabSecondary: {
    backgroundColor: '#6B7280',
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '90%',
  },
  modalContent: {
    backgroundColor: '#1F2937',
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
    borderBottomColor: '#374151',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Form styles
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  priceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceField: {
    flex: 1,
  },
  imagePicker: {
    backgroundColor: '#374151',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePickerPlaceholder: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerText: {
    color: '#6B7280',
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
    color: '#FFF',
    fontSize: 14,
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
    color: '#FFF',
    fontSize: 13,
  },

  // Tag modal styles
  tagModalContent: {
    backgroundColor: '#1F2937',
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
    borderColor: '#FFF',
  },
  addTagButton: {
    backgroundColor: '#3B82F6',
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
    backgroundColor: '#374151',
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
    color: '#FFF',
    fontSize: 15,
  },
});
