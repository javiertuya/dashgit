import { config } from "./Config.js"
import { Model } from "./Model.js"

/**
 * Shared information about the content of the repositories. For each provider:
 * Statuses, branches, notifications and labels
 */
const cache = {

  ////////////////////////////////////////////////////////////////////////////////////////
  // Statuses model cache: Whole model that contains the statuses and branches.
  // To minimize the number of calls to the GraphQL api (that are expensive),
  // the complete model is stored here and operations hit and updateSince
  // allow to control when to update or refresh the cache data
  // { provider: { updateTime: last-update-date, refreshTime: last-refresh-date, model: model-instance }}
  ////////////////////////////////////////////////////////////////////////////////////////
  modelCache: {},

  initialized: function (provider) {
    if (this.modelCache[provider] == undefined)
      return false;
    return this.modelCache[provider].model != undefined;
  },
  setModel: function (provider, model, updateSince) {
    //guarda el modelo completo
    if (updateSince == "") { // full refresh (also initial)
      //console.log(`${provider} CACHE: Full refresh statuses model.`);
      //console.log(model);
      this.modelCache[provider].updateTime = new Date();
      this.modelCache[provider].model = model;
    } else if (!this.initialized(provider)) { //cache has not been set yet, skip
      return;
    } else {
      this.modelCache[provider].model.mergeBranchesAndPrs(model);
    }

    // Saves the statuses to allow direct access without iterations
    for (let item of this.modelCache[provider].model.items) {
      cache.statusCache[this.getUid(provider, item.uid)] = item.status;
    }
  },
  getModel: function (provider) {
    console.log(`${provider} CACHE: Get statuses model.`);
    return this.modelCache[provider].model;
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
    let item = this.modelCache[provider];
    if (item == undefined) {
      console.log(`${provider} CACHE: Initialize statuses model.`);
      this.modelCache[provider] = { updateTime: new Date(), refreshTime: new Date("1970-01-01"), model: undefined };
      return false;
    }
    // Determines if hit, first time is false as model has not been set
    const hitUpdate = item.model != undefined && this.secondsBetweenDates(new Date(), item.updateTime) < config.data.statusCacheUpdateTime;
    const hitRefresh = item.model != undefined && this.secondsBetweenDates(new Date(), item.refreshTime) < config.data.statusCacheRefreshTime;
    const isHit = hitUpdate && hitRefresh;
    console.log(`${provider} CACHE: `
      + `Update life time: ${this.secondsBetweenDates(new Date(), item.updateTime)}, max ${config.data.statusCacheUpdateTime}, `
      + `Refresh life time: ${this.secondsBetweenDates(new Date(), item.refreshTime)}, max: ${config.data.statusCacheRefreshTime}, hit=${isHit}`)
    // Alghough at this time, if no hit, the cache is not updated, reset now the update time.
    // By this way, if user makes a fast switch to another view, hit will be false, avoiding
    // another call to update cache. Later, the asynchronous calls will update the UI
    if (!isHit)
      item.updateTime = new Date();
    return isHit;
  },
  updateSince: function (provider) {
    let item = this.modelCache[provider];
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

  // Resets dates that control cache hits and other cached data. Works in two modes:
  // if hard=true invalidates the refreshTime, next check will require a full refresh of the cache and reset other cached data
  // if hard=false invalidates the updateTime, next check will only require a partial update of the cache
  reset: function (hard) {
    for (let prov of config.data.providers)
      if (this.modelCache[prov.uid] != undefined) { //force a full update of status cache models
        this.modelCache[prov.uid].updateTime = new Date("1970-01-01");
        if (hard)
          this.modelCache[prov.uid].refreshTime = new Date("1970-01-01");
      }
    if (hard) {
      this.notifCache = {};
      this.statusCache = {};
      this.labelsCache = {};
    }
  },
  // If call to graphql api fails to get statuses this method is invoked to override last refresh time to make 
  // the next refresh to be exactlly after statusCacheUpdateTime seconds
  scheduleNearRefresh: function (providerId) {
    this.modelCache[providerId].refreshTime = new Date(new Date().getTime() - 1000 * config.data.statusCacheRefreshTime + 1000 * config.data.statusCacheUpdateTime);
  },
  secondsBetweenDates: function (d2, d1) {
    let timeDiff = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(timeDiff / (1000));
  },

  // As the cache initialization occours asyncronously, if an user opens the page and goes to branches,
  // it may encounter a non initialized cache. This waits until cache is right.
  ensureCacheIsInitialized: async function (providerId) {
    if (!cache.initialized(providerId)) {
      let iter = 0;
      while (!cache.initialized(providerId)) {
        console.log(`${providerId}: Wait for Status cache to be initialized ...`)
        await new Promise(r => setTimeout(r, 200));
        iter++
        if (iter > 50) // to avod keep indefinitely waiting
          throw new Error(`${providerId}: Status cache couldn't be initialized`);
      }
      console.log(`${providerId}: Status cache is initialized, continue`)
    }
  },

  ////////////////////////////////////////////////////////////////////////////////////////
  // Status cache: Stores the status of each branch, needed to update the items in the view
  ////////////////////////////////////////////////////////////////////////////////////////

  statusCache: {},
  getUid: function (provider, uid) {
    return `${provider}_${uid}`;
  },
  getStatus: function (provider, uid) {
    return cache.statusCache[this.getUid(provider, uid)];
  },
  // Usar cuando cambie algun atributo del modelo que esta en los que definen la clave
  renameUid: function (provider, oldUid, newUid) {
    let status = cache.statusCache[this.getUid(provider, oldUid)];
    delete cache.statusCache[this.getUid(provider, oldUid)];
    cache.statusCache[this.getUid(provider, newUid)] = status;
  },


  ////////////////////////////////////////////////////////////////////////////////////////
  // Notification cache: Notifications are obtained asynchronously and stored here to be displayed by the UI
  // Stored in cache to allow syncrhonous and asynchronous access
  // { provider: { repo_name: ..., type: ..., iid: ..., reason: ... }} 
  ////////////////////////////////////////////////////////////////////////////////////////

  notifCache: {},
  saveNotifications: function (provider, notif) {
    let mod = new Model(); //to acces  internal methods
    let items = {};
    for (let i = notif.length - 1; i >= 0; i--) //reverse to keep latest if more than one
      items[mod.getModelUid(notif[i].repo_name, notif[i].type, notif[i].iid, "")] = notif[i].reason; //do not collect from branches
    this.notifCache[provider] = items; //replace content
  },

  ////////////////////////////////////////////////////////////////////////////////////////
  // Labels cache: GitLab does not store the label colors in the request,
  // this info is obtained from a separate query that is cached here
  // { provider: { repoName-title: { label-obj} }
  ////////////////////////////////////////////////////////////////////////////////////////

  labelsCache: {},
  setLabels: function (provider, labels) {
    if (this.labelsCache[provider] == undefined)
      this.labelsCache[provider] = {};
    this.labelsCache[provider] = labels;
  }

}

export { cache };
