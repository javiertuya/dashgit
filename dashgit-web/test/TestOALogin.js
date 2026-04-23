import assert from 'assert';
import sinon from 'sinon';
import { createMockSessionStorage } from "./MockSessionStorage.js";
import { config } from "../app/core/Config.js"
import { login } from "../app/login/Login.js"
import { loginController } from "../app/login/LoginController.js"

/**
 * Test the main interaction points between the controller and the login module that manages 
 * OAuth2 authentication during a page load
 * - The login start that decides what providers need to log in
 * - The setting of the tokens after the callback was invoked
 * - The renewal of expired tokens
 * As this is not testing the controller, a main utility method (loadPage) simulates the controller flow.
 */
let getDashGitUrl;
beforeEach(function () {
  // Where tokens are stored, as from node there is no a window object, this mocks the session storage implementation
  globalThis.sessionStorage = createMockSessionStorage();
  // Needed to know the current url where DashGit is running, used when building the OAuth configuration
  getDashGitUrl = sinon.stub(login, "getDashGitUrl").resolves(Promise.resolve("https://dashgit.domain/dashgit"));
  // Additional mock is needed to handle token renewals, but only in the specific tests.
});
afterEach(function () {
  sinon.restore();
});

// Complementary functions to create test data
function getConfig(providers) {
  return {
    managerRepo: {
      provider: "GitHub",
      enabled: false,
      uid: "manager-repo-github",
      url: "https://github.com",
      name: "myuser/dashgit-manager",
      token: "",
      oauth: true,
      oacustom: { enabled: false, clientId: "", tokenUrl: "" },
    },
    providers: providers,
  }
}
function provider(id, user, platform = "GitHub") {
  return {
    provider: platform,
    uid: id + "-" + platform.toLowerCase(),
    url: platform == "GitHub" ? "https://github.com" : "https://gitlab.com", //only auto for GitLab
    enabled: true,
    user: user,
    token: "",
    oauth: true,
    oacustom: { enabled: false, clientId: "", tokenUrl: "" },
  };;
}

// Main general purpose utility to simulate a page load with the sequence of 
// - checking if providers are not logged in 
// - and run the callback that completes the login of the first one, 
// Includes the corresponding assertions
async function loadPage(notLoggedCount, failed = false, tokenPrefix = "token", expiration = false) {

  // On loading, before processing and rendering, the controller checks the login status for all OAuth2 enabled providers
  let status = await login.getLoginStatusForAllProviders();
  assert.equal(notLoggedCount, status.unsetProviders.length);

  // If any provider is not logged in, the controller will start login of the first one
  // Eventually after the callback redirection, the succcessful/failed methods will set the token, this is done here
  if (status.unsetProviders.length > 0 && failed) {
    await login.failedLogin(status.unsetProviders[0].uid);
    // Check that the token is set as failed
    assert.equal("failed", login.getProviderToken(status.unsetProviders[0]));
  } else if (status.unsetProviders.length > 0) { // succesful
    // the token name convention is tokenPrefix + first-char-of-provier-uid
    // if indicated in the argument, it can add expiration token and time
    const tokenToAssign = tokenPrefix + status.unsetProviders[0].uid.charAt(0);
    await login.successfulLogin(tokenToAssign,
      expiration ? "refresh-" + tokenToAssign : "", expiration ? 720 : "", status.unsetProviders[0]);
    // Check that the token is set
    assert.equal(tokenToAssign, login.getProviderToken(status.unsetProviders[0]));
  }

  // The callback redirects again to load the page, this will be checked in another call of this method
}

// General purpose utility to enclose the data configuration and login process for a single provider
async function setupSingleProvider(platform) {
  config.data = getConfig([provider(0, "myuser", platform)]);
  await loadPage(1);
  assert.equal("token0", login.getProviderToken(config.data.providers[0]));
  await loadPage(0);
}

describe("TestOALogin", function () {

  describe("Reusing login between providers", function () {
    it("Simple Scenario: Login a single provider", async function () {
      config.data = getConfig([provider(0, "myuser")]);

      // Loading the first time, there was 1 provider to log in, the callback was called and the token set
      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));

      // When the callback finishes redirects to load for a second time, the controller can continue the processing and rendering
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
    });

    it("Main Scenario 1: Logins are not reused across different platforms even username is the same", async function () {
      config.data = getConfig([provider(0, "myuser"), provider(1, "myuser", "GitLab")]);

      // Loading the first time, still 2 providers need login, set the first one
      await loadPage(2);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.providers[1]));

      // When the callback finishes redirects to load for a second time, sets the second
      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));

      // The callback redirects again, all providers already set, the controller can continue the processing and rendering
      // (missing parameters in the login method should not be used)
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));
    });

    it("Main scenario 2: Logins are reused in same platform even username is the different", async function () {
      config.data = getConfig([provider(0, "myuser"), provider(1, "myuser"), provider(2, "other")]);

      // first load
      await loadPage(3);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.providers[1]));
      assert.equal("", login.getProviderToken(config.data.providers[2]));

      // The second page load afther de callback redirect reuses the tokens
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token0", login.getProviderToken(config.data.providers[1]));
      assert.equal("token0", login.getProviderToken(config.data.providers[2]));
    });

    it("Failed login in different platforms do not prevent success in the other", async function () {
      // Main scenario 1, but the first provider fails login
      config.data = getConfig([provider(0, "myuser"), provider(1, "myuser", "GitLab")]);

      // First provider fails
      await loadPage(2, true);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.providers[1]));

      // Second one succeeds
      await loadPage(1, false);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));

      // Last page load, can proceed
      await loadPage(0);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));
    });

    it("Failed login in a platform is reused even if username is different", async function () {
      // Main scenario 2, but the login fails
      config.data = getConfig([provider(0, "myuser"), provider(1, "myuser"), provider(2, "other")]);

      await loadPage(3, true);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.providers[1]));
      assert.equal("", login.getProviderToken(config.data.providers[2]));

      // second load reuses the token of first provider, no more logins are needed
      await loadPage(0, true);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal("failed", login.getProviderToken(config.data.providers[1]));
      assert.equal("failed", login.getProviderToken(config.data.providers[2]));
    });

    it("Logins are not reused in different instances of same platform", async function () {
      // Main scenario 1, but the difference is not the platform, but the instance of the same platfrom
      config.data = getConfig([provider(0, "myuser", "GitLab"), provider(1, "myuser", "GitLab")]);
      config.data.providers[0].url = "https://my.gitlab.instance";

      // This is same that main scenario, but here the platform is the same (GitLab) but url different
      await loadPage(2);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.providers[1]));

      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));

      await loadPage(0);
    });

  });

  describe("Manager Repo login", function () {
    it("Manager Repo shares login with provider on GitHub", async function () {
      config.data = getConfig([provider(0, "myuser", "GitHub")]);
      config.data.managerRepo.enabled = true;

      // Manager repo is considered like an additional provider, added at the end of the other providers
      await loadPage(2);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.managerRepo));

      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token0", login.getProviderToken(config.data.managerRepo));
    });

    it("Manager Repo does not share login with provider on GitLab", async function () {
      config.data = getConfig([provider(0, "myuser", "GitLab")]);
      config.data.managerRepo.enabled = true;

      await loadPage(2);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.managerRepo));

      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("tokenm", login.getProviderToken(config.data.managerRepo));

      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("tokenm", login.getProviderToken(config.data.managerRepo));
    });

    it("Switch on the Manager Repo with already logged GitHub shares login", async function () {
      config.data = getConfig([provider(0, "myuser", "GitHub")]);

      // Login without manager repo, it does not get token
      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.managerRepo));
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.managerRepo));

      // now enable the manager and new load, new login is not necessary
      config.data.managerRepo.enabled = true;
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token0", login.getProviderToken(config.data.managerRepo));
    });

    it("Switch on Manager Repo with logged GitLab requires new login", async function () {
      config.data = getConfig([provider(0, "myuser", "GitLab")]);

      // Login without manager repo, it does not get token
      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.managerRepo));
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.managerRepo));

      // now enable the manager and new load, new login for the manager is necessary
      config.data.managerRepo.enabled = true;
      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("tokenm", login.getProviderToken(config.data.managerRepo));

      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("tokenm", login.getProviderToken(config.data.managerRepo));
    });
  });

  // Below tests start from an already logged user
  describe("Transitions: OAuth customization changes", function () {
    it("Client ID customization forces new login", async function () {
      await setupSingleProvider("GitLab");
      // just to check initial conditions, only in this test
      console.log(login.getOAuthTokenInfoByUid("0-gitlab"));

      config.data.providers[0].oacustom.enabled = true;
      config.data.providers[0].oacustom.clientId = "custom-client-id";

      // Next page load, the token is removed and requires another login
      // Uses other prefix different from the default to ensure that token is replaced
      await loadPage(1, false, "new-token");
      assert.equal("new-token0", login.getProviderToken(config.data.providers[0]));
    });

    it("Exchange proxy customization forces new login", async function () {
      await setupSingleProvider("GitLab");
      config.data.providers[0].oacustom.enabled = true;
      config.data.providers[0].oacustom.tokenUrl = "http://new.token.url/token";

      await loadPage(1, false, "new-token");
      assert.equal("new-token0", login.getProviderToken(config.data.providers[0]));
    });

    it("Back to disable customization forces new login", async function () {
      await setupSingleProvider("GitLab");
      config.data.providers[0].oacustom.enabled = true;
      config.data.providers[0].oacustom.tokenUrl = "http://new.token.url/token";
      config.data.providers[0].oacustom.clientId = "custom-client-id";

      // Check that token was removed and replaced
      await loadPage(1, false, "new-token");
      assert.equal("new-token0", login.getProviderToken(config.data.providers[0]));

      // New configuration change and token reset
      // Just disable the check, old config data still remains, but not applicable
      config.data.providers[0].oacustom.enabled = false;
      await loadPage(1, false, "other-new-token");
      assert.equal("other-new-token0", login.getProviderToken(config.data.providers[0]));
    });

    it("Changing username does not force new login", async function () {
      await setupSingleProvider("GitLab");
      config.data.providers[0].user = "changed-user";

      // token does not change
      await loadPage(0, false, "new-token");
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
    });

    it("Changing provider url (change the instance of the repo server) forces new login", async function () {
      await setupSingleProvider("GitLab");
      config.data.providers[0].url = "http://changed.on.premises.url";

      await loadPage(1, false, "new-token");
      assert.equal("new-token0", login.getProviderToken(config.data.providers[0]));
    });
  });

  describe("Transitions: Enabling/Disabling providers", function () {
    it("Scenario: enable providers from scratch with/without login reuse", async function () {
      config.data = getConfig([provider(0, "ghuser", "GitHub"), provider(1, "ghuser", "GitHub"), provider(2, "gluser", "GitLab")]);
      config.data.providers[1].enabled = false;
      config.data.providers[2].enabled = false;

      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("", login.getProviderToken(config.data.providers[1]));
      assert.equal("", login.getProviderToken(config.data.providers[2]));

      // enable second provider, reuses login
      config.data.providers[1].enabled = true;
      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token0", login.getProviderToken(config.data.providers[1]));
      assert.equal("", login.getProviderToken(config.data.providers[2]));

      // enable second provider, does not reuse login
      config.data.providers[2].enabled = true;
      await loadPage(1);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token0", login.getProviderToken(config.data.providers[1]));
      assert.equal("token2", login.getProviderToken(config.data.providers[2]));

      await loadPage(0);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token0", login.getProviderToken(config.data.providers[1]));
      assert.equal("token2", login.getProviderToken(config.data.providers[2]));
    });

    it("Scenario: disable and re-enable provider reuses previous token (token was not destroyed)", async function () {
      await setupSingleProvider("GitHub");
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));

      config.data.providers[0].enable = false;
      await loadPage(0, false, "new-token");
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));

      config.data.providers[0].enable = true;
      await loadPage(0, false, "new-token");
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
    });
  });

  describe("Token expieration and renewal", function () {
    // The above tests handle
    it("Token has renewal info, but not expired", async function () {
      let refreshTokenInfo = { access_token: "new-token", refresh_token: "new-refresh-token", expires_in: 7200 };
      let refreshTokenStub = sinon.stub(loginController, "refreshExpiredToken").resolves(Promise.resolve(refreshTokenInfo));

      // Login in this page and check that expiration has not been called
      await setupSingleProviderWithExpiration("GitLab");
      sinon.assert.callCount(refreshTokenStub, 0);

      // Change expiration time to now some near future (refresh is forced 5 minutes before expiration)
      changeExpirationInfo("0-gitlab", 10)

      // still valid
      await login.refreshTokensForAllProviders();
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("refresh-token0", login.getOAuthTokenInfoByUid('0-gitlab').refreshToken);
      sinon.assert.callCount(refreshTokenStub, 0);
    });

    it("Successful expired token renewal", async function () {
      let refreshTokenInfo = { access_token: "new-token", refresh_token: "new-refresh-token", expires_in: 7200 };
      let refreshTokenStub = sinon.stub(loginController, "refreshExpiredToken").resolves(Promise.resolve(refreshTokenInfo));

      await setupSingleProviderWithExpiration("GitLab");
      sinon.assert.callCount(refreshTokenStub, 0);

      // Change expiration time to now (refresh is forced 5 minutes before expiration)
      changeExpirationInfo("0-gitlab", 0)

      // Load the page with the token expired, still not refreshed
      await loadPage(0, false, "token", true);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      sinon.assert.callCount(refreshTokenStub, 0);

      // Refresh, now the tokens change and refresh api is called
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 1);
      assert.equal("new-token", login.getProviderToken(config.data.providers[0]));
      assert.equal("new-refresh-token", login.getOAuthTokenInfoByUid('0-gitlab').refreshToken);
    });

    it("Successful token renewal is shared/no shared across providers", async function () {
      // Setup of three providers, two share login, the third (middle) does not, and initial login
      let refreshTokenInfo = { access_token: "new-token", refresh_token: "new-refresh-token", expires_in: 7200 };
      let refreshTokenStub = sinon.stub(loginController, "refreshExpiredToken").resolves(Promise.resolve(refreshTokenInfo));
      config.data = getConfig([provider(0, "myuser", "GitLab"), provider(1, "myuser", "GitLab"), provider(2, "myuser", "GitLab")]);
      config.data.providers[1].url = "https://my.gitlab.domain";

      await loadPage(3, false, "token", true);
      await loadPage(1, false, "token", true);
      await loadPage(0, false, "token", true);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));
      assert.equal("token0", login.getProviderToken(config.data.providers[2]));
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 0);

      // Change providers that share login
      changeExpirationInfo("0-gitlab", 0)
      changeExpirationInfo("2-gitlab", 0)
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 1);
      assert.equal("new-token", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));
      assert.equal("new-token", login.getProviderToken(config.data.providers[2]));

      // change in all providers (new token is the same because of sharing the stub)
      changeExpirationInfo("0-gitlab", 0)
      changeExpirationInfo("1-gitlab", 0)
      changeExpirationInfo("2-gitlab", 0)
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 3); //1 from previous block, 2 here
      assert.equal("new-token", login.getProviderToken(config.data.providers[0]));
      assert.equal("new-token", login.getProviderToken(config.data.providers[1]));
      assert.equal("new-token", login.getProviderToken(config.data.providers[2]));
    });

    it("Failed token renewal", async function () {
      // like successful, but failing, shorter scenario
      let refreshTokenInfo = { error: "Something failed" };
      let refreshTokenStub = sinon.stub(loginController, "refreshExpiredToken").resolves(Promise.resolve(refreshTokenInfo));

      await setupSingleProviderWithExpiration("GitLab");
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 0);
      changeExpirationInfo("0-gitlab", 0)

      // Refresh, now the tokens change and refresh api is called
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 1);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal(undefined, login.getOAuthTokenInfoByUid('0-gitlab').refreshToken);
    });
    it("Failed token renewal is shared/no shared across providers", async function () {
      // like successful, but failing, shorter scenario
      let refreshTokenInfo = { error: "Something failed" };
      let refreshTokenStub = sinon.stub(loginController, "refreshExpiredToken").resolves(Promise.resolve(refreshTokenInfo));
      config.data = getConfig([provider(0, "myuser", "GitLab"), provider(1, "myuser", "GitLab"), provider(2, "myuser", "GitLab")]);
      config.data.providers[1].url = "https://my.gitlab.domain";

      await loadPage(3, false, "token", true);
      await loadPage(1, false, "token", true);
      await loadPage(0, false, "token", true);
      assert.equal("token0", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));
      assert.equal("token0", login.getProviderToken(config.data.providers[2]));
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 0);

      // Change providers that share login
      changeExpirationInfo("0-gitlab", 0)
      changeExpirationInfo("2-gitlab", 0)
      await login.refreshTokensForAllProviders();
      sinon.assert.callCount(refreshTokenStub, 1);
      assert.equal("failed", login.getProviderToken(config.data.providers[0]));
      assert.equal("token1", login.getProviderToken(config.data.providers[1]));
      assert.equal("failed", login.getProviderToken(config.data.providers[2]));
    });
  });

});

function changeExpirationInfo(providerUid, minutesFromNow) {
  let tokenInfo = login.getOAuthTokenInfoByUid(providerUid);
  tokenInfo.refreshTime = new Date(new Date().getTime() + minutesFromNow * 60 * 1000).toISOString();
  login.setOAuthTokenInfoByUid(providerUid, tokenInfo);
}
// General purpose utility to enclose the data configuration and login process for a single provider
async function setupSingleProviderWithExpiration(platform) {
  config.data = getConfig([provider(0, "myuser", platform)]);
  // Initial login, token with expiration info
  await loadPage(1, false, "token", true);
  await loadPage(0, false, "token", true);
  assert.equal("token0", login.getProviderToken(config.data.providers[0]));
  // Check the refresh, tokens does not change and renewal is not called. Check also the refresh token
  await login.refreshTokensForAllProviders();
  assert.equal("token0", login.getProviderToken(config.data.providers[0]));
  assert.equal("refresh-token0", login.getOAuthTokenInfoByUid('0-gitlab').refreshToken);
}
