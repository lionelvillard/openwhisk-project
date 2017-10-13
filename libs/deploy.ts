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
import * as fs from 'fs';
import { getLogger } from 'log4js'

import * as names from './names';
import * as utils from './utils';
import * as handlers from './handlers';
import * as init from './init';

export async function apply(config) {
    await init.init(config);
    try {
        config.setProgress('deploying...');
        
        // Renable when supporting multiple namespace deployment
        // await deployIncludes(args);

        await deployPackages(config, false); // bindings
        await deployPackages(config, true);  // new packages
        await deployActions(config);
        await deployTriggers(config);
        await deployRules(config);
        await deployApis(config);

        config.setProgress('deployed');
    } catch (e) {
        config.logger.error(e)
        return Promise.reject(e)
    }
}

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
                const parameters = utils.getKeyValues(pkg.inputs)
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

function deployActions(config) {
    const manifest = config.manifest
    const graph = dependenciesGraph(manifest);
    config.setProgress('deploying action (:current/:total)', Object.keys(graph).length);
    return deployPendingActions(config, graph);
}

function deployPendingActions(ctx, graph) {
    const actions = pendingActions(graph);
    if (actions) {
        const promises = []

        for (const qname in actions) {
            const entry = actions[qname]
            const action = entry.action
            const promise = handlers.lookupActionHandler(action).deploy(ctx, action)
            promises.push(promise.then(()=> ctx.progress.tick()))
        }

        commitActions(actions);

        return Promise.all(promises).then(() => deployPendingActions(ctx, graph))
    }

    const remaining = remainingActions(graph)
    if (remaining) {
        const keys = Object.keys(remaining).join(', ')
        return Promise.reject(`Error: cyclic dependencies detected (${keys})`)
    }

    return Promise.resolve([])
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

            const parameters = utils.getKeyValues(trigger.inputs)
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

function deployRules(config) {
    const manifest = config.manifest;
    if (manifest.hasOwnProperty('rules')) {
        const rules = manifest.rules;
        const promises = [];
        for (let ruleName in rules) {
            let rule = rules[ruleName]

            let cmd = deployRule(config, ruleName, rule.trigger, rule.action);

            promises.push(cmd)
        }
        if (promises.length != 0)
            return Promise.all(promises)
    }
    return true
}


const deployRule = (config, ruleName, trigger, action) => {
    return config.ow.rules.change({
        ruleName,
        action,
        trigger
    }).then(() => config.logger.info(`[RULE] [CREATED] ${ruleName}`));
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

// -- Dependency graph

/* Compute a dependency graph of the form
   
   {
       "/ns/pkgname/actionname": { 
           action,
           deployed: false|true,
           dependencies: [ actionqname ]
       }
       ...
   } 

   /_/pkgname/actionname can be deployed when all its dependencies have been marked as deployed
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


// Add action to graph.
function extendGraph(graph, ns, pkgName, actionName, action) {
    const dependencies = handlers.lookupActionHandler(action).dependsOn(ns, action);
    graph[action._qname] = {
        action,
        deployed: false,
        dependencies
    };
}

function nodependencies(graph, entry) {
    for (const qname of entry.dependencies) {
        const dependency = graph[qname];
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
