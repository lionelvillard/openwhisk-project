#!/usr/bin/env node
const program = require('commander')
const fs = require('fs')
const expandHomeDir = require('expand-home-dir')
const deployer = require('@openwhisk-deploy/deployer')
const chalk = require('chalk')
const ansiEscapes = require('ansi-escapes')

const error = chalk.bold.red
const info = chalk.bold.green
const warn = chalk.yellow

const MISSING_API_KEY_CODE = 1
const MISSING_MANIFEST_CODE = 2
const MISSING_BLUEMIX_TOKENS_CODE = 3
const MISSING_SPACE_CODE = 4

const BLUEMIX_HOST = 'https://openwhisk.ng.bluemix.net'

const readWskProps = () => {
    const propertiesParser = require('properties-parser')
    try {
        return propertiesParser.read(process.env['WSK_CONFIG_FILE'] || expandHomeDir('~/.wskprops'))
    } catch (e) {
        return null
    }
}

const printLine = msg => new Promise(resolve => {
    console.log(`   ${info(msg)}`)

    resolve()
})

const userMode = {
    create: 'Creating',
    update: 'Updating',
}

const deploy = (apihost, auth, ignore_certs, logging, mode, friendlyauth) => {
    const ow = require('openwhisk')({
        apihost: apihost,
        api_key: auth,
        ignore_certs: ignore_certs
    })

    return printLine(`${userMode[mode]} entities on ${friendlyauth}`)
        .then(() => deployer.deploy(ow, {
            basePath: '.',
            cache: '.wskd',
            location: 'manifest.yaml',
            logger_level: logging,
            force: mode === 'update'
        }))
}

const deployBluemix = (space, ignore_certs, logging, mode) => {
    const bx = require('@openwhisk-libs/bluemix')

    const tokens = bx.getTokens()
    if (!tokens) {

        console.log(error(`Missing Bluemix tokens. Please run 'cf login' or 'bx login' and try again`))
        return Promise.reject(MISSING_BLUEMIX_TOKENS_CODE)
    }
    console.log('')

    return printLine(`Get API key for ${space}`)
        .then(() => bx.waitForAuthKeys(tokens.accessToken, tokens.refreshToken, [space]))
        .catch(err => {
            console.log(error(`Could not get the API key for ${space}. Check the space exists`))
            return Promise.reject(MISSING_SPACE_CODE)
        })
        .then(keys => {

            if (!keys || keys.length == 0) {
                console.log(error(`Could not get the API key for ${space}. Log in to Bluemix and try again`))
                return Promise.reject(MISSING_SPACE_CODE)
            }

            const auth = `${keys[0].uuid}:${keys[0].key}`
            return auth
        })
        .then(auth => deploy('https://openwhisk.ng.bluemix.net', auth, ignore_certs, logging, mode, space))
}

const runCommand = options => {
    //console.log(options)
    const args = options.args || []
    if (args.length > 1) {
        console.log(error('Error: invalid number of arguments'))
        options.help()
    }

    const manifest = args[0] || 'manifest.yaml'

    if (!fs.existsSync(manifest)) {
        console.log(error(`Error: ${manifest} does not exists`))
        return Promise.reject(MISSING_MANIFEST_CODE)
    }

    // Resolve auth.
    let auth = options.auth
    let apihost = options.apihost
    let insecure = options.insecure
    const wskprops = readWskProps()

    if (auth) {
        if (options.bxSpace) {
            console.log(warn(`Warning: ${chalk.bold(`-s ${options.bxSpace}`)} ignored`))
            options.bxSpace = null
        }

        if (!apihost && wskprops) {
            apihost = wskprops.APIHOST
        }

        if (!apihost) {
            console.log(warn(`Warning: API host not defined. Set it to ${BLUEMIX_HOST}`))
            apihost = BLUEMIX_HOST
        }

    } else if (options.bxSpace) {
        // deploy to bluemix (see below)
        apihost = apihost || 'https://openwhisk.ng.bluemix.net'

    } else {
        if (wskprops) {
            auth = wskprops.AUTH
            apihost = wskprops.APIHOST
            insecure = insecure || wskprops.INSECURE_SSL
        } else {
            console.log(error(`Error: API key not defined.`))
            return Promise.reject(MISSING_API_KEY_CODE)
        }
    }
    let logging = options.logging || 'off'
    logging = logging.toUpperCase()
    const mode = options.mode || 'create'

    if (options.bxSpace) {
        return deployBluemix(options.bxSpace, insecure, logging, mode)
    }

    return deploy(apihost, auth, insecure, logging, mode, auth)
}
exports.run = runCommand
