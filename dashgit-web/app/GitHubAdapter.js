import { Model } from "./Model.js"

/**
 * Transforms the REST and GraphQL GitHub responses to the provider-independent models
 */
const gitHubAdapter = {

  workitems2model: function (provider, items) {
    let m = new Model().setHeader(provider.provider, provider.uid, provider.user, "");
    for (let item of items) {
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
  statuses2model: function (provider, gqlresponse) {
    let m = new Model().setHeader(provider.provider, provider.uid, provider.user, "");
    if (gqlresponse.viewer == undefined)
      return m;
    for (let repo of gqlresponse.viewer.repositories.nodes) {
      const repoName = repo.nameWithOwner;
      const repoUrl = repo.url;
      m.header.repo_names.push(repoName);
      for (let ref of repo.refs.nodes) {
        this.statusesNode2model(ref, repoName, repoUrl, m);
      }
    }
    return m;
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
    status = status.toUpperCase();
    if (status == "SUCCESS")
      return "success";
    else if (status == "FAILURE" || status == "ERROR")
      return "failure";
    else // other status is EXPECTED, but any other value asumes pending as there is a check
      return "pending";
  },

}

export { gitHubAdapter };
