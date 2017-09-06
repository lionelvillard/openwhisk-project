/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
module.exports = (ow, converter) => {
    return dumpAll(ow).then(json => (converter) ? converter(json) : json)
}

const dumpAll = ow => {
    const promises = []
    promises.push(dumpPackages(ow))
    promises.push(dumpActions(ow))
    return Promise.all(promises).then(([packages, actions]) => ({packages, actions}))
}

const dumpPackages = ow => {
    return ow.packages.list()
    .then(expandPackages(ow))
}

const expandPackages = ow => pkgs => {
    const promises = []
    for (const pkg of pkgs) {
        promises.push(ow.packages.get({ name: pkg.name }))
    }
    return Promise.all(promises)
}

const dumpActions = ow => {
    return ow.actions.list()
        .then(expandActions(ow))
}

const expandActions = ow => actions => {
    const promises = []
    for (const action of actions) {
        promises.push(ow.actions.get(action))
    }
    return Promise.all(promises)
}


const toBash = json => {
    let result = writePackages(json.packages)
    result += writeActions(json.actions)
    return result
}

const writePackages = pkgs => {
    let bashPkgs = '#!/usr/bin/env bash\n'
    for (const pkg of pkgs) {
        if (pkg.binding.name)
            bashPkgs += `\n\nwsk package bind ${pkg.binding.namespace}/${pkg.binding.name} ${pkg.name}`
        else
            bashPkgs += `\n\nwsk package create ${pkg.name}`

        bashPkgs += writeKeyValues(pkg.parameters, '-p')
        bashPkgs += writeKeyValues(pkg.annotations, '-a')
    }
    return bashPkgs
}

const writeActions = actions => {
    let bashActions = ''
    for (const action of actions) {
        const annos = action.annotations
        const afile = annos ? annos.find(item => item.key === 'file') : undefined
        const file = afile ? afile.value : undefined

        const loc = file ? file : `actions/${action.name}`

        const namespace = action.namespace
        const parts = namespace.split('/')
        const pkgName = parts.length === 2 ? `${parts[1]}/` : ''
        bashActions += `\n\nwsk action update ${pkgName}${action.name} ${loc}`
        bashActions += writeKeyValues(action.parameters, '-p')
        bashActions += writeKeyValues(action.annotations, '-a', ['exec', 'parameters'])
    }
    return bashActions
}

const writeKeyValues = (kvs, flag, nokeys = []) => {
    if (!kvs)
        return ''

    let bashKeyValues = ''
    for (const kv of kvs) {
        if (!nokeys.includes(kv.key)) {
            let value = kv.value
            if (typeof value === 'array' || typeof value === 'object')
                value = `${JSON.stringify(value)}`
            if (typeof value === 'string')
                value = `"${value}"`

            bashKeyValues += ` \\\n  ${flag} ${kv.key} '${value}'`
        }
    }
    return bashKeyValues
}