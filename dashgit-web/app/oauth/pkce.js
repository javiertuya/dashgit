// pkce.js
export function generateRandomString(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  randomValues.forEach(v => result += charset[v % charset.length]);
  return result;
}

function base64urlencode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64urlencode(hash);
}

export async function generatePKCE() {
  const code_verifier = generateRandomString(64);
  const code_challenge = await sha256(code_verifier);
  return { code_verifier, code_challenge };
}
