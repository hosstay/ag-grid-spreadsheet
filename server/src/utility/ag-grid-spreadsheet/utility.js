/**
 * Collects error information as the error propogates through functions
 * with the intention of giving a simple stack trace.
 *
 * @param {object} errObj - Obj containing the following information:
 *        {object} err - the error parameter from the catch block
 *        {string} context - name of the function that this call is coming from
 *        {boolean} isLast - whether or not this is the last function in the chain
 *        {boolean} reject - whether or not the error being thrown is coming from a promise rejection
 * @return {object}{string} - returns a string or array of strings depending on if it's a promise rejection.
*/
function errorHandler(errObj) {
  /*
    If this is the first time handled (err is string) then make it array
    for the rest of the journey.

    Each time err is handled the context of that catch block is added.

    If the err has reached it's final destination (third parameter is true)
    then send as concat string.

    if the err is from a promise (is needed for a reject) (fourth parameter)
    then just return the array of err so it can be rejected and will continue
    the journey outside.
  */

  const err = errObj.err;
  const context = errObj.context;
  const isLast = errObj.isLast;
  const reject = errObj.reject;

  let errArr = [];

  if (typeof err === 'string') {
    errArr.push(err); // case where string is explicitly thrown
  } else if (err[0] !== undefined) {
    errArr = err; // case where it's the array we're passing foward
  } else {
    errArr.push(err); // case where a inexplicit error is thrown
  }

  errArr.push('=> ' + context);

  if (isLast) {
    let output = '';

    errArr.forEach((err) => {
      if (typeof err === 'object') { // if item is err obj
        if (err.stack !== undefined) { // if err obj has .stack property (edge doesn't)
          output += err.stack + '\n';
        } else if (err.message !== undefined) { // if is err obj
          output += err.message + '\n';
        } else { // if is fetch response obj or other unidentified obj
          err.forEach((subErr, i) => {
            output += `${i}: ${subErr}\n`;
          });
        }
      } else { // if item is string
        output += err + '\n';
      }
    });

    console.log(output);
    return output;
  } else {
    if (!reject) {
      throw errArr;
    } else {
      return errArr;
    }
  }
}

/**
 * Converts string to title case
 * ex. i am a string => I Am A String
 *
 * @param {string} str
 * @return {string}
 */
function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

module.exports = {
  errorHandler,
  toTitleCase
};