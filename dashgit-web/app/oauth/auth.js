import { generatePKCE } from "./pkce.js";
import { login } from "../Login.js";

/**
 * OAuth2+PKCSE implementation for DashGit
 * This module handles the OAuth2 login flow, including PKCE generation and token exchange.
 * Information flow:
 * - startLogin() is called when there is a provider that needs OAuth2 login. It calls the OAuth2 app.
 * - startCalback() is called in response to the OAuth2 app callback. The authentcation is completed.
 * - Logging functions logDebug and logError are used to display messages in the UI and console.
 * - The final result is communicated to the Login module, which will update the UI and store the token for future use.
 *
 * Remarks:
 * - Both start* methods need to share parameters that are not passed through the URL, 
 *  so they are stored in sessionStorage (providerKey and oaconfig) and cleared when they are no longer needed.
 * - When DashGit runs in localhost, it is not possible to use real OAuth2 callbacks, so the flow is simulated (with a failure)
 */
export async function startLogin(providerId, oaconfig) {
  sessionStorage.setItem("providerKey", providerId)
  sessionStorage.setItem("oaconfig", JSON.stringify(oaconfig))
  await logDebug("startLogin", "OAuth2 login with provider " + providerId);

  // Localhost is not a valid host for OAuth2 callbacks, simulates the callback (that will fail)
  if (window.location.host === "localhost") {
    await new Promise(r => setTimeout(r, 2000));
    window.location.href = "http://localhost/dashgit/?oapp=github";
    return;
  }

  const { code_verifier, code_challenge } = await generatePKCE();
  localStorage.setItem("pkce_verifier", code_verifier);

  const url =
    oaconfig.authorizeUrl +
    `?client_id=${oaconfig.clientId}` +
    `&redirect_uri=${encodeURIComponent(oaconfig.callbackUrl)}` +
    `&scope=${encodeURIComponent(oaconfig.scopes)}` +
    `&response_type=code` +
    `&code_challenge=${code_challenge}` +
    `&code_challenge_method=S256`;

  window.location = url;
}

export async function startCallback() {
  const providerId = sessionStorage.getItem("providerKey");
  const oaconfig = JSON.parse(sessionStorage.getItem("oaconfig"));
  sessionStorage.removeItem("providerKey");
  sessionStorage.removeItem("oaconfig");
  try {
    await logDebug("startCallback", "OAuth2 login with provider " + providerId + ", authorizing...");

    // Localhost is not a valid host for OAuth2 callbacks, fails immediately 
    // (nevertheless we can use 127.0.0.1 to test the real failure)
    if (window.location.host === "localhost") {
      await new Promise(r => setTimeout(r, 2000));
      await logError("startCallback", "Invalid host: " + window.location.host);
      login.failedLogin(providerId);
      return;
    }

    if (!providerId) {
      await logError("startCallback", "Provider ID is undefined");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      await logError("startCallback", "Did not receive 'code' in callback parameters");
      login.failedLogin(providerId);
      return;
    }

    const tokenResponse = await exchangeCodeForToken(code, oaconfig);

    if (tokenResponse.error) {
      await logError("startCallback", "Error exchanging code for token: " + JSON.stringify(tokenResponse, null, 2))
      login.failedLogin(providerId);
      return;
    }

    const token = tokenResponse.access_token;
    login.successfulLogin(token, providerId);
    window.location.href = "./"; // Redirect back to main app after successful login
  }
  catch (err) {
    await logError("startCallback", "Unexpected error: " + err);
    login.failedLogin(providerId);
  }
};

export async function exchangeCodeForToken(code, oaconfig) {
  const code_verifier = localStorage.getItem("pkce_verifier");

  const body = {
    client_id: oaconfig.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: oaconfig.callbackUrl,
    code_verifier
  };

  const res = await fetch(oaconfig.exchangeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  return res.json();
}

// Logging messages and failures are also shown in the user interface
async function logDebug(method, message) {
  console.log(`auth.${method}: ${message}`);
  $("#callback-provider").text(message);
  //await new Promise(r => setTimeout(r, 2000));
}
async function logError(method, message) {
  console.error(`auth.${method}: ${message}`);
  $("#callback-error").text(message);
  $("#callback-continue-btn").show();
  //await new Promise(r => setTimeout(r, 2000));
}
