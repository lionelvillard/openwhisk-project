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

const builder = require('./builders')
const helpers = require('./helpers')
const reporter = require('./reporter')
const names = require('./names')
const path = require('path')
const plugins = require('./pluginmgr')

// --- Copy action

const handleCopy = (ow, args, action) => {
    const manifest = args.manifest
    const sourceActionName = names.resolveQName(action.copy, manifest.namespace, action.packageName)

    const sourceAction = findAction(manifest, sourceActionName)
    if (sourceAction) {
        const patchedAction = Object.assign(sourceAction, {actionName: action.actionName})
        return lookupActionHandler(patchedAction).deploy(ow, args, patchedAction)
    }

    const params = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}
    
    const qname = names.makeQName(null, action.packageName, action.actionName)

    return getAction(ow, sourceActionName)
        .then(deployCopyAction(ow, qname, params, annotations, limits))
        .then(reporter.action(qname, sourceActionName, '<copied>', params))
        .catch(reporter.action(qname, sourceActionName, '<copied>', params))
}

const dependsOnCopy = (namespace, action) => {
    return [names.resolveQName(action.copy, namespace, action.packageName)]
}

const getAction = (ow, actionName) => {
    return ow.actions.get({ actionName })
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

const handleSequence = (ow, args, action) => {
    const manifest = args.manifest
    const components = getComponents(manifest.namespace, action.packageName, action.sequence)
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
    const qname = names.makeQName(null, action.packageName, action.actionName)
    return helpers.deployRawAction(ow, qname, sequence)
        .then(reporter.action(qname, '', 'sequence', parameters))
        .catch(reporter.action(qname, '', 'sequence', parameters))
}

const getComponents = (namespace, pkgName, sequence) => {
    const actions = sequence.split(',')
    let components = []
    for (const i in actions) {
        const component = names.resolveQName(actions[i], namespace, pkgName)
        // TODO: check component exists?

        components.push(component)
    }
    return components
}

const dependsOnSequence = (namespace, action) => {
    return getComponents(namespace, action.packageName, action.sequence)
}


// --- Docker action

const handleImage = (ow, args, action) => {
    const manifest = args.manifest
    const image = action.image
    const parameters = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}
    const wskaction = {
        exec: {
            kind: 'blackbox',
            image
        },
        parameters,
        annotations,
        limits
    }
    const qname = names.makeQName(null, action.packageName, action.actionName)
    return helpers.deployRawAction(ow, qname, wskaction)
        .then(reporter.action(qname, '', 'image', parameters))
        .catch(reporter.action(qname, '', 'image', parameters))
}


// --- Code

const handleCode = (ow, args, action) => {
    if (!action.hasOwnProperty('kind'))
        throw new Error(`Missing property 'kind' in packages/actions/${action.actionName}`)

    let kind = action.kind
    let code = action.code

    switch (kind) {
        case 'nodejs':
            kind = 'nodejs:default'
        // fallthrough
        case 'nodejs:default':
        case 'nodejs:6':
            code = `function main(params) { ${code} }`
            break
        case 'nodejs:6':
        default:
            throw new Error(`Unsupported action kind ${kind}`)
    }

    const parameters = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}
    const wskaction = {
        exec: { kind, code },
        parameters,
        annotations,
        limits
    }
    const qname = names.makeQName(null, action.packageName, action.actionName)

    return helpers.deployRawAction(ow, qname, wskaction)
        .then(reporter.action(qname, '', kind, parameters))
        .catch(reporter.action(qname, '', kind, parameters))
}
 
// --- Fallback

const handleDefaultAction = (ow, args, action) => {
    const pkgName = action.packageName
    const actionName = action.actionName
    if (!action.hasOwnProperty('location')) {
        throw new Error(`Missing property 'location' in ${pkgName}/actions/${actionName}`)
    }

    action.location = path.resolve(args.basePath, action.location)
    helpers.normalizeLocation(action)
    const kind = helpers.getKind(action)
    if (!kind) {
        throw new Error(`Could not automatically determined 'kind' in ${pkgName}/actions/${actionName}`)
    }

    const params = helpers.getKeyValues(action.inputs, args)
    const annotations = helpers.getKeyValues(action.annotations, args)
    const limits = action.limits || {}

    const binary = helpers.getBinary(action, kind)
    const qname = names.makeQName(null, pkgName, actionName)

    return buildAction(args, kind, action)
        .then(args.load)
        .then(helpers.deployAction(ow, qname, params, annotations, limits, kind, binary))
        .then(reporter.action(qname, args.location, kind, params))
        .catch(reporter.action(qname, args.location, kind, params))
}

// --- Plugin

const handlePluginAction = plugin => (ow, args, action) => {
    const context = { pkgName: action.packageName, actionName: action.actionName, action }
    let entities = plugin.getEntities(context)
    if (!Array.isArray(entities))
        entities = [entities]

    const promises = []
    for (const newaction of entities) {
        // handle only actions for now
        if (!newaction.hasOwnProperty('actionName'))
            throw new Error(`Plugin ${plugin.__pluginName} returned an invalid entity ${JSON.stringify(entity)}`)

        newaction.packageName = action.packageName
        const promise = lookupActionHandler(newaction).deploy(ow, args, newaction)
        promises.push(promise)
    }
    return Promise.all(promises)
}

// --- Handlers manager

const actionsHandlers = {
    sequence: {
        deploy: handleSequence,
        dependsOn: dependsOnSequence
    },
    copy: {
        deploy: handleCopy,
        dependsOn: dependsOnCopy
    },
    code: {
        deploy: handleCode,
        dependsOn: () => []
    },
    image: {
        deploy: handleImage,
        dependsOn: () => []
    }
}

const lookupActionHandler = action => {
    for (const name in actionsHandlers) {
        if (action.hasOwnProperty(name))
            return actionsHandlers[name]
    }

    const plugin = plugins.getActionPlugin(action)
    if (plugin) {

        return {
            deploy: handlePluginAction(plugin),
            dependsOn: () => [] // maybe not
        }
    }

    return {
        deploy: handleDefaultAction,
        dependsOn: () => []
    }
}
exports.lookupActionHandler = lookupActionHandler


// --- Asset builders

// TODO: deprecate
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