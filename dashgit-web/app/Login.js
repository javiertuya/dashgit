import { config } from "./Config.js"
import { oaconfig } from "./oauth/OAConfig.js"
import { startLogin, startCallback, logError } from "./oauth/auth.js"

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
    let conf = this.getOAuthProviderConfig(providerId);
    // To prevent the startLogin transfer control to a non existent url, check first
    // if the configuration was found, using the error display mechanisms in the auth.js module
    // and marking it as failed
    if (Object.keys(conf).length ===0) {
      logError("Login", "Can't find a default configuration for the provider " + providerId);
      this.failedLogin(providerId);
    } else {
      await startLogin(providerId, conf);
    }
  },
  callbackFromApp: async function (app) {
    //TODO check the apps allowed?
    //if (app === "github") {
      console.log("Login.js: Callback received from " + app + ", starting login procedure");
      await startCallback();
    //}
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

  getOAuthProviderConfig: function (providerId) {
    const thisUrl = window.location.protocol + "//" + window.location.host  + window.location.pathname
    //const provider = config.data.providers[providerId];
    // TODO use config from provider
    if (providerId==0)
      return this.getOAuthAppConfig(oaconfig, "GitHub", "github", thisUrl);
    else if (providerId==1)
      return this.getOAuthAppConfig(oaconfig, "GitHub", "github2", thisUrl);
    else
      return null;
  },

  // Creates the configuration required for 
  // - a given platform (named .provider in the DashGit config)
  // - an app name as known by DashGit (should be egistered in the platform)
  getOAuthAppConfig: function (oadefaults, platform, app, thisUrl) {
    const exchangeUrl = "https://giis.uniovi.es/desarrollo/oauth/exchange";
    //const dashgitUrl = window.location.protocol + "//" + window.location.host + "/" + window.location.pathname
    //todo revisar como se hace el join, hay que dejar una / sin poner, hacer ut
    const oadefault = oadefaults[platform]?.[app] ?? {};
    if (Object.keys(oadefault).length ===0)
      return {};
    else if (platform == "GitHub") {
      const oatarget = {
        appName: app,
        clientId: oadefault.clientId,
        callbackUrl: thisUrl + "?oapp=" + app,
        authorizeUrl: "https://github.com/login/oauth/authorize",
        scopes: oadefault.scopes,
        exchangeUrl: exchangeUrl
      };
      //console.log(targetConfig);
      return oatarget;
    } else {
      return {}; //TODO check config errors
    }
  }

}
export { login };
