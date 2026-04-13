import { config } from "./Config.js"
import { oaconfig } from "./oauth/OAConfig.js"
import { startLogin, handleCallback } from "./oauth/auth.js"

/**
 * Manges the login of the providers and returns the appropriate token when requested.
 */
const login = {

  // Returns the token for a provider, either PAT or OAuth
  getProviderToken: function (provider) {
    let token = provider.oauth ? sessionStorage.getItem(`token_${provider.uid}`) : config.decrypt(provider.token);
    return token;
  },

  // Determines the providers that use OAuth and if they require a new login or they failed login
  getLoginStatusForAllProviders: async function () {
    let failed = []; // uids of providers that failed to login, to inform the user
    let unset = []; // ids of providers that are not logged yet, decide when the login process is finished
    for (const providerId in config.data.providers) {
      const provider = config.data.providers[providerId];

      if (provider.enabled) {
        console.log("Login.js: Checking login mode for enabled provider " + provider.uid);

        if (provider.oauth) {
          console.log("Login.js: Provider " + provider.uid + " is configured for OAuth2, checking token and status");
          const token = this.getProviderToken(provider);

          const providerConfig = this.getOAuthProviderConfig(providerId);
          console.log(`- Applicable configuration: ${JSON.stringify(providerConfig, null, 2)}`);

          if (token) {
            if (token === "failed") {
              console.log("- Previous login attempt failed, skip login");
              failed.push(provider.uid);
            } else {
              console.log("- Already logged");
            }
          } else {
            console.log("- Requires login");
            unset.push(providerId);
          }
        }
      }
    }
    return { unsetProviders: unset, failedProviders: failed };
  },
  getOAuthEnabledProviders: function() {
    let providers = [];
    for (const providerId in config.data.providers) {
      const provider = config.data.providers[providerId];
      if (provider.enabled && provider.oauth) {
        providers.push(provider);
      }
    }
    return providers;
  },

  // Interface with the auth module to initiate the login and the callback
  startLoginForProvider: async function (providerId) {
    console.log("Login.js: Starting login for provider " + providerId);
    let conf = this.getOAuthProviderConfig(providerId);

    sessionStorage.setItem("providerKey", providerId)
    await this.logDebug("Login with provider " + providerId + ", requesting...");

    // To prevent the startLogin transfer control to a non existent url because a bad configuration,
    // check first if the configuration was found, using the error display mechanisms in the auth.js module
    // that mark it as failed and notify the user
    if (Object.keys(conf).length === 0) {
      const customAppName = config.data.providers[providerId].oacustom.enabled ? config.data.providers[providerId].oacustom.appName : "";
      if (customAppName == "") // the default was not found, this should never happen
        await this.failedLogin(`The default app could not be found, provider ${providerId}."`);
      else // The user specified a wrong custom app
        await this.failedLogin(`The custom app "${customAppName}" could not be found, provider ${providerId}. Please, review your OAuth custom settings"`);
      return;
    }
    // Localhost is not a valid host for OAuth2 callbacks, simulates the callback (that will fail)
    if (window.location.host === "localhost") {
      await new Promise(r => setTimeout(r, 2000));
      window.location.href = "http://localhost/dashgit/?oapp=github";
      return;
    }

    await startLogin(conf);
  },
  handleCallbackFromApp: async function (app) {
    const providerId = sessionStorage.getItem("providerKey");
    console.log("Login.js: Callback received from " + app + ", starting login procedure");
    await this.logDebug("Login with provider " + providerId + ", authorizing...");
    // Localhost is not a valid host for OAuth2 callbacks, fails immediately 
    // (nevertheless we can use 127.0.0.1 to test the real failure)
    if (window.location.host === "localhost") {
      await new Promise(r => setTimeout(r, 2000));
      await this.failedLogin("Invalid host: " + window.location.host);
      return;
    }
    if (!providerId) {
      await this.logError("Provider ID is undefined");
      return;
    }

    await handleCallback();
    sessionStorage.removeItem("providerKey"); // not needed anymore
  },

  // Invoked from the auth module at the end of the callback to notify the status:
  // - when the login is successful to save the token and ensure the the provider is marked as oauth
  // - when the login fails to ensure a special value in the token to avoid autentication loops

  successfulLogin: async function (token) {
    const providerId = sessionStorage.getItem("providerKey");
    config.load();
    config.data.providers[providerId].oauth = true;
    config.save();
    login.saveOAuthTokenById(token, providerId);
  },
  failedLogin: async function (message) {
    await this.logError(message);
    const providerId = sessionStorage.getItem("providerKey");
    login.saveOAuthTokenById("failed", providerId);
  },
  saveOAuthTokenById: function (token, providerId) {
    config.load();
    const uid = config.data.providers[providerId].uid;
    sessionStorage.setItem(`token_${uid}`, token);
  },
  retryOAuth: function () {
    const providers = this.getOAuthEnabledProviders();
    for (const provider of providers) {
      console.log("Check provider for retry: " + provider.uid);
      const token = this.getProviderToken(provider);
      if (token == "failed") {
        console.log("Reset failed token for provider: " + provider.uid);
        sessionStorage.removeItem(`token_${provider.uid}`);
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


  getOAuthProviderConfig: function (providerId) {
    const thisUrl = window.location.protocol + "//" + window.location.host  + window.location.pathname
    const provider = config.data.providers[providerId];
    return this.getOAuthAppConfig(provider.provider, provider.url, thisUrl, oaconfig, provider.oacustom);
  },

  // Creates the configuration required for 
  // - a given platform (named .provider in the DashGit config) and url
  // - the current url where this is running
  // - Applying the defaults that are harcoded in OAConfig module
  // - Overridden by the custom configuration that is set in the provider config.
  getOAuthAppConfig: function (platform, platformUrl, thisUrl, oadefaults, oacustom) {
    const exchangeUrl = "https://giis.uniovi.es/desarrollo/oauth/exchange";
    const customAppName = oacustom.enabled ? oacustom.appName : "";
    const customClientId = oacustom.enabled ? oacustom.clientId : "";
    // appName can be modified by custom config, by default is platform to lowercase
    const appName = ((customAppName ?? "") == "") ? platform.toLowerCase() : customAppName;

    // Using appName and platform makes a lookup to get the defaults and then apply the rest of customizations
    const oadefault = oadefaults[platform]?.[appName] ?? {};
    if (Object.keys(oadefault).length === 0) // wrong configuration
      return {};
    else if (platform == "GitHub") {
      const oatarget = {
        appName: appName,
        clientId: ((customClientId ?? "") == "") ? oadefault.clientId : customClientId,
        callbackUrl: thisUrl + "?oapp=" + appName,
        authorizeUrl: platformUrl + "/login/oauth/authorize",
        scopes: oadefault.scopes,
        exchangeUrl: exchangeUrl
      };
      return oatarget;
    } else {
      return {};
    }
  }

}
export { login };
