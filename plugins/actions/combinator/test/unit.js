/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const test = require('ava')
const combinators = require('../parser')
const util = require('util')

const ecaGold = {
    actionName: 'test1',
    action: {
        copy: '/whisk.system/combinators/eca',
        inputs: {$conditionName: '/_/pkg/testAction', $actionName: '/_/pkg/action'}
    }
}

test('eca', t => {
    const context = {
        actionName: 'test1',
        action: {
            combinator: 'if testAction then action'

        },
        pkgName: 'pkg'
    }

    const result = combinators.getEntities(context)
    t.truthy(result)
    t.deepEqual(result, ecaGold)
})

const trycatchGold = {
    actionName: 'test2',
    action: {
        copy: '/whisk.system/combinators/trycatch',
        inputs: {'$tryName': '/_/pkg/tryAction', '$catchName': '/_/pkg/errorAction'}
    }
}

test('trycatch', t => {
    const context = {
        actionName: 'test2',
        action: {
            combinator: 'try tryAction catch errorAction'
        },
        pkgName: 'pkg'
    }
    const result = combinators.getEntities(context)
    t.truthy(result)
    t.deepEqual(result, trycatchGold)
})


const forwarderGold = {
    actionName: 'test3',
    action: {
        copy: '/whisk.system/combinators/forwarder',
        inputs: {
            '$forward': ['key1', 'key2'],
            '$actionName': '/_/pkg/safeToDelete',
            '$actionArgs': ['key3']
        }
    }
}

test('forwarder', t => {
    const context = {
        actionName: 'test3',
        action: {
            combinator: 'forward ["key1",  "key2"] after safeToDelete with ["key3"]'
        },
        pkgName: 'pkg'
    }
    const result = combinators.getEntities(context)
    t.truthy(result)
    //console.log(util.inspect(result, {depth: null}))
    t.deepEqual(result, forwarderGold)
})

const retryGold = {
    actionName: 'test4',
    action: {
        copy: '/whisk.system/combinators/retry',
        inputs: {'$actionName': '/_/pkg/action', '$attempts': 40}
    }
}

test('retry', t => {
    const context = {
        actionName: 'test4',
        action: {
            combinator: 'retry action 40 times'
        },
        pkgName: 'pkg'
    }
    const result = combinators.getEntities(context)
    t.truthy(result)
    //   console.log(util.inspect(result, {depth: null}))
    t.deepEqual(result, retryGold)
})
