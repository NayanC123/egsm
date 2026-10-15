/**
 * src/components/Chat/VoiceMessagePlayer.tsx
 *
 * Inline audio player for chat voice messages.
 * Uses expo-av Audio.Sound with play/pause controls, progress scrubber,
 * duration timer, and clean resource unloading.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useTheme } from '../../theme/ThemeContext';

interface VoiceMessagePlayerProps {
  url: string;
  initialDurationSeconds?: number;
  isSender?: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  url,
  initialDurationSeconds,
  isSender = false,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(
    initialDurationSeconds ? initialDurationSeconds * 1000 : 0,
  );

  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const formatTime = (millis: number) => {
    if (!millis || isNaN(millis)) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleTogglePlay = async () => {
    try {
      if (!soundRef.current) {
        setIsLoading(true);
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          onPlaybackStatusUpdate,
        );

        soundRef.current = newSound;
        setSound(newSound);
        setIsLoading(false);
        setIsPlaying(true);
      } else {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          // If finished, restart from 0
          if (durationMillis > 0 && positionMillis >= durationMillis - 100) {
            await soundRef.current.setPositionAsync(0);
          }
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Playback Error', err?.message || 'Could not play audio message.');
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.warn('Playback error:', status.error);
      }
      return;
    }

    setPositionMillis(status.positionMillis);
    if (status.durationMillis) {
      setDurationMillis(status.durationMillis);
    }
    setIsPlaying(status.isPlaying);

    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMillis(0);
      soundRef.current?.setPositionAsync(0).catch(() => {});
    }
  };

  const progressPercent =
    durationMillis > 0
      ? Math.min(100, Math.max(0, (positionMillis / durationMillis) * 100))
      : 0;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleTogglePlay}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.playBtn,
          {
            backgroundColor: isSender ? colors.primary : colors.surface,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={isSender ? '#050A0E' : colors.primary}
          />
        ) : (
          <Text
            style={[
              styles.playIcon,
              { color: isSender ? '#050A0E' : colors.primary },
            ]}
          >
            {isPlaying ? '⏸' : '▶'}
          </Text>
        )}
      </Pressable>

      <View style={styles.trackContainer}>
        {/* Scrubber bar */}
        <View
          style={[
            styles.progressBarTrack,
            {
              backgroundColor:
                theme.mode === 'dark' ? '#1A2633' : '#E2E8F0',
            },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${progressPercent}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>

        {/* Timers */}
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: colors.muted }]}>
            {formatTime(positionMillis)}
          </Text>
          <Text style={[styles.timeText, { color: colors.muted }]}>
            {formatTime(durationMillis)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 200,
    maxWidth: 260,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playIcon: {
    fontSize: 16,
    marginLeft: 2,
    fontWeight: '700',
  },
  trackContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});

export default VoiceMessagePlayer;
