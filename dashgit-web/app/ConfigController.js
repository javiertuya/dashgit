import { config } from "./Config.js"
import { login } from "./Login.js"
import { wiController } from "./WiController.js"
import { wiView } from "./WiView.js"
import { configView } from "./ConfigView.js"
import { configValidation } from "./ConfigValidation.js"

/**
 * Manages the dialog at the config tab
 */

//Switch between nav links
$(document).on('click', '#config-providers', function (e) {
  configView.renderConfigData($(this), config.data);
});
$(document).on('click', '#config-import-export', function (e) {
  configView.renderImportExport($(this), config.data);
});
$(document).on('click', '#config-encrypt', function (e) {
  configView.renderEncrypt($(this), config.data.encrypted);
});
$(document).on('click', '#config-reset', function (e) {
  configView.renderDecrypt($(this), config.data.encrypted);
});

// actions on events
$(document).on('click', '.config-btn-add-github', function (e) {
  configView.addProvider(config.setProviderDefaults({ provider: "GitHub" }));
  configValidation.installValidation();
  //configView.refreshAll();
});
$(document).on('click', '.config-btn-add-gitlab', function (e) {
  configView.addProvider(config.setProviderDefaults({ provider: "GitLab" }));
  configValidation.installValidation();
  //configView.refreshAll();
});
$(document).on('click', '.config-btn-provider-remove', function (e) {
  configView.removeProvider($(this));
});
$(document).on('click', '.config-btn-provider-down', function (e) {
  configView.moveProvider($(this), +1);
});
$(document).on('click', '.config-btn-provider-up', function (e) {
  configView.moveProvider($(this), -1);
});

//Events that are particular to some items in the configuration
$(document).on('change', '#config-providers-enabled-mgrepo', function (e) {
  configView.refreshAll();
});
$(document).on('change', '[id^="config-providers-auth-select-"]', function (e) {
  configView.refreshAll();
  e.stopPropagation();
});
$(document).on('change', '[id^="config-providers-oauth-customize-"]', function (e) {
  configView.refreshAll();
  e.stopPropagation();
});
$(document).on('change', '[id^="config-providers-match-criterion-"]', function (e) {
  configValidation.validateMatchCriterion($(this)); // input validation changes according to the criterion
  e.stopPropagation();
});
$(document).on('change', '[id^="config-providers-surrogate-enabled-"]', function (e) {
  configView.refreshProviderSurrogate($(this), $(this).is(":checked"));
  e.stopPropagation();
});

// Only one of these checkboxes can be checked
$(document).on('change', '[id^="config-graphql-include-forks-"]', function (e) {
  configView.refreshGraphqlIncludeForks(this, $(this).is(':checked'));
  e.stopPropagation();
});
$(document).on('change', '[id^="config-graphql-only-forks-"]', function (e) {
  configView.refreshGraphqlOnlyForks(this, $(this).is(':checked'));
  e.stopPropagation();
});

// Data update events

$(document).on('click', '.config-btn-provider-submit', function (e) {
  if ($(".config-form")[0].checkValidity()) {
    console.log("Saving config data");
    configController.saveData();
    configController.afterSaveData();
    e.preventDefault();
    //e.stopPropagation();
  } else {
    console.log("Can not save this configuration due to validation issues");
    configController.displayToast("Can not save this configuration due to validation issues", true);
  }
});

$(document).on('click', '#inputEncryptButton', function (e) {
  if ($('#inputEncryptPassword').val().length > 0) {
    config.data.encrypted = true;
    // encryption of config.data is managed at the login module
    const secret = $("#inputEncryptPassword").val();
    login.setPatSecret(secret);
    login.encryptConfigTokens();
    config.save();
    $(this).closest("form")[0].reset();
    e.preventDefault()
    configController.updateMainTarget();
  } else {
    $('#inputEncryptPassword')[0].setCustomValidity("Please, enter a password to encrypt the token");
    $('#inputEncryptPassword')[0].reportValidity();
    $(this).closest("form")[0].reset();
    e.preventDefault()
  }
});

$(document).on('click', '#inputDecryptButton', function (e) {
  for (let provider of config.data.providers)
    provider.token = "";
  config.data.managerRepo.token = ""; // manager repo
  config.data.encrypted = false;
  login.setPatSecret("");
  config.save();
  configController.updateMainTarget();
  e.preventDefault();
});

$(document).on('click', '#buttonConfigSave', function (e) {
  console.log("Save config json");
  try {
    login.updateConfigFromString($("#configJson").val());
    configController.afterSaveData();
  } catch (error) {
    wiView.renderAlert("danger", error);
  }
  e.preventDefault();
});

const configController = {
  //setup config view, goes to provider configuration by default
  updateMainTarget: function () {
    configView.renderHeader();
    configView.renderConfigData($("#config-providers"), config.data);
    configValidation.installValidation();
  },

  saveData: function () {
    // Creates a local config data object to get common data from the ui
    let data = config.setAllDefaults({});
    data = configView.html2common(data);
    // Updates with current common config data that is not configurable from the ui
    data.viewFilter = config.data.viewFilter;
    data.encrypted = config.data.encrypted;
    // to do not display update message after setting up the first provider
    data["appLastVersion"] = config.appVersion;

    // Finds each provider data in the ui and adds the provider to this config data object
    for (let item of configView.getProviders()) {
      let provider = config.setProviderDefaults({ provider: item.type });
      provider = configView.html2provider(provider, item.key);
      data.providers.push(provider);
    }

    // Replace the global config data with the local config data value, it is assumed that all data was validated at the ui
    login.updateConfigFromString(JSON.stringify(data));
  },
  afterSaveData: function () {
    configController.updateMainTarget();
    configController.displayToast("Configuration saved", false);
    //to force a refresh when changing later to another tab
    wiController.reset(true);
    wiView.reset();
  },

  displayToast: function (message, isError) {
    if (isError)
      $(".toast-body").addClass("text-danger");
    else
      $(".toast-body").removeClass("text-danger");
    $(".toast-body").html(`<strong>${message}</strong>`);
    bootstrap.Toast.getOrCreateInstance($('#liveToast')[0]).show();
  },

}

export { configController };
