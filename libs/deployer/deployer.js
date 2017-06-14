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
const names = require('@openwhisk-libs/names')
const utils = require('@openwhisk-deploy/utils')
const yaml = require('yamljs')
const nodegit = require('nodegit')
const fakeow = require('./libs/fakeow')
const path = require('path')
const archiver = require('archiver')
const {exec} = require('child_process')

/**
 * Deploy OpenWhisk entities (actions, sequence, rules, etc...)
 *
 * @param {Object} [ow]                       - OpenWhisk client. Perform a dry-run if not provided.
 * @param {Object} args
 * @param {Object|string} [args.manifest]     - manifest used for deployment
 * @param {string} [args.location]            - manifest location. Ignored if manifest is provided
 * @param {string} [args.cache]               - cache location
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
    configLoader(args)

    if (!ow || args.dryrun)
        ow = fakeow

    try {
        return resolveManifest(ow, args)
            .then(configCache(args))
            .then(deployIncludes(ow, args))
            .then(deployPackages(ow, args))
            .then(deployBindings(ow, args))
            .then(deployActions(ow, args))
            .then(deploySequences(ow, args))
            .then(deployTriggers(ow, args))
            .then(deployRules(ow, args))
            .catch(e => {
                console.log(e)
                return e
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

const loadManifest = args => {
    return args.load(args.location)
        .then(content => {
            // TODO: bad side-effect
            args.manifest = yaml.parse(content)
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
            const path = github.length == 5 ? github[4] : ''
            const targetDir = `${args.basePath}/deps/${repo}`

            let subdeploy = {
                basePath: `${targetDir}/${path}`,
                cache: args.cache,
                location: 'manifest.yaml'
            }

            const promise = cloneRepo(owner, repo, targetDir)
                .then(() => deploy(ow, subdeploy))

            promises.push(promise)
        }
        return Promise.all(promises)
            .then(report => ({
                includes: report
            }))
    }

    return Promise.resolve({})
}

const cloneRepo = (owner, repo, targetDir) => {
    return nodegit.Clone(`https://github.com/${owner}/${repo}`, targetDir, {checkoutBranch: 'master'})
}

// Deploy packages (excluding bindings, and package content)
const deployPackages = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('packages')) {
        const packages = manifest.packages
        const promises = []
        for (const name in packages) {
            const pkg = packages[name]

            // Skip package bindings
            if (!pkg.hasOwnProperty('bind')) {
                const cmd = ow.packages.create({name})
                    .then(() => ({
                        name
                    }))

                promises.push(cmd)
            }
        }

        return Promise.all(promises)
            .then(result => Object.assign(report, {packages: result}))
    }
    return Promise.resolve(report)
}

const deployBindings = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('packages')) {
        const packages = manifest.packages
        const promises = []
        for (const name in packages) {
            const pkg = packages[name]

            if (pkg.hasOwnProperty('bind')) {
                const qname = names.parseQName(pkg.bind)
                const parameters = getParams(pkg.inputs, args)

                const cmd = ow.packages.create({
                    name,
                    package: {
                        binding: {
                            namespace: qname.namespace,
                            name: qname.name
                        },
                        parameters
                    }
                })

                promises.push(cmd)
            }
        }
        if (promises.length == 0)
            return Promise.resolve(report)

        return Promise.all(promises)
            .then(result => Object.assign(report, {bindings: result}))
    }
    return Promise.resolve(report)
}

const deployActions = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('packages')) {
        const packages = manifest.packages
        const promises = []
        for (const pkgName in packages) {
            const pkg = packages[pkgName]

            if (pkg.hasOwnProperty('actions')) {
                let actions = pkg.actions
                for (const actionName in actions) {
                    let action = actions[actionName]

                    if (!action.hasOwnProperty('location')) {
                        throw `Missing property 'location' in packages/actions/${actionName}`
                    }
                    if (!action.hasOwnProperty('zip'))
                        action.zip = false

                    const location = resolvePath(args, action.location)
                    const params = getParams(action.inputs, args)
                    const kind = getKind(action)
                    const binary = getBinary(action, kind)
                    const qname = `${pkgName}/${actionName}`

                    let cmd = buildAction(args, location, kind, action.zip)
                        .then(args.load)
                        .then(deployAction(ow, qname, params, kind, binary))
                        .then(() => ({
                            name: qname
                        }))

                    promises.push(cmd)
                }
            }
        }
        return Promise.all(promises)
            .then(result => Object.assign(report, {actions: result}))
    }
    return Promise.resolve(report)
}

const deployAction = (ow, actionName, parameters, kind, binary) => content => {
    let action = binary ? new Buffer(content).toString('base64') : content
    return ow.actions.create({
        actionName,
        action,
        kind,
        parameters
    })
}

const deploySequences = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('packages')) {
        const packages = manifest.packages
        const promises = []
        for (const name in packages) {
            const pkg = packages[name]

            if (pkg.hasOwnProperty('sequences')) {
                const sequences = pkg.sequences
                for (let actionName in sequences) {
                    const sequence = sequences[actionName]
                    actionName = `${pkgName}/${actionName}`

                    let components = []

                    if (!sequence.hasOwnProperty('actions'))
                        throw `Missing property 'actions' on sequence ${actionName}.`

                    let actions = sequence.actions.split(',')
                    for (let i in actions) {
                        let component = names.resolveQName(actions[i], manifest.namespace, name)
                        components.push(component)
                    }
                    let cmd = ow.actions.update({
                        actionName,
                        action: {
                            exec: {
                                kind: 'sequence',
                                components: components
                            }
                        }
                    }).then(() => ({
                        name: actionName
                    }))

                    promises.push(cmd)
                }
            }
        }
        if (promises.length == 0)
            return Promise.resolve(report)

        return Promise.all(promises)
            .then(result => Object.assign(report, {sequences: result}))
    }
    return Promise.resolve(report)
}

const deployTriggers = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('triggers')) {

        const triggers = manifest.triggers

        let promises = []
        for (let triggerName in triggers) {
            let trigger = triggers[triggerName]
            let cmd = deployTrigger(ow, args, triggerName, trigger)
            if (trigger.source) {
                cmd = deployFeedAction(cmd, ow, args, triggerName, trigger)
            }
            promises.push(cmd)
        }

        return Promise.all(promises)
            .then(result => Object.assign(report, {triggers: result}))
    }
    return Promise.resolve(report)
}

const deployTrigger = (ow, args, triggerName, trigger) => {
    return ow.triggers.update({
        triggerName
    }).then(result => {
        console.log(`trigger ${triggerName} deployed.`)
        return result
    })
}

const deployFeedAction = (cmd, ow, args, triggerName, trigger) => {
    // Invoke action creating feed action sending events to the specified trigger name
    let parameters = getParams(trigger.inputs, args)
    let params = {}
    for (let i in parameters) {
        let p = parameters[i]
        params[p.key] = p.value
    }

    params.lifecycleEvent = 'CREATE'
    params.triggerName = `${args.manifest.package.name}/${triggerName}`
    params.authKey = args.auth

    return cmd
        .then(() => ow.actions.invoke({
            actionName: trigger.source,
            blocking: true,
            params
        })).then(result => {
            console.log(`feed ${trigger.source} created for trigger ${triggerName}.`)
            return result
        })
}

const deployRules = (ow, args) => report => {
    const manifest = args.manifest
    if (manifest.hasOwnProperty('rules')) {
        const rules = manifest.rules
        const promises = []
        for (let ruleName in rules) {
            let rule = rules[ruleName]

            let cmd = ow.rules.update({
                ruleName,
                action: rule.action,
                trigger: rule.trigger
            })

            promises.push(cmd)
        }
        return Promise.all(promises)
            .then(result => Object.assign(report, {rules: result}))
    }
    return Promise.resolve(report)
}

// -- Utils

const kindsForExt = {
    '.js': 'nodejs:default',
    '.py': 'python:default',
    '.swift': 'swift:default',
    '.jar': 'java:default'
}

function getKind(action) {
    if (action.hasOwnProperty('kind'))
        return action.kind

    // Try to infer the kind
    const p = path.parse(action.location)
    const kind = kindsForExt[p.ext]
    if (kind)
        return kind

    return 'blackbox'
}

function getBinary(action, kind) {
    if (kind.startsWith('java') || action.zip)
        return true

    return false
}

function haveRepo(args) {
    return args.hasOwnProperty('owner') && args.hasOwnProperty('repo') && args.hasOwnProperty('sha')
}

function getParams(inputs, args) {
    let params = []
    for (let key in inputs) {
        params.push({
            key,
            value: resolveValue(inputs[key], args)
        })
    }
    return params
}

function resolveValue(value, args) {
    if (value.startsWith('$')) {
        let key = value.substr(1)
        if (args.env && args.env[key])
            return args.env[key]

        return process.env[key]
    }
    return value
}


// --- Asset builders

const buildAction = (context, location, kind, zip) => {
    const basekind = kind.split(':')[0]
    switch (basekind) {
        case 'nodejs':
            return buildNodejsAction(context, location, zip)
        default:
            throw `Unsupported action kind: ${kind}`
    }

    return location
}

const buildNodejsAction = (context, location, zip) => {
    if (!zip)
        return Promise.resolve(location)

    // Directory structure
    // .cache
    //   - path/to/action
    //      - src
    //      file.zip

    const baseCache = path.dirname(context.cache)
    const cacheDir = path.basename(context.cache)
    const baseLoc = path.dirname(location)

    const baseLocInCache = path.dirname(path.resolve(context.cache, path.relative(baseCache, location)))
    const srcLocInCache = path.join(baseLocInCache, '/src')
    const ziplocInCache = path.join(baseLocInCache, 'action.zip')

    const copyOptions = {
        preserveTimestamps: true,
        filter: src => {
            const basename = path.basename(src)
            //console.log(src)

            // TODO: read .npmignore

            if (basename === cacheDir)
                return false

            return true
        }
    }

    return fse.mkdirs(`${baseLocInCache}/src`)
        .then(() => fse.copy(baseLoc, srcLocInCache, copyOptions))
        .then(npmInstall(srcLocInCache))
        .then(makeZip(ziplocInCache, srcLocInCache))
        .then(() => Promise.resolve(ziplocInCache))
}


const npmInstall = (src) => () => new Promise((resolve, reject) => {
    // use external npm which must exist
    const nodepath = process.execPath
    const npmpath = path.normalize(`${path.dirname(nodepath)}/../libexec/npm/bin/npm`)

    const execOptions = {
        cwd: src
    }

    exec(`${npmpath} install`, execOptions, (error, stdout, stderr) => {
            if (error)
                return reject(error)
            resolve()
        }
    )
})

const makeZip = (targetZip, src) => () => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetZip)
    const archive = archiver('zip', {
        zlib: {level: 9}
    })

    output.on('close', () => {
        resolve()
    })

    archive.on('error', err => {
        reject(err)
    })

    // pipe archive data to the file
    archive.pipe(output)

    // append files from src directory
    archive.directory(src, '.')

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    archive.finalize()

})

// --- Asset loaders

const localLoader = {

    make: args => {
        return localLoader.load
    },

    load: location => {
        return new Promise((resolve, reject) => {
            fs.readFile(location, (err, content) => {
                if (err)
                    reject(err)
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

const resolvePath = (args, location) => {
    return path.resolve(args.basePath, location)
}


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
