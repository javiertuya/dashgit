import assert from 'assert';
import { login } from "../app/Login.js"

const oaconfig = {
    GitHub: {
        github: { clientId: "client", scopes: "repo read:user notifications", },
        github2: { clientId: "client2", scopes: "repo notifications", },
        github3: { clientId: "client3", scopes: "repo notifications", },
    },
    //GitLab: {
    //    gitlab1: { clientId: "clientgl", scopes: "read_api", },
    //},
}

describe("TestOAConfig - Creating cofigurations por OAuth", async function () {
    it("Get GitHub valid default configurations with/without custom data", function () {
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path", 
            oaconfig, {}), {
            appName: 'github', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path?oapp=github',
            clientId: 'client', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo read:user notifications'
        });
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path", 
            oaconfig, {enabled:false}), {
            appName: 'github', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path?oapp=github',
            clientId: 'client', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo read:user notifications'
        });
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path", 
            oaconfig, {enabled:true}), {
            appName: 'github', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path?oapp=github',
            clientId: 'client', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo read:user notifications'
        });
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path", 
            oaconfig, {enabled:false, appName: "aaa", clientName:"ccc" }), {
            appName: 'github', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path?oapp=github',
            clientId: 'client', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo read:user notifications'
        });
    });
    it("Get GitHub valid custom configurations with/without custom data", function () {
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path/", 
            oaconfig, {enabled:true, appName: "github3"}), {
            appName: 'github3', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path/?oapp=github3',
            clientId: 'client3', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo notifications'
        });        
        
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path", 
            oaconfig, {enabled:true, clientId: "otherclient"}), {
            appName: 'github', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path?oapp=github',
            clientId: 'otherclient', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo read:user notifications'
        });

    });

    it("Get empty configuration if it does not exist in OAConfig.js", function () {
        assert.deepEqual(login.getOAuthAppConfig("XXXX", "https://github.com", "https://domain/path", oaconfig, {}), {});
        assert.deepEqual(login.getOAuthAppConfig("XXXX", "https://github.com", "https://domain/path", oaconfig, {enabled:false}), {});
        assert.deepEqual(login.getOAuthAppConfig("GitHub", "https://github.com", "https://domain/path/", oaconfig, {enabled:true, appName: "yyyy"}), {});
    });

});
