import { tokens } from '../login/Tokens.js'
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
    // April 2026 Procedure to determine surrogates changed, back to user specified hardcoded in config module.
    // The old manual approach should be removed later
    if (autoSurrogates)
      this.surrogateRelations = this.getSurrogates(providers);
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
  // returns all surrogate relations both for PAT and OAuth authenticated providers
  getSurrogates: function (providers) {
    const allSurrogates = tokens.getPatSurrogates(providers);

    // OAuth surrogates are computed in the login module
    const oauthProviders = login.getOAuthEnabledProviders();
    const oauthSurrogates = login.getOAuthSurrogates(oauthProviders);
    Object.assign(allSurrogates, oauthSurrogates);

    console.log(`Surrogate relations: ${JSON.stringify(allSurrogates)}`);
    return allSurrogates;
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
