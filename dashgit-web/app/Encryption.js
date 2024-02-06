const crypt = {
  //Note: crypto js does not have an ES6 module (there exist a port crypto-es), import directly in the index.html
  //import { CryptoJS } from "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js";

  encrypt: function (text, pass) {
    return CryptoJS.AES.encrypt(text, pass).toString();
  },

  decrypt: function (text, pass) {
    return CryptoJS.AES.decrypt(text, pass).toString(CryptoJS.enc.Utf8);
  },
}

export { crypt as encryption };
