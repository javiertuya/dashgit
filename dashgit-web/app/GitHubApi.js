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

  getWorkItems: async function (target, provider, sorting) {
    const token = config.decrypt(provider.token);
    const octokit = new Octokit({ userAgent: this.userAgent, auth: token });
    // issue #116 set sorting criteria to match the selected in the UI
    const sort = (sorting??"").includes("updated") ? "updated" : "created";
    const order = (sorting??"").includes("descending") ? "desc" : "asc";
    const assigned = { q:`is:open assignee:${provider.user} archived:false`, sort:sort, order:order };
    const unassigned = { q:`is:open no:assignee owner:${provider.user} ${this.additionalOwners(provider, provider.unassignedAdditionalOwner)} archived:false`, per_page: 60, sort:sort, order:order };
    const reviewer = { q:`is:open type:pr user-review-requested:${provider.user} archived:false`, sort:sort, order:order }
    const revise= { q:`is:open type:pr review:changes_requested author:${provider.user} archived:false`, sort:sort, order:order }
    const created = { q:`is:open author:${provider.user} archived:false`, sort:sort, order:order }
    const involved = { q:`is:open involves:${provider.user} archived:false`, sort:sort, order:order }
    const dependabot = { q:`is:open is:pr author:app/dependabot owner:${provider.user} ${this.additionalOwners(provider, provider.dependabotAdditionalOwner)} archived:false`, per_page: 60, sort:sort, order:order };
    const dependabotTest = { q:`is:open is:pr author:${provider.user} archived:false in:title "Test pull Request for dependabot/testupdate"`, per_page: 60, sort:sort, order:order };
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
    else if (target == "unassigned")
      promises = [
        ...this.issuesAndPullRequests(octokit, token, unassigned),
      ];
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
    else if (target == "dependabot") {
      promises = [
        octokit.rest.search.issuesAndPullRequests(dependabot),
      ];
      if (config.ff["updtest"])
        promises.push(octokit.rest.search.issuesAndPullRequests(dependabotTest));
    } else
      return;

    return await this.dispatchPromisesAndGetModel(target, provider, promises);
  },
  dispatchPromisesAndGetModel: async function(target, provider, promises) {
    const t0 = Date.now();
    const responses = await Promise.all(promises);
    this.log(provider.uid, `Data received from the api [${Date.now() - t0}ms]:`, responses);
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
  issuesAndPullRequests: function (octokit, token, query) {
    // Issue #129 Although documentation says that search query returns both issues and prs if no 'is:*' is specified,
    // this is not true when using fine grained tokens, that requires separate queries for issues and prs.
    if (token == "" || token.startsWith("ghp_")) { // single query for no token or fine grained token
      return [octokit.rest.search.issuesAndPullRequests(query)];
    } else { // separated queries to find issues and prs
      console.log("Assuming fine grained token, using separated queries for issues and PRs");
      let qissue = JSON.parse(JSON.stringify(query));
      let qpr = JSON.parse(JSON.stringify(query));
      qissue.q = "is:issue " + query.q;
      qpr.q = "is:pr " + query.q;
      return [octokit.rest.search.issuesAndPullRequests(qissue), octokit.rest.search.issuesAndPullRequests(qpr)];
    }
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
    gitHubApi.notifLastModified = Math.floor(new Date().getTime()/1000);
    gitHubApi.notifPollInterval = 120; //default value, if below query fails (eg. token without permission), next call will be done after this interval
    octokit.rest.activity.listNotificationsForAuthenticatedUser({ participating: true, headers: { 'If-None-Match': '' } }).then(function (response) {
      gitHubApi.log(provider.uid, "ASYNC Notifications response:", response);
      gitHubApi.notifPollInterval = response.headers["x-poll-interval"];
      let model = gitHubAdapter.notifications2model(response);
      wiController.updateNotifications(provider.uid, model); //direct call instead of using a callback
    });
  },

  getStatusesRequest: async function (provider, updateSince) {
    const graphqlV2 = !provider.graphql.deprecatedGraphqlV1;
    let userSpecRepos = graphqlV2 ? provider.graphql.userSpecRepos : "";
    if (provider.token == "") //returns empty model if no token provider to avoid api call errors
      return gitHubAdapter.statuses2model(provider, {}, graphqlV2);
    let gqlresponse = {};
    try {
      // check how many repositories must be updated, this info will be used to construct the query
      let updateReqs = await this.getUpdateReqs(provider, userSpecRepos, updateSince, graphqlV2);
      if (updateReqs.maxProjects == 0 && updateReqs.otherRepos == "") {
        this.log(provider.uid, `No projects to update, since: "${updateSince}":`);
        return gitHubAdapter.statuses2model(provider, {}, graphqlV2);
      }

      const query = gitHubApi.getStatusesQuery(provider, updateReqs.maxProjects, updateReqs.otherRepos, true, graphqlV2);
      const graphql = gitHubApi.getGraphQlApi(provider);
      gqlresponse = await graphql(query);
      this.log(provider.uid, `Statuses graphql response, maxProjects: ${updateReqs.maxProjects} and "${updateReqs.otherRepos}", since: "${updateSince}":`, gqlresponse);
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
  getUpdateReqs: async function (provider, userSpecRepos, updateSince, graphqlV2) {
    let updateReqs = { maxProjects: provider.graphql.maxProjects, otherRepos: userSpecRepos };
    if (updateSince == "")
      return updateReqs;

    const query0 = gitHubApi.getStatusesQuery(provider, provider.graphql.maxProjects, updateReqs.otherRepos, false, graphqlV2);
    const graphql0 = gitHubApi.getGraphQlApi(provider);
    const t0 = Date.now();
    let gqlresponse0 = await graphql0(query0);
    gitHubApi.log(provider.uid, `Statuses graphql response, time to get update reqs [${Date.now() - t0}ms]:`, gqlresponse0);
    //console.log("Count projects to update query model:")
    //console.log(gqlresponse0)
    updateReqs.maxProjects = gitHubAdapter.getNumReposToUpdate(gqlresponse0, updateReqs.maxProjects, updateSince);
    updateReqs.otherRepos = gitHubAdapter.getUserReposToUpdate(gqlresponse0, updateSince);
    return updateReqs;
  },

  //Gets the statuses model, but asynchronously.
  //When the model is completed, calls controller to update the status value of the current target
  updateStatusesAsync: function (provider, updateSince) {
    this.log(provider.uid, "Get Statuses from the GraphQL api");
    const t0 = Date.now();
    this.getStatusesRequest(provider, updateSince).then(function (model) {
      gitHubApi.log(provider.uid, `ASYNC Statuses model [${Date.now() - t0}ms]:`, model);
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

  getStatusesQuery: function (provider, maxProjects, userSpecRepos, includeAll, graphqlV2) {
    let affiliations = provider.graphql.ownerAffiliations.toString();
    let forks = "isFork:false, ";
    if (provider.graphql.includeForks)
      forks = "";
    else if (provider.graphql.onlyForks)
      forks = "isFork:true, ";
    return `{
      viewer {
        login, resourcePath, url, repositories(first: ${maxProjects}, ownerAffiliations: [${affiliations}], 
        ${forks} isArchived:false, orderBy: {field: PUSHED_AT, direction: DESC}) {
          nodes {
            name, nameWithOwner, url, pushedAt
            ${includeAll ? this.getReposSubquery(provider, graphqlV2) : ""}
          }
        }
      }
      ${graphqlV2 ? this.getUserSpecReposSubquery(provider, userSpecRepos, includeAll) : ""}
    }`;
  },
  getReposSubquery: function (provider, graphqlV2) {
    return `
    ${graphqlV2 ? this.getPullRequestsNode(provider) : ``}
    ${this.getRefsNode(provider)}
    `;
  },
  getPullRequestsNode: function(provider) {
    return `
    pullRequests(first: ${provider.graphql.maxBranches}, states:[OPEN], orderBy: {field:UPDATED_AT, direction:DESC}) 
      { edges { node { title, number, url, state, createdAt, updatedAt,
        headRefName, baseRepository {nameWithOwner}, headRepository {nameWithOwner}, 
        statusCheckRollup { state } } } }`;
  },
  getRefsNode: function(provider, graphqlV2) {
    return `
    refs(refPrefix: "refs/heads/", first: ${provider.graphql.maxBranches}) {
      nodes {
        name
        target {
          ... on Commit {
            ${!graphqlV2 ? `
            associatedPullRequests(first: 1) {
              edges {  node { title, number, url, state, createdAt, updatedAt } }
            }
            ` : ``}
            history(first: 1) { 
              nodes { messageHeadline, committedDate, statusCheckRollup { state } } 
            }
          }
        }
      }
    }`;
  },
  getUserSpecReposSubquery: function(provider, reposStr, includeAll) {
    if (reposStr == undefined)
      return "";
    let repos = reposStr.split(" ");
    let query = "";
    let i = 0;
    for (let item of repos) {
      if (item == "")
        continue;
      const repoAlias = "xr" + i;
      const repoAll = item.split("/");
      const owner = repoAll[0];
      const repo = repoAll.length < 2 ? "" :repoAll[1];
      query += `
    ${repoAlias}:repository(owner:"${owner}", name:"${repo}") {
      name, nameWithOwner, url, pushedAt, updatedAt
      ${includeAll ? this.getPullRequestsNode(provider) : ""}
    }`;
      i++;
    }
    return query
  },

}

export { gitHubApi };
