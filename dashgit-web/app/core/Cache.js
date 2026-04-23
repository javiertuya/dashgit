const cache = {

  //Temporarilly here, to refactor into a generic surrogate class used here and in the login modules

  ////////////////////////////////////////////////////////////////////////////////////////
  // Status surrogates: To handle a particular scenario where two proviers have the same host url,
  // and, althought using different users, they will produce the same GraphQL api call.
  // The configuration may define a surrogate for one of the providers, so that getting statuses
  // for this provider will use the statuses of the surrogate
  ////////////////////////////////////////////////////////////////////////////////////////

  statusSurrogates: {},

  // to be called on cache reset (at startup and config changes)
  resetStatusSurrogates: function (providers) {
    this.statusSurrogates = this.getEnabledSurrogates(providers);
  },
  getEnabledSurrogates: function (providers) {
    let surrogates = {};
    for (let provider of providers) { // ensure that surrogated and surrogate are linked and enabled
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
  hasStatusSurrogate: function (providerId) {
    return this.statusSurrogates[providerId] != undefined;
  },
  getStatusSurrogate: function (providerId) {
    return this.statusSurrogates[providerId];
  },
  getStatusSurrogatedIds: function (surrogateId) {
    let ret = [];
    for (let key of Object.keys(this.statusSurrogates))
      if (this.statusSurrogates[key] == surrogateId)
        ret.push(key);
    return ret;
  },

}

export { cache };
