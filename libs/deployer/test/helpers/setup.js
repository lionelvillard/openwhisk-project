const bx = require('@openwhisk-libs/bluemix')
const fs = require('fs-extra')
const openwhisk = require('openwhisk')

let bxdata
let testdir

const beforeTest = async (t) => {

    let ns
    if (!process.env.BX_SPACE_CI && !process.env.AUTH_DEPLOYER_CI) {
        const loggedin = await bx.login()
        if (!loggedin)
            throw new Error(`Could not get a valid namespace: cannot log in to Bluemix`)

        const keys = await bx.createSpace()
        ns = keys[0]
    }

    if (!ns && process.env.BX_SPACE_CI) {
        const tokens = bx.getTokens()
        const keys = await bx.waitForAuthKeys(tokens.accessToken, tokens.refreshToken, [process.env.BX_SPACE_CI])
        ns = keys[0]
    }

    let api_key = process.env.AUTH_DEPLOYER_CI
    if (ns)
        api_key = `${ns.uuid}:${ns.key}`

    if (!api_key)
        throw new Error(`Could not get a namespace`)


    bxdata = {
        space: process.env.BX_SPACE_CI,
        ns,
        ow: openwhisk({
            apihost: 'openwhisk.ng.bluemix.net',
            api_key
        })
    }

    try {
        await fs.mkdir('test-results')
    } catch (e) {
    }
    testdir = await fs.mkdtemp('test-results/test')

}

const beforeEachTest = async t => {

    t.context.tmpdir = await fs.mkdtemp(`${testdir}/each`)
    t.context.bx = bxdata
}

const alwaysAfter = async t => {
    await fs.remove(testdir)
}

module.exports = test => {
    test.before(beforeTest)

    test.beforeEach(beforeEachTest)
    test.always.after(alwaysAfter)
}