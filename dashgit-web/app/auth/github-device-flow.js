// github-device-flow.js
import { Octokit } from "https://esm.sh/@octokit/rest";

const CLIENT_ID = "Ov23li0DL5jGO8oPBNqj";
const SCOPES = "repo read:org read:user";

$(async function () {
  // 1. Solicitar device_code
  const deviceResp = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPES
    })
  });

  const deviceData = await deviceResp.json();

  $("#step1").hide();
  $("#step2").show();

  $("#user-code").text(deviceData.user_code);
  $("#verify-link")
    .attr("href", deviceData.verification_uri)
    .text(deviceData.verification_uri);

  // 2. Polling
  const interval = deviceData.interval * 1000;

  const poll = async () => {
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: deviceData.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });

    const tokenData = await tokenResp.json();

    if (tokenData.error === "authorization_pending") {
      setTimeout(poll, interval);
      return;
    }

    if (tokenData.error) {
      alert("Error: " + tokenData.error);
      return;
    }

    // 3. Token obtenido
    const token = tokenData.access_token;

    // Enviar token a la ventana principal
    window.opener.postMessage({ type: "github-token", token }, "*");

    $("#step2").hide();
    $("#done").show();

    setTimeout(() => window.close(), 1500);
  };

  poll();
});
