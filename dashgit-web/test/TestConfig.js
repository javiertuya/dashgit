//General notes:
//To execute from mocha under node, but source is ES6,
//requires to specify "type": "module" in package.json (both in tests and application)

//To execute from mocha in the browser, import js mocha and chai from node_modules
//and use chai.assert.* instead of assert.* (define a script in the html: let assert=chai.assert)
//Comment the 'assert' import as the imports are not modules

//Use mochawesome reporter that captures the detailed diffs when assert.deepEqual (same info than console)

import assert from 'assert';
import { config } from "../app/core/Config.js"
import { surrogates } from "../app/core/Surrogates.js"
import { tokens } from "../app/login/Tokens.js"
import { login } from "../app/login/Login.js"

describe("TestConfig", async function () {
  describe("Sanitize configuration data", async function () {

    it("Set default config attributes when reading empty", function () {
        let expected = { version: 3, encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 30, maxAge: 0, 
            viewFilter: { 
                main: {status:"111111", sort: "descending,updated_at", search: "", group: false},
                involved: {authorMe: true, authorOthers: true, exclude: ""},
                created: {exclude: ""},
                unassigned: {authorMe: true, authorOthers: true},
                statuses: {compact: false, exclude: ""},
                dependabot: {assignedMe: true, assignedOthers: true, assignedNone: true, exclude: ""},
            },      
            appLastVersion: "", 
            autoSurrogates: true,
            managerRepo: { enabled: false, name: "", token: "", oauth: false, oacustom: { enabled: false, clientId: '', tokenUrl: '' } },
            providers: [] };
        assert.deepEqual(expected, config.parseAndSanitizeData(""));
        assert.deepEqual(expected, config.parseAndSanitizeData(null));
        assert.deepEqual(expected, config.parseAndSanitizeData(undefined));
    });

    it("Set default config attributes to GitHub provider", function () {
        let expected = {
            version: 3,
            appLastVersion: "",
            encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 60, maxAge: 0,
            viewFilter: { 
                main: {status:"111111", sort: "descending,updated_at", search: "", group: false},
                involved: {authorMe: true, authorOthers: true, exclude: ""},
                created: {exclude: ""},
                unassigned: {authorMe: true, authorOthers: true},
                statuses: {compact: false, exclude: ""},
                dependabot: {assignedMe: true, assignedOthers: true, assignedNone: true, exclude: ""},
            },
            autoSurrogates: true,
            managerRepo: { enabled: false, name: "", token: "", oauth: false, oacustom: { enabled: false, clientId: '', tokenUrl: '' } },
            providers: [{
                provider: 'GitHub', uid: '0-github', user: '', token: '', enabled: true,
                oauth: false, oacustom: { enabled: false, clientId: '', tokenUrl: '' },
                url: 'https://github.com', api: 'https://api.github.com',
                enableNotifications: true,
                statusSurrogateUser: "",
                filterIfLabel: '', unassignedAdditionalOwner: [], dependabotAdditionalOwner: [],
                match: { criterion: 'exclude', user: [], org: [] },
                updates: { tokenSecret: "", userEmail: "" },
                graphql: { "includeForks": false, "onlyForks": false, deprecatedGraphqlV1: false, 
                    ownerAffiliations: ['OWNER'], 
                    userSpecRepos: "", maxProjects: 20, maxBranches: 10, pageSize: 10 
                }
            }]
        };
        assert.deepEqual(expected, config.parseAndSanitizeData(`{ "statusCacheUpdateTime": 60, "providers": [{"provider":"GitHub"}] }`));
    });

    it("No attributes are overriden by defaults if already set", function () {
        let expected = {
            version: 3,
            appLastVersion: "",
            encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 30, maxAge: 0,
            viewFilter: { 
                main: {status:"111111", sort: "descending,updated_at", search: "", group: false},
                involved: {authorMe: true, authorOthers: true, exclude: ""},
                created: {exclude: ""},
                unassigned: {authorMe: true, authorOthers: true},
                statuses: {compact: false, exclude: ""},
                dependabot: {assignedMe: true, assignedOthers: true, assignedNone: true, exclude: ""},
            },      
            autoSurrogates: true,
            managerRepo: { enabled: false, name: "", token: "", oauth: false, oacustom: { enabled: false, clientId: '', tokenUrl: '' } },
            providers: [{
                provider: 'GitHub', uid: '0-github', user: 'user', token: 'XXXXXXXXXXXX', enabled: false,
                oauth: false, oacustom: { enabled: false, clientId: '', tokenUrl: '' },
                url: 'https://github.com', api: 'https://api.github.com',
                enableNotifications: true,
                statusSurrogateUser: "",
                filterIfLabel: 'lbl', unassignedAdditionalOwner: [], dependabotAdditionalOwner: ["org1", "org2"],
                match: { criterion: 'exclude', user: [], org: [] },
                updates: { tokenSecret: "DASHGIT_GITHUB_USER_TOKEN", userEmail: "" },
                graphql: { "includeForks": false, "onlyForks": false, deprecatedGraphqlV1: false, 
                    ownerAffiliations: ['OWNER', 'ORGANIZATION_MEMBER'], 
                    userSpecRepos: "", maxProjects: 10, maxBranches: 20, pageSize: 10
                }
            }]
        };
        assert.deepEqual(expected, config.parseAndSanitizeData(JSON.stringify(expected)));
    });
  });

  describe("Surrogates - Manual configuration", async function () {
    // - surrogate match before/after origin
    // - surrogate does not match because (no surrogate configured, user, url, surrogate disabled, origin disabled)
    // - multiple potential origins (two/only one enabled)
    // - multiple origins
    it("Main: Finding surrogates", function () {
        let providers = getSurrogates();
        assert.deepEqual({}, surrogates.init(providers)); // baseline: no surrogate configured
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        assert.deepEqual({ "2-github": "0-github" }, surrogates.init(providers)); // match before origin
        providers = getSurrogates();
        providers[0].statusSurrogateUser = "gh3";
        assert.deepEqual({ "0-github": "2-github" }, surrogates.init(providers)); // match, after origin
    });
    it("Can not find surrogates", function () {
        let providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh4";
        assert.deepEqual({}, surrogates.init(providers)); // no match because: user
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[0].url = "http://other.com";
        assert.deepEqual({}, surrogates.init(providers)); // no match because: url
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[0].enabled = false;
        assert.deepEqual({}, surrogates.init(providers)); // no match because: surrogate disabled
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[2].enabled = false;
        assert.deepEqual({}, surrogates.init(providers)); // no match because: origin disabled
    });
    it("Multiple surrogate candidates", function () {
        let providers = getSurrogates();
        providers[1].user = "gh1";
        providers[2].statusSurrogateUser = "gh1";
        assert.deepEqual({ "2-github": "0-github" }, surrogates.init(providers)); // multiple candidates
        providers = getSurrogates();
        providers[0].enabled = false;
        providers[1].user = "gh1";
        providers[2].statusSurrogateUser = "gh1";
        assert.deepEqual({ "2-github": "1-github" }, surrogates.init(providers)); // multiple candidates, one disabled
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[3].statusSurrogateUser = "gl2";
        assert.deepEqual({ "2-github": "0-github", "3-gitlab": "4-gitlab" }, surrogates.init(providers)); // multiple origin
    });
    function getSurrogates() {
        return [
            { provider: 'GitHub', user: 'gh1', statusSurrogateUser: "", uid: '0-github', enabled: true, url: 'https://github.com' },
            { provider: 'GitHub', user: 'gh2', statusSurrogateUser: "", uid: '1-github', enabled: true, url: 'https://github.com' },
            { provider: 'GitHub', user: 'gh3', statusSurrogateUser: "", uid: '2-github', enabled: true, url: 'https://github.com' },
            { provider: 'GitLab', user: 'gl1', statusSurrogateUser: "", uid: '3-gitlab', enabled: true, url: 'https://gitlab.com' },
            { provider: 'GitLab', user: 'gl2', statusSurrogateUser: "", uid: '4-gitlab', enabled: true, url: 'https://gitlab.com' },
        ];
    };
  });

  describe("Surrogates - Automatic configuration", async function () {
    it("PAT surrogates matching", function () {
        // - match: multiple origins, multiple surrogates, username does not have influence
        let providers = getPatProviders(); // base all match
        assert.deepEqual({ "2-github": "0-github", "4-github": "0-github",  "3-gitlab": "1-gitlab"}, tokens.getPatSurrogates(providers));

        // - no match: an origin still exist, all origins dissapear
        providers = getPatProviders();
        providers[2].token = "token2"; // keep other origin
        providers[3].token = "token3"; // no origins
        assert.deepEqual({ "4-github": "0-github" }, tokens.getPatSurrogates(providers)); // baseline: none match

        // - disabled provider ignored: keep/do not keep one origin
        providers = getPatProviders();
        providers[2].enabled = false; // disabled one origin out of 2 is ignored
        providers[3].enabled = false; // disabled only origin is ingored
        assert.deepEqual({ "4-github": "0-github"}, tokens.getPatSurrogates(providers));
    });
    function getPatProviders() { // baseline, all match
        return [
            { provider: 'GitHub', user: 'gh1', uid: '0-github', oauth: false, token: 'token0', enabled: true, url: 'https://github.com' },
            { provider: 'GitLab', user: 'gl1', uid: '1-gitlab', oauth: false, token: 'token1', enabled: true, url: 'https://gitlab.com' },
            { provider: 'GitHub', user: 'gh2', uid: '2-github', oauth: false, token: 'token0', enabled: true, url: 'https://github.com' },
            { provider: 'GitLab', user: 'gl2', uid: '3-gitlab', oauth: false, token: 'token1', enabled: true, url: 'https://gitlab.com' },
            { provider: 'GitHub', user: 'gh3', uid: '4-github', oauth: false, token: 'token0', enabled: true, url: 'https://github.com' },
        ];
    }

    it("OAuth surrogates matching", function () {
        // - match: multiple origins, multiple surrogates, with custom config, username and token does not have influence
        let providers = getOAProviders(); // base all match
        providers[1]["oacustom"] = { enabled: true, clientId: "xxxxxx"};
        providers[3]["oacustom"] = { enabled: true, clientId: "xxxxxx"};
        providers[2].token = "xyz";
        assert.deepEqual({ "2-github": "0-github", "4-github": "0-github",  "3-gitlab": "1-gitlab"}, login.getOAuthSurrogates(providers));

        // - no match because provider, url same provider, custom client Id, custom token Url
        providers = getOAProviders();
        providers[3].url = "https://my.gitlab.com"; // no match url same provider
        providers[2]["oacustom"] = { enabled: true, clientId: "xxxxxx"}; // no match custom client Id
        assert.deepEqual({ "4-github": "0-github"}, login.getOAuthSurrogates(providers));

        // - no match because custom token Url, still matches if custom config is disabled
        providers = getOAProviders();
        providers[2]["oacustom"] = { enabled: true, tokenUrl: "https://token.url"}; // no match custom client Id
        providers[3]["oacustom"] = { enabled: false, clientId: "xxxxxx", tokenUrl: "https://token.url"}; // match custom config disabled
        assert.deepEqual({ "3-gitlab": "1-gitlab", "4-github": "0-github"}, login.getOAuthSurrogates(providers));

        // - disabled provider ignored: keep/do not keep one origin
        providers = getOAProviders();
        providers[2].enabled = false; // disabled one origin out of 2 is ignored
        providers[3].enabled = false; // disabled only origin is ingored
        assert.deepEqual({ "4-github": "0-github"}, login.getOAuthSurrogates(providers));
    });

    it("Mixed OAuth and PAT surrogates (from surrogates module)", function () {
        // - match: by PAT, by OAuth
        // - no match: mixed identification in provider
        let providers = getOAProviders(); // base match by OAuth
        providers[1].token = "xyz"; providers[1].oauth = false;
        providers[3].token = "xyz"; providers[3].oauth = false; // match by path
        providers[2].token = "abc"; providers[2].oauth = false; // mixed identification
        // Using the login module requires setting up the global config data
        config.data.providers = providers;
        config.data.managerRepo = { enabled: false };
        assert.deepEqual({ "4-github": "0-github",  "3-gitlab": "1-gitlab"}, surrogates.getSurrogates(config.data.providers));
    });

    it("Manager Repo in OAuth surrogates but not in PAT (from surrogates module)", function () {
        // - manager repo from OAuth, becomes origin
        let providers = getOAProviders();
        config.data.providers = providers;
        config.data.managerRepo = { uid: login.MANAGER_REPO_UID, enabled: true, oauth: true };
        assert.deepEqual({ "2-github": "0-github", "4-github": "0-github", "3-gitlab": "1-gitlab", "manager-repo-github": "0-github"}, surrogates.getSurrogates(config.data.providers));

        // - manager repo from PAT, does not become origin
        providers = getOAProviders();
        config.data.providers = providers;
        config.data.managerRepo = { uid: login.MANAGER_REPO_UID, enabled: true, oauth: false };
        assert.deepEqual({ "2-github": "0-github", "4-github": "0-github", "3-gitlab": "1-gitlab"}, surrogates.getSurrogates(config.data.providers));
    });

    function getOAProviders() {
        return [
            { provider: 'GitHub', user: 'gh1', uid: '0-github', token: '', oauth: true, enabled: true, url: 'https://github.com' },
            { provider: 'GitLab', user: 'gl1', uid: '1-gitlab', token: '', oauth: true, enabled: true, url: 'https://gitlab.com' },
            { provider: 'GitHub', user: 'gh2', uid: '2-github', token: '', oauth: true, enabled: true, url: 'https://github.com' },
            { provider: 'GitLab', user: 'gl2', uid: '3-gitlab', token: '', oauth: true, enabled: true, url: 'https://gitlab.com' },
            { provider: 'GitHub', user: 'gh3', uid: '4-github', token: '', oauth: true, enabled: true, url: 'https://github.com' },
        ];
    }

  });

});