const KEY_TOKEN = 'smartroute.admin.token';
const KEY_URL = 'smartroute.admin.url';

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export let API_URL: string = safeGet(KEY_URL) || import.meta.env.VITE_API_URL || 'http://localhost:8000';
let token: string | null = safeGet(KEY_TOKEN);
let onUnauthorized: () => void = () => {};

export function setApiUrl(url: string) {
  API_URL = url.replace(/\/+$/, '');
  safeSet(KEY_URL, API_URL);
}
export function setToken(t: string | null) {
  token = t;
  safeSet(KEY_TOKEN, t);
}
export function getToken() {
  return token;
}
export function onAuthLost(fn: () => void) {
  onUnauthorized = fn;
}
export function fileUrl(p?: string | null) {
  return p ? (p.startsWith('http') ? p : `${API_URL}${p}`) : undefined;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}. Is the backend running?`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const d = data?.detail;
    throw new Error(Array.isArray(d) ? d.map((x: any) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(', ') : d || `Error ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T = any>(p: string, b: unknown) => request<T>('PUT', p, b),
  del: <T = any>(p: string) => request<T>('DELETE', p),
};
