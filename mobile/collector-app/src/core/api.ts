import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const KEY_URL = 'smartroute.serverUrl';
const KEY_TOKEN = 'smartroute.token';

let baseUrl = '';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Default server address:
 *  - In Expo Go (development) the laptop running `expo start` also runs the backend,
 *    so we use its LAN IP from the Metro host.
 *  - In an installed APK there is no Metro host, so we use the hosted server
 *    from app.json -> expo.extra.serverUrl (set with `node set-server-url.js <url>`). */
export function guessServerUrl(): string {
  const host = (Constants.expoConfig as any)?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost || '';
  const ip = String(host).split(':')[0];
  if (ip) return `http://${ip}:8000`;
  const hosted = (Constants.expoConfig as any)?.extra?.serverUrl;
  return hosted ? String(hosted).replace(/\/+$/, '') : 'http://192.168.1.10:8000';
}

export async function loadSession(): Promise<{ url: string; token: string | null }> {
  const [u, t] = await Promise.all([AsyncStorage.getItem(KEY_URL), AsyncStorage.getItem(KEY_TOKEN)]);
  baseUrl = u || guessServerUrl();
  token = t;
  return { url: baseUrl, token };
}

export async function setServerUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(baseUrl)) baseUrl = `http://${baseUrl}`;
  await AsyncStorage.setItem(KEY_URL, baseUrl);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(KEY_TOKEN, t);
  else await AsyncStorage.removeItem(KEY_TOKEN);
}

export function getServerUrl() {
  return baseUrl;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/** Turn a backend relative path like /uploads/x.jpg into a full URL. */
export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${baseUrl}${path}`;
}

async function parse(res: Response) {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (data?.detail) {
      msg = Array.isArray(data.detail)
        ? data.detail.map((d: any) => `${(d.loc || []).slice(-1)[0] ?? ''}: ${d.msg}`).join('\n')
        : String(data.detail);
    }
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, msg);
  }
  return data;
}

// generous timeout: a free cloud server can take ~50 s to wake up after being idle
export async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 60000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return (await parse(res)) as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, `Cannot reach server at ${baseUrl}. Check Wi-Fi and the server address.`);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T = any>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T = any>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),

  /** Upload a photo as base64 JSON, e.g. uploadPhoto('/requests/5/photo64', photo.base64).
   * (More reliable on Android than multipart.) */
  uploadPhoto: <T = any>(path: string, base64: string) => request<T>('POST', path, { data: base64 }, 60000),

  /** Upload a local image as multipart form data (kept for web / other clients). */
  async upload<T = any>(path: string, uri: string): Promise<T> {
    const name = uri.split('/').pop() || 'photo.jpg';
    const ext = (name.split('.').pop() || 'jpg').toLowerCase();
    const form = new FormData();
    form.append('file', { uri, name, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as any);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      return (await parse(res)) as T;
    } catch (e: any) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, 'Photo upload failed. Check your connection.');
    }
  },

  async ping(url: string): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), url.startsWith('https') ? 60000 : 5000);
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/`, { signal: ctrl.signal });
      const data = await res.json();
      return data?.service === 'SmartRoute Waste API';
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  },
};
