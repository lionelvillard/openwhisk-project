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

const ecaGold = [{
    actionName: 'test1',
    action: {
        copy: '/whisk.system/combinators/eca',
        inputs: {$conditionName: 'testAction', $actionName: 'action'}
    }
}]


test('eca', t => {
    const context = {
        actionName: 'test1',
        action: {
            combinator: 'if testAction then action'
        }
    }

    const result = combinators.getEntities(context)
    t.truthy(result)
    t.deepEqual(result, ecaGold)
})


const trycatchGold = [{
    actionName: 'test2',
    action: {
        copy: '/whisk.system/combinators/trycatch',
        inputs: {'$tryName': 'tryAction', '$catchName': 'errorAction'}
    }
}]

test('trycatch', t => {
    const context = {
        actionName: 'test2',
        action: {
            combinator: 'try tryAction catch errorAction'
        }
    }
    const result = combinators.getEntities(context)
    t.truthy(result)
    t.deepEqual(result, trycatchGold)
})

test('forwarder', t => {
    const context = {
        actionName: 'test3',
        action: {
            combinator: 'forward ["key1",  "key2"] after safeToDelete with ["key3"]'
        }
    }
    const result = combinators.getEntities(context)
    t.truthy(result)
    console.log(util.inspect(result, {depth: null}))
  //  t.deepEqual(result, trycatchGold)
})

test('retry', t => {
    const context = {
        actionName: 'test4',
        action: {
            combinator: 'retry action 40 times'
        }
    }
    const result = combinators.getEntities(context)
    t.truthy(result)
    console.log(util.inspect(result, {depth: null}))
    //  t.deepEqual(result, trycatchGold)
})
