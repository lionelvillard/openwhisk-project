const expandHomeDir = require('expand-home-dir')
const {exec} = require('child_process')
const request = require('request-promise')
const openwhisk = require('openwhisk')
const uuid = require('uuid/v1')
const fs = require('fs-extra')

const login = () => {
    return target()
        .then(maylogin)
}

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


const tokens = () => {
    const config = require(expandHomeDir('~/.bluemix/.cf/config.json'))
    if (config) {
        return {
            AccessToken: config.AccessToken,
            RefreshToken: config.RefreshToken
        }
    }
    return null
}

const createSpace = space => {
    return new Promise((resolve, reject) => {
        exec(`bx iam space-create ${space}`, err => {
            if (err)
                return reject(err)
            return resolve(true)
        })
    })
        .then(waitForAuthKey(space))
}

const deleteSpace = space => {
    return new Promise(resolve => {
        console.log(`delete space ${space}`)
        exec(`bx iam space-delete ${space} -f`, () => {
            console.log('space deleted')

            return resolve(true)
        })
    })
}

const authKeys = () => {
    const tk = tokens()
    if (tk) {
        return request({
            uri: 'https://openwhisk.ng.bluemix.net/bluemix/v2/authenticate',
            method: 'POST',
            body: {
                accessToken: tk.AccessToken.substr(7),
                refreshToken: tk.RefreshToken
            },
            json: true
        })
    }
    return Promise.reject('Log in to Bluemix to get authentication keys')
}


const delay = ms => new Promise(resolve => {
    setTimeout(resolve, ms)
})

const waitForAuthKey = namespace => () => {
    return authKeys()
        .then(keys => {
            const namespaces = keys.namespaces
            let foundns
            for (const ns of namespaces) {
                const space = ns.name
                if (space.endsWith(namespace)) {
                    foundns = ns
                    break
                }
            }
            if (foundns) {
                return Promise.resolve(foundns)
            } else {
                return delay(500).then(waitForAuthKey(namespace))
            }
        })
}

const beforeTest = async (name, t) => {
    if (process.env.DEPLOY) {
        await login(process.env.BX_APIKEY)
        const space = `${name}-${uuid()}`
        const ns = await createSpace(space)

        t.bx = {
            space,
            ns,
            ow: openwhisk({
                apihost: 'openwhisk.ng.bluemix.net',
                api_key: `${ns.uuid}:${ns.key}`
            })
        }
    }
}

const afterTest = async t => {
    if (t.bx)
        await deleteSpace(t.bx.space)
}

const beforeEachTest = async t => {
    try {
        await fs.mkdir('test-results')
    } catch (e) {
    }
    t.context.tmpdir = await fs.mkdtemp('test-results/test')
}
const afterEachTest = async t => {
    if (t.context.tmpdir) {
        await fs.remove(t.context.tmpdir)
    }
}

exports.login = login
exports.createSpace = createSpace
exports.deleteSpace = deleteSpace
exports.beforeTest = beforeTest
exports.afterTest = afterTest
exports.beforeEachTest = beforeEachTest
exports.afterEachTest = afterEachTest