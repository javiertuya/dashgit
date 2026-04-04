import { config } from "./Config.js"
import { storeProviderId, startLogin } from "./oauth/auth.js"

/**
 * Shared persitent data: configuration of parameters, providers, etc. 
 */
const login = {

  // Saving token is done from the callback.html, that does know about the config, we use the number of the provider (id), not the uid
  saveOAuthTokenById: function(token, providerId) {
    config.load();
    const uid = config.data.providers[providerId].uid;
    sessionStorage.setItem(`token_${uid}`, token);
  },
  // Getting token is done from dashgit, by provider
  getProviderToken: function(provider) {
    let token = provider.oauth ? sessionStorage.getItem(`token_${provider.uid}`) : config.decrypt(provider.token);
    //console.log(`Login.js: Authorization for provider ${provider.uid}: ${token ? token.substring(0, 4) + "..." : "not found"}`);
    return token;
  },

  loginAllOauthProviders: async function () {
    let failedProviders = [];
    for (const providerId in config.data.providers) {
      const provider = config.data.providers[providerId];
  
      if (provider.enabled) {
        console.log("Login.js: Checking login mode for enabled provider " + provider.uid);

        if (provider.oauth) {
          console.log("Login.js: Provider " + provider.uid + " is configured for OAuth2, checking token");
          const token = this.getProviderToken(provider);

          if (token) {
            if (token === "failed") {
              console.log("Login.js: Previous login attempt for provider " + provider.uid + " failed, skipping login");
              failedProviders.push(provider.uid);
            } else {
              console.log("Login.js: Provider " + provider.uid + " already logged");
            }
          } else {
            console.log("Login.js: Provider " + provider.uid + " not logged, starting login");
            storeProviderId(providerId);
            await startLogin();
          }
        }
      }
    }
    return failedProviders;
  },
  getOAuthAppConfig: function(providerId) {
    //    alert(window.location.protocol + " " + window.location.host + " " + window.location.pathname );
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
