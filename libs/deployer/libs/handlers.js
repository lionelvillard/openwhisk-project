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

const builder = require('@openwhisk-deploy/builder')
const helpers = require('./helpers')
const reporter = require('./reporter')
const names = require('@openwhisk-libs/names')
const path = require('path')


// --- Copy action

const handleCopy = (ow, args, pkgName, actionName, action) => {
    const manifest = args.manifest
    const sourceActionName = names.resolveQName(action.copy, manifest.namespace, pkgName)

    const sourceAction = findAction(manifest, sourceActionName)
    if (sourceAction) {
        return lookupActionHandler(sourceAction)(ow, args, pkgName, actionName, sourceAction)
    }

    const params = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}
    const qname = `${pkgName}/${actionName}`

    return getAction(ow, sourceActionName)
        .then(deployCopyAction(ow, qname, params, annotations, limits))
        .then(reporter.action(qname, sourceActionName, '<copied>', params))
        .catch(reporter.action(qname, sourceActionName, '<copied>', params))
}

const getAction = (ow, actionName) => {
    return ow.actions.get({actionName})
}

const deployCopyAction = (ow, actionName, params, annos, newlimits) => sourceAction => {
    const actionParams = helpers.indexKeyValues(sourceAction.parameters)
    const actionAnnos = helpers.indexKeyValues(sourceAction.annotations)

    params.forEach(kv => actionParams[kv.key] = kv.value)
    annos.forEach(kv => actionAnnos[kv.key] = kv.value)

    const limits = sourceAction.limits
    if (newlimits.timeout)
        limits.timeout = newlimits.timeout
    if (newlimits.memory)
        limits.memory = newlimits.memory
    if (newlimits.logs)
        limits.logs = newlimits.logs

    const parameters = helpers.getKeyValues(actionParams)
    const annotations = helpers.getKeyValues(actionParams)

    const action = {

        exec: sourceAction.exec,
        parameters,
        annotations,
        limits
    }
    return ow.actions.change({
        actionName,
        action
    })
}

// Look for the action of the given full-qualified name in the manifest. Skip includes declarations (for now)
const findAction = (manifest, actionName) => {
    const parts = names.parseQName(actionName)
    const packages = manifest.packages
    for (const pkgName in packages) {
        if (parts.pkg === pkgName) {
            const pkg = packages[pkgName] || {}
            const actions = pkg.actions || {}
            const action = actions[parts.name]
            if (action) {
                return action
            }
        }
    }
}

// --- Sequence

const handleSequence = (ow, args, pkgName, actionName, action) => {
    const manifest = args.manifest
    let components = []

    let actions = action.sequence.split(',')
    for (let i in actions) {
        const component = names.resolveQName(actions[i], manifest.namespace, pkgName)

        // TODO: check component exists?

        components.push(component)
    }
    const parameters = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}

    const sequence = {
        exec: {
            kind: 'sequence',
            components
        },
        parameters,
        annotations,
        limits
    }

    return helpers.deployRawAction(ow, actionName, sequence)
        .then(reporter.action(actionName, '', 'sequence', parameters))
        .catch(reporter.action(actionName, '', 'sequence', parameters))

}

// --- Fallback

const handleDefaultAction = (ow, args, pkgName, actionName, action) => {
    if (!action.hasOwnProperty('location')) {
        throw `Missing property 'location' in packages/actions/${actionName}`
    }

    action.location = path.resolve(args.basePath, action.location)
    const kind = helpers.getKind(action)

    const params = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}

    const binary = helpers.getBinary(action, kind)
    const qname = `${pkgName}/${actionName}`

    return buildAction(args, kind, action)
        .then(args.load)
        .then(helpers.deployAction(ow, qname, params, annotations, limits, kind, binary))
        .then(reporter.action(qname, args.location, kind, params))
        .catch(reporter.action(qname, args.location, kind, params))
}

// --- Handlers manager

const actionsHandlers = {
    sequence: handleSequence,
    copy: handleCopy
}

const lookupActionHandler = action => {
    for (const name in actionsHandlers) {
        if (action.hasOwnProperty(name))
            return actionsHandlers[name]
    }
    return handleDefaultAction
}
exports.lookupActionHandler = lookupActionHandler


// --- Asset builders

// const checkFileExists = location => {
//
// }

const buildAction = (context, kind, action) => {
    const baseLocInCache = path.dirname(path.join(context.cache, path.relative('test', action.location)))
    const builderArgs = {
        target: baseLocInCache,
        action
    }

    const basekind = kind.split(':')[0]
    switch (basekind) {
        case 'nodejs':
            return builder.nodejs.build(builderArgs)
        default:
            throw `Unsupported action kind: ${kind}`
    }
}
