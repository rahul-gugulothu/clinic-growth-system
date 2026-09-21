import '@testing-library/jest-dom';

// Polyfill atob for happy-dom (used by decodeJwt)
const atobPolyfill = (str: string): string => {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('binary');
    }
  } catch {
    // Fallback below
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let decoded = '';
  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str[i]);
    const enc2 = i + 1 < str.length ? chars.indexOf(str[i + 1]) : -1;
    const enc3 = i + 2 < str.length ? chars.indexOf(str[i + 2]) : -1;
    const enc4 = i + 3 < str.length ? chars.indexOf(str[i + 3]) : -1;
    if (enc1 === -1 || enc2 === -1) continue;
    decoded += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
    if (enc3 !== -1) decoded += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
    if (enc4 !== -1) decoded += String.fromCharCode(((enc3 & 3) << 6) | enc4);
  }
  return decoded;
};

// Always override atob in test environment (happy-dom may have a broken implementation)
globalThis.atob = atobPolyfill;
if (typeof window !== 'undefined') {
  window.atob = atobPolyfill;
}

// Expose localStorage and sessionStorage from happy-dom to globalThis
if (typeof window !== 'undefined') {
  if (typeof (window as any).localStorage !== 'undefined' && typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = (window as any).localStorage;
  }
  if (typeof (window as any).sessionStorage !== 'undefined' && typeof globalThis.sessionStorage === 'undefined') {
    (globalThis as any).sessionStorage = (window as any).sessionStorage;
  }
}
