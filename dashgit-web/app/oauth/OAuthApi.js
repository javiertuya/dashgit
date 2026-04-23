import { generatePKCE, generateRandomString } from "./pkce.js";

/**
 * OAuth2+PKCE implementation for DashGit
 * This module handles the OAuth2 authorization code with PKCE generation and token exchange.
 * Information flow:
 * - startLogin() is called when there is a provider that needs OAuth2 login. It calls the OAuth2 app.
 * - handleCalback() is called in response to the OAuth2 app callback. The authentcation is completed.
 * - refreshExpiredToken() when requested
 * 
 * Remarks:
 * - The startLogin receives oaconfig, which contains all configuration parameters related to the endpoints, client id, etc.
 * - handleCallback needs the oaconfig parameters that are not passed through the URL, 
 *   so they are stored in sessionStorage and cleared when they are no longer needed.
 * - refreshExpiredToken is called directly without callbacks
 */

const OACONFIG = "dashgit-oauth-oaconfig"; // Store: configuration for oauth authentication
const PKCE_VERIFIER = "dashgit-oauth-pkce-verifier";
const STATE = "dashgit-oauth-state";

export async function startLogin(oaconfig) {
  sessionStorage.setItem(OACONFIG, JSON.stringify(oaconfig))

  const { code_verifier, code_challenge } = await generatePKCE();
  sessionStorage.setItem(PKCE_VERIFIER, code_verifier);

  const state = generateRandomString(32);
  sessionStorage.setItem(STATE, state);

  const url =
    oaconfig.authorizeUrl +
    `?client_id=${oaconfig.clientId}` +
    `&redirect_uri=${encodeURIComponent(oaconfig.callbackUrl)}` +
    `&scope=${encodeURIComponent(oaconfig.scopes)}` +
    `&state=${state}` +
    `&response_type=code` +
    `&code_challenge=${code_challenge}` +
    `&code_challenge_method=S256`;

  globalThis.location = url;
}

export async function handleCallback() {
  const oaconfig = JSON.parse(sessionStorage.getItem(OACONFIG));
  sessionStorage.removeItem(OACONFIG); // not needed anymore in storage
  try {
    const params = new URLSearchParams(globalThis.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code)
      return { error: "Did not receive 'code' in callback parameters" };
    if (state != sessionStorage.getItem(STATE))
       return { error: "State does not match the request" };

    const tokenResponse = await exchangeCodeForToken(code, oaconfig);
    if (tokenResponse.error)
      return { error: "Error exchanging code for token: " + JSON.stringify(tokenResponse, null, 2) };

    return { 
      access_token: tokenResponse.access_token, 
      refresh_token: tokenResponse.refresh_token,
      expires_in: tokenResponse.expires_in
    }
  }
  catch (err) {
    return { error: "Unexpected error: " + err.message };
  }
};

export async function exchangeCodeForToken(code, oaconfig) {
  const code_verifier = sessionStorage.getItem(PKCE_VERIFIER);

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
  const response = await post (oaconfig.tokenUrl, body);
  return response;
}

export async function refreshToken(refreshToken, oaconfig) {
  const body = {
    client_id: oaconfig.clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    redirect_uri: oaconfig.callbackUrl
  };
  
  const response = await post(oaconfig.tokenUrl, body);
  return response;
}

async function post(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body)
    });

    // If not JSON (e.g. 502 gateway because sever down behind nginx) 
    // returns the html (or part) as error description
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      let text = await res.text();
      if (text.includes("<body>")) // get only title
        text = text.slice(0, text.indexOf("<body>")).replaceAll("\r", "").replaceAll("\n", "") + " ...";
      return {
        error: "No JSON response",
        error_description: text
      };
    }

    const data = await res.json();
    return data;

  } catch (err) {
    return { // Network errors: server down, DNS, CORS, etc.
      error: "POST exception",
      error_description: err.message
    };
  }
}