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

export const getKeyValues = (inputs, args) => {
    if (inputs) {
        return Object.keys(inputs).map(key => ({ key, value: resolveValue(inputs[key], args) }))
    }
    return []
}

export const indexKeyValues = kvs => {
    const index = {}
    if (kvs) {
        kvs.forEach(kv => index[kv.key] = kv.value)
    }
    return index
}

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
export const normalizeLocation = action => {
    if (!action.location)
        return

    if (fs.existsSync(path.join(action.location, 'Dockerfile'))) {
        action.location = path.join(action.location, 'Dockerfile')
    }
    if (fs.existsSync(path.join(action.location, 'package.json'))) {
        action.location = path.join(action.location, 'package.json')
    }
}

const kindsForExt = {
    '.js': 'nodejs:default',
    '.py': 'python:default',
    '.swift': 'swift:default',
    '.jar': 'java:default'
}

export const getKind = action => {
    if (action.kind) {
        if (action.kind === 'nodejs')
            action.kind = 'nodejs:default';
        return action.kind
    }
    const p = path.parse(action.location)
    if (p.base === 'package.json')
        return 'nodejs:default'

    if (p.base === 'Dockerfile')
        return 'blackbox'

    return kindsForExt[p.ext]
}

// const getBinary = (action, kind) => {
//     if (kind.startsWith('java') || action.zip)
//         return true

//     return false
// }
// exports.getBinary = getBinary

// export const getDockerImage = (manifest, action) => {
//     const dockerhub = manifest.dockerhub
//     if (!dockerhub)
//         return { error: 'Missing dockerhub configuration' }

//     const username = dockerhub.username
//     if (!username)
//         return { error: 'Missing dockerhub.username' }

//     function espace(wskname) {
//         return wskname ? wskname.replace(/[\s@_]/, '.') : ''
//     }

//     return { image: `${username}/${escape(action.packageName)}/${escape(action.actionName)}` }
// }
