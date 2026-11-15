const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const keyCache = new Map<string, Promise<CryptoKey | null>>();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getRoomKey(roomCode: string): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  const normalized = roomCode.trim().toUpperCase();
  const cached = keyCache.get(normalized);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        textEncoder.encode(`quizduel-static-v1:${normalized}`)
      );
      return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
      ]);
    } catch {
      return null;
    }
  })();

  keyCache.set(normalized, promise);
  return promise;
}

export async function sealRoomPayload(roomCode: string, payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  const key = await getRoomKey(roomCode);
  if (!key) {
    return JSON.stringify({ v: 1, plain: json });
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(json)
  );
  return JSON.stringify({
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(encrypted)),
  });
}

export async function openRoomPayload<T>(roomCode: string, raw: string): Promise<T | null> {
  try {
    const parsed = JSON.parse(raw) as { v?: number; plain?: string; iv?: string; ct?: string };
    if (typeof parsed.plain === 'string') {
      return JSON.parse(parsed.plain) as T;
    }
    if (!parsed.iv || !parsed.ct) return null;
    const key = await getRoomKey(roomCode);
    if (!key) return null;

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(parsed.iv) as BufferSource },
      key,
      fromBase64(parsed.ct) as BufferSource
    );
    return JSON.parse(textDecoder.decode(decrypted)) as T;
  } catch {
    return null;
  }
}
