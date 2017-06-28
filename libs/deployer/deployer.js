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
const fse = require('fs-extra')
const yaml = require('yamljs')
const path = require('path')
const simpleGit = require('simple-git')
const logger = require('log4js').getLogger()

const names = require('@openwhisk-libs/names')
const utils = require('@openwhisk-deploy/utils')
const fakeow = require('./libs/fakeow')
const reporter = require('./libs/reporter')
const handlers = require('./libs/handlers')
const helpers = require('./libs/helpers')
const plugins = require('./libs/pluginmgr')

/**
 * Deploy OpenWhisk entities (actions, sequence, rules, etc...)
 *
 * @param {Object}        [ow]                - OpenWhisk client. Perform a dry-run if not provided.
 * @param {Object}        args
 * @param {Object|string} [args.manifest]     - manifest used for deployment
 * @param {string}        [args.location]     - manifest location. Ignored if manifest is provided
 * @param {string}        [args.cache]        - cache location
 * @param {boolean}       [args.force]        - perform update operation when true. Default is 'false'
 * @param {string}        [args.logger_level] - logger level ('ALL', 'FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OFF')
 *
 * @param {Object} args.assets.conf           - assets loader configuration
 * @param {string} args.assets.conf.kind      - kind of loader (0=local, 1=github)
 * @param {string} [args.assets.conf.owner]   - github owner
 * @param {string} [args.assets.conf.repo]    - github repo
 * @param {string} [args.assets.conf.sha]     - github sha.
 * @param {string} [args.assets.conf.release] - github release containing pre-built assets.
 *
 * @param {Object} [args.env]                 - the environment use to resolve $xx variables. Precede process.env.
 *
 * @return {Object} a deployment report.
 */
const deploy = (ow, args) => {
    logger.setLevel('OFF')
    if (args.logger_level)
        logger.setLevel(args.logger_level)

    if (!ow || args.dryrun)
        ow = fakeow

    configLoader(args)
    configOW(ow, args)

    logger.debug('setup promises')

    try {
        return resolveManifest(ow, args)
            .then(configCache(args))
            .then(plugins.init)
            .then(deployIncludes(ow, args))
            .then(deployPackages(ow, args, false)) // bindings
            .then(deployPackages(ow, args, true))  // new packages
            .then(deployActions(ow, args))
            .then(deploySequences(ow, args))
            .then(deployTriggers(ow, args))
            .then(deployRules(ow, args))
            .catch(e => {
                logger.error(e)
                return Promise.reject(e)
            })
    } catch (e) {
        return Promise.reject({error: e})
    }
}
exports.deploy = deploy

const configLoader = args => {
    let kind = ((args.hasOwnProperty('assets') && args.assets.hasOwnProperty('conf')) ? args.assets.conf.kind : 0) || 0
    if (kind < 0 || kind >= loaders.length)
        throw `Invalid asset loader configuration. Kind ${kind} unsupported.`

    args.load = loaders[kind].make(args)
}

const configOW = (ow, args) => {
    if (!args.force || args.force === false) {
        ow.packages.change = ow.packages.create
        ow.triggers.change = ow.triggers.create
        ow.routes.change = ow.routes.create
        ow.actions.change = ow.actions.create
        ow.feeds.change = ow.feeds.create
        ow.rules.change = ow.rules.create
    } else {
        ow.packages.change = ow.packages.update
        ow.triggers.change = ow.triggers.update
        ow.routes.change = ow.routes.update
        ow.actions.change = ow.actions.update
        ow.feeds.change = ow.feeds.update
        ow.rules.change = ow.rules.update
    }
}

const loadManifest = args => {
    return args.load(args.location)
        .then(content => {
            // TODO: bad side-effect
            args.manifest = yaml.parse(content)
        })
        .catch(err => {
            return Promise.reject(err) // propagate error
        })
}

const resolveManifest = (ow, args) => {
    if (args.manifest || args.manifest === '') {
        if (typeof args.manifest === 'string') {
            args.manifest = yaml.parse(args.manifest) || {}
        }
        args.basePath = args.basePath || process.cwd()
        return Promise.resolve()
    }

    if (args.location) {
        args.location = path.resolve(args.basePath || process.cwd(), args.location)
        args.basePath = path.parse(args.location).dir

        return loadManifest(args)
    }

    throw 'No valid manifest found'
}

const configCache = args => () => {
    if (!args.cache) {
        args.cache = `${args.basePath}/.wskdeploy`
        return fse.mkdirs(args.cache) // async since using fs-extra
    }

    return Promise.resolve()
}

const deployIncludes = (ow, args) => () => {
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
                    return deploy(ow, subdeploy)
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
const deployPackages = (ow, args, bindings) => report => {
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
                const annotations = helpers.getKeyValues(pkg.annotations)
                const publish = pkg.hasOwnProperty('publish') ? pkg.publish : false

                const cmd = deployPackage(ow, name, parameters, annotations, binding, publish)
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

const deployActions = (ow, args) => report => {
    const manifest = args.manifest
    const graph = helpers.dependenciesGraph(manifest)
    let promises

    while (true) {
        const actions = helpers.pendingActions(graph)

        if (!actions)
            break
        const subpromises = []
        for (const qname in actions) {
            const entry = actions[qname]
            const promise = handlers.lookupActionHandler(entry.action).deploy(ow, args, entry.pkgName, entry.actionName, entry.action)
            subpromises.push(promise)
        }

        helpers.commitActions(actions)
        if (promises) {
            promises = promises
                .then(reportActions1 => Promise.all(subpromises).then(reportActions2 => [...reportActions1, ...reportActions2]))
        } else {
            promises = Promise.all(subpromises)
        }
    }

    const remaining = helpers.remainingActions(graph)
    if (remaining) {
        const keys = Object.keys(remaining).join(', ')
        return Promise.reject(`Error: cyclic dependencies detected (${keys})`)
    }

    if (promises) {
        return promises.then(reporter.entity(report, 'actions'))
    }
    return Promise.resolve(report)
}


const deploySequences = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('packages')) {
        const packages = manifest.packages
        const promises = []
        for (const pkgName in packages) {
            const pkg = packages[pkgName] || {}

            if (pkg.hasOwnProperty('sequences')) {
                const sequences = pkg.sequences
                for (let actionName in sequences) {
                    const sequence = sequences[actionName]
                    actionName = `${pkgName}/${actionName}`

                    let components = []

                    if (!sequence.hasOwnProperty('sequence'))
                        throw `Missing property 'sequence' on sequence ${actionName}.`

                    let actions = sequence.sequence.split(',')
                    for (let i in actions) {
                        const component = names.resolveQName(actions[i], manifest.namespace, pkgName)

                        // TODO: check component exists?

                        components.push(component)
                    }
                    const parameters = helpers.getKeyValues(sequence.inputs, args)
                    const annotations = helpers.getKeyValues(sequence.annotations, args)
                    const limits = sequence.limits || {}

                    const action = {
                        exec: {
                            kind: 'sequence',
                            components
                        },
                        parameters,
                        annotations,
                        limits
                    }

                    let cmd = helpers.deployRawAction(ow, actionName, action)
                        .then(reporter.action(actionName, '', 'sequence', parameters))
                        .catch(reporter.action(actionName, '', 'sequence', parameters))

                    promises.push(cmd)
                }
            }
        }
        if (promises.length != 0)
            return Promise.all(promises).then(reporter.entity(report, 'sequences'))
    }
    return Promise.resolve(report)
}

const deployTriggers = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('triggers')) {
        const triggers = manifest.triggers

        const promises = []
        for (const triggerName in triggers) {
            const trigger = triggers[triggerName] || {}
            const isFeed = trigger.hasOwnProperty('feed')

            const parameters = helpers.getKeyValues(trigger.inputs, args)
            const annotations = helpers.getKeyValues(trigger.annotations, args)
            const publish = trigger.hasOwnProperty('publish') ? trigger.publish : false

            const triggerBody = {
                annotations,
                publish
            }
            if (!isFeed) {
                triggerBody.parameters = parameters
            }

            let cmd = deployTrigger(ow, args, triggerName, triggerBody)
                .then(reporter.trigger(triggerName))
                .catch(reporter.trigger(triggerName))

            if (isFeed) {
                cmd = cmd
                    .then(deployFeedAction(ow, args, trigger.feed, triggerName, parameters))
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

const deployFeedAction = (ow, args, feed, triggerName, parameters) => report => {
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
    params.authKey = ow.namespaces.client.options.api_key

    return invokeAction(ow, feed, params)
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

const deployRules = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('rules')) {
        const rules = manifest.rules
        const promises = []
        for (let ruleName in rules) {
            let rule = rules[ruleName]

            let cmd = deployRule(ow, ruleName, rule.trigger, rule.action)
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

function haveRepo(args) {
    return args.hasOwnProperty('owner') && args.hasOwnProperty('repo') && args.hasOwnProperty('sha')
}


// --- Asset loaders

const localLoader = {

    make: args => {
        return localLoader.load
    },

    load: location => {
        return new Promise((resolve, reject) => {
            logger.debug(`read local file ${location}`)
            fs.readFile(location, (err, content) => {
                if (err)
                    reject(err)
                else
                    resolve(Buffer.from(content).toString())
            })
        })

    }
}

const githubLoader = {

    make: (args) => {
        if (!utils.haveRepo(args))
            throw `Missing GitHub configuration.`
        let conf = args.assets.conf
        return localLoader.load(conf.owner, conf.repo, conf.release)
    },

    load: (owner, repo, release) => location => {
        let cmd
        if (zip) {
            // Stored as an asset.
            cmd = fetchAsset(args.owner, args.repo, args.release, location.replace('/', '.'))
        } else {
            // Just fetch raw content
            cmd = utils.fetchContent(args, location)
        }
    }
}

const loaders = [
    localLoader, githubLoader
]


// Search for asset id corresponding to asset name
const searchAssetId = (release, assetName) => {
    let assets = release.assets

    for (let i in assets) {
        let asset = assets[i]
        if (asset.name === 'manifest.yaml') {
            return asset.id
        }
    }

    return undefined
}

// Fetch release asset by name
const fetchAsset = (owner, repo, release, assetName) => {
    if (typeof release !== 'object') {
        return {
            deployed: false,
            reason: `Missing GitHub release with asset ${assetName}`
        }
    }

    let assetId = searchAssetId(release, assetName)

    if (assetId) {
        return request({
            uri: `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`,
            headers: {
                'User-Agent': 'Apache OpenWhisk Deploy',
                Accept: 'application/octet-stream'
            }
        }).then(result => {
            console.log(`fetched ${assetName}`)
            return result
        })
    }

    return Promise.reject(`Missing ${assetName} asset.`)
}


const checkFileExists = file => new Promise(resolve => {
    fs.exists(file, result => resolve(result))
})
