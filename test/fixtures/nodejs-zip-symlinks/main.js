const cat = require('./nodejs-zip/cat');

/**
 * Equivalent to unix cat command.
 * Return all the lines in an array. All other fields in the input message are stripped.
 * @param lines An array of strings.
 */
function main(msg) {
    return cat.main(msg);
}
exports.main = main;