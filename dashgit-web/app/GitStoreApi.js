import { Octokit } from "octokit/rest"
import { config } from "./Config.js"

/**
 * Secondary interface with the GitHub api to manage stored files
 * that are used by the functions of combined dependency updates and follow-ups.
 * GitHub stored data is used both by github and gitlab providers.
 */
const gitStoreApi = {

  userAgent: config.getGitHubUserAgent(),

  emptyFollowUpContent: { followUp: [] },

  // Gets all follow-ups stored in a given server url
  followUpAll: async function (provider, onlyExpired) {
    const fileName = config.getProviderFollowUpFileName(provider.url, provider.user);
    const ownerRepo = config.data.updateManagerRepo.split("/");
    console.log(`Read follow up json file: ${fileName}`)
    return this.getContent(config.data.updateManagerToken, ownerRepo[0], ownerRepo[1], config.param.followUpBranch, fileName)
      .then(async function (response) {
        let content = JSON.parse(atob(response.data.content));
        return onlyExpired ? gitStoreApi.filterExpiredFollowUps(content) : content;
      }).catch(function (error) {
        console.log(`No follow-up set for ${provider.url}, user ${provider.user}, status ${error.status}, message: ${error.toString()}`);
        return gitStoreApi.emptyFollowUpContent;
      });
  },
  filterExpiredFollowUps: function(content) {
    let items = [];
    for (let item of content.followUp) {
      if (new Date(item.remind) < new Date()) // keeps only expired
        items.push(item);
    }
    content.followUp = items;
    return content;
  },

  // Creates a new branch and a new file specified by path
  createBranchAndContent: async function (token, owner, repo, branch, path, content, message) {
    const branchResponse = await this.createBranch(token, owner, repo, branch);
    const response = await this.setContent(token, owner, repo, branch, path, branchResponse.data.object.sha, content, message);
    return response.data.content.download_url;
  },

  // Creates a new branch starting from the latest commit of the default branch
  createBranch: async function (token, owner, repo, branch) {
    const octokit = new Octokit({ userAgent: this.userAgent, auth: config.decrypt(token), });

    console.log("Get default branch, sha, and create branch")
    const repoResponse = await octokit.request("GET /repos/{owner}/{repo}", { owner: owner, repo: repo });
    console.log(repoResponse);

    const masterResponse = await octokit.rest.git.getRef({ owner: owner, repo: repo, ref: "heads/" + repoResponse.data.default_branch });
    console.log(masterResponse);

    const branchResponse = await octokit.rest.git.createRef({
      owner: owner, repo: repo, ref: "refs/heads/" + branch, sha: masterResponse.data.object.sha
    });
    console.log(branchResponse);
    return branchResponse;
  },

  // Creates or updates a file at the speciied branch.
  // If file is new, requires the sha of the old content that must be obtained with getContent
  setContent: async function (token, owner, repo, branch, path, sha, content, message) { // NOSONAR
    const octokit = new Octokit({ userAgent: this.userAgent, auth: config.decrypt(token), });
    const response = await octokit.rest.repos.createOrUpdateFileContents({
      owner: owner, repo: repo, branch: branch, path: path, sha: sha, content: content, message: message
    });
    console.log(`Set content, SHA: ${response.data.content.sha}:`);
    console.log(response);
    return response;
  },

  // Gets a file from the specified branch
  // Avoids using cache to overcome error 409: https://github.com/octokit/octokit.js/issues/890
  getContent: async function (token, owner, repo, branch, path) {
    const octokit = new Octokit({ userAgent: this.userAgent, auth: config.decrypt(token), });
    const response = await octokit.rest.repos.getContent({
      owner: owner, repo: repo, ref: branch, path: path, headers: { 'If-None-Match': '' }
    });
    console.log(`Get content, SHA: ${response.data.sha}:`)
    console.log(response);
    return response;
  }

}

export { gitStoreApi };
