import { tokens } from "./Tokens.js"
import { config } from "../Config.js"
import { oaconfig } from "./OAConfig.js"
import { loginController } from "./LoginController.js"

/**
 * Manges the login of the providers and returns the appropriate token when requested.
 * - Central point to get the OAuth access tokens (PAT and OAuth)
 * - Required methods that are called from controllers to coordinate the OAuth login process
 * - Refresh OAUth tokens
 * - Setup of the OAuth configuration for each provider (oaconfig)
 */
const OAUTH_TOKEN_INFO_PREFIX="dashgit-oauth-token-info_"; // Store: all token info (current token, expiration...), prefix+uid
const MANAGER_REPO_UID = "manager-repo-github";
const login = {

  // Returns the token for a provider, either PAT or OAuth
  getProviderToken: function (provider) {
    let token = provider.oauth 
      ? this.getOAuthTokenInfoByUid(provider.uid)?.currentToken ?? "" // no token defaults to empty
      : tokens.decrypt(provider.token);
    return token;
  },

  ////////////////////////////////////////////////////////////////////////////
  // OAuth2 authorization and authentication
  ////////////////////////////////////////////////////////////////////////////

  // Entry point called from the indexController on page load
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
        this.removeOAuthTokenInfoByUid(provider.uid);
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
  getOauthEnabledProviderByUid: function (providerUid) {
    // Needed for the callback, that only knows the id of the provider that has logged in
    for (const provider of this.getOAuthEnabledProviders())
      if (provider.uid == providerUid)
        return provider;
    throw new Error(`Provider with uid=${providerUid} can't be found in the enabled providers`);
  },
  
  // The manager repo (in config.data) has properties related to authentication with the same names than providers,
  // but they lack some others to allow manage its OAuth authentication like the other providers
  getManagerRepoProvider: function() {
    const manager = config.data.managerRepo;
    const provider = {
      provider: "GitHub",
      uid: MANAGER_REPO_UID,
      token: manager.token,
      oauth: manager.oauth,
      oacustom: manager.oacustom,
      enabled: manager.enabled,
      url: "https://github.com"
    };
    return provider;
  },

  ////////////////////////////////////////////////////////////////////////////
  // OAuth2 expired token refresh
  ////////////////////////////////////////////////////////////////////////////

  // Entry point called from the indexController before a view is generated and rendered
  // Checks if there are any OAuth2 token that needs renewal and performs the renewal.
  refreshTokensForAllProviders: async function () {
    let alreadySetByApp = {}; // map app-provider that are already set, to do not repeat login for other providers using same app
    console.log("*** Checking expired tokens");
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Login.js: Provider " + provider.uid + " is configured for OAuth2, checking token expiration");
      const providerConfig = this.getOAuthProviderConfig(provider);
      const tokenInfo = this.getOAuthTokenInfoByUid(provider.uid);
      if ((tokenInfo?.refreshToken ?? "") == "" || (tokenInfo?.refreshTime ?? "") == "") {
        console.log("login.js: Provider token does not have refresh info");
        continue;
      }
      
      const needsRefresh = Date.now() > new Date(tokenInfo.refreshTime).getTime() - 5 * 60 * 1000;
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
    const response = await loginController.refreshExpiredToken(tokenInfo);
    if (response.error) {
      console.error(`- Refresh failure. ${response.error} - Configuration: ${JSON.stringify(oaconfig, null, 2)}`);
      await this.failedLogin(provider.uid);
    } else {
      await this.successfulLogin(response.access_token, response.refresh_token, response.expires_in, provider);
    }
  },

  ////////////////////////////////////////////////////////////////////////////
  // Sets the final result of the login and other utilities
  ////////////////////////////////////////////////////////////////////////////

  // Token information is stored in session storage as an object that includes 
  // the current token, expiration data and the configuration that is was created with
  successfulLogin: async function (token, refreshToken, expiresIn, provider) {
    const oaconfig = this.getOAuthProviderConfig(provider);
    // stores in a separate session variable the refresh info, 10 minutes before expiration, 
    // no undefined values (GotHub does not have refresh, GitLab does)
    const refreshTime = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : "";
    const tokenInfo = {
      currentToken: token,
      refreshToken: refreshToken ?? "",
      refreshTime: refreshTime,
      oaconfig: oaconfig,
    }
    this.setOAuthTokenInfoByUid(provider.uid, tokenInfo);
  },
  // Failed logins always set a constan token value
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
  removeOAuthTokenInfoByUid: function (uid) {
    sessionStorage.removeItem(`${OAUTH_TOKEN_INFO_PREFIX}${uid}`);
  },

  // Removes failed tokens in providers to enable retry the login again
  removeFailedTokens: function () {
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Check provider for retry: " + provider.uid);
      const tokenInfo = this.getOAuthTokenInfoByUid(provider.uid);
      if (tokenInfo?.currentToken == "failed") { // may be unknow if the user adds a provider before retry
        console.log("Reset failed token for provider: " + provider.uid);
        this.removeOAuthTokenInfoByUid(provider.uid);
      }
    }
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

}
export { login };
