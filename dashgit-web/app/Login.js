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
const OAUTH_TOKEN_INFO_PREFIX="dashgit-oauth-token-info_"; // Store: all token info (current token, expiration...), prefix+uid
const PAT_SECRET = "dashgit-pat-secret"; // Store: to decript PATs (entered by the user at the session start)
const login = {

  // Returns the token for a provider, either PAT or OAuth
  getProviderToken: function (provider) {
    let token = provider.oauth 
      ? this.getOAuthTokenInfoByUid(provider.uid)?.currentToken ?? "" // no token defaults to empty
      : this.decrypt(provider.token);
    return token;
  },

  ////////////////////////////////////////////////////////////////////////////
  // OAuth2 authentication
  ////////////////////////////////////////////////////////////////////////////

  // Main entry point called from the indexController on page load
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
      let tokenInfo = this.getOAuthTokenInfoByUid(provider.uid);

      const providerConfig = this.getOAuthProviderConfig(provider);
      console.log(`- Applicable configuration: ${JSON.stringify(providerConfig, null, 2)}`);

      // First, check if the provider config matches whith the stored in the tokenInfo (only if not failed). If does not match, remove it
      if (await this.hasTokenWithChangedConfig(provider, providerConfig)) {
        this.gremoveOAuthTokenInfoByUid(provider.uid);
        tokenInfo = undefined;
      }

      const providerWithMyApp = status.alreadySetByApp[providerConfig.appName + "-" + provider.provider + "-" + provider.url];
      if (providerWithMyApp) { // Optimization to avoid multiple logins for the same app
        console.log(`- Provider ${provider.uid} authenticates with the same app than ${providerWithMyApp.uid}, which is known to be logged or failed, set this token`);
        this.copyFromAppAlreadySet(providerWithMyApp, provider, status);
      } else if (tokenInfo) { // Existing token, manages failures and refresh
        if (tokenInfo.currentToken === "failed") {
          console.log("- Previous login attempt failed, skip login");
          status.failedProviders.push(provider);
        } else {
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
  hasTokenWithChangedConfig: async function(provider, currentConfig) {
    const tokenInfo = this.getOAuthTokenInfoByUid(provider.uid);
    return (tokenInfo && tokenInfo.currentToken != "failed") 
      && (currentConfig.appName != tokenInfo.oaconfig.appName
        || currentConfig.clientId != tokenInfo.oaconfig.clientId
        || currentConfig.authorizeUrl != tokenInfo.oaconfig.authorizeUrl
        || currentConfig.tokenUrl != tokenInfo.oaconfig.tokenUrl);
  },
  copyFromAppAlreadySet: function(providerWithMyApp, provider, status) {
    // Copy to the provider, this includes both the token and the refresh info
    const tokenInfo = this.getOAuthTokenInfoByUid(providerWithMyApp.uid);
    this.setOAuthTokenInfoByUid(provider.uid, tokenInfo);

    // Failed status must be recorded too
    if (tokenInfo.currentToken == "failed")
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
  // Main entry point called from the indexController before a view is generated and rendered
  // Checks if there are any OAuth2 token that needs renewal and performs the renewal.
  refreshTokensForAllProviders: async function () {
    let alreadySetByApp = {}; // map app-provider that are already set, to do not repeat login for other providers using same app
    console.log("*** Checking expired tokens");
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Login.js: Provider " + provider.uid + " is configured for OAuth2, checking token expiration");
      const providerConfig = this.getOAuthProviderConfig(provider);
      const tokenInfo = this.getOAuthTokenInfoByUid(provider.uid);
      const needsRefresh = tokenInfo.refreshToken && tokenInfo.refreshTime
        && tokenInfo.refreshToken != "" && tokenInfo.refreshTime != ""
        && Date.now() > new Date(tokenInfo.refreshTime).getTime() - 5 * 60 * 1000;

      if (needsRefresh) {
        const providerWithMyApp = alreadySetByApp[providerConfig.appName + "-" + provider.provider + "-" + provider.url];
        if (providerWithMyApp) { // Optimization to avoid multiple refresh for the same app
          console.log(`- Provider ${provider.uid} authenticates with the same app than ${providerWithMyApp.uid}, which has been refreshed, set this token`);
          const tokenInfoToCopy = this.getOAuthTokenInfoByUid(providerWithMyApp.uid);
          this.setOAuthTokenInfoByUid(provider.uid, tokenInfoToCopy);
        } else {
          console.log(`- Refreshing provider ${provider.uid} token with expiration date ${tokenInfo.refreshTime}`);
          await this.refreshTokenForProvider(provider, tokenInfo);

          // to avoid repeat login if already logged in the same app, platform and url,
          alreadySetByApp[providerConfig.appName + "-" + provider.provider + "-" + provider.url] = provider;
        }
      }
    }
  },
  refreshTokenForProvider: async function (provider, tokenInfo) {
    // This is fully synchronous, without callbacks, handles here the token update and errors
    const response = await this.refreshToken(tokenInfo);
    if (response.error) {
      console.error(`- Refresh failure. ${response.error} - Configuration: ${JSON.stringify(oaconfig, null, 2)}`);
      await this.failedLogin(provider.uid);
    } else {
      await this.successfulLogin(response.access_token, response.refresh_token, response.expires_in, provider);
    }
  },
  refreshToken: async function (tokenInfo) {
    const response = await refreshExpiredToken(tokenInfo.refreshToken, tokenInfo.oaconfig);
    if (response.error) // just composes the error message, errors are handled by the caller
      return { error: `Error refreshing token (${response.error}): ${response.error_description}`}
    return response;
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
        await this.failedLoginCallback(`The default app could not be found, provider ${provider.uid}."`);
      else // The user specified a wrong custom app
        await this.failedLoginCallback(`The custom app "${customAppName}" could not be found, provider ${provider.uid}. Please, review your OAuth custom settings"`);
      return;
    }
    // Localhost is not a valid host for OAuth2 callbacks, simulates the callback (that will fail)
    if (globalThis.location.host === "localhost") {
      globalThis.location.href = "http://localhost/dashgit/?oapp=github";
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
    if (globalThis.location.host === "localhost") {
      await this.failedLoginCallback("Invalid host: " + globalThis.location.host);
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

  // Token information that is store in session storage is an object that includes 
  // the current token, expiration data and the configuration that is was created with
  successfulLoginCallback: async function (token, refreshToken, expiresIn) {
    const providerUid = sessionStorage.getItem(PROVIDER_UID);
    config.load(); // need to iterate over all providers
    const provider = config.getProviderByUid(providerUid);
    await this.successfulLogin(token, refreshToken, expiresIn, provider);
  },
  successfulLogin: async function (token, refreshToken, expiresIn, provider) {
    const oaconfig = this.getOAuthProviderConfig(provider);
    // stores in a separate session variable the refresh info, 10 minutes before expiration, 
    // no undefined values (GotHub does not have refresh, GitLab does)
    const refreshTime = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000).toISOString() : "";
    const tokenInfo = {
      currentToken: token,
      refreshToken: refreshToken ?? "",
      refreshTime: refreshTime,
      oaconfig: oaconfig,
    }
    this.setOAuthTokenInfoByUid(provider.uid, tokenInfo);
  },
  failedLoginCallback: async function (message) {
    await this.logError(message);
    const providerUid = sessionStorage.getItem(PROVIDER_UID);
    await this.failedLogin(providerUid);
  },
  failedLogin: async function (providerUid) {
    const tokenInfo = { currentToken: "failed" }; // anything else needed, failed tokens are skipped
    this.setOAuthTokenInfoByUid(providerUid, tokenInfo);
  },
  setOAuthTokenInfoByUid: function (uid, tokenInfo) {
    sessionStorage.setItem(`${OAUTH_TOKEN_INFO_PREFIX}${uid}`, JSON.stringify(tokenInfo));
  },
  getOAuthTokenInfoByUid: function (uid) {
    const infoStr = sessionStorage.getItem(`${OAUTH_TOKEN_INFO_PREFIX}${uid}`); // returns null if not found
    if ( infoStr !== undefined && infoStr !== null) 
      return JSON.parse(infoStr); // else undefined
  },
  gremoveOAuthTokenInfoByUid: function (uid) {
    sessionStorage.removeItem(`${OAUTH_TOKEN_INFO_PREFIX}${uid}`);
  },

  retryOAuth: function () {
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Check provider for retry: " + provider.uid);
      const tokenInfo = this.getOAuthTokenInfoByUid(provider.uid);
      if (tokenInfo.currentToken == "failed") {
        console.log("Reset failed token for provider: " + provider.uid);
        this.gremoveOAuthTokenInfoByUid(provider.uid);
      }
    }
    globalThis.location.href = "./"
  },

  // Logging messages and failures are also shown in the user interface
  logDebug: async function (message) {
    console.log(`OAuth: ${message}`);
    $("#callback-provider").text(message);
  },
  logError: async function (message) {
    console.error(`OAuth: ${message}`);
    $("#callback-error").text(message);
    $("#callback-continue-btn").show();
  },

  ////////////////////////////////////////////////////////////////////////////
  // OAuth2 configuration
  ////////////////////////////////////////////////////////////////////////////
 
  getDashGitUrl: function() {
    return globalThis.location.protocol + "//" + globalThis.location.host  + globalThis.location.pathname;
  },
  getOAuthProviderConfig: function (provider) {
    // Currently only supporting single app name
    const appName = provider.provider.toLowerCase();
    const thisUrl = this.getDashGitUrl();
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
      } catch (error) { // NOSONAR
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
