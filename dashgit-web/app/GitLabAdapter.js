import { Model } from "./Model.js"
import { gitStoreAdapter } from "./GitStoreAdapter.js"

/**
 * Transforms the REST and GraphQL GitLab responses to the provider-independent models
 */
const gitLabAdapter = {

  workitems2model: function (provider, items, allLabels) {
    let model = new Model().setHeader(provider.provider, provider.uid, provider.user, provider.url);
    for (let issueMrOrTodo of this.safe(items)) {
      // Special handling of each follow-up (items come from a json file)
      if (issueMrOrTodo.remind != undefined) {
        model.addItem(gitStoreAdapter.followUp2model(provider, issueMrOrTodo));
        continue;
      }

      // Items may come from a different data structures obtained from
      // issues and merge requests or to do lists
      // The common part is the repo name and url, and whether it is issue
      let common = this.workitem2commonmodel(provider, issueMrOrTodo);
      if (common == null) // to do lists may return null to skip the item
        continue;

      // Rest of the data is located in different places, previous method determined where
      let item = common.item;

      let assignees = "";
      for (let assignee of item.assignees)
        assignees += assignee.username + " ";
      let iidstr = (common.isIssue ? "#" : "!") + item.iid;
      let actions = item.custom_actions == undefined ? {} : item.custom_actions;
      model.addItem({
        repo_name: common.repoName, type: (common.isIssue ? "issue" : "pr"), iid: item.iid,
        title: item.title, actions: actions,
        author: item.author.username, assignees: assignees, created_at: item.created_at, updated_at: item.updated_at,
        iidstr: iidstr, url: item.web_url, repo_url: common.repoUrl,
        labels: []
      });
      // GitLab does not store label colors in response, get the labels from the parameter
      this.getLabelsForItem(common.repoName, item, allLabels, model);
    }
    return model;
  },
  workitem2commonmodel: function (provider, item) {
    // returns common info in this variable
    let common = { isIssue: false, repoName: "", repoUrl: "", item: null };

    if (item.target == undefined) { // from api.Issues.all or api.MergeRequests.all
      if (item.type == "ISSUE" || item.type == "INCIDENT") //mr do not have this attribute
        common.isIssue = true;
      common.repoName = item.references.full.substring(0, item.references.full.indexOf(common.isIssue ? "#" : "!"));
      common.repoUrl = item.web_url.substring(0, item.web_url.indexOf(common.isIssue ? "/-/issues/" : "/-/merge_requests/"));
      common.item = item; // rest of attributes still are in the item
    } else { // from api.TodoLists.all
      if (item.target_type == "Issue")
        common.isIssue = true;
      else if (item.target_type == "MergeRequest")
        common.isIssue = false; //NOSONAR makes more clear the logic
      else
        return null; //do not handle other types
      if (item.target.state != "opened")
        return null;
      common.repoName = item.project.path_with_namespace;
      common.repoUrl = provider.url + "/" + common.repoName;
      //rest of attributes are inside target
      common.item = item.target;
    }
    return common;
  },

  //To use in iterations to prevent null errors if the object being iterated is not defined
  //fix issue #17
  safe: function (item) {
    if (item == null || item == undefined)
      return [];
    return item;
  },

  addActionToToDoResponse: function (response, action, user) {
    for (let item of this.safe(response)) {
      // To mark action as review request the notification target must be a Merge Request
      // whit the user in the list of assigned reviewers, if not, does not modify this item
      if (action != "review_request" || item.target_type != "MergeRequest" || item.state != "pending"
        || item.target.reviewers == undefined || item.target.reviewers.map(p => p.username).indexOf(user) < 0)
          continue;
      // Add the custom action to the request
      if (item.target.custom_actions == undefined) //create if does not exist
        item.target["custom_actions"] = {};
      item.target.custom_actions[action] = true;
    }
    return response;
  },
  
  getLabelsForItem: function (repoName, item, allLabels, model) {
    for (let label of this.safe(item?.labels)) {
      let color = ""; //default if not found
      if (allLabels?.[this.getLabelId(repoName, label)] != undefined)
        color = allLabels[this.getLabelId(repoName, label)].color;
      model.addLastItemLabel(label, color.replace("#", ""));
    }
  },
  getLabelId: function (repoName, title) {
    return `${repoName}-${title}`;
  },

  labels2model: function (gqlresponse) {
    let labels = {};
    // Model is indexed by repo and label title
    for (let proj of this.safe(gqlresponse?.data?.projects?.nodes)) {
      const repoName = proj.fullPath;
      if (!proj.archived)
        for (let label of proj.labels.nodes)
          labels[this.getLabelId(repoName, label.title)] = { color: label.color };
    }
    return labels;
  },
   notifications2model: function (response) {
    let model = [];
    for (let item of this.safe(response)) {
      if (item.target_type == "Issue" || item.target_type == "MergeRequest") {
        model.push({
          repo_name: item.project.path_with_namespace, reason: item.action_name,
          type: (item.target_type == "Issue" ? "issue" : "pr"), iid: item.target.iid
        });
      }
    }
    return model;
  },

  //Model transformations from the graphql result to the provider independent format
  projects2model: function (provider, gqlresponse) {
    let m = new Model().setHeader(provider.provider, provider.uid, provider.user, provider.url);
    if (gqlresponse.data == undefined)
      return m;
    for (let proj of this.safe(gqlresponse?.data?.projects?.nodes)) {
      const repoName = proj.fullPath;
      const repoUrl = proj.webUrl;
      if (!proj.archived && proj.repository?.branchNames!=null) { //gitlab.com may give a null
        m.header.repo_names.push(repoName);
        for (let repo of this.safe(proj?.repository?.branchNames)) {
          const branch = repo;
          const modelItem = { //anyade un id que no esta en gitlab para poder usar como criterio de seleccion en siguiente query
            repo_name: repoName, type: "branch", iid: "",
            branch_name: branch, status: "notavailable",
            title: "", actions: {},
            author: "", assignees: "", created_at: "", updated_at: "",
            iidstr: "", url: "", branch_url: "", repo_url: repoUrl,
            labels: [], gid: proj.id
          };
          m.addItem(modelItem);
        }
      }
    }
    return m;
  },
  model4projectIds: function (mod) {
    let gids = [];
    for (let proj of this.safe(mod?.items)) //filter out archived projects
      if (!proj.archived && !gids.includes(proj.gid))
        gids.push(proj.gid);
    return gids;
  },

  statuses2model: function (mod, gqlresponse) {
    if (gqlresponse.data == undefined)
      return mod;
    for (let repo of this.safe(gqlresponse?.data?.projects?.nodes)) {
      const repoName = repo.fullPath;

      //Obtiene ramas y statuses a partir de las pipelines
      this.transformPipelines(repo, repoName, mod);

      //Continua examinando las pull requests que hagan match para cambiar su tipo y atributos adicionales
      this.transformMergeRequests(repo, repoName, mod);
    }
    return mod;
  },
  transformPipelines: function (repo, repoName, mod) {
    for (let ref of this.safe(repo?.pipelines?.nodes)) { //a branch
      const branch = ref.refPath.replace("refs/heads/", "");
      //en este momento solo hay ramas, que no tienen uid, localiza el item del modelo
      let uid = mod.getModelUid(repoName, "branch", "", branch);
      let m = mod.getItemByUid(uid);
      //Debe coincidir con una de las ramas del modelo que son las que existen realmente
      //(si es una pipeline antigua puede no tener ya ramas)
      //Ademas cuando la rama aparece varias veces se debe seleccionar la primera, para ello
      //la rama no tiene que tener fecha establecida en el modelo, es decir, que 
      //todavia no ha hecho match con una pipeline
      if (m !== undefined && m.updated_at == "") {
        m.title = "";
        m.created_at = ref.startedAt;
        m.updated_at = ref.finishedAt;
        if (m.updated_at == undefined) //MRs in progress do not have updated_at
          m.updated_at = m.created_at;
        m.branch_url = mod.header.url + "/" + repoName + "/-/tree/" + branch;
        m.status = this.transformStatus(ref.status);
      }
    }
  },
  transformMergeRequests: function (repo, repoName, mod) {
    for (let mr of this.safe(repo?.mergeRequests?.nodes)) {
      let uid = mod.getModelUid(repoName, "branch", "", mr.sourceBranch);
      let m = mod.getItemByUid(uid);
      if (m !== undefined) {
        m.title = mr.title;
        m.iid = mr.iid;
        m.url = mr.webUrl
        if (mr.finishedAt != undefined)
          m.updated_at = mr.finishedAt;
        m.type = "pr";
        //Renombra el uid pues contiene el valor del tipo que ha cambiado (en modelo y cache)
        mod.updateItemUid(m);
      }
    }
  },
  transformStatus: function (status) {
    status = status.toLowerCase();
    if (status == "success")
      return "success";
    else if (status == "failed" || status == "canceled" || status == "skipped")
      return "failure";
    else //cualquier otra cosa supone pending porque hay una pipeline (revisar)
      return "pending";
  },

}

export { gitLabAdapter }