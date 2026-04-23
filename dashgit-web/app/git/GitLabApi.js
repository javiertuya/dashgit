import { Gitlab } from 'gitbeaker/rest' //https://www.npmjs.com/package/@gitbeaker/rest
import { gitLabAdapter } from "./GitLabAdapter.js"
import { gitLabGraphql } from "./GitLabGraphql.js"
import { gitStoreApi } from "./GitStoreApi.js"
import { log } from "./Log.js"
import { wiController } from "../WiController.js"
import { config } from "../Config.js"
import { cache } from "../Cache.js"
import { login } from "../login/Login.js"

/**
 * Core interface with the provider api (GitLab). See doc at Controller.js
 * Al services and return a provider-independent model (using an adapter) to show in the UI.
 * See doc at Controller.js
 */
const gitLabApi = {

  // OAuth tokens require different call (only for REST API, not for GraphQL)
  getGitLabApi: async function (provider) {
    return provider.oauth
      ? new Gitlab({ host: provider.url, oauthToken: login.getProviderToken(provider), })
      : new Gitlab({ host: provider.url, token: login.getProviderToken(provider), });
  },

  getWorkItems: async function (target, provider, sorting) { // NOSONAR
    const api = await this.getGitLabApi(provider);
    // issue #116 set sorting criteria to match the selected in the UI
    const sort = (sorting ?? "").includes("updated") ? "updated_at" : "created_at";
    const order = (sorting ?? "").includes("descending") ? "desc" : "asc";
    const assigned = { state: "opened", assignee_username: provider.user, scope: "all", perPage: 100, maxPages: 1, order_by: sort, sort: order };
    const unassigned = { state: "opened", assignee_id: "None", scope: "all", perPage: 100, maxPages: 1, order_by: sort, sort: order };
    const reviewer = { state: "opened", reviewer_username: provider.user, scope: "all", perPage: 100, maxPages: 1, order_by: sort, sort: order };
    const created = { state: "opened", author_username: provider.user, scope: "all", perPage: 100, maxPages: 1, order_by: sort, sort: order };
    const dependabot = { state: "opened", author_username: provider.dependabotUser, scope: "all", perPage: 100, maxPages: 1, order_by: sort, sort: order };
    const dependabotTest = { state: "opened", in: "Test pull Request for dependabot/testupdate" };

    let promises = [];
    if (target == "assigned")
      promises = [
        api.MergeRequests.all(assigned),
        api.Issues.all(assigned),
        //Review requests come from the notification generated when assigning the reviewer (this notification will disappear after the reviewer finish).
        //To allow the ui to mark this as a review request, the api call is wrapped to add a special attribute (called custom_actions) to the response
        //Issue #43: we must read all notifications, not only action:"review_requested" because if there is an unread notification when
        //the review is requested, the review_request custom action badge is not shown
        this.wrapToDoListsCall(api, { state: "pending", type: "MergeRequest" }, "review_request", provider.user),
        //Also show work items that need follow-up
        gitStoreApi.followUpAll(provider, true),
      ];
    else if (target == "unassigned" && provider.url != "https://gitlab.com")
      promises = [
        api.MergeRequests.all(unassigned),
        api.Issues.all(unassigned)
      ];
    else if (target == "unassigned" && provider.url == "https://gitlab.com")
      return this.emptyModel(provider, "On gitlab.com, this view is disabled because api call timeouts.");
    else if (target == "created")
      promises = [
        api.MergeRequests.all(created),
        api.Issues.all(created)
      ];
    else if (target == "involved")
      promises = [
        api.MergeRequests.all(assigned),
        api.MergeRequests.all(reviewer),
        api.Issues.all(assigned),
        api.MergeRequests.all(created),
        api.Issues.all(created),
        //Issues/PRs where user is involved because of mentions: https://docs.gitlab.com/ee/api/todos.html
        //Mentioned is where the name appears at the end, directly_addressed at the beginning
        //Also separate pending from done (if a to do is done, it must appear too)
        api.TodoLists.all({ state: "pending", action: "mentioned", perPage: 40, maxPages: 1 }),
        api.TodoLists.all({ state: "pending", action: "directly_addressed", perPage: 40, maxPages: 1 }),
        api.TodoLists.all({ state: "done", action: "mentioned", perPage: 40, maxPages: 1 }),
        api.TodoLists.all({ state: "done", action: "directly_addressed", perPage: 40, maxPages: 1 }),
      ];
    else if (target == "follow-up")
      promises = [
        gitStoreApi.followUpAll(provider, false)
      ];
    else if (target == "dependabot") {
      promises = [
        api.MergeRequests.all(dependabot)
      ];
      if (config.ff["updtest"])
        promises.push(api.MergeRequests.all(dependabotTest))
    } else
      return;

    return await this.dispatchPromisesAndGetModel(target, provider, promises);
  },
  dispatchPromisesAndGetModel: async function (target, provider, promises) {
    const t0 = Date.now();
    let responses = await Promise.all(promises);
    log.debug(provider.uid, `Data received from the api [${Date.now() - t0}ms]:`, responses);
    //creates single result with all responses
    let allResponses = [];
    for (let response of responses)
      if (response.followUp != undefined) // follow-ups have different structure than other items
        allResponses.push(...response.followUp);
      else
        allResponses.push(...response);
    let model = gitLabAdapter.workitems2model(provider, allResponses, cache.labelsCache[provider.uid]);
    model.header.target = target;
    model.header.message = promises.length == 0 ? `Target ${target} not implemented for this provider` : ``;
    if (target == "involved")
      model.header.message = "<em>On GitLab, this view displays open issues/merge requests that you are author, assignee or mentioned, but no comenter.</em>";
    return model;
  },
  wrapToDoListsCall: async function (api, query, action, user) {
    return api.TodoLists.all(query)
      .then(async function (response) {
        return gitLabAdapter.addActionToToDoResponse(response, action, user);
      })
  },
  emptyModel: function (provider, message) {
    let model = gitLabAdapter.workitems2model(provider, [], cache.labelsCache[provider.uid]);
    model.header.message = message;
    return model;
  },

  updateNotificationsAsync: async function (target, provider) {
    log.debug(provider.uid, "ASYNC Get Notifications from the REST api");
    const api = await this.getGitLabApi(provider);
    api.TodoLists.all({ state: "pending", perPage: 100, maxPages: 1 }).then(async function (response) {
      log.debug(provider.uid, "ASYNC Notifications response:", response);
      let model = gitLabAdapter.notifications2model(response);
      wiController.updateNotifications(provider.uid, model); //direct call instead of using a callback
    });
  },

  getStatusesRequest: async function (provider, updateSince) {
    //This can not be done with a single graphql query, because the api will return
    //error due to a high estimated complexity. Approach:
    //- Get a model with project and branch names, filtering archived projects
    //- Complete this model with pipelines (to get status) and merge requests 
    //  (to determine the branches that are associated to a merge request).
    //  The list of projects allows selecting the actual branches (if not,
    //  the pipelines could add branches that were removed)
    //- Get the label colors (only once in the page life)
    let query0 = gitLabGraphql.getProjectsQuery(provider, provider.graphql.maxProjects, true);
    const t0 = Date.now();
    let gqlresponse0 = await gitLabGraphql.callGraphqlApi(provider, query0, true);
    log.debug(provider.uid, `Statuses graphql response (projects) [${Date.now() - t0}ms]:`, gqlresponse0);

    if (updateSince != "") { //filter out oldest projects to do a partial update
      this.filterOldProjects(gqlresponse0, updateSince);
      log.debug(provider.uid, `Partial update with ${gqlresponse0.data.projects.nodes.length} projects`);
    }

    //Get first version of model, with branches of projects, without any additional data
    let model0 = gitLabAdapter.projects2model(provider, gqlresponse0);
    log.debug(provider.uid, "Statuses model (projects):", model0);

    if (gqlresponse0.data.projects.nodes.length == 0) { //model0 has been created with header and no items, skip api calls
      log.debug(provider.uid, `No update needed, skip GraphQL api calls`);
      return model0;
    }

    //From now on, all calls are related to the project gids determined here (excluding archived)
    const gids = gitLabAdapter.model4projectIds(model0);

    //First time that page loads: determine info about labels (to set their color)
    if (cache.labelsCache[provider.uid] == undefined)
      this.updateLabelsAsync(provider, gids);

    // Now gets the statuses of all pipelines and complete the model
    let query = gitLabGraphql.getStatusesQuery(provider, "ids:" + JSON.stringify(gids));
    let gqlresponse = await gitLabGraphql.callGraphqlApi(provider, query, true);
    log.debug(provider.uid, "Statuses graphql response (branches/prs):", gqlresponse);

    const model = gitLabAdapter.statuses2model(model0, gqlresponse);
    log.debug(provider.uid, "Statuses model (branches/prs):", model);

    return model;
  },

  //Keeps in a gql response only projects updated since the date specified
  filterOldProjects: async function (gqlresponse, keepSince) {
    let nodes = gqlresponse.data.projects.nodes;
    for (let i = 0; i < nodes.length; i++) {
      if (new Date(keepSince).getTime() > new Date(nodes[i].lastActivityAt).getTime()) { //old project
        gqlresponse.data.projects.nodes = nodes.slice(0, i);
        break;
      }
    }
  },

  updateLabelsAsync: async function (provider, gids) {
    cache.labelsCache[provider.uid] = {}; // don't enter here any more
    let queryx = gitLabGraphql.getLabelsQuery("ids:" + JSON.stringify(gids));
    //this call may intermitently fail on gitlab.com due to insufficient permssions (do not show altert)
    let gqlresponsex = await gitLabGraphql.callGraphqlApi(provider, queryx, false);
    log.debug(provider.uid, "Labels graphql model (projects):", gqlresponsex);
    let labels = gitLabAdapter.labels2model(gqlresponsex);
    wiController.updateLabels(provider.uid, labels);
  },

  //Keeps only projects updated at since the date specified
  keepProjectsSince: async function (gqlresponse, since) {
    let nodes = gqlresponse.data.projects.nodes;
    for (let i = 0; i < nodes.length; i++) {
      if (new Date(since).getTime() > new Date(nodes[i].lastActivityAt).getTime()) { //old project
        gqlresponse.data.projects.nodes = nodes.slice(0, i);
        break;
      }
    }
  },

  //Gets the statuses model, but asynchronously.
  //When the model is completed, calls controller to update the status valueof the current target
  updateStatusesAsync: function (provider, updateSince) {
    log.debug(provider.uid, "Get Statuses from the GraphQL api");
    const t0 = Date.now();
    gitLabApi.getStatusesRequest(provider, updateSince).then(function (model) {
      log.debug(provider.uid, `ASYNC Statuses model [${Date.now() - t0}ms]:`, model);
      wiController.updateStatuses(provider.uid, model, updateSince); //direct call instead of using a callback
    }).catch(function (error) {
      console.error("GitLab GraphQL transformation failed");
      console.error(error)
      wiController.updateStatusesOnError("GitLab GraphQL transformation failed. Message: " + error, provider.uid);
    });
  },

}

export { gitLabApi };
