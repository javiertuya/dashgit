import { encryption } from "./Encryption.js"
import { config } from "./Config.js"
import { oaconfig } from "./oauth/OAConfig.js"
import { startLogin, handleCallback, refreshExpiredToken } from "./oauth/auth.js"

/**
 * Manges the login of the providers and returns the appropriate token when requested.
 * - Central point to get the API access tokens (for PAT and OAuth)
 * - Required methods that called from controllers to coordinate the OAuth login process
 * - Setup of the OAuth configuration for each provider (oaconfig)
 * - Interface with the oauth module (invoke the start and callback handler and receives the login result)
 * - Manage encryption/decription for password protected PAT authentication
 */
const PROVIDER_UID="dashgit-oauth-provider-key"; // Store: provider that is currently being handled
const OAUTH_TOKEN_PREFIX="dashgit-oauth-token_"; // Store: token names are prefix+uid
const OAUTH_REFRESH_PREFIX="dashgit-oauth-refresh_"; // Store: refresh token and date to refresh
const PAT_SECRET = "dashgit-pat-secret"; // Store: to decript PATs (entered by the user at the session start)
const login = {

  // Returns the token for a provider, either PAT or OAuth
  getProviderToken: function (provider) {
    let token = provider.oauth ? this.getOAuthTokenByUid(provider.uid) : this.decrypt(provider.token);
    return token;
  },

  ////////////////////////////////////////////////////////////////////////////
  // OAuth2 authentication
  ////////////////////////////////////////////////////////////////////////////

  // Determines the providers that use OAuth and if they require a new login or they failed login
  getLoginStatusForAllProviders: async function () { // NOSONAR
    let status = {
      unsetProviders: [], // providers that are not logged yet, to decide when the login process is finished
      failedProviders: [], // providers that failed to login, to skip and inform the user
      alreadySetByApp: {}, // map app-provider that are already set, to do not repeat login for other providers using same app
    }
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Login.js: Provider " + provider.uid + " is configured for OAuth2, checking token and status");
      const token = this.getProviderToken(provider);

      const providerConfig = this.getOAuthProviderConfig(provider);
      console.log(`- Applicable configuration: ${JSON.stringify(providerConfig, null, 2)}`);

      const providerWithMyApp = status.alreadySetByApp[providerConfig.appName + "-" + provider.provider + "-" + provider.url];
      if (providerWithMyApp) { // Optimization to avoid multiple logins for the same app
        console.log(`- Provider ${provider.uid} authenticates with the same app than ${providerWithMyApp.uid}, which is known to be logged or failed, set this token`);
        this.copyFromAppAlreadySet(providerWithMyApp, provider, status);
      } else if (token) { // Existing token, manages failures and refresh
        if (token === "failed") {
          console.log("- Previous login attempt failed, skip login");
          status.failedProviders.push(provider);
        } else {
          await this.refreshTokenIfNeeded(provider, providerConfig);
          console.log("- Already logged");
        }
        // to avoid repeat login if already logged in the same app, platform and url,
        status.alreadySetByApp[providerConfig.appName + "-" + provider.provider + "-" + provider.url] = provider;
      } else {
          console.log("- Requires login");
          status.unsetProviders.push(provider);
      }
    }
    return status;
  },
  copyFromAppAlreadySet: function(providerWithMyApp, provider, status) {
    // Copy to the provider, this includes both the token and the refresh info
    const token = this.getOAuthTokenByUid(providerWithMyApp.uid);
    this.setOAuthTokenByUid(provider.uid, token);
    const refresh = this.getOAuthRefreshByUid(providerWithMyApp.uid);
    this.setOAuthRefreshByUid(provider.uid, refresh);

    // Failed status must be recorded too
    if (token == "failed")
      status.failedProviders.push(provider);
  },
  getOAuthEnabledProviders: function() {
    let providers = [];
    for (const provider of config.data.providers) {
      if (provider.enabled && provider.oauth) {
        providers.push(provider);
      }
    }
    // Adds the manager repo if it is also configured for oauth
    const managerProvider = this.getManagerRepoProvider();
    if (managerProvider.enabled && managerProvider.oauth)
      providers.push(managerProvider);
    return providers;
  },
  
  // The manager repo (in config.data) has properties related to authentication with the same names than providers,
  // but they lack some others to allow manage its OAuth authentication like the other providers
  getManagerRepoProvider: function() {
    const manager = config.data.managerRepo;
    const provider = {
      provider: "GitHub",
      uid: "manager-repo-github",
      token: manager.token,
      oauth: manager.oauth,
      oacustom: manager.oacustom,
      enabled: manager.enabled,
      url: "https://github.com"
    };
    return provider;
  },

  // Interface with the auth module to initiate the login, callback and token refresh
  refreshTokenIfNeeded: async function (provider, providerConfig) {
    const refresh = this.getOAuthRefreshByUid(provider.uid);
    if (refresh.token != "" && refresh.time != "" && new Date().getTime() > new Date(refresh.time).getTime()) {
      console.log("- Refreshing token");
      // auth module will invoke successfulLogin (that requires the uid in session storage) after refresh to set the new tokens
      sessionStorage.setItem(PROVIDER_UID, provider.uid)
      await refreshExpiredToken(refresh.token, providerConfig);
      sessionStorage.removeItem(PROVIDER_UID);
    }
  },
  startLoginForProvider: async function (provider) {
    console.log("Login.js: Starting login for provider " + provider.uid);
    let conf = this.getOAuthProviderConfig(provider);

    sessionStorage.setItem(PROVIDER_UID, provider.uid)
    await this.logDebug("Login with provider " + provider.uid + ", requesting...");

    // To prevent the startLogin transfer control to a non existent url because a bad configuration,
    // check first if the configuration was found, using the error display mechanisms in the auth.js module
    // that mark it as failed and notify the user
    if (Object.keys(conf).length === 0) {
      const customAppName = provider.oacustom.enabled ? provider.oacustom.appName : "";
      if (customAppName == "") // the default was not found, this should never happen
        await this.failedLogin(`The default app could not be found, provider ${provider.uid}."`);
      else // The user specified a wrong custom app
        await this.failedLogin(`The custom app "${customAppName}" could not be found, provider ${provider.uid}. Please, review your OAuth custom settings"`);
      return;
    }
    // Localhost is not a valid host for OAuth2 callbacks, simulates the callback (that will fail)
    if (window.location.host === "localhost") {
      //await new Promise(r => setTimeout(r, 2000));
      window.location.href = "http://localhost/dashgit/?oapp=github";
      return;
    }

    await startLogin(conf);
  },
  handleCallbackFromApp: async function (app) {
    const providerUid = sessionStorage.getItem(PROVIDER_UID);
    console.log("Login.js: Callback received from " + app + ", starting login procedure");
    await this.logDebug("Login with provider " + providerUid + ", authorizing...");
    // Localhost is not a valid host for OAuth2 callbacks, fails immediately 
    // (nevertheless we can use 127.0.0.1 to test the real failure)
    if (window.location.host === "localhost") {
      //await new Promise(r => setTimeout(r, 2000));
      await this.failedLogin("Invalid host: " + window.location.host);
      return;
    }
    if (!providerUid) {
      await this.logError("Provider ID is undefined");
      return;
    }

    await handleCallback();
    sessionStorage.removeItem(PROVIDER_UID); // not needed anymore
  },

  // Invoked from the auth module at the end of the callback to notify the status:
  // - when the login is successful to save the token
  // - when the login fails to ensure a "failed" value in the token to avoid autentication loops

  successfulLogin: async function (token, refreshToken, expiresIn) {
    const providerUid = sessionStorage.getItem(PROVIDER_UID);
    this.setOAuthTokenByUid(providerUid, token);
    // stores in a separate session variable the refresh info, 10 minutes before expiration, 
    // no undefined values (GotHub does not have refresh, GitLab does)
    const refreshTime = expiresIn ? new Date(new Date().getTime() + (expiresIn - 600) * 1000).toISOString() : "";
    this.setOAuthRefreshByUid(providerUid, {token: refreshToken ?? "", time: refreshTime});
  },
  failedLogin: async function (message) {
    await this.logError(message);
    const providerUid = sessionStorage.getItem(PROVIDER_UID);
    this.setOAuthTokenByUid(providerUid, "failed");
  },
  setOAuthTokenByUid: function (uid, token) {
    sessionStorage.setItem(`${OAUTH_TOKEN_PREFIX}${uid}`, token);
  },
  getOAuthTokenByUid: function (uid) {
    return sessionStorage.getItem(`${OAUTH_TOKEN_PREFIX}${uid}`);
  },
  setOAuthRefreshByUid: function (uid, refreshInfo) {
    sessionStorage.setItem(`${OAUTH_REFRESH_PREFIX}${uid}`, JSON.stringify(refreshInfo));
  },
  getOAuthRefreshByUid: function (uid) {
    return JSON.parse(sessionStorage.getItem(`${OAUTH_REFRESH_PREFIX}${uid}`));
  },
  retryOAuth: function () {
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Check provider for retry: " + provider.uid);
      const token = this.getProviderToken(provider);
      if (token == "failed") {
        console.log("Reset failed token for provider: " + provider.uid);
        sessionStorage.removeItem(`${OAUTH_TOKEN_PREFIX}${provider.uid}`);
      }
    }
    window.location.href = "./"
  },

  // Logging messages and failures are also shown in the user interface
  logDebug: async function (message) {
    console.log(`OAuth: ${message}`);
    $("#callback-provider").text(message);
    //await new Promise(r => setTimeout(r, 2000));
  },
  logError: async function (message) {
    console.error(`OAuth: ${message}`);
    $("#callback-error").text(message);
    $("#callback-continue-btn").show();
    //await new Promise(r => setTimeout(r, 2000));
  },

  ////////////////////////////////////////////////////////////////////////////
  // OAuth2 configuration
  ////////////////////////////////////////////////////////////////////////////
 

  getOAuthProviderConfig: function (provider) {
    // Currently only supporting single app name
    const appName = provider.provider.toLowerCase();
    const thisUrl = window.location.protocol + "//" + window.location.host  + window.location.pathname
    return this.getOAuthAppConfig(appName, provider.provider, provider.url, thisUrl, oaconfig, provider.oacustom);
  },

  // Creates the configuration required for 
  // - a given platform (named .provider in the DashGit config) and url
  // - the current url of the Git server and the url where this is running
  // - Applying the defaults that are harcoded in OAConfig module
  // - And the custom configuration that is set in the provider config.
  getOAuthAppConfig: function (appName, platform, platformUrl, thisUrl, oadefaults, oacustom) {
    // Using appName and platform makes a lookup to get the defaults
    const oadefault = oadefaults[platform]?.[appName] ?? {};
    if (Object.keys(oadefault).length === 0) // wrong configuration
      return {};
    
    // Other platform specific configuration and other overrides
    const clientId = oacustom?.enabled && (oacustom?.clientId ?? "") != "" ? oacustom.clientId : oadefault.clientId;
    const tokenUrl = oacustom?.enabled && (oacustom?.tokenUrl ?? "") != "" ? oacustom.tokenUrl : oadefault.tokenUrl;
    const callbackUrl = thisUrl + "?oapp=" + appName;
    const authorizeUrl = platformUrl.replace(/\/$/, '') + oadefault.authorizePath;

    const oatarget = {
        appName: appName,
        clientId: clientId,
        callbackUrl: callbackUrl,
        authorizeUrl: authorizeUrl,
        scopes: oadefault.scopes,
        tokenUrl: tokenUrl,
    };
    return oatarget;
  },

  ////////////////////////////////////////////////////////////////////////////
  // PAT token encryption/decription 
  ////////////////////////////////////////////////////////////////////////////

  setPatSecret: function (secret) {
    sessionStorage.setItem(PAT_SECRET, secret);
  },
  getPatSecret: function () {
    return sessionStorage.getItem(PAT_SECRET) ?? "";
  },

  // Save all config.data taken from a string representation of the data object
  updateConfigFromString: function (dataStr) {
    config.data = config.parseAndSanitizeData(dataStr);
    //ensure new tokens are encrypted, if applicable
    if (config.data.encrypted)
      this.encryptConfigTokens();

    config.save();
  },
  encryptConfigTokens: function () {
    const secret = this.getPatSecret();
    config.data.managerRepo.token = this.encrypt(config.data.managerRepo.token, secret);
    for (let provider of config.data.providers)
      provider.token = this.encrypt(provider.token, secret);
  },

  // To check a valid password checks if decryption of all provider tokens is possible
  isValidPassword: function (providers, pass) {
    for (let provider of providers) {
      try {
        const result = this.decrypt(provider.token, pass);
        if (result == "invalid token")
          return false;
      } catch (error) {
        return false;
      }
    }
    return true;
  },

  // encrypted tokens are prefixed with "aes:" to avoid a duble encryption and decrypt non encrypted tokens
  // Allows empty tokens (e.g. for anonymous access to GitHub)
  encrypt: function (text, pass) {
    if (text == "" || text.startsWith("aes:"))
      return text; //already encrypted
    let ciphertext = encryption.encrypt(text, pass);
    return "aes:" + ciphertext;
  },

  // This is called from the API related methods to authenticate the requests and session login
  // If parameter pass is included, uses this as the secret to decrypt (to validate at sesion login)
  // Else, find the secret in local storage (regular use to call the APIs)
  decrypt: function (configToken, pass) {
    // decrypt only if token is encrypted, if not, returns the value
    if (configToken.startsWith("aes:")) {
      let ciphertext = configToken.substring(4);
      let secret = pass ?? this.getPatSecret();
      if (secret == "") //will make fail the api calls
        return "invalid token";
      let text = encryption.decrypt(ciphertext, secret);
      //raise exception if password does not match (receives empty string)
      if (text.length == 0)
        throw "Can't decrypt the token, maybe the password is wrong"; //NOSONAR
      return text;
    } else
      return configToken;
  },

}
export { login };
