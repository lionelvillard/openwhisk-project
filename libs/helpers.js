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
const path = require('path')
const handlers = require('./handlers')
const names = require('@openwhisk-libs/names')

const deployRawAction = (ow, actionName, action) => {
    return ow.actions.change({
        actionName,
        action
    })
}
exports.deployRawAction = deployRawAction

const deployAction = (ow, actionName, parameters, annotations, limits, kind, binary) => content => {
    const action = {
        exec: {
            kind,
            code: binary ? new Buffer(content).toString('base64') : content
        },
        parameters,
        annotations,
        limits
    }

    return ow.actions.change({
        actionName,
        action
    })
}
exports.deployAction = deployAction

const getKeyValues = (inputs, args) => {
    if (inputs) {
        return Object.keys(inputs).map(key => ({ key, value: resolveValue(inputs[key], args) }))
    }
    return []
}
exports.getKeyValues = getKeyValues

const indexKeyValues = kvs => {
    const index = {}
    if (kvs) {
        kvs.forEach(kv => index[kv.key] = kv.value)
    }
    return index
}
exports.indexKeyValues = indexKeyValues

const resolveValue = (value, args) => {
    if (typeof value === 'string' && value.startsWith('$')) {
        const key = value.substr(1)
        if (args.env && args.env[key])
            return args.env[key]

        return process.env[key]
    }
    return value
}

const kindsForExt = {
    '.js': 'nodejs:default',
    '.py': 'python:default',
    '.swift': 'swift:default',
    '.jar': 'java:default'
}

const getKind = action => {
    if (action.hasOwnProperty('kind'))
        return action.kind

    // Try to infer the kind
    const p = path.parse(action.location)
    const kind = kindsForExt[p.ext]
    if (kind)
        return kind

    return 'blackbox'
}
exports.getKind = getKind

const getBinary = (action, kind) => {
    if (kind.startsWith('java') || action.zip)
        return true

    return false
}
exports.getBinary = getBinary

const dependenciesGraph = manifest => {
    const packages = manifest.packages || {}
    const graph = {}

    for (const pkgName in packages) {
        const pkg = packages[pkgName] || {}

        const actions = pkg.actions || {}
        for (const actionName in actions) {
            const action = actions[actionName]

            const dependencies = handlers.lookupActionHandler(action).dependsOn(manifest.namespace, pkgName, action)
            const qname = `${pkgName}/${actionName}`
            if (graph[qname])
                throw new Error(`Duplicate action ${qname}`)

            graph[`${pkgName}/${actionName}`] = {
                pkgName,
                actionName,
                action,
                deployed: false,
                dependencies
            }
        }
    }
    return graph
}
exports.dependenciesGraph = dependenciesGraph

const nodependencies = (graph, entry) => {
    for (const qname of entry.dependencies) {
        const parts = names.parseQName(qname)
        const dependency = graph[`${parts.pkg}/${parts.name}`]
        if (dependency && !dependency.deployed)
            return false
    }
    return true
}

// Get the list of actions that can be deployed
const pendingActions = graph => {
    const actions = {}
    let hasActions = false
    for (const qname in graph) {
        const entry = graph[qname]
        if (!entry.deployed && nodependencies(graph, entry)) {
            actions[qname] = entry
            hasActions = true
        }
    }
    return hasActions ? actions : null
}
exports.pendingActions = pendingActions

// Mark actions as deployed
const commitActions = actions => {
    for (const qname in actions) {
        const entry = actions[qname]
        entry.deployed = true
    }
}
exports.commitActions = commitActions

// Gets the remaining action to deploy, independently of their dependencies
const remainingActions = graph => {
    const actions = {}
    let hasActions = false
    for (const qname in graph) {
        const entry = graph[qname]
        if (!entry.deployed) {
            actions[qname] = entry
            hasActions = true
        }
    }
    return hasActions ? actions : null
}
exports.remainingActions = remainingActions