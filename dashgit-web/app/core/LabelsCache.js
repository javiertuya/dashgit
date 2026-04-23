/**
 * Stores label info (colors) of GitLab labels because this is not obtained in the request for issues or MRs.
 * Structure of cached data: { provider: { repoName-title: { label-obj} }
 */
const labelsCache = {
  data: {},
  reset: function () {
    this.data = {};
  },
  setLabels: function (provider, labels) {
    if (this.data[provider] == undefined)
      this.data[provider] = {};
    this.data[provider] = labels;
  }

}

export { labelsCache };
