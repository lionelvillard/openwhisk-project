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
 
// --- Sequence

const handleSequence = (ctx, action) => {
    const manifest = ctx.manifest
    const components = action.sequence
    const parameters = utils.getKeyValues(action.inputs)
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
    return utils.deployRawAction(ctx, action._qname, sequence);
}

// const getComponents = (namespace, pkgName, sequence) => {
//     const actions = sequence.split(',')
//     let components = []
//     for (const i in actions) {
//         const component = names.resolveQName(actions[i], namespace, pkgName)
//         // TODO: check component exists?

//         components.push(component)
//     }
//     return components
// }

const dependsOnSequence = (namespace, action) => {
    return action.sequence
}

// --- Docker action

const handleImage = (ctx, action) => {
    const manifest = ctx.manifest
    const image = action.image
    const parameters = utils.getKeyValues(action.inputs)
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
    return utils.deployRawAction(ctx, action._qname, wskaction);
}

// --- Code

const handleCode = (ctx, action) => {
    const kind = action.kind;
    const code = action.code;
    const parameters = utils.getKeyValues(action.inputs)
    const annotations = utils.getAnnotations(ctx, action.annotations)
    const limits = action.limits || {}
    const wskaction = {
        exec: { kind, code },
        parameters,
        annotations,
        limits
    }
    return utils.deployRawAction(ctx, action._qname, wskaction);
}

// --- Fallback

async function handleDefaultAction(ctx, action) {
    const kind = action.kind;

    const parameters = utils.getKeyValues(action.inputs)
    const annotations = utils.getAnnotations(ctx, action.annotations)
    const limits = action.limits || {}

    const artifact = await build(ctx, action);
    const content = await load(ctx, artifact.location);

    const code = Buffer.from(content).toString(artifact.binary ? 'base64' : 'utf8');
    const main = action.main;

    return await utils.deployRawAction(ctx, action._qname, { exec: { kind, code, main }, parameters, annotations, limits });
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
export async function build(config, action) {
    if (action.builder && action.builder.name) {
        const { namespace, pkg, name } = names.parseQName(action._qname);
        const builddir = path.join(config.cache, 'build', pkg, name);

        const bname = action.builder.name;
        const plugin = plugins.getActionBuilderPlugin(bname);

        if (plugin) {
            return await plugin.build(config, pkg, name, action, builddir);
        }
        config.logger.fatal(`Could not find builder ${bname}`);
    }
    return {
        location: action.location,
        binary: action.kind === 'java'
    }
}
