import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../theme';
import { InsightData } from '../../types';

interface Props {
  insight: InsightData;
}

const typeConfig = {
  danger: { bg: colors.dangerDim, border: colors.danger, icon: colors.danger },
  warning: { bg: colors.warningDim, border: colors.warning, icon: colors.warning },
  info: { bg: colors.infoDim, border: colors.info, icon: colors.info },
  success: { bg: colors.primaryDim, border: colors.primary, icon: colors.primary },
};

export default function InsightCard({ insight }: Props) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const cfg = typeConfig[insight.type];

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.border + '30' }]}>
        <Ionicons name={insight.icon as any} size={20} color={cfg.icon} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: cfg.icon }]}>{insight.title}</Text>
        <Text style={styles.message}>{insight.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  title: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: 4 },
  message: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
});
