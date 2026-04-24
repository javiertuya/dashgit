import { config } from "./Config.js"
import { surrogates } from "./Surrogates.js"
import { statusIndex } from "./StatusIndex.js"

/**
 * Stores the statuses and branches to minimize the number of calls to the GraphQL api (expensive).
 * 
 * This works as a two level cache that allows: 
 * - Get the cached model as is (very short time span)
 * - Update the model incrementally (short time span)
 * - Full refresh the model (large time span)
 * This is controlled by methods hit and updateSince.
 * 
 * Structure of cached model: { provider: { updateTime: last-update-date, refreshTime: last-refresh-date, model: model-instance }}
 * Also initializes the statusCache to be used when rendering
 */
const statusesCache = {

  cachedModel: {},

  initialized: function (provider) {
    if (this.cachedModel[provider] == undefined)
      return false;
    return this.cachedModel[provider].model != undefined;
  },

  // Resets dates that control cache hits and other cached data. Works in two modes:
  // if hard=true invalidates the refreshTime, next check will require a full refresh of the cache and reset other cached data
  // if hard=false invalidates the updateTime, next check will only require a partial update of the cache
  reset: function (providers, hard) {
    for (let prov of providers)
      if (this.cachedModel[prov.uid] != undefined) { //force a full update of status cache models
        this.cachedModel[prov.uid].updateTime = new Date("1970-01-01");
        if (hard)
          this.cachedModel[prov.uid].refreshTime = new Date("1970-01-01");
      }
  },

  setModel: function (provider, model, updateSince) {
    // Saves the whole model
    if (updateSince == "") { // full refresh (also initial)
      this.cachedModel[provider].updateTime = new Date();
      this.cachedModel[provider].model = model;
    } else if (this.initialized(provider)) {
      this.cachedModel[provider].model.mergeBranchesAndPrs(model);
    } else { //cache has not been set yet, skip
      return;
    }

    // Saves the statuses to allow direct access without iterations
    for (let item of this.cachedModel[provider].model.items) {
      statusIndex.setStatus(provider, item.uid, item.status);
    }
  },
  getModel: function (provider) {
    if (surrogates.hasSurrogate(provider)) {
      let origin = surrogates.getSurrogate(provider);
      return this.cachedModel[origin].model;
    }
    return this.cachedModel[provider].model;
  },

  // Protocol to use the model cache at the controller:
  // Call hit()
  //   if true, do not make any call to the api and return the cached model
  //   if false, the cache will require some kind of updating:
  //   Call updateSince()
  //     if returns an empty date, the controller must do a full refresh to replace all data in the model
  //     if returns a date, the controller must do a partial update of the data that has changed since this date
  //     and merge the response with the current cache model

  hit: function (provider) {
    // This is the first method that is used for the statuses cache, initialize the first time for this provider
    let item = this.cachedModel[provider];
    if (item == undefined) {
      console.log(`${provider} CACHE: Initialize statuses model.`);
      this.cachedModel[provider] = { updateTime: new Date(), refreshTime: new Date("1970-01-01"), model: undefined };
      return false;
    }
    // Determines if hit, first time is false as model has not been set
    const hitUpdate = item.model != undefined && this.secondsBetweenDates(new Date(), item.updateTime) < config.data.statusCacheUpdateTime;
    const hitRefresh = item.model != undefined && this.secondsBetweenDates(new Date(), item.refreshTime) < config.data.statusCacheRefreshTime;
    const isHit = hitUpdate && hitRefresh;
    console.log(`${provider} CACHE: `
      + `Update life time: ${this.secondsBetweenDates(new Date(), item.updateTime)}, max ${config.data.statusCacheUpdateTime}, `
      + `Refresh life time: ${this.secondsBetweenDates(new Date(), item.refreshTime)}, max: ${config.data.statusCacheRefreshTime}, hit=${isHit}`)
    // Although at this time, if no hit, the cache is not updated, reset now the update time.
    // By this way, if user makes a fast switch to another view, hit will be false, avoiding
    // another call to update cache. Later, the asynchronous calls will update the UI
    if (!isHit)
      item.updateTime = new Date();
    return isHit;
  },
  updateSince: function (provider) {
    let item = this.cachedModel[provider];
    let since = ""; //by default, force full refresh

    if (/*item.model != undefined &&*/ this.secondsBetweenDates(new Date(), item.refreshTime) < config.data.statusCacheRefreshTime) {
      // Must do a partial update with the new items in this interval
      since = new Date(Date.now() - config.data.statusCacheRefreshTime * 1000).toISOString();
      console.log(`${provider} CACHE: Requires partial update since: "${since}"`);
    } else {
      // Must do a full refresh to replace the model, set refresh time to use in further calls
      item.refreshTime = new Date();
      console.log(`${provider} CACHE: Requires FULL REFRESH ${item.model == undefined ? " because cache is not set yet" : ""}`);
    }
    return since;
  },

  // If call to graphql api fails to get statuses this method is invoked to override last refresh time to make 
  // the next refresh to be exactlly after statusCacheUpdateTime seconds
  scheduleNearRefresh: function (providerId) {
    this.cachedModel[providerId].refreshTime = new Date(Date.now().getTime() - 1000 * config.data.statusCacheRefreshTime + 1000 * config.data.statusCacheUpdateTime);
  },
  secondsBetweenDates: function (d2, d1) {
    let timeDiff = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(timeDiff / (1000));
  },

}

export { statusesCache };
