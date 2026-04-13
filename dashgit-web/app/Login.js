import { config } from "./Config.js"
import { startLogin, startCallback } from "./oauth/auth.js"

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
          console.log("Login.js: Provider " + provider.uid + " is configured for OAuth2, checking token");
          const token = this.getProviderToken(provider);

          if (token) {
            if (token === "failed") {
              console.log("Login.js: Previous login attempt for provider " + provider.uid + " failed, skipp login");
              failed.push(provider.uid);
            } else {
              console.log("Login.js: Provider " + provider.uid + " already logged");
            }
          } else {
            console.log("Login.js: Provider " + provider.uid + " requires login");
            unset.push(providerId);
          }
        }
      }
    }
    return { unsetProviders: unset, failedProviders: failed };
  },

  // Interface with the auth module to initiate the login an the callback
  startLoginForProvider: async function (providerId) {
    console.log("Login.js: Starting login for provider " + providerId);
    await startLogin(providerId, this.getOAuthAppConfig(providerId));
  },
  callbackFromApp: async function (app) {
    if (app === "github") {
      console.log("Login.js: Callback from app received for github, starting login procedure");
      await startCallback();
    }
  },

  // Invoked from the auth module at the end of the callback to notify the status:
  // - when the login is successful to save the token and ensure the the provider is marked as oauth
  // - when the login fails to ensure a special value in the token to avoid autentication loops

  successfulLogin: function (token, providerId) {
    config.load();
    config.data.providers[providerId].oauth = true;
    config.save();
    login.saveOAuthTokenById(token, providerId);
  },
  failedLogin: function (providerId) {
    login.saveOAuthTokenById("failed", providerId);
  },
  saveOAuthTokenById: function (token, providerId) {
    config.load();
    const uid = config.data.providers[providerId].uid;
    sessionStorage.setItem(`token_${uid}`, token);
  },

  getOAuthAppConfig: function (providerId) {
    // TODO configure for multiple apps/providers
    //    alert(window.location.protocol + " " + window.location.host + " " + window.location.pathname );
    return {
      appId: "github",
      clientId: "Ov23liF8QHJgpfMvHfDx",
      callbackUrl: "https://giis.uniovi.es/desarrollo/dashgit/?oapp=github",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      scopes: "repo:read read:user notifications",
      exchangeUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange"
    };
  }

}
export { login };
