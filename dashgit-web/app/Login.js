import { config } from "./Config.js"

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

  getProviderByKey: function(key) {
    return config.data.providers[key];
  },
  getOAuthAppConfig: function(provider) {
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
