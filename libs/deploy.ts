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

export async function apply(args) {
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

function deployIncludes(args) {
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
                    return apply(subdeploy)
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

function deployPendingActions(ctx, graph) {
    const actions = pendingActions(graph)
    if (actions) {
        const promises = []

        for (const qname in actions) {
            const entry = actions[qname]
            const action = entry.action
            const promise = handlers.lookupActionHandler(action).deploy(ctx, action)
            promises.push(promise)
        }

        commitActions(actions)

        return Promise.all(promises)
            .then(reportAction1 => deployPendingActions(ctx, graph).then(reportAction2 => [...reportAction1, ...reportAction2]))
    }

    const remaining = remainingActions(graph)
    if (remaining) {
        const keys = Object.keys(remaining).join(', ')
        return Promise.reject(`Error: cyclic dependencies detected (${keys})`)
    }

    return Promise.resolve([])
}

function deployActions(ctx) {
    const manifest = ctx.manifest
    const graph = dependenciesGraph(manifest)
    return deployPendingActions(ctx, graph);
}

function deployTriggers(args) {
    const manifest = args.manifest;
    const triggers = manifest.triggers;
    if (triggers) {
        const ow = args.ow;
        const promises = [];
        for (const triggerName in triggers) {
            const trigger = triggers[triggerName] || {};
            const feed = trigger.feed;

            const parameters = helpers.getKeyValues(trigger.inputs, args)
            const annotations = utils.getAnnotations(args, trigger.annotations)
            const publish = trigger.hasOwnProperty('publish') ? trigger.publish : false

            let triggerBody: any = {
                annotations,
                publish
            }

            if (feed) {
                // this will help for deleting the feed
                annotations.feed = trigger.feed;
            } else {
                triggerBody.parameters = parameters
            }

            let promise = ow.triggers.change({
                triggerName,
                trigger: triggerBody,
                parameters,
                annotations
            }).then(() => args.logger.info(`[TRIGGER] [CREATED] ${triggerName}`));

            if (feed) {
                // transform parameters { .. : key , : value } to { key: value } 
                let params = {};
                for (const p of parameters) {
                    params[p.key] = p.value
                }
                promise = promise.then(() => args.ow.feeds.change({ name: feed, trigger: triggerName, params }))
                    .then(() => args.logger.info(`[FEED] [CREATED] ${feed}`))
                    .catch(e => true); // Ignore for now See issue #41
            }

            promises.push(promise);
        }

        if (promises.length != 0)
            return Promise.all(promises);
    }
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


// -- Dependency graph


// Add action to graph.
function extendGraph(graph, ns, pkgName, actionName, action) {
    action.actionName = actionName;
    action.packageName = pkgName;

    const dependencies = handlers.lookupActionHandler(action).dependsOn(ns, action);
    const qname = `${pkgName}/${actionName}`;
    if (graph[qname])
        throw new Error(`Duplicate action ${qname}`);

    graph[`${pkgName}/${actionName}`] = {
        action,
        deployed: false,
        dependencies
    };
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
function dependenciesGraph(manifest) {
    const graph = {};

    // Process default package
    let actions = manifest.actions || {};
    for (const actionName in actions) {
        extendGraph(graph, manifest.namespace, '', actionName, actions[actionName]);
    }

    // Process named-packages
    const packages = manifest.packages || {};

    for (const pkgName in packages) {
        const pkg = packages[pkgName] || {};

        actions = pkg.actions || {};
        for (const actionName in actions) {
            extendGraph(graph, manifest.namespace, pkgName, actionName, actions[actionName]);
        }
    }

    return graph;
}

function nodependencies(graph, entry) {
    for (const qname of entry.dependencies) {
        const parts = names.parseQName(qname);
        const dependency = graph[`${parts.pkg}/${parts.name}`];
        if (dependency && !dependency.deployed)
            return false;
    }
    return true;
}

// Get the list of actions that can be deployed
function pendingActions(graph) {
    const actions = {};
    let hasActions = false;
    for (const qname in graph) {
        const entry = graph[qname];
        if (!entry.deployed && nodependencies(graph, entry)) {
            actions[qname] = entry;
            hasActions = true;
        }
    }
    return hasActions ? actions : null;
}

// Mark actions as deployed
function commitActions(actions) {
    for (const qname in actions) {
        const entry = actions[qname];
        entry.deployed = true;
    }
}

// Gets the remaining action to deploy, independently of their dependencies
function remainingActions(graph) {
    const actions = {};
    let hasActions = false;
    for (const qname in graph) {
        const entry = graph[qname]
        if (!entry.deployed) {
            actions[qname] = entry;
            hasActions = true;
        }
    }
    return hasActions ? actions : null;
}

// --- 