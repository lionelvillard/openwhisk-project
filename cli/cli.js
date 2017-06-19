#!/usr/bin/env node
const program = require('commander')
const commands = require('./commands')
const prettyjson = require('prettyjson')

program
    .option('-p, --provider <provider>', 'The Apache OpenWhisk provider (bluemix|local)')
    .option('-s, --bx-space <space>', 'The Bluemix space to use (when provider is bluemix)')
    .option('-u, --auth <auth>', 'The API key to use (when provider is local)')
    .option('--apihost <host>', 'The API host to use (when provider is local)')
    .option('-v, --verbose <level>', 'verbosity level (DEBUG|OFF)')
    .option('--force', 'overwrite existing deployed entities')
    .parse(process.argv)

commands.run(program)
    .then(report => {
        console.log(prettyjson.render(report, {}))
    })
    .catch(code => {
        process.exit(code)
    })