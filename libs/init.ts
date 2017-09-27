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
import { getLogger, configure } from 'log4js';
import * as fs from 'fs-extra';
import * as yaml from 'yamljs';
import * as path from 'path';
import * as types from './types';
import * as plugins from './pluginmgr';
import * as expandHome from 'expand-home-dir';
import { evaluate } from './interpolation';
import { parse } from 'url';
import * as utils from './utils';
import * as simpleGit from 'simple-git/promise'

export async function init(config: types.Config) {
    if (!config.logger)
        config.logger = getLogger();

    config.logger_level = config.logger_level || process.env.LOGGER_LEVEL || 'off';
    config.logger.setLevel(config.logger_level);

    if (!config.ow) {
        config.ow = fakeow;
        config.dryrun = true;
        config.logger.debug('dryrun mode');
    }

    const ow = config.ow;
    if (!config.force) {
        ow.packages.change = ow.packages.create;
        ow.triggers.change = ow.triggers.create;
        ow.routes.change = ow.routes.create;
        ow.actions.change = ow.actions.create;
        ow.feeds.change = ow.feeds.create;
        ow.rules.change = ow.rules.create;
    } else {
        ow.packages.change = ow.packages.update;
        ow.triggers.change = ow.triggers.update;
        ow.routes.change = ow.routes.update;
        ow.actions.change = ow.actions.update;
        ow.feeds.change = ow.feeds.create;  // update? See issue #41
        ow.rules.change = ow.rules.update;
    }
    config.ow = ow;

    await plugins.init(config);
    await resolveManifest(config);
    await configCache(config);
    configVariableSources(config);

    await check(config);

    config.logger.debug(JSON.stringify(config, null, 2));
}

async function resolveManifest(config: types.Config) {
    config.logger.info('loading configuration');
    if (config.manifest || config.manifest === '') {

        if (typeof config.manifest === 'string') {
            config.manifest = yaml.parse(config.manifest) || {};
        }
        config.basePath = config.basePath || process.cwd();
    } else if (config.location) {
        config.location = path.resolve(config.basePath || process.cwd(), config.location);
        config.basePath = path.parse(config.location).dir;

        await loadManifest(config);
    } else {
        config.logger.debug('no configuration found');
    }

    if (config.manifest) {
        if (config.manifest.basePath)
            config.basePath = path.resolve(config.basePath, config.manifest.basePath);

        config.manifest.namespace = '_'; // For now   
    }



    config.logger.debug(`base path set to ${config.basePath}`);
    // ok no manifest, fine.
}

async function loadManifest(config: types.Config) {
    const content = await fs.readFile(config.location);
    config.manifest = yaml.parse(Buffer.from(content).toString());
}

async function configCache(config: types.Config) {
    if (!config.cache) {
        if (config.basePath)
            config.cache = `${config.basePath}/.openwhisk`
        else
            config.cache = expandHome('~/.openwhisk')

        await fs.mkdirs(config.cache) // async since using fs-extra
    } else {
        config.cache = path.resolve(config.cache);
    }

    config.logger.debug(`caching directory set to ${config.cache}`);
}

function configVariableSources(config: types.Config) {
    if (!config.variableSources) {
        // TODO: configurable
        config.variableSources = [
            (config, name) => process.env[name],
            plugins.getVariableSourcePlugin('wskprops').resolveVariable
        ];
    }
}


// perform:
// - validation 
// - normalization (remove syntax sugar, resolve location)
// - interpolation (evaluate ${..})
async function check(config: types.Config) {
    const manifest = config.manifest;

    if (!manifest)
        return

    config.logger.debug('normalizing project configuration');


    await checkIncludes(config, manifest);

    if (manifest.actions)
        await checkActions(config, manifest, '', manifest.actions);

    await checkPackages(config, manifest);
    await checkApis(config, manifest);

    // check for invalid additional properties
    for (const key in manifest) {
        if (!(key in types.deploymentProperties)) {
            config.logger.warn(`property /${key} ignored`);
        }
    }
}

async function checkIncludes(config: types.Config, manifest) {
    const includes = manifest.includes;
    if (includes) {
        for (const include of includes) {
            if (!include.location)
                throw `Missing location in ${include}`;

            let location = include.location.trim();
            if (location.startsWith('git+')) {
                location = await gitClone(config, include);
            } else {
                // File.
                location = path.resolve(config.basePath, location);
            }

            // Currently only support one namespace so merge and resolve path!
            const includedProject = yaml.load(location);
            const basePath = path.dirname(location);
            mergeProject(config, basePath, includedProject);
        }
        delete manifest.includes;
    }
}

async function checkPackages(config: types.Config, manifest) {
    const packages = manifest.packages;

    for (const pkgName in packages) {
        await checkPackage(config, manifest, packages, pkgName, packages[pkgName]);
    }
}

async function checkPackage(config: types.Config, manifest, packages, pkgName, pkg) {
    switch (typeof pkg) {
        case 'string':
            packages[pkgName] = pkg = pkg.trim();
            if (pkg.startsWith('$')) {
                packages[pkgName] = pkg = await evaluate(config, pkg);
                await checkPackage(config, manifest, packages, pkgName, pkg);
            } else if (pkg.length() !== 0) {
                throw `${JSON.stringify(pkg)} is not a valid value`;
            }
            break;
        case 'object':
            if (pkg.bind) {

            } else if (pkg.service) {
                delete packages[pkgName];

                const plugin = plugins.getServicePlugin(pkg.service);
                if (!plugin) {
                    config.logger.warn(`no plugin found for service ${pkg.service}. Ignored`);
                    return;
                }

                const contributions = await plugin.serviceContributor(config, pkgName, pkg);
                await applyConstributions(config, manifest, contributions, plugin);
            } else {
                await checkActions(config, manifest, pkgName, pkg.actions);
            }
            break;
        default:
            throw `${JSON.stringify(pkg)} is not a valid value`;
    }
}

async function checkActions(config: types.Config, manifest, pkgName: string, actions) {
    for (const actionName in actions) {
        const action = actions[actionName];
        await checkAction(config, manifest, pkgName, actions, actionName, action);
    }
}

async function checkAction(config: types.Config, manifest, pkgName: string, actions, actionName: string, action: types.Action) {
    if (action.hasOwnProperty('location')) { // builtin basic action
        action.location = resolveActionLocation(config.basePath, pkgName, actionName, action.location);

    } else if (action.sequence) { // builtin sequence action

        // TODO
    } else if (action.copy) { // builtin copy action

        // TODO
    } else if (action.code) { // builtin inlined action

        // TODO
    } else if (action.docker) { // builtin docker action

        // TODO
    } else {
        delete actions[actionName];

        const plugin = plugins.getActionPlugin(action);
        if (!plugin) {
            config.logger.warn(`no plugin found for action ${actionName}. Ignored`);
            return;
        }

        const contributions = await plugin.actionContributor(config, manifest, pkgName, actionName, action);
        await applyConstributions(config, manifest, contributions, plugin);
    }
}

async function checkApis(config: types.Config, manifest) {
    const apis = manifest.apis;

    for (const apiname in apis) {
        const api = apis[apiname];
        await checkApi(config, manifest, apis, apiname, api);
    }
}

async function checkApi(config: types.Config, manifest, apis, apiname: string, api: types.Api) {
    if (api.paths) { // builtin api
    } else {
        delete apis[apiname];

        const plugin = plugins.getApiPlugin(api);
        if (!plugin) {
            config.logger.warn(`no plugin found for api ${apiname}. Ignored`);
            return;
        }
        config.logger.debug(`getting contribution from plugin ${(<any>plugin).__pluginName}`);

        const contributions = await plugin.apiContributor(config, manifest, apiname, api);
        await applyConstributions(config, manifest, contributions, plugin);
    }
}

// --- Plugin contributions

async function applyConstributions(config: types.Config, manifest: types.Project, contributions: types.Contribution[], plugin) {
    if (contributions) {
        for (const contrib of contributions) {
            switch (contrib.kind) {
                case 'action':
                    const pkg = utils.getPackage(manifest, contrib.pkgName, true);
                    if (!pkg.actions)
                        pkg.actions = {};

                    if (pkg.actions[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides ${contrib.name}`;
                    }

                    pkg.actions[contrib.name] = contrib.body;
                    await checkAction(config, manifest, contrib.pkgName, pkg.actions, contrib.name, contrib.body);
                    break;
                case 'api':
                    if (!manifest.apis)
                        manifest.apis = {};
                    const apis = manifest.apis;

                    if (apis[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides ${contrib.name}`;
                    }

                    apis[contrib.name] = contrib.body;
                    await checkApi(config, manifest, apis, contrib.name, contrib.body);
                    break;
                case 'package':
                    if (!manifest.packages)
                        manifest.packages = {};
                    const pkgs = manifest.packages;

                    if (pkgs[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides ${contrib.name}`;
                    }

                    pkgs[contrib.name] = contrib.body;
                    await checkPackage(config, manifest, pkgs, contrib.name, contrib.body);
                    break;

            }
        }
    }
}

// --- Project configuration merge

function mergeProject(config: types.Config, basePath: string, project: types.Project) {
    try {
        if (project.basePath)
            basePath = path.resolve(basePath, project.basePath);

        config.logger.debug(`included project basePath ${basePath}`);

        const targetProject = config.manifest;

        // -- includes

        if (project.includes) {
            throw 'Nested inclusion not supported yet';
        }

        // -- actions in default packages

        if (project.actions) {
            mergeActions(basePath, '', targetProject, project.actions, true);
        }

        // -- packages

        if (project.packages) {
            if (!targetProject.hasOwnProperty('packages'))
                targetProject.packages = {};

            for (const pkgName in project.packages) {
                // TODO: could support merging packages
                if (targetProject.packages.hasOwnProperty(pkgName))
                    throw `A conflict occurred while attempting to include the package ${pkgName} from ${basePath}`;

                const pkg = project.packages[pkgName];

                if (pkg.actions)
                    mergeActions(basePath, pkgName, pkg, pkg.actions, false)

                targetProject.packages[pkgName] = pkg;
            }
        }

        // -- triggers

        if (project.triggers) {
            if (!targetProject.hasOwnProperty('triggers'))
                targetProject.triggers = {};

            for (const triggerName in project.triggers) {
                if (targetProject.triggers.hasOwnProperty(triggerName))
                    throw `A conflict occurred while attempting to include the trigger ${triggerName} from ${basePath}`;
                targetProject.triggers[triggerName] = project.triggers[triggerName];
            }
        }

        // -- rules

        if (project.rules) {
            if (!targetProject.hasOwnProperty('rules'))
                targetProject.rules = {};

            for (const ruleName in project.rules) {
                if (targetProject.rules.hasOwnProperty(ruleName))
                    throw `A conflict occurred while attempting to include the rule ${ruleName} from ${basePath}`;
                targetProject.rules[ruleName] = project.rules[ruleName];
            }
        }

        // -- apis

        if (project.apis) {
            if (!targetProject.hasOwnProperty('apis'))
                targetProject.apis = {};

            for (const apiname in project.apis) {
                if (targetProject.apis.hasOwnProperty(apiname))
                    throw `A conflict occurred while attempting to include the api ${apiname} from ${basePath}`;

                targetProject.apis[apiname] = project.apis[apiname];
            }
        }
    } catch (e) {
        console.log(e);
        throw e
    }
}

function mergeActions(basePath: string, pkgName: string, pkg: types.Package, actions: types.Action[], checkConflict: boolean) {
    if (!pkg.hasOwnProperty('actions'))
        pkg.actions = {};

    for (const actionName in actions) {
        if (checkConflict && pkg.actions.hasOwnProperty(actionName))
            throw `A conflict occurred while attempting to include the action ${actionName} from ${basePath}`;

        const action = actions[actionName];
        if (action.hasOwnProperty('location'))
            action.location = resolveActionLocation(basePath, '', actionName, action.location);

        pkg.actions[actionName] = action;
    }
}


// Mockup OpenWhisk client.
const fakeow = {
    actions: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    feeds: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    namepaces: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    packages: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    rules: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    routes: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    triggers: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    }
}


async function gitClone(config: types.Config, include) {
    const location = include.location.substr(4);

    const gitIdx = location.indexOf('.git');
    if (gitIdx === -1)
        throw `Malformed git repository ${location} (missing .git)`;

    let localDir;
    let repo = location.substring(0, gitIdx + 4);
    if (repo.startsWith('ssh://')) {
        repo = repo.substr(6);
        // must be of the form git@<hostname>:<user>/<repository>.git

        const matched = repo.match(/^git@([^:]+):([^\/]+)\/(.+)\.git$/);
        if (!matched)
            throw `Malformed git repository ${repo}`;
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

function resolveActionLocation(basePath: string, pkgName: string, actionName: string, location: string) {
    if (path.isAbsolute(location))
        return location;

    if (!location) {
        location = pkgName ? path.join('packages', pkgName) : '';
        location = path.join(location, 'actions', actionName);
    }
    location = path.resolve(basePath, location);
    console.log(location)
    if (fs.statSync(location).isDirectory()) {
        if (fs.existsSync(path.join(location, 'Dockerfile')))
            location = path.join(location, 'Dockerfile');
        else if (fs.existsSync(path.join(location, 'package.json')))
            location = path.join(location, 'package.json');
        else if (fs.existsSync(path.join(location, `${actionName}.js`)))
            location = path.join(location, `${actionName}.js`);
    }

    if (!fs.existsSync(location))
        throw `Action location does not exist ${location}`;


    return location;
}