import { config } from "./Config.js"
import { wiController } from "./WiController.js"
import { wiView } from "./WiView.js"
import { configView } from "./ConfigView.js"

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
});
$(document).on('click', '.config-btn-add-gitlab', function (e) {
  configView.addProvider(config.setProviderDefaults({ provider: "GitLab" }));
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
$(document).on('change', '#config-common-enableManagerRepo', function (e) {
  configView.refreshAll();
});
$(document).on('change', '[id^="config-providers-surrogate-enabled-"]', function (e) {
  configView.refreshProviderSurrogate(this, $(this).is(':checked'));
});

// Only one of these checkboxes can be checked
$(document).on('change', '[id^="config-graphql-include-forks-"]', function (e) {
  configView.refreshGraphqlIncludeForks(this, $(this).is(':checked'));
});
$(document).on('change', '[id^="config-graphql-only-forks-"]', function (e) {
  configView.refreshGraphqlOnlyForks(this, $(this).is(':checked'));
});

// Data update events

$(document).on('click', '.config-btn-provider-submit', function (e) {
  if ($(".config-form")[0].checkValidity()) {
    console.log("Saving config data");
    configController.saveData();
    configController.afterSaveData();
    e.preventDefault();
  } else
    console.log("Can't save config data due to validation issues");
});

$(document).on('click', '#inputEncryptButton', function (e) {
  if ($('#inputEncryptPassword').val().length > 0) {
    config.xtoken = $("#inputEncryptPassword").val();
    config.data.encrypted = true;
    config.encryptTokens();
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
  config.data.encrypted = false;
  config.save();
  configController.updateMainTarget();
  e.preventDefault();
});

$(document).on('click', '#buttonConfigSave', function (e) {
  console.log("Save config json");
  try {
    config.updateFromString($("#configJson").val());
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
    config.updateFromString(JSON.stringify(data));
  },
  afterSaveData: function () {
    configController.updateMainTarget();
    configController.displayToast("Configuration saved");
    //to force a refresh when changing later to another tab
    wiController.reset(true);
    wiView.reset();
  },

  displayToast: function (message) {
    $(".toast-body").html(`<strong>${message}</strong>`);
    bootstrap.Toast.getOrCreateInstance($('#liveToast')[0]).show();
  },

}

export { configController };
