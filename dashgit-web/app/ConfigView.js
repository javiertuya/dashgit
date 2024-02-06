import { config } from "./Config.js"

/**
 * Generates the html content for the config view
 */
const configView = {
  form: function (elem) {
    return $(elem).closest("form")[0];
  },
  render: function () {
    $("#config").html(configView.header2html());
    $("#configJson").val(JSON.stringify(config.data, null, 2));
  },
  login2html: function () {
    return `
    <form id="config-encrypt" class="form-group row" novalidate>
      <p>Enter the password used to encrypt the access tokens. If you forgot your password, click skip and go to configuration to reset.</p>
      ${this.input2html("inputPassword", "password", "Enter you password:", "Required")}
      ${this.button2html("inputPasswordButton", "submit", "Submit")}
      ${this.button2html("inputSkipButton", "submit", "Skip")}
    </form>
    `;
  },
  header2html: function () {
    return `
    <div>
    <form id="config-encrypt" class="form-group row" novalidate>
      <p class="m-0">This configuration is stored in the browser local memory. You can set up a password to encrypt the API access tokens.</p>
      <p class="m-2">
      ${this.input2html("inputEncryptPassword", "password", "Enter a password to encrypt the API access tokens:", "Required")}
      ${this.button2html("inputEncryptButton", "submit", "Encrypt")}
      </p>
    </form>
    <form id="config-decrypt" class="form-group row" novalidate>
      <p class="m-0">API access tokens in this configuration are encrypted. If you forgot your password you need to reset both password and tokens.</p>
      <p class="m-2">${this.button2html("inputDecryptButton", "submit", "Reset password and access tokens", "danger")}
      </p>
    </form>
    ${this.export2html()}
    </div>
 `;
  },
  export2html: function () {
    return `
    <h5>Configuration parameters</h5>
    <div id="configJsonHelp" class="form-text">
      <p id="config-unauthenticated-message" class="text-danger" style="display:none">
        GitHub unauthenticated providers are subject to lower rate limits and do not allow you to view branches, build statuses and notifications. 
      </p>

      <p class="m-0">In this initial release, configuration can be made only by editing the json below.
      If you need further assistance, you can
      <a href="https://github.com/javiertuya/dashgit/issues/new" target="_blank">submit an issue.<a>
      </p>
      <p class="m-0">Please, be sure to include the right data in the required fields. For each object in the array:
      </p>
      <ul class="m-0">
      <li>provider type: one of <code>GitHub</code> or <code>GitLab</code></li>
      <li>user and access token</li>
      <li>url (only for GitLab)</li>
      </ul>
      <p>Example:
      <code>"providers": [ { "provider": "GitHub", "user": "MY-USER", "token": "MY-TOKEN" } ]</code>
      </p>
    </div>
    
    <label for="configJson">Configuration parameters (json):</label>
    <textarea class="form-control" id="configJson" rows="10"></textarea>
    <button class="btn btn-primary btn-sm" id="buttonConfigSave">SAVE CONFIGURATION</button>
    `;
  },

  input2html: function (id, type, label, validationMessage) {
    return `
      <div class="col-auto">
        <label for="${id}" class="col-form-label">${label}</label>
      </div>
      <div class="col-auto">
        <input id="${id}" type="${type}" class="form-control form-control-sm" aria-label="${label}" required></input>
      </div>
    `;
  },
  button2html: function (id, type, label, style) {
    const styleClass = style == undefined ? `btn-primary` : `btn-${style}`;
    return `
      <div class="col-auto">
        <button type="${type}" id="${id}" class="btn ${styleClass} btn-sm">${label}</button>
      </div>
    `
  }
}

export { configView };
