import assert from 'assert';
import { login } from "../app/Login.js"

// TODO Temporal, this configuration will change and test revised to include config validation
const oadefaults = {
  GitHub: {
    github: { clientId: "gh-client-id", scopes: "repo notifications",
      authorizePath: "/login/oauth/authorize", tokenUrl: "https://gh.proxy/exchange",
    },
  },
  GitLab: {
    gitlab: {
      clientId: "gl-client-id", scopes: "read_api",
      authorizePath: "/oauth/authorize", tokenUrl: "https://gl.proxy/exchange",
    },
  },
}

const baseGitHubConfig = {
            appName: 'github', callbackUrl: 'https://domain/dashgit?oapp=github', authorizeUrl: 'https://github.com/login/oauth/authorize',
            clientId: 'gh-client-id', scopes: 'repo notifications', tokenUrl: 'https://gh.proxy/exchange'
        }

describe("TestOAConfig - Creating default configurations", async function () {
    it("GitHub valid default configuration", function () {
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, {enabled: false}), 
            baseGitHubConfig
        );
    });
    it("GitLab valid default configuration, my url with trailing slash", function () {
        assert.deepEqual(login.getOAuthAppConfig("gitlab", "GitLab", "https://my.gitlab.com", "https://domain/dashgit/", oadefaults, {enabled: false}),
            { appName: 'gitlab', callbackUrl: 'https://domain/dashgit/?oapp=gitlab', authorizeUrl: 'https://my.gitlab.com/oauth/authorize',
            clientId: 'gl-client-id', scopes: 'read_api', tokenUrl: 'https://gl.proxy/exchange' }
        );
    });
    it("Non existing configuration returns empty config", function () {
        assert.deepEqual(login.getOAuthAppConfig("notexist", "GitLab", "https://github.com", "https://domain/dashgit", oadefaults, {enabled: false}), 
            {}
        );
    });
});
describe("TestOAConfig - Creating default configurations with provider.oauth variants", async function () {
    it("Provider oauth empty", function () {
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, {}), 
            baseGitHubConfig
        );
    });
    it("Provider oauth undefined", function () {
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, undefined), 
            baseGitHubConfig
        );
    });
    it("Provider oauth disabled with custom values", function () {
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, {enabled:false, clientId: "XXX", tokenUrl: "YYY"}), 
            baseGitHubConfig
        );
    });
    it("Provider oauth enabled with empty custom values", function () {
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, {enabled:true, clientId: "", tokenUrl: ""}), 
            baseGitHubConfig
        );
    });
    it("Provider oauth enabled with undefined custom values", function () {
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, {enabled:true}), 
            baseGitHubConfig
        );
    });
});


describe("TestOAConfig - Creating custom configurations", async function () {
    it("Custom client id", function () {
        let oacustom = {enabled: true, clientId: "NEW-CLIENT-ID"};
        let expected =  structuredClone(baseGitHubConfig);
        expected.clientId = "NEW-CLIENT-ID";
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, oacustom), expected );
    });
    it("Custom token url", function () {
        let oacustom = {enabled: true, tokenUrl: "https://new.token.url"};
        let expected =  structuredClone(baseGitHubConfig);
        expected.tokenUrl = "https://new.token.url";
        assert.deepEqual(login.getOAuthAppConfig("github", "GitHub", "https://github.com", "https://domain/dashgit", oadefaults, oacustom), expected );
    });
});
