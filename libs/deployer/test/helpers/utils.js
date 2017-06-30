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

const deepDiff = require('deep-diff')
const names = require('@openwhisk-libs/names')

const fail = (t, actual, expected) => {
    return t.deepEqual(expected, actual)
}

const diffModulo = (t, actual, expected) => {
    const diff = deepDiff.diff(expected, actual)
    if (diff) {
        for (const edit of diff) {

            // not a value change: fail
            if (edit.kind !== 'E')
                return fail(t, actual, expected)

            if (!edit.path)
                return fail(t, actual, expected)

            const l = edit.path[edit.path.length - 1]
            const l1 = edit.path[edit.path.length - 2]
            const l2 = edit.path[edit.path.length - 3]

            if (l1 === 'components' && l2 === 'exec') {
                const lhs = names.parseQName(edit.lhs)
                const rhs = names.parseQName(edit.rhs)

                if (lhs.pkg !== rhs.pkg || lhs.name !== rhs.name)
                    return fail(t, actual, expected)

            } else if (!(l === 'path' && l1 === 'trigger')) { // ignore trigger/path
                if (l !== 'version' && l !== 'namespace' && l !== 'location' && l !== 'authKey')
                    return fail(t, actual, expected)
            }

        }


    }
    t.pass()
}

const deleteCode = json => {
    switch (typeof json) {
        case 'object':
            delete json.code
            for (const key in json) {
                deleteCode(json[key])
            }
            break
        case 'array':
            for (const i in json) {
                deleteCode(json[i])
            }
            break
        default:
    }
}

const assertPackageEmpty = async (t, ow, packageName) => {
    try {
        await ow.packages.get({packageName})
        t.fail()
    } catch (e) {
        t.true(e.error.error === 'The requested resource does not exist.')
    }
}

// Delete all entities in the given package
const deletePackage = async (t, ow, packageName) => {
    try {
        const entities = await getPackage(ow, packageName)
        if (!entities.binding.name) {
            await deletePackageEntities(ow, packageName, entities)
        }
        await ow.packages.delete({packageName})
        await assertPackageEmpty(t, ow, packageName)
    } catch (e) {
        t.true(e.error.error === 'The requested resource does not exist.')
    }
}
exports.deletePackage = deletePackage

const getPackage = (ow, packageName) => {
    return ow.packages.get({packageName})
}

const deletePackageEntities = async (ow, pkgName, content) => {
    const promises = []
    for (const action of content.actions) {
        promises.push(ow.actions.delete({actionName: `${pkgName}/${action.name}`}))
    }
    return Promise.all(promises)
}

// Delete the given rules
const deleteRules = async (t, ow, rules) => {
    const promises = []
    for (const ruleName of rules) {
        promises.push(ow.rules.delete({ruleName}).catch(e => true))
    }
    return Promise.all(promises)
}
exports.deleteRules = deleteRules

// Delete the given triggers
const deleteTriggers = async (t, ow, triggers) => {
    const promises = []
    for (const triggerName of triggers) {
        promises.push(ow.triggers.delete({triggerName}).catch(e => true))
    }
    return Promise.all(promises)
}
exports.deleteTriggers = deleteTriggers


// Delete the given feeds (pairs feedname, triggername)
const deleteFeeds = async (t, ow, feeds) => {
    const promises = []
    for (const feed of feeds) {
        promises.push(ow.feeds.delete({name:feed[0], trigger:feed[1]}).catch(e => true))
    }
    return Promise.all(promises)
}
exports.deleteFeeds = deleteFeeds

exports.deepEqualModulo = diffModulo
exports.deleteCode = deleteCode
exports.assertPackageEmpty = assertPackageEmpty