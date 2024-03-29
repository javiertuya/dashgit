/**
 * Transforms the contents of stored structured data to the provider-independent models
 */
const gitStoreAdapter = {

  followUp2model: function (provider, item) {
    return {
      repo_name: item.repo, type: item.type, iid: item.iid,
      title: decodeURIComponent(item.title), // to displaw appropriately in the work item list
      actions: { follow_up: true },
      author: "", assignees: "", created_at: item.remind, updated_at: item.remind,
      iidstr: this.getIidStr(provider, item.iid, item.type),
      url: this.getItemUrl(provider, item.repo, item.iid, item.type),
      repo_url: provider.url + "/" + item.repo,
      labels: []
    };
  },

  getIidStr: function (provider, iid, type) {
    if (provider.provider == "GitHub")
      return "#" + iid;
    else if (provider.provider == "GitLab")
      return (type == "pr" ? "!" : "#") + iid;
    return undefined;
  },

  getItemUrl: function (provider, repo, iid, type) {
    let url = provider.url + "/" + repo;
    if (provider.provider == "GitHub")
      return url + (type == "pr" ? "/pull/" : "/issues/") + iid;
    else if (provider.provider == "GitLab")
      return url + (type == "pr" ? "/-/merge_requests/" : "/-/issues/") + iid;
    return undefined;
  }

}

export { gitStoreAdapter }
