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
const fs = require('fs')
const simpleGit = require('simple-git')
const logger = require('log4js').getLogger()

const names = require('./names')
const utils = require('./utils')
const handlers = require('./handlers')
const helpers = require('./helpers')
const init = require('./init')

export default async function deploy(args) {
    await init.init(args);

    try {
        await deployIncludes(args);
        await deployPackages(args, false); // bindings
        await deployPackages(args, true);  // new packages
        await deployActions(args);
        await deployTriggers(args);
        await deployRules(args);
        await deployApis(args);
    } catch (e) {
        logger.error(e)
        return Promise.reject(e)
    }
}

const deployIncludes = (args) => {
    const manifest = args.manifest
    args.manifest.namespace = '_'
    if (manifest.hasOwnProperty('includes')) {
        const includes = manifest.includes

        let promises = []

        // TODO: check for cycles!!

        for (const include of includes) {

            const location = include.location
            const github = location.trim().match(/^github\.com\/([^/]*)\/([^/]*)(\/(.*))?$/)

            if (!github) {
                throw `Invalid GitHub repository: ${location}`
            }
            const owner = github[1]
            const repo = github[2]
            const path = github[4] || ''
            const targetDir = `${args.basePath}/deps/${repo}`

            let subdeploy = {
                ow: args.ow,
                basePath: `${targetDir}/${path}`,
                cache: args.cache,
                location: 'manifest.yaml',
                logger_level: args.logger_level,
                force: args.force
            }

            const promise = checkFileExists(targetDir)
                .then(cloneRepo(owner, repo, targetDir))
                .then(() => {
                    logger.debug(`sub-deploy ${location}`)
                    return deploy(subdeploy)
                })

            promises.push(promise)
        }
        return Promise.all(promises)
    }

    return true
}

const cloneRepo = (owner, repo, targetDir) => exists => new Promise(resolve => {
    if (exists)
        resolve()
    else {
        logger.debug(`Clone github repository ${owner}/${repo} in ${targetDir}`)
        simpleGit().clone(`https://github.com/${owner}/${repo}`, targetDir, () => {
            resolve()
        })
    }
})

// Deploy packages (excluding bindings, and package content)
function deployPackages(args, bindings) {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('packages')) {
        const packages = manifest.packages
        const promises = []
        for (const name in packages) {
            const pkg = packages[name] || {}

            // Skip package bindings when bindings is false
            const hasBind = pkg.hasOwnProperty('bind')

            if ((hasBind && bindings) || (!hasBind && !bindings)) {
                let binding = {}
                if (bindings) {
                    const qname = names.parseQName(pkg.bind)

                    binding = {
                        namespace: qname.namespace,
                        name: qname.name
                    }
                }
                const parameters = helpers.getKeyValues(pkg.inputs)
                const annotations = utils.getAnnotations(args, pkg.annotations)
                const publish = pkg.hasOwnProperty('publish') ? pkg.publish : false

                const cmd = deployPackage(args.ow, name, parameters, annotations, binding, publish);

                promises.push(cmd)
            }
        }
        if (promises.length != 0)
            return Promise.all(promises)
    }
    return true
}

function deployPackage(ow, name, parameters, annotations, binding, publish) {
    return ow.packages.change({
        name,
        package: {
            publish,
            parameters,
            annotations,
            binding
        }
    })
}

const deployPendingActions = (ctx, graph) => {
    const actions = helpers.pendingActions(graph)
    if (actions) {
        const promises = []

        for (const qname in actions) {
            const entry = actions[qname]
            const action = entry.action
            const promise = handlers.lookupActionHandler(action).deploy(ctx, action)
            promises.push(promise)
        }

        helpers.commitActions(actions)

        return Promise.all(promises)
            .then(reportAction1 => deployPendingActions(ctx, graph).then(reportAction2 => [...reportAction1, ...reportAction2]))
    }

    const remaining = helpers.remainingActions(graph)
    if (remaining) {
        const keys = Object.keys(remaining).join(', ')
        return Promise.reject(`Error: cyclic dependencies detected (${keys})`)
    }

    return Promise.resolve([])
}

function deployActions(ctx) {
    const manifest = ctx.manifest
    const graph = helpers.dependenciesGraph(manifest)
    return deployPendingActions(ctx, graph);
}

function deployTriggers(args) {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('triggers')) {
        const triggers = manifest.triggers

        const promises = []
        for (const triggerName in triggers) {
            const trigger = triggers[triggerName] || {}
            const isFeed = trigger.hasOwnProperty('feed')

            const parameters = helpers.getKeyValues(trigger.inputs, args)
            const annotations = utils.getAnnotations(args, trigger.annotations)
            const publish = trigger.hasOwnProperty('publish') ? trigger.publish : false

            let triggerBody: any = {
                annotations,
                publish
            }
            if (isFeed) {
                annotations.feed = trigger.feed;
            } else {
                triggerBody.parameters = parameters
            }

            let cmd = args.ow.triggers.change({
                triggerName,
                trigger: triggerBody,
                parameters,
                annotations}); 


            if (isFeed) {
                cmd = cmd
                    .then(() => deployFeedAction(args, trigger.feed, triggerName, parameters))
                    

            }

            promises.push(cmd)
        }

        if (promises.length != 0)
            return Promise.all(promises);
    }
    return true
} 

const deployFeedAction = (args, feed, triggerName, parameters) => {
    // Invoke action creating feed action sending events to the specified trigger name
    let params = {
        lifecycleEvent: 'CREATE',
        triggerName,
        authKey: args.ow.namespaces.client.options.api_key
    }

    // if feedArgPassed {
    //     flags.common.annotation = append(flags.common.annotation, getFormattedJSON("feed", flags.common.feed))
    // }

    // transform parameters
    for (let i in parameters) {
        let p = parameters[i]

        // TODO: check for name conflicts

        params[p.key] = p.value
    }

    return invokeAction(args.ow, feed, params)
}

const invokeAction = (ow, actionName, params) => {
    return ow.actions.invoke({
        actionName,
        blocking: true,
        params
    }).catch(e => true ); // ignore for now. See issue #39
}

function deployRules(args) {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('rules')) {
        const rules = manifest.rules
        const promises = []
        for (let ruleName in rules) {
            let rule = rules[ruleName]

            let cmd = deployRule(args.ow, ruleName, rule.trigger, rule.action)

            promises.push(cmd)
        }
        if (promises.length != 0)
            return Promise.all(promises)
    }
    return true
}


const deployRule = (ow, ruleName, trigger, action) => {
    return ow.rules.change({
        ruleName,
        action,
        trigger
    })
}

// --- Apis

enum API_VERBS { GET, PUT, POST, DELETE, PATCH, HEAD, OPTIONS };


async function deployApis(args) {
    const manifest = args.manifest;
    const apis = manifest.apis;
    if (apis) {
        const promises = [];
        for (const apiname in apis) {
            const api = apis[apiname];

            const basepath = api.basePath;
            if (!basepath)
                throw `Missing basePath property for API ${apiname}`;

            const paths = api.paths;
            if (paths) {
                for (const relpath in paths) {
                    const verbs = paths[relpath];
                    for (const verb in verbs) {

                        if (!(verb.toUpperCase() in API_VERBS))
                            throw `Invalid API verb: ${verb} for API ${apiname}`;

                        const action = verbs[verb];
                        const route = { basepath, relpath, operation: verb, action };
                        args.logger.info(`Add route ${JSON.stringify(route, null, 2)}`);
                       
                        const cmd = args.ow.routes.create(route);

                        promises.push(cmd)
                    }
                }
            } else {
                args.logger.info('no paths for API ${apiname}');
            }
        }
        if (promises.length != 0)
            return Promise.all(promises)
    }
}

// -- Utils

function checkFileExists(file) {
    return new Promise(resolve => {
        fs.exists(file, result => resolve(result))
    })
}
