// auth.js
import { generatePKCE } from "./pkce.js";
import { Octokit } from "https://esm.sh/@octokit/rest";

const CLIENT_ID = "Ov23li0DL5jGO8oPBNqj";
const REDIRECT_URI = "https://test4data.com/desarrollo/dashgit/auth/callback.html";
const SCOPES = "repo read:user";

export async function startLogin() {
  const { code_verifier, code_challenge } = await generatePKCE();
  localStorage.setItem("pkce_verifier", code_verifier);

  const url =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code` +
    `&code_challenge=${code_challenge}` +
    `&code_challenge_method=S256`;

  window.location = url;
}

export async function exchangeCodeForToken(code) {
  const code_verifier = localStorage.getItem("pkce_verifier");

  const body = {
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier
  };

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  return res.json();
}

export function initOctokit(token) {
  return new Octokit({ auth: token });
}

// Hook jQuery solo en esta página (index)
if (typeof window !== "undefined") {
  $(document).ready(() => {
    const loginBtn = document.getElementById("login");
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        startLogin().catch(err => console.error(err));
      });
    }
  });
}
