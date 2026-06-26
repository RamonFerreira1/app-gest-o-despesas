import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius, categoryColors } from '../../theme';
import { formatCurrency } from '../../services/insightService';

interface Props {
  byCategory: Record<string, number>;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
  if (end - start >= 360) end = 359.999;
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

export default function CategoryPieChart({ byCategory }: Props) {
  const entries = Object.entries(byCategory).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0 || entries.length === 0) return null;

  const SIZE = 200;
  const CX = SIZE / 2;
  const R = 80;
  const INNER_R = 50;

  let currentAngle = 0;
  const slices = entries.map(([cat, val]) => {
    const sweep = (val / total) * 360;
    const slice = { cat, val, startAngle: currentAngle, endAngle: currentAngle + sweep };
    currentAngle += sweep;
    return slice;
  });

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <Svg width={SIZE} height={SIZE}>
          <G>
            {slices.map((s) => (
              <React.Fragment key={s.cat}>
                <Path
                  d={describeArc(CX, CX, R, s.startAngle, s.endAngle)}
                  fill={categoryColors[s.cat] ?? colors.outros}
                  stroke={colors.background}
                  strokeWidth={2}
                />
              </React.Fragment>
            ))}
            {/* Donut hole */}
            <Circle cx={CX} cy={CX} r={INNER_R} fill={colors.surface} />
          </G>
        </Svg>
        <View style={styles.centerLabel}>
          <Text style={styles.centerTotal}>{formatCurrency(total)}</Text>
          <Text style={styles.centerSub}>total</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {slices.map((s) => (
          <View key={s.cat} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: categoryColors[s.cat] ?? colors.outros }]} />
            <Text style={styles.legendCat}>{s.cat}</Text>
            <Text style={styles.legendVal}>{((s.val / total) * 100).toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  chartWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTotal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  centerSub: { fontSize: fontSize.xs, color: colors.textMuted },
  legend: { width: '100%', marginTop: spacing.md, gap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendCat: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },
  legendVal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
});
