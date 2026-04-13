import assert from 'assert';
import { login } from "../app/Login.js"

const oaconfig = {
    GitHub: {
        github1: { clientId: "client1", scopes: "repo:read read:user notifications", },
        github2: { clientId: "client2", scopes: "repo:read notifications", },
        github3: { clientId: "client3", scopes: "repo notifications", },
    },
    //GitLab: {
    //    gitlab1: { clientId: "clientgl", scopes: "read_api", },
    //},
}

describe("TestOAConfig - Creating cofigurations por OAuth", async function () {
    it("Get GitHub valid configurations", function () {
        assert.deepEqual(login.getOAuthAppConfig(oaconfig, "GitHub", "github1", "https://domain/path"), {
            appName: 'github1', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path?oapp=github1',
            clientId: 'client1', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo:read read:user notifications'
        });
        assert.deepEqual(login.getOAuthAppConfig(oaconfig, "GitHub", "github3", "https://domain/path/"), {
            appName: 'github3', authorizeUrl: 'https://github.com/login/oauth/authorize', callbackUrl: 'https://domain/path/?oapp=github3',
            clientId: 'client3', exchangeUrl: 'https://giis.uniovi.es/desarrollo/oauth/exchange', scopes: 'repo notifications'
        });
    });

    it("Get empty configuration does not exist", function () {
        assert.deepEqual(login.getOAuthAppConfig(oaconfig, "XXXX", "github1", "https://domain/path"), {});
        assert.deepEqual(login.getOAuthAppConfig(oaconfig, "GitHub", "xxxx", "https://domain/path/"), {});
    });

});
