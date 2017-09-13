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

const fail = (t, actual, expected) => {
    return t.deepEqual(expected, actual)
}

const normAction = action => {
    if (action.deployResult) {
        if (action.deployResult.version)
            action.deployResult.version = '0.0.0'
        if (action.deployResult.namespace) {
            action.deployResult.namespace = action.deployResult.namespace.replace(/^[^\/]*/, '_')

        }
        if (action.deployResult.exec) {
            if (action.deployResult.exec.components) {
                if (!action.deployResult.exec.components[0].startsWith('/whisk.system'))
                    action.deployResult.exec.components[0] = action.deployResult.exec.components[0].replace(/^\/[^\/]*/, '/_')
                if (!action.deployResult.exec.components[0].startsWith('/whisk.system'))
                    action.deployResult.exec.components[1] = action.deployResult.exec.components[1].replace(/^\/[^\/]*/, '/_')
            }
        }

        if (action.deployResult.parameters) {
            const _actions = action.deployResult.parameters.find(item => item.key === '_actions')
            if (_actions) {
                if (!_actions.value[0].startsWith('/whisk.system'))
                    _actions.value[0] = _actions.value[0].replace(/^\/[^\/]*/, '/_')
                if (!_actions.value[1].startsWith('/whisk.system'))
                    _actions.value[1] = _actions.value[1].replace(/^\/[^\/]*/, '/_')
            }
        }
    }
    if (action.location)
        action.location = ''
}

const normalize = (json) => {
    if (json.packages) {
        for (const pkg of json.packages) {
            if (pkg.deployResult) {
                if (pkg.deployResult.version)
                    pkg.deployResult.version = '0.0.0'
                if (pkg.deployResult.namespace)
                    pkg.deployResult.namespace = '_'
            }
        }
    }
    if (json.actions) {
        for (const action of json.actions) {
            normAction(action)
        }
    }
    if (json.sequences) {
        for (const action of json.sequences) {
            normAction(action)
        }
    }
    if (json.triggers) {
        for (const trigger of json.triggers) {
            if (trigger.deployResult) {
                if (trigger.deployResult.version)
                    trigger.deployResult.version = '0.0.0'
                if (trigger.deployResult.namespace)
                    trigger.deployResult.namespace = '_'
            }
            if (trigger.feedParams) {
                if (trigger.feedParams.authKey) {
                    trigger.feedParams.authKey = '[hidden]'
                }
            }
                
        }
    }
    if (json.rules) {
        for (const rule of json.rules) {
            if (rule.deployResult) {
                if (rule.deployResult.version)
                    rule.deployResult.version = '0.0.0'
                if (rule.deployResult.namespace)
                    rule.deployResult.namespace = '_'
                if (rule.deployResult.trigger) {
                    if (rule.deployResult.trigger.path) {
                        rule.deployResult.trigger.path = '_'
                    }
                }
            }
        }
    }
}

const diffModulo = (t, actual, expected) => {
    normalize(actual)
    const diff = deepDiff.diff(expected, actual)
    if (diff) {
        return fail(t, actual, expected)
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


exports.deepEqualModulo = diffModulo
exports.deleteCode = deleteCode