import { Octokit } from "octokit/rest"
import { graphql } from "octokit/graphql"
import { gitHubAdapter } from "./GitHubAdapter.js"
import { gitStoreApi } from "./GitStoreApi.js"
import { wiController } from "./WiController.js"
import { config } from "./Config.js"

/**
 * Core interface with the provider api (GitHub).
 * Al services and return a provider-independent model (using an adapter) to show in the UI.
 * See doc at Controller.js
 */
const gitHubApi = {

  log: function (providerId, message, model) {
    console.log(`${providerId}: ${message}`);
    if (model != undefined)
      console.log(model);
  },

  userAgent: config.getGitHubUserAgent(),

  getWorkItems: async function (target, provider) {
    const octokit = new Octokit({ userAgent: this.userAgent, auth: config.decrypt(provider.token), });
    const assigned = `is:open assignee:${provider.user} archived:false`;
    const unassigned = `is:open no:assignee owner:${provider.user} ${this.additionalOwners(provider, provider.unassignedAdditionalOwner)} archived:false`;
    const reviewer = `is:open user-review-requested:${provider.user} archived:false`
    const created = `is:open author:${provider.user} archived:false`
    const involved = `is:open involves:${provider.user} archived:false`
    const dependabot = `is:open is:pr author:app/dependabot owner:${provider.user} ${this.additionalOwners(provider, provider.dependabotAdditionalOwner)} archived:false`;
    const dependabotTest = `is:open is:pr author:${provider.user} archived:false in:title "Test pull Request for dependabot/testupdate"`;
    let promises = [];
    if (target == "assigned")
      promises = [
        octokit.rest.search.issuesAndPullRequests({ q: assigned, }),
        //To allow the ui to mark this as a review request, the api call is wrapped to add a special attribute (called custom_actions) to the response
        this.wrapIssuesAndPullRequestsCall(octokit, { q: reviewer, }, "review_request"),
        //Also show work items that need follow-up
        gitStoreApi.followUpAll(provider, true),
      ];
    else if (target == "unassigned")
      promises = [
        octokit.rest.search.issuesAndPullRequests({ q: unassigned, per_page: 60 }),
      ];
    else if (target == "created")
      promises = [
        octokit.rest.search.issuesAndPullRequests({ q: created, })
      ];
    else if (target == "involved")
      promises = [
        octokit.rest.search.issuesAndPullRequests({ q: involved, })
      ];
    else if (target == "follow-up")
      promises = [
        gitStoreApi.followUpAll(provider, false)
      ];
    else if (target == "dependabot") {
      promises = [
        octokit.rest.search.issuesAndPullRequests({ q: dependabot, per_page: 60 }),
      ];
      if (config.ff["updtest"])
        promises.push(octokit.rest.search.issuesAndPullRequests({ q: dependabotTest, per_page: 60 }));
    } else
      return;

    return await this.dispatchPromisesAndGetModel(target, provider, promises);
  },
  dispatchPromisesAndGetModel: async function(target, provider, promises) {
    const responses = await Promise.all(promises);
    this.log(provider.uid, "Data received from the api:", responses);
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
  additionalOwners: function (provider, additionalOwners) {
    return additionalOwners.length == 0 ? "" : " owner:" + additionalOwners.join(" owner:");
  },
  wrapIssuesAndPullRequestsCall: async function (octokit, query, action) {
    return octokit.rest.search.issuesAndPullRequests(query)
      .then(async function (response) {
        gitHubAdapter.addActionToPullRequestItems(response.data.items, action);
        return response;
      })
  },

  // Tracks the poll interval as indicated by the api doc https://docs.github.com/en/rest/activity/notifications?apiVersion=2022-11-28
  // to call at most once during the poll interval. These variable are used by all GitHub providers
  notifLastModified: undefined,
  notifPollInterval: undefined,
  updateNotificationsAsync: function (target, provider) {
    if (provider.token == "") //skip if no token provider to avoid api call errors
      return;
    // Poll interval control, if inside the interval, do not call the api, but update notifications
    let currentTime = Math.floor(new Date().getTime()/1000);
    if (this.notifLastModified != undefined && currentTime - this.notifLastModified < this.notifPollInterval) {
      this.log(provider.uid, `ASYNC Get Notifications using cached notifications, seconds to next api call: ${currentTime - this.notifLastModified}, poll interval: ${this.notifPollInterval}`);
      wiController.updateNotifications(provider.uid, null); // don't pass model to use the cached notifications
      return;
    }
    this.log(provider.uid, "ASYNC Get Notifications from the REST api");
    const octokit = new Octokit({ userAgent: this.userAgent, auth: config.decrypt(provider.token), });
    // Issue #44: According the api doc a call using Last-Modified header should be done. 
    // This works well when a notification appears, But when the notification is read, the browser still gets not modified (when using cache).
    // Therefore, this approach can't be used and overrides the cache using If-None-Match header.
    octokit.rest.activity.listNotificationsForAuthenticatedUser({ participating: true, headers: { 'If-None-Match': '' } }).then(function (response) {
      gitHubApi.log(provider.uid, "ASYNC Notifications response:", response);
      gitHubApi.notifLastModified = Math.floor(new Date().getTime()/1000);
      gitHubApi.notifPollInterval = response.headers["x-poll-interval"];
      let model = gitHubAdapter.notifications2model(response);
      wiController.updateNotifications(provider.uid, model); //direct call instead of using a callback
    });
  },

  getStatusesRequest: async function (provider, updateSince) {
    if (provider.token == "") //returns empty model if no token provider to avoid api call errors
      return gitHubAdapter.statuses2model(provider, {});
    let gqlresponse = {};
    let maxProjects = provider.graphql.maxProjects;
    try {
      if (updateSince != "")
        maxProjects = await this.countProjectsToUpdate(provider, updateSince);

      const query = gitHubApi.getStatusesQuery(provider, maxProjects, true);
      const graphql = gitHubApi.getGraphQlApi(provider);
      gqlresponse = await graphql(query);
    } catch (error) {
      console.error("GitHub GraphQL api call failed");
      console.error(error);
      wiController.updateStatusesOnError("GitHub GraphQL api call failed. Message: " + error, provider.uid);
    }
    this.log(provider.uid, `Statuses graphql response, maxProjects: ${maxProjects}, since: "${updateSince}":`, gqlresponse);
    const model = gitHubAdapter.statuses2model(provider, gqlresponse);
    return model;
  },

  //Gets number of projects that require update
  countProjectsToUpdate: async function (provider, keepSince) {
    const query0 = gitHubApi.getStatusesQuery(provider, provider.graphql.maxProjects, false);
    const graphql0 = gitHubApi.getGraphQlApi(provider);
    let gqlresponse0 = await graphql0(query0);
    //console.log("Count projects to update query model:")
    //console.log(gqlresponse0)
    let nodes = gqlresponse0.viewer.repositories.nodes;
    for (let i = 0; i < nodes.length; i++)
      if (new Date(keepSince).getTime() > new Date(nodes[i].pushedAt).getTime()) //old project
        return i;
    return gqlresponse0.viewer.repositories.nodes.length;
  },

  //Gets the statuses model, but asynchronously.
  //When the model is completed, calls controller to update the status value of the current target
  updateStatusesAsync: function (provider, updateSince) {
    this.log(provider.uid, "Get Statuses from the GraphQL api");
    this.getStatusesRequest(provider, updateSince).then(function (model) {
      gitHubApi.log(provider.uid, "ASYNC Statuses model:", model);
      wiController.updateStatuses(provider.uid, model, updateSince); //direct call instead of using a callback
    }).catch(function (error) {
      console.error("GitHub GraphQL transformation failed");
      console.error(error)
      wiController.updateStatusesOnError("GitHub GraphQL transformation failed. Message: " + error, provider.uid);
    });
  },

  getGraphQlApi: function (provider) {
    return graphql.defaults({
      headers: {
        authorization: `token ${config.decrypt(provider.token)}`,
      },
    });
  },

  getStatusesQuery: function (provider, maxProjects, includeAll) {
    let affiliations = provider.graphql.ownerAffiliations.toString();
    let forks = "isFork:false, ";
    if (provider.graphql.includeForks)
      forks = "";
    else if (provider.graphql.onlyForks)
      forks = "isFork:true, ";
    return `{
      viewer {
        login, resourcePath, url, repositories(first: ${maxProjects}, ownerAffiliations: [${affiliations}], 
        ${forks} orderBy: {field: PUSHED_AT, direction: DESC}) {
          nodes {
            name, nameWithOwner, url, pushedAt
            ${includeAll ? this.getProjectsRefsSubquery(provider) : ""}
          }
        }
      }
    }`;
  },
  getProjectsRefsSubquery: function (provider) {
    return `
    refs(refPrefix: "refs/heads/", first: ${provider.graphql.maxBranches}) {
      nodes {
        name
        target {
          ... on Commit {
            associatedPullRequests(first: 1) {
              edges {  node { title, number, url, state, createdAt, updatedAt } }
            }
            history(first: 1) { 
              nodes { messageHeadline, committedDate, statusCheckRollup { state } } 
            }
          }
        }
      }
    }`
  },

}

export { gitHubApi };
