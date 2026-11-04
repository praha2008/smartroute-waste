import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

import { t } from './i18n';

export async function getCurrentLocation(showAlert = true): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    if (showAlert) Alert.alert(t('loc.title'), t('loc.permission'));
    return null;
  }
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  }
}

export interface Photo {
  uri: string; // local file, for preview
  base64: string; // sent to the server as JSON
  width: number;
  height: number;
}

const MAX_SIDE = 1280; // long side in pixels: sharp on any phone, ~150-350 KB as JPEG

/** Shrink a picked image so the long side is at most MAX_SIDE, keeping its aspect ratio. */
async function shrink(a: ImagePicker.ImagePickerAsset): Promise<Photo> {
  const landscape = (a.width ?? 0) >= (a.height ?? 0);
  const big = Math.max(a.width ?? 0, a.height ?? 0) > MAX_SIDE;
  const ctx = ImageManipulator.manipulate(a.uri);
  if (big) ctx.resize(landscape ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.72, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('no data');
  return { uri: out.uri, base64: out.base64, width: out.width, height: out.height };
}

/** Ask camera or gallery and return the picked image — any aspect ratio, no forced crop. */
export function pickPhoto(): Promise<Photo | null> {
  return new Promise((resolve) => {
    const open = async (camera: boolean) => {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('photo.add'), camera ? t('photo.permCamera') : t('photo.permGallery'));
        return resolve(null);
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return resolve(null);
      try {
        resolve(await shrink(res.assets[0]));
      } catch {
        Alert.alert(t('photo.add'), t('photo.error'));
        resolve(null);
      }
    };
    Alert.alert(t('photo.add'), undefined, [
      { text: t('photo.take'), onPress: () => open(true) },
      { text: t('photo.gallery'), onPress: () => open(false) },
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
