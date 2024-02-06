/**
 * Represents a provider-independent model of the work items.
 * This model is obtained by the adapters from the actual api results.
 * The model is omposed of a header (with metadata about the provider, target, etc.)
 * and a collection of items, each is a work item (issue, pull request, branch, etc.)
 * 
 * Although these fields are accesible, creation of the mudel MUST use the 
 * methods provided in this class to set the header an add new items and labels in order to:
 * - Add an string id to each item
 * - Get items by id
 */
class Model {
  header = { provider: "", uid: "", user: "", url: "", repo_names: [], target: "", message: "" };
  items = []; // work items (issue, branch, pr)
  #index = {}; // to access each work item by uid

  //Unique identifier for each item in the model:
  //  repository + type + iid (issues and prs) or branch name
  //As the uid can be used as a jquery id, replaces invalid characters by -
  getModelUid(repo, type, iid, branch) {
    repo = repo.replace(/[^a-zA-Z0-9]+/g, "-");
    branch = branch == undefined ? "" : branch;
    iid = iid == undefined ? "" : iid; //if there is no iid (issue, pr) uses the branch name
    iid = iid != "" ? iid : branch.replace(/[^a-zA-Z0-9]+/g, "-")
    return repo + "_" + type + "_" + iid;
  }

  getItemByUid(uid) {
    return this.#index[uid];
  }

  // Although uses the default constructor to allow instantiate empty models to acces some methods,
  // in normal situations the instantiation will be new Model().setHeader(...) or new Model().fromObject(...)
  setHeader(provider, uid, user, url) {
    this.header.provider = provider;
    this.header.uid = uid;
    this.header.user = user;
    this.header.url = url;
    this.header.repo_names = [];
    this.header.target = "";
    this.header.message = "";
    return this;
  }
  fromObject(obj) {
    Object.assign(this, obj);
    this.reindex();
    return this;
  }

  addItem(value) {
    const uid = this.getModelUid(value.repo_name, value.type, value.iid, value.branch_name);
    value.uid = uid; //also stores the uid in the item
    value.labels = []
    this.items.push(value);
    this.#index[uid] = value;
    return uid;
  }

  //Renames the item id according to the information in the item.
  //(e.g. in GitLab item may be a branch, and later is discovered as pr, the id changes it must be reindexed)
  updateItemUid(item) {
    let oldUid = item.uid;
    let newUid = this.getModelUid(item.repo_name, item.type, item.iid, item.branch_name);
    delete this.#index[oldUid];
    item.uid = newUid;
    this.#index[newUid] = item;
  }

  //Merge this model prs and branches with the model received as parameter:
  //Merges in a repo by repo basis. Requires the names of repos be in the header
  mergeBranchesAndPrs(model) {
    //Remove items from repos not contained in the header.repo_names and adds the new items of model
    for (let i = this.items.length - 1; i >= 0; i--) {
      if ((this.items[i].type == "branch" || this.items[i].type == "pr") && model.header.repo_names.includes(this.items[i].repo_name))
        this.items.splice(i, 1);
    }
    for (let item of model.items)
      if (item.type == "branch" || item.type == "pr")
        this.items.push(item);
    this.reindex();
  }

  reindex() {
    this.#index = {};
    for (let item of this.items)
      this.#index[item.uid] = item;
  }

  addLastItemLabel(name, color) {
    this.items[this.items.length - 1].labels.push({ name: name, color: color });
  }
}

export { Model };

