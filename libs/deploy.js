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
const reporter = require('./reporter')
const handlers = require('./handlers')
const helpers = require('./helpers')
const init = require('./init')

// Deploy OpenWhisk entities (actions, sequence, rules, etc...)
async function deploy(args) {
    await init.init(args);
    
    logger.debug('setup promises')

    try {
        return deployIncludes(args)
            .then(deployPackages(args, false)) // bindings
            .then(deployPackages(args, true))  // new packages
            .then(deployActions(args))
            .then(deployTriggers(args))
            .then(deployRules(args))
            .catch(e => {
                logger.error(e)
                return Promise.reject(e)
            })
    } catch (e) {
        logger.error(JSON.stringify(e));
        return Promise.reject({ error: e })
    }
}
module.exports = deploy;

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
        return Promise.all(promises).then(reporter.entity({}, 'includes'))
    }

    return Promise.resolve({})
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
const deployPackages = (args, bindings) => report => {
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

                const cmd = deployPackage(args.ow, name, parameters, annotations, binding, publish)
                    .then(reporter.package(name))
                    .catch(reporter.package(name))

                promises.push(cmd)
            }
        }
        if (promises.length != 0)
            return Promise.all(promises).then(reporter.entity(report, 'packages'))
    }
    return Promise.resolve(report)
}

const deployPackage = (ow, name, parameters, annotations, binding, publish) => {
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

const deployActions = (ctx) => report => {
    const manifest = ctx.manifest
    const graph = helpers.dependenciesGraph(manifest)
    return deployPendingActions(ctx, graph)
        .then(reportActions => (reportActions.length > 0) ? reporter.entity(report, 'actions')(reportActions) : report)
}

const deployTriggers = args => report => {
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

            const triggerBody = {
                annotations,
                publish
            }
            if (!isFeed) {
                triggerBody.parameters = parameters
            }

            let cmd = deployTrigger(args.ow, args, triggerName, triggerBody)
                .then(reporter.trigger(triggerName))
                .catch(reporter.trigger(triggerName))

            if (isFeed) {
                cmd = cmd
                    .then(deployFeedAction(args, trigger.feed, triggerName, parameters))
            }

            promises.push(cmd)
        }

        if (promises.length != 0)
            return Promise.all(promises).then(reporter.entity(report, 'triggers'))
    }
    return Promise.resolve(report)
}

const deployTrigger = (ow, args, triggerName, trigger) => {
    return ow.triggers.change({
        triggerName,
        trigger
    })
}

const deployFeedAction = (args, feed, triggerName, parameters) => report => {
    // Invoke action creating feed action sending events to the specified trigger name

    // transform parameters
    const params = {}
    for (let i in parameters) {
        let p = parameters[i]
        params[p.key] = p.value
    }

    // TODO: check for name conflicts

    params.lifecycleEvent = 'CREATE'
    params.triggerName = triggerName
    params.authKey = args.ow.namespaces.client.options.api_key

    return invokeAction(args.ow, feed, params)
        .then(reporter.feed(report, feed, params))
        .catch(reporter.feed(report, feed, params))
}

const invokeAction = (ow, actionName, params) => {
    return ow.actions.invoke({
        actionName,
        blocking: true,
        params
    })
}

const deployRules = args => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('rules')) {
        const rules = manifest.rules
        const promises = []
        for (let ruleName in rules) {
            let rule = rules[ruleName]

            let cmd = deployRule(args.ow, ruleName, rule.trigger, rule.action)
                .then(reporter.rule(ruleName))
                .catch(reporter.rule(ruleName))

            promises.push(cmd)
        }
        if (promises.length != 0)
            return Promise.all(promises).then(reporter.entity(report, 'rules'))
    }
    return Promise.resolve(report)
}

const deployRule = (ow, ruleName, trigger, action) => {
    return ow.rules.change({
        ruleName,
        action,
        trigger
    })
}

// -- Utils
 
const checkFileExists = file => new Promise(resolve => {
    fs.exists(file, result => resolve(result))
})
