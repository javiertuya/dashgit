import { config } from "./Config.js"
import { login } from "./Login.js"
import { wiView } from "./WiView.js"
import { wiController } from "./WiController.js"
import { wiControllerUpdate } from "./WiControllerUpdate.js" // NOSONAR to install jquery events
import { wiControllerFollowUp } from "./WiControllerFollowUp.js" // NOSONAR to install jquery events
import { configController } from "./ConfigController.js"

/**
 * Manages the top level elements visibility and actions (header and tabs).
 * Enters sequentially in one of three modes (that acctivate/deactivate elements in the UI depending on the authentication for configuration.
 * - patLoginMode: a simpler view to set the password before entering de application, used when the access tokens are encrypted with a password
 * - oauthLoginMode: to control the authentication of providers that require OAuth2 login and view the progress.
 *   If there is a provider that needs login, it calls the Login module, which will call the auth module to complete the login process.
 *   The callback of the login process will cause entering again in this module to login the next provider
 * - workMode: the main mode, with all elements visible. Performs the initial rendering of all work items.
 * 
 * The main page also acts as the OAuth2 callback page when it receives a querystring parameter (oapp)
 */

//In patLoginMode mode, enter and validate password
$(document).on('click', '#inputPasswordButton', function (e) {
  if ($('#inputPassword').val().length > 0) {
    const secret = $("#inputPassword").val();
    if (login.isValidPassword(config.data.providers, secret)) {
      login.setPatSecret(secret);
      indexController.start();
    } else {
      $('#inputPassword')[0].setCustomValidity("Password does not match with the one used to encrypt the access tokens");
      $('#inputPassword')[0].reportValidity();
    }
  } else {
    $('#inputPassword')[0].setCustomValidity("Enter you password");
    $('#inputPassword')[0].reportValidity();
  }
  $(this).closest("form")[0].reset();
  e.preventDefault()
});

$(document).on('click', '#inputSkipButton', function (e) {
  indexController.start();
  $(this).closest("form")[0].reset();
  e.preventDefault()
});

// click on a tab to change view
$('button[data-bs-toggle="tab"]').on('shown.bs.tab', async function (e) {
  const target = $(this).attr("aria-controls");
  indexController.tabControlEntering(target);
});

$(document).on('click', '#reloadIcon', async function () {
  indexController.reload();
});
$(document).on('change', '#inputSort', async function () {
  indexController.render();
});
$(document).on('change', '#checkGroup', async function () {
  indexController.render();
});
$(document).on('change', '#inputStatus', async function () {
  wiView.updateStatusVisibility();
});
$(document).on('click', '#oauth-reset-btn', async function () {
  login.retryOAuth();
});
$(document).on('click', '.accordion-button', function () {
  wiView.saveStatePanel($(this).attr('id'), $(this).attr('aria-expanded'))
});
// Generic view header to perform additional filtering, 
// included here instead of wiController because behaviour is common for several views and causes rendering
$(document).on('change', '.wi-view-filter-clickable', async function () {
  wiView.saveViewFilterState();
  indexController.render();
});
// Generic view header to perform additional filtering with text input (search, exclude)
// Changes update the view dynamically without renderiing again
$(document).on('keyup', '.wi-view-filter-input', async function () { // on typing
  wiView.updateStatusVisibility();
  wiView.saveViewFilterState();
});
$(document).on('search', '.wi-view-filter-input', async function () { // clearing the input with the cross button
  wiView.updateStatusVisibility();
  wiView.saveViewFilterState();
});

const LAST_TAB = "dashgit-config-last-selected-tab"; // Store: last selected tab in the UI
const indexController = {

  // Main entry point invoked from index.html
  load: async function() {
    // Main page has been invoked as a callback of the OAuth2 login process
    const params = new URLSearchParams(window.location.search);
    const app = params.get("oapp")
    if (app) {
      console.log("IndexController: App parameter found in url, running as callback to login " + app);
      indexController.oauthLoginMode(); // to show how the callback process is going on
      await login.handleCallbackFromApp(app);
      return;
    }

    // Start normal flow 
    config.loadFeatureFlags();
    config.load();

    $("#appVersion").text(config.appVersion);
    if (config.data.encrypted && login.getPatSecret() == "") { 
      // A simpler view to set the password before entering the application
      indexController.patLoginMode();
      return;
    }

    // Checks all unset providers that require OAuth, if there are any, starts the OAuth login of the first one.
    // The rest will be started after receiving the callback.
    // Ignore if the feature flag 'disableoa' is enabled to have the posibility to enter into the configuration tab to correct wrong configs
    const loginResult = await login.getLoginStatusForAllProviders(config.ff["disableoa"]);
    if (loginResult.unsetProviders.length > 0 && !config.ff["disableoa"]) {
      indexController.oauthLoginMode(); // to show how the login process is going on
      await login.startLoginForProvider(loginResult.unsetProviders[0]);
      return;
    }

    //Login procedure is finished, starts everything in work mode
    indexController.start();

    // The view is rendered, now we can finishsh some pending chores related to the login process
    if (loginResult.failedProviders.length > 0 && !config.ff["disableoa"]) {
      const uids = loginResult.failedProviders.map(a => a.uid);
      console.log("Login.js: The following OAuth2 providers failed to log in: " + uids.join(", "));
      $("#oauth-reset-message").text( `OAuth2 authentication failed for the provider(s) ${uids.join(", ")}. `
        + " Please check the configuration or switch back to PAT authentication and retry.");
      $("#oauth-reset").show();
    } else {
      $("#oauth-reset-message").text("");
      $("#oauth-reset").hide();
    }
    $('[data-toggle="tooltip"]').tooltip({trigger:"hover", delay:600});
  },

  start: function() {
    wiController.reset(true);
    indexController.workMode();
    indexController.tabControlSelectLastOrDefault("assigned");
    // Do not need render because the entry event in the target tab already does it
  },
  reload: function() {
    wiController.reset(false);
    indexController.render();
  },

  // Entering event executes when tab changes, either by user click or programmatically
  // Stores in the tab name in session to allow restoring it after a reload, and performs the rendering of the target tab
  tabControlEntering: function (target) {
    console.log("*** Entering tab " + target);
    const lastTarget = sessionStorage.getItem(LAST_TAB);
    // Target is rendered with one exception: when last selected tab is config, we need to update everything because
    // the configuration may have changed authentication or provider settings.
    if (lastTarget == "config" && target != "config") {
      sessionStorage.setItem(LAST_TAB, target); // to reload the target tab, not the last target
      window.location.reload();
    } else {
      indexController.render();
    }
    sessionStorage.setItem(LAST_TAB, target);
  },
  // Select a tab programmatically, this triggers tabControlEntering
  tabControlSelect: async function (target) {
    console.log("*** Selecting tab " + target);
    const bsTab = new bootstrap.Tab("#" + target + "-tab");
    bsTab.show()
  },
  // if there is a lastTarget stored, select it, otherwise select the default target
  tabControlSelectLastOrDefault: async function (defaultTarget) {
    const lastTarget = sessionStorage.getItem(LAST_TAB);
    console.log("*** Selecting last tab, default " + defaultTarget + " last target " + lastTarget);
    this.tabControlSelect(lastTarget || defaultTarget);
  },

  //Rendering depends on the selected tab, calls the appropriate controller to update the UI
  render: function () {
    wiView.resetAlerts();
    if (config.appUpdateEvent())
      wiView.renderAlert("info", `Dashgit version has been updated to ${config.appVersion}. See the release notes at <a target="_blank" href="https://github.com/javiertuya/dashgit/releases">https://github.com/javiertuya/dashgit/releases</a>`);

    let target = $(".nav-link.active").attr("aria-controls");
    if (target == "config")
      configController.updateMainTarget();
    else
      wiController.updateTarget(target, $("#inputSort").val()); //display work items for the indicated target, with sort criterion
  },

  clearMode: function () {
    $("#header-content").hide();
    $("#header-authentication").hide();
    $("#inputPassword").hide();
    $("#oauth-reset").hide();
    $("#oauth-content").hide();
    $("#tab-headers").hide();
    $("#tab-content").hide();
  },
  workMode: function () {
    this.clearMode();
    $("#header-content").show();
    $("#tab-headers").show();
    $("#tab-content").show();
  },
  patLoginMode: function () {
    this.clearMode();
    $("#header-authentication").show();
    $("#inputPassword").show();
    $("#inputPassword").focus();
  },
  oauthLoginMode: function () {
    this.clearMode();
    $("#oauth-content").show();
  },

}
export { indexController };
