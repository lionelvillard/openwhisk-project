#!/usr/bin/env node
const program = require('commander')
const commands = require('./commands')
const prettyjson = require('prettyjson')
const chalk = require('chalk')

program
    .version('0.1.0')
    .usage('[options] [manifest.yaml]')
    .description('Apache OpenWhisk deployment tool')
    .option('-m, --mode [mode]', 'deployment mode (create|update) [create], /^(create|update)$/i')
    .option('-u, --auth [auth]', 'authorization key')
    .option('--apihost [host]', 'API host',)
    .option('-s, --bx-space [space]', 'bluemix space')
    .option('-i, --insecure', 'bypass certificate checking')
    .option('-v, --logging [level]', 'logging level (debug|off) [off]', /^(debug|off)$/i)

program.on('--help', () => {
    console.log('  The authorization key is determined in this order:')
    console.log('')
    console.log(`    1. ${chalk.bold('-u auth')}`)
    console.log(`    2. ${chalk.bold('-s space')}`)
    console.log('    3. ~/.wskprops')
    console.log('')
    console.log('  Deployment modes:')
    console.log('')
    console.log(`    - ${chalk.bold('create')}: create new entities, leaving existing ones untouched`)
    console.log(`    - ${chalk.bold('update')}: create and update entities`)
    console.log('')
})

program.parse(process.argv)


commands.run(program)
    .then(report => {
        console.log(prettyjson.render(report, {}))
    })
    .catch(code => {
        process.exit(code)
    })