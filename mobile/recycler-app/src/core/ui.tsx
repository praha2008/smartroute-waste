import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
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

import { haptic } from './haptics';
import { t } from './i18n';
import { useIsFocused, useNavMaybe } from './nav';
import { colors, font, radius, shadow, shadowSoft, space } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export { haptic };

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
  hero,
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
  /** coloured gradient block shown under the status bar (scrolls with content) */
  hero?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const top = hero ? (
    <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + space.md }]}>
      {hero}
    </LinearGradient>
  ) : null;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[{ paddingBottom: space.xxl * 2 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}
    >
      {top}
      <View style={[padded && { padding: space.lg }, hero ? { marginTop: -space.xl } : null]}>{children}</View>
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>
      {top}
      <View style={[{ flex: 1 }, padded && { padding: space.lg }]}>{children}</View>
    </View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {focused && <StatusBar style={hero ? 'light' : 'dark'} />}
      {title !== undefined && !hero && <Header title={title} subtitle={subtitle} back={back} right={right} top={insets.top} />}
      {title === undefined && !hero && <View style={{ height: insets.top }} />}
      {body}
      {footer && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

function Header({ title, subtitle, back, right, top }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; top: number }) {
  const nav = useNavMaybe();
  return (
    <View style={[styles.header, { paddingTop: top + space.sm }]}>
      {back && nav && (
        <Pressable onPress={nav.pop} hitSlop={12} style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={back ? [font.h3, { fontSize: 18 }] : font.h1} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={font.small} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Round translucent icon button used on gradient heroes. */
export function HeroButton({ icon, onPress }: { icon: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={colors.white} />
    </Pressable>
  );
}

export function Card({ children, style, onPress, flat }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; flat?: boolean }) {
  const base = [styles.card, flat ? styles.cardFlat : null, style as ViewStyle];
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        style={({ pressed }) => [...base, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm, paddingHorizontal: 2 }}>
        <Text style={[font.h3, { fontSize: 15 }]}>{title}</Text>
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
  iconRight,
  loading,
  disabled,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'light';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: colors.white, border: 'transparent' },
    secondary: { bg: colors.card, fg: colors.accentDark, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
    ghost: { bg: 'transparent', fg: colors.accentDark, border: 'transparent' },
    light: { bg: 'rgba(255,255,255,0.18)', fg: colors.white, border: 'rgba(255,255,255,0.35)' },
  }[variant];
  const off = disabled || loading;
  const content = loading ? (
    <ActivityIndicator color={palette.fg} />
  ) : (
    <Row gap={8}>
      {icon && <Ionicons name={icon} size={small ? 16 : 19} color={palette.fg} />}
      <Text style={{ color: palette.fg, fontWeight: '700', fontSize: small ? 13 : 16, letterSpacing: 0.1 }} numberOfLines={1}>
        {title}
      </Text>
      {iconRight && <Ionicons name={iconRight} size={small ? 16 : 19} color={palette.fg} />}
    </Row>
  );
  return (
    <Pressable
      onPress={
        off
          ? undefined
          : () => {
              haptic.press();
              onPress?.();
            }
      }
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.55 : 1 },
        variant === 'primary' && !off ? shadowSoft : null,
        pressed && !off && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {variant === 'primary' && (
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: small ? radius.sm : radius.md }]} />
      )}
      {content}
    </Pressable>
  );
}

export function Input({
  label,
  error,
  icon,
  style,
  secureTextEntry,
  hint,
  right,
  ...props
}: TextInputProps & { label?: string; error?: string | null; icon?: IconName; hint?: string; right?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View style={{ marginBottom: space.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrap,
          props.multiline && { alignItems: 'flex-start', minHeight: 88 },
          focused && { borderColor: colors.accent, backgroundColor: colors.card },
          error ? { borderColor: colors.danger } : null,
        ]}
      >
        {icon && <Ionicons name={icon} size={19} color={focused ? colors.accent : colors.textFaint} style={{ marginRight: 10, marginTop: props.multiline ? 12 : 0 }} />}
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, style]}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textFaint} />
          </Pressable>
        )}
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Indian mobile number field with a fixed +91 prefix. */
export function PhoneInput({ value, onChangeText, label, error, hint }: { value: string; onChangeText: (v: string) => void; label?: string; error?: string | null; hint?: string }) {
  return (
    <Input
      label={label}
      error={error}
      hint={hint}
      icon="call-outline"
      value={value}
      onChangeText={(v) => onChangeText(v.replace(/[^0-9]/g, '').slice(0, 10))}
      keyboardType="phone-pad"
      placeholder="98765 43210"
      maxLength={10}
      right={<Text style={{ color: colors.textMuted, fontWeight: '700' }}>🇮🇳</Text>}
      style={{ letterSpacing: 1 }}
    />
  );
}

/** Six boxes for a one-time code; backed by one hidden TextInput. */
export function OtpInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ marginVertical: space.lg }}>
      <Row gap={8} style={{ justifyContent: 'center' }}>
        {Array.from({ length }).map((_, i) => {
          const ch = value[i] ?? '';
          const active = i === value.length;
          return (
            <View key={i} style={[styles.otpBox, ch ? { borderColor: colors.accent, backgroundColor: colors.accentSoft } : null, active && { borderColor: colors.accent, borderWidth: 2 }]}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{ch}</Text>
            </View>
          );
        })}
      </Row>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={[styles.segmentItem, active && styles.segmentActive]}
          >
            <Text style={{ fontWeight: '700', fontSize: 13, color: active ? colors.accentDark : colors.textMuted }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, color, icon }: { label: string; active?: boolean; onPress?: () => void; color?: string; icon?: IconName }) {
  const c = color ?? colors.accent;
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              haptic.tap();
              onPress();
            }
          : undefined
      }
      style={[styles.chip, active ? { backgroundColor: c, borderColor: c } : { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Row gap={5}>
        {icon && <Ionicons name={icon} size={14} color={active ? colors.white : colors.textMuted} />}
        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.white : colors.textMuted }}>{label}</Text>
      </Row>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ display */
export function Badge({ label, color, soft, icon }: { label: string; color: string; soft: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Stat({ label, value, icon, tint }: { label: string; value: string | number; icon?: IconName; tint?: string }) {
  const c = tint ?? colors.accent;
  return (
    <View style={[styles.card, { flex: 1, padding: space.md, marginBottom: 0 }]}>
      {icon && (
        <View style={[styles.statIcon, { backgroundColor: c + '1A' }]}>
          <Ionicons name={icon} size={16} color={c} />
        </View>
      )}
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[font.small, { marginTop: 2, fontSize: 12 }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Stat block for use on top of a gradient hero. */
export function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.heroStat}>
      <Text style={{ color: colors.white, fontSize: 18, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function IconCircle({ icon, color, soft, size = 40 }: { icon: IconName; color: string; soft: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export function KeyValue({ label, value, last }: { label: string; value?: React.ReactNode; last?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <Text style={font.small}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[font.body, { fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: space.md }]}>{value}</Text>
      ) : (
        value
      )}
    </Row>
  );
}

/** Settings-style row: icon, title, optional subtitle and chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  tint,
  danger,
  last,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tint?: string;
  danger?: boolean;
  last?: boolean;
}) {
  const c = danger ? colors.danger : tint ?? colors.accent;
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              haptic.tap();
              onPress();
            }
          : undefined
      }
      style={({ pressed }) => [styles.listRow, !last && styles.listRowBorder, pressed && onPress && { backgroundColor: colors.field }]}
    >
      <IconCircle icon={icon} color={c} soft={danger ? colors.dangerSoft : c + '18'} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={[font.body, { fontWeight: '600', color: danger ? colors.danger : colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[font.small, { fontSize: 12 }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

export function Banner({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'warning' | 'success' | 'danger'; icon?: IconName }) {
  const map = {
    info: [colors.info, colors.infoSoft, 'information-circle'],
    warning: [colors.warning, colors.warningSoft, 'alert-circle'],
    success: [colors.success, colors.successSoft, 'checkmark-circle'],
    danger: [colors.danger, colors.dangerSoft, 'warning'],
  } as const;
  const [c, soft, defIcon] = map[tone];
  return (
    <View style={[styles.banner, { backgroundColor: soft }]}>
      <Ionicons name={icon ?? (defIcon as IconName)} size={18} color={c} />
      <Text style={{ color: c, flex: 1, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl }}>
      <View style={styles.emptyRing}>
        <IconCircle icon={icon} color={colors.accent} soft={colors.accentSoft} size={64} />
      </View>
      <Text style={[font.h3, { marginTop: space.md, textAlign: 'center' }]}>{title}</Text>
      {text && <Text style={[font.small, { textAlign: 'center', marginTop: 4, maxWidth: 280 }]}>{text}</Text>}
      {action && <View style={{ marginTop: space.lg }}>{action}</View>}
    </View>
  );
}

/** Pulsing grey placeholder blocks while data loads. */
export function Skeleton({ height = 80, count = 3 }: { height?: number; count?: number }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={{ height, borderRadius: radius.lg, backgroundColor: '#E4E9E6', marginBottom: space.md, opacity: pulse }} />
      ))}
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} size="large" />
      {text && <Text style={[font.small, { marginTop: space.md }]}>{text}</Text>}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.dangerSoft, flexDirection: 'column', alignItems: 'stretch', marginBottom: space.md }]}>
      <Row>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, flex: 1, fontWeight: '600' }}>{message}</Text>
      </Row>
      {onRetry && <Button title={t('common.retry')} small variant="secondary" icon="refresh" onPress={onRetry} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />}
    </View>
  );
}

/**
 * Shows a photo at its natural aspect ratio (no cropping). Width fills the parent;
 * height follows the image. `maxHeight` keeps very tall portrait photos in check.
 */
export function Photo({ uri, maxHeight = 420, style, onPress }: { uri?: string; maxHeight?: number; style?: ViewStyle; onPress?: () => void }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!uri) return;
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => alive && w && h && setRatio(w / h),
      () => alive && setRatio(4 / 3),
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  if (!uri) return null;
  const inner = (
    <View style={[styles.photo, style]}>
      {ratio ? (
        <Image source={{ uri }} style={{ width: '100%', aspectRatio: ratio, maxHeight }} resizeMode="contain" />
      ) : (
        <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.bg },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, ...shadowSoft },
  hero: { paddingHorizontal: space.lg, paddingBottom: space.xl + space.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  heroStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, ...shadow },
  cardFlat: { shadowOpacity: 0, elevation: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  btn: { minHeight: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1, overflow: 'hidden' },
  btnSmall: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: '700' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.field,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 52,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  error: { color: colors.danger, fontSize: 12, marginTop: 5, fontWeight: '600' },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 5 },
  otpBox: { width: 46, height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: '#E6EBE8', borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  segmentActive: { backgroundColor: colors.card, ...shadowSoft },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.lg },
  listRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  emptyRing: { padding: 10, borderRadius: 40, backgroundColor: colors.card, ...shadowSoft },
  photo: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#EEF1EF', marginBottom: space.sm },
});
