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
const names = require('./names')
const fs = require('fs')

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
            code: Buffer.from(content).toString(binary ? 'base64' : 'utf8')
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

// Normalize action location, e.g. /../myaction containing Dockerfile become /../myaction/Dockerfile
const normalizeLocation = action => {
    if (!action.location)
        return

    if (fs.existsSync(path.join(action.location, 'Dockerfile'))) {
        action.location = path.join(action.location, 'Dockerfile')
    }
    if (fs.existsSync(path.join(action.location, 'package.json'))) {
        action.location = path.join(action.location, 'package.json')
    }
}
exports.normalizeLocation = normalizeLocation

const kindsForExt = {
    '.js': 'nodejs:default',
    '.py': 'python:default',
    '.swift': 'swift:default',
    '.jar': 'java:default'
}

const getKind = action => {
    if (action.hasOwnProperty('kind'))
        return action.kind

    const p = path.parse(action.location)
    if (p.base === 'package.json')
        return 'nodejs:default'

    if (p.base === 'Dockerfile')
        return 'blackbox'

    return kindsForExt[p.ext]
}
exports.getKind = getKind

const getBinary = (action, kind) => {
    if (kind.startsWith('java') || action.zip)
        return true

    return false
}
exports.getBinary = getBinary

const getDockerImage = (manifest, action) => {
    const dockerhub = args.manifest.dockerhub
    if (!dockerhub)
        return { error: 'Missing dockerhub configuration' }

    const username = dockerhub.username
    if (!username)
        return { error: 'Missing dockerhub.username' }

    function espace(wskname) {
        return wskname ? wskname.replace(/[\s@_]/, '.') : ''
    }

    return { image: `${username}/${escape(action.packageName)}/${escape(action.actionName)}` }
}
exports.getDockerImage = getDockerImage

// Add action to graph.
function extendGraph(graph, ns, pkgName, actionName, action) {
    action.actionName = actionName
    action.packageName = pkgName

    const dependencies = handlers.lookupActionHandler(action).dependsOn(ns, action)
    const qname = `${pkgName}/${actionName}`
    if (graph[qname])
        throw new Error(`Duplicate action ${qname}`)

    graph[`${pkgName}/${actionName}`] = {
        action,
        deployed: false,
        dependencies
    }
}

/* Compute a dependency graph of the form
   
   {
       "pkgname/actionname": { 
           action,
           deployed: false|true,
           dependencies: [ actionname ]
       }
       ...
   } 

   pkgname/actionname can be deployed when all its dependencies have been marked as deployed
*/
const dependenciesGraph = manifest => {
    const graph = {}

    // Process default package
    let actions = manifest.actions || {}
    for (const actionName in actions) {
        extendGraph(graph, manifest.namespace, '', actionName, actions[actionName])
    }

    // Process named-packages
    const packages = manifest.packages || {}

    for (const pkgName in packages) {
        const pkg = packages[pkgName] || {}

        actions = pkg.actions || {}
        for (const actionName in actions) {
            extendGraph(graph, manifest.namespace, pkgName, actionName, actions[actionName])
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