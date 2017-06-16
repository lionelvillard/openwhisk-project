#!/usr/bin/env node
const program = require('commander')
const fs = require('fs')
const expandHomeDir = require('expand-home-dir')
const deployer = require('@openwhisk-deploy/deployer')

const resolveProvider = provider => {
    if (provider)
        return provider

    if (fs.existsSync(expandHomeDir('~/.cf/config.json')) || fs.existsSync(expandHomeDir('~/.bluemix/.cf/config.json'))) {
        return 'bluemix'
    }
    return null
}
const deploy = (apihost, auth, ignore_certs, options) => {
    const ow = require('openwhisk')({
        apihost: apihost,
        api_key: auth,
        ignore_certs: ignore_certs
    })
    return deployer.deploy(ow, {
        basePath: '.',
        cache: '.wskd',
        location: 'manifest.yaml',
        logger_level: options.verbose,
        force: options.force
    })
}

const deployBluemix = (space, options) => {
    const bx = require('@openwhisk-libs/bluemix')

    const tokens = bx.getTokens()
    if (!tokens) {
        console.error(`Missing Bluemix tokens. Please run 'cf login' or 'bx login' and try again`)
        return Promise.reject(5)
    }

    return bx.waitForAuthKeys(tokens.accessToken, tokens.refreshToken, [space])
        .catch(err => {
            console.error(`Could not get the OpenWhisk API key for ${space}. Check the space exists`)
            return Promise.reject(6)
        })
        .then(keys => {
            if (!keys || keys.length == 0) {
                console.error(`Could not get the OpenWhisk API key for ${space}. Log in to Bluemix and try again`)
                return Promise.reject(4)
            }

            const auth = `${keys[0].uuid}:${keys[0].key}`

            return auth
        })
        .then(auth => deploy('https://openwhisk.ng.bluemix.net', auth, false, options))
        .then(report => {
            console.log(report)
        })
        .catch(e => {
            console.log(e)
        })
}


const runCommand = options => {
    if (!fs.existsSync('./manifest.yaml')) {
        console.error(`Missing 'manifest.yaml'. Nothing to deploy. Abort`)
        return Promise.reject(3)
    }

    const provider = resolveProvider(options.provider)
    options.verbose = options.verbose || 'OFF'
    options.force = options.force || false

    switch (provider) {
        case 'bluemix':
            const space = options.bxSpace
            if (!space) {
                console.error('Missing Bluemix space. Abort.')
                return Promise.reject(1)
            }
            return deployBluemix(space, options)

        case 'local':
            return deploy(options.apihost, options.auth, true, options)

        case null:
            console.error('Missing provider. Abort.')
            return Promise.reject(2)
    }
}
exports.run = runCommand
