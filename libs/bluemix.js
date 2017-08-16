const request = require('request-promise')
const expandHomeDir = require('expand-home-dir')
const fs = require('fs')
const {exec} = require('child_process')

// @return true if Bluemix is available on this system, false otherwise
const isBluemixCapable = () => {
    if (process.env.BLUEMIX_API_KEY) {
        return new Promise((resolve) => {
            exec('bx help', err => {
                resolve(err ? false : true)
            })
        })
    }

    return Promise.resolve(false)
}
exports.isBluemixCapable = isBluemixCapable

// Login to Bluemix
const login = () => {
    return target().then(maylogin)
}
exports.login = login

const maylogin = target => {
    if (target.includes('bx login')) {
        return new Promise((resolve, reject) => {
            exec(`bx login -s dummy`, (err, stdout) => {
                return resolve(true)
            })
        })
    }
    return Promise.resolve(true)
}

const target = () => new Promise((resolve, reject) => {
    exec(`bx target -s dummy`, (err, stdout, stderr) => {
        return resolve(stdout)
    })
})

// Retrieve authentication tokens from local file system
const getTokens = () => {
    let configFile = expandHomeDir('~/.bluemix/.cf/config.json')
    if (!fs.existsSync(configFile)) {
        configFile = expandHomeDir('~/.cf/config.json')
        if (!fs.existsSync(configFile)) {
            return null
        }
    }

    const config = require(configFile)
    if (!config.AccessToken)
        return null

    return {
        accessToken: config.AccessToken,
        refreshToken: config.RefreshToken
    }
}
exports.getTokens = getTokens

// Send request to get all OpenWhisk keys for the given Bluemix authentication
const getAuthKeys = (accessToken, refreshToken) => {
    return request({
        method: 'POST',
        uri: 'https://openwhisk.ng.bluemix.net/bluemix/v2/authenticate',
        body: {
            accessToken: accessToken.substr(7),
            refreshToken
        },
        json: true
    })
}
exports.getAuthKeys = getAuthKeys

const delay = ms => new Promise(resolve => {
    setTimeout(resolve, ms)
})

/*
 Wait for the given spaces to be available in OpenWhisk

 @return {Object[]} the list of keys for the given spaces
 */
const waitForAuthKeys = (accessToken, refreshToken, spaces, timeout) => {
    if (spaces.length == 0)
        return Promise.resolve(true)

    if (timeout < 0)
        return Promise.reject(new Error('timeout'))

    timeout = (timeout === undefined) ?  10000 : timeout

    return getAuthKeys(accessToken, refreshToken)
        .then(keys => {
                const namespaces = keys.namespaces
                let spacekeys = []
                for (const ns of namespaces) {

                    for (const s of spaces) {

                        if (ns.name.endsWith(`_${s}`)) {
                            spacekeys.push(ns)
                            break
                        }
                    }
                }
                
                if (spacekeys.length == spaces.length) {
                    // got all.
                    return Promise.resolve(spacekeys)
                } else {
                    // Try again in a bit
                    return delay(1000).then(() => waitForAuthKeys(accessToken, refreshToken, spaces, timeout - 1000))
                }
            }
        )
        .catch(e => {
            if ((e instanceof Error) && e.message === 'timeout')
                return Promise.reject(e)

            // most likely a 409. Try again.
            return delay(1000).then(() => waitForAuthKeys(accessToken, refreshToken, spaces, timeout - 1000))
        })
}
exports.waitForAuthKeys = waitForAuthKeys

const createSpace = space => {
    const tokens = getTokens()
    return new Promise((resolve, reject) => {
        exec(`bx iam space-create ${space}`, (err, stdout, stderr) => {
            if (err) {
                console.log(stdout)
                console.log(stderr)
                return reject(err)
            }
            return resolve(true)
        })
    })
        .then(() => waitForAuthKeys(tokens.accessToken, tokens.refreshToken, [space]))
        .then(keys => (keys && keys.length > 0) ? keys[0] : null)
}
exports.createSpace = createSpace

const deleteSpace = space => {
    return new Promise(resolve => {
        exec(`bx iam space-delete ${space} -f`, () => {
            return resolve(true)
        })
    })
}
exports.deleteSpace = deleteSpace
