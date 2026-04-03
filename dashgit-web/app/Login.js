import { config } from "./Config.js"
import { storeProviderId, startLogin } from "./oauth/auth.js"

/**
 * Shared persitent data: configuration of parameters, providers, etc. 
 */
const login = {

  saveOAuthToken: function(token, providerId) {
    //save the token in the config of the first provider, if there is any, otherwise, creates a new provider with the token
    sessionStorage.setItem(`token_${providerId}`, token);
  },
  getOAuthToken: function(providerId) {
    //retrieve the token from sessionStorage
    return sessionStorage.getItem(`token_${providerId}`);
  },
  getProviderToken: function(provider) {
    return config.decrypt(provider.token);
  },

  loginAllOauthProviders: async function () {
    for (const providerId in config.data.providers) {
      const provider = config.data.providers[providerId];
      if (provider.enabled) {
        console.log("Login.js: Checking login mode for enabled provider " + provider.uid);
        if (provider.oauth) {
          console.log("Login.js: Provider " + provider.uid + " is configured for OAuth, checking token");
          const token = this.getOAuthToken(providerId);
          if (token) {
            console.log("Login.js: Provider " + provider.uid + " already logged");
          } else {
            console.log("Login.js: Provider " + provider.uid + " not logged, starting login");
            storeProviderId(providerId);
            await startLogin();
          }
        }
      }
    }
  },
  getOAuthAppConfig: function(providerId) {
    return {
      appId: "github",
      clientId: "Ov23liF8QHJgpfMvHfDx",
      callbackUrl: "https://giis.uniovi.es/desarrollo/dashgit/oauth/callback.html?app=github",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      scopes: "repo:read read:user notifications",
      exchangeUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange"
    };
  }

}
export { login };
