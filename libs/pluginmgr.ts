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

// Simple plugins manager
import * as fs from 'fs-extra';
import * as path from 'path';
import * as utils from './utils';
import { IConfig, IPlugin, IProject, IContribution } from './types';
//import * as scheduler from './scheduler';

const PLUGINS_ROOT = path.join(__dirname, '../../plugins/core');
const EXT_PLUGINS_ROOT = path.join(__dirname, '../../plugins/node_modules');

const actionPlugins = {};
const pkgPlugins = {};
const servicePlugins = {};
const apiPlugins = {};
const actionBuilderPlugins = {};
const variableSourcePlugins = {};

const RESERVED_ACTION_KEYWORDS = ['location', 'code', 'limits', 'inputs', 'kind', 'annotations', 'sequence', 'extra', 'actionName', 'packageName', 'docker'];
const RESERVED_API_KEYWORDS = [];

let loaded = false;

// Build plugin index.
export async function init(config: IConfig) {
    if (!loaded) {
        config.logger.info(`initializing plugins ${PLUGINS_ROOT} and ${EXT_PLUGINS_ROOT}`);
        await registerAll(config);
        loaded = true;
    }
}

// Register plugin at given location
export async function registerFromPath(config: IConfig, modulepath: string) {
    const pkgjson = path.join(modulepath, 'package.json');
    if (!(await fs.pathExists(pkgjson)))
        return;

    const plugininfo = await fs.readJSON(path.join(modulepath, 'package.json'));

    const contributions = plugininfo.wskp;
    if (!contributions) {
        config.logger.warn(`Plugin ${plugininfo.name} does not have any contributions`);
        return;
    }

    const action = contributions.action;
    if (action) {
        if (!RESERVED_ACTION_KEYWORDS.includes(action)) {
            config.logger.info(`registering plugin ${plugininfo.name} action contribution ${action}`);
            actionPlugins[action] = modulepath;
        } else
            config.logger.warn(`Skipping ${action}: it is a reserved action name`);
    }

    const pkg = contributions.package;
    if (pkg) {
        const pkgs = (typeof pkg === 'string') ? [pkg] : pkg;
        for (const name of pkgs) {
            config.logger.info(`registering plugin ${plugininfo.name} package contribution ${name}`);
            pkgPlugins[name] = modulepath;
        }
    }

    const service = contributions.service;
    if (service) {
        const names = (typeof pkg === 'string') ? [service] : service;
        for (const name of names) {
            config.logger.info(`registering plugin ${plugininfo.name} service contribution ${name}`);
            servicePlugins[name] = modulepath;
        }
    }

    const api = contributions.api;
    if (api) {
        if (!RESERVED_API_KEYWORDS.includes(action)) {
            config.logger.info(`registering plugin ${plugininfo.name} api contribution ${api}`);
            apiPlugins[api] = modulepath;
        } else
            config.logger.warn(`Skipping ${api}: it is a reserved api name`);
    }

    const builder = contributions.builder;
    if (builder) {
        config.logger.info(`registering plugin ${plugininfo.name} builder contribution ${builder}`);
        actionBuilderPlugins[builder] = modulepath;
    }

    const variableSource = contributions.variableSource;
    if (variableSource) {
        config.logger.info(`registering plugin ${plugininfo.name} variable source contribution ${variableSource}`);
        variableSourcePlugins[variableSource] = modulepath;
    }
}

async function registerAll(config: IConfig) {
    try {
        await registerFiles(config, PLUGINS_ROOT);
        if (await fs.pathExists(EXT_PLUGINS_ROOT))
            await registerFiles(config, EXT_PLUGINS_ROOT);
    } catch (e) {
        config.logger.error(JSON.stringify(e, null, 2));
    }
}

async function registerFiles(config: IConfig, root: string) {
    const files = await fs.readdir(root);
    for (const moduleid of files) {
        if (moduleid.match(/wskp-\w*-plugin/)) {
            const modulepath = path.join(root, moduleid);

            await registerFromPath(config, modulepath);
        }
    }
}

export function getActionPlugin(action, name?: string): IPlugin | null {
    return getPlugin(actionPlugins, action, name);
}

export function getPackagePlugin(pkg): IPlugin | null {
    return getPlugin(pkgPlugins, pkg);
}

export function getServicePlugin(name): IPlugin | null {
    if (servicePlugins[name]) {
        const plugin = require(servicePlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

export function getApiPlugin(api): IPlugin | null {
    return getPlugin(apiPlugins, api);
}

export function getActionBuilderPlugin(name): IPlugin | null {
    if (actionBuilderPlugins[name]) {
        const plugin = require(actionBuilderPlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

export function getVariableSourcePlugin(name): IPlugin | null {
    if (variableSourcePlugins[name]) {
        const plugin = require(variableSourcePlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

function getPlugin(index, obj, name?): IPlugin | null {
    if (name) {
        if (index[name]) {
            const plugin = require(index[name]);
            if (plugin)
                plugin.__pluginName = name;
            return plugin;
        }
    } else {
        for (const n in index) {
            if (obj.hasOwnProperty(n)) {
                const plugin = require(index[n]);
                plugin.__pluginName = n;
                return plugin;
            }
        }
    }
    return null;
}

// --- Plugin contributions using task scheduler

// export function scheduleContributions(config: IConfig, project: IProject, contributions: IContribution[], plugin: IPlugin) {
//     if (!contributions)
//         return;

//     for (const contrib of contributions) {
//         switch (contrib.kind) {
//             case 'action':
//                 const pkg = utils.getPackage(project, contrib.pkgName, true);
//                 if (!pkg.actions)
//                     pkg.actions = {};

//                 if (pkg.actions[contrib.name]) {
//                     config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.name}`);
//                 }

//                 pkg.actions[contrib.name] = contrib.body;
//                 await checkAction(config, project, contrib.pkgName, pkg.actions, contrib.name, contrib.body);
//                 break;
//             case 'api':
//                 if (!project.apis)
//                     project.apis = {};
//                 const apis = project.apis;

//                 if (apis[contrib.name]) {
//                     config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.name}`);
//                 }

//                 apis[contrib.name] = contrib.body;
//                 await checkApi(config, project, apis, contrib.name, contrib.body);
//                 break;
//             case 'package':
//                 if (!project.packages)
//                     project.packages = {};
//                 const pkgs = project.packages;

//                 if (pkgs[contrib.name]) {
//                     config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.name}`);
//                 }

//                 pkgs[contrib.name] = contrib.body;
//                 await checkPackage(config, project, pkgs, contrib.name, contrib.body, true);
//                 await checkPackage(config, project, pkgs, contrib.name, contrib.body, false);
//                 break;
//         }
//     }

// }

