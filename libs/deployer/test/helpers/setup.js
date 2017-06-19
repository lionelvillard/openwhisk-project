const bx = require('@openwhisk-libs/bluemix')
const fs = require('fs-extra')
const openwhisk = require('openwhisk')

let bxdata

const beforeTest = async (name, t) => {
    const loggedin = await bx.login(process.env.BLUEMIX_API_KEY)

    if (loggedin) {
        const space = 'openwhisk-deployer-test-space'
        const ns = (await bx.createSpace(space))[0]
        bxdata = {
            space,
            ns,
            ow: openwhisk({
                apihost: 'openwhisk.ng.bluemix.net',
                api_key: `${ns.uuid}:${ns.key}`
            })
        }
    }
    else {
        bxdata = {
            ow : null
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

module.exports = (test, name) => {
    test.before(async t => beforeTest(name, t))

    test.beforeEach(beforeEachTest)
    test.afterEach(afterEachTest)
}