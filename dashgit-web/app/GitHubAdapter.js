import { Model } from "./Model.js"
import { gitStoreAdapter } from "./GitStoreAdapter.js"

/**
 * Transforms the REST and GraphQL GitHub responses to the provider-independent models
 */
const gitHubAdapter = {

  workitems2model: function (provider, items) {
    let m = new Model().setHeader(provider.provider, provider.uid, provider.user, "");
    for (let item of items) {
      // Special handling of each follow-up (items come from a json file)
      if (item.remind != undefined) {
        m.addItem(gitStoreAdapter.followUp2model(provider, item));
        continue;
      }

      let type = "issue";
      if (item.pull_request !== undefined) //issues do not have a PR attribute
        type = "pr";
      // although parsing urls is not the best practice, the search api does not return the required attributes
      let repoName = item.repository_url.substring(`${provider.api}/repos/`.length);
      let repoUrl = `${provider.url}/${repoName}`;

      let assignees = "";
      for (let assignee of item.assignees)
        assignees += assignee.login + " ";
      let iidstr = "#" + item.number;
      let actions = item.custom_actions == undefined ? {} : item.custom_actions;
      m.addItem({
        repo_name: repoName, type: type, iid: item.number,
        title: item.title, actions: actions,
        author: item.user.login, assignees: assignees, created_at: item.created_at, updated_at: item.updated_at,
        iidstr: iidstr, url: item.html_url, repo_url: repoUrl,
        labels: []
      });
      for (let label of item.labels) {
        m.addLastItemLabel(label.name, label.color);
      }
    }
    return m;
  },
  addActionToPullRequestItems: function(responseItems, action) {
    for (let item of responseItems) {
      if (item.custom_actions==undefined) //create if does not exist
        item["custom_actions"] = {};
      item.custom_actions[action]=true;
    }
  },

  notifications2model: function (response) {
    let model = [];
    for (let item of response.data) {
      if (item.subject.type == "Issue" || item.subject.type == "PullRequest") {
        let urlSplit = item.subject.url.split("/");
        //After qabot removes branches that have been included in a combined update, some notifications appear
        //that are not associated to any work item: PR state_change notifications
        //Removes this kind of notifications
        //Other option could be check in statuses if the pr is open (although notifications run in parallel with statuses api)
        if (item.subject.type == "PullRequest" && item.reason == "state_change")
          continue;
        model.push({
          repo_name: item.repository.full_name, reason: item.reason,
          type: (item.subject.type == "Issue" ? "issue" : "pr"), iid: urlSplit[urlSplit.length - 1]
        });
      }
    }
    return model;
  },

  //Model transformations from the result of the graphql invocation to the provider independent format
  statuses2model: function (provider, gqlresponse, graphqlV2) {
    let m = new Model().setHeader(provider.provider, provider.uid, provider.user, "");
    if (gqlresponse.viewer == undefined)
      return m;
    for (let repo of gqlresponse.viewer.repositories.nodes) {
      const repoName = repo.nameWithOwner;
      const repoUrl = repo.url;
      m.header.repo_names.push(repoName);
      if (graphqlV2) {
        let loadedBranches = {}; // to exclude branches if already added from a PR
        for (let ref of repo.pullRequests?.edges??[])
          this.statusesPrNode2model(ref.node, repoName, repoUrl, m, loadedBranches);
        for (let ref of repo.refs?.nodes??[])
          this.statusesBranchNode2model(ref, repoName, repoUrl, m, loadedBranches);
      } else { // deprecated, gets PRs inside branches
        for (let ref of repo.refs.nodes)
          this.statusesNode2model(ref, repoName, repoUrl, m);
      }
    }
    return m;
  },
  statusesPrNode2model: function (node, repoName, repoUrl, targetModel, loadedBranches) {
    // Should ignore PRs in other states
    if (node.state != "OPEN") 
      return;

    let status = this.transformStatus(node.statusCheckRollup?.state);
    // Construct manually as we do not have the url for a commit
    let branchUrl = "";
    let branchName = "";
    if (node.headRepository.nameWithOwner == node.baseRepository.nameWithOwner) { // local PR
      branchUrl = repoUrl + "/tree/" + node.headRefName;
      branchName = node.headRefName;
    } else { // PR from fork, branch url refers to the fork and name has a fork icon
      branchUrl = "https://github.com/" + node.headRepository.nameWithOwner + "/tree/" + node.headRefName;
      branchName = "fork:" + node.headRefName; // fork: will be replaced by icon in render
    }

    targetModel.addItem({
      repo_name: repoName, type: "pr", iid: node.number,
      branch_name: branchName, status: status,
      title: node.title, actions: {},
      author: "", assignees: "", created_at: node.createdAt, updated_at: node.updatedAt,
      iidstr: "#" + node.number, url: node.url, branch_url: branchUrl, repo_url: repoUrl,
      labels: []
    });
    // Adds the branch (url) to avoid duplications when this branch is detected
    loadedBranches[branchUrl] = branchUrl;
  },
  statusesBranchNode2model: function (ref, repoName, repoUrl, targetModel, loadedBranches) {
    // Exit if there is no info on the single commit that should be retrieved by graphQL
    if (ref.target.history.nodes.length == 0)
      return;

    let node = ref.target.history.nodes[0];
    let status = this.transformStatus(node.statusCheckRollup?.state);
    // Construct manually as we do not have the url for a commit
    let branchUrl = repoUrl + "/tree/" + ref.name;

    // Exit if this branch was aready loaded from a PR
    if (loadedBranches[branchUrl] == branchUrl)
      return;

    targetModel.addItem({
      repo_name: repoName, type: "branch", iid: "",
      branch_name: ref.name, status: status,
      title: node.messageHeadline, actions: {},
      author: "", assignees: "", created_at: node.committedDate, updated_at: node.committedDate,
      iidstr: "", url: branchUrl, branch_url: branchUrl, repo_url: repoUrl,
      labels: []
    });
  },
  
  statusesNode2model: function(ref, repoName, repoUrl, targetModel) {
        const branch = ref.name;
        // Los siguientes datos son los de los commits de ramas y prs.
        // Ambos son arrays, solo utiliza el primer item.
        let type = "";
        let title = "";
        let url = "";
        let branchUrl = "";
        let createdAt = "";
        let updatedAt = "";
        let status = "";
        let iid = "";
        // Si no hay pull request asociada, ademas del status usara los datos correspondientes al commit.
        if (ref.target.history.nodes.length > 0) {
          type = "branch";
          title = ref.target.history.nodes[0].messageHeadline;
          createdAt = ref.target.history.nodes[0].committedDate;
          branchUrl = repoUrl + "/tree/" + branch; //construct manually as we do not have the url for a commit
          url = branchUrl;
          updatedAt = createdAt;
          if (ref.target.history.nodes[0].statusCheckRollup === undefined || ref.target.history.nodes[0].statusCheckRollup === null)
            status = "notavailable"; //may not have status if there are any pr rule or action executed
          else
            status = this.transformStatus(ref.target.history.nodes[0].statusCheckRollup.state);
        }
        // Si hay pull request asociada, sobrescribe los datos anteriores (salvo status) para mostrar una pr en la vista.
        // Requiere que la pr este abierta, si no, se vera como un commit.
        if (ref.target.associatedPullRequests.edges.length > 0 && ref.target.associatedPullRequests.edges[0].node.state == "OPEN") {
          type = "pr";
          title = ref.target.associatedPullRequests.edges[0].node.title;
          iid = ref.target.associatedPullRequests.edges[0].node.number;
          url = ref.target.associatedPullRequests.edges[0].node.url;
          createdAt = ref.target.associatedPullRequests.edges[0].node.createdAt;
          updatedAt = ref.target.associatedPullRequests.edges[0].node.updatedAt;
        }
        // Crea el modelo, de la rama (commit)
        targetModel.addItem({
          repo_name: repoName, type: type, iid: iid,
          branch_name: branch, status: status,
          title: title, actions: {},
          author: "", assignees: "", created_at: createdAt, updated_at: updatedAt,
          iidstr: iid != "" ? "#" + iid : "", url: url, branch_url: branchUrl, repo_url: repoUrl,
          labels: []
        });
  },
  transformStatus: function (status) {
    status = status??"".toUpperCase();
    if (status == "SUCCESS")
      return "success";
    else if (status == "FAILURE" || status == "ERROR")
      return "failure";
    else if (status == "EXPECTED" || status == "PENDING")
      return "pending";
    else // other status is not available, but any other value asumes pending as there is a check
      return "notavailable";
  },

  // Transformations of the GraphQL response prior to conversion into a model

  // Adds the user specified reports (Sibling of the viewer node) as additional repositories in the viewer
  postprocessGraphQl: function(gqlresponse) {
    let repos = this.getUserSpecRepos(gqlresponse);
    if (repos.length == 0) // postprocessing not needed
      return gqlresponse;

    let includedRepos = {}; // to control duplicates
    for (let repo of gqlresponse.viewer.repositories.nodes)
      includedRepos[repo.nameWithOwner] = true;

    for (let repo of repos) {
      if (repo.pullRequests.edges.length == 0) // repos without PRs are ignored
        continue;
      if (includedRepos[repo.nameWithOwner] != undefined) // avoid duplicate repos
        continue;

      includedRepos[repo.nameWithOwner] = true;
      gqlresponse.viewer.repositories.nodes.push(repo);
    }
    return gqlresponse;
  },
  getUserSpecRepos: function(gqlresponse) {
    let nodes = [];
    let i = 0;
    let repo;
    do {
      repo = gqlresponse["xr" + i];
      if (repo != undefined)
        nodes.push(repo);
      i++;
    } while (repo != undefined);
    return nodes;
  },
  
  // Determination of the scope to update statuses since a given date
  getNumReposToUpdate: function(gqlresponse0, maxProjects, keepSince) {
    if (keepSince == "")
      return maxProjects;
    let nodes = gqlresponse0.viewer.repositories.nodes;
    for (let i = 0; i < nodes.length; i++)
      if (new Date(keepSince).getTime() > new Date(nodes[i].pushedAt).getTime()) { //old project
        maxProjects = i;
        break;
      }
    return maxProjects;
  },
  getUserReposToUpdate: function(gqlresponse0, keepSince) {
    let reposToUpdate = "";
    let repos = gitHubAdapter.getUserSpecRepos(gqlresponse0);
    for (let repo of repos)
      if (keepSince == "" || new Date(keepSince).getTime() <= new Date(repo.pushedAt).getTime())
        reposToUpdate += " " + repo.nameWithOwner;
    return reposToUpdate.trim();
  },

}

export { gitHubAdapter };
