import { login } from '../login/Login.js'

/**
 * Surrogates to share models between providers. 
 * Useful, for example, to reduce the GraphQL queries that are executed when different providers share the same identity
 * avoiding each provider to execute the same GraphQL query.
 */
const surrogates = {

  surrogateRelations: {}, // originId -> surrogateId

  // to be called on cache reset (at startup and config changes)
  reset: function (providers, autoSurrogates) {
    // April 2026 Procedure to determine surrogates changed, back to user specified using ff=manualsurrogates.
    // The old manual approach should be removed later
    if (autoSurrogates)
      this.surrogateRelations = this.initAuto(providers);
    else
      this.surrogateRelations = this.init(providers);
  },
  init: function (providers) {
    let surrogates = {};
    for (let provider of providers) { // ensure that origin and surrogate are linked and enabled
      if (provider.enabled && provider.statusSurrogateUser != "") {
        for (let surrogate of providers) { // surrogate is the first enabled that match url and user
          if (provider.uid != surrogate.uid && surrogate.enabled && surrogate.statusSurrogateUser == ""
            && provider.provider == surrogate.provider && provider.url == surrogate.url && provider.statusSurrogateUser == surrogate.user) {
            surrogates[provider.uid] = surrogate.uid;
            console.log(`Surrogate relation: ${provider.uid} -> ${surrogate.uid}`);
            break;
          }
        }
      }
    }
    return surrogates;
  },
  initAuto: function (providers) {
    let surrogates = {};
    // Each provider visited gets temporarily its token that represents its identity (authenticated user)
    // -first visit of a token, stores it an links this identity token with provider
    // -second visit of a token, sets the provider as origin of the above (surrogate)
    let identityProvider = {}; // token -> provider.uid
    for (let provider of providers) { // ensure that origin and surrogate are linked and enabled
      if (provider.enabled) {
        const token = login.getProviderToken(provider);
        if (token == "failed") // OAuth token could have this value if login failed
          continue;
        if (identityProvider.hasOwnProperty(token)) {
          surrogates[provider.uid] = identityProvider[token];
          console.log(`Surrogate relation: ${provider.uid} -> ${identityProvider[token]}`);
        } else {
          identityProvider[token] = provider.uid;
        }
      }
    }
    return surrogates;
  },

  hasSurrogate: function (providerId) {
    return this.surrogateRelations[providerId] != undefined;
  },
  getSurrogate: function (providerId) {
    return this.surrogateRelations[providerId];
  },
  // Returns all ids such that its surrogate is surrogateId
  getOrigins: function (surrogateId) {
    let ret = [];
    for (let key of Object.keys(this.surrogateRelations))
      if (this.surrogateRelations[key] == surrogateId)
        ret.push(key);
    return ret;
  },

}

export { surrogates };
