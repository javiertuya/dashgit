import { wiController } from "../WiController.js"
import { login } from "../login/Login.js"

/**
 * Core interface with the provider api (GitLab). See doc at Controller.js
 * Al services and return a provider-independent model (using an adapter) to show in the UI.
 * See doc at Controller.js
 */
const gitLabGraphql = {

  callGraphqlApi: async function (provider, query, displayErrors) {
    //https://www.ansango.com/blog/javascript/ajax-async-await
    let result = await $.ajax({
      url: `${provider.url}/api/graphql`,
      type: 'post',
      data: { query },
      headers: { Authorization: `Bearer ${login.getProviderToken(provider)}` },
      dataType: 'json',
    });
    if (result.errors != undefined) {
      console.error("GitLab GraphQL api call failed");
      console.error(result);
      if (displayErrors)
        for (let error of result.errors)
          wiController.displayError("GitLab GraphQL api call failed. Message: " + error.message);
      return {};
    }
    return result;
  },

  //La consulta de todas las ramas de los proyectos es muy rapida, por lo que primero se obtendran estas
  //y luego se iran completando con los statuses de las pipelines (que eliminara las que ya no tienen rama)
  //y finalmente las merge requests
  //Si se pone junto en una query aumenta mucho la complejidad y puede fallar la query
  getProjectsQuery: function (provider, maxProjects, includeAll) {
    return `{
      projects (first:${maxProjects}, sort: "updated_desc") {
        nodes {
          id, archived, name, fullPath, createdAt, lastActivityAt, webUrl
          ${includeAll ? "," + this.getProjectsReposSubquery(provider) : ""}
        }
      }
    }`;
  },
  getProjectsReposSubquery: function (provider) {
    return `repository { branchNames(searchPattern:"*", offset:0, limit:${provider.graphql.maxBranches}) }`
  },
  getStatusesQuery: function (provider, selectCriterion) {
    //repository {branchNames(searchPattern:"*", offset:0, limit:10)}
    //aumenta la complejidad y falla, pero se podrian buscar las ramas por separado a los proyectos
    return `{
      projects (${selectCriterion}, sort: "updated_desc") {
        nodes {
          id, fullPath, lastActivityAt, webUrl,
          pipelines(first:${provider.graphql.maxPipelines}){
            nodes{
              id, startedAt, finishedAt, refPath, status
            }
          }
          mergeRequests (state: opened) {
            nodes{
              iid, webUrl, sourceBranch, title
            }
          }
        }
      }
    }`;
  },
  getLabelsQuery: function (selectCriterion) {
    return `{
      projects (${selectCriterion}, sort: "updated_desc") {
        nodes {
          id, name, fullPath, lastActivityAt, webUrl,
          labels(includeAncestorGroups:true) {
            nodes { 
              color, title
            }
          }
        }
      }
    }`;
  },

}
export { gitLabGraphql };



