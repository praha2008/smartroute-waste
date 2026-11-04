import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNav } from './nav';
import { colors, font, radius, shadow, space } from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ layout */
export function Screen({
  title,
  subtitle,
  back,
  right,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
  footer,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && { padding: space.lg }, { paddingBottom: space.xxl }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: space.lg }]}>{children}</View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {title !== undefined && <Header title={title} subtitle={subtitle} back={back} right={right} top={insets.top} />}
      {title === undefined && <View style={{ height: insets.top }} />}
      {body}
      {footer && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

function Header({ title, subtitle, back, right, top }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; top: number }) {
  const nav = useNav();
  return (
    <View style={[styles.header, { paddingTop: top + space.sm }]}>
      {back && (
        <Pressable onPress={nav.pop} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={back ? font.h3 : font.h2} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={font.small} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style as ViewStyle, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style as ViewStyle]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <Text style={font.tiny}>{title.toUpperCase()}</Text>
        {action}
      </Row>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ controls */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: colors.white, border: colors.accent },
    secondary: { bg: colors.card, fg: colors.accentDark, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
    ghost: { bg: 'transparent', fg: colors.accentDark, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Row gap={6}>
          {icon && <Ionicons name={icon} size={small ? 16 : 19} color={palette.fg} />}
          <Text style={{ color: palette.fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function Input({ label, error, style, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: space.md }}>
      {label && <Text style={[font.small, { marginBottom: 6, fontWeight: '600' }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, style]}
        {...props}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segmentItem, active && styles.segmentActive]}>
            <Text style={{ fontWeight: '700', fontSize: 13, color: active ? colors.accentDark : colors.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const c = color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: c, borderColor: c } : { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.white : colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ display */
export function Badge({ label, color, soft, icon }: { label: string; color: string; soft: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Stat({ label, value, icon, tint }: { label: string; value: string | number; icon?: IconName; tint?: string }) {
  return (
    <View style={[styles.card, { flex: 1, padding: space.md, marginBottom: 0 }]}>
      {icon && <Ionicons name={icon} size={18} color={tint ?? colors.accent} style={{ marginBottom: 6 }} />}
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{value}</Text>
      <Text style={[font.small, { marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

export function IconCircle({ icon, color, soft, size = 40 }: { icon: IconName; color: string; soft: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <Text style={font.small}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[font.body, { fontWeight: '600', flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
      ) : (
        value
      )}
    </Row>
  );
}

export function Empty({ icon = 'file-tray-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl }}>
      <IconCircle icon={icon} color={colors.accent} soft={colors.accentSoft} size={64} />
      <Text style={[font.h3, { marginTop: space.md, textAlign: 'center' }]}>{title}</Text>
      {text && <Text style={[font.small, { textAlign: 'center', marginTop: 4 }]}>{text}</Text>}
      {action && <View style={{ marginTop: space.lg }}>{action}</View>}
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
      <ActivityIndicator color={colors.accent} size="large" />
      {text && <Text style={[font.small, { marginTop: space.md }]}>{text}</Text>}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }]}>
      <Row>
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, flex: 1, fontWeight: '600' }}>{message}</Text>
      </Row>
      {onRetry && <Button title="Try again" small variant="secondary" onPress={onRetry} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.bg,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, ...shadow },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  btn: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1 },
  btnSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  segment: { flexDirection: 'row', backgroundColor: '#E8ECEA', borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.card, ...shadow },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
});
