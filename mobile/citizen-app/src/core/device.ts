import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Location needed', 'Allow location access so we know where to send the truck. You can also tap the map to choose a spot.');
    return null;
  }
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!p) return null;
    return [p.name, p.street, p.district, p.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  } catch {
    return null;
  }
}

export interface Photo {
  uri: string; // local file, for preview
  base64: string; // sent to the server as JSON
}

/** Ask camera or gallery and return the picked image (uri + base64). */
export function pickPhoto(): Promise<Photo | null> {
  return new Promise((resolve) => {
    const open = async (camera: boolean) => {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', camera ? 'Camera access is required to take a photo.' : 'Gallery access is required.');
        return resolve(null);
      }
      // quality 0.4 keeps photos ~100-300 KB so they upload fast on mobile data
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, allowsEditing: true, aspect: [4, 3], base64: true };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return resolve(null);
      const a = res.assets[0];
      if (!a.base64) {
        Alert.alert('Photo error', 'Could not read the photo. Please try again.');
        return resolve(null);
      }
      resolve({ uri: a.uri, base64: a.base64 });
    };
    Alert.alert('Add photo', undefined, [
      { text: 'Take photo', onPress: () => open(true) },
      { text: 'Choose from gallery', onPress: () => open(false) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
