// auth.js
import { generatePKCE } from "./pkce.js";
import { Octokit } from "https://esm.sh/@octokit/rest";
import { login } from "../Login.js";
import { config } from "../Config.js";

export async function startLogin() {
  config.load();
  const oaconfig = login.getOAuthAppConfig(getProviderId());
  console.log("auth.js: Init startLogin with provider " + getProviderId());

  // Localhost is not a valid host for OAuth2 callbacks, simulates the callback
  if (window.location.host === "localhost") {
    await new Promise(r => setTimeout(r, 5000));
    window.location.href = "http://localhost/dashgit/oauth/callback.html";
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

export async function exchangeCodeForToken(code) {
  const code_verifier = localStorage.getItem("pkce_verifier");

  config.load();
  const oaconfig = login.getOAuthAppConfig(getProviderId());
  console.log("auth.js: Init exchangeCodeForToken with provider " + getProviderId());

  const body = {
    client_id: oaconfig.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: oaconfig.callbackUrl,
    code_verifier
  };

  //const res = await fetch("https://github.com/login/oauth/access_token", {
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

// This module is called in two scenarios: 
// - when loading the index.html to initiate OAuth login
// - when the callback.html is invoked to complete the login
// In both cases, we need to know which provider is being used, so we get it from the url parameter "key" 
// and store in sessionStorage for later use in the callback.html
export function storeProviderIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const providerId = params.get("key");
  storeProviderId(providerId);
}
export function storeProviderId(providerId) {
  sessionStorage.setItem("providerKey", providerId);
}
export function getProviderId() {
  return sessionStorage.getItem("providerKey");
}

// Called from callback.html when the login is successful to save the token and ensure the the provider is marked as oauth
export function successfulLogin(token, providerId) {
  config.load();
  config.data.providers[providerId].oauth = true;
  config.save();
  login.saveOAuthTokenById(token, providerId);
}
// Called from callback.html when the login fails to ensure a special value in the token to avoid autentication loops
export function failedLogin(providerId) {
  login.saveOAuthTokenById("failed", providerId);
}

export function initOctokit(token) {
  return new Octokit({ auth: token });
}

// Hook jQuery solo en esta página (index)
if (typeof window !== "undefined") {
  $(document).ready(() => {
    storeProviderIdFromUrl(); // save the id to be retrieved later in the callback.html
    console.log("auth.js: Opening OAuth2 login start window with provider " + getProviderId());
    config.load();
    const oaconfig = login.getOAuthAppConfig(getProviderId());

    // Temporal, for ddebug
    $("#oaconfig").text(JSON.stringify(oaconfig, null, 2));

    const loginBtn = document.getElementById("login");
    const backBtn = document.getElementById("back");
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        startLogin().catch(err => console.error(err));
      });
    }
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        window.location.href = "../";
      });
    }
  });
}
