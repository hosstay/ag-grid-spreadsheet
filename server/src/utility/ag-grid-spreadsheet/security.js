const cryptoJs = require('crypto-js');
const pako     = require('pako');

function encrypt(object) {
  let outbound = pako.deflate(JSON.stringify(object), {to: 'string'});
  outbound = (cryptoJs.AES.encrypt(outbound, '1234')).toString();
  return (outbound);
}

function sanitize(input, maxLength = null) {
  // Make sure input fits within postgresql column definition
  if (maxLength !== null) {
    if (input.length > maxLength) {
      input = input.substring(0, maxLength);
    }
  }

  return input;
}

module.exports = {
  encrypt: encrypt,
  sanitize: sanitize
};