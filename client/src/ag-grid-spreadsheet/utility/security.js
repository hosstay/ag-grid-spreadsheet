import cryptoJs from '../../../../bower_components/crypto-js/crypto-js'; // Will likely need to change this to fit your project
import pako from 'pako';

function decrypt(data) {
  let result = (cryptoJs.AES.decrypt(data, '1234').toString(cryptoJs.enc.Utf8));
  result = JSON.parse(pako.inflate(result, {to: 'string'}));
  return result;
}

export {
  decrypt
};