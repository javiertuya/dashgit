/**
 * Surrogates to share models between providers. 
 * Useful, for example, to reduce the GraphQL queries that are executed when different providers share the same identity
 * avoiding each provider to execute the same GraphQL query.
 */
const surrogates = {

  surrogateRelations: {}, // originId -> surrogateId

  // to be called on cache reset (at startup and config changes)
  reset: function (providers) {
    this.statusSurrogates = this.init(providers);
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
