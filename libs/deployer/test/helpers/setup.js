const bx = require('./bx')

module.exports = (test, name) => {
    test.before(async t => bx.beforeTest(name, t))
    test.after.always(bx.afterTest)

    test.beforeEach(bx.beforeEachTest)
    test.afterEach(bx.afterEachTest)
}