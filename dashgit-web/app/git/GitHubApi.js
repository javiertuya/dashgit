import { Octokit } from "octokit/rest"
import { gitHubGraphql } from "./GitHubGraphql.js"
import { gitHubAdapter } from "./GitHubAdapter.js"
import { gitStoreApi } from "./GitStoreApi.js"
import { log } from "./Log.js"
import { wiController } from "../WiController.js"
import { config } from "../Config.js"
import { login } from "../Login.js"

/**
 * Core interface with the provider api (GitHub).
 * Al services and return a provider-independent model (using an adapter) to show in the UI.
 * See doc at Controller.js
 */
const gitHubApi = {

  userAgent: config.getGitHubUserAgent(),

  getWorkItems: async function (target, provider, sorting, match) {
    const token = login.getProviderToken(provider);
    const octokit = new Octokit({ userAgent: this.userAgent, auth: token });
    // issue #116 set sorting criteria to match the selected in the UI
    const sort = (sorting ?? "").includes("updated") ? "updated" : "created";
    const order = (sorting ?? "").includes("descending") ? "desc" : "asc";
    const options = { sort: sort, order: order, advanced_search: true };
    const matchFilter = this.getMatchSearch(match);
    // issue #184, add advanced_search, check if can be removed after September 2025
    const assigned = { q: `is:open assignee:${provider.user} ${matchFilter} archived:false`, ...options };
    const unassigned = { q: `is:open no:assignee owner:placeholder ${matchFilter} archived:false`, per_page: 100, ...options };
    const reviewer = { q: `is:open is:pr user-review-requested:${provider.user} ${matchFilter} archived:false`, ...options };
    const revise = { q: `is:open is:pr review:changes_requested author:${provider.user} ${matchFilter} archived:false`, ...options };
    const created = { q: `is:open author:${provider.user} ${matchFilter} archived:false`, ...options };
    const involved = { q: `is:open involves:${provider.user} ${matchFilter} archived:false`, ...options };
    const dependabot = { q: `is:open is:pr author:app/dependabot owner:placeholder ${matchFilter} archived:false`, per_page: 100, ...options };
    const dependabotTest = { q: `is:open is:pr author:${provider.user} ${matchFilter} archived:false in:title "Test pull Request for dependabot/testupdate"`, per_page: 100, ...options };
    let promises = [];
    if (target == "assigned")
      promises = [
        // spread because this returns an array with one or two queries depending on the kind of token used
        ...this.issuesAndPullRequests(octokit, token, assigned),
        //To allow the ui to mark this as a review request, the api call is wrapped to add a special attribute (called custom_actions) to the response
        this.wrapIssuesAndPullRequestsCall(octokit, reviewer, "review_request"),
        this.wrapIssuesAndPullRequestsCall(octokit, revise, "changes_requested"),
        //Also show work items that need follow-up
        gitStoreApi.followUpAll(provider, true),
      ];
    else if (target == "unassigned") { // a call api for each owner (#184)
      const owners = [provider.user, ...provider.unassignedAdditionalOwner];
      promises = [
        ...this.multiOwnerIssuesAndPullRequests(octokit, unassigned, owners),
      ];
    }
    else if (target == "created")
      promises = [
        ...this.issuesAndPullRequests(octokit, token, created)
      ];
    else if (target == "involved")
      promises = [
        ...this.issuesAndPullRequests(octokit, token, involved)
      ];
    else if (target == "follow-up")
      promises = [
        gitStoreApi.followUpAll(provider, false)
      ];
    else if (target == "dependabot") { // a call api for each owner (#184)
      const owners = (provider.user + " " + provider.dependabotAdditionalOwner).trim().split(" ");
      promises = [
        ...this.multiOwnerIssuesAndPullRequests(octokit, dependabot, owners),
      ];
      if (config.ff["updtest"])
        promises.push(this.octokitSearchIssues(octokit, dependabotTest));
    } else
      return;

    return await this.dispatchPromisesAndGetModel(target, provider, promises);
  },
  getMatchSearch: function (match) {
    const exclude = match.criterion == "exclude" ? "-" : "";
    const matchUser = match.user.length > 0 ? ` ${exclude}user:` + match.user.join(` ${exclude}user:`) : "";
    const matchOrg = match.org.length > 0 ? ` ${exclude}org:` + match.org.join(` ${exclude}org:`) : "";
    return (matchUser + matchOrg).trim()
  },
  dispatchPromisesAndGetModel: async function (target, provider, promises) {
    const t0 = Date.now();
    const responses = await Promise.all(promises);
    log.debug(provider.uid, `Data received from the api [${Date.now() - t0}ms]:`, responses);
    //creates single result with all responses
    let allResponses = [];
    for (let response of responses)
      if (response.followUp != undefined) // follow-ups have different structure than other items
        allResponses.push(...response.followUp);
      else
        allResponses.push(...response.data.items);
    let model = gitHubAdapter.workitems2model(provider, allResponses);
    model.header.target = target;
    return model;
  },
  issuesAndPullRequests: function (octokit, token, query) {
    // Issue #129 Although documentation says that search query returns both issues and prs if no 'is:*' is specified,
    // this is not true when using fine grained tokens, that requires separate queries for issues and prs.
    if (token == "" || token.startsWith("ghp_") || token.startsWith("gho_")) { // single query for no token or fine grained token
      return [this.octokitSearchIssues(octokit, query)];
    } else { // separated queries to find issues and prs
      // Pendiente probar esto con fine grained tokens, al ejecutar con un gho_ ha dado un error indicando que pr no estaba definido
      console.log("Assuming fine grained token, using separated queries for issues and PRs");
      let qissue = JSON.parse(JSON.stringify(query)); // NOSONAR
      let qpr = JSON.parse(JSON.stringify(query)); // NOSONAR
      qissue.q = "is:issue " + query.q;
      qpr.q = "is:pr " + query.q;
      return [this.octokitSearchIssues(octokit, qissue), this.octokitSearchIssues(octokit, pr)];
    }
  },
  wrapIssuesAndPullRequestsCall: async function (octokit, query, action) {
    return this.octokitSearchIssues(octokit, query)
      .then(async function (response) {
        gitHubAdapter.addActionToPullRequestItems(response.data.items, action);
        return response;
      })
  },
  // returns an array of promises for a query, one for each of the items in owner
  multiOwnerIssuesAndPullRequests: function (octokit, query, owners) {
    const queries = owners.map(owner => ({ ...query, q: query.q.replace("owner:placeholder", `owner:${owner}`) }));
    const calls = queries.map(query => this.octokitSearchIssues(octokit, query));
    return calls;
  },

  // octokit rest search issuesAndPullRequests does not exist anymore (#184), this method makes the appropriate search call
  octokitSearchIssues: function (octokit, query) {
    return octokit.request('GET /search/issues', query);
  },

  // Tracks the poll interval as indicated by the api doc https://docs.github.com/en/rest/activity/notifications?apiVersion=2022-11-28
  // to call at most once during the poll interval. These variable are used by all GitHub providers
  notifLastModified: undefined,
  notifPollInterval: undefined,
  updateNotificationsAsync: function (target, provider) {
    const token = login.getProviderToken(provider);
    if (token == "") //skip if no token provider to avoid api call errors
      return;
    // Poll interval control, if inside the interval, do not call the api, but update notifications
    let currentTime = Math.floor(Date.now() / 1000);
    if (this.notifLastModified != undefined && currentTime - this.notifLastModified < this.notifPollInterval) {
      log.debug(provider.uid, `ASYNC Get Notifications using cached notifications, seconds to next api call: ${currentTime - this.notifLastModified}, poll interval: ${this.notifPollInterval}`);
      wiController.updateNotifications(provider.uid, null); // don't pass model to use the cached notifications
      return;
    }
    log.debug(provider.uid, "ASYNC Get Notifications from the REST api");
    const octokit = new Octokit({ userAgent: this.userAgent, auth: token, });
    // Issue #44: According the api doc a call using Last-Modified header should be done. 
    // This works well when a notification appears, But when the notification is read, the browser still gets not modified (when using cache).
    // Therefore, this approach can't be used and overrides the cache using If-None-Match header.
    gitHubApi.notifLastModified = Math.floor(Date.now() / 1000);
    gitHubApi.notifPollInterval = 120; //default value, if below query fails (eg. token without permission), next call will be done after this interval
    octokit.rest.activity.listNotificationsForAuthenticatedUser({ participating: true, headers: { 'If-None-Match': '' } }).then(function (response) {
      log.debug(provider.uid, "ASYNC Notifications response:", response);
      gitHubApi.notifPollInterval = response.headers["x-poll-interval"];
      let model = gitHubAdapter.notifications2model(response);
      wiController.updateNotifications(provider.uid, model); //direct call instead of using a callback
    });
  },

  getStatusesRequest: async function (provider, updateSince) {
    const graphqlV2 = !provider.graphql.deprecatedGraphqlV1;
    let userSpecRepos = graphqlV2 ? provider.graphql.userSpecRepos : "";
    const token = login.getProviderToken(provider);
    if (token == "") //returns empty model if no token provider to avoid api call errors
      return gitHubAdapter.statuses2model(provider, {}, graphqlV2);
    let gqlresponse = {};
    try {
      // check how many repositories must be updated, this info will be used to construct the query
      let updateReqs = await this.getStatusesUpdateRequirements(provider, userSpecRepos, updateSince, graphqlV2);
      if (updateReqs.maxProjects == 0 && updateReqs.otherRepos == "") {
        log.debug(provider.uid, `No projects to update, since: "${updateSince}":`);
        return gitHubAdapter.statuses2model(provider, {}, graphqlV2);
      }
      gqlresponse = await gitHubGraphql.graphQlWithPagination(provider, updateReqs.maxProjects, provider.graphql.pageSize, updateReqs.otherRepos, true, updateSince == "", graphqlV2);
      log.debug(provider.uid, `Statuses graphql response, maxProjects: ${updateReqs.maxProjects} and "${updateReqs.otherRepos}", since: "${updateSince}":`, gqlresponse);
    } catch (error) {
      console.error("GitHub GraphQL api call failed");
      console.error(error);
      wiController.updateStatusesOnError("GitHub GraphQL api call failed. Message: " + error, provider.uid);
    }
    // Conversion to the model requires a previous postprocessing to get the user specified repositories (if any)
    gqlresponse = gitHubAdapter.postprocessGraphQl(gqlresponse);
    const model = gitHubAdapter.statuses2model(provider, gqlresponse, graphqlV2);
    return model;
  },

  //Gets number of repositories and other user specified that require update
  getStatusesUpdateRequirements: async function (provider, userSpecRepos, updateSince, graphqlV2) {
    let updateReqs = { maxProjects: provider.graphql.maxProjects, otherRepos: userSpecRepos };
    if (updateSince == "")
      return updateReqs;

    const t0 = Date.now();
    let gqlresponse0 = await gitHubGraphql.graphQlWithPagination(provider, provider.graphql.maxProjects, provider.graphql.maxProjects, updateReqs.otherRepos, false, false, graphqlV2);
    log.debug(provider.uid, `Statuses graphql response, time to get update reqs [${Date.now() - t0}ms]:`, gqlresponse0);
    updateReqs.maxProjects = gitHubAdapter.getNumReposToUpdate(gqlresponse0, updateReqs.maxProjects, updateSince);
    updateReqs.otherRepos = gitHubAdapter.getUserReposToUpdate(gqlresponse0, updateSince);
    return updateReqs;
  },

  //Gets the statuses model, but asynchronously.
  //When the model is completed, calls controller to update the status value of the current target
  updateStatusesAsync: function (provider, updateSince) {
    log.debug(provider.uid, "Get Statuses from the GraphQL api");
    const t0 = Date.now();
    gitHubApi.getStatusesRequest(provider, updateSince).then(function (model) {
      log.debug(provider.uid, `ASYNC Statuses model [${Date.now() - t0}ms]:`, model);
      wiController.updateStatuses(provider.uid, model, updateSince); //direct call instead of using a callback
    }).catch(function (error) {
      console.error("GitHub GraphQL transformation failed");
      console.error(error)
      wiController.updateStatusesOnError("GitHub GraphQL transformation failed. Message: " + error, provider.uid);
    });
  },

}

export { gitHubApi };
