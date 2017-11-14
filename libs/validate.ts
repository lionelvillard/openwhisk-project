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
import {
    IConfig, IProject, IPackage, IAction, IApi, ProjectProps, ActionProps, Contribution,
    ISyntaxContribution
} from './types';

import * as fs from 'fs-extra';
import * as yaml from 'yamljs';
import * as path from 'path';
import * as plugins from './pluginmgr';
import { evaluate, evaluateAll } from './interpolation';
import { parse } from 'url';
import * as utils from './utils';
import * as names from './names';
import * as simpleGit from 'simple-git/promise';
import * as stringify from 'json-stringify-safe';
import * as progress from 'progress';
import * as env from './env';
import * as semver from 'semver';
import { format } from "util";

/* Expand and validate the project configuration file. */
export async function check(config: IConfig) {
    config.startProgress('validating project configuration');
    const manifest = config.manifest;

    if (config.version && manifest.version) {
        if (config.version !== manifest.version)
            config.fatal(`mismatch environment and configuration versions (${config.version} != ${manifest.version})`);
    }
    manifest.namespace = manifest.namespace || '_';

    if (config.ow && (!manifest.namespace || manifest.namespace === '_')) {
        const namespaces = await config.ow.namespaces.list();
        config.logger.debug(namespaces);
        manifest.namespace = namespaces && namespaces.length > 0 ? namespaces[0] : '_';
    }
    config.logger.info(`target namespace: ${manifest.namespace}`);

    // 1. load dependencies. They might contain plugins needed to validate the project
    await checkDependencies(config, manifest);

    // 2. Check for unknown properties
    manifest.resources = manifest.resources || {};
    for (const key in manifest) {
        if (!(key in ProjectProps)) {
            manifest.resources[key] = manifest[key];
            delete manifest[key];
        }
    }

    // 3. Expand and check builtin properties
    await checkResources(config, manifest);
    await checkPackages(config, manifest);
    await checkActions(config, manifest, '', manifest.actions);
    await checkTriggers(config, manifest);
    await checkRules(config, manifest);
    await checkApis(config, manifest);

    config.clearProgress();
}

async function checkResources(config: IConfig, manifest: IProject) {
    const resources = evaluateAll(config, manifest.resources);
    if (!resources)
        return;

    for (const id in resources) {
        const service = resources[id];

        if (!service.hasOwnProperty('type'))
            config.fatal('missing property type for resource id %s', id);

        delete resources[id];
    }
}

async function checkDependencies(config: IConfig, manifest: IProject) {
    const dependencies = evaluateAll(config, manifest.dependencies);
    if (!dependencies)
        return;

    // Inline dependencies
    for (const dependency of dependencies) {
        if (!dependency.location)
            config.fatal('missing location in %s', dependency);

        let location = dependency.location.trim();
        if (location.startsWith('git+')) {
            location = await gitClone(config, dependency);
        } else {
            // File.
            location = path.resolve(config.basePath, location);
        }

        // Currently only support one namespace so merge and resolve path!
        const includedProject = yaml.load(location);
        const basePath = path.dirname(location);
        mergeProject(config, basePath, includedProject);

        // Load plugins provided by the dependency
        const pluginPath = path.join(basePath, 'plugin');
        if (await fs.pathExists(pluginPath)) {
            await plugins.registerFromPath(config, pluginPath);
        }
    }
    delete manifest.dependencies;
}

async function checkPackages(config: IConfig, manifest) {
    const packages = manifest.packages;

    // bindings
    for (const pkgName in packages) {
        await checkPackage(config, manifest, packages, pkgName, packages[pkgName], true);
    }

    // non-bindings
    for (const pkgName in packages) {
        await checkPackage(config, manifest, packages, pkgName, packages[pkgName], false);
    }
}

async function checkPackage(config: IConfig, manifest, packages, pkgName, pkg, binding: boolean) {
    switch (typeof pkg) {
        case 'string':
            packages[pkgName] = await evaluate(config, pkg);
            break;
        case 'object':
            if (pkg.bind) {
                // TODO
            } else if (pkg.service) {
                // Service bindings are implemented as plugins.
                delete packages[pkgName];

                const plugin = plugins.getServiceBindingPlugin(pkg.service);
                if (!plugin)
                    config.fatal('no plugin found for service binding %s', pkg.service);

                const contributions = plugin.serviceBindingContributor(config, pkgName, pkg);
                await applyContributions(config, manifest, contributions, plugin);
            } else {
                if (!binding)
                    await checkActions(config, manifest, pkgName, pkg.actions);
            }
            break;
        default:
            throw config.fatal(`${JSON.stringify(pkg)} is not a valid value`);
    }
}

async function checkActions(config: IConfig, manifest, pkgName: string, actions: IAction) {
    if (!actions)
        return;

    for (const actionName in actions) {
        const action = actions[actionName];
        await checkAction(config, manifest, pkgName, actions, actionName, action);
    }
}

async function checkAction(config: IConfig, manifest, pkgName: string, actions, actionName: string, action: IAction) {
    // 1. evaluate expressions
    action = evaluateAll(config, action, ['.code']);

    // 2. Expand unknown properties.
    for (const key in action) {
        if (!(key in ActionProps)) {
            const plugin = plugins.getActionPlugin(action, key);
            if (!plugin) {
                config.fatal(`Invalid property ${key} in action ${actionName}`);
            }
            delete actions[actionName];
            const contributions = await plugin.actionContributor(config, manifest, pkgName, actionName, action);
            await applyContributions(config, manifest, contributions, plugin); // will call check!

            return;
        }
    }

    // 3. At this point, all unkown properties have been expanded.

    action._qname = names.resolveQName(actionName, manifest.namespace, pkgName);
    checkBuilder(config, pkgName, actionName, action);

    if (action.hasOwnProperty('location')) { // builtin basic action
        action.location = resolveActionLocation(config, config.basePath, pkgName, actionName, action.location);
        action.kind = resolveKind(action);
        action.main = resolveMain(action);

    } else if (action.hasOwnProperty('sequence')) { // builtin sequence action
        action.sequence = resolveComponents(manifest.namespace, pkgName, action.sequence);
        // TODO
    } else if (action.hasOwnProperty('code')) { // builtin inlined action
        action.kind = resolveKind(action);
        action.main = resolveMain(action);

    } else if (action.hasOwnProperty('image')) { // builtin docker action

        // TODO
    } else {
        config.fatal('Invalid action %s: missing either location, sequence, code or image property', actionName);
    }
}

async function checkTriggers(config: IConfig, manifest: IProject) {
    let triggers = manifest.triggers;
    if (triggers) {
        // 1. evaluate expressions
        triggers = evaluateAll(config, triggers);

        // 2. TODO: check
    }
}

async function checkRules(config: IConfig, manifest) {
    let rules = manifest.rules;
    if (rules) {
        rules = evaluateAll(config, rules);

        for (const ruleName in rules) {
            const rule = rules[ruleName];

            if (!rule)
                throw new Error(`Invalid rule ${ruleName}: missing properties`);

            if (!rule.trigger)
                throw new Error(`Invalid rule ${ruleName}: missing trigger property`);
            if (!rule.action)
                throw new Error(`Invalid rule ${ruleName}: missing action property`);
            if (!rule.status)
                rule.status = 'active';

            if (rule.status !== 'active' && rule.status !== 'inactive')
                throw new Error(`Invalid rule ${ruleName}: status property must either be 'active' or 'inactive'. Got ${rule.status}`);
        }
    }
}

async function checkApis(config: IConfig, manifest) {
    let apis = manifest.apis;
    if (apis) {
        apis = evaluateAll(config, apis);

        for (const apiname in apis) {
            const api = apis[apiname];
            await checkApi(config, manifest, apis, apiname, api);
        }
    }
}

async function checkApi(config: IConfig, manifest, apis, apiname: string, api: IApi) {
    if (api.basePath) { // builtin api
        if (!api['x-ibm-configuration']) {
            api['x-ibm-configuration'] = generateAssembly(config, apiname, api);
        }

        api.info = { title: api.basePath };
    } else {
        delete apis[apiname];

        const plugin = plugins.getApiPlugin(api);
        if (!plugin) {
            config.logger.warn(`no plugin found for api ${apiname}. Ignored`);
            return;
        }
        config.logger.debug(`getting contribution from plugin ${(plugin as any).__pluginName}`);

        const contributions = await plugin.apiContributor(config, manifest, apiname, api);
        await applyContributions(config, manifest, contributions, plugin);
    }
}

// --- API gateway

enum API_VERBS { GET, PUT, POST, DELETE, PATCH, HEAD, OPTIONS }

function pathToOperationId(filepath: string) {
    return filepath.replace(/\/(.)/g, (_, $1) => $1.toUpperCase());
}

function getURL(config: IConfig, qname: string) {
    let { namespace, pkg, name } = names.resolveQNameParts(qname, config.manifest.namespace, null);
    if (config.envname === 'api') {
        // redirect to prod
        // TODO: apihost api != apihost prod
        namespace = evaluate(config, '${vars.bluemix_org}_${self.name}-prod@${vars.PRODVERSION}');
    }

    return `${utils.getAPIHost(config)}web/${namespace}/${pkg ? pkg : 'default'}/${name}.http`; // TODO: reponse type
}

function generateAssembly(config: IConfig, apiname: string, api: IApi) {
    const operations = [];
    if (api.paths) {
        const paths = api.paths;
        for (const apipath in paths) {
            const verbs = paths[apipath];
            for (const verb in verbs) {
                if (!(verb.toUpperCase() in API_VERBS))
                    config.fatal(`Invalid API verb: ${verb} for API ${apiname}`);

                const action = verbs[verb];
                const operationId = `${verb.toLowerCase()}${pathToOperationId(apipath)}`;
                const url = getURL(config, action);

                verbs[verb] = { operationId, 'x-openwhisk': { namespace: '_', action, url } };

                operations.push({
                    operations: [operationId],
                    execute: [{
                        invoke: {
                            'target-url': url,
                            'verb': 'keep'
                        }
                    }]
                });
            }
        }
    }
    return {
        assembly: {
            execute: [{
                'operation-switch': {
                    case: operations
                }
            }]
        }
    };
}

// --- Plugin contributions

async function applyContributions(config: IConfig, manifest: IProject, contributions: Contribution[], plugin) {
    if (contributions) {
        for (const contrib of contributions) {
            switch (contrib.kind) {
                case 'action':
                    const pkg = utils.getPackage(manifest, contrib.pkgName, true);
                    if (!pkg.actions)
                        pkg.actions = {};

                    if (pkg.actions[contrib.name]) {
                        config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.name}`);
                    }

                    pkg.actions[contrib.name] = contrib.body;
                    await checkAction(config, manifest, contrib.pkgName, pkg.actions, contrib.name, contrib.body);
                    break;
                case 'api':
                    if (!manifest.apis)
                        manifest.apis = {};
                    const apis = manifest.apis;

                    if (apis[contrib.name]) {
                        config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.name}`);
                    }

                    apis[contrib.name] = contrib.body;
                    await checkApi(config, manifest, apis, contrib.name, contrib.body);
                    break;
                case 'package':
                    if (!manifest.packages)
                        manifest.packages = {};
                    const pkgs = manifest.packages;

                    if (pkgs[contrib.name]) {
                        config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.name}`);
                    }

                    pkgs[contrib.name] = contrib.body;
                    await checkPackage(config, manifest, pkgs, contrib.name, contrib.body, true);
                    await checkPackage(config, manifest, pkgs, contrib.name, contrib.body, false);
                    break;
                case 'service':
                    break;

            }
        }
    }
}

// --- Project configuration merge

function mergeProject(config: IConfig, basePath: string, project: IProject) {
    if (project.basePath)
        basePath = path.resolve(basePath, project.basePath);

    config.logger.debug(`included project basePath ${basePath}`);

    const targetProject = config.manifest;

    // -- includes

    if (project.dependencies) {
        config.fatal('Nested inclusion not supported yet');
    }

    // -- actions in default packages

    if (project.actions) {
        mergeActions(config, basePath, '', targetProject, project.actions, true);
    }

    // -- packages

    if (project.packages) {
        if (!targetProject.hasOwnProperty('packages'))
            targetProject.packages = {};

        for (const pkgName in project.packages) {
            // TODO: could support merging packages
            if (targetProject.packages.hasOwnProperty(pkgName))
                config.fatal(`A conflict occurred while attempting to include the package ${pkgName} from ${basePath}`);

            const pkg = project.packages[pkgName];

            if (pkg.actions)
                mergeActions(config, basePath, pkgName, pkg, pkg.actions, false);

            targetProject.packages[pkgName] = pkg;
        }
    }

    // -- triggers

    if (project.triggers) {
        if (!targetProject.hasOwnProperty('triggers'))
            targetProject.triggers = {};

        for (const triggerName in project.triggers) {
            if (targetProject.triggers.hasOwnProperty(triggerName))
                config.fatal(`A conflict occurred while attempting to include the trigger ${triggerName} from ${basePath}`);
            targetProject.triggers[triggerName] = project.triggers[triggerName];
        }
    }

    // -- rules

    if (project.rules) {
        if (!targetProject.hasOwnProperty('rules'))
            targetProject.rules = {};

        for (const ruleName in project.rules) {
            if (targetProject.rules.hasOwnProperty(ruleName))
                config.fatal(`A conflict occurred while attempting to include the rule ${ruleName} from ${basePath}`);
            targetProject.rules[ruleName] = project.rules[ruleName];
        }
    }

    // -- apis

    if (project.apis) {
        if (!targetProject.hasOwnProperty('apis'))
            targetProject.apis = {};

        for (const apiname in project.apis) {
            if (targetProject.apis.hasOwnProperty(apiname))
                config.fatal(`A conflict occurred while attempting to include the api ${apiname} from ${basePath}`);

            targetProject.apis[apiname] = project.apis[apiname];
        }
    }
}

function mergeActions(config: IConfig, basePath: string, pkgName: string, pkg: IPackage, actions: { [key: string]: IAction }, checkConflict: boolean) {
    if (!pkg.hasOwnProperty('actions'))
        pkg.actions = {};

    for (const actionName in actions) {
        if (checkConflict && pkg.actions.hasOwnProperty(actionName))
            config.fatal(`A conflict occurred while attempting to include the action ${actionName} from ${basePath}`);

        const action = actions[actionName];
        if (action.hasOwnProperty('location'))
            action.location = resolveActionLocation(config, basePath, '', actionName, action.location);

        pkg.actions[actionName] = action;
    }
}

async function gitClone(config: IConfig, include) {
    const location = include.location.substr(4);

    const gitIdx = location.indexOf('.git');
    if (gitIdx === -1)
        config.fatal(`Malformed git repository ${location} (missing .git)`);

    let localDir;
    let repo = location.substring(0, gitIdx + 4);
    if (repo.startsWith('ssh://')) {
        repo = repo.substr(6);
        // must be of the form git@<hostname>:<user>/<repository>.git

        const matched = repo.match(/^git@([^:]+):([^\/]+)\/(.+)\.git$/);
        if (!matched)
            config.fatal(`Malformed git repository ${repo}`);
        localDir = path.join(config.cache, 'git', matched[2], matched[3]);
    } else {
        const parsed = parse(repo);

        const pathIdx = parsed.path.indexOf('.git');
        const srepo = parsed.path.substring(0, pathIdx);
        localDir = path.join(config.cache, 'git', srepo);
    }

    if (await fs.pathExists(localDir)) {
        config.logger.debug(`git fetch ${repo} in ${localDir}`);
        await simpleGit(localDir).fetch(null, null, ['--all']);

    } else {
        await fs.ensureDir(localDir);
        config.logger.debug(`git clone ${repo} in ${localDir}`);
        await simpleGit(localDir).clone(repo, '.');
    }

    const hashIdx = location.indexOf('#');
    if (hashIdx !== -1) {
        const hash = location.substr(hashIdx);
        // TODO: check syntax

        await simpleGit(localDir).checkout(hash);
    }

    let projectFilePath = location.substr(gitIdx + 5);
    if (hashIdx !== -1)
        projectFilePath = projectFilePath.substring(0, projectFilePath.indexOf('#'));

    return path.join(localDir, projectFilePath);
}

function resolveActionLocation(config: IConfig, basePath: string, pkgName: string, actionName: string, location: string) {
    if (path.isAbsolute(location))
        return location;

    if (!location) {
        location = pkgName ? path.join('packages', pkgName) : '';
        location = path.join(location, 'actions', actionName);
    }
    location = path.resolve(basePath, location);
    if (fs.statSync(location).isDirectory()) {
        if (fs.existsSync(path.join(location, 'Dockerfile')))
            location = path.join(location, 'Dockerfile');
        else if (fs.existsSync(path.join(location, 'package.json')))
            location = path.join(location, 'package.json');
        else if (fs.existsSync(path.join(location, `${actionName}.js`)))
            location = path.join(location, `${actionName}.js`);
    }

    if (!fs.existsSync(location))
        config.fatal('Action location does not exist %s', location);

    return location;
}

const kindsForExt = {
    '.js': 'nodejs:6',
    '.py': 'python:2',
    '.swift': 'swift:3.1.1',
    '.jar': 'java',
    '.php': 'php'
};

const actualKinds = {
    'nodejs': 'nodejs:6',
    'nodejs:6': 'nodejs:6',
    'nodejs:default': 'nodejs:6',
    'python': 'python:2',
    'python:2': 'python:2',
    'python:3': 'python:3',
    'java': 'java',
    'php': 'php:7.1',
    'swift': 'swift:3.1.1',
    'swift:3.1.1': 'swift:3.1.1',
    'swift:3': 'swift:3'
};

function resolveKind(action) {
    let actual;
    if (action.kind) {
        actual = actualKinds[action.kind];
        if (actual)
            return actual;
    }

    if (action.image)
        return 'blackbox';

    // location must be a file. (see resolveActionLocation)
    if (action.location) {
        const p = path.parse(action.location);
        if (p.base === 'package.json')
            return 'nodejs:6';

        if (p.base === 'Dockerfile')
            return 'blackbox';

        actual = kindsForExt[p.ext];
        if (actual)
            return actual;
    }

    throw action.kind ? `Invalid action kind ${action.kind}` : `Missing action kind.`;
}

function resolveMain(action) {
    switch (action.kind) {
        case 'java':
            if (!action.main)
                throw new Error('Missing action main');

            return action.main;
        case 'php:7.1':
        case 'python:2':
        case 'python:3':
            return action.main || 'main';
    }
}

function checkBuilder(config: IConfig, pkgName, actionName, action) {
    if (action.builder && action.builder.name) {
        if (!action.builder.dir)
            action.builder.dir = path.join(config.cache, 'build', pkgName, actionName);

        const builderName = action.builder.name;
        const plugin = plugins.getActionBuilderPlugin(builderName);

        if (plugin)
            action.builder._exec = plugin.build;
        else
            config.fatal(`Could not find builder ${builderName}`);
    }
}

function resolveComponents(namespace, pkgName, sequence) {
    const actions = sequence.split(',');
    return actions.map(action => names.resolveQName(action, namespace, pkgName));
}
