import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server.js";

/**
 * Unit tests of the OAuth token exchange proxy.
 *
 * Self-contained: the proxy runs in-process on an ephemeral port, and the Authorization Server
 * is a fake local HTTP server that records the forwarded requests and answers a canned response.
 * No network access nor real OAuth credentials are needed. Run with: npm test
 */

const CLIENT_ID = "myclientid";
const CLIENT_SECRET = "myclientsecret";

let proxy; // the proxy under test
let proxyUrl;
let authServer; // the fake Authorization Server
let authServerUrl;
let received; // requests received by the fake Authorization Server
let cannedStatus; // response that the fake Authorization Server will return
let cannedBody;
let cannedContentType;
let dropConnection; // if true, the fake Authorization Server closes the connection without response

const listen = (server) => new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
});
const close = (server) => new Promise((resolve) => {
  server.closeAllConnections?.();
  server.close(() => resolve());
});

const exchange = async (payload) => {
  const response = await exchangeRaw(JSON.stringify(payload), "application/json");
  return { status: response.status, headers: response.headers, body: await response.json() };
};
const exchangeRaw = (body, contentType) => fetch(`${proxyUrl}/exchange`, {
  method: "POST",
  headers: { "Content-Type": contentType, "Origin": "https://dashgit.example.test" },
  body: body,
});

before(async () => {
  authServer = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => data += chunk);
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body: JSON.parse(data) });
      if (dropConnection) {
        req.socket.destroy();
        return;
      }
      res.writeHead(cannedStatus, { "Content-Type": cannedContentType });
      res.end(typeof cannedBody === "string" ? cannedBody : JSON.stringify(cannedBody));
    });
  });
  authServerUrl = await listen(authServer);
  proxy = http.createServer(app);
  proxyUrl = await listen(proxy);
  // Silence the proxy logs to keep the test output clean
  console.log = () => { };
  console.error = () => { };
});

after(async () => {
  await close(proxy);
  await close(authServer);
});

beforeEach(() => {
  received = [];
  cannedStatus = 200;
  cannedContentType = "application/json";
  dropConnection = false;
  cannedBody = { access_token: "ACCESSTOKEN", token_type: "bearer", refresh_token: "NEWREFRESHTOKEN" };
  process.env["CLIENT_SECRET_" + CLIENT_ID] = CLIENT_SECRET;
  process.env["TOKEN_URL_" + CLIENT_ID] = `${authServerUrl}/oauth/token`;
});

describe("Healthcheck", () => {
  it("returns OK", async () => {
    const response = await fetch(`${proxyUrl}/healthcheck`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "OK");
  });
});

describe("Exchange forbidden", () => {
  it("rejects an unknown client id", async () => {
    const response = await exchange({ grant_type: "authorization_code", client_id: "nope", code: "AUTHCODE" });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "forbidden", error_description: "Exchange not allowed" });
    assert.equal(received.length, 0);
  });

  it("rejects a missing client id", async () => {
    const response = await exchange({ grant_type: "authorization_code", code: "AUTHCODE" });
    assert.equal(response.status, 403);
    assert.equal(response.body.error_description, "Exchange not allowed");
    assert.equal(received.length, 0);
  });

  it("rejects a client with secret but without token url", async () => {
    delete process.env["TOKEN_URL_" + CLIENT_ID];
    const response = await exchange({ grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.status, 403);
    assert.equal(response.body.error_description, "Exchange not allowed");    assert.equal(received.length, 0);
  });

  it("rejects a client with token url but without secret", async () => {
    delete process.env["CLIENT_SECRET_" + CLIENT_ID];
    const response = await exchange({ grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.status, 403);
    assert.equal(response.body.error_description, "Exchange not allowed");
    assert.equal(received.length, 0);
  });

  it("rejects an unsupported grant type", async () => {
    const response = await exchange({ grant_type: "client_credentials", client_id: CLIENT_ID });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "forbidden", error_description: "Grant type not supported" });
    assert.equal(received.length, 0);
  });

  it("rejects a missing grant type", async () => {
    const response = await exchange({ client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.status, 403);
    assert.equal(response.body.error_description, "Grant type not supported");
    assert.equal(received.length, 0);
  });
});

describe("Exchange invalid requests", () => {
  it("rejects a malformed json body", async () => {
    // Rejected by express.json() before reaching the handler: the default Express error handler answers html, not json
    const response = await exchangeRaw("{not json", "application/json");
    assert.equal(response.status, 400);
    assert.equal(received.length, 0);
  });

  it("returns server_error when the body is not json", async () => {
    // express.json() skips the body, req.body is undefined and the handler fails
    const response = await exchangeRaw("grant_type=authorization_code&client_id=myclientid", "application/x-www-form-urlencoded");
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, "server_error");
    assert.equal(received.length, 0);
  });
});

describe("Exchange authorization code", () => {
  it("forwards the code with the secret to the token url and returns the token", async () => {
    const response = await exchange({
      grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE",
      code_verifier: "VERIFIER", redirect_uri: "https://dashgit.example.test/?oapp=github",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, cannedBody);

    assert.equal(received.length, 1);
    assert.equal(received[0].method, "POST");
    assert.equal(received[0].url, "/oauth/token");
    assert.equal(received[0].headers["content-type"], "application/json");
    assert.equal(received[0].headers["accept"], "application/json");
    assert.deepEqual(received[0].body, {
      client_secret: CLIENT_SECRET, client_id: CLIENT_ID, grant_type: "authorization_code",
      redirect_uri: "https://dashgit.example.test/?oapp=github", code: "AUTHCODE", code_verifier: "VERIFIER",
    });
  });

  it("uses the secret from the environment, not a client supplied one", async () => {
    await exchange({
      grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE",
      client_secret: "attacker-supplied", refresh_token: "UNEXPECTED",
    });
    assert.equal(received[0].body.client_secret, CLIENT_SECRET);
    assert.equal(received[0].body.refresh_token, undefined); // only the fields of this grant type are forwarded
  });

  it("selects the secret and token url of each client", async () => {
    process.env.CLIENT_SECRET_otherclient = "othersecret";
    process.env.TOKEN_URL_otherclient = `${authServerUrl}/other/token`;
    try {
      await exchange({ grant_type: "authorization_code", client_id: "otherclient", code: "AUTHCODE" });
      assert.equal(received[0].url, "/other/token");
      assert.equal(received[0].body.client_secret, "othersecret");
    } finally {
      delete process.env.CLIENT_SECRET_otherclient;
      delete process.env.TOKEN_URL_otherclient;
    }
  });
});

describe("Exchange refresh token", () => {
  it("forwards the refresh token with the secret to the token url and returns the token", async () => {
    const response = await exchange({
      grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: "REFRESHTOKEN",
      redirect_uri: "https://dashgit.example.test/?oapp=github", code: "UNEXPECTED",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, cannedBody);
    assert.deepEqual(received[0].body, {
      client_secret: CLIENT_SECRET, refresh_token: "REFRESHTOKEN", client_id: CLIENT_ID,
      grant_type: "refresh_token", redirect_uri: "https://dashgit.example.test/?oapp=github",
    });
  });
});

describe("Authorization Server responses and failures", () => {
  it("passes an error response through to the client with status 200", async () => {
    // Current behaviour (same as dashgit-server-py): the body is returned but the status is not propagated
    cannedStatus = 401;
    cannedBody = { error: "bad_verification_code", error_description: "The code is incorrect or expired." };
    const response = await exchange({ grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, cannedBody);
  });

  it("passes a json server failure through to the client with status 200", async () => {
    cannedStatus = 503;
    cannedBody = { error: "temporarily_unavailable" };
    const response = await exchange({ grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, cannedBody);
  });

  it("returns server_error when a server failure is not json", async () => {
    cannedStatus = 502;
    cannedContentType = "text/html";
    cannedBody = "<html>Bad Gateway</html>";
    await assertServerError();
  });

  it("returns server_error when a successful response is not json", async () => {
    cannedContentType = "text/html";
    cannedBody = "<html>not json</html>";
    await assertServerError();
  });

  it("returns server_error when the response is empty", async () => {
    cannedBody = "";
    await assertServerError();
  });

  it("returns server_error when the connection is closed without response", async () => {
    dropConnection = true;
    await assertServerError();
    assert.equal(received.length, 1);
  });

  it("returns server_error when the token url is unreachable", async () => {
    process.env["TOKEN_URL_" + CLIENT_ID] = "http://127.0.0.1:1/oauth/token";
    await assertServerError();
  });

  it("returns server_error when the token url is not a valid url", async () => {
    process.env["TOKEN_URL_" + CLIENT_ID] = "not-a-url";
    await assertServerError();
  });

  const assertServerError = async () => {
    const response = await exchange({ grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.status, 500);
    assert.equal(response.body.error, "server_error");
    assert.ok(response.body.error_description, "error_description should explain the failure");
  };
});

describe("CORS", () => {
  it("allows cross-origin requests to the exchange", async () => {
    const response = await exchange({ grant_type: "authorization_code", client_id: CLIENT_ID, code: "AUTHCODE" });
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  });

  it("answers the preflight request", async () => {
    const response = await fetch(`${proxyUrl}/exchange`, {
      method: "OPTIONS",
      headers: {
        "Origin": "https://dashgit.example.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("access-control-allow-methods"), /POST/);
  });
});
