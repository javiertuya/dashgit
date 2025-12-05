//General notes:
//To execute from mocha under node, but source is ES6,
//requires to specify "type": "module" in package.json (both in tests and application)

//To execute from mocha in the browser, import js mocha and chai from node_modules
//and use chai.assert.* instead of assert.* (define a script in the html: let assert=chai.assert)
//Comment the 'assert' import as the imports are not modules

//Use mochawesome reporter that captures the detailed diffs when assert.deepEqual (same info than console)

import assert from 'assert';
import { config } from "../app/Config.js"
import { cache } from "../app/Cache.js"

describe("TestConfig - Sanitizing config data", async function () {

    it("Set default config attributes when reading empty", function () {
        let expected = { version: 2, encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 30, maxAge: 0, 
            viewFilter: { 
                involved: {authorMe: true, authorOthers: true, exclude: ""},
                created: {exclude: ""},
                unassigned: {authorMe: true, authorOthers: true},
                statuses: {compact: false, exclude: ""},
                dependabot: {exclude: ""},
            },      
            appLastVersion: "", 
            enableManagerRepo: false, managerRepoName: "", managerRepoToken: "",
            providers: [] };
        assert.deepEqual(expected, config.parseAndSanitizeData(""));
        assert.deepEqual(expected, config.parseAndSanitizeData(null));
        assert.deepEqual(expected, config.parseAndSanitizeData(undefined));
    });

    it("Set default config attributes to GitHub provider", function () {
        let expected = {
            version: 2,
            appLastVersion: "",
            encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 60, maxAge: 0,
            viewFilter: { 
                involved: {authorMe: true, authorOthers: true, exclude: ""},
                created: {exclude: ""},
                unassigned: {authorMe: true, authorOthers: true},
                statuses: {compact: false, exclude: ""},
                dependabot: {exclude: ""},
            },
            enableManagerRepo: false, managerRepoName: "", managerRepoToken: "",
            providers: [{
                provider: 'GitHub', uid: '', user: '', token: '', enabled: true,
                url: 'https://github.com', api: 'https://api.github.com',
                enableNotifications: true,
                statusSurrogateUser: "",
                filterIfLabel: '', unassignedAdditionalOwner: [], dependabotAdditionalOwner: [],
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
            version: 2,
            appLastVersion: "",
            encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 30, maxAge: 0,
            viewFilter: { 
                involved: {authorMe: true, authorOthers: true, exclude: ""},
                created: {exclude: ""},
                unassigned: {authorMe: true, authorOthers: true},
                statuses: {compact: false, exclude: ""},
                dependabot: {exclude: ""},
            },      
            enableManagerRepo: false, managerRepoName: "", managerRepoToken: "",
            providers: [{
                provider: 'GitHub', uid: 'repo_user_id', user: 'user', token: 'XXXXXXXXXXXX', enabled: false,
                url: 'https://github.com', api: 'https://api.github.com',
                enableNotifications: true,
                statusSurrogateUser: "",
                filterIfLabel: 'lbl', unassignedAdditionalOwner: [], dependabotAdditionalOwner: ["org1", "org2"],
                updates: { tokenSecret: "DASHGIT_GITHUB_USER_TOKEN", userEmail: "" },
                graphql: { "includeForks": false, "onlyForks": false, deprecatedGraphqlV1: false, 
                    ownerAffiliations: ['OWNER', 'ORGANIZATION_MEMBER'], 
                    userSpecRepos: "", maxProjects: 10, maxBranches: 20, pageSize: 10
                }
            }]
        };
        assert.deepEqual(expected, config.parseAndSanitizeData(JSON.stringify(expected)));
    });

    // - surrogate match before/after surrogated
    // - surrogate does not match because (no surrogate configured, user, url, surrogate disabled, surrogated disabled)
    // - multiple potential surrogated (two/only one enabled)
    // - multiple surrogated
    it("Find effective provider status surrogates as configured by cache", function () {
        let providers = getSurrogates();
        assert.deepEqual({}, cache.getEnabledSurrogates(providers)); // baseline: no surrogate configured
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        assert.deepEqual({ "2-github": "0-github" }, cache.getEnabledSurrogates(providers)); // match before surrogated
        providers = getSurrogates();
        providers[0].statusSurrogateUser = "gh3";
        assert.deepEqual({ "0-github": "2-github" }, cache.getEnabledSurrogates(providers)); // match, after surrogated

        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh4";
        assert.deepEqual({}, cache.getEnabledSurrogates(providers)); // no match because: user
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[0].url = "http://other.com";
        assert.deepEqual({}, cache.getEnabledSurrogates(providers)); // no match because: url
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[0].enabled = false;
        assert.deepEqual({}, cache.getEnabledSurrogates(providers)); // no match because: surrogate disabled
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[2].enabled = false;
        assert.deepEqual({}, cache.getEnabledSurrogates(providers)); // no match because: surrogated disabled

        providers = getSurrogates();
        providers[1].user = "gh1";
        providers[2].statusSurrogateUser = "gh1";
        assert.deepEqual({ "2-github": "0-github" }, cache.getEnabledSurrogates(providers)); // multiple candidates
        providers = getSurrogates();
        providers[0].enabled = false;
        providers[1].user = "gh1";
        providers[2].statusSurrogateUser = "gh1";
        assert.deepEqual({ "2-github": "1-github" }, cache.getEnabledSurrogates(providers)); // multiple candidates, one disabled
        providers = getSurrogates();
        providers[2].statusSurrogateUser = "gh1";
        providers[3].statusSurrogateUser = "gl2";
        assert.deepEqual({ "2-github": "0-github", "3-gitlab": "4-gitlab" }, cache.getEnabledSurrogates(providers)); // multiple surrogated
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