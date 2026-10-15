/**
 * src/components/Chat/PollCard.tsx
 *
 * Interactive poll card rendered inside chat message bubbles.
 * Shows poll question, option bars with vote counts & percentages,
 * and handles one-tap voting via onVote callback.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { PollWithVotes } from '../../types/database';

interface PollCardProps {
  poll: PollWithVotes;
  onVote: (pollId: string, optionIndex: number) => void;
  isSender?: boolean;
}

export const PollCard: React.FC<PollCardProps> = ({
  poll,
  onVote,
  isSender = false,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const rawOptions = poll.options || [];
  const optionsList = rawOptions.map((opt: any) =>
    typeof opt === 'string' ? opt : opt?.label || opt?.text || 'Option',
  );

  const totalVotes = poll.totalVotes ?? 0;
  const userVoteIndex = poll.userVoteIndex ?? null;

  const borderColor = theme.mode === 'dark' ? '#1A2633' : '#E0E6EC';

  return (
    <View style={styles.container}>
      {/* Poll Header */}
      <View style={styles.headerRow}>
        <Text style={styles.pollBadge}>📊 POLL</Text>
        <Text style={[styles.totalVotesText, { color: colors.muted }]}>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </Text>
      </View>

      {/* Question */}
      <Text style={[styles.questionText, { color: colors.text }]}>
        {poll.question}
      </Text>

      {/* Options List */}
      <View style={styles.optionsContainer}>
        {optionsList.map((optionLabel, index) => {
          const voteCount = poll.optionCounts?.[index] ?? 0;
          const percentage =
            totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = userVoteIndex === index;

          return (
            <Pressable
              key={`poll-opt-${index}`}
              onPress={() => onVote(poll.id, index)}
              style={({ pressed }) => [
                styles.optionButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: isSelected ? colors.primary : borderColor,
                  borderWidth: isSelected ? 1.5 : 1,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {/* Progress bar background fill */}
              <View
                style={[
                  styles.optionProgressFill,
                  {
                    width: `${percentage}%`,
                    backgroundColor: isSelected
                      ? 'rgba(0, 255, 204, 0.18)'
                      : theme.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.06)'
                      : 'rgba(0, 0, 0, 0.05)',
                  },
                ]}
              />

              {/* Option label & vote info */}
              <View style={styles.optionContentRow}>
                <View style={styles.labelWrapper}>
                  {isSelected && (
                    <Text
                      style={[styles.selectedCheck, { color: colors.primary }]}
                    >
                      ✓{' '}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: isSelected ? colors.primary : colors.text,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {optionLabel}
                  </Text>
                </View>

                <View style={styles.statsWrapper}>
                  <Text
                    style={[
                      styles.percentageText,
                      {
                        color: isSelected ? colors.primary : colors.muted,
                        fontWeight: isSelected ? '700' : '600',
                      },
                    ]}
                  >
                    {percentage}%
                  </Text>
                  <Text style={[styles.countText, { color: colors.muted }]}>
                    ({voteCount})
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.hintText, { color: colors.muted }]}>
        Tap any option to vote
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    minWidth: 240,
    maxWidth: 320,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pollBadge: {
    color: '#00FFCC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  totalVotesText: {
    fontSize: 11,
    fontWeight: '600',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 42,
    justifyContent: 'center',
  },
  optionProgressFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  optionContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 1,
  },
  labelWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  selectedCheck: {
    fontSize: 14,
    fontWeight: '800',
  },
  optionLabel: {
    fontSize: 14,
    flexShrink: 1,
  },
  statsWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  percentageText: {
    fontSize: 13,
  },
  countText: {
    fontSize: 11,
  },
  hintText: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default PollCard;
