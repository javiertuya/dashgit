import { generatePKCE, generateRandomString } from "./pkce.js";
import { login } from "../Login.js";

/**
 * OAuth2+PKCSE implementation for DashGit
 * This module handles the OAuth2 authorization code with PKCE generation and token exchange.
 * Information flow:
 * - startLogin() is called when there is a provider that needs OAuth2 login. It calls the OAuth2 app.
 * - handleCalback() is called in response to the OAuth2 app callback. The authentcation is completed.
 * - The final result is communicated to the Login module by callin successfulLogin and failedLogin, 
 *   which will update the UI and store the token for future use.
 *
 * Remarks:
 * - The startLogin receives oaconfig, which contains all configuration parameters related to the endpoints, client id, etc.
 * - handleCallback needs the oaconfig parameters that are not passed through the URL, 
 *  so they are stored in sessionStorage and cleared when they are no longer needed.
 */

const OACONFIG = "dashgit-oauth-oaconfig"; // Store: configuration for oauth authentication
const PKCE_VERIFIER = "dashgit-oauth-pkce-verifier";
const STATE = "dashgit-oauth-state";

export async function startLogin(oaconfig) {
  sessionStorage.setItem(OACONFIG, JSON.stringify(oaconfig))

  const { code_verifier, code_challenge } = await generatePKCE();
  localStorage.setItem(PKCE_VERIFIER, code_verifier);

  const state = generateRandomString(32);
  localStorage.setItem(STATE, state);

  const url =
    oaconfig.authorizeUrl +
    `?client_id=${oaconfig.clientId}` +
    `&redirect_uri=${encodeURIComponent(oaconfig.callbackUrl)}` +
    `&scope=${encodeURIComponent(oaconfig.scopes)}` +
    `&state=${state}` +
    `&response_type=code` +
    `&code_challenge=${code_challenge}` +
    `&code_challenge_method=S256`;

  window.location = url;
}

export async function handleCallback() {
  const oaconfig = JSON.parse(sessionStorage.getItem(OACONFIG));
  sessionStorage.removeItem(OACONFIG); // not needed anymore in storage
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      await login.failedLogin("Did not receive 'code' in callback parameters");
      return;
    }
    if (state != localStorage.getItem(STATE)) {
      await login.failedLogin("State does not match the request");
      return;
    }

    const tokenResponse = await exchangeCodeForToken(code, oaconfig);

    if (tokenResponse.error) {
      await login.failedLogin("Error exchanging code for token: " + JSON.stringify(tokenResponse, null, 2));
      return;
    }

    // Uses refresh info in addition to the received token
    await login.successfulLogin(tokenResponse.access_token, tokenResponse.refresh_token, tokenResponse.expires_in);
    window.location.href = "./"; // Redirect back to main app after successful login
  }
  // TODO test with exchange server down, clarify message/handle exception, 
  // currently it returns html from nginx that fails to be displayed (at least it sould be sanitized).
  // Maybe get the http code here or in the exchange method post
  catch (err) {
    await login.failedLogin("Unexpected error: " + err);
  }
};

export async function exchangeCodeForToken(code, oaconfig) {
  const code_verifier = localStorage.getItem(PKCE_VERIFIER);

  const body = {
    client_id: oaconfig.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: oaconfig.callbackUrl,
    code_verifier
  };

  // NOTE: GitHub reqires a proxy for exchange, if not, it fails because of CORS. See this:
  // https://github.com/getsentry/sentry/pull/107731
  // In summary: to do not require proxy, the url of the client should be in a registered server, and this address be the homepage url the OAuth App
  const response = await post (oaconfig.exchangeUrl, body);
  return response;
}

export async function refreshExpiredToken(refreshToken, oaconfig) {
  const body = {
    client_id: oaconfig.clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    redirect_uri: oaconfig.callbackUrl
  };
  
  const response = await post(oaconfig.exchangeUrl, body);
  // Error handling is different from login for a new token because refresh must be executed
  // silently, just to replace the token if possible
  if (response.error)
    console.error(`Error refeshing token (${response.error}): ${response.error_description}`
      + ` - Configuration: ${JSON.stringify(oaconfig, null, 2)}`);
  else
    await login.successfulLogin(response.access_token, response.refresh_token, response.expires_in);
}

async function post (url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });
  const response = res.json();
  return response;
}
