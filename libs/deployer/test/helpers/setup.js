const bx = require('@openwhisk-libs/bluemix')
const fs = require('fs-extra')
const openwhisk = require('openwhisk')

let bxdata

const beforeTest = async (t) => {
    if (!bxdata) {
        if (process.env.BX_SPACE_CI) {
            const tokens = bx.getTokens()
            const keys = await bx.waitForAuthKeys(tokens.accessToken, tokens.refreshToken, [process.env.BX_SPACE_CI])
            const ns = keys[0]
            bxdata = {
                space: process.env.BX_SPACE_CI,
                ns,
                ow: openwhisk({
                    apihost: 'openwhisk.ng.bluemix.net',
                    api_key: `${ns.uuid}:${ns.key}`
                })
            }
        } else if (process.env.AUTH_DEPLOYER_CI) {
            bxdata = {
                ow: openwhisk({
                    apihost: 'openwhisk.ng.bluemix.net',
                    api_key: process.env.AUTH_DEPLOYER_CI
                })
            }
        }
    }
}

const beforeEachTest = async t => {
    try {
        await fs.mkdir('test-results')
    } catch (e) {
    }
    t.context.tmpdir = await fs.mkdtemp('test-results/test')
    t.context.bx = bxdata
}

const afterEachTest = async t => {
    if (t.context.tmpdir) {
        await fs.remove(t.context.tmpdir)
    }
}

module.exports = test => {
    test.before(beforeTest)

    test.beforeEach(beforeEachTest)
    test.afterEach(afterEachTest)
}