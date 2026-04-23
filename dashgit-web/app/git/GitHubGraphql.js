import { graphql } from "octokit/graphql"
import { gitHubAdapter } from "./GitHubAdapter.js"
import { log } from "./Log.js"
import { wiController } from "../WiController.js"
import { login } from "../Login.js"

/**
 * Core interface with the provider api (GitHub).
 * Al services and return a provider-independent model (using an adapter) to show in the UI.
 * See doc at Controller.js
 */
const gitHubGraphql = {

  getGraphQlApi: function (provider) {
    return graphql.defaults({
      headers: {
        authorization: `token ${login.getProviderToken(provider)}`,
      },
    });
  },

  graphQlWithPagination: async function (provider, maxProjects, maxPageSize, userSpecRepos, includeAll, pagedUpdate, graphqlV2) {
    maxPageSize = Math.max(maxPageSize, 2); // ensure in a range
    maxPageSize = Math.min(maxPageSize, 50);
    let allData = {};
    let page = 0;
    let remainingProjects = maxProjects;
    let hasNextPage = true;
    let endCursor = null;
    while (hasNextPage && remainingProjects > 0) {
      const pageSize = Math.min(remainingProjects, maxPageSize);
      const effectiveUserSpecRepos = endCursor == null ? userSpecRepos : ""; // only included in the first page
      const goal = includeAll ? "Get statuses" : "Get update reqs"
      log.debug(provider.uid, `${goal}, page ${++page}, page size ${pageSize}, remaining ${remainingProjects} ...`);
      const query = this.getStatusesQuery(provider, pageSize, effectiveUserSpecRepos, includeAll, endCursor, graphqlV2);
      const graphql = this.getGraphQlApi(provider);
      const response = await graphql(query);

      if (allData.viewer == undefined) // first page
        allData = response;
      else
        allData.viewer.repositories.nodes.push(...response.viewer.repositories.nodes);

      // prepare for next page
      remainingProjects -= pageSize;
      hasNextPage = response.viewer.repositories.pageInfo.hasNextPage;
      endCursor = response.viewer.repositories.pageInfo.endCursor;

      // if required, update the statuses of the partial model (all pages until now) to the ui
      // When handling last page, the ui will be fully updated by the caller
      if (includeAll && pagedUpdate && remainingProjects > 0 && hasNextPage) {
        const gqlresponse = gitHubAdapter.postprocessGraphQl(allData);
        const model = gitHubAdapter.statuses2model(provider, gqlresponse, graphqlV2);
        wiController.updateStatusesForPage(provider.uid, model); //direct call instead of using a callback
      }
    }
    return allData;
  },

  getStatusesQuery: function (provider, maxProjects, userSpecRepos, includeAll, cursor, graphqlV2) {
    let affiliations = provider.graphql.ownerAffiliations.toString();
    let forks = "isFork:false, ";
    if (provider.graphql.includeForks)
      forks = "";
    else if (provider.graphql.onlyForks)
      forks = "isFork:true, ";
    return `{
      viewer {
        login, resourcePath, url, repositories(first: ${maxProjects}, ownerAffiliations: [${affiliations}], 
        after: ${cursor == null ? "null" : `"${cursor}"`},
        ${forks} isArchived:false, orderBy: {field: PUSHED_AT, direction: DESC}) {
          nodes {
            name, nameWithOwner, url, pushedAt
            ${includeAll ? this.getReposSubquery(provider, graphqlV2) : ""}
          }
          pageInfo {
            hasNextPage, endCursor
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
  getPullRequestsNode: function (provider) {
    return `
    pullRequests(first: ${provider.graphql.maxBranches}, states:[OPEN], orderBy: {field:UPDATED_AT, direction:DESC}) 
      { edges { node { title, number, url, state, createdAt, updatedAt,
        headRefName, baseRepository {nameWithOwner}, headRepository {nameWithOwner}, 
        statusCheckRollup { state } } } }`;
  },
  getRefsNode: function (provider, graphqlV2) {
    return `
    refs(refPrefix: "refs/heads/", first: ${provider.graphql.maxBranches}) {
      nodes {
        name
        target {
          ... on Commit {
            ${graphqlV2 ? `` : `
            associatedPullRequests(first: 1) {
              edges {  node { title, number, url, state, createdAt, updatedAt } }
            }
            `}
            history(first: 1) { 
              nodes { messageHeadline, committedDate, statusCheckRollup { state } } 
            }
          }
        }
      }
    }`;
  },
  getUserSpecReposSubquery: function (provider, reposStr, includeAll) {
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
      const repo = repoAll.length < 2 ? "" : repoAll[1];
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

export { gitHubGraphql };
