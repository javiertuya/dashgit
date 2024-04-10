import { gitHubApi } from "./GitHubApi.js"
import { gitLabApi } from "./GitLabApi.js"
import { wiView } from "./WiView.js"
import { Model } from "./Model.js"
import { cache } from "./Cache.js"
import { config } from "./Config.js"

/**
 * Manages the calls to different APIs (GitHub or GitLab) receiving the transformed provider-independent
 * models that are cached (when needed) and sent to the view. 
 * 
 * Information flow:
 * 
 * - dispatch() is invoked from the view, targets: assigned, created, involved, unassigned and dependabot: 
 *   Executes synchronously.
 *   Constructs a set of promises to call in parallel the REST APIs that return the model of the work items
 *   (rejected promises are separated to raise an alert).
 *   After finish and send to the view executes asyncrhonous calls to update statuses and notification icons (see below)
 * 
 * - Call to updateNotificationsAsync(): After running the promises, asynchronous call to the REST api 
 *   to update the notifications icon in the view. Data is cached to be available when the view is refreshed.
 * 
 * - Call to updateStatusesAsync(): After running the promises, asynchronous call to the GraphQL api 
 *   to update the status icons in the view. Because these queries are expensive,
 *   the resulting models are cached by the controller so that consecutive calls of the services within the cache lifetime
 *   make use of the cached model.
 * 
 * - Invocation of dispatch() from the view, target statuses: Uses the same data than the obtained to update the status icons.
 *   If status cache has not expired returns it immediately.
 *   If expired, calls synchronously the updateStatusesAsync() on the api and caches the result.
 * 
 * Error control:
 * - Error processing: Each error detected logs the error and raises an alert with the message to the view.
 *   Processing continues returning empty or the available data
 * - REST api:
 *   By checking the promises that failed, returns the data in promises that didn't failed
 * - GraphQL api:
 *   - Api call: detected with try/catch, returns an empty object to do not cause more errors
 *   - Query transformations: detected with try/catch
 * - Testing: bad credential, bad url (gitlab), bad GraphQL query
 */

const wiController = {
  reset: function (hard) {
    cache.reset(hard); //used for reload operations
  },
  updateTarget: function (target) {
    console.log(`**** Trigger update to target: ${target}`);
    wiView.setLoading(true);
    this.dispatch(target);
  },

  // Creates the appropriate target promise for each provider and run all promises in parallel
  dispatch: function (target) {
    let promises = [];
    for (let prov of config.data.providers)
      if (prov.enabled)
        promises.push(this.getPromise(target, prov));
    if (promises.length == 0)
      wiView.renderAlert("warning", "No providers have been configured, please, complete the setup in the Configure tab");
    this.dispatchPromises(target, promises);
  },

  getPromise: function (target, provider) {
    const type = provider.provider.toLowerCase();
    if (target == "statuses" && (type == "github" || type == "gitlab"))
      return this.getStatusesOrCached(provider, type); //special handling
    else if (type == "github")
      return gitHubApi.getWorkItems(target, provider);
    else if (type == "gitlab")
      return gitLabApi.getWorkItems(target, provider);
    else
      console.log(`Invalid target: ${target} for provider ${provider}`);
  },

  //Gets a model of all projects, branches and pull requests, including the status
  //Used to fill the target "statuses". Uses cached data if not invalidated
  getStatusesOrCached: async function (provider, type) {
    if (cache.hasStatusSurrogate(provider.uid))
      return this.emptyModel(provider, "Branch statuses are shown in the surrogate provider defined in the configuration");

    await cache.ensureCacheIsInitialized(provider.uid);

    if (cache.hit(provider.uid)) { // use data from cache
      console.log(`${provider.uid}: Get Statuses from CACHE`);
      return cache.getModel(provider.uid);
    }
    //Gets the whole model or part of it (depending on the cache state)
    let updateSince = cache.updateSince(provider.uid);

    console.log(`${provider.uid}: Get Statuses from the GraphQL api. ${updateSince == "" ? "REFRESH" : "Since " + updateSince}`);
    let model;
    if (type == "github")
      model = await gitHubApi.getStatusesRequest(provider, updateSince);
    else if (type == "gitlab")
      model = await gitLabApi.getStatusesRequest(provider, updateSince);

    //save refreshed or updated model to allow a hit in further calls
    cache.setModel(provider.uid, model, updateSince);
    return cache.getModel(provider.uid);
  },
  emptyModel: function(provider, message) {
    console.log(`${provider.uid}: ${message}`);
    let model = new Model().setHeader(provider.provider, provider.uid, provider.user, "");
    model.header.message = message;
    return model;
  },

  dispatchPromises: async function (target, promises) {
    const currentDate = new Date();
    const responses = await Promise.allSettled(promises);
    console.log("Responses from all promises:");
    console.log(responses);

    //Separates successful requests to render in the view and raises errors, if any
    let models = [];
    for (let response of responses)
      if (response.status == "rejected") {
        console.error("REST api call failed");
        console.error(response);
        this.displayError("REST api call failed. Message: " + response.reason);
      } else
        models.push(response.value);

    if (models.length > 0)
      this.displayWorkItems(target, models, currentDate);

    // Subsequent async calls (when finish, they will invoque the update* methods)
    this.dispatchNotifications(target);
    this.dispatchStatuses(target);

    // Sync view updates
    wiView.updateStatusVisibility();
    wiView.setLoading(false);
  },
  
  displayWorkItems: function(target, models, currentDate) {
    wiView.renderWorkItems(target, models, config.getLastVisitedDate(target));
    if (target == "assigned" || target == "unassigned") // only highlight items for these targets
      config.saveLastVisitedDate(target, currentDate);
  },

  dispatchNotifications: function (target) {
    for (let provider of config.data.providers)
      if (provider.enabled && provider.enableNotifications) {
        if (provider.provider.toLowerCase() == "github")
          gitHubApi.updateNotificationsAsync(target, provider);
        else if (provider.provider.toLowerCase() == "gitlab")
          gitLabApi.updateNotificationsAsync(target, provider);
      }
  },
  dispatchStatuses: function (target) {
    if (target != "statuses") //this target already does the reading of statuses if necessary
      for (let provider of config.data.providers)
        if (provider.enabled) {
          this.dispatchProviderStatuses(provider);
        }
  },
  dispatchProviderStatuses: function(provider) {
          if (cache.hasStatusSurrogate(provider.uid)) {
            console.log(`${provider.uid}: Get statuses from surrogate provider ${cache.getStatusSurrogate(provider.uid)} (later)`);
            return;
          }        
          if (cache.hit(provider.uid)) { // use data from cache and avoid call the api
            console.log(`${provider.uid}: Update Statuses to view from CACHE`);
            this.displayProviderStatuses(provider.uid);
          } else if (provider.provider.toLowerCase() == "github") {
            gitHubApi.updateStatusesAsync(provider, cache.updateSince(provider.uid));
          } else if (provider.provider.toLowerCase() == "gitlab") {
            gitLabApi.updateStatusesAsync(provider, cache.updateSince(provider.uid));
          }
  },
  displayProviderStatuses: function(providerId) {
    let model = cache.getModel(providerId);
    wiView.updateStatuses(model, providerId, cache.labelsCache[providerId]); //labels cache only for GitLab, may be undefined
    //if (providerId=="0-github")
    //  wiView.updateStatuses(cache.getModel("1-github"), "1-github", cache.labelsCache["1-github"]);
    for (let surrogated of cache.getStatusSurrogatedIds(providerId))
      wiView.updateStatuses(cache.getModel(surrogated), surrogated, cache.labelsCache[surrogated]);
  },
  displayError: function (message) {
    wiView.renderAlert("danger", message);
  },

  //Callbacks, they are invoked from the provider api when *Async calls finish

  updateStatuses: function (providerId, statusesModel, updateSince) {
    console.log(`${providerId}: ASYNC update statuses to view:`);
    console.log(statusesModel);
    cache.setModel(providerId, statusesModel, updateSince); //save to allow a hit in further calls
    if (cache.initialized(providerId))
      this.displayProviderStatuses(providerId)
  },

  updateStatusesOnError: function (message, providerId) {
    //In case of failure in getting the status schedules a near refresh to try again
    this.displayError(message);
    wiView.updateSpinnerEnd(providerId);
    cache.scheduleNearRefresh(providerId);
  },

  //this is necessary for GitLab because items only store the label name
  updateLabels: function (providerId, labels) {
    cache.setLabels(providerId, labels)
    wiView.updateLabelColors(providerId, labels);
  },

  updateNotifications: function (providerId, notifModel) {
    //console.log(`${providerId}: ASYNC update notifications to view:`);
    //console.log(notifModel);
    //save to cache to allow access from synchronous calls that display workitems
    //(note that github poll interval control must call this method during the poll interval with a null model)
    if (notifModel != undefined && notifModel != null)
      cache.saveNotifications(providerId, notifModel);
    let allMentions = 0; //to display the total of notifications of all providers
    let thisMentions = 0; //only of this provier
    for (let prop in cache.notifCache) {
      let mentions = this.countProviderMentions(prop);
      allMentions += mentions;
      if (prop == providerId)
        thisMentions = mentions;
    }
    wiView.updateNotifications(providerId, thisMentions, allMentions); //don't pass model as it is alredy in cache
  },
  countProviderMentions: function (prop) {
    // counts only mentions, but across all providers that have notifications in cache
    let mentionCount = 0;
    for (let notifKey in cache.notifCache[prop]) {
      let reason = cache.notifCache[prop][notifKey];
      if (reason == "mention" || reason == "mentioned" || reason == "directly_addressed")
        mentionCount++; //PENDING: reason values are duplicated in the view, refactor
    }
    return mentionCount;
  },

}

export { wiController };
