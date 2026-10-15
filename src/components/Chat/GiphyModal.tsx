/**
 * src/components/Chat/GiphyModal.tsx
 *
 * Giphy GIF picker modal for React Native.
 * Uses standard fetch() to query the Giphy REST API (trending & search)
 * using process.env.EXPO_PUBLIC_GIPHY_API_KEY.
 *
 * Strictly uses React Native primitives: Modal, View, Text, TextInput, Pressable, FlatList, Image.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface GiphyModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string, title?: string) => void;
}

interface GiphyItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
}

// Fallback high-quality curated GIFs in case API key is missing or quota exceeded
const FALLBACK_GIFS: GiphyItem[] = [
  {
    id: 'f1',
    title: 'Thumbs Up',
    url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/111ebonMs90YLu/200.gif',
  },
  {
    id: 'f2',
    title: 'Applause',
    url: 'https://media.giphy.com/media/nbvFVPiEiJH6JOGIok/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/nbvFVPiEiJH6JOGIok/200.gif',
  },
  {
    id: 'f3',
    title: 'Laughing',
    url: 'https://media.giphy.com/media/bC9czlgCMtw4cj8RgH/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/bC9czlgCMtw4cj8RgH/200.gif',
  },
  {
    id: 'f4',
    title: 'Excited Dance',
    url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/blSTtZehjAZ8I/200.gif',
  },
  {
    id: 'f5',
    title: 'Mind Blown',
    url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/200.gif',
  },
  {
    id: 'f6',
    title: 'Cheering',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/200.gif',
  },
  {
    id: 'f7',
    title: 'Salute',
    url: 'https://media.giphy.com/media/fxsAcheaMi1PnxPJaf/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/fxsAcheaMi1PnxPJaf/200.gif',
  },
  {
    id: 'f8',
    title: 'High Five',
    url: 'https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/200.gif',
  },
];

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 48) / 2;

export const GiphyModal: React.FC<GiphyModalProps> = ({
  visible,
  onClose,
  onSelectGif,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY || '';

  const fetchGifs = useCallback(
    async (query: string) => {
      setIsLoading(true);
      setStatusMessage(null);

      // Check if API key is invalid or placeholder
      const isPlaceholderKey =
        !apiKey ||
        apiKey.includes('ain') ||
        apiKey.includes('placeholder') ||
        apiKey.length < 10;

      if (isPlaceholderKey) {
        // Filter fallback GIFs by query if query exists
        const filtered = query.trim()
          ? FALLBACK_GIFS.filter((g) =>
              g.title.toLowerCase().includes(query.toLowerCase()),
            )
          : FALLBACK_GIFS;
        setGifs(filtered);
        setIsLoading(false);
        setStatusMessage('Showing sample GIFs (configure EXPO_PUBLIC_GIPHY_API_KEY)');
        return;
      }

      try {
        const endpoint = query.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(
              query.trim(),
            )}&limit=30&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=30&rating=g`;

        const res = await fetch(endpoint);
        if (!res.ok) {
          throw new Error(`Giphy API responded with status ${res.status}`);
        }

        const json = await res.json();
        const rawItems = json?.data || [];

        const mapped: GiphyItem[] = rawItems
          .filter((item: any) => item?.images?.fixed_height?.url || item?.images?.original?.url)
          .map((item: any) => ({
            id: item.id,
            title: item.title || 'GIF',
            url: item.images?.downsized?.url || item.images?.original?.url,
            previewUrl:
              item.images?.fixed_height_small?.url ||
              item.images?.fixed_height?.url ||
              item.images?.original?.url,
          }));

        setGifs(mapped);
      } catch (err: any) {
        console.warn('Giphy fetch error:', err?.message);
        // Fallback to sample reaction GIFs on error
        const filtered = query.trim()
          ? FALLBACK_GIFS.filter((g) =>
              g.title.toLowerCase().includes(query.toLowerCase()),
            )
          : FALLBACK_GIFS;
        setGifs(filtered);
        setStatusMessage('Giphy search unavailable — showing sample GIFs');
      } finally {
        setIsLoading(false);
      }
    },
    [apiKey],
  );

  useEffect(() => {
    if (visible) {
      fetchGifs(searchQuery);
    }
  }, [visible, fetchGifs]);

  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchGifs(text);
    }, 400);
  };

  const handleClear = () => {
    setSearchQuery('');
    fetchGifs('');
  };

  const handleSelect = (item: GiphyItem) => {
    onSelectGif(item.url, item.title);
    onClose();
  };

  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.main }]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Choose a GIF
            </Text>
            <Text style={[styles.giphyBrand, { color: colors.primary }]}>
              via GIPHY
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.closeButtonText, { color: colors.muted }]}>
              ✕
            </Text>
          </Pressable>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputWrapper,
              {
                backgroundColor: colors.surface,
                borderColor: borderColor,
              },
            ]}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search all the GIFs..."
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={handleQueryChange}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearBtn}>
                <Text style={[styles.clearBtnText, { color: colors.muted }]}>
                  ✕
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Status / Notice if fallback */}
        {statusMessage && (
          <View style={styles.statusBanner}>
            <Text style={[styles.statusText, { color: colors.muted }]}>
              {statusMessage}
            </Text>
          </View>
        )}

        {/* Grid of GIFs */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>
              Loading GIFs…
            </Text>
          </View>
        ) : gifs.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyIcon}>🎬</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No GIFs Found
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Try searching for different keywords
            </Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.gifCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: borderColor,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Image
                  source={{ uri: item.previewUrl }}
                  style={styles.gifImage}
                  resizeMode="cover"
                />
                {item.title ? (
                  <View style={styles.gifLabelContainer}>
                    <Text
                      numberOfLines={1}
                      style={[styles.gifTitle, { color: colors.muted }]}
                    >
                      {item.title}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  giphyBrand: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusBanner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
    gap: 12,
  },
  gifCard: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 0.9,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 12,
    marginBottom: 12,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  gifLabelContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(5, 10, 14, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  gifTitle: {
    fontSize: 10,
    fontWeight: '500',
  },
});

export default GiphyModal;
