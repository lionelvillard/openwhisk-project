const test = require('ava')
const builder = require('../index.js')
const fs = require('fs-extra')

test.before(async t => {
    try {
        await fs.mkdir('test-1')
    } catch (e) {
    }
})

test.always.after(async t => {
    await fs.remove('test-1')
})

test('no-zip nodejs file', async t => {
    const result = await builder.nodejs.build({
        target: 'test-1',
        action: {'location': 'test/fixtures/hello.js'}
    })

    t.deepEqual(result, 'test/fixtures/hello.js')
    t.pass()
})

test('zip nodejs file', async t => {
    const result = await builder.nodejs.build({
        target: 'test-1',
        action: {
            location: 'test/fixtures/hello.js',
            zip: true
        }
    })
    t.deepEqual(result, 'test-1/action.zip')
    t.pass()
})
