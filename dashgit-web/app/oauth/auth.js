// auth.js
import { generatePKCE } from "./pkce.js";
import { Octokit } from "https://esm.sh/@octokit/rest";
import { login } from "../Login.js";
import { config } from "../Config.js";

export async function startLogin() {
  const { code_verifier, code_challenge } = await generatePKCE();
  localStorage.setItem("pkce_verifier", code_verifier);

  config.load();
  const provider = config.data.providers[getProviderKeyFromUrl()];
  const oaconfig = login.getOAuthAppConfig(provider);

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
  const provider = config.data.providers[getProviderKeyFromUrl()];
  const oaconfig = login.getOAuthAppConfig(provider);

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

export function getProviderKeyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("key");
}

export function initOctokit(token) {
  return new Octokit({ auth: token });
}

// Hook jQuery solo en esta página (index)
if (typeof window !== "undefined") {
  $(document).ready(() => {
    config.load();
    const provider = config.data.providers[getProviderKeyFromUrl()];
    const oaconfig = login.getOAuthAppConfig(provider);

    // Temporal, for ddebug
    $("#oaconfig").text(JSON.stringify(oaconfig, null, 2));
    $("#provider").text(JSON.stringify(provider, null, 2));

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
