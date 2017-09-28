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

// Builtin deployment handlers.

import * as utils from './utils';
import * as names from './names';
import * as path from 'path';
import * as plugins from './pluginmgr';
import * as fs from 'fs-extra';

const helpers = require('./helpers')

// --- Sequence

const handleSequence = (ctx, action) => {
    const manifest = ctx.manifest
    const components = getComponents(manifest.namespace, action.packageName, action.sequence)
    const parameters = helpers.getKeyValues(action.inputs, ctx)
    const annotations = utils.getAnnotations(ctx, action.annotations)
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
    return utils.deployRawAction(ctx, qname, sequence);
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

const handleImage = (ctx, action) => {
    const manifest = ctx.manifest
    const image = action.image
    const parameters = helpers.getKeyValues(action.inputs, ctx)
    const annotations = utils.getAnnotations(ctx, action.annotations)
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
    const qname = names.makeQName('_', action.packageName, action.actionName)
    return utils.deployRawAction(ctx, qname, wskaction);
}

// --- Code

const handleCode = (ctx, action) => {
    if (!action.hasOwnProperty('kind'))
        throw new Error(`Missing property 'kind' in packages/actions/${action.actionName}`)

    const kind = helpers.getKind(action);
    const code = action.code;
    const parameters = helpers.getKeyValues(action.inputs, ctx)
    const annotations = utils.getAnnotations(ctx, action.annotations)
    const limits = action.limits || {}
    const wskaction = {
        exec: { kind, code },
        parameters,
        annotations,
        limits
    }
    const qname = names.makeQName('_', action.packageName, action.actionName)

    return utils.deployRawAction(ctx, qname, wskaction);
}

// --- Fallback

// TODO: consider making this a plugin.

async function handleDefaultAction(ctx, action) {
    const pkgName = action.packageName
    const actionName = action.actionName
    
    const kind = helpers.getKind(action)
    if (!kind) {
        throw new Error(`Could not automatically determined 'kind' in ${pkgName}/actions/${actionName}`)
    }

    const parameters = helpers.getKeyValues(action.inputs, ctx)
    const annotations = utils.getAnnotations(ctx, action.annotations)
    const limits = action.limits || {}

    const qname = names.makeQName('_', pkgName, actionName)

    const artifact = await build(ctx, pkgName, actionName, action);
    const content = await load(ctx, artifact.location);

    const code = Buffer.from(content).toString(artifact.binary ? 'base64' : 'utf8');

    return await utils.deployRawAction(ctx, qname, { exec: { kind, code }, parameters, annotations, limits });
}

// --- Handlers manager

const actionsHandlers = {
    sequence: {
        deploy: handleSequence,
        dependsOn: dependsOnSequence
    },
    code: {
        deploy: handleCode,
        dependsOn: () => []
    },
    image: {
        deploy: handleImage,
        dependsOn: () => []
    },
    location: {
        deploy: handleDefaultAction,
        dependsOn: () => []
    }
}

export function lookupActionHandler(action) {
    for (const name in actionsHandlers) {
        if (action.hasOwnProperty(name))
            return actionsHandlers[name]
    }
    throw `Internal Error: invalid action ${JSON.stringify(action, null, 2)}`;
}

async function load(config, location: string) {
    config.logger.debug(`read local file ${location}`);
    const content = await fs.readFile(location);
    return content;
};

// Generate action artifact to deploy
export async function build(config, pkgName, actionName, action) {
    if (action.builder) {
        // const isFile = fs.statSync(action.location).isFile();
        // let builddir = isFile ? path.join(path.dirname(action.location), 'build') : path.join(action.location, 'build');
        // //const builddir = isFile ? path.join(path.dirname(action.location), 'build') : path.join(action.location, 'build');
        const builddir = path.join(config.cache, 'build', pkgName, actionName);

        const name = action.builder.name;
        const plugin = plugins.getActionBuilderPlugin(name);
        return await plugin.build(config, pkgName, actionName, action, builddir);
    }
    return {
        location: action.location,
        binary: false
    }
}
 